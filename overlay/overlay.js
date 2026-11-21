/* Overlay UI — runs questions while the game loads behind us.
 *
 * Lifecycle:
 *   - Receives state events from the launcher: 'loading' | 'ready' | 'manual'
 *   - In 'loading': pull questions, ask them one at a time, record answers.
 *   - When 'ready' arrives: show "Game ready! Finish this one." banner. After
 *     the next answer (correct or not), fade out and call arcadeOverlay.finished()
 *     so the launcher destroys this view.
 *   - When 'manual' arrives: show a manual "I'm ready to play" button so the
 *     user is never trapped if isReady never returns true.
 */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var gameKey = params.get('game') || 'unknown';
  var mode = params.get('mode') || 'english';
  var breakMode = params.get('break') === '1';
  // Player param doubles as the device_local_key the parent-admin app
  // joins on. Threaded into getQuestions so the override-client check
  // in main.ts has something to look up.
  var deviceLocalKey = params.get('player') || 'parker';

  var startTime = Date.now();
  var elapsedTimer = null;
  var ready = false;          // launcher signaled isReady
  var manualMode = false;     // launcher gave up on auto-detection
  var pool = [];
  var currentQ = null;
  var answeredCount = 0;
  var fadingOut = false;
  var readLockTimer = null;   // 15-second answer lockout per question

  // 2026-05-09 weekend rules (Mudaber):
  //   - Parker can't tap any choice button during the first 10 seconds
  //     of a fresh question. Forces him to read the stem. The literal
  //     countdown was removed — the timer ticks silently in the
  //     background so the seconds don't distract him from reading.
  //   - He can't return to the game (break-mode resume OR loading-overlay
  //     fade-out) unless the answer is correct. Wrong answers serve another
  //     question (the existing weak_queue cycles the failed one back).
  var READ_LOCK_MS = 10000;

  // Minimum overlay duration: even if the game finishes loading instantly
  // (cached assets, fast network), the kid must answer at least
  // MIN_QUESTIONS questions AND remain in the overlay for at least
  // MIN_ELAPSED_MS before they're allowed to enter the game. This
  // protects the practice loop — without it, "ready" can fire after a
  // single question on a hot cache, making the practice feel optional.
  // Break-mode (one-question check-ins between games) is exempt.
  //
  // QUICK TEST mode: when the lobby/overlay is loaded with ?quicktest=1,
  // the gates open immediately so Mudaber can curate games without
  // answering questions for every test. URL param is set by the launcher
  // when the ARCADE_QUICK_LAUNCH env var is on.
  var QUICK_TEST = (function () {
    try { return new URLSearchParams(location.search).get('quicktest') === '1'; }
    catch (e) { return false; }
  })();
  var MIN_QUESTIONS = QUICK_TEST ? 0 : 3;
  var MIN_ELAPSED_MS = QUICK_TEST ? 0 : 60 * 1000;
  function gatingMet() {
    if (QUICK_TEST) return true;
    return (
      answeredCount >= MIN_QUESTIONS &&
      Date.now() - startTime >= MIN_ELAPSED_MS
    );
  }

  // ── Elements ────────────────────────────────────────────────
  var $statusText = document.getElementById('status-text');
  var $statusElapsed = document.getElementById('status-elapsed');
  var $statusPulse = document.getElementById('status-pulse');
  var $readyBanner = document.getElementById('ready-banner');
  var $manualBanner = document.getElementById('manual-banner');
  var $manualGo = document.getElementById('manual-go');
  var $exitBtn = document.getElementById('exit-btn');
  var $qLoading = document.getElementById('question-loading');
  var $qContent = document.getElementById('question-content');
  var $qTopic = document.getElementById('q-topic');
  var $qStem = document.getElementById('q-stem');
  var $qChoices = document.getElementById('q-choices');
  var $qFeedback = document.getElementById('q-feedback');
  var $qReadlock = document.getElementById('q-readlock');
  var $qReadlockSecs = document.getElementById('q-readlock-secs');
  var $answeredPill = document.getElementById('answered-pill');
  var $root = document.getElementById('overlay-root');

  // ── Elapsed-time ticker ─────────────────────────────────────
  function startElapsedTicker() {
    elapsedTimer = setInterval(function () {
      var s = Math.floor((Date.now() - startTime) / 1000);
      $statusElapsed.textContent = s + 's';
    }, 500);
  }

  // ── Question rendering ──────────────────────────────────────
  function loadPool() {
    // 2026-05-09: 'mixed' mode bypasses Electron's IPC (which only knows
    // english/maths) and fetches the merged pool directly from the hub.
    // Hub-only iteration path — adding/changing question logic doesn't
    // require an .app rebuild.
    var p;
    if (mode === 'mixed') {
      p = fetch('/api/questions/mixed').then(function (r) { return r.json(); });
    } else if (window.arcadeOverlay && window.arcadeOverlay.getQuestions) {
      p = window.arcadeOverlay.getQuestions(mode, deviceLocalKey);
    } else {
      p = Promise.resolve({ questions: [] });
    }
    return p.catch(function () { return { questions: [] }; })
      .then(function (data) { pool = (data && data.questions) || []; });
  }

  function renderQuestion() {
    if (!pool.length) {
      $qLoading.textContent = 'No questions available for this mode.';
      return;
    }
    currentQ = window.SharedProgress.pickQuestion(pool, gameKey);
    if (!currentQ) {
      $qLoading.textContent = '🎉 All questions mastered! Just hang on while the game loads.';
      $qContent.classList.add('hidden');
      $qLoading.classList.remove('hidden');
      return;
    }
    $qLoading.classList.add('hidden');
    $qContent.classList.remove('hidden');
    $qTopic.textContent = currentQ.topicLabel || currentQ.topic || 'Question';
    $qStem.textContent = currentQ.stem || '';
    var $qDiagram = document.getElementById('q-diagram');
    if (currentQ.diagram_dataUri) {
      $qDiagram.src = currentQ.diagram_dataUri;
      $qDiagram.classList.remove('hidden');
    } else {
      $qDiagram.removeAttribute('src');
      $qDiagram.classList.add('hidden');
    }
    $qChoices.innerHTML = '';
    $qFeedback.classList.add('hidden');
    $qFeedback.className = 'feedback hidden';

    var letters = Object.keys(currentQ.choices || {});
    letters.forEach(function (letter) {
      var btn = document.createElement('button');
      btn.className = 'choice-btn locked';
      btn.disabled = true;
      btn.dataset.letter = letter;
      btn.innerHTML =
        '<span class="choice-letter">' + letter + '</span>' +
        '<span class="choice-text"></span>';
      btn.querySelector('.choice-text').textContent = currentQ.choices[letter];
      btn.addEventListener('click', function () { onAnswer(letter); });
      $qChoices.appendChild(btn);
    });
    startReadLock();
    if (window.arcadeLog && window.ARCADE_EVENT_TYPES) {
      window._arcadeQuestionShownAt = Date.now();
      window.arcadeLog.event(window.ARCADE_EVENT_TYPES.OVERLAY_QUESTION_SHOWN, {
        topic: currentQ.topic || null,
        difficulty: currentQ.difficulty || null,
        is_weak: !!currentQ._isWeak,
        is_break: breakMode,
      }, { game_key: gameKey, question_id: currentQ.id });
    }
  }

  function startReadLock() {
    clearReadLock();
    if (!$qReadlock) return;
    if (QUICK_TEST) {
      // Skip the lock so curation iteration stays fast.
      $qReadlock.classList.add('hidden');
      var btns0 = $qChoices.querySelectorAll('.choice-btn');
      btns0.forEach(function (b) { b.disabled = false; b.classList.remove('locked'); });
      return;
    }
    $qReadlock.classList.remove('hidden');
    readLockTimer = setTimeout(function () {
      readLockTimer = null;
      $qReadlock.classList.add('hidden');
      var btns = $qChoices.querySelectorAll('.choice-btn');
      btns.forEach(function (b) {
        b.disabled = false;
        b.classList.remove('locked');
      });
    }, READ_LOCK_MS);
  }

  function clearReadLock() {
    if (readLockTimer) {
      clearInterval(readLockTimer);
      readLockTimer = null;
    }
  }

  function onAnswer(letter) {
    if (!currentQ) return;
    // Defensive — buttons are :disabled during the read-lock so this
    // shouldn't fire, but guard against synthetic events.
    if (readLockTimer) return;
    clearReadLock();
    if ($qReadlock) $qReadlock.classList.add('hidden');
    var correct = letter === currentQ.correct;
    if (window.arcadeLog && window.ARCADE_EVENT_TYPES) {
      var elapsed = window._arcadeQuestionShownAt ? Date.now() - window._arcadeQuestionShownAt : null;
      window.arcadeLog.event(window.ARCADE_EVENT_TYPES.OVERLAY_ANSWER_SUBMITTED, {
        chosen: letter,
        correct: correct,
        correct_answer: currentQ.correct,
        time_ms: elapsed,
        topic: currentQ.topic || null,
        is_weak: !!currentQ._isWeak,
        is_break: breakMode,
      }, { game_key: gameKey, question_id: currentQ.id, severity: 'audit' });
    }
    var buttons = $qChoices.querySelectorAll('.choice-btn');
    buttons.forEach(function (btn) {
      btn.disabled = true;
      if (btn.dataset.letter === currentQ.correct) btn.classList.add('correct');
      else if (btn.dataset.letter === letter) btn.classList.add('wrong');
    });

    $qFeedback.classList.remove('hidden');
    if (correct) {
      $qFeedback.className = 'feedback correct';
      $qFeedback.textContent = '✓ Correct!';
    } else {
      $qFeedback.className = 'feedback wrong';
      $qFeedback.textContent = '✗ Correct answer: ' + currentQ.correct +
        (currentQ.explanation ? ' — ' + currentQ.explanation : '');
    }

    answeredCount++;
    $answeredPill.textContent = answeredCount + ' answered';

    var qid = currentQ.id;
    var isWeak = !!currentQ._isWeak;
    window.SharedProgress.recordAnswer(qid, gameKey, correct, isWeak);

    // 2026-05-09 weekend rule (Mudaber): Parker can only return to the
    // game on a CORRECT answer. Wrong answers always serve another
    // question — the weak_queue cycles the failed question back within
    // the next 10-15 picks for re-test, exactly per the system rule.
    //
    // Break mode: was "1 question, return regardless". Now "must be
    // correct to return". Loading mode: was "after gates met, the next
    // answer (right or wrong) finishes". Now "must be correct".
    var delay = correct ? 900 : 2200;
    setTimeout(function () {
      if (fadingOut) return;
      if (breakMode) {
        if (correct) {
          fadeOutAndResume();
        } else {
          renderQuestion(); // try again — must answer correctly to leave
        }
      } else if (ready && gatingMet() && correct) {
        fadeOutAndFinish();
      } else {
        // Either the game isn't ready yet, gating not met, OR he answered
        // wrong. Either way, serve another question. Update the status
        // banner so the kid can see why we're holding.
        renderQuestion();
        updateStatusForGate();
      }
    }, delay);
  }

  // Reflect the current gating state in the status header. While the
  // floor isn't met, the kid sees "X of 3 answered" so the wait feels
  // intentional, not buggy.
  function updateStatusForGate() {
    if (breakMode) return;
    if (!$statusText) return;
    if (gatingMet() && ready) {
      // Gates satisfied + game ready — fadeOutAndFinish will run on
      // next answer. The banner already says "Game ready".
      return;
    }
    if (answeredCount < MIN_QUESTIONS) {
      $statusText.textContent =
        'Quick warm-up: ' + answeredCount + ' of ' + MIN_QUESTIONS + ' answered';
    } else if (Date.now() - startTime < MIN_ELAPSED_MS) {
      var secsLeft = Math.max(
        1,
        Math.ceil((MIN_ELAPSED_MS - (Date.now() - startTime)) / 1000),
      );
      $statusText.textContent = 'A few more seconds while the game finishes…';
      // Don't expose the literal countdown — feels like a punishment
      // bar. The elapsed-time pill (if visible) already shows seconds.
      void secsLeft;
    } else if (ready) {
      $statusText.textContent = 'Game ready';
    }
  }

  function fadeOutAndResume() {
    if (fadingOut) return;
    fadingOut = true;
    $root.classList.add('fading');
    if (window.arcadeLog && window.ARCADE_EVENT_TYPES) {
      window.arcadeLog.event(window.ARCADE_EVENT_TYPES.OVERLAY_BREAK_DONE, {}, { game_key: gameKey });
    }
    setTimeout(function () {
      if (window.arcadeOverlay && window.arcadeOverlay.breakDone) {
        window.arcadeOverlay.breakDone();
      }
    }, 450);
  }

  // ── State transitions ──────────────────────────────────────
  function setReady() {
    if (ready) return;
    ready = true;
    // Status pulse can flip immediately — that's an internal signal
    // (game has loaded). The visible "Game ready! Finish this one and
    // you're in." banner is held back until the practice-floor gates
    // are satisfied. Otherwise the kid sees "ready" before they've
    // earned 3 questions of practice and learns to expect a fast bail.
    $statusPulse.classList.add('ready');
    $manualBanner.classList.add('hidden');
    if (gatingMet() || breakMode) {
      $statusText.textContent = 'Game ready';
      $readyBanner.classList.remove('hidden');
      // QUICK_TEST: when Mudaber is curating games, the moment ready fires
      // (blinking dot turns green) jump straight into the game — no banner
      // click, no answer required. Without this, the overlay sits forever
      // because nothing else triggers fadeOut in zero-question mode.
      if (QUICK_TEST && !fadingOut) {
        fadeOutAndFinish();
      }
    } else {
      // Poll until gating is met, then surface the banner. ~750ms
      // cadence is invisible to the user; lighter than re-checking
      // every animation frame.
      var poll = setInterval(function () {
        if (fadingOut || breakMode) {
          clearInterval(poll);
          return;
        }
        if (gatingMet()) {
          clearInterval(poll);
          $statusText.textContent = 'Game ready';
          $readyBanner.classList.remove('hidden');
        } else {
          updateStatusForGate();
        }
      }, 750);
    }
  }

  function setManualMode() {
    if (manualMode || ready) return;
    manualMode = true;
    $manualBanner.classList.remove('hidden');
  }

  function fadeOutAndFinish() {
    if (fadingOut) return;
    fadingOut = true;
    $root.classList.add('fading');
    if (window.arcadeLog && window.ARCADE_EVENT_TYPES) {
      window.arcadeLog.event(window.ARCADE_EVENT_TYPES.OVERLAY_FINISHED, {
        answered_count: answeredCount,
      }, { game_key: gameKey });
    }
    setTimeout(function () {
      if (window.arcadeOverlay && window.arcadeOverlay.finished) {
        window.arcadeOverlay.finished();
      }
    }, 650);
  }

  // ── Wire up ────────────────────────────────────────────────
  $exitBtn.addEventListener('click', function () {
    if (window.arcadeLog && window.ARCADE_EVENT_TYPES) {
      window.arcadeLog.event(window.ARCADE_EVENT_TYPES.BACK_BUTTON_CLICK,
        { from: 'overlay' }, { game_key: gameKey });
    }
    if (window.arcadeOverlay) window.arcadeOverlay.requestExit();
  });

  $manualGo.addEventListener('click', function () {
    if (window.arcadeLog && window.ARCADE_EVENT_TYPES) {
      window.arcadeLog.event(window.ARCADE_EVENT_TYPES.OVERLAY_MANUAL_GO,
        { answered_count: answeredCount }, { game_key: gameKey });
    }
    setReady();
    fadeOutAndFinish();
  });

  if (window.arcadeOverlay && window.arcadeOverlay.onState) {
    window.arcadeOverlay.onState(function (state) {
      if (state === 'ready') setReady();
      else if (state === 'manual') setManualMode();
    });
  }

  // Reliability foundation 2026-04-28: when mom changes a focus / approves
  // a mini-course / clears a gate, refresh the pool quietly. The current
  // question stays on screen — only the *next* renderQuestion() picks
  // from the new pool, so Parker is never yanked mid-question.
  if (window.arcadeOverlay && window.arcadeOverlay.onOverrideChanged) {
    window.arcadeOverlay.onOverrideChanged(function () {
      loadPool().catch(function () {});
    });
  }

  // ── Break-mode chrome adjustments ──────────────────────────
  if (breakMode) {
    $statusText.textContent = 'Quick break! Answer correctly to keep playing.';
    if ($statusPulse) $statusPulse.style.display = 'none';
    if ($statusElapsed) $statusElapsed.style.display = 'none';
    if ($readyBanner) $readyBanner.classList.add('hidden');
    if ($manualBanner) $manualBanner.classList.add('hidden');
    if ($answeredPill) $answeredPill.style.display = 'none';
  }

  // ── Boot ───────────────────────────────────────────────────
  if (!breakMode) startElapsedTicker();
  Promise.all([
    window.SharedProgress.init(),
    loadPool(),
  ]).then(function () {
    renderQuestion();
  }).catch(function (err) {
    console.warn('[overlay] init failed', err);
    $qLoading.textContent = 'Could not load questions. Press Esc twice to exit.';
  });
})();

/* Fuel stop: ignition + pit stop (redesign 2026-11-22). Replaces /overlay/ when the manifest
 * points ui.overlay here.
 *   break=1  -> pit stop: the game paused because about a minute of play went by.
 *   else     -> ignition: a game is starting.
 * Play costs fuel and fuel comes only from typed answers (fast fact +20 s, slow +10 s, school item +30/40 s, wrong 0).
 * Either way he types until the tank holds the next minute (the tank holds no more); if it already does, the
 * stop is a one-second "tank ok" and the game carries on. Nothing opens with time; Enter is
 * required; a miss shows the fact and its pattern, he types it once, and it earns nothing.
 * The "start game" button only appears after the tank is full (and only if the shell says
 * the game is stuck).
 */
(function () {
  'use strict';
  var E = window.FactEngine;
  var qs = new URLSearchParams(location.search);
  var gameKey = qs.get('game') || 'unknown';
  var player = qs.get('player') || 'parker';
  var isBreak = qs.get('break') === '1';
  var surface = isBreak ? 'pit' : 'ignition';
  var ov = window.arcadeOverlay || null;
  var NEED = E.FUEL.CHUNK;

  var $ = function (id) { return document.getElementById(id); };
  var $card = $('card'), $fact = $('fact'), $ans = $('ans'), $hint = $('hint'), $sub = $('sub'),
      $label = $('label'), $go = $('go'), $root = $('root');

  var startFuel = E.fuelDrain();      // burn the play since the last stop
  var typed = 0, right = 0;
  var cur = null, shownAt = 0, firstKeyAt = null, backspace = false;
  var copyMode = false;      // after a miss: type the shown answer to continue
  var inputMode = 'num', copiesLeft = 0, guide = null;
  // Gretchen (2026-11-22): 5 quick math facts right before he continues, every stop and every game start.
  var FACTS_REQ = 5, factsRight = 0, schoolCount = 0, stopStart = Date.now(), fiveAt = null, clockT = null;
  function done() { return E.fuelMs() >= NEED && factsRight >= FACTS_REQ; }
  function clock() {
    if (loadingPractice || leaving) return;
    var secs = Math.floor((Date.now() - stopStart) / 1000);
    $('factline').innerHTML = '🔢 Facts <b>' + Math.min(factsRight, FACTS_REQ) + ' / ' + FACTS_REQ + '</b>' + (fiveAt ? ' · done in ' + Math.round((fiveAt - stopStart) / 1000) + ' s' : ' · ' + secs + ' s');
  }
  var busy = false, finishedFacts = false, gameReady = false, gameStuck = false, leaving = false;

  function log(type, payload) {
    if (window.arcadeLog) window.arcadeLog.event(type, payload || {}, { game_key: gameKey });
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function gauge(earned) {
    var ms = E.fuelMs();
    $('tankfill').style.width = Math.min(100, 100 * ms / NEED) + '%';
    $('tankms').textContent = E.fmtFuel(ms);
    $('tankneed').textContent = E.fmtFuel(NEED);
    $('earn').textContent = earned > 0 ? '+' + Math.round(earned / 1000) + ' s' : earned < 0 ? Math.round(earned / 1000) + ' s' : (loadingPractice ? 'full power' : '');
    $('rates').textContent = 'fast ⚡+' + E.FUEL.FAST / 1000 + ' · slow +' + E.FUEL.SLOW / 1000;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function setMode(mode) {
    inputMode = mode;
    $ans.setAttribute('inputmode', mode === 'text' ? 'text' : 'decimal');
    $ans.maxLength = mode === 'num' && cur && !cur.school ? 4 : 24;
    $ans.style.width = mode === 'num' && cur && !cur.school ? '220px' : '360px';
  }

  // One school item opens a stop when it comes up (what class is on, spelling, sentences);
  // facts stay the main diet until they are fluent (Gretchen's first priority).
  // Each card is a school item with probability pSchool (rises as facts get fluent); while the game is
  // loading after he is charged, mostly school items: the wait is learning time, and it earns nothing.
  var schoolFirst = qs.get('school') === '1'; // testing
  var LC = window.__LEARN || {};
  var pSchool = window.School ? Math.min(0.85, (LC.bossShare || 0.25) + 0.6 * E.counts().fluent / E.FACTS.length) : 0;
  var BOSS_MAX = LC.bossPerStop || 1;
  var loadingPractice = false;

  function next() {
    guide = null; copyMode = false; copiesLeft = 0; firstKeyAt = null; backspace = false; busy = false;
    $card.className = 'card';
    $ans.value = '';
    $hint.className = 'hint';
    if (window.School && (schoolFirst || (loadingPractice ? Math.random() < 0.8 : (schoolCount < BOSS_MAX && Math.random() < pSchool)))) {
      if (!loadingPractice) schoolCount++;
      schoolFirst = false;
      cur = window.School.next(); cur.school = true;
      $fact.className = 'fact' + (cur.long || cur.q.length > 22 ? ' long' : cur.q.length > 12 ? ' mid' : '');
      $fact.innerHTML = esc(cur.q) + (cur.long || cur.mode === 'text' ? '' : ' <span class="eq">=</span>') + (cur.sub ? '<div class="ask">' + esc(cur.sub) + '</div>' : '');
      $hint.textContent = (cur.hint ? cur.hint + ' · ' : '') + (loadingPractice ? '⚔️ Bonus boss while it loads' : '⚔️ Boss · win +' + cur.value + ' s' + (cur.penalty ? ' · lose -' + cur.penalty + ' s' : '')) + ' · Enter';
      setMode(cur.mode);
    } else {
      cur = E.pick(); cur.school = false;
      $fact.className = 'fact';
      $fact.innerHTML = cur.q + ' <span class="eq">=</span>';
      $hint.textContent = 'Type it + Enter';
      setMode('num');
    }
    shownAt = performance.now();
    window.__pitCur = cur; // read by the automated tests only
    hootReset();
    $ans.focus();
  }


  // ── Ask Hoot: when he is confused on a boss question. The idea in plain words straight away, then Hoot (AI)
  // explains in kid words and reads it aloud; he can type follow-ups (mic only if learning.js allows it).
  // Hoot never gets the answer, so he cannot give it away.
  var GLOSS = {
    verbals: 'GERUND = a verb + ing used as a THING: "Reading is fun." PARTICIPLE = a verb form that DESCRIBES something: "the barking dog", "the broken vase". INFINITIVE = to + verb: "I want to win."',
    voice: 'ACTIVE: the subject DOES the action ("The dog chased the ball"). PASSIVE: the subject has it done TO it ("The ball was chased by the dog").',
    agreement: 'The verb must match the REAL subject. One thing → is, has, runs. Many → are, have, run. Skip phrases like "of the..." to find the real subject.',
    pronoun: 'I, he, she, we, who DO the action. Me, him, her, us, whom RECEIVE it. Trick: cover the other person and say it alone.',
    fragrun: 'A sentence needs a subject + a verb + a finished thought. FRAGMENT = something is missing. RUN-ON = two sentences jammed together with no period, semicolon, or comma + and/but/so.',
    sentence: 'INDEPENDENT clause = can stand alone. DEPENDENT clause = starts with because, when, although, who, that... and cannot stand alone. Simple = 1 independent. Compound = 2. Complex = 1 + a dependent. Compound-complex = 2 + a dependent.',
    subject: 'The SUBJECT is who or what does the verb. In a command ("Sit down!") it is the hidden "you". "Here" and "there" are never the subject.',
    irregular: 'Some verbs change shape: swim → swam (yesterday) → swum (with has / have / had).',
    spell: 'Break the word into chunks (syllables), say each chunk, and find the ONE tricky part.',
    'dec-mul': 'Multiply as if there were no points. Then count ALL the digits after the points in both numbers and put that many back in the answer.',
    'long-div': 'Divide, multiply, subtract, bring down, repeat. Round the divisor first to guess each digit.',
    'dec-div': 'Make the number you divide BY whole by moving its point. Move the other point the same number of places. Then divide.',
    'zeros-div': 'Cross off the same number of zeros from both numbers first. The answer does not change.',
    'rem-word': 'After dividing, decide what the leftover means: does it need one more (round up), get dropped, or IS it the answer?',
  };
  var hootMsgs = [], $hb = $('hootbox'), $hbsay = $('hbsay');
  function hootReset() { hootMsgs = []; $hb.style.display = 'none'; $('askhoot').style.display = cur && cur.school ? 'inline-block' : 'none'; }
  function hootSpeak(text) {
    if (!ov || !ov.speak) return;
    ov.speak(text).then(function (r) { if (r && r.audio) { try { new Audio('data:audio/mpeg;base64,' + r.audio).play().catch(function () {}); } catch (e) {} } }).catch(function () {});
  }
  function hootAsk(userText) {
    if (!cur) return;
    hootMsgs.push({ role: 'user', content: userText });
    if (!ov || !ov.tutorChat) { $hbsay.textContent = '(Hoot can chat inside the arcade app.)'; return; }
    $hbsay.textContent = '🦉 thinking…';
    var ctx = { stem: cur.q + (cur.sub ? ' (' + cur.sub + ')' : ''), topic: cur.skill, correctText: '', chosenText: '',
      learningObjective: 'Parker is CONFUSED and asked for help, he has not answered yet. Explain the idea and any grammar or maths words in the question in kid words, with ONE example that is NOT this question. Never give or hint the answer to this question. Use SAY only: never ask him to write anything and never mention a camera. No tags.' };
    ov.tutorChat({ context: ctx, messages: hootMsgs }).then(function (t) {
      t = String(t || '').replace(/\[\[[A-Z_]+\]\]/g, '').trim();
      if (!t) { $hbsay.textContent = '🦉 Hoot could not answer just now. Read the idea above.'; return; }
      hootMsgs.push({ role: 'assistant', content: t });
      $hbsay.textContent = '🦉 ' + t; hootSpeak(t);
      log('hoot.ask', { skill: cur.skill, item: cur.q, asked: userText, reply: t });
    });
  }
  $('askhoot').addEventListener('click', function () {
    $hb.style.display = 'block'; $('askhoot').style.display = 'none';
    $('hbgloss').textContent = GLOSS[cur.skill] || '';
    hootAsk('I am confused. Can you explain what this is asking and what the words mean?');
  });
  $('hbsend').addEventListener('click', function () { var v = $('hbq').value.trim(); if (v) { $('hbq').value = ''; hootAsk(v); } $ans.focus(); });
  $('hbq').addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); $('hbsend').click(); } });
  $('hbclose').addEventListener('click', function () { $hb.style.display = 'none'; $('askhoot').style.display = 'inline-block'; $ans.focus(); });
  // Hold-to-talk (only when learning.js says hootMic: true, i.e. after Gretchen's yes on the microphone).
  if ((window.__LEARN || {}).hootMic && ov && ov.transcribe && navigator.mediaDevices) {
    var rec = null, chunks = [], $mic = $('hbmic'); $mic.style.display = 'inline-block';
    $mic.addEventListener('pointerdown', function () {
      (ov.ensureMic ? ov.ensureMic() : Promise.resolve({ ok: true })).then(function () { return navigator.mediaDevices.getUserMedia({ audio: true }); }).then(function (st) {
        chunks = []; rec = new MediaRecorder(st); rec.ondataavailable = function (e) { chunks.push(e.data); };
        rec.onstop = function () { st.getTracks().forEach(function (t) { t.stop(); }); var b = new Blob(chunks, { type: 'audio/webm' }), fr = new FileReader();
          fr.onload = function () { ov.transcribe(String(fr.result).split(',')[1], 'audio/webm').then(function (txt) { if (txt) hootAsk(txt); }); }; fr.readAsDataURL(b); };
        rec.start(); $mic.textContent = '🔴 Listening';
      }).catch(function () {});
    });
    window.addEventListener('pointerup', function () { if (rec && rec.state === 'recording') { rec.stop(); $mic.textContent = '🎤 Hold'; } });
  }

  function submitSchool(raw) {
    var t = performance.now(), correct = window.School.check(cur, raw);
    window.School.record(cur, correct, { typed: raw, totalMs: t - shownAt, surface: surface, gameKey: gameKey });
    if (ov && ov.recordAttempt) {
      ov.recordAttempt({ deviceLocalKey: player, attemptId: uuid(), overrideId: null, questionId: cur.id, correct: correct, gameKey: gameKey }).catch(function () {});
    }
    typed++;
    if (correct) {
      right++;
      gauge(E.fuelGive(cur.value * 1000));
      $card.className = 'card right';
      if (done() && !loadingPractice) setTimeout(factsDone, 300); else setTimeout(next, 300);
      return;
    }
    // A miss earns nothing, and a wrong guess on a choice item costs fuel (guessing is worth zero on average).
    var lost = cur.penalty && !loadingPractice ? E.fuelGive(-cur.penalty * 1000) : 0;
    gauge(lost);
    $card.className = 'card wrong';
    // Make him understand, not copy: he answers each step himself, then the question again from scratch.
    guide = { i: 0, phase: 'step', stepsRight: 0, total: (cur.guide || []).length };
    showGuide();
  }

  function showGuide() {
    busy = false; $ans.value = '';
    $hint.className = 'hint miss';
    if (guide.i < guide.total) {
      var g = cur.guide[guide.i];
      setMode(g.mode || 'num'); guide.phase = 'step';
      $hint.innerHTML = '<div class="gtitle">🔧 Break it down · step ' + (guide.i + 1) + ' of ' + guide.total + '</div>' +
        (guide.i === 0 && GLOSS[cur.skill] ? '<div class="gsub">💡 ' + esc(GLOSS[cur.skill]) + '</div>' : '') + '<div class="gq">' + esc(g.p) + '</div>';
    } else {
      setMode(cur.mode); guide.phase = 'final';
      $hint.innerHTML = '<div class="gtitle">🎯 Your turn</div><div class="gq">' + esc(cur.finalPrompt || 'Answer the question above.') + '</div>' +
        (cur.hint ? '<div class="gsub">' + esc(cur.hint) + '</div>' : '');
    }
    $ans.focus();
  }

  function guideSubmit(raw) {
    var S = window.School;
    if (guide.phase === 'step' || guide.phase === 'stepCopy') {
      var g = cur.guide[guide.i], ok = S.norm(raw, g.mode || 'num') === S.norm(g.a, g.mode || 'num');
      if (ok) { if (guide.phase === 'step') guide.stepsRight++; guide.i++; $card.className = 'card'; return showGuide(); }
      if (guide.phase === 'step') {
        guide.phase = 'stepCopy';
        $hint.innerHTML = '<div class="gtitle">🔧 Step ' + (guide.i + 1) + ' of ' + guide.total + '</div><div class="gq">' + esc(g.p) + '</div>' +
          '<div class="gsub">It is <b>' + esc(g.a) + '</b>.' + (g.why ? ' ' + esc(g.why) : '') + ' Type it to go on.</div>';
      }
      $ans.value = ''; $ans.focus(); return;
    }
    if (guide.phase === 'final') {
      var right = S.check(cur, raw);
      log('learn.guide', { item_id: cur.id, skill: cur.skill, steps: guide.total, steps_right: guide.stepsRight, final_correct: right, typed: raw });
      if (right) {
        guide = null; $card.className = 'card right';
        $hint.className = 'hint'; $hint.innerHTML = '<div class="gtitle">✅ You worked it out. Respawned.</div>';
        busy = true; setTimeout(next, 900); return;
      }
      // Still stuck: now show the whole solution, and he types the answer (spelling: twice).
      guide = null; copiesLeft = cur.copies || 1;
      $hint.innerHTML = '<ol class="steps">' + cur.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
        'Type <b>' + esc(cur.ans) + '</b>' + (copiesLeft > 1 ? ' ' + copiesLeft + ' times' : '') + ' to respawn';
      $ans.value = ''; copyMode = true; $ans.focus();
    }
  }

  function submit() {
    if (busy || !cur) return;
    var raw = $ans.value.trim();
    if (raw === '') return;
    var val = parseInt(raw, 10);
    if (copyMode) {
      var ok = cur.school ? window.School.check(cur, raw) : val === cur.ans;
      if (ok && cur.school && --copiesLeft > 0) { $ans.value = ''; $hint.lastChild.textContent = ' one more time to respawn'; $ans.focus(); return; }
      if (ok) { copyMode = false; busy = true; setTimeout(next, 250); }
      else { $ans.value = ''; $ans.focus(); }
      return;
    }
    if (guide) return guideSubmit(raw);
    if (cur.school) { busy = true; return submitSchool(raw); }
    busy = true;
    var t = performance.now();
    var correct = val === cur.ans;
    var res = E.record(cur.id, correct, {
      firstKeyMs: firstKeyAt == null ? null : firstKeyAt - shownAt,
      totalMs: t - shownAt, backspace: backspace, typed: raw, surface: surface, gameKey: gameKey,
    });
    if (ov && ov.recordAttempt) {
      ov.recordAttempt({ deviceLocalKey: player, attemptId: uuid(), overrideId: null, questionId: cur.id, correct: correct, gameKey: gameKey }).catch(function () {});
    }
    typed++;
    gauge(res.earned);
    if (correct) {
      right++;
      $card.className = 'card right';
      if (!loadingPractice && ++factsRight === FACTS_REQ) fiveAt = Date.now();
      clock();
      if (done() && !loadingPractice) setTimeout(factsDone, 300);
      else setTimeout(next, 300);
    } else {
      // Show the fact and its pattern; he types it once. A miss earns no fuel.
      $card.className = 'card wrong';
      $fact.innerHTML = cur.full.replace('=', '<span class="eq">=</span>');
      $hint.className = 'hint miss';
      $hint.innerHTML = 'Type <b>' + cur.ans + '</b> to respawn' + (E.pattern(cur.id) ? '<div class="pat">' + E.pattern(cur.id) + '</div>' : '');
      $ans.value = '';
      copyMode = true;
      busy = false;
      $ans.focus();
    }
  }

  function factsDone() {
    finishedFacts = true;
    clearInterval(clockT);
    log('pit.done', { surface: surface, typed: typed, right: right, facts_right: factsRight, ms_to_five: fiveAt ? fiveAt - stopStart : null, fuel_start_ms: startFuel, fuel_ms: E.fuelMs() });
    if (isBreak) return leave('break');
    if (gameReady) return leave('ready');
    // Charged but the game is still loading: keep the questions coming (the tank is full, so no fuel).
    loadingPractice = true;
    $label.textContent = '⚡ Full power · bonus round while the game loads';
    $sub.innerHTML = '<span class="loading-dot"></span>Game loading…';
    if (gameStuck) $go.style.display = 'inline-block';
    // If the shell's 'ready' was missed, never strand him: offer Start after 15 s.
    setTimeout(function () { if (!leaving) $go.style.display = 'inline-block'; }, 15000);
    next();
  }

  function leave(why) {
    if (leaving) return;
    leaving = true;
    E.fuelPlay(); // the clock on his fuel starts when the game does
    $root.classList.add('fading');
    // Send the log before the shell closes this view, or the attempts are lost.
    var flushed = (window.arcadeLog && window.arcadeLog.flush) ? window.arcadeLog.flush().catch(function () {}) : Promise.resolve();
    var timeout = new Promise(function (r) { setTimeout(r, 1500); });
    Promise.race([flushed, timeout]).then(function () { return new Promise(function (r) { setTimeout(r, 250); }); }).then(function () {
      if (!ov) { $sub.textContent = '(test page: would return to the game: ' + why + ')'; $root.classList.remove('fading'); return; }
      if (isBreak) { if (ov.breakDone) ov.breakDone(); }
      else if (ov.finished) ov.finished();
    });
  }

  $ans.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
    if (e.key === 'Backspace') { backspace = true; return; }
    if (/^[0-9]$/.test(e.key)) {
      if (firstKeyAt == null && !copyMode) firstKeyAt = performance.now();
      return;
    }
    if (e.key.length === 1) {
      var okKey = inputMode === 'text' ? /^[a-zA-Z' -]$/.test(e.key)
        : inputMode === 'rem' ? /^[0-9rR ,]$/.test(e.key)
        : (cur && cur.school ? /^[0-9.,]$/.test(e.key) : false);
      if (!okKey) e.preventDefault();
    }
  });
  // First-key time also from the input event (some input methods send no digit keydown).
  $ans.addEventListener('input', function () { if (firstKeyAt == null && !copyMode && $ans.value !== '') firstKeyAt = performance.now(); });
  document.addEventListener('mousedown', function (e) { if (e.target !== $go && e.target.id !== 'exit' && !$hb.contains(e.target) && e.target.id !== 'askhoot') setTimeout(function () { $ans.focus(); }, 0); });
  window.addEventListener('focus', function () { if (!leaving) $ans.focus(); });

  $('exit').addEventListener('click', function () {
    log('pit.exit', { surface: surface, typed: typed, fuel_ms: E.fuelMs() });
    if (ov && ov.requestExit) ov.requestExit();
  });
  $go.addEventListener('click', function () { if (finishedFacts) leave('manual'); });

  if (ov && ov.onState) {
    ov.onState(function (state) {
      if (state === 'ready') { gameReady = true; if (finishedFacts && !isBreak) leave('ready'); }
      else if (state === 'manual') { gameStuck = true; if (finishedFacts && !isBreak) $go.style.display = 'inline-block'; }
    });
  }

  log('pit.load', { surface: surface, fuel_ms: startFuel });
  gauge(0);
  $label.textContent = isBreak ? '⚡ Recharge!' : '⚡ Power up to play';
  clock(); clockT = setInterval(clock, 1000);
  next();
})();

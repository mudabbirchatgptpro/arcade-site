/* Fuel stop: ignition + pit stop (redesign 2026-11-22). Replaces /overlay/ when the manifest
 * points ui.overlay here.
 *   break=1  -> pit stop: the game paused because about a minute of play went by.
 *   else     -> ignition: a game is starting.
 * Play costs fuel and fuel comes only from typed facts (fast +30 s, slow +15 s, wrong 0).
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
  var inputMode = 'num', copiesLeft = 0;
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
    $('earn').textContent = earned > 0 ? '+' + Math.round(earned / 1000) + ' s' : earned < 0 ? Math.round(earned / 1000) + ' s' : (loadingPractice ? 'tank full' : '');
    $('rates').textContent = 'fast +' + E.FUEL.FAST / 1000 + ' s · slow +' + E.FUEL.SLOW / 1000 + ' s';
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
  var pSchool = window.School ? Math.min(0.85, 0.25 + 0.6 * E.counts().fluent / 120) : 0;
  var loadingPractice = false;

  function next() {
    copyMode = false; copiesLeft = 0; firstKeyAt = null; backspace = false; busy = false;
    $card.className = 'card';
    $ans.value = '';
    $hint.className = 'hint';
    if (window.School && (schoolFirst || Math.random() < (loadingPractice ? 0.8 : pSchool))) {
      schoolFirst = false;
      cur = window.School.next(); cur.school = true;
      $fact.className = 'fact' + (cur.long || cur.q.length > 22 ? ' long' : cur.q.length > 12 ? ' mid' : '');
      $fact.innerHTML = esc(cur.q) + (cur.long || cur.mode === 'text' ? '' : ' <span class="eq">=</span>') + (cur.sub ? '<div class="ask">' + esc(cur.sub) + '</div>' : '');
      $hint.textContent = (cur.hint ? cur.hint + ' · ' : '') + (loadingPractice ? 'Practice while it loads' : 'Worth +' + cur.value + ' s' + (cur.penalty ? ' · a wrong guess costs ' + cur.penalty + ' s' : '')) + ' · Enter';
      setMode(cur.mode);
    } else {
      cur = E.pick(); cur.school = false;
      $fact.className = 'fact';
      $fact.innerHTML = cur.q + ' <span class="eq">=</span>';
      $hint.textContent = 'Type it, then Enter';
      setMode('num');
    }
    shownAt = performance.now();
    $ans.focus();
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
      if (E.fuelMs() >= NEED && !loadingPractice) setTimeout(factsDone, 300); else setTimeout(next, 300);
      return;
    }
    // Break it down: every step, then he types the answer (spelling: twice). A miss earns nothing,
    // and a wrong guess on a choice item costs fuel (guessing is worth zero on average).
    var lost = cur.penalty && !loadingPractice ? E.fuelGive(-cur.penalty * 1000) : 0;
    gauge(lost);
    $card.className = 'card wrong';
    $hint.className = 'hint miss';
    copiesLeft = cur.copies || 1;
    $hint.innerHTML = '<ol class="steps">' + cur.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      'Type <b>' + esc(cur.ans) + '</b>' + (copiesLeft > 1 ? ' ' + copiesLeft + ' times' : '') + ' to keep going';
    $ans.value = ''; copyMode = true; busy = false; $ans.focus();
  }

  function submit() {
    if (busy || !cur) return;
    var raw = $ans.value.trim();
    if (raw === '') return;
    var val = parseInt(raw, 10);
    if (copyMode) {
      var ok = cur.school ? window.School.check(cur, raw) : val === cur.ans;
      if (ok && cur.school && --copiesLeft > 0) { $ans.value = ''; $hint.lastChild.textContent = ' once more to keep going'; $ans.focus(); return; }
      if (ok) { copyMode = false; busy = true; setTimeout(next, 250); }
      else { $ans.value = ''; $ans.focus(); }
      return;
    }
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
      if (E.fuelMs() >= NEED && !loadingPractice) setTimeout(factsDone, 300);
      else setTimeout(next, 300);
    } else {
      // Show the fact and its pattern; he types it once. A miss earns no fuel.
      $card.className = 'card wrong';
      $fact.innerHTML = cur.full.replace('=', '<span class="eq">=</span>');
      $hint.className = 'hint miss';
      $hint.innerHTML = 'Type <b>' + cur.ans + '</b> to keep going' + (E.pattern(cur.id) ? '<div class="pat">' + E.pattern(cur.id) + '</div>' : '');
      $ans.value = '';
      copyMode = true;
      busy = false;
      $ans.focus();
    }
  }

  function factsDone() {
    finishedFacts = true;
    log('pit.done', { surface: surface, typed: typed, right: right, fuel_start_ms: startFuel, fuel_ms: E.fuelMs() });
    if (isBreak) return leave('break');
    if (gameReady) return leave('ready');
    // Charged but the game is still loading: keep the questions coming (the tank is full, so no fuel).
    loadingPractice = true;
    $label.textContent = '⚡ Charged · game loading, keep going';
    $sub.innerHTML = '<span class="loading-dot"></span>Game loading…';
    if (gameStuck) $go.style.display = 'inline-block';
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
  document.addEventListener('mousedown', function (e) { if (e.target !== $go && e.target.id !== 'exit') setTimeout(function () { $ans.focus(); }, 0); });
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
  if (startFuel >= NEED) {
    // Paid up: no facts, straight back to the game.
    $card.style.display = 'none';
    $label.textContent = 'Fuel ' + E.fmtFuel(startFuel) + ' ✓';
    finishedFacts = true;
    if (isBreak) setTimeout(function () { leave('paid'); }, 900);
    else { $sub.innerHTML = '<span class="loading-dot"></span>Game loading…'; if (gameReady) leave('ready'); }
  } else {
    $label.textContent = isBreak ? '⚡ Charge up' : '⚡ Charge up to start';
    next();
  }
})();

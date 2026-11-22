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
    $('earn').textContent = earned ? '+' + Math.round(earned / 1000) + ' s' : '';
    $('rates').textContent = 'fast +' + E.FUEL.FAST / 1000 + ' s · slow +' + E.FUEL.SLOW / 1000 + ' s';
  }

  function next() {
    cur = E.pick();
    copyMode = false; firstKeyAt = null; backspace = false; busy = false;
    $card.className = 'card';
    $fact.innerHTML = cur.q + ' <span class="eq">=</span>';
    $ans.value = '';
    $hint.className = 'hint';
    $hint.textContent = 'Type it, then Enter';
    shownAt = performance.now();
    $ans.focus();
  }

  function submit() {
    if (busy || !cur) return;
    var raw = $ans.value.trim();
    if (raw === '') return;
    var val = parseInt(raw, 10);
    if (copyMode) {
      if (val === cur.ans) { copyMode = false; busy = true; setTimeout(next, 250); }
      else { $ans.value = ''; $ans.focus(); }
      return;
    }
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
      if (E.fuelMs() >= NEED) setTimeout(factsDone, 300);
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
    $card.style.display = 'none';
    $label.textContent = 'Charged';
    $sub.innerHTML = '<span class="loading-dot"></span>Game loading…';
    if (gameStuck) $go.style.display = 'inline-block';
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
    if (e.key.length === 1) e.preventDefault(); // digits only
  });
  // First-key time also from the input event (some input methods send no digit keydown).
  $ans.addEventListener('input', function () { if (firstKeyAt == null && !copyMode && $ans.value !== '') firstKeyAt = performance.now(); });
  document.addEventListener('mousedown', function (e) { if (e.target !== $go && e.target.id !== 'exit') setTimeout(function () { $ans.focus(); }, 0); });
  window.addEventListener('focus', function () { if (!finishedFacts) $ans.focus(); });

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

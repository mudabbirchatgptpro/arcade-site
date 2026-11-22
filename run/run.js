/* Today's Run, Sprint gear (redesign 2026-11-22).
 * 3 heats; a heat ends at N right answers (default 40, ?n= to change for testing), never on a timer.
 * Clock counts up; ghost = his best heat time. Same typed rules as the pit stop.
 * After heat 3: receipt, one loot card per day, quick-ignition perk for the rest of the day.
 */
(function () {
  'use strict';
  var E = window.FactEngine;
  var qs = new URLSearchParams(location.search);
  var N = Math.max(3, parseInt(qs.get('n') || '40', 10));
  var HEATS = Math.max(1, parseInt(qs.get('heats') || '3', 10));
  var $ = function (id) { return document.getElementById(id); };

  var heat = 0, right = 0, t0 = 0, tick = null;
  var cur = null, shownAt = 0, firstKeyAt = null, backspace = false, copyMode = false, busy = false;
  var tally = { typed: 0, right: 0, fks: [], heatMs: [], beatGhost: 0 };
  var before = E.counts();
  var R = E.run();
  var ghostMs = R.bestHeatMs && R.bestHeatN === N ? R.bestHeatMs : null;

  function show(id) { ['intro', 'heat', 'between', 'receipt'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); }); }
  function log(type, p) { if (window.arcadeLog) window.arcadeLog.event(type, p || {}, { game_key: 'run' }); }
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2); }
  function fmt(ms) { return (ms / 1000).toFixed(1) + ' s'; }

  $('introtext').textContent = HEATS + ' heat' + (HEATS > 1 ? 's' : '') + ' of ' + N + ' right answers. Race your ghost.';
  if (E.runDoneToday()) $('introsub').textContent = 'Run already done today. Extra heats still grow your grid (no new loot).';
  else $('introsub').textContent = 'Pays: 1 loot card, and quick ignition for the rest of today.';

  function startHeat() {
    heat++; right = 0;
    $('heatlabel').textContent = 'Heat ' + heat + ' of ' + HEATS;
    $('count').textContent = '0 / ' + N;
    $('me').style.width = '0%';
    $('ghost').style.width = '0%';
    $('ghostlabel').textContent = ghostMs ? 'Ghost: ' + fmt(ghostMs) : 'Ghost: none yet';
    show('heat');
    t0 = performance.now();
    tick = setInterval(function () {
      var el = performance.now() - t0;
      $('clock').textContent = fmt(el);
      if (ghostMs) $('ghost').style.width = Math.min(100, 100 * el / ghostMs) + '%';
    }, 100);
    next();
  }

  function next() {
    cur = E.pick();
    copyMode = false; firstKeyAt = null; backspace = false; busy = false;
    $('card').className = 'card';
    $('fact').innerHTML = cur.q + ' <span class="eq">=</span>';
    $('ans').value = '';
    $('hint').className = 'hint';
    $('hint').textContent = 'Type it, then Enter';
    shownAt = performance.now();
    $('ans').focus();
  }

  function submit() {
    if (busy || !cur) return;
    var raw = $('ans').value.trim();
    if (raw === '') return;
    var val = parseInt(raw, 10);
    if (copyMode) {
      if (val === cur.ans) { busy = true; setTimeout(next, 200); } else { $('ans').value = ''; }
      return;
    }
    busy = true;
    var t = performance.now();
    var ok = val === cur.ans;
    var fk = firstKeyAt == null ? null : firstKeyAt - shownAt;
    E.record(cur.id, ok, { firstKeyMs: fk, totalMs: t - shownAt, backspace: backspace, typed: raw, surface: 'heat', gameKey: 'run' });
    if (window.arcadeShell && window.arcadeShell.recordAttempt) {
      var player = (function () { try { return localStorage.getItem('isee_player_id') || 'parker'; } catch (e) { return 'parker'; } })();
      window.arcadeShell.recordAttempt({ deviceLocalKey: player, attemptId: uuid(), overrideId: null, questionId: cur.id, correct: ok, gameKey: 'run' }).catch(function () {});
    }
    tally.typed++;
    if (fk != null) tally.fks.push(fk);
    if (ok) {
      tally.right++; right++;
      $('count').textContent = right + ' / ' + N;
      $('me').style.width = (100 * right / N) + '%';
      $('card').className = 'card right';
      if (right >= N) return setTimeout(endHeat, 200);
      setTimeout(next, 150);
    } else {
      $('card').className = 'card wrong';
      $('fact').innerHTML = cur.full.replace('=', '<span class="eq">=</span>');
      $('hint').className = 'hint miss';
      $('hint').innerHTML = 'Type <b>' + cur.ans + '</b> to keep going';
      $('ans').value = '';
      copyMode = true; busy = false;
    }
  }

  function endHeat() {
    clearInterval(tick);
    var ms = performance.now() - t0;
    tally.heatMs.push(ms);
    var beat = ghostMs && ms < ghostMs;
    if (beat) tally.beatGhost++;
    var msg = 'Time ' + fmt(ms) + '. ';
    if (!ghostMs) msg += 'That is your first ghost.';
    else if (beat) msg += 'You beat your ghost by ' + fmt(ghostMs - ms) + '!';
    else msg += 'Ghost was ' + fmt(ghostMs) + '.';
    if (!ghostMs || ms < ghostMs) { ghostMs = ms; R = E.run(); R.bestHeatMs = ms; R.bestHeatN = N; E.saveRun(R); }
    log('run.heat', { heat: heat, n: N, ms: Math.round(ms), beat_ghost: !!beat });
    if (window.arcadeLog && window.arcadeLog.flush) window.arcadeLog.flush().catch(function () {});
    if (heat >= HEATS) return receipt();
    $('btitle').textContent = 'Heat ' + heat + ' done';
    $('btext').textContent = msg;
    $('nextheat').textContent = 'Start heat ' + (heat + 1);
    show('between');
    $('nextheat').focus();
  }

  function median(a) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }

  function receipt() {
    var after = E.counts();
    var firstToday = !E.runDoneToday();
    var stats = [
      ['Facts typed', tally.typed],
      ['Right first time', Math.round(100 * tally.right / Math.max(1, tally.typed)) + '%'],
      ['Median first key', (median(tally.fks) / 1000).toFixed(1) + ' s'],
      ['Fluent cells', after.fluent + ' / 120 (' + (after.fluent - before.fluent >= 0 ? '+' : '') + (after.fluent - before.fluent) + ')'],
    ];
    $('stats').innerHTML = stats.map(function (s) { return '<div class="stat"><span class="dim">' + s[0] + '</span><b>' + s[1] + '</b></div>'; }).join('');
    R = E.run();
    if (firstToday) {
      R.doneDate = E.today();
      R.last = { date: R.doneDate, typed: tally.typed, right: tally.right, medianFk: Math.round(median(tally.fks)), fluent: after.fluent };
      E.saveRun(R);
      dealLoot();
    } else {
      $('lootwrap').classList.add('hidden');
      $('perk').textContent = 'Run was already done today: grid progress only.';
    }
    log('run.done', { first_today: firstToday, typed: tally.typed, right: tally.right, median_fk: Math.round(median(tally.fks)), fluent: after.fluent, gained: after.fluent - before.fluent, beat_ghost: tally.beatGhost });
    $('heatlabel').textContent = '';
    show('receipt');
  }

  var LOOT = {
    common: [['🔥', 'Flame trail'], ['🌊', 'Wave trail'], ['⭐', 'Star aura'], ['🟦', 'Blue Home theme']],
    rare: [['⚡', 'Lightning trail'], ['🦉', 'Ninja owl skin'], ['🌌', 'Galaxy Home theme']],
    epic: [['🐉', 'Dragon aura'], ['🛠️', 'Title: Speed Mechanic']],
    legendary: [['👑', 'Title: QA Lead'], ['🌈', 'Prism trail']],
  };
  function roll() {
    var bonus = Math.min(0.15, 0.05 * tally.beatGhost);
    var r = Math.random();
    if (r < 0.02 + bonus / 3) return 'legendary';
    if (r < 0.12 + bonus) return 'epic';
    if (r < 0.40 + bonus) return 'rare';
    return 'common';
  }
  function dealLoot() {
    var $l = $('loot'); $l.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      var tier = roll(), list = LOOT[tier], it = list[Math.floor(Math.random() * list.length)];
      var b = document.createElement('button');
      b.className = 'lootcard ' + tier;
      b.innerHTML = '<span class="em">' + it[0] + '</span><span>' + it[1] + '</span><span>' + tier + '</span>';
      (function (tier, it) {
        b.addEventListener('click', function () {
          R = E.run(); R.loot = (R.loot || []).concat([{ date: E.today(), tier: tier, name: it[1], em: it[0] }]); E.saveRun(R);
          log('run.loot', { tier: tier, name: it[1] });
          $l.innerHTML = '<div class="lootcard ' + tier + '"><span class="em">' + it[0] + '</span><span>' + it[1] + '</span><span>yours</span></div>';
        });
      })(tier, it);
      $l.appendChild(b);
    }
  }

  $('ans').addEventListener('keydown', function (e) {
    var lag = Math.max(0, Math.round(performance.now() - e.timeStamp));
    $('lag').textContent = lag;
    $('lagdot').style.background = lag > 50 ? 'var(--miss)' : 'var(--go)';
    if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
    if (e.key === 'Backspace') { backspace = true; return; }
    if (/^[0-9]$/.test(e.key)) { if (firstKeyAt == null && !copyMode) firstKeyAt = performance.now(); return; }
    if (e.key.length === 1) e.preventDefault();
  });
  // First-key time also from the input event (some input methods send no digit keydown).
  $('ans').addEventListener('input', function () { if (firstKeyAt == null && !copyMode && $('ans').value !== '') firstKeyAt = performance.now(); });
  document.addEventListener('mousedown', function (e) { if (!$('heat').classList.contains('hidden') && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') setTimeout(function () { $('ans').focus(); }, 0); });
  $('start').addEventListener('click', function () { log('run.start', { n: N, heats: HEATS }); startHeat(); });
  $('nextheat').addEventListener('click', startHeat);
})();

/* Fact engine (redesign 2026-11-22). One engine for pit stops, ignition and heats.
 *
 * 72 facts: 8, 9, 11, 12 x 4..12 and the matching division. Gretchen (2026-11-22): no x or ÷ by 0-3 (too easy,
 * e.g. 10 ÷ 10, 9 x 1), and the 10s table is dropped too (adding a zero is not a fact worth drilling).
 * Per-fact state lives in localStorage on the hub origin (the overlay shares it).
 * Fluent attempt = right, first key within 3 s, total within 5 s, no backspace.
 * Cell colour: grey (never right), bronze (right but not fluent now),
 * silver (latest attempt fluent), gold (fluent on 3+ separate days and latest fluent).
 * Pick order: a missed fact first, then (about 1 in 5) a due fluent fact for pace,
 * else the working set of up to 6 not-yet-fluent facts. Never the same fact twice in a row.
 * Works in node too (in-memory store) so scripts/sim-facts.js can test it.
 */
(function (root) {
  'use strict';
  var KEY = 'pa_facts_v1';
  var RUN_KEY = 'pa_run_v1';
  var LC = (root.__LEARN || {});
  var FIRST_KEY_MS = LC.fluentFirstKeyMs || 3000, TOTAL_MS = LC.fluentTotalMs || 5000, WORKING = 6;
  var DAY = 86400000;
  var SPACING_DAYS = [1, 3, 7, 21];

  var mem = {};
  var store = {
    get: function (k) {
      try { if (root.localStorage) return root.localStorage.getItem(k); } catch (e) {}
      return mem[k] || null;
    },
    set: function (k, v) {
      try { if (root.localStorage) { root.localStorage.setItem(k, v); return; } } catch (e) {}
      mem[k] = v;
    },
  };

  var now = function () { return Date.now(); };
  function today(t) {
    var d = new Date(t || now());
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ── The facts ──
  var TABLES = [8, 9, 11, 12], M_FROM = 4, M_TO = 12;
  var FACTS = [], BY_ID = {};
  TABLES.forEach(function (t) {
    for (var m = M_FROM; m <= M_TO; m++) {
      FACTS.push({ id: 'fact-m-' + t + 'x' + m, op: 'mul', a: t, b: m, q: t + ' × ' + m, ans: t * m, full: t + ' × ' + m + ' = ' + (t * m), row: t, col: m });
    }
  });
  TABLES.forEach(function (t) {
    for (var m = M_FROM; m <= M_TO; m++) {
      FACTS.push({ id: 'fact-d-' + (t * m) + '-' + t, op: 'div', a: t * m, b: t, q: (t * m) + ' ÷ ' + t, ans: m, full: (t * m) + ' ÷ ' + t + ' = ' + m, row: t, col: m });
    }
  });
  FACTS.forEach(function (f) { BY_ID[f.id] = f; });

  // ── State ──
  var S = null;
  function load() {
    if (S) return S;
    try { S = JSON.parse(store.get(KEY) || 'null'); } catch (e) { S = null; }
    if (!S || typeof S !== 'object' || !S.f) S = { v: 1, f: {}, last: null, order: null };
    if (!S.order || S.order.some(function (id) { return !BY_ID[id]; }) || S.order.length !== FACTS.length) S.order = shuffled(FACTS.map(function (f) { return f.id; })); // fact set changed: re-deal, keep his history
    return S;
  }
  function save() { store.set(KEY, JSON.stringify(S)); }
  function st(id) {
    var s = load().f[id];
    if (!s) s = load().f[id] = { n: 0, right: 0, wrong: 0, hist: [], fdays: [], miss: false, due: 0, lvl: 0 };
    return s;
  }
  function shuffled(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }

  function isFluentAttempt(ok, fk, tot, bs) { return !!ok && fk != null && fk <= FIRST_KEY_MS && tot <= TOTAL_MS && !bs; }

  function status(id) {
    var s = load().f[id];
    if (!s || !s.right) return 'grey';
    var lastFluent = s.hist.length && s.hist[s.hist.length - 1].fl;
    if (lastFluent && s.fdays.length >= 3) return 'gold';
    if (lastFluent) return 'silver';
    return 'bronze';
  }
  function isFluentNow(id) { var c = status(id); return c === 'silver' || c === 'gold'; }

  function counts() {
    var c = { grey: 0, bronze: 0, silver: 0, gold: 0 };
    FACTS.forEach(function (f) { c[status(f.id)]++; });
    c.fluent = c.silver + c.gold;
    return c;
  }

  // ── Picking ──
  function workingSet() {
    var s = load();
    var started = [], fresh = [];
    s.order.forEach(function (id) {
      if (isFluentNow(id)) return;
      if (s.f[id] && s.f[id].n) started.push(id); else fresh.push(id);
    });
    // Least recently seen first, so a stuck slow fact rotates instead of clogging the set.
    started.sort(function (a, b) {
      var ha = s.f[a].hist, hb = s.f[b].hist;
      return (ha.length ? ha[ha.length - 1].t : 0) - (hb.length ? hb[hb.length - 1].t : 0);
    });
    // Keep 2 slots for new facts while any remain, so every fact gets met.
    var nFresh = Math.min(fresh.length, Math.max(2, WORKING - started.length));
    return started.slice(0, WORKING - nFresh).concat(fresh.slice(0, nFresh));
  }

  function pick() {
    var s = load();
    var last = s.last;
    var ok = function (id) { return id !== last; };
    var missed = s.order.filter(function (id) { return s.f[id] && s.f[id].miss && ok(id); });
    if (missed.length) return BY_ID[missed[0]];
    var fluent = s.order.filter(function (id) { return isFluentNow(id) && ok(id); });
    if (fluent.length && Math.random() < 0.2) {
      var due = fluent.filter(function (id) { return (s.f[id].due || 0) <= now(); });
      var pool = due.length ? due : fluent;
      pool.sort(function (a, b) { return (s.f[a].due || 0) - (s.f[b].due || 0); });
      return BY_ID[pool[0]];
    }
    var ws = workingSet().filter(ok);
    if (ws.length) return BY_ID[ws[Math.floor(Math.random() * ws.length)]];
    // Everything fluent: oldest due first.
    var all = s.order.filter(ok);
    all.sort(function (a, b) { return ((s.f[a] || {}).due || 0) - ((s.f[b] || {}).due || 0); });
    return BY_ID[all[0]];
  }

  // ── Recording ──
  // meta: { firstKeyMs, totalMs, backspace, surface: 'pit'|'ignition'|'heat'|'placement', gameKey }
  function record(id, correct, meta) {
    meta = meta || {};
    var s = st(id), t = now();
    var fl = isFluentAttempt(correct, meta.firstKeyMs, meta.totalMs, meta.backspace);
    var prev = load().f[id];
    var everGold = !!(prev && prev.fdays && prev.fdays.length >= 3);        // locked in once = review rate for good
    var echo = !!(prev && prev.miss);                                        // answer was just shown after a miss
    if (echo) fl = false;                                                    // no speed credit for repeating a shown answer
    s.n++;
    if (correct) s.right++; else s.wrong++;
    s.hist.push({ t: t, ok: !!correct, fk: meta.firstKeyMs == null ? null : Math.round(meta.firstKeyMs), tot: Math.round(meta.totalMs || 0), fl: fl, sf: meta.surface || null });
    if (s.hist.length > 8) s.hist.splice(0, s.hist.length - 8);
    s.miss = !correct;
    var d = today(t);
    if (fl) {
      if (s.fdays.indexOf(d) === -1) s.fdays.push(d);
      if (s.fdays.length > 10) s.fdays.splice(0, s.fdays.length - 10);
      s.due = t + SPACING_DAYS[s.lvl] * DAY;                               // first check after 1 day, then 3, 7, 21
      s.lvl = Math.min(s.lvl + 1, SPACING_DAYS.length - 1);
    } else {
      s.lvl = 0;
      s.due = t; // slow or wrong: due now (stays in the working set)
    }
    load().last = id;
    save();
    var f = BY_ID[id];
    if (root.arcadeLog && typeof root.arcadeLog.event === 'function') {
      root.arcadeLog.event('learn.attempt', {
        fact_id: id, correct: !!correct, fluent: fl,
        first_key_ms: meta.firstKeyMs == null ? null : Math.round(meta.firstKeyMs),
        total_ms: Math.round(meta.totalMs || 0), backspace: !!meta.backspace,
        typed: meta.typed == null ? null : String(meta.typed),
        answer: f ? f.ans : null, gear: 'sprint', surface: meta.surface || null,
      }, { game_key: meta.gameKey || null, question_id: id, severity: 'audit' });
    }
    var earned = fuelEarn(correct, fl, everGold);
    return { fluent: fl, status: status(id), earned: earned };
  }

  // ── Fuel (redesign 2026-11-22): play time is bought with typed facts ──
  // The tank holds one minute of play, so he charges up about every minute: short, spaced
  // retrieval all through play instead of one block he can bank and skip.
  // Fast fact = 20 s, right but slow = 10 s, wrong = nothing: knowing facts makes each stop shorter.
  var FUEL_KEY = 'pa_fuel_v1';
  var EARN_FAST = 20000, EARN_SLOW = 10000, EARN_GOLD = 5000, CHUNK = 60000, TANK_MAX = 60000;
  var SEGMENT_MAX = 90000; // a stop fires at most every ~75 s of play, so a longer gap means he left
  function fuelLoad() {
    var f;
    try { f = JSON.parse(store.get(FUEL_KEY) || 'null'); } catch (e) { f = null; }
    if (!f || f.day !== today()) f = { day: today(), ms: 0, playingSince: null };
    if (f.ms > TANK_MAX) f.ms = TANK_MAX;
    return f;
  }
  function fuelSave(f) { store.set(FUEL_KEY, JSON.stringify(f)); }
  // A locked-in (gold) fact is review: it pays 5 s, so cheap facts cannot fund play once he knows them.
  function fuelEarn(correct, fl, gold) {
    var add = !correct ? 0 : gold ? EARN_GOLD : fl ? EARN_FAST : EARN_SLOW;
    if (!add) return 0;
    var f = fuelLoad(), before = f.ms; f.ms = Math.min(TANK_MAX, f.ms + add); fuelSave(f);
    return f.ms - before; // what actually went in (nothing once the tank is full)
  }
  // Burn the play time since the game last started or resumed.
  function fuelDrain() {
    var f = fuelLoad();
    if (f.playingSince) {
      var used = Math.min(SEGMENT_MAX, Math.max(0, now() - f.playingSince));
      f.ms = Math.max(-TANK_MAX, f.ms - used); f.playingSince = null; fuelSave(f);
      if (root.arcadeLog && root.arcadeLog.event) root.arcadeLog.event('fuel.burn', { used_ms: used, left_ms: f.ms });
    }
    return f.ms;
  }
  function fuelPlay() { var f = fuelLoad(); f.playingSince = now(); fuelSave(f); }
  function fuelMs() { return fuelLoad().ms; }
  // Can go below zero (down to minus one tank): a wrong guess at an empty tank, or play past empty, is a debt
  // that the next answers pay off first.
  function fuelGive(ms) { var f = fuelLoad(); var before = f.ms; f.ms = Math.max(-TANK_MAX, Math.min(TANK_MAX, f.ms + ms)); fuelSave(f); return f.ms - before; }
  function fmtFuel(ms) { if (ms < 0) return '-' + fmtFuel(-ms); var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  // The pattern for a fact family, shown on the miss card. Never the answer.
  var FAMILY = {
    8: 'Eights: double it, double it, double it.',
    9: 'Nines: ten of them, minus one of them.',
    10: 'Tens: the number with a zero on the end.',
    11: 'Elevens: ten of them, plus one of them.',
    12: 'Twelves: ten of them, plus two of them.',
  };
  function pattern(id) {
    var F = BY_ID[id]; if (!F) return null;
    if (F.op === 'div') return F.a + ' ÷ ' + F.b + ' asks: ' + F.b + ' times what makes ' + F.a + '?';
    return FAMILY[F.row] || null;
  }
  function recent(id) { var s = load().f[id]; return s ? s.hist.slice(-5) : []; }

  // ── Run (daily) and ghost ──
  function run() {
    var r;
    try { r = JSON.parse(store.get(RUN_KEY) || 'null'); } catch (e) { r = null; }
    return r || { doneDate: null, bestHeatMs: null, loot: [], last: null };
  }
  function saveRun(r) { store.set(RUN_KEY, JSON.stringify(r)); }
  function runDoneToday() { return run().doneDate === today(); }
  function ignitionCount() { return runDoneToday() ? 1 : 5; }

  root.FactEngine = {
    FACTS: FACTS, byId: function (id) { return BY_ID[id]; }, pattern: pattern,
    pick: pick, record: record, status: status, counts: counts, recent: recent,
    run: run, saveRun: saveRun, runDoneToday: runDoneToday, ignitionCount: ignitionCount,
    today: today, isFluentAttempt: isFluentAttempt,
    fuelMs: fuelMs, fuelGive: fuelGive, fuelDrain: fuelDrain, fuelPlay: fuelPlay, fmtFuel: fmtFuel,
    FUEL: { FAST: EARN_FAST, SLOW: EARN_SLOW, CHUNK: CHUNK, MAX: TANK_MAX },
    _reset: function () { S = null; mem = {}; },
    _setNow: function (fn) { now = fn; },
  };
})(typeof window !== 'undefined' ? window : globalThis);

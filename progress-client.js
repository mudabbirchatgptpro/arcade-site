/* Sandbox SharedProgress client — cloned from parker-game-world/progress-client.js
 * URL + anon key are injected by the Electron preload script as window.__ARCADE_ENV.
 * If running outside the shell (plain browser) it falls back to the values in __DEFAULTS.
 *
 * Sets window.SharedProgress with the same API as the production client.
 */
(function (window) {
  'use strict';

  // ── Sandbox Supabase config ────────────────────────────────────────
  // The Electron preload injects window.__ARCADE_ENV = { SUPABASE_URL, SUPABASE_ANON_KEY }.
  // Edit __DEFAULTS only if you want to test the hub in a plain browser without Electron.
  var __DEFAULTS = {
    SUPABASE_URL: 'https://YOUR_NEW_PROJECT.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_REPLACE_ME'
  };
  var __ENV = (window.__ARCADE_ENV && window.__ARCADE_ENV.SUPABASE_URL)
    ? window.__ARCADE_ENV
    : __DEFAULTS;
  var SUPABASE_URL = __ENV.SUPABASE_URL;
  var SUPABASE_KEY = __ENV.SUPABASE_ANON_KEY;
  var PLAYER_KEY   = 'isee_player_id';
  var MODE_KEY     = 'isee_mode';

  function _resolvePlayer() {
    try {
      var param = new URLSearchParams(window.location.search).get('player');
      if (param) localStorage.setItem(PLAYER_KEY, param);
      return localStorage.getItem(PLAYER_KEY) || 'student';
    } catch (e) { return 'student'; }
  }

  function _resolveMode() {
    try {
      var param = new URLSearchParams(window.location.search).get('mode');
      if (param) localStorage.setItem(MODE_KEY, param);
      return localStorage.getItem(MODE_KEY) || 'english';
    } catch (e) { return 'english'; }
  }

  var _player   = _resolvePlayer();
  var _mode     = _resolveMode();
  var _playerId = _player + '-' + _mode;
  // Bump this suffix whenever Supabase test data is wiped or the question
  // pool is replaced wholesale — old localStorage cache becomes invisible
  // so the hub doesn't show stale "answered/mastered" counts from before
  // the wipe. v2 = 2026-04-28 ISEE Ch3 ingestion. v3 = 2026-04-28 reset
  // after morning hung-loading session inflated counts. v4 = 2026-04-28
  // reliability foundation (outbox + data_epoch + cursor persistence).
  var LS_KEY    = 'arcade_shell_' + _playerId + '_v4';
  // Outbox lives in its own key — NEVER bumped, NEVER wiped on epoch
  // invalidation. Un-synced attempts must survive cache resets.
  var OUTBOX_KEY = 'arcade_outbox_v1';
  // Last data_epoch we saw from server. If server's epoch is newer, we
  // wipe LS_KEY (the cache) but leave OUTBOX_KEY alone.
  var EPOCH_KEY = 'arcade_data_epoch_v1';
  // Surgical cursor-only reset (preserves _learned, _weakQueue, gameStats).
  // Bump arcade_meta.cursor_reset_token (any monotonically-increasing value)
  // to force every client to drop its local cursor and pull the value the
  // parent has set in learner_progression. Use this when the pool order
  // changes (e.g. mode='mixed' switched from interleave to English-first)
  // so the picker doesn't stay parked deep in the old layout.
  var CURSOR_EPOCH_KEY = 'arcade_cursor_epoch_v1';

  var _weakQueue = [];
  var _gameStats = {};
  var _learned   = [];
  // No-repeat rotation 2026-05-25: every question shown (answered, skipped,
  // or not) is recorded here so it is never served again until the whole
  // pool is exhausted. Parent requirement: unique questions only.
  var _seen      = [];
  var SEEN_MAX   = 5000;
  // 2026-05-27: ANTI-GAMING sticky pending. If pickQuestion serves Q and
  // Parker bails (exits to lobby, picks another game) WITHOUT answering,
  // _pendingQuestion holds Q so the next overlay re-serves the SAME Q —
  // not a fresh one. Cleared the moment recordAnswer fires for that id.
  // Persisted in localStorage so the stick survives game switches.
  var _pendingQuestion = null;
  // Stress-test mitigation 2026-04-29: cap unbounded arrays so a 4-hour
  // session can't grow localStorage past Chromium's ~5MB-per-origin
  // ceiling. _weakQueue evicts oldest once length > 200; _learned keeps
  // the last 1000 entries. Both are advisory ceilings — for ISEE pools
  // of ~300-500 questions, neither limit is reached in normal play.
  var WEAK_QUEUE_MAX = 200;
  var LEARNED_MAX = 1000;
  function _capArrays() {
    if (_weakQueue.length > WEAK_QUEUE_MAX) {
      _weakQueue.splice(0, _weakQueue.length - WEAK_QUEUE_MAX);
    }
    if (_learned.length > LEARNED_MAX) {
      _learned.splice(0, _learned.length - LEARNED_MAX);
    }
    if (_seen.length > SEEN_MAX) {
      _seen.splice(0, _seen.length - SEEN_MAX);
    }
  }
  function _markSeen(id) {
    if (id && _seen.indexOf(id) === -1) _seen.push(id);
  }
  // Global per-mode cursor into the question pool. Persisted in
  // localStorage (NOT Supabase — would need a `cursor` column on the
  // progress row). Single shared counter across games so jumping
  // between games doesn't restart the rotation. Null until first
  // load — first pick seeds a random offset so day-one users don't
  // always see Q1 first.
  var _cursor = null;
  var _sinceLastWeak = 0;
  var _nextWeakIn    = _rand(10, 15);
  var _loaded = false;
  var _saving = false;
  var _dirty  = false;

  function _rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ─── Outbox: durable + retried attempt-capture ─────────────────────
  // Every answer enqueues an entry here, then we try to flush. On
  // failure (network, RLS, Supabase down), the entry stays in localStorage
  // and the background flusher retries with exponential backoff. The
  // attempt_id UUID makes the server-side INSERT idempotent so retries
  // can never double-count.

  function _uuidv4() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    var s = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    return s.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function _loadOutbox() {
    try {
      var raw = window.localStorage.getItem(OUTBOX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function _saveOutbox(items) {
    try { window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(items)); } catch (e) {}
  }

  function _updateOutboxIndicator(count) {
    try {
      var el = document.getElementById('outbox-indicator');
      if (!el) return;
      if (count === 0) {
        el.style.display = 'none';
        el.textContent = '';
      } else {
        el.style.display = '';
        el.textContent = '↻ ' + count + ' un-synced';
      }
    } catch (e) {}
  }

  var _flushing = false;
  var _backoffTimer = null;
  function _enqueueAttempt(payload) {
    var box = _loadOutbox();
    box.push(Object.assign({ enqueued_at: Date.now(), retries: 0 }, payload));
    _saveOutbox(box);
    _updateOutboxIndicator(box.length);
    _flushOutbox(); // try to drain immediately
  }

  function _flushOutbox() {
    if (_flushing) return;
    var box = _loadOutbox();
    if (box.length === 0) {
      _updateOutboxIndicator(0);
      return;
    }
    var bridge = (typeof window !== 'undefined') && (window.arcadeOverlay || window.arcadeShell);
    if (!bridge || typeof bridge.recordAttempt !== 'function') return;

    _flushing = true;
    var item = box[0];
    Promise.resolve(bridge.recordAttempt({
      deviceLocalKey: item.deviceLocalKey,
      attemptId: item.attemptId,
      overrideId: item.overrideId || null,
      questionId: item.questionId,
      correct: item.correct,
      gameKey: item.gameKey,
    })).then(function (result) {
      _flushing = false;
      if (result && result.ok) {
        var box2 = _loadOutbox();
        box2.shift();
        _saveOutbox(box2);
        _updateOutboxIndicator(box2.length);
        if (box2.length > 0) _flushOutbox();
      } else {
        _scheduleRetry();
      }
    }).catch(function () {
      _flushing = false;
      _scheduleRetry();
    });
  }

  function _scheduleRetry() {
    if (_backoffTimer) return;
    var box = _loadOutbox();
    var retries = (box[0] && box[0].retries) || 0;
    var delayMs = Math.min(30000, 1000 * Math.pow(2, retries));
    if (box[0]) {
      box[0].retries = retries + 1;
      _saveOutbox(box);
    }
    _backoffTimer = setTimeout(function () {
      _backoffTimer = null;
      _flushOutbox();
    }, delayMs);
  }

  // ─── Data-epoch cache invalidation ─────────────────────────────────
  // On init, ask the bridge for the server-side data_epoch. If it's
  // newer than what we have locally, wipe LS_KEY (the cache of stats /
  // weakQueue / learned / cursor). Outbox is preserved — un-synced
  // attempts MUST survive a cache wipe.

  function _checkCursorEpochAndMaybeReset() {
    // Fetch arcade_meta directly via REST (not via the bridge): the Electron
    // preload's window.arcadeShell predates this token, so calling through
    // the bridge would require an .app rebuild + pull-loop sync. The anon
    // key already has read access to arcade_meta, so a direct fetch works
    // in BOTH the pure-browser lobby AND inside the packaged Electron app.
    if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve();
    return fetch(SUPABASE_URL + '/rest/v1/arcade_meta?key=eq.cursor_reset_token&select=value', {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (!Array.isArray(rows) || rows.length === 0) return; // no token yet
        var serverEpoch = Number(rows[0].value);
        if (!Number.isFinite(serverEpoch)) return;
        var localEpoch = 0;
        try { localEpoch = Number(window.localStorage.getItem(CURSOR_EPOCH_KEY)) || 0; } catch (e) {}
        if (serverEpoch > localEpoch) {
          _cursor = null; // forces _hydrateCursorFromServer (or pickQuestion default) to start fresh
          _saveLocal();   // persist the wiped cursor so we don't re-trigger next boot
          try { window.localStorage.setItem(CURSOR_EPOCH_KEY, String(serverEpoch)); } catch (e) {}
          console.log('[SharedProgress] cursor_epoch advanced ' + localEpoch + ' → ' + serverEpoch + ', cursor reset (learned/weakQueue preserved)');
        }
      })
      .catch(function () { /* leave local cursor alone on transient failures */ });
  }

  function _checkEpochAndMaybeInvalidate() {
    var bridge = (typeof window !== 'undefined') && (window.arcadeOverlay || window.arcadeShell);
    if (!bridge || typeof bridge.getDataEpoch !== 'function') return Promise.resolve();
    return Promise.resolve(bridge.getDataEpoch()).then(function (serverEpoch) {
      if (serverEpoch == null) return; // transient failure → leave local cache alone
      var localEpoch = 0;
      try { localEpoch = Number(window.localStorage.getItem(EPOCH_KEY)) || 0; } catch (e) {}
      if (serverEpoch > localEpoch) {
        try { window.localStorage.removeItem(LS_KEY); } catch (e) {}
        _weakQueue = [];
        _gameStats = {};
        _learned = [];
        _seen = []; // reset no-repeat history too, else stale _seen is re-persisted into the fresh cache
        _cursor = null;
        try { window.localStorage.setItem(EPOCH_KEY, String(serverEpoch)); } catch (e) {}
        console.log('[SharedProgress] data_epoch advanced ' + localEpoch + ' → ' + serverEpoch + ', cache cleared');
      }
    }).catch(function () { /* leave cache alone on transient failures */ });
  }

  // ─── Cursor persistence (write-through to Supabase, with retry) ────
  // Debounced writer + dirty-flag retry. Same idempotency model as
  // attempts: the cursor for (learner_id, mode) is upserted server-side,
  // so retrying a "set cursor=42 for english" can never double-write.
  // The PENDING value is what we want to ship next; if a flush fails or
  // a newer pickQuestion arrives mid-flush, _pendingCursor is updated
  // and another flush is scheduled with backoff.
  var _cursorFlushTimer = null;
  var _cursorBackoffTimer = null;
  var _cursorRetries = 0;
  var _cursorFlushing = false;
  var _pendingCursor = null;

  function _scheduleCursorFlush() {
    _pendingCursor = _cursor;
    if (_cursorFlushTimer || _cursorFlushing || _cursorBackoffTimer) return;
    _cursorFlushTimer = setTimeout(function () {
      _cursorFlushTimer = null;
      _flushCursor();
    }, 1500);
  }

  function _flushCursor() {
    if (_cursorFlushing) return;
    if (_pendingCursor == null) return;
    var bridge = (typeof window !== 'undefined') && (window.arcadeOverlay || window.arcadeShell);
    if (!bridge || typeof bridge.setProgression !== 'function') return;
    var snapshot = _pendingCursor;
    _cursorFlushing = true;
    Promise.resolve(bridge.setProgression({ deviceLocalKey: _player, mode: _mode, cursor: snapshot }))
      .then(function (result) {
        _cursorFlushing = false;
        if (result && result.ok) {
          _cursorRetries = 0;
          // If pickQuestion advanced past `snapshot` while we were in flight,
          // schedule another flush for the new value.
          if (_pendingCursor !== snapshot) _scheduleCursorFlush();
          else _pendingCursor = null;
        } else {
          _scheduleCursorRetry();
        }
      })
      .catch(function () {
        _cursorFlushing = false;
        _scheduleCursorRetry();
      });
  }

  function _scheduleCursorRetry() {
    if (_cursorBackoffTimer) return;
    var delayMs = Math.min(30000, 1000 * Math.pow(2, _cursorRetries));
    _cursorRetries++;
    _cursorBackoffTimer = setTimeout(function () {
      _cursorBackoffTimer = null;
      _flushCursor();
    }, delayMs);
  }

  function _hydrateCursorFromServer() {
    var bridge = (typeof window !== 'undefined') && (window.arcadeOverlay || window.arcadeShell);
    if (!bridge || typeof bridge.getProgression !== 'function') return Promise.resolve();
    return Promise.resolve(bridge.getProgression(_player)).then(function (rows) {
      if (!Array.isArray(rows)) return;
      var match = rows.find(function (r) { return r.mode === _mode; });
      if (match && typeof match.cursor_value === 'number') {
        // Server cursor wins ONLY if local cursor is null (first launch
        // after a cache wipe). Otherwise we keep the local cursor —
        // it's the most recent.
        if (_cursor == null) _cursor = match.cursor_value;
      }
    }).catch(function () {});
  }

  function _loadLocal() {
    try {
      var raw = window.localStorage.getItem(LS_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        _weakQueue = d.weakQueue || [];
        _gameStats = d.gameStats || {};
        _learned   = d.learned  || [];
        _seen      = d.seen     || [];
        _pendingQuestion = d.pendingQuestion || null;
        if (typeof d.cursor === 'number') _cursor = d.cursor;
      }
    } catch (e) {}
  }

  function _saveLocal() {
    _capArrays();
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify({
        weakQueue: _weakQueue, gameStats: _gameStats, learned: _learned,
        seen: _seen, cursor: _cursor, pendingQuestion: _pendingQuestion
      }));
    } catch (e) {}
  }

  function _headers() {
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    };
  }

  function _isConfigured() {
    return SUPABASE_URL &&
      SUPABASE_URL.indexOf('YOUR_NEW_PROJECT') === -1 &&
      SUPABASE_KEY &&
      SUPABASE_KEY.indexOf('REPLACE_ME') === -1;
  }

  // 2026-05-09: mixed-mode helpers. Question IDs in the ISEE pool are
  // prefixed eng-* or math-* (mini-courses use course-* but always sit
  // inside an active override and bypass this filtering anyway). We use
  // the prefix to dispatch each item to the right per-mode progress row
  // when reading + writing to Supabase, so Parker's existing English and
  // Math streaks/learned sets stay separate even though the pool is
  // interleaved at the pickQuestion level.
  // id → subject, populated from each served pool (questions now carry an
  // explicit q.subject from the server). This is the authoritative classifier;
  // the prefix fallback below only covers cached ids whose objects we no longer
  // hold. _registerSubjects is called for every pool the picker sees.
  var _subjectById = {};
  function _registerSubjects(pool) {
    if (!pool || !pool.length) return;
    for (var i = 0; i < pool.length; i++) {
      if (pool[i] && pool[i].id && pool[i].subject) _subjectById[pool[i].id] = pool[i].subject;
    }
  }

  function _idMode(qid) {
    if (typeof qid !== 'string') return 'english';
    if (_subjectById[qid]) return _subjectById[qid] === 'maths' ? 'maths' : 'english';
    // Fallback for legacy cached ids with no registered subject. Covers the
    // current pools: english is `eng-*`; maths is `gen-*`/`dgm-*` (and legacy
    // `math-*`). Anything else (course-* etc.) defaults to english.
    if (qid.indexOf('eng-') === 0) return 'english';
    if (qid.indexOf('math-') === 0 || qid.indexOf('gen-') === 0 || qid.indexOf('dgm-') === 0) return 'maths';
    return 'english';
  }

  function _splitByMode(arr, getId) {
    var eng = [], math = [];
    for (var i = 0; i < arr.length; i++) {
      var id = getId ? getId(arr[i]) : arr[i];
      (_idMode(id) === 'maths' ? math : eng).push(arr[i]);
    }
    return { english: eng, maths: math };
  }

  function _loadRemote() {
    if (!_isConfigured()) return Promise.resolve();
    if (_mode === 'mixed') {
      // Fetch BOTH parker-english and parker-maths rows and union them
      // into the single _learned/_weakQueue/_gameStats the rest of the
      // client uses. Saves later split them back so per-mode progress
      // never gets mashed together server-side.
      var ids = encodeURIComponent(_player + '-english') + ',' + encodeURIComponent(_player + '-maths');
      return fetch(
        SUPABASE_URL + '/rest/v1/progress?id=in.(' + ids + ')&select=id,weak_queue,game_stats,learned',
        { headers: _headers() }
      ).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (rows) {
        var eng = (rows || []).find(function (x) { return x.id === _player + '-english'; }) || {};
        var math = (rows || []).find(function (x) { return x.id === _player + '-maths'; }) || {};
        _learned = (eng.learned || []).concat(math.learned || []);
        _weakQueue = (eng.weak_queue || []).concat(math.weak_queue || []);
        _gameStats = Object.assign({}, eng.game_stats || {}, math.game_stats || {});
        _saveLocal();
      });
    }
    return fetch(
      SUPABASE_URL + '/rest/v1/progress?id=eq.' + encodeURIComponent(_playerId) +
      '&select=weak_queue,game_stats,learned',
      { headers: _headers() }
    ).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (rows) {
      if (rows && rows[0]) {
        _weakQueue = rows[0].weak_queue || [];
        _gameStats = rows[0].game_stats || {};
        _learned   = rows[0].learned   || [];
        _saveLocal();
      }
    });
  }

  function _saveRemote() {
    if (!_isConfigured()) return Promise.resolve();
    if (_saving) {
      _dirty = true;
      return Promise.resolve();
    }
    _saving = true;
    _dirty  = false;
    var bodies;
    if (_mode === 'mixed') {
      // Split _learned (string ids) and _weakQueue (objects with .questionId)
      // back into per-mode rows so server-side state stays clean. game_stats
      // doesn't carry mode info, so we write it to BOTH rows — at worst the
      // counts on each row include unrelated games, which is cosmetic.
      var lSplit = _splitByMode(_learned, null);
      var wSplit = _splitByMode(_weakQueue, function (e) { return e.questionId; });
      bodies = [
        { id: _player + '-english', weak_queue: wSplit.english, game_stats: _gameStats, learned: lSplit.english, updated_at: new Date().toISOString() },
        { id: _player + '-maths',   weak_queue: wSplit.maths,   game_stats: _gameStats, learned: lSplit.maths,   updated_at: new Date().toISOString() }
      ];
    } else {
      bodies = [{ id: _playerId, weak_queue: _weakQueue, game_stats: _gameStats, learned: _learned, updated_at: new Date().toISOString() }];
    }
    return Promise.all(bodies.map(function (b) {
      return fetch(SUPABASE_URL + '/rest/v1/progress', {
        method: 'POST',
        keepalive: true,
        headers: Object.assign({}, _headers(), { 'Prefer': 'resolution=merge-duplicates' }),
        body: JSON.stringify(b)
      });
    })).catch(function (e) {
      console.warn('[SharedProgress] Save failed — local copy kept.', e);
    }).then(function () {
      _saving = false;
      if (_dirty) {
        _dirty = false;
        _saveRemote();
      }
    });
  }

  function init() {
    _loadLocal();
    var initialOutboxCount = _loadOutbox().length;
    _updateOutboxIndicator(initialOutboxCount);

    // Order:
    //   1. Check data_epoch — if server advanced, wipe cache (keep outbox).
    //   2. Hydrate cursor from server if local was null (e.g. just-wiped).
    //   3. Load remote stats (existing path, populates _learned + _weakQueue).
    //   4. Drain outbox — ship anything left from a previous session.
    var p = _checkEpochAndMaybeInvalidate()
      .then(_checkCursorEpochAndMaybeReset)
      .then(_hydrateCursorFromServer)
      .then(function () {
        return _loadRemote().catch(function (e) {
          console.warn('[SharedProgress] Offline — using local cache.', e);
        });
      })
      .then(function () { _loaded = true; })
      .then(function () { _flushOutbox(); }); // drain anything queued from a prior session

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        _loadRemote().catch(function () {});
        _flushOutbox(); // also retry outbox when window regains focus
      }
    });

    return p;
  }

  function pickQuestion(pool, gameName) {
    if (!pool || !pool.length) return null;
    _registerSubjects(pool); // learn each question's subject for correct per-mode routing

    // 2026-05-27 (parent ask): PENDING-STICK. If a question was shown but
    // not answered, it follows Parker across game switches — serve it again
    // here. This blocks the "exit a hard question, pick another game, get a
    // different question" gaming pattern. Graceful fallback if the pending
    // id isn't in the current pool (e.g. mode change) — skip to normal pick.
    if (_pendingQuestion) {
      var pq = pool.find(function (q) { return q.id === _pendingQuestion.id; });
      if (pq) return Object.assign({}, pq, { _isWeak: false, _isPending: true });
    }

    // ── No-repeat phase (2026-05-25, parent requirement) ──────────────
    // While the pool still holds questions Parker hasn't seen, always serve
    // an unseen one and SKIP the weak-queue re-ask (which would repeat a
    // question). Every served question is recorded in _seen — including ones
    // he skips — so nothing recurs. Only once the whole pool has been seen do
    // we fall through to the original spaced-repetition behavior below.
    var _hasUnseen = false;
    for (var u = 0; u < pool.length; u++) {
      if (_seen.indexOf(pool[u].id) === -1) { _hasUnseen = true; break; }
    }
    if (_hasUnseen) {
      if (_cursor === null) _cursor = 0;
      var unpicked = null;
      for (var s = 0; s < pool.length; s++) {
        var ui = (_cursor + s) % pool.length;
        var uc = pool[ui];
        if (_seen.indexOf(uc.id) === -1) { _cursor = ui + 1; unpicked = uc; break; }
      }
      if (unpicked) {
        _markSeen(unpicked.id);
        _pendingQuestion = unpicked; // 2026-05-27: stick until recordAnswer clears it
        _saveLocal();
        _scheduleCursorFlush();
        _sinceLastWeak++;
        return Object.assign({}, unpicked, { _isWeak: false });
      }
    }

    // 2026-05-27 (parent ask): STRICT NO-REPEAT. Previously this tail would
    // re-ask weak-queue items and fall back to seen-but-not-learned items —
    // Parker memorized the schemas and started gaming the system. Now: if
    // every question in the pool is in _seen, return null. The overlay
    // surfaces "🎉 All questions mastered! Hang on while the game loads"
    // and OPENS its gate (poolExhausted flag) so Parker isn't trapped.
    // FUTURE: an AI layer will GENERATE fresh similar questions in this
    // slot to verify mastery without exact-item repetition.
    return null;
  }

  function recordAnswer(questionId, gameName, correct, isWeak) {
    // 2026-05-27: an answer submitted releases the pending-stick.
    if (_pendingQuestion && _pendingQuestion.id === questionId) _pendingQuestion = null;
    var idx = -1;
    for (var i = 0; i < _weakQueue.length; i++) {
      if (_weakQueue[i].questionId === questionId) { idx = i; break; }
    }

    if (correct) {
      if (isWeak && idx !== -1) {
        _weakQueue[idx].correctStreak = (_weakQueue[idx].correctStreak || 0) + 1;
        if (_weakQueue[idx].correctStreak >= 3) {
          _weakQueue.splice(idx, 1);
          if (_learned.indexOf(questionId) === -1) _learned.push(questionId);
        }
      } else if (!isWeak && idx === -1) {
        if (_learned.indexOf(questionId) === -1) _learned.push(questionId);
      }
    } else {
      var li = _learned.indexOf(questionId);
      if (li !== -1) _learned.splice(li, 1);
      if (idx !== -1) {
        _weakQueue[idx].correctStreak = 0;
        _weakQueue[idx].wrongCount    = (_weakQueue[idx].wrongCount || 0) + 1;
      } else {
        _weakQueue.push({ questionId: questionId, wrongCount: 1, correctStreak: 0 });
      }
    }

    if (!_gameStats[gameName]) _gameStats[gameName] = { answered: 0, correct: 0 };
    _gameStats[gameName].answered++;
    if (correct) _gameStats[gameName].correct++;

    // Reliability: enqueue to the durable outbox. The flusher will retry
    // on transient failures. attempt_id is a client-generated UUID;
    // server-side INSERT dedupes on it so retries can never double-count.
    _enqueueAttempt({
      deviceLocalKey: _player,
      attemptId: _uuidv4(),
      overrideId: null, // TODO Phase 2+: thread the active override id through
      questionId: questionId,
      correct: !!correct,
      gameKey: gameName || null,
    });

    _saveLocal();
    return _saveRemote();
  }

  function getStats(gameName)  { return _gameStats[gameName] || { answered: 0, correct: 0 }; }
  function getWeakCount()      { return _weakQueue.length; }
  function getLearned()        { return _learned.slice(); }
  function getPlayerId()       { return _playerId; }
  function getMode()           { return _mode; }

  window.SharedProgress = {
    init: init, pickQuestion: pickQuestion, recordAnswer: recordAnswer,
    getStats: getStats, getWeakCount: getWeakCount, getLearned: getLearned,
    getPlayerId: getPlayerId, getMode: getMode
  };

})(window);

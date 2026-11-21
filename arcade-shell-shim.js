/*
 * Browser-mode replacement for the Electron preload's `window.arcadeShell`.
 *
 * In Electron (~/parker-arcade-shell/electron/preload.ts) `window.arcadeShell`
 * is wired to ipcRenderer.invoke for each IPC channel. Loaded directly from
 * a Railway URL there's no Electron — so we shim each method with the
 * equivalent fetch() against either:
 *   - this server's /api/games and /api/questions/:mode (lightweight relays), or
 *   - Supabase REST/RPC directly with the anon key (same calls main.ts makes).
 *
 * Load order MATTERS: this file must run BEFORE progress-client.js so the
 * shim exists when SharedProgress probes for window.arcadeShell.
 *
 * If running INSIDE the Electron shell (later — Phase 2), preload.ts will
 * already have set window.arcadeShell — this shim is a no-op then.
 */
(function () {
  'use strict';
  if (window.arcadeShell) return; // running inside Electron — preload won

  var env = window.__ARCADE_ENV || {};
  var SUPABASE_URL = env.SUPABASE_URL || '';
  var SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || '';

  function supabaseHeaders() {
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    };
  }

  function rpc(name, payload) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return Promise.reject(new Error('Supabase env not configured'));
    }
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify(payload || {}),
    }).then(function (r) {
      if (!r.ok) throw new Error('rpc ' + name + ' HTTP ' + r.status);
      return r.json();
    });
  }

  /* ── override-application logic (mirrors main.ts:341-396) ────────────
   * The Electron main process calls get_active_override + applies it to
   * the question pool server-side, then returns the filtered pool. Here
   * we replicate that in the browser, calling /api/questions/:mode for
   * the baseline ISEE pool and Supabase RPC for the override.
   */
  function interleave(primary, secondary, primaryRatio) {
    // 60/40-ish blend — pulled from main.ts's interleave() shape.
    var out = [];
    var pi = 0;
    var si = 0;
    while (pi < primary.length || si < secondary.length) {
      if (pi < primary.length && (si >= secondary.length || Math.random() < primaryRatio)) {
        out.push(primary[pi++]);
      } else if (si < secondary.length) {
        out.push(secondary[si++]);
      }
    }
    return out;
  }

  function applyOverride(pool, override, safeMode) {
    if (!override) return pool;
    if (override.kind === 'custom_prompt') {
      var ids = override.payload && override.payload.question_ids;
      var overrideMode = override.payload && override.payload.mode;
      if (Array.isArray(ids) && ids.length > 0 && (!overrideMode || overrideMode === safeMode)) {
        var idSet = new Set(ids);
        var matched = pool.questions.filter(function (q) { return idSet.has(q.id); });
        var chosen = matched;
        if (override.mix_mode === 'blend') {
          var baseline = pool.questions.filter(function (q) { return !idSet.has(q.id); });
          var blendCount = Math.max(matched.length, Math.round(baseline.length * 0.4));
          chosen = interleave(matched, baseline.slice(0, blendCount), 0.6);
        }
        return Object.assign({}, pool, { total: chosen.length, questions: chosen });
      }
    }
    if (override.kind === 'mini_course') {
      var courseMode = override.payload && override.payload.mode;
      var courseQuestions = override.payload && override.payload.questions;
      if (courseMode === safeMode && Array.isArray(courseQuestions) && courseQuestions.length > 0) {
        var chosen2 = courseQuestions;
        if (override.mix_mode === 'blend') {
          var blendCount2 = Math.round(courseQuestions.length * 0.67);
          chosen2 = interleave(courseQuestions, pool.questions.slice(0, blendCount2), 0.6);
        }
        return Object.assign({}, pool, { total: chosen2.length, questions: chosen2 });
      }
    }
    // homework_gate is enforced cosmetically by the gate-redirect in
    // index.html. The launchTransient stub also blocks (defense-in-depth).
    return pool;
  }

  function showDesktopOnlyModal(gameKey) {
    var existing = document.getElementById('desktop-only-modal');
    if (existing) {
      existing.style.display = 'flex';
      return;
    }
    var modal = document.createElement('div');
    modal.id = 'desktop-only-modal';
    modal.style.cssText =
      'position:fixed;inset:0;background:rgba(20,10,40,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);';
    modal.innerHTML =
      '<div style="background:linear-gradient(160deg,#2a1a4a,#3a2060);border:2px solid rgba(255,255,255,0.15);border-radius:24px;padding:36px 40px;max-width:480px;text-align:center;color:#fff;font-family:Nunito,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
      '<div style="font-size:54px;margin-bottom:14px;">🖥️</div>' +
      '<div style="font-family:Fredoka One,sans-serif;font-size:24px;margin-bottom:10px;">Desktop app needed</div>' +
      '<div style="font-size:15px;line-height:1.5;opacity:0.85;margin-bottom:22px;">' +
      '<strong>' + (gameKey || 'This game') + '</strong> runs inside the Parker Arcade desktop app — open the arcade on your Mac to play. The web preview shows the lobby and ISEE practice only.' +
      '</div>' +
      '<button id="desktop-only-close" style="background:linear-gradient(135deg,#ff66cc,#cc44aa);border:none;color:#fff;font-family:Nunito,sans-serif;font-weight:800;font-size:15px;padding:11px 28px;border-radius:14px;cursor:pointer;letter-spacing:0.5px;">Got it</button>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('desktop-only-close').addEventListener('click', function () {
      modal.style.display = 'none';
    });
  }

  window.arcadeShell = {
    listGames: function () {
      return fetch('/api/games').then(function (r) { return r.json(); });
    },

    getQuestions: function (mode, deviceLocalKey) {
      var safe = mode === 'maths' ? 'maths' : 'english';
      var poolPromise = fetch('/api/questions/' + safe).then(function (r) { return r.json(); });
      var overridePromise = deviceLocalKey
        ? rpc('get_active_override', { p_device_local_key: deviceLocalKey }).then(function (rows) {
            return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
          }).catch(function () { return null; })
        : Promise.resolve(null);
      return Promise.all([poolPromise, overridePromise]).then(function (results) {
        return applyOverride(results[0], results[1], safe);
      });
    },

    launchTransient: function (args) {
      showDesktopOnlyModal((args && args.gameKey) || '');
      return Promise.resolve();
    },

    exitTransient: function () { return Promise.resolve(); },

    recordAttempt: function (args) {
      return rpc('record_attempt', {
        p_device_local_key: args.deviceLocalKey,
        p_attempt_id: args.attemptId,
        p_override_id: args.overrideId,
        p_question_id: args.questionId,
        p_correct: args.correct,
        p_game_key: args.gameKey,
      }).then(function () { return { ok: true }; })
        .catch(function (err) {
          console.warn('[shim] record_attempt failed', err);
          return { ok: false };
        });
    },

    setProgression: function (args) {
      return rpc('set_progression', {
        p_device_local_key: args.deviceLocalKey,
        p_mode: args.mode,
        p_cursor: args.cursor,
      }).then(function () { return { ok: true }; })
        .catch(function () { return { ok: false }; });
    },

    getProgression: function (deviceLocalKey) {
      return rpc('get_progression', { p_device_local_key: deviceLocalKey })
        .then(function (rows) { return Array.isArray(rows) ? rows : []; })
        .catch(function () { return []; });
    },

    getDataEpoch: function () {
      // arcade_meta is a key/value table — direct REST read, not an RPC.
      // Mirrors override-client.ts:119 (~/parker-arcade-shell/electron/).
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return Promise.resolve(null);
      return fetch(SUPABASE_URL + '/rest/v1/arcade_meta?key=eq.data_epoch&select=value', {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (rows) {
          if (!Array.isArray(rows) || rows.length === 0) return null;
          var n = Number(rows[0].value);
          return Number.isFinite(n) ? n : null;
        })
        .catch(function () { return null; });
    },

    getCursorEpoch: function () {
      // Same shape as getDataEpoch but for the cursor-only reset token.
      // Used to force clients to drop their cached cursor when the pool
      // order changes (without wiping learned/weakQueue).
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return Promise.resolve(null);
      return fetch(SUPABASE_URL + '/rest/v1/arcade_meta?key=eq.cursor_reset_token&select=value', {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (rows) {
          if (!Array.isArray(rows) || rows.length === 0) return null;
          var n = Number(rows[0].value);
          return Number.isFinite(n) ? n : null;
        })
        .catch(function () { return null; });
    },

    onOverrideChanged: function (_cb) {
      // No-op in browser mode for v1. Polling could be added later if
      // the URL ever needs <5s override response time. For now the
      // page reloads pick up the new override on next visibilitychange.
      return function () {};
    },
  };
})();

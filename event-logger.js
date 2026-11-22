/**
 * Browser-side event logger for Parker arcade lobby + overlay + back-button + gate.
 *
 * Loaded by every public HTML page that needs to log. Reads config from
 * window.__ARCADE_ENV (injected by /env.js):
 *   SUPABASE_EVENTS_URL, SUPABASE_EVENTS_ANON_KEY  — write-only credentials
 *
 * Behavior:
 *   - Buffers events in memory, flushes every 5s and on pagehide.
 *   - When window.arcadeShell.logEvents IPC bridge is present (Electron host),
 *     prefers that path so events join the shell's per-boot session trace.
 *   - When loaded in plain Chrome (Mudaber testing from his laptop), POSTs
 *     directly to the audit project's REST endpoint with the anon key.
 *   - Per-tab session_id persisted in sessionStorage so a re-render in the
 *     same tab keeps it; cross-tab/reload ⇒ new session_id.
 *
 * Public API:
 *   window.arcadeLog.event(event_type, payload?, opts?)
 *   window.arcadeLog.flush()      — manual flush
 *   window.arcadeLog.sessionId    — current session UUID
 *
 * Kill switch: set window.__EVENT_LOG_DISABLED = true (or env injects it).
 */
(function (window) {
  'use strict';

  function isDisabled() {
    return Boolean(window.__EVENT_LOG_DISABLED) ||
      (window.__ARCADE_ENV && window.__ARCADE_ENV.EVENT_LOG_DISABLED === '1');
  }

  function envCfg() {
    var env = window.__ARCADE_ENV || {};
    var url = env.SUPABASE_EVENTS_URL;
    var key = env.SUPABASE_EVENTS_ANON_KEY;
    if (!url || !key) return null;
    if (String(url).indexOf('REPLACE_ME') !== -1 || String(key).indexOf('REPLACE_ME') !== -1) return null;
    return { url: url, anonKey: key };
  }

  // Per-tab session id, persisted across in-tab navigation (lobby ↔ overlay).
  var SESSION_KEY = 'arcade_session_id_v1';
  var sessionId;
  try { sessionId = sessionStorage.getItem(SESSION_KEY); } catch (e) { sessionId = null; }
  if (!sessionId) {
    sessionId = (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
                String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    try { sessionStorage.setItem(SESSION_KEY, sessionId); } catch (e) {}
  }

  function inferDeviceKey() {
    // A test site can force the key (scripts/test-server.js) so test events never carry Parker's key.
    if (window.__ARCADE_FORCE_KEY) return window.__ARCADE_FORCE_KEY;
    try { return localStorage.getItem('isee_player_id') || null; } catch (e) { return null; }
  }

  function defaultSource() {
    return window.__EVENT_SOURCE || 'arcade-hub-lobby';
  }

  var queue = [];
  var MAX_QUEUED = 500;
  var BATCH_SIZE = 50;
  var FLUSH_MS = 5_000;
  var flushing = false;

  async function flush() {
    if (flushing || queue.length === 0) return;
    if (isDisabled()) { queue.length = 0; return; }
    flushing = true;
    var batch = queue.splice(0, BATCH_SIZE);
    try {
      // Prefer IPC bridge when running inside Electron — events join the
      // shell's per-boot session and use the same outbox.
      if (window.arcadeShell && typeof window.arcadeShell.logEvents === 'function') {
        await window.arcadeShell.logEvents(batch);
      } else {
        var cfg = envCfg();
        if (!cfg) {
          // No audit project configured AND no Electron bridge — drop silently.
          return;
        }
        var res = await fetch(cfg.url + '/rest/v1/event_log', {
          method: 'POST',
          headers: {
            apikey: cfg.anonKey,
            Authorization: 'Bearer ' + cfg.anonKey,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(batch),
        });
        if (!res.ok && queue.length + batch.length < MAX_QUEUED) {
          // Re-queue for next flush; never re-await.
          queue = batch.concat(queue);
        }
      }
    } catch (e) {
      if (queue.length + batch.length < MAX_QUEUED) queue = batch.concat(queue);
    } finally {
      flushing = false;
    }
  }

  function logEvent(event_type, payload, opts) {
    if (isDisabled()) return;
    if (!event_type || typeof event_type !== 'string') return;
    opts = opts || {};
    var version = (window.__ARCADE_ENV && window.__ARCADE_ENV.ARCADE_VERSION) || 'unknown';
    var row = {
      occurred_at: new Date().toISOString(),
      source: opts.source || defaultSource(),
      event_type: event_type,
      severity: opts.severity || 'info',
      device_local_key: opts.device_local_key || inferDeviceKey(),
      parent_id: opts.parent_id || null,
      learner_id: opts.learner_id || null,
      session_id: sessionId,
      game_key: opts.game_key || null,
      question_id: opts.question_id || null,
      app_version: version,
      payload: payload || {},
    };
    queue.push(row);
    if (queue.length > MAX_QUEUED) queue.splice(0, queue.length - MAX_QUEUED);
  }

  // Periodic flush.
  setInterval(function () { flush().catch(function () {}); }, FLUSH_MS);

  // Last-gasp flush on pagehide. sendBeacon is fire-and-forget across nav.
  window.addEventListener('pagehide', function () {
    if (queue.length === 0 || isDisabled()) return;
    if (window.arcadeShell && typeof window.arcadeShell.logEvents === 'function') {
      // Electron — try a sync IPC; if the process is tearing down, we lose
      // the last buffer, which is acceptable.
      try { window.arcadeShell.logEvents(queue); } catch (e) {}
      queue.length = 0;
      return;
    }
    var cfg = envCfg();
    if (!cfg) return;
    try {
      var blob = new Blob([JSON.stringify(queue)], { type: 'application/json' });
      // sendBeacon doesn't allow custom headers — Supabase REST accepts the
      // anon key as an apikey query-string param.
      navigator.sendBeacon(
        cfg.url + '/rest/v1/event_log?apikey=' + encodeURIComponent(cfg.anonKey),
        blob,
      );
      queue.length = 0;
    } catch (e) {}
  });

  window.arcadeLog = {
    event: logEvent,
    flush: flush,
    sessionId: sessionId,
  };
})(window);

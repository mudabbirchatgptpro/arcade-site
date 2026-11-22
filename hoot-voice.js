/* Ask Hoot: a live voice conversation (ElevenLabs voice agent "Hoot · Parker's Arcade").
 * One tap starts it, he just talks, Hoot answers out loud in one line + a quick example; tap again (or "bye") to end.
 * Hoot is told what is on the screen (never the answer) through contextual updates.
 * Cost guard: each call ends at 2 minutes (agent setting) and there is a daily cap (learning.js hootVoiceMinPerDay).
 * Button label: "🦉 Ask Hoot" (Mudaber's name for it). Usage: HootVoice.mount(buttonEl, () => 'SCREEN: ...'); HootVoice.screen('SCREEN: ...') when the screen changes.
 */
(function () {
  'use strict';
  var AGENT = 'agent_5001m8226pa4fp08rkff74rhs9tz';
  var LIB = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.35.0/dist/lib.iife.js';
  var KEY = 'pa_hootvoice_v1';
  var conv = null, starting = false, startedAt = 0, btn = null, ctxFn = null, openFn = null, lastCtx = '', libP = null, lastTap = 0;

  function cfg() { return window.__LEARN || {}; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function usage() { var u = null; try { u = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {} return u && u.day === today() ? u : { day: today(), ms: 0 }; }
  function addUsage(ms) { var u = usage(); u.ms += ms; try { localStorage.setItem(KEY, JSON.stringify(u)); } catch (e) {} }
  function capMs() { return (cfg().hootVoiceMinPerDay || 10) * 60000; }
  function log(type, p) { if (window.arcadeLog) window.arcadeLog.event(type, p || {}, { game_key: 'hoot-voice' }); }
  function label(t, live) { if (!btn) return; btn.textContent = t; btn.classList.toggle('live', !!live); }
  function loadLib() {
    if (window.ElevenLabsClient) return Promise.resolve(window.ElevenLabsClient);
    if (!libP) libP = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = LIB; s.onload = function () { res(window.ElevenLabsClient); }; s.onerror = rej; document.head.appendChild(s); });
    return libP;
  }

  function start() {
    if (conv || starting) return;
    if (usage().ms >= capMs()) { label('🦉 Hoot is resting. Back tomorrow!'); log('hoot.voice', { role: 'system', text: 'daily cap reached' }); return; }
    starting = true; label('🦉 Calling Hoot…', true);
    loadLib().then(function (L) {
      return L.Conversation.startSession({
        agentId: AGENT, connectionType: 'websocket',
        dynamicVariables: { opener: (openFn && openFn()) || 'Hoo! Ask me anything.' },
        onConnect: function () { startedAt = Date.now(); log('hoot.voice', { role: 'system', text: 'call started' }); },
        onDisconnect: function () { end(true); },
        onError: function (m) { log('hoot.voice', { role: 'system', text: 'error: ' + String(m).slice(0, 120) }); },
        onModeChange: function (m) { if (conv) label(m && m.mode === 'speaking' ? '🦉 Hoot is talking… (tap to end)' : '🎙️ Listening… (tap to end)', true); },
        onMessage: function (m) { if (m && m.message) log('hoot.voice', { role: m.role || m.source, text: String(m.message).slice(0, 400) }); },
      });
    }).then(function (c) {
      starting = false; conv = c; label('🎙️ Listening… (tap to end)', true);
      sendCtx(true); // only now is the call ready to receive what is on his screen
      // Stay inside today's cap even mid-call.
      var left = Math.max(5000, capMs() - usage().ms); setTimeout(function () { if (conv) stop(); }, Math.min(left, 125000));
    }).catch(function (e) {
      starting = false; conv = null; label('🦉 Hoot could not answer. Try again.'); log('hoot.voice', { role: 'system', text: 'start failed: ' + String(e && e.message || e).slice(0, 120) });
    });
  }
  function end(remote) {
    if (startedAt) { addUsage(Date.now() - startedAt); log('hoot.voice', { role: 'system', text: 'call ended', seconds: Math.round((Date.now() - startedAt) / 1000) }); }
    startedAt = 0; conv = null; starting = false; label('🦉 Ask Hoot');
  }
  function stop() { var c = conv; if (c) { try { c.endSession(); } catch (e) {} } else if (starting) { starting = false; } end(false); }
  function sendCtx(force) {
    var t = ctxFn ? ctxFn() : ''; if (!conv || !t || (!force && t === lastCtx)) return;
    lastCtx = t; try { conv.sendContextualUpdate(t); } catch (e) {}
  }

  window.HootVoice = {
    enabled: function () { return cfg().hootVoice !== false; },
    mount: function (el, fn, opener) {
      btn = el; ctxFn = fn; openFn = opener || null; if (!this.enabled()) { el.style.display = 'none'; return; }
      label('🦉 Ask Hoot');
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var now = Date.now(); if (now - lastTap < 1200) return; lastTap = now; // one tap = one action
        if (conv || starting) stop(); else start();
      });
    },
    screen: function () { sendCtx(false); },
    on: function () { return !!conv; },
  };
})();

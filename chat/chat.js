(function () {
  'use strict';

  var body = document.body;
  var badge = document.getElementById('badge');
  var panel = document.getElementById('panel');
  var collapseBtn = document.getElementById('collapse');
  var messagesEl = document.getElementById('messages');
  var hintEl = messagesEl.querySelector('.hint');
  var form = document.getElementById('composer');
  var input = document.getElementById('input');
  var unreadEl = document.getElementById('unread');

  var STORAGE_KEY = 'parker_chat_log_v2'; // bumped 2026-06-28: start a clean history (prior log cleared on request)
  try { localStorage.removeItem('parker_chat_log_v1'); } catch (e) {} // wipe the old log so removed messages never reappear
  var unread = 0;
  var expanded = false;

  // ─── Persistence (last 50 messages survive a widget reload) ─────────
  function loadLog() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveLog(log) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(-50)));
    } catch (e) {
      /* quota / disabled — fine, in-memory still works */
    }
  }
  var log = loadLog();

  function clearHint() {
    if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
    hintEl = null;
  }

  function renderBubble(entry) {
    clearHint();
    var div = document.createElement('div');
    div.className = 'bubble ' + (entry.who === 'me' ? 'me' : 'them');
    if (entry.state) div.classList.add(entry.state);
    div.textContent = entry.text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  // Replay stored history on load.
  log.forEach(renderBubble);

  // 2026-06-14: removed the hardcoded "3 new games" welcome auto-badge. It badged
  // the red "1" on EVERY load (re-arming whenever localStorage was wiped on an
  // epoch bump), so Parker could never tell a real new message from the stale
  // welcome. The unread badge now means ONLY one thing: a genuine new message has
  // arrived from Mr. Mudabbir (via onMessage below). No new message → no badge.

  function persist(entry) {
    log.push(entry);
    saveLog(log);
  }

  function bumpUnread() {
    if (expanded) return;
    unread += 1;
    unreadEl.textContent = String(unread);
    unreadEl.hidden = false;
  }
  function clearUnread() {
    unread = 0;
    unreadEl.hidden = true;
  }

  // Soft chime on an incoming message (WebAudio, no asset file needed).
  function chime() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch (e) {
      /* audio not available — silent is fine */
    }
  }

  // ─── Expand / collapse ──────────────────────────────────────────────
  function setExpanded(next) {
    expanded = next;
    body.className = next ? 'expanded' : 'collapsed';
    if (window.parkerChat && window.parkerChat.setExpanded) {
      window.parkerChat.setExpanded(next);
    }
    if (next) {
      clearUnread();
      setTimeout(function () { input.focus(); }, 50);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  badge.addEventListener('click', function () { setExpanded(true); });
  collapseBtn.addEventListener('click', function () { setExpanded(false); });

  // ─── Send (Parker → Mudaber) ────────────────────────────────────────
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = '';

    var entry = { who: 'me', text: text, state: 'pending' };
    var el = renderBubble(entry);

    if (!window.parkerChat || !window.parkerChat.send) {
      el.classList.remove('pending');
      el.classList.add('failed');
      return;
    }
    window.parkerChat.send(text).then(function (res) {
      el.classList.remove('pending');
      if (res && res.ok) {
        entry.state = null;
        persist(entry);
      } else {
        el.classList.add('failed');
      }
    }).catch(function () {
      el.classList.remove('pending');
      el.classList.add('failed');
    });
  });

  // ─── Receive (Mudaber → Parker) ─────────────────────────────────────
  if (window.parkerChat && window.parkerChat.onMessage) {
    window.parkerChat.onMessage(function (m) {
      if (!m || !m.text) return;
      var entry = { who: 'them', text: m.text };
      renderBubble(entry);
      persist(entry);
      bumpUnread();
      chime();
    });
  }
})();

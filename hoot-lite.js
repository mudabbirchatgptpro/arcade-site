/* Hoot Lite (redesign 2026-11-22, REDESIGN.md section 5), zero-click version.
 * Parker will not open menus, so Hoot never waits to be asked: every line arrives on its own
 * at a moment he is already looking (a break, the receipt, Home), and the only control is
 * one click on the owl: asleep for the rest of today. Another click wakes him.
 * No microphone, no screenshots, no model. Text first, a short clip only on a real milestone.
 * Pages tell Hoot what is on screen with HootLite.setState({surface, item}); a line prepared
 * for a screen that has since changed is dropped.
 * Silent surfaces (owl hidden): heat, vault, pit, ignition, game.
 * Limits: one unprompted line every 3 min, six a day (receipt aside), 12 words a line.
 */
(function () {
  'use strict';
  var KEY = 'pa_hoot_v1', GAP_MS = 180000, MAX_DAY = 6, MAX_WORDS = 12;
  var SILENT = { heat: 1, vault: 1, pit: 1, ignition: 1, game: 1 };
  var CLIPS = ['react-chat-1', 'react-chat-6', 'react-chat-8', 'react-chat-11']; // "Ooh!", "Ooh, nice.", "Whoa!", "Oho!"

  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    s = s || {};
    if (s.day !== today()) { s.day = today(); s.count = 0; s.lastAt = 0; }
    return s;
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function words(t) { return t.trim().split(/\s+/).length; }
  function log(type, p) { if (window.arcadeLog) window.arcadeLog.event(type, p || {}, { game_key: 'hoot-lite' }); }
  function asleep() { return load().quietDay === today(); }

  var page = { surface: null, item: null };
  var el = {}, hideT = null;

  function mount() {
    if (el.owl) return;
    var css = document.createElement('style');
    css.textContent =
      '#hl-owl{position:fixed;right:18px;bottom:18px;width:58px;height:58px;border-radius:50%;border:0;background:#1b2550;font-size:32px;cursor:pointer;box-shadow:0 8px 24px #0008;z-index:9000}' +
      '#hl-owl.asleep{filter:grayscale(1) brightness(.7)}#hl-owl .z{position:absolute;top:-6px;right:-2px;font-size:16px}' +
      '#hl-bubble{position:fixed;right:86px;bottom:30px;max-width:300px;background:#f2f5ff;color:#0a1030;font:800 16px Nunito,system-ui,sans-serif;padding:12px 16px;border-radius:16px 16px 4px 16px;box-shadow:0 8px 24px #0008;z-index:9000;display:none}';
    document.head.appendChild(css);
    el.owl = document.createElement('button'); el.owl.id = 'hl-owl';
    el.bubble = document.createElement('div'); el.bubble.id = 'hl-bubble';
    document.body.appendChild(el.bubble); document.body.appendChild(el.owl);
    el.owl.addEventListener('click', toggleSleep);
    render();
  }

  function render() {
    if (!el.owl) return;
    var z = asleep();
    el.owl.style.display = SILENT[page.surface] ? 'none' : '';
    if (SILENT[page.surface]) el.bubble.style.display = 'none';
    el.owl.className = z ? 'asleep' : '';
    el.owl.title = z ? 'Hoot is asleep today. Click to wake.' : 'Click to send Hoot to sleep for today.';
    el.owl.innerHTML = '🦉' + (z ? '<span class="z">💤</span>' : '');
  }

  function toggleSleep() {
    var s = load();
    if (s.quietDay === today()) { s.quietDay = null; save(s); render(); log('hoot.wake', {}); return; }
    s.quietDay = today(); save(s); el.bubble.style.display = 'none'; render(); log('hoot.quiet', {});
  }

  function show(text, clip) {
    el.bubble.textContent = text; el.bubble.style.display = 'block';
    clearTimeout(hideT); hideT = setTimeout(function () { el.bubble.style.display = 'none'; }, 7000);
    if (clip) { try { var a = new Audio('/companion/clips/' + clip + '.mp3'); a.play().catch(function () {}); } catch (e) {} }
  }

  // opts: { exempt (receipt), clip: true, forItem, trigger }
  function say(text, opts) {
    opts = opts || {};
    mount();
    var s = load(), why = null;
    if (words(text) > MAX_WORDS) why = 'too_long';
    else if (SILENT[page.surface]) why = 'silent_surface';
    else if (asleep()) why = 'quiet';
    else if ('forItem' in opts && opts.forItem !== page.item) why = 'stale';
    else if (!opts.exempt && (s.count >= MAX_DAY || Date.now() - (s.lastAt || 0) < GAP_MS)) why = 'limit';
    if (why) { log('hoot.drop', { text: text, why: why, trigger: opts.trigger || null }); return false; }
    if (!opts.exempt) { s.count++; s.lastAt = Date.now(); save(s); }
    var clip = opts.clip ? CLIPS[Math.floor(Math.random() * CLIPS.length)] : null;
    show(text, clip);
    log('hoot.line', { text: text, trigger: opts.trigger || null, clip: clip });
    return true;
  }

  window.HootLite = {
    mount: mount,
    say: say,
    setState: function (st) { page = { surface: st.surface || null, item: st.item || null }; render(); },
    // Golds he has not been told about yet. First call ever just records them.
    newGolds: function (ids) {
      var s = load(), first = !s.goldSeen, seen = s.goldSeen || [];
      var fresh = first ? [] : ids.filter(function (id) { return seen.indexOf(id) === -1; });
      s.goldSeen = ids.slice(); save(s);
      return fresh;
    },
    _words: words,
  };
})();

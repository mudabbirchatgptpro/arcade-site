/* Hoot Lite (redesign 2026-11-22, REDESIGN.md section 5).
 * Pit crew, not teacher. Text first, a short clip only on a real milestone.
 * No microphone, no screenshots, no model. Drawn by the page itself.
 * Pages tell Hoot what is on screen with HootLite.setState({surface, item}); a line about
 * anything else, or prepared for a screen that has since changed, is dropped.
 * Silent surfaces (owl hidden): heat, vault, pit, ignition, game.
 * Limits: one unprompted line every 3 min, six a day (receipt aside), 12 words a line.
 * "Quiet today" puts him to sleep until tomorrow; one click on the owl wakes him.
 */
(function () {
  'use strict';
  var KEY = 'pa_hoot_v1', GAP_MS = 180000, MAX_DAY = 6, MAX_WORDS = 12;
  var SILENT = { heat: 1, vault: 1, pit: 1, ignition: 1, game: 1 };
  var CLIPS = ['react-chat-1', 'react-chat-6', 'react-chat-8', 'react-chat-11']; // "Ooh!", "Ooh, nice.", "Whoa!", "Oho!"
  var FAMILY = {
    8: 'Eights: double it, double it, double it.',
    9: 'Nines: ten of them, minus one of them.',
    10: 'Tens: the number with a zero on the end.',
    11: 'Elevens: ten of them, plus one of them.',
    12: 'Twelves: ten of them, plus two of them.',
  };

  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    s = s || {};
    if (s.day !== today()) { s.day = today(); s.count = 0; s.lastAt = 0; s.carded = []; }
    return s;
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function words(t) { return t.trim().split(/\s+/).length; }
  function log(type, p) { if (window.arcadeLog) window.arcadeLog.event(type, p || {}, { game_key: 'hoot-lite' }); }

  var page = { surface: null, item: null };
  var el = {}, hideT = null;

  function mount() {
    if (el.owl) return;
    var css = document.createElement('style');
    css.textContent =
      '#hl-owl{position:fixed;right:18px;bottom:18px;width:58px;height:58px;border-radius:50%;border:0;background:#1b2550;font-size:32px;cursor:pointer;box-shadow:0 8px 24px #0008;z-index:9000}' +
      '#hl-owl.asleep{filter:grayscale(1) brightness(.7)}#hl-owl .z{position:absolute;top:-6px;right:-2px;font-size:16px}' +
      '#hl-bubble{position:fixed;right:86px;bottom:30px;max-width:300px;background:#f2f5ff;color:#0a1030;font:800 16px Nunito,system-ui,sans-serif;padding:12px 16px;border-radius:16px 16px 4px 16px;box-shadow:0 8px 24px #0008;z-index:9000;display:none}' +
      '#hl-menu{position:fixed;right:18px;bottom:86px;background:#121a3a;border-radius:14px;padding:6px;display:none;flex-direction:column;z-index:9001;box-shadow:0 8px 24px #0008}' +
      '#hl-menu button{font:800 15px Nunito,system-ui,sans-serif;color:#f2f5ff;background:none;border:0;text-align:left;padding:9px 14px;border-radius:10px;cursor:pointer}#hl-menu button:hover{background:#ffffff14}';
    document.head.appendChild(css);
    el.owl = document.createElement('button'); el.owl.id = 'hl-owl'; el.owl.title = 'Hoot';
    el.bubble = document.createElement('div'); el.bubble.id = 'hl-bubble';
    el.menu = document.createElement('div'); el.menu.id = 'hl-menu';
    [['hint', 'Hint'], ['explain', 'Explain that'], ['quiet', 'Quiet today'], ['sound', 'Sound off']].forEach(function (b) {
      var x = document.createElement('button'); x.dataset.act = b[0]; x.textContent = b[1]; el.menu.appendChild(x);
    });
    document.body.appendChild(el.bubble); document.body.appendChild(el.menu); document.body.appendChild(el.owl);
    el.owl.addEventListener('click', onOwl);
    el.menu.addEventListener('click', function (e) { var a = e.target.dataset && e.target.dataset.act; if (a) { el.menu.style.display = 'none'; act(a); } });
    document.addEventListener('mousedown', function (e) { if (e.target !== el.owl && !el.menu.contains(e.target)) el.menu.style.display = 'none'; });
    render();
  }

  function render() {
    if (!el.owl) return;
    var s = load(), asleep = s.quietDay === today();
    el.owl.style.display = SILENT[page.surface] ? 'none' : '';
    if (SILENT[page.surface]) { el.bubble.style.display = 'none'; el.menu.style.display = 'none'; }
    el.owl.className = asleep ? 'asleep' : '';
    el.owl.innerHTML = '🦉' + (asleep ? '<span class="z">💤</span>' : '');
    var snd = el.menu.querySelector('[data-act=sound]'); if (snd) snd.textContent = s.soundOff ? 'Sound on' : 'Sound off';
  }

  function onOwl() {
    var s = load();
    if (s.quietDay === today()) { s.quietDay = null; save(s); render(); log('hoot.wake', {}); return show('Awake.', null); }
    el.menu.style.display = el.menu.style.display === 'flex' ? 'none' : 'flex';
  }

  function show(text, clip) {
    el.bubble.textContent = text; el.bubble.style.display = 'block';
    clearTimeout(hideT); hideT = setTimeout(function () { el.bubble.style.display = 'none'; }, 7000);
    if (clip && !load().soundOff) { try { var a = new Audio('/companion/clips/' + clip + '.mp3'); a.play().catch(function () {}); } catch (e) {} }
  }

  // opts: { prompted, exempt (receipt), clip: true, forItem, trigger }
  function say(text, opts) {
    opts = opts || {};
    mount();
    var s = load();
    var why = null;
    if (words(text) > MAX_WORDS) why = 'too_long';
    else if (SILENT[page.surface]) why = 'silent_surface';
    else if (s.quietDay === today()) why = 'quiet';
    else if ('forItem' in opts && opts.forItem !== page.item) why = 'stale';
    else if (!opts.prompted && !opts.exempt && (s.count >= MAX_DAY || Date.now() - (s.lastAt || 0) < GAP_MS)) why = 'limit';
    if (why) { log('hoot.drop', { text: text, why: why, trigger: opts.trigger || null }); return false; }
    if (!opts.prompted && !opts.exempt) { s.count++; s.lastAt = Date.now(); save(s); }
    var clip = opts.clip ? CLIPS[Math.floor(Math.random() * CLIPS.length)] : null;
    show(text, clip);
    log('hoot.line', { text: text, trigger: opts.trigger || null, prompted: !!opts.prompted, clip: clip });
    return true;
  }

  // The pattern for a fact family. Never the answer.
  function pattern(id) {
    var F = window.FactEngine && window.FactEngine.byId(id);
    if (!F) return null;
    if (F.op === 'div') return F.a + ' ÷ ' + F.b + ' asks: ' + F.b + ' times what makes ' + F.a + '?';
    return FAMILY[F.row] || null;
  }

  // A pattern card after a fact is missed twice, once per fact per day.
  function card(id, trigger) {
    var s = load();
    if ((s.carded || []).indexOf(id) !== -1) return false;
    var line = pattern(id);
    if (!line || !say(line, { trigger: trigger || 'missed_twice' })) return false;
    s = load(); s.carded = (s.carded || []).concat([id]); save(s);
    return true;
  }

  var handlers = { hint: null, explain: null };
  function act(a) {
    var s = load();
    if (a === 'quiet') { s.quietDay = today(); save(s); el.bubble.style.display = 'none'; render(); log('hoot.quiet', {}); return; }
    if (a === 'sound') { s.soundOff = !s.soundOff; save(s); render(); return; }
    var fn = handlers[a];
    var line = fn ? fn(page) : null;
    if (!line && a === 'explain' && page.item) line = pattern(page.item);
    say(line || "Nothing to explain here yet.", { prompted: true, trigger: a });
  }

  window.HootLite = {
    mount: mount,
    say: say,
    card: card,
    pattern: pattern,
    setState: function (st) { page = { surface: st.surface || null, item: st.item || null }; render(); },
    state: function () { return { surface: page.surface, item: page.item }; },
    onHint: function (fn) { handlers.hint = fn; },
    onExplain: function (fn) { handlers.explain = fn; },
    // Golds he has not been told about yet. First call ever just records them.
    newGolds: function (ids) {
      var s = load(), first = !s.goldSeen;
      var seen = s.goldSeen || [];
      var fresh = first ? [] : ids.filter(function (id) { return seen.indexOf(id) === -1; });
      s.goldSeen = ids.slice(); save(s);
      return fresh;
    },
    _words: words, _FAMILY: FAMILY, _MAX_WORDS: MAX_WORDS,
  };
})();

// Checks every generated maths answer against an independent computation, and the authored spelling data.
global.window = global; global.localStorage = { _: {}, getItem(k) { return this._[k] || null; }, setItem(k, v) { this._[k] = v; } };
require('../school.js');
const S = window.School; let bad = 0, n = 0;
const num = s => Number(String(s).replace(/,/g, ''));
const near = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
function parse(q) { const m = q.replace(/,/g, '').match(/^([\d.]+) ([×÷]) ([\d.]+)$/); return m && [Number(m[1]), m[2], Number(m[3])]; }
for (const k of Object.keys(S._gen)) for (const lvl of [3, 4, 5, 6]) for (let i = 0; i < 3000; i++) {
  const it = S._gen[k](lvl); n++;
  if (k === 'rem-word' && /eggs a day/.test(it.q)) {
    const [per, days, box] = it.q.match(/\d+/g).map(Number);
    if (num(it.ans) !== Math.floor(per * days / box) || (per * days) % box === 0) { bad++; console.log('BAD', it.q, it.ans); }
    continue;
  }
  if (k === 'rem-word') {
    const nums = it.q.match(/\d+/g).map(Number); const N = nums[0] > nums[1] ? nums[0] : nums[1], d = nums[0] > nums[1] ? nums[1] : nums[0];
    const want = /buses/.test(it.q) ? Math.ceil(N / d) : /FULL/.test(it.q) ? Math.floor(N / d) : N % d;
    if (num(it.ans) !== want || N % d === 0) { bad++; if (bad < 6) console.log('BAD', k, it.q, it.ans, want); }
    continue;
  }
  const p = parse(it.q); if (!p) { bad++; console.log('UNPARSED', k, it.q); continue; }
  if (p[1] === '×') { if (!near(num(it.ans), p[0] * p[2])) { bad++; if (bad < 6) console.log('BAD', k, it.q, it.ans); } }
  else if (it.mode === 'rem') { const [q, r] = it.ans.split(' R ').map(Number); if (q * p[2] + r !== p[0] || r <= 0 || r >= p[2]) { bad++; console.log('BAD', it.q, it.ans); } }
  else if (!near(num(it.ans), p[0] / p[2])) { bad++; if (bad < 6) console.log('BAD', k, it.q, it.ans, p[0] / p[2]); }
  if (!S.check(it, it.ans)) { bad++; console.log('SELF-CHECK FAIL', it.q, it.ans); }
  if (/\.\d*0$/.test(it.ans) || /^0\d/.test(it.ans)) { bad++; console.log('FORMAT', it.ans); }
}
for (const w of S._words) { n++; if (w.c.join('') !== w.w) { bad++; console.log('CHUNKS', w.w, w.c); } if (w.bad === w.w) { bad++; console.log('SAME', w.w); } if (w.m >= w.c.length) { bad++; console.log('M', w.w); } }
for (const b of S._builds) { n++; if (!/^[a-z]+$/.test(b[2])) { bad++; console.log('BUILD', b); } }
const cases = [['rem', '207 R 12', '207r12'], ['rem', '1,207 r 3', '1207r3'], ['num', '0.940', '0.94'], ['num', '.5', '0.5'], ['num', '3,600', '3600'], ['text', ' Receive ', 'receive'], ['num', '007', '7']];
for (const [m, a, want] of cases) { n++; if (S.norm(a, m) !== want) { bad++; console.log('NORM', m, a, S.norm(a, m), want); } }
for (let i = 0; i < 2000; i++) { const it = S.next(); n++; if (!it.q || it.ans == null || !it.steps || !it.steps.length) { bad++; console.log('ITEM', it); break; } if (it.steps.some(s => /undefined|NaN/.test(s))) { bad++; console.log('STEP', it.q, it.steps); break; } }
// Guided steps: present, well formed, and consistent with the answer.
for (const k of Object.keys(S._gen)) for (const lvl of [3, 4, 5, 6]) for (let i = 0; i < 2000; i++) {
  const it = S._gen[k](lvl); n++;
  if (!it.guide || !it.guide.length || !it.finalPrompt) { bad++; console.log('NO GUIDE', k, it.q); continue; }
  if (it.guide.some(g => !g.p || g.a == null || /undefined|NaN/.test(g.p + g.a))) { bad++; console.log('GUIDE BAD', k, it.q, JSON.stringify(it.guide)); }
  if (k === 'long-div') { const digits = it.guide.filter(g => /How many/.test(g.p)).map(g => g.a).join(''); if (Number(digits) !== Number(it.ans.split(' R ')[0])) { bad++; console.log('DIV GUIDE', it.q, digits, it.ans); } }
  if (k === 'dec-mul') { const p = parse(it.q); const ai = Number(String(p[0]).replace('.', '')), bi = Number(String(p[2]).replace('.', '')); if (Number(it.guide[0].a) !== ai * bi) { bad++; console.log('MUL GUIDE', it.q, it.guide[0].a); } }
  if (k === 'dec-div' && lvl === 3 && it.q.split(' ÷ ')[0].indexOf('.') < 0) { bad++; console.log('NO POINT', it.q); }
}
const G = S._g;
for (const y of G.agreement.items) { n++; if (!y.subj || !y.s.toLowerCase().includes(y.subj)) { bad++; console.log('AGREE SUBJ', y.s, y.subj); } }
for (const y of G.pronoun.items) { n++; if (!y.g || !y.g.a) { bad++; console.log('PRON', y.s); } }
for (const y of G.fragrun.items) { n++; if (y.n == null || (y.a === 'f') !== (y.n === 0)) { bad++; console.log('FRAG', y.s, y.n, y.a); } }
for (let i = 0; i < 3000; i++) { const it = S.next(); n++; if (it.skill !== 'spell' && it.skill in S._g && (!it.guide || !it.guide.length)) { bad++; console.log('NO G GUIDE', it.skill, it.q); break; } if (it.skill === 'spell' && it.guide == null) { bad++; console.log('NO SPELL GUIDE', it.q); break; } }
// Micro questions: answers recomputed independently.
global.__scaffoldAll = true;
for (const k of ['dec-mul', 'dec-div', 'long-div', 'zeros-div', 'rem-word']) for (const lvl of [3, 4, 5, 6]) for (let i = 0; i < 1500; i++) {
  const x = S._st(k); x.scaffold = true; x.i = Math.min(lvl - 3, (S._skills[k].levels || [0]).length - 1);
  let it; do { it = S.next(); } while (it.skill !== k); n++;
  if (!it.micro) { bad++; console.log('NOT MICRO', k); break; }
  const nums = (it.q + ' ' + it.sub).replace(/,/g, '').match(/\d+(\.\d+)?/g).map(Number);
  if (k === 'dec-mul') { const [a, b] = it.q.split(' × '); const pl = (a.split('.')[1] || '').length + (b.split('.')[1] || '').length;
    const want = /WHOLE-number/.test(it.sub) ? String(Math.floor(Math.round(Number(a) * Number(b) * 1e6) / 1e6)) : String(pl); if (want !== it.ans) { bad++; console.log('MICRO', it.q, it.sub.slice(0, 30), it.ans, want); } }
  if (k === 'long-div') { const m = it.q.match(/How many (\d+)s fit into (\d+)/); const d = +m[1], c = +m[2], a = +it.ans; if (!(a * d <= c && (a + 1) * d > c && c >= d)) { bad++; console.log('MICRO', it.q, it.ans); } }
  if (k === 'zeros-div') { const [A, B] = it.q.replace(/,/g, '').split(' ÷ '); const z = Math.min(A.match(/0*$/)[0].length, B.match(/0*$/)[0].length); if (String(z) !== it.ans) { bad++; console.log('MICRO', it.q, it.ans); } }
  if (k === 'dec-div') { const [D, d] = it.q.replace(/,/g, '').split(' ÷ '); const sh = (d.split('.')[1] || '').length;
    const want = /places/.test(it.sub) ? String(sh) : /dividing BY/.test(it.sub) ? String(Math.round(Number(d) * 10 ** sh)) : /dividing \(/.test(it.sub) ? String(Math.round(Number(D) * 10 ** sh * 1000) / 1000) : String(Math.round(Number(D) / Number(d)));
    if (want !== it.ans) { bad++; console.log('MICRO', it.q, it.sub.slice(0, 40), it.ans, want); } }
  if (k === 'rem-word') { const m = it.q.match(/(\d+) ÷ (\d+) = (\d+) R (\d+)/); const N = +m[1], d = +m[2], q = +m[3], r = +m[4]; if (q * d + r !== N) { bad++; console.log('MICRO R', it.q); } const want = /buses/.test(it.q) ? q + 1 : /FULL/.test(it.q) ? q : r; if (String(want) !== it.ans) { bad++; console.log('MICRO', it.q, it.ans); } }
  x.scaffold = false;
}
console.log(n, 'checks,', bad, 'problems'); process.exit(bad ? 1 : 0);

// Checks every generated maths answer against an independent computation, and the authored spelling data.
global.window = global; global.localStorage = { _: {}, getItem(k) { return this._[k] || null; }, setItem(k, v) { this._[k] = v; } };
require('../school.js');
const S = window.School; let bad = 0, n = 0;
const num = s => Number(String(s).replace(/,/g, ''));
const near = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
function parse(q) { const m = q.replace(/,/g, '').match(/^([\d.]+) ([×÷]) ([\d.]+)$/); return m && [Number(m[1]), m[2], Number(m[3])]; }
for (const k of Object.keys(S._gen)) for (const lvl of [3, 4, 5]) for (let i = 0; i < 3000; i++) {
  const it = S._gen[k](lvl); n++;
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
console.log(n, 'checks,', bad, 'problems'); process.exit(bad ? 1 : 0);

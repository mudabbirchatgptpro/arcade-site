// Checks focus.js before it is pushed: known skills only, sane weights, a version, and that the engine
// actually serves the weighted skills (2,000 simulated boss picks). Exit 1 on any problem.
global.window = global; global.localStorage = { _: {}, getItem(k) { return this._[k] || null; }, setItem(k, v) { this._[k] = v; } };
require('../learning.js'); require('../focus.js'); require('../school.js');
const F = window.__FOCUS, S = window.School; let bad = 0; const fail = (m) => { bad++; console.log('FAIL', m); };
if (!F || !F.version || !F.updated || !F.why) fail('focus.js needs version, updated and why');
const known = Object.keys(S._skills);
for (const [k, w] of Object.entries(F.weights || {})) {
  if (!known.includes(k)) fail('unknown skill in weights: ' + k + ' (known: ' + known.join(', ') + ')');
  if (typeof w !== 'number' || w < 0 || w > 100) fail('weight for ' + k + ' must be a number 0-100');
}
const total = Object.values(F.weights || {}).reduce((a, b) => a + b, 0); if (!total) fail('all weights are 0');
for (const w of F.words || []) { // optional extra spelling words from Gretchen: { w, d, c: [chunks], m, bad, r }
  if (!w.w || !w.d || !Array.isArray(w.c) || w.c.join('') !== w.w || w.m == null || w.m >= w.c.length) fail('bad word entry: ' + JSON.stringify(w));
}
const seen = {}; for (let i = 0; i < 2000; i++) { const it = S.next(); seen[it.skill] = (seen[it.skill] || 0) + 1; }
const top = Object.entries(F.weights).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
for (const k of top) if (!seen[k]) fail('top-weighted skill never served: ' + k);
console.log('focus', F.version, '| served (2000 picks):', Object.entries(seen).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + Math.round(n / 20) + '%').join(', '));
console.log(bad ? bad + ' problems' : 'FOCUS OK'); process.exit(bad ? 1 : 0);

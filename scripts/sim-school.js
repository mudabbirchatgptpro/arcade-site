// Mastery and anti-inflation checks for school.js with a fake clock.
global.window = global; global.localStorage = { _: {}, getItem(k) { return this._[k] || null; }, setItem(k, v) { this._[k] = v; } };
let now = Date.UTC(2026, 10, 23, 15); const realNow = Date.now; Date.now = () => now;
require('../school.js'); const S = window.School; let bad = 0; const fail = m => { bad++; console.log('FAIL', m); };
// 1. A learner who is always right: climbs fast, but nothing is MASTERED until recall checks pass on later days.
const seen = {};
for (let day = 0; day < 30; day++) { for (let i = 0; i < 60; i++) { const it = S.next(); seen[it.skill] = 1; S.record(it, true, {}); now += 20000; }
  if (day === 0) { const ms = Object.keys(S._skills).filter(k => k !== 'spell' && S._mastered(k)); if (ms.length) fail('mastered on day 1: ' + ms); }
  now += 86400000 - 60 * 20000; }
const notMastered = Object.keys(S._skills).filter(k => k !== 'spell' && !S._mastered(k));
if (notMastered.length) fail('perfect learner not mastered after 30 days: ' + notMastered);
if (Object.keys(seen).length !== Object.keys(S._skills).length) fail('skills never served: ' + Object.keys(S._skills).filter(k => !seen[k]));
// 2. Fail a recall check: drops back to that level and loses the pass.
const k = 'dec-mul', x = S._st(k); x.passed[0] = { at: now, step: 0, due: now - 1, days: [], mastered: false }; x.i = 2;
S.record({ skill: k, review: true, lvlIndex: 0, level: 3, lvlCount: 3, q: '', ans: '' }, false, {});
if (x.i !== 0 || x.passed[0]) fail('failed recall did not send him back');
// 3. Two misses in three steps down; four right in a row steps up.
const y = S._st('agreement'); y.i = 1; y.run = [];
['t', 'f', 'f'].forEach(r => S.record({ skill: 'agreement', review: false, lvlIndex: 1, lvlCount: 3, q: '', ans: '' }, r === 't', {}));
if (y.i !== 0) fail('2 misses in 3 did not step down, i=' + y.i);
for (let i = 0; i < 4; i++) S.record({ skill: 'agreement', review: false, lvlIndex: 0, lvlCount: 3, q: '', ans: '' }, true, {});
if (y.i !== 1 || !y.passed[0]) fail('4 right did not push up');
// 4. Guessing is worth nothing on choice items (expected fuel <= 0).
let ev = 0, n = 0;
for (let i = 0; i < 20000; i++) { const it = S.next(); if (!it.k) continue; n++; ev += (1 / it.k) * it.value - (1 - 1 / it.k) * it.penalty; }
if (n && ev / n > 0.5) fail('guessing pays on average: ' + (ev / n).toFixed(2) + ' s');
console.log('choice items checked:', n, 'average fuel per pure guess:', (ev / Math.max(1, n)).toFixed(2), 's');
console.log(bad ? bad + ' problems' : 'ALL CHECKS PASS'); process.exit(bad ? 1 : 0);

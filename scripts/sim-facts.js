// Simulates a child against facts.js. Checks: no dead end, no fact twice in a row,
// a missed fact returns within 2 picks, the grid moves, spacing brings gold facts back.
// Run: node scripts/sim-facts.js
require('../facts.js');
const E = globalThis.FactEngine;
let fail = 0;
const check = (c, msg) => { if (!c) { fail++; console.log('FAIL', msg); } };

let t = Date.UTC(2026, 10, 22, 15, 0, 0);
E._setNow(() => t);

// Child: knows 70% of facts fluently, 20% slowly, 10% not at all (fixed per fact).
const kind = {};
E.FACTS.forEach((f, i) => { kind[f.id] = i % 10 < 7 ? 'fast' : i % 10 < 9 ? 'slow' : 'gap'; });

function play(n, day) {
  let last = null, missAt = null, missId = null;
  for (let i = 0; i < n; i++) {
    const f = E.pick();
    check(!!f, `day ${day} pick ${i}: dead end`);
    if (!f) return;
    check(f.id !== last, `day ${day} pick ${i}: ${f.id} twice in a row`);
    if (missId && f.id === missId) missId = null;
    if (missId && i - missAt > 2) { check(false, `day ${day}: missed ${missId} not back within 2 picks`); missId = null; }
    const k = kind[f.id];
    let ok = true, fk = 1500, tot = 2200;
    if (k === 'slow') { fk = 4200; tot = 5200; }
    if (k === 'gap') { ok = Math.random() < 0.3; fk = 5000; tot = 7000; }
    E.record(f.id, ok, { firstKeyMs: fk, totalMs: tot, surface: 'sim' });
    if (!ok) { missId = f.id; missAt = i; }
    last = f.id;
    t += 5000;
  }
}

for (let day = 1; day <= 5; day++) {
  play(500, day);
  const c = E.counts();
  console.log(`day ${day}:`, JSON.stringify(c));
  if (day === 1) check(c.fluent > 0, 'no fluent cells after day 1');
  t += 86400000;
}
const c = E.counts();
check(c.gold > 0, 'no gold cells after 5 days');
check(c.grey === 0, 'some facts never asked in 2500 picks');
console.log(fail ? `${fail} FAILURES` : 'ALL CHECKS PASS');
process.exit(fail ? 1 : 0);

// Generates data/questions-facts.json from games/fact-sprint/drills.json (operations, tables, multipliers): with the
// default 8..12 x 1..12 that is 120 questions (60 multiplication + 60 matching division). Same schema as
// data/questions-maths.json plus set:"facts" (the manifest questions.mix weights on `set`). Run by build-bank.js.
// Distractors are real fact mistakes: neighbouring products, off-by-one row, wrong operation. Deterministic.
const fs = require("fs"), path = require("path");
const L = ["A", "B", "C", "D"];
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "games", "fact-sprint", "drills.json"), "utf8"));
const kinds = (D.operations || ["mul", "div"]).filter(k => k === "mul" || k === "div");
const out = [];
for (const a of D.tables) for (let b = D.multipliers.from; b <= D.multipliers.to; b++) {
  const p = a * b;
  const diff = p <= 40 ? 1 : p <= 90 ? 2 : 3;
  const mulPool = [a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b, a + b, a * (b + 2), a * (b - 2)];
  const divPool = [b + 1, b - 1, a, p - a, b + 2, b - 2, b + 3];
  for (const kind of kinds) {
    const ans = kind === "mul" ? p : b;
    const pool = [...new Set((kind === "mul" ? mulPool : divPool).filter(x => x > 0 && x !== ans))];
    const wrong = pool.slice(0, 3);
    const i = out.length;
    const correctIdx = (a * 7 + b * 3 + (kind === "div" ? 1 : 0)) % 4;
    const opts = wrong.slice(); opts.splice(correctIdx, 0, ans);
    out.push({
      id: kind === "mul" ? `fact-m-${a}x${b}` : `fact-d-${p}-${a}`,
      type: "book_mcq", set: "facts", subject: "maths",
      topic: kind === "mul" ? "fact-multiplication" : "fact-division",
      topicLabel: kind === "mul" ? "Multiplication facts" : "Division facts",
      stem: kind === "mul" ? `${a} × ${b} = ?` : `${p} ÷ ${a} = ?`,
      choices: Object.fromEntries(opts.map((v, k) => [L[k], String(v)])),
      correct: L[correctIdx],
      learning_objective: `${a} × ${b} = ${p}, so ${p} ÷ ${a} = ${b}.`,
      difficulty: diff, source: "fact_fluency_v1", phase: "curriculum", _o: p * 10 + (kind === "div" ? 1 : 0),
    });
  }
}
out.sort((x, y) => x.difficulty - y.difficulty || x._o - y._o);
out.forEach((q, i) => { q.order_within_page = i; delete q._o; });
fs.writeFileSync(path.join(__dirname, "..", "data", "questions-facts.json"), JSON.stringify({ mode: "facts", total: out.length, questions: out }, null, 1));
console.log("facts:", out.length);

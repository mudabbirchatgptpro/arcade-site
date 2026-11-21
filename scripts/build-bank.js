// Builds questions/bank.json (what the kiosk picks from) from data/questions-{english,maths}.json:
// text-only (no diagram), interleaved english/maths, easy first. Edit the source files, run this, commit, push = live.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const load = m => JSON.parse(fs.readFileSync(path.join(root, "data", `questions-${m}.json`), "utf8")).questions
  .filter(q => !q.diagram_path)
  .map((q, i) => ({ q: { ...q, subject: q.subject || m, set: q.set || q.subject || m }, i, d: typeof q.difficulty === "number" ? q.difficulty : 99 }))
  .sort((a, b) => a.d - b.d || a.i - b.i).map(x => x.q);
require("./gen-facts.js"); // regenerate fact questions from games/fact-sprint/drills.json first
const en = load("english"), ma = load("maths"), facts = load("facts"), out = [];
for (let i = 0; i < Math.max(en.length, ma.length); i++) { if (en[i]) out.push(en[i]); if (ma[i]) out.push(ma[i]); }
// every question carries a `set` (english / maths / facts ...); the shell weights sets by manifest questions.mix. Facts go last.
out.push(...facts);
fs.mkdirSync(path.join(root, "questions"), { recursive: true });
fs.writeFileSync(path.join(root, "questions", "bank.json"), JSON.stringify({ version: new Date().toISOString().slice(0, 10), total: out.length, questions: out }));
console.log("bank questions:", out.length);
// the kiosk fetches the manifest at /api/v1/manifest (same path as the old control plane); /manifest.json is the public copy
fs.mkdirSync(path.join(root, "api", "v1"), { recursive: true });
fs.copyFileSync(path.join(root, "manifest.json"), path.join(root, "api", "v1", "manifest"));

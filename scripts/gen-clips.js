#!/usr/bin/env node
"use strict";
// Pre-records Hoot's expressive clips (ElevenLabs eleven_v3) into companion/clips/ + index.json.
// Usage: ELEVENLABS_API_KEY=... node scripts/gen-clips.js [--dry]
// The key comes from the environment only and is never written anywhere. Existing mp3s are skipped.
// Content is public: reactions, praise, math-fact questions and the focus tricks. No child data.
const fs = require("fs"), path = require("path");
const KEY = process.env.ELEVENLABS_API_KEY || "";
const VOICE = process.env.CLIP_VOICE_ID || "bIHbv24MWmeRgasZH58o"; // Will - Relaxed Optimist
const MODEL = process.env.CLIP_MODEL_ID || "eleven_v3";
const DRY = process.argv.includes("--dry");
const root = path.join(__dirname, "..", "companion"), outDir = path.join(root, "clips");

const ONES = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
function words(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + words(n % 100) : "");
}
function questionText(id) {
  let m = /^fact-m-(\d+)x(\d+)$/.exec(id);
  if (m) return `${words(+m[1])} times ${words(+m[2])}?`;
  m = /^fact-d-(\d+)-(\d+)$/.exec(id);
  if (m) return `${words(+m[1])} divided by ${words(+m[2])}?`;
  return null;
}

const clips = []; // {key, text (spoken, clean), send (with tags)}
const add = (key, send) => clips.push({ key, send, text: send.replace(/\[[^\]]*\]\s*/g, "").trim() });

["Hmm...", "Wait, wait...", "Okay okay...", "Mm-hm...", "Hold on...", "Ahh, okay...", "Let me see...", "[curious] Hmm, interesting..."]
  .forEach((t, i) => add(`react-think-${i + 1}`, t));
["[excited] Ooh!", "Ha!", "Ooh, good one.", "[laughs] Ha ha ha!", "Oh, really?", "Ooh, nice.", "[laughs] Ha! Okay.", "[excited] Whoa!", "[curious] Ooh, go on.", "Interesting...", "Oho!", "[laughs] Ha ha, okay."]
  .forEach((t, i) => add(`react-chat-${i + 1}`, t));
["[excited] Boom! Nailed it.", "Yes! That's the one.", "[excited] Ooh, you're quick!", "Right on the money.", "Look at you go!", "Smooth. Super smooth.", "[laughs] Yes yes yes! Brain on fire.", "Owl be darned, you got it.", "[excited] That's it! Easy for you.", "Correct, and not even breaking a sweat.",
 "[laughs] Ha! Too fast for me.", "Bingo!", "[excited] Yes! You've got that one locked in.", "Nice. My feathers are impressed.", "That's the answer. Show-off.", "Whoa, okay, mathematician.", "Perfect. Do it again.", "[laughs] Okay, okay, I see you.", "Yes! Gold star for you.", "Cha-ching. That's right."]
  .forEach((t, i) => add(`praise-${i + 1}`, t));
["Ooh, so close. Try once more.", "Almost! Give it another go.", "Hmm, not quite. Want another shot?", "Close, but not that one. Try again.", "[curious] Ooh, tricky one. One more try.", "Not this time. Take another look.", "So close I can feel it. Again?", "Mm, not quite. You've got this.", "That one's sneaky. Try it again.", "Almost there. Have another go."]
  .forEach((t, i) => add(`notquite-${i + 1}`, t));

const focus = JSON.parse(fs.readFileSync(path.join(root, "focus.json"), "utf8"));
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "questions", "bank.json"), "utf8")).questions;
const factIds = [...new Set([...focus.facts.map(f => f.id), ...bank.filter(q => q.set === "facts").map(q => q.id)])];
for (const id of factIds) { const t = questionText(id); if (t) add(`q-${id}`, t); else console.warn("no question text for", id); }
const tricks = { ...(focus.tricks || {}) };
for (const f of focus.facts) if (f.trick) tricks[f.id] = f.trick;
for (const [id, t] of Object.entries(tricks)) add(`trick-${id}`, t);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function synth(c) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_64`, {
      method: "POST", headers: { "xi-api-key": KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: c.send, model_id: MODEL, voice_settings: { stability: 0.5 } }) });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 429 || r.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
    throw new Error(`${c.key}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  }
  throw new Error(`${c.key}: gave up after retries`);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const index = {}; let chars = 0, made = 0, skipped = 0;
  for (const c of clips) {
    const file = `${c.key}.mp3`, p = path.join(outDir, file);
    index[c.key] = { file, text: c.text };
    if (fs.existsSync(p) && fs.statSync(p).size > 500) { skipped++; continue; }
    if (DRY) { chars += c.send.length; made++; continue; }
    if (!KEY) { console.error("ELEVENLABS_API_KEY not set"); process.exit(1); }
    fs.writeFileSync(p, await synth(c)); chars += c.send.length; made++;
    process.stdout.write(`\r${made + skipped}/${clips.length} ${c.key}      `);
    await sleep(350);
  }
  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 1) + "\n");
  console.log(`\n${DRY ? "DRY " : ""}clips total=${clips.length} generated=${made} skipped=${skipped} characters sent=${chars} model=${MODEL}`);
})().catch(e => { console.error(e.message); process.exit(1); });

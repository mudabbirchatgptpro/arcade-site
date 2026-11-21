# Changing content

After any change below: `node scripts/build-bank.js`, then commit and push. The build also regenerates the fact questions and copies `manifest.json` to `api/v1/manifest`. Bump `version` in `manifest.json` whenever you edit it. The kiosk picks changes up within a few minutes.

| I want to... | Edit this file |
|---|---|
| Change today's focus text, tables, operations, round length, slow threshold | `games/fact-sprint/drills.json` (`focus`, `tables`, `multipliers`, `operations`, `roundSeconds`, `slowMs`). The build turns the same tables into the break fact questions. |
| Drill other things (vocabulary, capitals, anything with a prompt and an answer) | `games/fact-sprint/drills.json`, `items`: `[{"prompt": "...", "answer": "..."}]` plus `itemsLabel` for the button name. Appears as an extra round type. Text answers are typed and checked ignoring case. |
| Add or edit ordinary break questions | `data/questions-english.json` or `data/questions-maths.json` (same fields as the existing entries; an entry may add `"set": "name"`). |
| Add a new question set (e.g. vocabulary) to the breaks | New `data/questions-<name>.json`, add `<name>` to the `load(...)` list in `scripts/build-bank.js`, give each question `"set": "<name>"`, then give it a share in the manifest mix. |
| Change how many break questions are facts vs other | `manifest.json` > `questions.mix`, e.g. `{ "facts": 0.5 }`. Set names map to shares of each batch (0 to 1, total at most 1, 0 switches a set off). Sets not named share the rest. `questions.batchSize` is the batch size. |
| Change how often a question break comes | `manifest.json` > `breaks`: `minMs` is the earliest, `idealMs` starts looking for a quiet moment, `hardMaxMs` forces the break (give it 2 s of slack). Do not add `studyBreakIntervalMs` to a game; it overrides the global timing. |
| Add or remove a game | `manifest.json` > `games` (copy an existing entry; order = order in the grid, `featured: true` shows it first). Self-hosted games live in `games/<name>/` with `"type": "selfhosted"` and an `indexPath`. Remove an entry (or set `"enabled": false`) to hide it. Then copy the games array into `games-data.json` (it mirrors the manifest). |

Checks before pushing: `cd ../parker-arcade-shell-v2 && npm test`, and to validate the manifest: `node -e "const r=require('./dist-electron/control.js').validateManifest(require('../arcade-site/manifest.json')); console.log(r.ok||r.errors)"`.

/* Difficulty dial for Parker's learning (changed from Mudaber's side; push the site and it applies on his next stop).
 * pace 1 = gentle, 2 = push, 3 = hard. Each pace sets the values below; any value can also be set directly.
 *   stepUp            right answers in a row to move up a level
 *   minLevel          lowest level any skill can sit at (0 = the first level; maths has 4 levels, grammar 3)
 *   fluentFirstKeyMs  a fact only counts as FAST if he starts typing within this many ms ...
 *   fluentTotalMs     ... and finishes within this many ms
 *   bossShare         chance a stop includes a boss (school) question, rising to 0.85 as facts get fluent
 *   bossPerStop       most boss questions in one stop
 */
(function () {
  var PACE = 2; // ← the dial (2026-11-22: Mudaber asked for more challenge)
  var BY_PACE = {
    1: { stepUp: 4, minLevel: 0, fluentFirstKeyMs: 3000, fluentTotalMs: 5000, bossShare: 0.25, bossPerStop: 1 },
    2: { stepUp: 3, minLevel: 1, fluentFirstKeyMs: 2500, fluentTotalMs: 4000, bossShare: 0.45, bossPerStop: 2 },
    3: { stepUp: 2, minLevel: 2, fluentFirstKeyMs: 2000, fluentTotalMs: 3500, bossShare: 0.65, bossPerStop: 2 },
  };
  var cfg = BY_PACE[PACE] || BY_PACE[2];
  cfg.pace = PACE;
  cfg.hootMic = true; // 📞 Call Hoot (hold to talk, ElevenLabs speech-to-text + voice). Mudaber turned it on 2026-11-22. false = typing only
  window.__LEARN = cfg;
})();

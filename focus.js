/* Daily learning focus (edit this file to change what Parker works on; live at his next stop, no app update).
 * weights: how often each skill comes up as a boss question (bigger = more). Gretchen's order: facts (always, every stop),
 *   then class maths, then spelling, then grammar. 0 switches a skill off.
 * updated / why: say who asked for it, so the change is traceable.
 */
window.__FOCUS = {
  version: '2026-11-22b',
  updated: '2026-11-22',
  why: 'Gretchen: class maths first (decimal ÷ was 0/4 today; long division never came up). Fable audit 2026-11-22.',
  weights: {
    'dec-div': 26, 'long-div': 22, 'dec-mul': 16, 'rem-word': 8, 'zeros-div': 3,
    spell: 12,
    sentence: 3, subject: 1, agreement: 2, pronoun: 1, fragrun: 2, verbals: 2, voice: 1, irregular: 1,
  },
};

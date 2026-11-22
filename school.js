/* School items for charge stops (redesign 2026-11-22).
 * Priority (Gretchen first): 1 facts fluency (facts.js) 2 what class is on: decimal x decimal (4-5, his 56%),
 * long division by 2-digit divisors (Topic 5), dividing decimals (Topic 6), remainder word problems
 * 3 spelling by chunks and rules 4 sentence structure (simple / compound / complex / compound-complex, hidden "you").
 * Always pitched hard (levels 3-5, start at 4); a miss shows the full breakdown, he types the answer
 * (spelling: twice) and the skill steps down one level. Two right in a row steps it up.
 * Maths items are generated, so every answer is computed, never typed by hand.
 */
(function (root) {
  'use strict';
  var KEY = 'pa_school_v1';
  var mem = null;
  function load() {
    if (mem) return mem;
    try { mem = JSON.parse(root.localStorage.getItem(KEY) || 'null'); } catch (e) { mem = null; }
    mem = mem || { skills: {}, words: {}, gram: {}, last: null };
    return mem;
  }
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {} }
  var R = function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); };
  var pickOf = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var fmtInt = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };

  // Exact decimals as integer + scale (value = i / 10^s), so no float errors.
  function dec(i, s) { return { i: i, s: s }; }
  function dstr(d) {
    var neg = d.i < 0, str = String(Math.abs(d.i));
    if (d.s === 0) return (neg ? '-' : '') + str;
    while (str.length <= d.s) str = '0' + str;
    var out = str.slice(0, str.length - d.s) + '.' + str.slice(str.length - d.s);
    out = out.replace(/0+$/, '').replace(/\.$/, '');
    return (neg ? '-' : '') + out;
  }
  function dPlaces(d) { var t = dstr(d); return t.indexOf('.') < 0 ? 0 : t.length - t.indexOf('.') - 1; }

  // ── Maths generators: {q, ans, accept(fn), steps[], value, mode} ──
  // Each generator returns the question, the answer, steps (the full worked solution, shown only as a last
  // resort) and guide: the steps HE answers after a miss, so he rebuilds the method instead of copying.
  var GEN = {
    'dec-mul': function (lvl) { // Topic 4-5: multiply a decimal by a decimal
      var a, b;
      if (lvl <= 3) { a = dec(R(12, 98), 1); b = dec(R(13, 89), 0); }
      else if (lvl === 4) { a = dec(R(12, 98), 1); b = dec(R(12, 98), 1); }
      else if (lvl === 5) { a = dec(R(102, 989), 2); b = pickOf([dec(R(2, 9), 2), dec(R(12, 89), 1), dec(R(3, 9), 1)]); }
      else { a = dec(R(102, 989), 2); b = dec(R(12, 98), 2); } // level 6: e.g. 3.47 × 0.58 (4 decimal places)
      if (a.i % 10 === 0) a.i += 3; if (b.i % 10 === 0 && b.s) b.i += 1;
      var p = dec(a.i * b.i, a.s + b.s), ans = dstr(p), q = dstr(a) + ' × ' + dstr(b), pl = a.s + b.s;
      return {
        q: q, ans: ans, mode: 'num', value: 30,
        guide: [
          { p: 'Forget the points for now. What is ' + a.i + ' × ' + b.i + '?', a: String(a.i * b.i), why: a.i + ' × ' + b.i + ' = ' + fmtInt(a.i * b.i) + '.' },
          { p: dstr(a) + ' has ' + a.s + ' digit' + (a.s === 1 ? '' : 's') + ' after the point and ' + dstr(b) + ' has ' + b.s + '. How many digits go after the point in the answer?', a: String(pl), why: 'Add them: ' + a.s + ' + ' + b.s + ' = ' + pl + '.' },
        ],
        finalPrompt: 'Put the point ' + pl + ' place' + (pl > 1 ? 's' : '') + ' in from the right of ' + (a.i * b.i) + '. So ' + q + ' = ?',
        steps: ['Ignore the points: ' + a.i + ' × ' + b.i + ' = ' + fmtInt(a.i * b.i) + '.',
          'Count decimal places: ' + a.s + ' + ' + b.s + ' = ' + pl + '.',
          'Put the point ' + pl + ' place' + (pl > 1 ? 's' : '') + ' in from the right: ' + ans + '.'],
      };
    },
    'long-div': function (lvl) { // Topic 5: divide by 2-digit divisors
      var d, q, r = 0;
      if (lvl <= 3) { d = R(21, 49); q = R(13, 39); }
      else if (lvl === 4) { d = R(23, 89); q = pickOf([R(101, 109), R(201, 209), R(301, 309), R(401, 409), R(110, 190)]); }
      else if (lvl === 5) { d = R(31, 97); q = R(120, 890); r = R(1, d - 1); }
      else { d = R(41, 98); q = R(1, 9) * 1000 + R(0, 9) * 10 + R(1, 9); r = R(1, d - 1); } // level 6: 4-digit answer with a 0 inside, plus a remainder
      if (d % 10 === 0) d += 3;
      var D = d * q + r;
      return {
        q: fmtInt(D) + ' ÷ ' + d, ans: r ? q + ' R ' + r : String(q), mode: r ? 'rem' : 'num', value: r ? 40 : 30,
        hint: r ? 'Answer like 207 R 12' : '', steps: divSteps(D, d), guide: divGuide(D, d),
        finalPrompt: 'Read your digits from the top' + (r ? ', then the last thing left is the remainder' : '') + '. So ' + fmtInt(D) + ' ÷ ' + d + ' = ?',
      };
    },
    'dec-div': function (lvl) { // Topic 6: divide decimals
      var q, dv, D, g = 0;
      if (lvl <= 3) {
        do { q = dec(R(21, 99), 1); if (q.i % 10 === 0) q.i += 1; dv = R(12, 48); D = dec(q.i * dv, 1); } while (D.i % 10 === 0 && ++g < 50);
        var qs3 = dstr(D) + ' ÷ ' + dv;
        return { q: qs3, ans: dstr(q), mode: 'num', value: 30,
          guide: [{ p: 'Divide as if the point were not there: ' + fmtInt(D.i) + ' ÷ ' + dv + ' = ?', a: String(q.i), why: fmtInt(D.i) + ' ÷ ' + dv + ' = ' + q.i + '.' },
            { p: 'How many digits come after the point in ' + dstr(D) + '?', a: '1', why: 'One: the ' + String(D.i).slice(-1) + '.' }],
          finalPrompt: 'The point goes straight up: the answer also has 1 digit after the point. So ' + qs3 + ' = ?',
          steps: ['Divide as if there were no point: ' + fmtInt(D.i) + ' ÷ ' + dv + ' = ' + q.i + '.', 'The point goes straight up into the answer: ' + dstr(q) + '.'] }; }
      if (lvl === 4) { q = R(12, 86); dv = dec(R(12, 89), 2); if (dv.i % 10 === 0) dv.i += 1; D = dec(q * dv.i, 2);
        var qs4 = dstr(D) + ' ÷ ' + dstr(dv);
        return { q: qs4, ans: String(q), mode: 'num', value: 30,
          guide: [{ p: 'Make the divisor a whole number: move the point in ' + dstr(dv) + ' 2 places right. What is it now?', a: String(dv.i), why: dstr(dv) + ' → ' + dv.i + '.' },
            { p: 'Move the point in ' + dstr(D) + ' the SAME 2 places right. What is it now?', a: String(D.i), why: dstr(D) + ' → ' + fmtInt(D.i) + '.' },
            { p: 'Now ' + fmtInt(D.i) + ' ÷ ' + dv.i + ' = ?', a: String(q), why: fmtInt(D.i) + ' ÷ ' + dv.i + ' = ' + q + '.' }],
          finalPrompt: 'Moving both points the same way keeps the answer the same. So ' + qs4 + ' = ?',
          steps: ['Make the divisor whole: move both points 2 places right.', qs4 + ' becomes ' + fmtInt(D.i) + ' ÷ ' + dv.i + '.', fmtInt(D.i) + ' ÷ ' + dv.i + ' = ' + q + '.'] }; }
      if (lvl >= 6) { // level 6: decimal ÷ decimal with a decimal answer, e.g. 1.457 ÷ 0.31 = 4.7
        q = dec(R(12, 98), 1); if (q.i % 10 === 0) q.i += 1; dv = dec(R(12, 89), 2); if (dv.i % 10 === 0) dv.i += 1; D = dec(q.i * dv.i, 3);
        var D1 = dec(D.i, 1), qs6 = dstr(D) + ' ÷ ' + dstr(dv);
        return { q: qs6, ans: dstr(q), mode: 'num', value: 40,
          guide: [{ p: 'Make the divisor whole: move the point in ' + dstr(dv) + ' 2 places right. What is it now?', a: String(dv.i), why: dstr(dv) + ' → ' + dv.i + '.' },
            { p: 'Move the point in ' + dstr(D) + ' the SAME 2 places right. What is it now?', a: dstr(D1), why: dstr(D) + ' → ' + dstr(D1) + '.' },
            { p: 'Divide ignoring the point: ' + fmtInt(D.i) + ' ÷ ' + dv.i + ' = ?', a: String(q.i), why: fmtInt(D.i) + ' ÷ ' + dv.i + ' = ' + q.i + '.' }],
          finalPrompt: dstr(D1) + ' has 1 digit after the point, so the answer does too. So ' + qs6 + ' = ?',
          steps: ['Move both points 2 places right: ' + qs6 + ' becomes ' + dstr(D1) + ' ÷ ' + dv.i + '.', fmtInt(D.i) + ' ÷ ' + dv.i + ' = ' + q.i + ', and the point goes straight up: ' + dstr(q) + '.'] };
      }
      var k = R(2, 9), m = R(2, 9) * pickOf([10, 100]), sh = pickOf([1, 2]);
      dv = dec(k, sh); var whole = k * m, big = whole * Math.pow(10, sh), ansN = m * Math.pow(10, sh), qs5 = fmtInt(whole) + ' ÷ ' + dstr(dv);
      return { q: qs5, ans: String(ansN), mode: 'num', value: 30,
        guide: [{ p: 'Make ' + dstr(dv) + ' a whole number: how many places must its point move right?', a: String(sh), why: dstr(dv) + ' → ' + k + ' is ' + sh + ' place' + (sh > 1 ? 's' : '') + '.' },
          { p: 'Move the point in ' + fmtInt(whole) + ' the same ' + sh + ' place' + (sh > 1 ? 's' : '') + ' (add zeros). What is it now?', a: String(big), why: fmtInt(whole) + ' → ' + fmtInt(big) + '.' },
          { p: 'Now ' + fmtInt(big) + ' ÷ ' + k + ' = ?', a: String(ansN), why: fmtInt(big) + ' ÷ ' + k + ' = ' + fmtInt(ansN) + '.' }],
        finalPrompt: 'Dividing by a number smaller than 1 makes the answer BIGGER. So ' + qs5 + ' = ?',
        steps: ['Make the divisor whole: move both points ' + sh + ' place' + (sh > 1 ? 's' : '') + ' right.', fmtInt(whole) + ' becomes ' + fmtInt(big) + ', and ' + dstr(dv) + ' becomes ' + k + '.', fmtInt(big) + ' ÷ ' + k + ' = ' + fmtInt(ansN) + '.'] };
    },
    'zeros-div': function (lvl) { // his dropped-zero mistake (4800 ÷ 6 answered 80)
      var a = R(2, 9), b = R(2, 9), z1 = lvl >= 6 ? R(4, 6) : lvl >= 5 ? R(3, 5) : R(2, 4), z2 = R(1, Math.min(2, z1 - 1));
      var D = a * b * Math.pow(10, z1), d = b * Math.pow(10, z2), q = a * Math.pow(10, z1 - z2), D2 = D / Math.pow(10, z2), qs = fmtInt(D) + ' ÷ ' + fmtInt(d);
      return { q: qs, ans: String(q), mode: 'num', value: 30,
        guide: [{ p: 'Cross off the same number of zeros from both. How many zeros does ' + fmtInt(d) + ' have?', a: String(z2), why: fmtInt(d) + ' has ' + z2 + '.' },
          { p: 'Cross ' + z2 + ' off ' + fmtInt(D) + ' too. What is left?', a: String(D2), why: fmtInt(D) + ' → ' + fmtInt(D2) + '.' },
          { p: 'Now ' + fmtInt(D2) + ' ÷ ' + b + ' = ?', a: String(q), why: fmtInt(D2) + ' ÷ ' + b + ' = ' + fmtInt(q) + '.' }],
        finalPrompt: 'Crossing off the same zeros does not change the answer. So ' + qs + ' = ?',
        steps: ['Cancel the same number of zeros from both: take ' + z2 + ' off each.', fmtInt(D2) + ' ÷ ' + b + ' = ' + fmtInt(q) + '.'] };
    },
    'rem-word': function (lvl) { // remainder word problems: round up, drop, or leftover
      var d = R(lvl >= 5 ? 24 : 12, lvl >= 5 ? 48 : 30), q = R(lvl >= 5 ? 21 : 11, lvl >= 5 ? 79 : 40), r = R(1, d - 1), N = d * q + r;
      if (lvl >= 6) { // level 6: two steps (multiply first, then divide and decide)
        var per = R(36, 96), days = R(3, 9), box = R(12, 30), tot = per * days; while (tot % box === 0) { box++; }
        var fb = Math.floor(tot / box), lft = tot % box;
        return { q: 'A farm collects ' + per + ' eggs a day for ' + days + ' days. A carton holds ' + box + ' eggs. How many cartons can be FILLED?', ans: String(fb), mode: 'num', value: 40, long: true,
          guide: [{ p: 'First, how many eggs in total? ' + per + ' × ' + days + ' = ?', a: String(tot), why: per + ' × ' + days + ' = ' + tot + '.' },
            { p: tot + ' ÷ ' + box + ': how many WHOLE times does ' + box + ' fit?', a: String(fb), why: box + ' × ' + fb + ' = ' + box * fb + '.' },
            { p: 'How many eggs are left over?', a: String(lft), why: tot + ' − ' + box * fb + ' = ' + lft + '.' }],
          finalPrompt: 'Can the leftover eggs fill a whole carton? So how many cartons are FILLED?',
          steps: [per + ' × ' + days + ' = ' + tot + ' eggs.', tot + ' ÷ ' + box + ' = ' + fb + ' R ' + lft + '.', 'Only full cartons count: ' + fb + '.'] };
      }
      var t = pickOf(['up', 'drop', 'left']), it;
      var g = [{ p: N + ' ÷ ' + d + ': how many WHOLE times does ' + d + ' fit?', a: String(q), why: d + ' × ' + q + ' = ' + d * q + '.' },
        { p: 'And how many are left over?', a: String(r), why: N + ' − ' + d * q + ' = ' + r + '.' }];
      if (t === 'up') it = { q: N + ' kids are going on a field trip. Each bus holds ' + d + '. How many buses do they need?', ans: String(q + 1),
        finalPrompt: 'The ' + 'leftover kids cannot stay home. So how many buses?', steps: [N + ' ÷ ' + d + ' = ' + q + ' R ' + r + '.', 'The leftover kids still need a bus, so round UP: ' + (q + 1) + '.'] };
      else if (t === 'drop') it = { q: 'A pack holds ' + d + ' trading cards. Parker has ' + N + ' cards. How many FULL packs can he make?', ans: String(q),
        finalPrompt: 'Can the leftover cards fill a whole pack? So how many FULL packs?', steps: [N + ' ÷ ' + d + ' = ' + q + ' R ' + r + '.', 'The leftover cards cannot fill a pack, so drop them: ' + q + '.'] };
      else it = { q: N + ' emeralds are shared equally among ' + d + ' players. How many emeralds are left over?', ans: String(r),
        finalPrompt: 'Read the question again: what is it asking for?', steps: [N + ' ÷ ' + d + ' = ' + q + ' R ' + r + '.', 'It asks what is LEFT: the remainder, ' + r + '.'] };
      it.mode = 'num'; it.value = 40; it.long = true; it.guide = g;
      return it;
    },
  };

  // ── Micro questions: one 20-second decision on the step he is missing (productive struggle, not a full problem) ──
  // Built from a real item at his level, so the numbers stay as hard as his level.
  var MICRO = {
    'dec-mul': function (lvl) {
      var it = GEN['dec-mul'](lvl), m = it.q.split(' × '), pl = (m[0].split('.')[1] || '').length + (m[1].split('.')[1] || '').length;
      return { q: it.q, sub: 'Just this: how many digits go AFTER the point in the answer?', ans: String(pl), steps: ['Count the digits after the point in both numbers: ' + pl + '.'] };
    },
    'dec-div': function (lvl) {
      var it = GEN['dec-div'](Math.max(4, lvl)), m = it.q.replace(/,/g, '').split(' ÷ '), sh = (m[1].split('.')[1] || '').length;
      if (!sh) { var d = Number(m[1]), D = Number(m[0]); return { q: it.q, sub: 'Just this: about how much is it? Round to the nearest whole number.', ans: String(Math.round(D / d)), steps: ['Divide ignoring the point, then the point goes straight up: about ' + Math.round(D / d) + '.'] }; }
      return { q: it.q, sub: 'Just this: how many places must BOTH points move right so you divide by a whole number?', ans: String(sh), steps: [m[1] + ' needs ' + sh + ' place' + (sh > 1 ? 's' : '') + ' to become whole, and the other number moves the same.'] };
    },
    'long-div': function (lvl) {
      var it = GEN['long-div'](lvl), m = it.q.replace(/,/g, '').split(' ÷ '), D = String(m[0]), d = Number(m[1]), cur = 0, i = 0;
      while (i < D.length && cur < d) { cur = cur * 10 + Number(D[i]); i++; }
      var qd = Math.floor(cur / d);
      return { q: 'How many ' + d + 's fit into ' + cur + '?', sub: 'First digit of ' + it.q + '. Round ' + d + ' to ' + Math.round(d / 10) * 10 + ' to guess, then check.', ans: String(qd), steps: [qd + ' × ' + d + ' = ' + qd * d + (qd < 9 ? ', and ' + (qd + 1) + ' × ' + d + ' = ' + (qd + 1) * d + ' is too big.' : '.')] };
    },
    'zeros-div': function (lvl) {
      var it = GEN['zeros-div'](lvl), m = it.q.replace(/,/g, '').split(' ÷ '), z = Math.min((m[0].match(/0+$/) || [''])[0].length, (m[1].match(/0+$/) || [''])[0].length);
      return { q: it.q, sub: 'Just this: how many zeros can you cross off BOTH numbers?', ans: String(z), steps: ['Both end in at least ' + z + ' zero' + (z > 1 ? 's' : '') + '.'] };
    },
    'rem-word': function () {
      var d = R(12, 40), q = R(11, 60), r = R(1, d - 1), N = d * q + r, t = pickOf(['up', 'drop', 'left']);
      var story = t === 'up' ? N + ' kids, ' + d + ' per bus. ' + N + ' ÷ ' + d + ' = ' + q + ' R ' + r + '. How many buses?' : t === 'drop' ? N + ' cards, ' + d + ' per pack. ' + N + ' ÷ ' + d + ' = ' + q + ' R ' + r + '. How many FULL packs?' : N + ' gems shared by ' + d + ' players. ' + N + ' ÷ ' + d + ' = ' + q + ' R ' + r + '. How many are left over?';
      var ans = t === 'up' ? q + 1 : t === 'drop' ? q : r;
      return { q: story, sub: 'Just this: what does the remainder mean here?', ans: String(ans), long: true, steps: [t === 'up' ? 'The leftover still needs a bus: round up.' : t === 'drop' ? 'Leftovers cannot fill a pack: drop them.' : 'It asks for what is left: the remainder.'] };
    },
  };

  // Guided long division: he answers "how many fit?" at every step and "what's left?" at the first one.
  function divGuide(D, d) {
    var digits = String(D), cur = 0, started = false, g = [], first = true;
    for (var i = 0; i < digits.length; i++) {
      cur = cur * 10 + Number(digits[i]);
      if (!started && cur < d) continue;
      var qd = Math.floor(cur / d);
      g.push({ p: (started ? 'Bring down the ' + digits[i] + ' to make ' + cur + '. ' : 'Start with ' + cur + ' (' + d + ' is about ' + Math.round(d / 10) * 10 + '). ') + 'How many ' + d + 's fit into ' + cur + '?', a: String(qd), why: qd + ' × ' + d + ' = ' + qd * d + (qd < 9 ? ', and ' + (qd + 1) + ' × ' + d + ' = ' + (qd + 1) * d + ' is too big.' : '.') });
      if (first) { g.push({ p: cur + ' − ' + qd * d + ' = ? (what is left)', a: String(cur - qd * d), why: cur + ' − ' + qd * d + ' = ' + (cur - qd * d) + '.' }); first = false; }
      started = true; cur -= qd * d;
    }
    return g;
  }

  function divSteps(D, d) {
    var digits = String(D), cur = 0, q = '', steps = ['Estimate first: ' + d + ' is about ' + Math.round(d / 10) * 10 + '.'];
    for (var i = 0; i < digits.length; i++) {
      cur = cur * 10 + Number(digits[i]);
      if (q === '' && cur < d) continue;
      var qd = Math.floor(cur / d);
      steps.push((q === '' ? '' : 'Bring down ' + digits[i] + ': ') + cur + ' ÷ ' + d + ' → ' + qd + ', ' + qd + ' × ' + d + ' = ' + qd * d + ', ' + (cur - qd * d) + ' left.');
      q += String(qd); cur -= qd * d;
    }
    steps.push('Answer: ' + Number(q) + (cur ? ' R ' + cur : '') + '.');
    return steps.length > 7 ? [steps[0]].concat(steps.slice(-5)) : steps;
  }

  // ── Spelling: chunks (phonics breakdown) and rules. Every answer is the word itself. ──
  // c = the word in chunks; m = index of the hard chunk; bad = the common misspelling; r = the rule.
  var WORDS = [
    { w: 'necessary', d: 'needed; you must have it', c: ['nec', 'es', 'sar', 'y'], m: 2, bad: 'neccesary', r: 'One c, two s (one collar, two sleeves).' },
    { w: 'separate', d: 'apart; not together', c: ['sep', 'a', 'rate'], m: 1, bad: 'seperate', r: 'There is "a rat" in sep-A-RATe.' },
    { w: 'definitely', d: 'for sure, no doubt', c: ['def', 'i', 'nite', 'ly'], m: 2, bad: 'definately', r: 'Built from finite: de + FINITE + ly.' },
    { w: 'receive', d: 'to get something given to you', c: ['re', 'ceive'], m: 1, bad: 'recieve', r: 'i before e, except after c.' },
    { w: 'ceiling', d: 'the top of a room, above your head', c: ['ceil', 'ing'], m: 0, bad: 'cieling', r: 'After c it is ei.' },
    { w: 'achieve', d: 'to reach a goal by working for it', c: ['a', 'chieve'], m: 1, bad: 'acheive', r: 'Sounds like "ee" and not after c: ie.' },
    { w: 'weird', d: 'strange or odd', c: ['weird'], m: 0, bad: 'wierd', r: 'Rule breaker: weird is weird, it breaks i before e.' },
    { w: 'neighbor', d: 'a person who lives next door', c: ['neigh', 'bor'], m: 0, bad: 'nieghbor', r: 'ei when it sounds like "ay", as in neigh.' },
    { w: 'foreign', d: 'from another country', c: ['for', 'eign'], m: 1, bad: 'foriegn', r: 'Rule breaker: for + EIGN, like reign.' },
    { w: 'environment', d: 'the world around you: air, water, land, nature', c: ['en', 'vi', 'ron', 'ment'], m: 2, bad: 'enviroment', r: 'Hidden IRON: env-IRON-ment.' },
    { w: 'government', d: 'the people who run a country or state', c: ['gov', 'ern', 'ment'], m: 1, bad: 'goverment', r: 'govern + ment: keep the n.' },
    { w: 'February', d: 'the second month of the year', c: ['Feb', 'ru', 'ar', 'y'], m: 1, bad: 'Febuary', r: 'Say the first r: Feb-RU-ary.' },
    { w: 'Wednesday', d: 'the day after Tuesday', c: ['Wed', 'nes', 'day'], m: 1, bad: 'Wensday', r: 'Say it in chunks: WED-NES-day.' },
    { w: 'restaurant', d: 'a place where you pay to eat a meal', c: ['res', 'tau', 'rant'], m: 1, bad: 'resturant', r: 'The tricky middle is TAU.' },
    { w: 'embarrass', d: 'to make someone feel awkward or ashamed', c: ['em', 'bar', 'rass'], m: 2, bad: 'embarass', r: 'Double r AND double s: you go Really Red and Smile Shyly.' },
    { w: 'accommodate', d: 'to make room for someone or something', c: ['ac', 'com', 'mo', 'date'], m: 1, bad: 'accomodate', r: 'Double c AND double m: room for two of each.' },
    { w: 'occasion', d: 'a special event or time', c: ['oc', 'ca', 'sion'], m: 0, bad: 'ocassion', r: 'Double c, one s.' },
    { w: 'recommend', d: 'to say something is good and someone should try it', c: ['rec', 'om', 'mend'], m: 2, bad: 'reccomend', r: 're + commend: one c, double m.' },
    { w: 'privilege', d: 'a special right or advantage', c: ['priv', 'i', 'lege'], m: 2, bad: 'priviledge', r: 'No d anywhere: privi-LEGE.' },
    { w: 'knowledge', d: 'what you know', c: ['know', 'ledge'], m: 1, bad: 'knowlege', r: 'know + LEDGE: silent k, and keep the d.' },
    { w: 'conscience', d: 'the voice inside you that says right from wrong', c: ['con', 'science'], m: 1, bad: 'concience', r: 'con + SCIENCE.' },
    { w: 'muscle', d: 'the body part that moves your bones', c: ['mus', 'cle'], m: 1, bad: 'mussle', r: 'Silent c: mus-CLE.' },
    { w: 'guarantee', d: 'a promise that something will happen', c: ['guar', 'an', 'tee'], m: 0, bad: 'garantee', r: 'Silent u after g: GUar.' },
    { w: 'interrupt', d: 'to cut in while someone is talking', c: ['in', 'ter', 'rupt'], m: 2, bad: 'interupt', r: 'inter + rupt: two r where they meet.' },
    { w: 'responsible', d: 'in charge; someone you can count on', c: ['re', 'spon', 'si', 'ble'], m: 3, bad: 'responsable', r: '-ible when what is left is not a whole word (respons- is not a word).' },
    { w: 'visible', d: 'able to be seen', c: ['vis', 'i', 'ble'], m: 2, bad: 'visable', r: '-ible: vis- is not a word on its own.' },
    { w: 'comfortable', d: 'cozy and relaxed', c: ['com', 'fort', 'a', 'ble'], m: 2, bad: 'comfortible', r: '-able: comfort IS a whole word.' },
    { w: 'dependable', d: 'someone you can count on', c: ['de', 'pend', 'a', 'ble'], m: 2, bad: 'dependible', r: '-able: depend IS a whole word.' },
    { w: 'musician', d: 'a person who plays music', c: ['mu', 'si', 'cian'], m: 2, bad: 'musition', r: '-cian for a person who does it (music → musician).' },
    { w: 'explanation', d: 'words that make something clear', c: ['ex', 'pla', 'na', 'tion'], m: 1, bad: 'explaination', r: 'explain loses its i: ex-PLA-nation.' },
    { w: 'permission', d: 'being allowed to do something', c: ['per', 'mis', 'sion'], m: 2, bad: 'permision', r: 'permit → permission: double s.' },
  ];
  // Build items: base + suffix (or prefix + base). r = the rule that decides the spelling.
  if (root.__FOCUS && Array.isArray(root.__FOCUS.words)) root.__FOCUS.words.forEach(function (w) { if (w && w.w && !WORDS.some(function (x) { return x.w === w.w; })) WORDS.push(w); });
  var BUILDS = [
    ['begin', '+ing', 'beginning', 'Stress on the last syllable (be-GIN) and one short vowel: double the last consonant.'],
    ['occur', '+ed', 'occurred', 'Stress on the last syllable (oc-CUR): double the r.'],
    ['prefer', '+ed', 'preferred', 'Stress on the last syllable (pre-FER): double the r.'],
    ['forget', '+able', 'forgettable', 'Stress on GET: double the t.'],
    ['regret', '+able', 'regrettable', 'Stress on GRET: double the t.'],
    ['offer', '+ing', 'offering', 'Stress on the FIRST syllable (OF-fer): do not double.'],
    ['visit', '+ed', 'visited', 'Stress on the FIRST syllable (VIS-it): do not double.'],
    ['argue', '+ment', 'argument', 'Rule breaker: argue drops its e before -ment.'],
    ['true', '+ly', 'truly', 'Rule breaker: true drops its e.'],
    ['notice', '+able', 'noticeable', 'Keep the e after c so it still sounds like "s".'],
    ['courage', '+ous', 'courageous', 'Keep the e after g so it still sounds like "j".'],
    ['change', '+able', 'changeable', 'Keep the e after g so it still sounds like "j".'],
    ['happy', '+ness', 'happiness', 'Consonant before y: change y to i.'],
    ['carry', '+ed', 'carried', 'Consonant before y: change y to i.'],
    ['beauty', '+ful', 'beautiful', 'Consonant before y: change y to i.'],
    ['busy', '+est', 'busiest', 'Consonant before y: change y to i.'],
    ['mercy', '+less', 'merciless', 'Consonant before y: change y to i.'],
    ['enjoy', '+ment', 'enjoyment', 'Vowel before y: keep the y.'],
    ['copy', '+ing', 'copying', 'Keep y before -ing (never "ii").'],
    ['un+', 'necessary', 'unnecessary', 'Prefix + word: keep every letter, so two n.'],
    ['mis+', 'spell', 'misspell', 'Prefix + word: keep every letter, so two s.'],
    ['dis+', 'satisfied', 'dissatisfied', 'Prefix + word: keep every letter, so two s.'],
    ['ir+', 'responsible', 'irresponsible', 'ir- before r: two r.'],
    ['il+', 'legal', 'illegal', 'il- before l: two l.'],
  ];

  // ── Grammar (advanced). Each item: s = the prompt, a = the answer, l = level 1-3, why = the breakdown. ──
  var G = {
    sentence: { k: 4, sub: 'Type 1 simple · 2 compound · 3 complex · 4 compound-complex', mode: 'text', items: [
      { s: 'Parker and his cousin built a tower and defended it all night.', a: '1', l: 2, why: 'One subject (Parker and his cousin), one verb set (built and defended). One clause: SIMPLE.' },
      { s: 'After the long, noisy storm, the creepers crept out of the cave.', a: '1', l: 2, why: '"After the long, noisy storm" has no verb: a phrase. One clause: SIMPLE.' },
      { s: 'Running down the hallway, the dog slid into the wall.', a: '1', l: 2, why: '"Running down the hallway" has no subject doing a verb: a phrase. One clause: SIMPLE.' },
      { s: 'During the game, neither the coach nor the players noticed the rain.', a: '1', l: 2, why: 'Two people in one subject, one verb (noticed). One clause: SIMPLE.' },
      { s: 'The boy with the red backpack won the spelling bee.', a: '1', l: 1, why: '"with the red backpack" is a phrase. One clause: SIMPLE.' },
      { s: 'Rolf jumped onto the counter and knocked over a glass of milk.', a: '1', l: 1, why: 'One subject (Rolf) with two verbs, no second subject. SIMPLE.' },
      { s: 'The zombies attacked at midnight, but the villagers were ready.', a: '2', l: 1, why: 'Two full sentences joined by ", but". COMPOUND.' },
      { s: 'Parker finished his math, so he earned extra game time.', a: '2', l: 1, why: 'Two full sentences joined by ", so". COMPOUND.' },
      { s: 'The test was hard; however, everyone passed.', a: '2', l: 2, why: 'Two full sentences joined by a semicolon. COMPOUND.' },
      { s: 'You can build the bridge, or you can swim across the river.', a: '2', l: 1, why: 'Two full sentences joined by ", or". COMPOUND.' },
      { s: 'Mia likes soccer; her brother prefers chess.', a: '2', l: 2, why: 'Two full sentences joined by a semicolon. COMPOUND.' },
      { s: 'Because the server crashed, nobody could log in.', a: '3', l: 1, why: '"Because the server crashed" cannot stand alone. One main + one dependent clause: COMPLEX.' },
      { s: 'The player who found the diamond shared it with the team.', a: '3', l: 2, why: '"who found the diamond" is a dependent clause inside the main one. COMPLEX.' },
      { s: 'When the bell rings, put your pencils down.', a: '3', l: 2, why: '"When the bell rings" is dependent; "(you) put your pencils down" is the main clause. COMPLEX.' },
      { s: 'We stayed inside until the storm passed.', a: '3', l: 1, why: '"until the storm passed" is dependent. COMPLEX.' },
      { s: 'The book that Parker borrowed is overdue.', a: '3', l: 2, why: '"that Parker borrowed" is a dependent clause. COMPLEX.' },
      { s: 'Although he was tired, Parker finished the last level.', a: '3', l: 1, why: '"Although he was tired" is dependent. COMPLEX.' },
      { s: 'When the creeper exploded, the wall fell, and the sheep ran away.', a: '4', l: 3, why: 'Two main clauses + one dependent (When the creeper exploded). COMPOUND-COMPLEX.' },
      { s: 'Parker wanted to play outside, but it rained because a storm rolled in.', a: '4', l: 3, why: 'Two main clauses joined by ", but" + the dependent "because a storm rolled in". COMPOUND-COMPLEX.' },
      { s: 'The team that practiced hardest won, so the coach bought pizza.', a: '4', l: 3, why: 'Two main clauses joined by ", so" + the dependent "that practiced hardest". COMPOUND-COMPLEX.' },
      { s: 'Although the map was old, it was accurate, and we found the treasure.', a: '4', l: 3, why: 'Two main clauses joined by ", and" + the dependent "Although the map was old". COMPOUND-COMPLEX.' },
      { s: 'I will help you if you ask, but you must ask nicely.', a: '4', l: 3, why: 'Two main clauses joined by ", but" + the dependent "if you ask". COMPOUND-COMPLEX.' },
    ] },
    subject: { sub: 'Type the SUBJECT (one word).', mode: 'text', items: [
      { s: 'After dinner, please take out the trash.', a: 'you', l: 1, why: 'A command: the subject is the hidden "you".' },
      { s: "Don't forget your lunch!", a: 'you', l: 1, why: 'A command: the subject is the hidden "you".' },
      { s: 'Before the game starts, grab your helmet and stretch.', a: 'you', l: 2, why: 'A command: "(you) grab and stretch". The subject is the hidden "you".' },
      { s: 'Close to the door stood a tall man.', a: 'man', l: 2, why: 'Who stood? A tall MAN. The subject comes after the verb here.' },
      { s: 'Here comes the bus.', a: 'bus', l: 2, why: 'What comes? The BUS. "Here" is never the subject.' },
      { s: 'In the box were three sleepy puppies.', a: 'puppies', l: 3, why: 'What were in the box? PUPPIES. "box" is inside a phrase, so it cannot be the subject.' },
      { s: 'One of the players on the team was injured.', a: 'one', l: 3, why: 'Who was injured? ONE. "players" sits inside the phrase "of the players".' },
      { s: 'There are two creepers behind you.', a: 'creepers', l: 2, why: 'What are behind you? CREEPERS. "There" is never the subject.' },
    ] },
    agreement: { k: 2, sub: 'Type the verb that agrees.', mode: 'text', items: [
      { s: 'The box of old crayons (is / are) on the shelf.', a: 'is', l: 1, subj: 'box', num: 'one', why: 'The subject is BOX (one). "of old crayons" is a phrase, so ignore it: box IS.' },
      { s: 'The players on the team (practice / practices) every day.', a: 'practice', l: 1, subj: 'players', num: 'many', why: 'The subject is PLAYERS (many). "on the team" is a phrase: players PRACTICE.' },
      { s: 'The team (has / have) won every game this season.', a: 'has', l: 1, subj: 'team', num: 'one', why: 'TEAM is one group acting together: the team HAS.' },
      { s: 'Each of the players (has / have) a helmet.', a: 'has', l: 2, subj: 'each', num: 'one', why: 'EACH is the subject and each means one: each HAS.' },
      { s: 'Neither the coach nor the players (was / were) ready.', a: 'were', l: 2, subj: 'players', num: 'many', why: 'With neither/nor, the verb agrees with the NEARER subject: players WERE.' },
      { s: 'Neither the players nor the coach (was / were) ready.', a: 'was', l: 2, subj: 'coach', num: 'one', why: 'With neither/nor, the verb agrees with the NEARER subject: coach WAS.' },
      { s: 'Everybody in the stands (cheer / cheers) when he scores.', a: 'cheers', l: 2, subj: 'everybody', num: 'one', why: 'EVERYBODY is singular (every + body = one): everybody CHEERS.' },
      { s: 'Mathematics (is / are) his best subject.', a: 'is', l: 3, subj: 'mathematics', num: 'one', why: 'Mathematics ends in s but is ONE subject: mathematics IS.' },
      { s: 'Ten dollars (is / are) too much for that sword.', a: 'is', l: 3, subj: 'dollars', num: 'one', why: 'An amount of money is treated as ONE sum: ten dollars IS.' },
      { s: 'The news from the trip (was / were) good.', a: 'was', l: 3, subj: 'news', num: 'one', why: 'NEWS is singular even though it ends in s: the news WAS.' },
    ] },
    pronoun: { k: 2, sub: 'Type the correct word.', mode: 'text', items: [
      { s: 'Parker and (I / me) went to the game.', a: 'i', l: 1, g: { p: 'Cover up "Parker and". Which sounds right: "___ went to the game"? type I or me', a: 'I' }, why: 'Take away "Parker and": "I went", not "me went". So: Parker and I.' },
      { s: 'The coach gave the prize to Mia and (he / him).', a: 'him', l: 1, g: { p: 'Cover up "Mia and". Which sounds right: "gave the prize to ___"? type he or him', a: 'him' }, why: 'Take away "Mia and": "gave the prize to him". After "to", use him.' },
      { s: 'Between you and (I / me), the test was easy.', a: 'me', l: 2, g: { p: '"Between" is a preposition (like to, for, with). After a preposition, is it I or me?', a: 'me' }, why: '"Between" is a preposition, and after a preposition you use me: between you and ME.' },
      { s: '(We / Us) kids want a longer recess.', a: 'we', l: 2, g: { p: 'Cover up "kids". Which sounds right: "___ want a longer recess"? type we or us', a: 'we' }, why: 'Take away "kids": "WE want a longer recess", not "us want".' },
      { s: '(Who / Whom) is at the door?', a: 'who', l: 2, g: { p: 'Answer the question with he or him: "___ is at the door."', a: 'he' }, why: 'Answer it: "HE is at the door" (he = who). He → WHO.' },
      { s: '(Who / Whom) did you invite to the party?', a: 'whom', l: 3, g: { p: 'Answer the question with he or him: "You invited ___."', a: 'him' }, why: 'Answer it: "you invited HIM" (him = whom). Him → WHOM.' },
      { s: 'Give the extra emeralds to (whoever / whomever) needs them.', a: 'whoever', l: 3, g: { p: 'Look only at the little clause: "___ needs them". he or him?', a: 'he' }, why: 'Inside its own clause, "WHOEVER needs them" (he needs them). The clause decides, not "to".' },
      { s: 'The trophy belongs to (whoever / whomever) the judges choose.', a: 'whomever', l: 3, g: { p: 'Look only at the little clause: "the judges choose ___". he or him?', a: 'him' }, why: 'Inside the clause: "the judges choose HIM" (him = whomever).' },
    ] },
    fragrun: { k: 3, sub: 'Type C correct · F fragment · R run-on', mode: 'text', items: [
      { s: 'Because the game crashed again.', a: 'f', l: 1, n: 0, why: 'Starts with "Because" and nothing finishes the thought: a FRAGMENT.' },
      { s: 'The game crashed, we lost all our progress.', a: 'r', l: 1, n: 2, why: 'Two full sentences joined only by a comma (a comma splice): a RUN-ON.' },
      { s: 'Parker loves Minecraft he plays it every day.', a: 'r', l: 1, n: 2, why: 'Two full sentences with nothing between them: a RUN-ON.' },
      { s: 'The game crashed; we lost all our progress.', a: 'c', l: 2, n: 2, why: 'A semicolon can join two full sentences: CORRECT.' },
      { s: 'Running through the forest with a torch in his hand.', a: 'f', l: 2, n: 0, why: 'No subject doing a main verb ("running" is not a full verb here): a FRAGMENT.' },
      { s: 'Although the creeper was close, Parker kept mining.', a: 'c', l: 2, n: 1, why: 'Dependent clause + comma + full sentence: CORRECT.' },
      { s: 'The dog that chased the cat across the yard.', a: 'f', l: 3, n: 0, why: '"that chased the cat" describes the dog, but the dog never DOES anything: a FRAGMENT.' },
      { s: 'Go.', a: 'c', l: 3, n: 1, why: 'A command with the hidden subject "you": "(You) go." One word, still a CORRECT sentence.' },
      { s: 'Parker studied hard, however, he still felt nervous.', a: 'r', l: 3, n: 2, why: '"however" cannot join two sentences with commas: a RUN-ON. Fix: "hard; however, he".' },
    ] },
    verbals: { k: 3, sub: 'The CAPITAL word is a: type G gerund · P participle · I infinitive', mode: 'text', items: [
      { s: 'SWIMMING is Parker\'s favorite sport.', a: 'g', l: 1, why: 'It names an activity and acts as a noun (the subject): GERUND.' },
      { s: 'The SWIMMING dog finally reached the shore.', a: 'p', l: 1, why: 'It describes the dog, like an adjective: PARTICIPLE.' },
      { s: 'Parker wants TO WIN the race.', a: 'i', l: 1, why: '"to" + verb: INFINITIVE.' },
      { s: 'The BROKEN sword lay on the ground.', a: 'p', l: 2, why: 'It describes the sword: PARTICIPLE (past participles count too).' },
      { s: 'Parker enjoys BUILDING with redstone.', a: 'g', l: 2, why: 'It is the thing he enjoys, a noun: GERUND.' },
      { s: 'His goal is TO BUILD a castle.', a: 'i', l: 2, why: '"to" + verb: INFINITIVE.' },
      { s: 'EXHAUSTED, the miners climbed out of the cave.', a: 'p', l: 3, why: 'It describes the miners: PARTICIPLE.' },
      { s: 'After WINNING the match, the team celebrated.', a: 'g', l: 3, why: 'It follows the preposition "after" and acts as a noun: GERUND.' },
    ] },
    voice: { k: 2, sub: 'Type A active · P passive', mode: 'text', items: [
      { s: 'The creeper destroyed the castle.', a: 'a', l: 1, why: 'The subject (creeper) DOES the action: ACTIVE.' },
      { s: 'The castle was destroyed by the creeper.', a: 'p', l: 1, why: 'The subject (castle) RECEIVES the action, with "was + destroyed": PASSIVE.' },
      { s: 'Parker has finished his homework.', a: 'a', l: 2, why: '"has finished" is just a tense; Parker still DOES the finishing: ACTIVE.' },
      { s: 'The tests will be graded tomorrow.', a: 'p', l: 2, why: 'The tests RECEIVE the grading ("will be graded"), even with no "by": PASSIVE.' },
      { s: 'Mistakes were made.', a: 'p', l: 3, why: 'Nobody is named as doing it; the mistakes RECEIVE the action: PASSIVE.' },
      { s: 'The team was celebrating its win.', a: 'a', l: 3, why: '"was celebrating" is a past progressive verb; the team DOES the celebrating: ACTIVE.' },
    ] },
    irregular: { sub: 'Type the right form of the verb in brackets.', mode: 'text', items: [
      { s: 'The pond has (freeze) solid.', a: 'frozen', l: 1, why: 'freeze, froze, has FROZEN.' },
      { s: 'They had (choose) the blue team.', a: 'chosen', l: 1, why: 'choose, chose, had CHOSEN.' },
      { s: 'Yesterday Parker (swim) across the lake.', a: 'swam', l: 1, why: 'swim, SWAM (yesterday), has swum.' },
      { s: 'He had (swim) there many times before.', a: 'swum', l: 2, why: 'After had/has: swim, swam, had SWUM.' },
      { s: 'The bell has already (ring).', a: 'rung', l: 2, why: 'ring, rang, has RUNG.' },
      { s: 'The sun had (rise) before we woke up.', a: 'risen', l: 2, why: 'rise, rose, had RISEN.' },
      { s: 'Yesterday she (lie) down for a nap.', a: 'lay', l: 3, why: 'lie (rest), LAY (yesterday), has lain. Trap: "lay" is also the present of a different verb.' },
      { s: 'Yesterday he (lay) the book on the table.', a: 'laid', l: 3, why: 'lay (put something down), LAID (yesterday), has laid.' },
    ] },
  };
  // Back-compat exports for scripts/check-school.js and the blind check.
  var SENT = G.sentence.items.map(function (x) { return { s: x.s, t: Number(x.a), why: x.why }; });
  var SUBJ = G.subject.items.map(function (x) { return { s: x.s, a: x.a, why: x.why }; });

  // Guided steps after a miss on an authored item: he works out the key idea, then answers again himself.
  function gGuide(k, y) {
    var T = function (p, a, mode) { return { p: p, a: a, mode: mode || 'text' }; };
    if (k === 'sentence') {
      var n = (y.a === '2' || y.a === '4') ? '2' : '1', dep = (y.a === '3' || y.a === '4') ? 'y' : 'n';
      return { guide: [T('How many parts could stand alone as a full sentence (a subject + a verb)? type 1 or 2', n, 'num'),
        T('Is there a part that CANNOT stand alone (it starts with because, when, although, if, until, who, that...)? type y or n', dep)],
        finalPrompt: '1 alone = simple · 2 = compound · 1 + a dependent = complex · 2 + a dependent = compound-complex. Which number?' };
    }
    if (k === 'subject') return { guide: [T('Is it a command (telling someone to do something)? type y or n', y.a === 'you' ? 'y' : 'n')],
      finalPrompt: y.a === 'you' ? 'In a command, who is being told to do it? So the subject is?' : 'Ask: who or what does the verb? (Never "here" or "there", never a word inside a phrase.) Subject?' };
    if (k === 'agreement') return { guide: [T('Find the REAL subject (skip phrases like "of the..." or "on the..."; with neither/nor, take the nearer one). Type it.', y.subj),
      T('Is "' + y.subj + '" one thing or many? type one or many', y.num)], finalPrompt: 'One goes with is / has / was / a verb ending in s. Many goes with are / have / were. So?' };
    if (k === 'pronoun') return { guide: [T(y.g.p, y.g.a)], finalPrompt: 'I / he / who do the action; me / him / whom receive it. So?' };
    if (k === 'fragrun') {
      var g = [T('How many complete sentences (subject + verb + a finished thought) are in it? type 0, 1 or 2', String(y.n), 'num')];
      if (y.n === 2) g.push(T('Are the two joined the right way (a semicolon, or a comma + and/but/so)? type y or n', y.a === 'c' ? 'y' : 'n'));
      return { guide: g, finalPrompt: '0 complete = F · joined right (or just 1) = C · two run together = R. So?' };
    }
    if (k === 'verbals') return { guide: [T('What job does the CAPITAL word do here: a thing, a describer, or "to + verb"? type thing, describer or to', { g: 'thing', p: 'describer', i: 'to' }[y.a])],
      finalPrompt: 'thing = G · describer = P · to + verb = I. So?' };
    if (k === 'voice') return { guide: [T('Look at the subject. Does it DO the action or RECEIVE it? type do or receive', y.a === 'a' ? 'do' : 'receive')], finalPrompt: 'do = A · receive = P. So?' };
    if (k === 'irregular') {
      var helper = /\b(has|have|had)\b[^(]*\(/.test(y.s);
      return { guide: [T('Is there a has, have or had before the verb? type y or n', helper ? 'y' : 'n')],
        finalPrompt: helper ? 'With has/have/had you need the 3rd form (like eaten, gone). So?' : 'With no helper it is the simple past (like ate, went). So?' };
    }
    return { guide: [], finalPrompt: '' };
  }

  // ── Mastery: push fast, confirm slowly ──
  // 4 right in a row at a level moves him up straight away (push). That level is then "passed" and comes
  // back as a recall check after 1, 3, 7 and 21 days; passing checks on 2 later days makes it MASTERED.
  // Failing a check sends him back to that level. 2 misses in his last 3 at a level steps down one.
  var DAY = 86400000, GAPS = [1, 3, 7, 21];
  function LCFG() { return root.__LEARN || {}; }
  var SKILLS = {
    'dec-mul': { levels: [3, 4, 5, 6], w: 13 }, 'long-div': { levels: [3, 4, 5, 6], w: 11 }, 'dec-div': { levels: [3, 4, 5, 6], w: 11 },
    'rem-word': { levels: [4, 5, 6], w: 7 }, 'zeros-div': { levels: [3, 4, 5, 6], w: 4 },
    spell: { w: 18 },
    sentence: { levels: [1, 2, 3], w: 6 }, subject: { levels: [1, 2, 3], w: 4 }, agreement: { levels: [1, 2, 3], w: 6 },
    pronoun: { levels: [1, 2, 3], w: 5 }, fragrun: { levels: [1, 2, 3], w: 6 }, verbals: { levels: [1, 2, 3], w: 4 },
    voice: { levels: [1, 2, 3], w: 3 }, irregular: { levels: [1, 2, 3], w: 4 },
  };
  function today(t) { var d = new Date(t || Date.now()); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function st(k) {
    var s = load().skills; var x = s[k];
    if (!x || x.v !== 2) x = s[k] = { v: 2, i: 0, run: [], passed: {}, n: 0, right: 0, missAt: 0 };
    // The dial's floor: never below minLevel (raising it moves him up straight away).
    var floor = Math.min(LCFG().minLevel || 0, ((SKILLS[k] && SKILLS[k].levels) || [0]).length - 1);
    if (x.i < floor && !x.n) { x.i = floor; x.run = []; } // start level only; after misses he may drop below it
    return x;
  }
  function mastered(k) { var x = st(k), L = SKILLS[k].levels || []; return L.length > 0 && L.every(function (_, i) { return x.passed[i] && x.passed[i].mastered; }); }
  function dueReview(k) {
    var x = st(k), now = Date.now(), best = null;
    Object.keys(x.passed).forEach(function (i) { var p = x.passed[i]; if (p.due <= now && (best === null || p.due < x.passed[best].due)) best = i; });
    return best === null ? null : Number(best);
  }

  function chooseSkill() {
    var last = load().last, tot = 0, now = Date.now();
    var ws = Object.keys(SKILLS).map(function (k) {
      var F = (root.__FOCUS && root.__FOCUS.weights) || {};
      var w = k === last ? 0 : (k in F ? F[k] : SKILLS[k].w), x = st(k);
      if (x.missAt && now - x.missAt < DAY) w *= 1.8;        // missed today: back sooner
      if (dueReview(k) !== null) w *= 1.5;                     // a recall check is due
      if (mastered(k)) w *= 0.25;                              // mastered: light review only
      tot += w; return [k, w];
    });
    var q = load().nextSkill; if (q && SKILLS[q]) { load().nextSkill = null; save(); return q; } // missed last stop: a fresh one now
    var r = Math.random() * tot;
    for (var i = 0; i < ws.length; i++) { r -= ws[i][1]; if (r <= 0) return ws[i][0]; }
    return ws[0][0];
  }
  function leastSeen(list, store, idOf) {
    var now = Date.now();
    var scored = list.map(function (it) {
      var s = store[idOf(it)] || { n: 0, right: 0, missAt: 0 };
      var pri = (s.missAt && now - s.missAt > 60000 && s.lastOk === false ? -1000 : 0) + s.n * 10 + Math.random();
      return [pri, it];
    });
    scored.sort(function (a, b) { return a[0] - b[0]; });
    return scored[0][1];
  }

  function spellItem() {
    var L = load(), now = Date.now();
    var pool = WORDS.map(function (w) { return { kind: 'chunk', w: w }; }).concat(WORDS.map(function (w) { return { kind: 'fix', w: w }; }))
      .concat(BUILDS.map(function (b) { return { kind: 'build', b: b }; }));
    var idOf = function (x) { return x.kind + ':' + (x.w ? x.w.w : x.b[2]); };
    var due = pool.filter(function (x) { var s = L.words[idOf(x)]; return s && s.due && s.due <= now; });
    var fresh = pool.filter(function (x) { var s = L.words[idOf(x)]; return !s || !s.mastered; });
    var p, review = false;
    if (due.length && Math.random() < 0.4) { p = due[Math.floor(Math.random() * due.length)]; review = true; }
    else p = leastSeen(fresh.length ? fresh : pool, L.words, idOf);
    var it;
    if (p.kind === 'chunk') {
      it = { q: p.w.c.map(function (c, i) { return i === p.w.m ? '___' : c; }).join(' · '), sub: 'Meaning: ' + p.w.d + '. Type the WHOLE word.', say: p.w.w, ans: p.w.w, mode: 'text', value: 30, copies: 2,
        steps: ['In chunks: ' + p.w.c.join(' · ') + '.', p.w.r] };
      it.guide = [{ p: 'The trick: ' + p.w.r + ' Type just the missing chunk.', a: p.w.c[p.w.m], mode: 'text' }];
      it.finalPrompt = 'Now the whole word, from memory.';
    } else if (p.kind === 'fix') {
      it = { q: p.w.bad, sub: 'This is spelled wrong. Type it correctly.', ans: p.w.w, mode: 'text', value: 30, copies: 2,
        steps: ['In chunks: ' + p.w.c.join(' · ') + '.', p.w.r] };
      it.guide = [{ p: 'The trick: ' + p.w.r + ' It splits into ' + p.w.c.map(function (c, i) { return i === p.w.m ? '___' : c; }).join(' · ') + '. Type the missing chunk.', a: p.w.c[p.w.m], mode: 'text' }];
      it.finalPrompt = 'Now spell the whole word correctly, from memory.';
    } else {
      var b = p.b, prefix = /\+$/.test(b[0]);
      it = { q: prefix ? b[0].replace('+', '') + ' + ' + b[1] : b[0] + ' + ' + b[1].replace('+', ''), sub: 'Join them into one word.', ans: b[2], mode: 'text', value: 30, copies: 2,
        steps: [b[3], 'So it is ' + b[2] + '.'] };
      it.guide = []; it.finalPrompt = 'The rule: ' + b[3] + ' Try the word again.';
    }
    it.key = idOf(p); it.id = 'sch-spell-' + it.key.replace(':', '-'); it.review = review;
    return it;
  }

  function next() {
    var k = chooseSkill(), x = st(k), def = SKILLS[k], it;
    if (k === 'spell') { it = spellItem(); it.skill = k; it.lvlIndex = 0; it.lvlCount = 1; }
    else {
      var rv = dueReview(k), review = rv !== null && Math.random() < 0.6;
      var li = review ? rv : Math.min(x.i, def.levels.length - 1), lvl = def.levels[li];
      if (MICRO[k] && !review && (x.scaffold || x.nearMiss)) {
        it = MICRO[k](lvl); it.mode = 'num'; it.value = 20; it.micro = true; it.guide = []; it.finalPrompt = '';
        it.id = 'sch-' + k + '-micro-' + Date.now().toString(36); x.nearMiss = null;
      } else if (GEN[k]) { it = GEN[k](lvl); it.id = 'sch-' + k + '-' + Date.now().toString(36); }
      else {
        var g = G[k], items = g.items.filter(function (y) { return y.l === lvl; });
        if (!items.length) items = g.items;
        var y = leastSeen(items, load().gram, function (z) { return k + ':' + z.s.slice(0, 28); });
        it = { q: y.s, sub: g.sub, ans: y.a, mode: g.mode, value: 30, long: true, steps: [y.why], key: k + ':' + y.s.slice(0, 28), k: g.k || 0 };
        var gg = gGuide(k, y); it.guide = gg.guide; it.finalPrompt = gg.finalPrompt;
        it.id = 'sch-' + k + '-' + it.key.slice(k.length + 1).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      }
      it.skill = k; it.level = lvl; it.lvlIndex = li; it.lvlCount = def.levels.length; it.review = review;
    }
    it.copies = it.copies || 1;
    // Anti-inflation: a recall check on something already passed pays half; a guess on a k-choice item
    // costs value/(k-1) when wrong, so guessing is worth nothing on average.
    var seenToday = it.key && ((k === 'spell' ? load().words : load().gram)[it.key] || {}).rightDay === today();
    if (it.review || seenToday || (k === 'spell' && (load().words[it.key] || {}).mastered)) it.value = Math.round(it.value / 2);
    it.penalty = it.k ? Math.round(it.value / (it.k - 1)) : 0;
    load().last = k; save();
    return it;
  }

  function norm(v, mode) {
    v = String(v || '').trim().toLowerCase();
    if (mode === 'text') return v.replace(/[^a-z0-9]/g, '');
    if (mode === 'rem') { var m = /^(\d[\d,]*)\s*r\s*(\d+)$/.exec(v.replace(/\s+/g, ' ')); return m ? Number(m[1].replace(/,/g, '')) + 'r' + Number(m[2]) : v; }
    v = v.replace(/,/g, '');
    if (!/^-?\d*\.?\d+$/.test(v) && !/^-?\d+\.$/.test(v)) return v;
    var n = v.replace(/^(-?)0+(?=\d)/, '$1'); if (n.indexOf('.') >= 0) n = n.replace(/0+$/, '').replace(/\.$/, ''); if (n[0] === '.') n = '0' + n;
    return n;
  }
  // Letter/number answers also accept the full word (he typed "passive" for p and was marked wrong).
  var WORDS_FOR = {
    voice: { active: 'a', passive: 'p' },
    verbals: { gerund: 'g', participle: 'p', infinitive: 'i' },
    fragrun: { correct: 'c', fragment: 'f', runon: 'r', runonsentence: 'r', commasplice: 'r' },
    sentence: { simple: '1', compound: '2', complex: '3', compoundcomplex: '4' },
  };
  // Throwaway answers (he types "0" or a key-mash to skip): never pay, never lower his level, never let him move on.
  var MATHS = { 'dec-mul': 1, 'long-div': 1, 'dec-div': 1, 'rem-word': 1, 'zeros-div': 1 };
  function isJunk(it, typed, ms) {
    var t = String(typed || '').trim().toLowerCase(), a = String(it.ans || '').toLowerCase();
    if (check(it, typed)) return false;
    if (/^0+([.,]0*)?$/.test(t) && !/^0+$/.test(a)) return true;              // "0", "00", "0.0"
    if (MATHS[it.skill] && ms < 5000) return true;                              // no real working in under 5 s
    if (it.mode === 'text' && a.length >= 4 && t.length <= 1) return true;      // one letter for a word
    if (/^(.)\1{2,}$/.test(t) || /^(asdf|qwer|idk|dunno|skip|pass|no|xxx)$/.test(t)) return true; // mash / refusal
    return false;
  }
  // Typed only part of the word (e.g. the missing chunk): not a miss, just a nudge to type the whole word.
  function isPartial(it, typed) {
    if (it.skill !== 'spell') return false;
    var t = norm(typed, 'text'), a = norm(it.ans, 'text');
    return t.length >= 2 && t.length < a.length && a.indexOf(t) >= 0;
  }
  function check(it, typed) {
    var w = WORDS_FOR[it.skill], t = String(typed || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (w && w[t]) return w[t] === String(it.ans).toLowerCase();
    return norm(typed, it.mode) === norm(it.ans, it.mode);
  }

  function record(it, correct, meta) {
    meta = meta || {};
    var now = Date.now(), d = today(now);
    if (meta.junk) { // a throwaway answer: logged, but it never changes his level or mastery
      if (root.arcadeLog && root.arcadeLog.event) root.arcadeLog.event('learn.junk', { item_id: it.id, skill: it.skill, typed: meta.typed == null ? null : String(meta.typed), answer: it.ans, total_ms: Math.round(meta.totalMs || 0), surface: meta.surface || null }, { game_key: meta.gameKey || null, question_id: it.id, severity: 'audit' });
      return;
    }
    if (!correct && it.skill) { load().nextSkill = it.skill; }
    if (it.skill === 'spell') {
      var w = load().words, s = w[it.key] || (w[it.key] = { n: 0, right: 0, days: [], step: -1, due: 0 });
      s.n++; s.lastOk = !!correct;
      if (correct) {
        s.right++; s.rightDay = d; if (s.days.indexOf(d) < 0) s.days.push(d);
        s.step = Math.min(s.step + 1, GAPS.length - 1); s.due = now + GAPS[s.step] * DAY;
        if (s.days.length >= 2) s.mastered = true;   // right on 2 separate days
      } else { s.missAt = now; s.step = -1; s.due = now + 10 * 60000; s.mastered = false; s.days = []; }
    } else {
      var x = st(it.skill), def = SKILLS[it.skill];
      x.n++; if (correct) x.right++; else x.missAt = now;
      if (it.review) {
        var p = x.passed[it.lvlIndex];
        if (p && correct) {
          if (p.days.indexOf(d) < 0) p.days.push(d);
          p.step = Math.min(p.step + 1, GAPS.length - 1); p.due = now + GAPS[p.step] * DAY;
          if (p.days.length >= 2) p.mastered = true;
        } else if (p) { delete x.passed[it.lvlIndex]; x.i = Math.min(x.i, it.lvlIndex); x.run = []; }
      } else {
        if (it.micro) { // scaffold mode: 2 quick ones right -> back to full problems at the same level; 2 missed -> one level down
          if (correct) { x.microRight = (x.microRight || 0) + 1; x.microMiss = 0; if (x.microRight >= 2) { x.scaffold = false; x.microRight = 0; } }
          else { x.microMiss = (x.microMiss || 0) + 1; x.microRight = 0; if (x.microMiss >= 2) { if (x.i > 0) x.i--; x.microMiss = 0; x.scaffold = false; x.run = []; } }
          save(); return logItem(it, correct, meta);
        }
        x.run.push(correct ? 1 : 0); if (x.run.length > 6) x.run.shift(); // micro items never count toward level-ups
        if (!correct && MATHS[it.skill] && meta.typed != null) { // near miss: right digits, wrong point / within 5% -> a micro on that step next
          var dg = function (v) { return String(v).replace(/[^0-9]/g, '').replace(/^0+|0+$/g, ''); }, tv = Number(String(meta.typed).replace(/,/g, '')), av = Number(String(it.ans).replace(/,/g, ''));
          if (dg(meta.typed) && dg(meta.typed) === dg(it.ans)) x.nearMiss = 'point'; else if (av && Math.abs(tv - av) / Math.abs(av) <= 0.05) x.nearMiss = 'close';
        }
        var need = LCFG().stepUp || 4, tail = x.run.slice(-need), last3 = x.run.slice(-3);
        if (tail.length === need && tail.every(Boolean)) {                       // push: up a level now
          if (!x.passed[x.i]) x.passed[x.i] = { at: now, step: 0, due: now + GAPS[0] * DAY, days: [], mastered: false };
          if (x.i < def.levels.length - 1) x.i++;
          x.run = [];
        } else if (last3.length === 3 && last3.filter(function (v) { return !v; }).length >= 2) {
          // Struggling: scaffold with micro questions first (productive struggle); the level only drops if those fail too.
          if (MICRO[it.skill]) { x.scaffold = true; x.run = []; } else if (x.i > 0) { x.i--; x.run = []; }
        }
      }
    }
    if (it.key && it.skill !== 'spell') {
      var gs = load().gram, g = gs[it.key] || (gs[it.key] = { n: 0, right: 0, missAt: 0 });
      g.n++; g.lastOk = !!correct; if (correct) { g.right++; g.rightDay = today(now); } else g.missAt = now;
    }
    save();
    logItem(it, correct, meta);
  }

  function logItem(it, correct, meta) {
    if (root.arcadeLog && root.arcadeLog.event) {
      var xs = it.skill === 'spell' ? null : st(it.skill);
      root.arcadeLog.event('learn.item', {
        item_id: it.id, skill: it.skill, level: it.level == null ? null : it.level, level_index: it.lvlIndex, level_count: it.lvlCount,
        review: !!it.review, micro: !!it.micro, scaffold: xs ? !!xs.scaffold : null, prompt: it.q, correct: !!correct, typed: meta.typed == null ? null : String(meta.typed), answer: it.ans,
        total_ms: Math.round(meta.totalMs || 0), surface: meta.surface || null,
        now_level_index: xs ? xs.i : null, mastered_levels: xs ? Object.keys(xs.passed).filter(function (i) { return xs.passed[i].mastered; }).length : null,
        passed_levels: xs ? Object.keys(xs.passed).length : null, skill_mastered: xs ? mastered(it.skill) : null,
        word_mastered: it.skill === 'spell' ? !!(load().words[it.key] || {}).mastered : null,
      }, { game_key: meta.gameKey || null, question_id: it.id, severity: 'audit' });
    }
  }

  root.School = { queue: function (k) { if (SKILLS[k]) { load().nextSkill = k; save(); } }, snapshot: function () { return JSON.parse(JSON.stringify(load())); }, isPartial: isPartial, isJunk: isJunk, next: next, check: check, record: record, norm: norm, _gen: GEN, _words: WORDS, _builds: BUILDS, _sent: SENT, _subj: SUBJ, _g: G, _skills: SKILLS, _divSteps: divSteps, _dstr: dstr, _dec: dec, _st: st, _mastered: mastered, levels: function () { return load().skills; } };
})(typeof window !== 'undefined' ? window : globalThis);

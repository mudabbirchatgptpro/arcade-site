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
  function sk(k) { var s = load().skills; return s[k] || (s[k] = { lvl: 4, streak: 0, n: 0, right: 0, missAt: 0 }); }
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
  var GEN = {
    'dec-mul': function (lvl) { // Topic 4-5: multiply a decimal by a decimal
      var a, b;
      if (lvl <= 3) { a = dec(R(12, 98), 1); b = dec(R(13, 89), 0); }
      else if (lvl === 4) { a = dec(R(12, 98), 1); b = dec(R(12, 98), 1); }
      else { a = dec(R(102, 989), 2); b = pickOf([dec(R(2, 9), 2), dec(R(12, 89), 1), dec(R(3, 9), 1)]); }
      if (a.i % 10 === 0) a.i += 3; if (b.i % 10 === 0 && b.s) b.i += 1;
      var p = dec(a.i * b.i, a.s + b.s), ans = dstr(p);
      return {
        q: dstr(a) + ' × ' + dstr(b), ans: ans, mode: 'num', value: 30,
        steps: ['Ignore the points: ' + a.i + ' × ' + b.i + ' = ' + fmtInt(a.i * b.i) + '.',
          'Count decimal places: ' + a.s + ' + ' + b.s + ' = ' + (a.s + b.s) + '.',
          'Put the point ' + (a.s + b.s) + ' place' + (a.s + b.s > 1 ? 's' : '') + ' in from the right: ' + ans + '.',
          'Check by estimating: about ' + Math.round(a.i / Math.pow(10, a.s)) + ' × ' + (Math.round(b.i / Math.pow(10, b.s) * 10) / 10) + '.'],
      };
    },
    'long-div': function (lvl) { // Topic 5: divide by 2-digit divisors
      var d, q, r = 0;
      if (lvl <= 3) { d = R(21, 49); q = R(13, 39); }
      else if (lvl === 4) { d = R(23, 89); q = pickOf([R(101, 109), R(201, 209), R(301, 309), R(401, 409), R(110, 190)]); }
      else { d = R(31, 97); q = R(120, 890); r = R(1, d - 1); }
      if (d % 10 === 0) d += 3;
      var D = d * q + r;
      return {
        q: fmtInt(D) + ' ÷ ' + d, ans: r ? q + ' R ' + r : String(q), mode: r ? 'rem' : 'num', value: r ? 40 : 30,
        hint: r ? 'Answer like 207 R 12' : '', steps: divSteps(D, d),
      };
    },
    'dec-div': function (lvl) { // Topic 6: divide decimals
      var q, dv, D;
      if (lvl <= 3) { q = dec(R(21, 99), 1); dv = R(12, 48); D = dec(q.i * dv, 1);
        return { q: dstr(D) + ' ÷ ' + dv, ans: dstr(q), mode: 'num', value: 30,
          steps: ['Divide as if there were no point: ' + fmtInt(D.i) + ' ÷ ' + dv + ' = ' + q.i + '.', 'The point goes straight up into the answer: ' + dstr(q) + '.'] }; }
      if (lvl === 4) { q = R(12, 86); dv = dec(R(12, 89), 2); if (dv.i % 10 === 0) dv.i += 1; D = dec(q * dv.i, 2);
        return { q: dstr(D) + ' ÷ ' + dstr(dv), ans: String(q), mode: 'num', value: 30,
          steps: ['Make the divisor whole: move both points 2 places right.', dstr(D) + ' ÷ ' + dstr(dv) + ' becomes ' + fmtInt(D.i) + ' ÷ ' + dv.i + '.', fmtInt(D.i) + ' ÷ ' + dv.i + ' = ' + q + '.'] }; }
      var k = R(2, 9), m = R(2, 9) * pickOf([10, 100]), sh = pickOf([1, 2]);
      dv = dec(k, sh); var whole = k * m; // whole ÷ 0.k or 0.0k
      var ansN = m * Math.pow(10, sh);
      return { q: fmtInt(whole) + ' ÷ ' + dstr(dv), ans: String(ansN), mode: 'num', value: 30,
        steps: ['Make the divisor whole: move both points ' + sh + ' place' + (sh > 1 ? 's' : '') + ' right.', fmtInt(whole) + ' becomes ' + fmtInt(whole * Math.pow(10, sh)) + ', and ' + dstr(dv) + ' becomes ' + k + '.', fmtInt(whole * Math.pow(10, sh)) + ' ÷ ' + k + ' = ' + fmtInt(ansN) + '.', 'Dividing by a number less than 1 makes the answer BIGGER.'] };
    },
    'zeros-div': function (lvl) { // his dropped-zero mistake (4800 ÷ 6 answered 80)
      var a = R(2, 9), b = R(2, 9), z1 = lvl >= 5 ? R(3, 5) : R(2, 4), z2 = R(1, Math.min(2, z1 - 1));
      var D = a * b * Math.pow(10, z1), d = b * Math.pow(10, z2), q = a * Math.pow(10, z1 - z2);
      return { q: fmtInt(D) + ' ÷ ' + fmtInt(d), ans: String(q), mode: 'num', value: 30,
        steps: ['Cancel the same number of zeros from both: take ' + z2 + ' off each.', fmtInt(D / Math.pow(10, z2)) + ' ÷ ' + b + ' = ' + fmtInt(q) + '.', 'Count the zeros in your answer: ' + (z1 - z2) + '.'] };
    },
    'rem-word': function (lvl) { // remainder word problems: round up, drop, or leftover
      var d = R(lvl >= 5 ? 24 : 12, lvl >= 5 ? 48 : 30), q = R(lvl >= 5 ? 21 : 11, lvl >= 5 ? 79 : 40), r = R(1, d - 1), N = d * q + r;
      var t = pickOf(['up', 'drop', 'left']);
      if (t === 'up') return { q: N + ' kids are going on a field trip. Each bus holds ' + d + '. How many buses do they need?', ans: String(q + 1), mode: 'num', value: 40, long: true,
        steps: [N + ' ÷ ' + d + ' = ' + q + ' R ' + r + '.', 'The ' + r + ' leftover kids still need a bus, so round UP.', 'Answer: ' + (q + 1) + ' buses.'] };
      if (t === 'drop') return { q: 'A pack holds ' + d + ' trading cards. Parker has ' + N + ' cards. How many FULL packs can he make?', ans: String(q), mode: 'num', value: 40, long: true,
        steps: [N + ' ÷ ' + d + ' = ' + q + ' R ' + r + '.', 'The ' + r + ' leftover cards cannot fill a pack, so drop them.', 'Answer: ' + q + ' full packs.'] };
      return { q: N + ' emeralds are shared equally among ' + d + ' players. How many emeralds are left over?', ans: String(r), mode: 'num', value: 40, long: true,
        steps: [N + ' ÷ ' + d + ' = ' + q + ' R ' + r + '.', 'The question asks for what is LEFT, so the answer is the remainder.', 'Answer: ' + r + '.'] };
    },
  };

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
    { w: 'necessary', c: ['nec', 'es', 'sar', 'y'], m: 2, bad: 'neccesary', r: 'One c, two s (one collar, two sleeves).' },
    { w: 'separate', c: ['sep', 'a', 'rate'], m: 1, bad: 'seperate', r: 'There is "a rat" in sep-A-RATe.' },
    { w: 'definitely', c: ['def', 'i', 'nite', 'ly'], m: 2, bad: 'definately', r: 'Built from finite: de + FINITE + ly.' },
    { w: 'receive', c: ['re', 'ceive'], m: 1, bad: 'recieve', r: 'i before e, except after c.' },
    { w: 'ceiling', c: ['ceil', 'ing'], m: 0, bad: 'cieling', r: 'After c it is ei.' },
    { w: 'achieve', c: ['a', 'chieve'], m: 1, bad: 'acheive', r: 'Sounds like "ee" and not after c: ie.' },
    { w: 'weird', c: ['weird'], m: 0, bad: 'wierd', r: 'Rule breaker: weird is weird, it breaks i before e.' },
    { w: 'neighbor', c: ['neigh', 'bor'], m: 0, bad: 'nieghbor', r: 'ei when it sounds like "ay", as in neigh.' },
    { w: 'foreign', c: ['for', 'eign'], m: 1, bad: 'foriegn', r: 'Rule breaker: for + EIGN, like reign.' },
    { w: 'environment', c: ['en', 'vi', 'ron', 'ment'], m: 2, bad: 'enviroment', r: 'Hidden IRON: env-IRON-ment.' },
    { w: 'government', c: ['gov', 'ern', 'ment'], m: 1, bad: 'goverment', r: 'govern + ment: keep the n.' },
    { w: 'February', c: ['Feb', 'ru', 'ar', 'y'], m: 1, bad: 'Febuary', r: 'Say the first r: Feb-RU-ary.' },
    { w: 'Wednesday', c: ['Wed', 'nes', 'day'], m: 1, bad: 'Wensday', r: 'Say it in chunks: WED-NES-day.' },
    { w: 'restaurant', c: ['res', 'tau', 'rant'], m: 1, bad: 'resturant', r: 'The tricky middle is TAU.' },
    { w: 'embarrass', c: ['em', 'bar', 'rass'], m: 2, bad: 'embarass', r: 'Double r AND double s: you go Really Red and Smile Shyly.' },
    { w: 'accommodate', c: ['ac', 'com', 'mo', 'date'], m: 1, bad: 'accomodate', r: 'Double c AND double m: room for two of each.' },
    { w: 'occasion', c: ['oc', 'ca', 'sion'], m: 0, bad: 'ocassion', r: 'Double c, one s.' },
    { w: 'recommend', c: ['rec', 'om', 'mend'], m: 2, bad: 'reccomend', r: 're + commend: one c, double m.' },
    { w: 'privilege', c: ['priv', 'i', 'lege'], m: 2, bad: 'priviledge', r: 'No d anywhere: privi-LEGE.' },
    { w: 'knowledge', c: ['know', 'ledge'], m: 1, bad: 'knowlege', r: 'know + LEDGE: silent k, and keep the d.' },
    { w: 'conscience', c: ['con', 'science'], m: 1, bad: 'concience', r: 'con + SCIENCE.' },
    { w: 'muscle', c: ['mus', 'cle'], m: 1, bad: 'mussle', r: 'Silent c: mus-CLE.' },
    { w: 'guarantee', c: ['guar', 'an', 'tee'], m: 0, bad: 'garantee', r: 'Silent u after g: GUar.' },
    { w: 'interrupt', c: ['in', 'ter', 'rupt'], m: 2, bad: 'interupt', r: 'inter + rupt: two r where they meet.' },
    { w: 'responsible', c: ['re', 'spon', 'si', 'ble'], m: 3, bad: 'responsable', r: '-ible when what is left is not a whole word (respons- is not a word).' },
    { w: 'visible', c: ['vis', 'i', 'ble'], m: 2, bad: 'visable', r: '-ible: vis- is not a word on its own.' },
    { w: 'comfortable', c: ['com', 'fort', 'a', 'ble'], m: 2, bad: 'comfortible', r: '-able: comfort IS a whole word.' },
    { w: 'dependable', c: ['de', 'pend', 'a', 'ble'], m: 2, bad: 'dependible', r: '-able: depend IS a whole word.' },
    { w: 'musician', c: ['mu', 'si', 'cian'], m: 2, bad: 'musition', r: '-cian for a person who does it (music → musician).' },
    { w: 'explanation', c: ['ex', 'pla', 'na', 'tion'], m: 1, bad: 'explaination', r: 'explain loses its i: ex-PLA-nation.' },
    { w: 'permission', c: ['per', 'mis', 'sion'], m: 2, bad: 'permision', r: 'permit → permission: double s.' },
  ];
  // Build items: base + suffix (or prefix + base). r = the rule that decides the spelling.
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

  // ── Sentence structure ──
  // t: 1 simple, 2 compound, 3 complex, 4 compound-complex. why = the breakdown.
  var SENT = [
    { s: 'Parker and his cousin built a tower and defended it all night.', t: 1, why: 'One subject (Parker and his cousin), one verb set (built and defended). One clause: SIMPLE.' },
    { s: 'After the long, noisy storm, the creepers crept out of the cave.', t: 1, why: '"After the long, noisy storm" has no verb: it is a phrase. One clause: SIMPLE.' },
    { s: 'Running down the hallway, the dog slid into the wall.', t: 1, why: '"Running down the hallway" has no subject doing a verb: a phrase. One clause: SIMPLE.' },
    { s: 'During the game, neither the coach nor the players noticed the rain.', t: 1, why: 'Two people in one subject, one verb (noticed). One clause: SIMPLE.' },
    { s: 'The boy with the red backpack won the spelling bee.', t: 1, why: '"with the red backpack" is a phrase. One clause: SIMPLE.' },
    { s: 'Rolf jumped onto the counter and knocked over a glass of milk.', t: 1, why: 'One subject (Rolf) with two verbs, no second subject. SIMPLE.' },
    { s: 'The zombies attacked at midnight, but the villagers were ready.', t: 2, why: 'Two full sentences (zombies attacked / villagers were ready) joined by ", but". COMPOUND.' },
    { s: 'Parker finished his math, so he earned extra game time.', t: 2, why: 'Two full sentences joined by ", so". COMPOUND.' },
    { s: 'The test was hard; however, everyone passed.', t: 2, why: 'Two full sentences joined by a semicolon. COMPOUND.' },
    { s: 'You can build the bridge, or you can swim across the river.', t: 2, why: 'Two full sentences joined by ", or". COMPOUND.' },
    { s: 'Mia likes soccer; her brother prefers chess.', t: 2, why: 'Two full sentences joined by a semicolon. COMPOUND.' },
    { s: 'Because the server crashed, nobody could log in.', t: 3, why: '"Because the server crashed" cannot stand alone (dependent). One main clause + one dependent: COMPLEX.' },
    { s: 'The player who found the diamond shared it with the team.', t: 3, why: '"who found the diamond" is a dependent clause inside the main one. COMPLEX.' },
    { s: 'When the bell rings, put your pencils down.', t: 3, why: '"When the bell rings" is dependent; "(you) put your pencils down" is the main clause. COMPLEX.' },
    { s: 'We stayed inside until the storm passed.', t: 3, why: '"until the storm passed" is dependent. COMPLEX.' },
    { s: 'The book that Parker borrowed is overdue.', t: 3, why: '"that Parker borrowed" is a dependent clause. COMPLEX.' },
    { s: 'Although he was tired, Parker finished the last level.', t: 3, why: '"Although he was tired" is dependent. COMPLEX.' },
    { s: 'When the creeper exploded, the wall fell, and the sheep ran away.', t: 4, why: 'Two main clauses (the wall fell / the sheep ran away) + one dependent (When the creeper exploded). COMPOUND-COMPLEX.' },
    { s: 'Parker wanted to play outside, but it rained because a storm rolled in.', t: 4, why: 'Two main clauses joined by ", but" + the dependent "because a storm rolled in". COMPOUND-COMPLEX.' },
    { s: 'The team that practiced hardest won, so the coach bought pizza.', t: 4, why: 'Two main clauses joined by ", so" + the dependent "that practiced hardest". COMPOUND-COMPLEX.' },
    { s: 'Although the map was old, it was accurate, and we found the treasure.', t: 4, why: 'Two main clauses joined by ", and" + the dependent "Although the map was old". COMPOUND-COMPLEX.' },
    { s: 'I will help you if you ask, but you must ask nicely.', t: 4, why: 'Two main clauses joined by ", but" + the dependent "if you ask". COMPOUND-COMPLEX.' },
  ];
  // Find the subject (hidden "you" in commands; subjects after the verb).
  var SUBJ = [
    { s: 'After dinner, please take out the trash.', a: 'you', why: 'A command: the subject is the hidden "you".' },
    { s: "Don't forget your lunch!", a: 'you', why: 'A command: the subject is the hidden "you".' },
    { s: 'Before the game starts, grab your helmet and stretch.', a: 'you', why: 'A command: "(you) grab and stretch". The subject is the hidden "you".' },
    { s: 'Close to the door stood a tall man.', a: 'man', why: 'Who stood? A tall MAN. The subject comes after the verb here.' },
    { s: 'Here comes the bus.', a: 'bus', why: 'What comes? The BUS. "Here" is never the subject.' },
    { s: 'In the box were three sleepy puppies.', a: 'puppies', why: 'What were in the box? PUPPIES. "box" is inside a phrase, so it cannot be the subject.' },
    { s: 'One of the players on the team was injured.', a: 'one', why: 'Who was injured? ONE (of the players). "players" sits inside the phrase "of the players".' },
    { s: 'There are two creepers behind you.', a: 'creepers', why: 'What are behind you? CREEPERS. "There" is never the subject.' },
  ];

  // ── Picking ──
  var MIX = [['dec-mul', 18], ['long-div', 16], ['dec-div', 16], ['rem-word', 10], ['zeros-div', 6], ['spell', 20], ['sentence', 14]];
  function weightOf(k) {
    var w = 0; MIX.forEach(function (m) { if (m[0] === k) w = m[1]; });
    var s = sk(k); if (s.missAt && Date.now() - s.missAt < 86400000) w *= 1.8; // missed today: comes back more
    return w;
  }
  function chooseSkill() {
    var last = load().last, tot = 0, ws = MIX.map(function (m) { var w = m[0] === last ? 0 : weightOf(m[0]); tot += w; return [m[0], w]; });
    var x = Math.random() * tot;
    for (var i = 0; i < ws.length; i++) { x -= ws[i][1]; if (x <= 0) return ws[i][0]; }
    return ws[0][0];
  }
  function leastSeen(list, store, idOf) {
    var now = Date.now();
    var scored = list.map(function (it) {
      var st = store[idOf(it)] || { n: 0, right: 0, missAt: 0 };
      var pri = (st.missAt && now - st.missAt > 60000 && st.right < 2 ? -1000 : 0) + st.n * 10 + (st.right >= 2 ? 50 : 0) + Math.random();
      return [pri, it];
    });
    scored.sort(function (a, b) { return a[0] - b[0]; });
    return scored[0][1];
  }

  function next() {
    var k = chooseSkill(), s = sk(k), it;
    if (GEN[k]) { it = GEN[k](s.lvl); it.id = 'sch-' + k + '-' + Date.now().toString(36); }
    else if (k === 'spell') {
      var L = load();
      var pool = WORDS.map(function (w) { return { kind: 'chunk', w: w }; }).concat(WORDS.map(function (w) { return { kind: 'fix', w: w }; }))
        .concat(BUILDS.map(function (b) { return { kind: 'build', b: b }; }));
      var p = leastSeen(pool, L.words, function (x) { return x.kind + ':' + (x.w ? x.w.w : x.b[2]); });
      if (p.kind === 'chunk') {
        var shown = p.w.c.map(function (c, i) { return i === p.w.m ? '___' : c; }).join(' · ');
        it = { q: shown, sub: 'Type the WHOLE word.', ans: p.w.w, mode: 'text', value: 30, copies: 2,
          steps: ['In chunks: ' + p.w.c.join(' · ') + '.', p.w.r] };
      } else if (p.kind === 'fix') {
        it = { q: p.w.bad, sub: 'This is spelled wrong. Type it correctly.', ans: p.w.w, mode: 'text', value: 30, copies: 2,
          steps: ['In chunks: ' + p.w.c.join(' · ') + '.', p.w.r] };
      } else {
        var b = p.b, prefix = /\+$/.test(b[0]);
        it = { q: prefix ? b[0].replace('+', '') + ' + ' + b[1] : b[0] + ' + ' + b[1].replace('+', ''), sub: 'Join them into one word.', ans: b[2], mode: 'text', value: 30, copies: 2,
          steps: [b[3], 'So it is ' + b[2] + '.'] };
      }
      it.key = p.kind + ':' + (p.w ? p.w.w : p.b[2]); it.id = 'sch-spell-' + it.key.replace(':', '-');
    } else {
      var G = load().gram;
      if (Math.random() < 0.7) {
        var x = leastSeen(SENT, G, function (y) { return 'sent:' + y.s.slice(0, 24); });
        it = { q: x.s, sub: 'Type 1 simple · 2 compound · 3 complex · 4 compound-complex', ans: String(x.t), mode: 'num', value: 30, long: true, steps: [x.why], key: 'sent:' + x.s.slice(0, 24) };
      } else {
        var y = leastSeen(SUBJ, G, function (z) { return 'subj:' + z.s.slice(0, 24); });
        it = { q: y.s, sub: 'Type the SUBJECT (one word).', ans: y.a, mode: 'text', value: 30, long: true, steps: [y.why], key: 'subj:' + y.s.slice(0, 24) };
      }
      it.id = 'sch-gram-' + it.key.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    }
    it.skill = k; it.level = s.lvl; it.copies = it.copies || 1;
    load().last = k; save();
    return it;
  }

  function norm(v, mode) {
    v = String(v || '').trim().toLowerCase();
    if (mode === 'text') return v.replace(/[^a-z]/g, '');
    if (mode === 'rem') { var m = /^(\d[\d,]*)\s*r\s*(\d+)$/.exec(v.replace(/\s+/g, ' ')); return m ? Number(m[1].replace(/,/g, '')) + 'r' + Number(m[2]) : v; }
    v = v.replace(/,/g, '');
    if (!/^-?\d*\.?\d+$/.test(v) && !/^-?\d+\.$/.test(v)) return v;
    var n = v.replace(/^(-?)0+(?=\d)/, '$1'); if (n.indexOf('.') >= 0) n = n.replace(/0+$/, '').replace(/\.$/, ''); if (n[0] === '.') n = '0' + n;
    return n;
  }
  function check(it, typed) { return norm(typed, it.mode) === norm(it.ans, it.mode); }

  function record(it, correct, meta) {
    meta = meta || {};
    var s = sk(it.skill);
    s.n++; if (correct) { s.right++; s.streak++; if (s.streak >= 2 && s.lvl < 5) { s.lvl++; s.streak = 0; } }
    else { s.streak = 0; s.missAt = Date.now(); if (s.lvl > 3) s.lvl--; }
    if (it.key) {
      var store = it.skill === 'spell' ? load().words : load().gram;
      var st = store[it.key] || (store[it.key] = { n: 0, right: 0, missAt: 0 });
      st.n++; if (correct) st.right++; else st.missAt = Date.now();
    }
    save();
    if (root.arcadeLog && root.arcadeLog.event) {
      root.arcadeLog.event('learn.item', {
        item_id: it.id, skill: it.skill, level: it.level, prompt: it.q, correct: !!correct, typed: meta.typed == null ? null : String(meta.typed),
        answer: it.ans, total_ms: Math.round(meta.totalMs || 0), surface: meta.surface || null,
      }, { game_key: meta.gameKey || null, question_id: it.id, severity: 'audit' });
    }
  }

  root.School = { next: next, check: check, record: record, norm: norm, _gen: GEN, _words: WORDS, _builds: BUILDS, _sent: SENT, _subj: SUBJ, _divSteps: divSteps, _dstr: dstr, _dec: dec, levels: function () { return load().skills; } };
})(typeof window !== 'undefined' ? window : globalThis);

// node selftest.cjs — checks the scheduling logic the app relies on.
const assert = require('assert');
const C = require('./src/core.js');
const M = C.MIN;
let n = 0;
const ok = (c, msg) => { assert.ok(c, msg); n++; };
const eq = (a, b, msg) => { assert.deepStrictEqual(a, b, msg); n++; };

eq(C.parseDur('3h30'), 210, 'h+m'); eq(C.parseDur('3:30'), 210, 'colon'); eq(C.parseDur('45'), 45, 'bare');
eq(C.parseDur('45m'), 45, 'm'); eq(C.parseDur('1.5h'), 90, 'decimal h'); ok(Number.isNaN(C.parseDur('soon')), 'junk is NaN');
eq(C.fmtDur(210), '3 h 30', 'fmt'); eq(C.fmtDur(60), '1 h', 'fmt hour'); eq(C.toC(350), 175, 'F->C'); eq(C.toF(180), 355, 'C->F');

// backwards from serve: turkey 210 cook + 40 rest + 20 prep, serve 17:00
const serve = new Date(2026, 10, 26, 17, 0).getTime();
const t = C.PRESETS.thanksgiving;
const s = C.schedule(t.dishes, serve);
const turkey = s.items[0];
eq(new Date(turkey.pullAt).getHours() * 60 + new Date(turkey.pullAt).getMinutes(), 16 * 60 + 20, 'turkey pulled 16:20');
eq(new Date(turkey.fireAt).getHours() * 60 + new Date(turkey.fireAt).getMinutes(), 12 * 60 + 50, 'turkey in at 12:50');
eq((turkey.fireAt - turkey.prepAt) / M, 20, 'prep before fire');
ok(s.events.filter(e => e.kind === 'check' && e.dish === 'Turkey 14 lb').length === 4, 'baste every 45 min, 4 times');
eq(s.events[s.events.length - 1].kind, 'serve', 'serve last');
ok(s.events.every((e, i) => !i || s.events[i - 1].t <= e.t), 'events sorted');
ok(s.events.some(e => e.kind === 'heat' && /Preheat oven to 325/.test(e.text)), 'preheat 325');
ok(s.events.some(e => e.kind === 'heat' && /Oven up to 375/.test(e.text) && new Date(e.t).getMinutes() === 20), 'dial up as the turkey comes out');

// raw plan: green beans 350 (16:35-17:00) overlaps stuffing 375 (16:20-17:00) -> clash
ok(s.clashes.length >= 1, 'clash found');
ok(s.clashes[0].temps.includes(350) && s.clashes[0].temps.includes(375), 'clash names temps');
// solved: no clash, something held warm
const sv = C.schedule(t.dishes, serve, { solve: true });
eq(sv.clashes, [], 'solve removes clashes');
eq(sv.items[2].dish.temp, 375, 'green beans share 375 with stuffing');
eq(sv.items[2].moved, 350, 'remembers recipe temp');
ok(sv.events.some(e => /25° hotter/.test(e.text)), 'tells you to check early');
// a dish that can finish early instead: two 30-min dishes at different temps, one oven, nothing to share with
const hv = C.schedule([{ name: 'Pie', temp: 425, cook: 30 }, { name: 'Bake', temp: 300, cook: 30 }], serve, { solve: true });
eq(hv.clashes, [], 'hold solves'); eq(hv.items[1].hold, 30, 'second dish finishes 30 min early'); ok(hv.events.some(e => e.kind === 'hold'), 'hold event');
eq(sv.items[0].hold, 0, 'turkey keeps its slot');
// two ovens: stuffing alone at 375 next to turkey is fine, but three temps at once still clash
eq(C.ovenClashes(C.schedule([t.dishes[0], t.dishes[1]], serve).items, 2), [], 'two ovens fit two temps');
// same temperature shares the oven
eq(C.schedule([{ name: 'A', temp: 350, cook: 60 }, { name: 'B', temp: 350, cook: 30 }], serve).clashes, [], 'same temp shares');

// share link round trip
const tok = C.encodeMenu({ serve: '17:00', title: 'Friendsgiving ✓', dishes: t.dishes });
const back = C.decodeMenu(tok);
eq(back.serve, '17:00', 'serve back'); eq(back.title, 'Friendsgiving ✓', 'unicode title'); eq(back.dishes.length, 6, 'dishes back');
eq(back.dishes[0], C.clean(t.dishes[0]), 'dish back');
ok(/^[A-Za-z0-9_-]+$/.test(tok), 'url-safe token');
eq(C.decodeMenu('nope'), null, 'bad token'); eq(C.decodeMenu(''), null, 'empty token');

// serve time picks today, or tomorrow once well past
const noon = new Date(2026, 10, 26, 12, 0).getTime();
eq(new Date(C.serveAt('17:00', noon)).getDate(), 26, 'today');
eq(new Date(C.serveAt('09:00', noon)).getDate(), 27, 'tomorrow');
eq(C.countdown(3725000), '1:02:05', 'countdown'); eq(C.countdown(65000), '1:05', 'countdown short');
eq(C.clock(serve), '5:00 PM', '12h'); eq(C.clock(serve, true), '17:00', '24h');
console.log('selftest ok,', n, 'checks');

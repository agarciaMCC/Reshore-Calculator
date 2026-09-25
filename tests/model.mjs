// @rules MDL-01, MDL-06, MDL-19  (see DECISIONS.md)
// THE McCLONE SEQUENCE ITSELF. Not ACI: find the slab loading conditions, turn
// them into capacities, take the floor-to-ceiling heights, run the resultant
// load floor by floor, pick a shore by height and capacity, and that pick
// sets the grid the field installs. Every other MDL rule assumes this one;
// nothing asserted it until now.
//  A. condition -> capacity: SDL + 1.6/1.3 x LL, 0.6 on a reducible LL,
//     truncated. "Reducible at columns" is NOT reduced for the slab (MDL-06).
//  B. placement load = slab/12 x 150 + construction load (30 default)
//  C. the cascade: residual = incoming - capacity, carried down until a floor
//     absorbs it or slab on grade takes it
//  D. the shore is picked by height AND capacity, and the pick sets the grid
//  E. the steps in the app run in that order, and Results is gated on them
//  F. the chain is live end to end: change a condition, the grid changes
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= (tol || 0.01), `${m}: ${a} vs ${b}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

console.log('A. a loading condition becomes a capacity');
const A = await page.evaluate(() => ({
  factor: LL_FACTOR, red: LL_REDUCTION,
  kalae: markCapacity(25, 40, true),        // the Kalae chart's 54 PSF typical
  full: markCapacity(25, 40, false),
  trunc: markCapacity(10, 125, false),      // 163.8 -> 163, never rounded up
  bad: markCapacity(null, 40, false),
  atCol: diagReducible('LL = 100 PSF (REDUCIBLE AT COLUMNS)'),
  plain: diagReducible('LL = 100 PSF (REDUCIBLE)'),
  non: diagReducible('LL = 100 PSF (NON-REDUCIBLE)'),
  qual: diagQualifier('LL = 100 PSF (REDUCIBLE AT COLUMNS)'),
}));
near(A.factor, 1.6 / 1.3, 1e-9, 'live-load factor is 1.6/1.3 (ASCE 37 over the 1.3 McClone factor)');
ok(A.red === 0.6, 'a reducible live load takes 0.6: ' + A.red);
ok(A.kalae === 54, 'SDL 25 + reducible LL 40 = 54 PSF, the Kalae typical: ' + A.kalae);
ok(A.full === 74, 'the same pair unreduced = 74 PSF: ' + A.full);
ok(A.trunc === 163, 'capacity is truncated, not rounded (163.8 -> 163): ' + A.trunc);
ok(A.bad === null, 'a condition missing a value has no capacity');
ok(A.atCol === false && A.qual === 'reducible at columns', 'MDL-06: "reducible at columns" is NOT reduced for the slab, and says so');
ok(A.plain === true && A.non === false, 'a plain (REDUCIBLE) is reduced, (NON-REDUCIBLE) is not');

console.log('B. the placement load');
const B = await page.evaluate(() => {
  state.project = state.project || {};
  const dflt = projectDL();
  const a = placementLoad(8, dflt), b = placementLoad(7.5, dflt);
  state.project.constructionDL = 50;
  const c = placementLoad(8, projectDL());
  delete state.project.constructionDL;
  return { dflt, a, b, c };
});
ok(B.dflt === 30, 'construction load defaults to 30 PSF: ' + B.dflt);
ok(B.a === 130, 'an 8" slab places 100 + 30 = 130 PSF: ' + B.a);
ok(B.b === 123.75, 'a 7.5" slab places 123.75 PSF: ' + B.b);
ok(B.c === 150, 'the construction load is a project setting: 8" at 50 = ' + B.c);

// ---- a four-storey stack over grade, 1 px = 1 ft, one 8" slab per floor ----
const build = (o) => page.evaluate((o) => {
  const T = [1, 0, 0, 1, 0, 0];
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const mk = (name, el, slab, cap, extra = {}) => ({
    id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap,
    rangeFrom: null, rangeTo: null, pdfPage: 1, zones: [], slabZones: [], alignment: { transform: T, points: [] }, ...extra,
  });
  state.project = { name: 'model', shoreChoices: {}, solveStepFt: 10,
    loadingConditions: [{ mark: o.mark || 'B2', desc: 'TYP', sdl: o.sdl, ll: o.ll, reducible: !!o.reducible, confirmed: true }] };
  const cap = markCapacity(o.sdl, o.ll, !!o.reducible);
  const f2f = o.f2f || 10;
  state.levels = [
    mk('L4', 4 * f2f, 8, cap), mk('L3', 3 * f2f, 8, cap), mk('L2', 2 * f2f, 8, cap), mk('L1', f2f, 8, cap),
    mk('SOG', 0, 5, 0, { onGrade: true }),
  ];
  state.pdf.pages = 1; state.pdf.current = 1;
  // the pour's loading area carries the mark; the floors below use the level default (same mark)
  state.levels[0].zones.push({ id: sid(), polygon: sq(0, 0, 100, 100), capacityPSF: cap, mark: o.mark || 'B2', label: '', colorIdx: 0 });
  state.results = null; state.activeLevelIdx = 0;
  renderSidebar(); persist();
  return cap;
}, o);
const solve = () => page.evaluate(() => {
  const s = solveAll({ step: 10 });
  const L = s.levels[0].solve;
  return { spatial: L.spatial, reason: L.reason, n: L.regions.length,
    steps: L.regions[0].steps.map(st => ({ name: st.level.name, incoming: st.remaining, res: st.resultant, grade: !!st.grade,
      h: st.shoreHeightFt, sup: st.supportLevel && st.supportLevel.name,
      opts: st.options.map(op => ({ shore: op.shore.name, cap: op.capacityAtHeight, sf: Math.round(op.sfPerShore * 100) / 100, pattern: op.pattern, spacing: op.spacing })) })),
    reshore: L.regions[0].reshoreLevels, toGrade: L.regions[0].toGrade };
});

console.log('C. the cascade, floor by floor');
// Kalae typical: 54 PSF everywhere, 8" slab -> 130 in; 76 under L4, 22 under L3, absorbed at L2
const cap = await build({ sdl: 25, ll: 40, reducible: true });
ok(cap === 54, 'fixture capacity is 54: ' + cap);
let r = await solve();
ok(r.spatial && r.n === 1, 'one region solves: ' + r.reason);
const st = r.steps;
ok(st[0].name === 'L3' && st[0].incoming === 130, 'the fresh L4 slab arrives at L3 as 130 PSF: ' + JSON.stringify([st[0].name, st[0].incoming]));
ok(st[0].res === 76, 'L3 carries 54, 76 goes on down: ' + st[0].res);
ok(st[1].name === 'L2' && st[1].res === 22, 'L2 carries 54, 22 goes on down: ' + st[1].res);
ok(st[2].name === 'L1' && st[2].res === 22 - 54 && st[2].opts.length === 0, 'L1 absorbs the 22 with 32 to spare — a negative resultant, no shore under it: ' + JSON.stringify([st[2].name, st[2].res, st[2].opts.length]));
ok(r.reshore === 2, 'two floors of reshoring under an L4 pour: ' + r.reshore);
ok(!r.toGrade, 'and the load never reaches grade');
// take the capacity away and the load runs to grade
await build({ sdl: 0, ll: 0 });
r = await solve();
ok(r.steps.slice(0, 3).every(s => s.res === 130) && r.steps[3].grade && r.steps[3].incoming === 130 && r.toGrade,
   'with no capacity anywhere the full 130 runs to slab on grade, which absorbs it: ' + JSON.stringify(r.steps.map(s => [s.name, s.res, s.grade])));

console.log('D. the shore is picked by height and capacity, and the pick sets the grid');
await build({ sdl: 25, ll: 40, reducible: true });
r = await solve();
// the row for L3 is the reshore UNDER L3's slab (the first floor below the
// pour), standing on L2: L3 T.O.S. - L2 T.O.S. - slab = 10 - 8/12
const under4 = r.steps[0];
near(under4.h, 10 - 8 / 12, 1e-6, 'the reshore under L3 runs from L2 T.O.S. up to the L3 soffit: 9\'-4"');
ok(under4.sup === 'L2', 'standing on L2: ' + under4.sup);
const ellis = under4.opts.find(o => o.shore === '6-6 Ellis');
ok(ellis && ellis.cap === 5400, 'a 6-6 Ellis at 9\'-4" carries 5,400 lb: ' + JSON.stringify(ellis));
near(ellis.sf, 5400 / 76, 0.01, 'so each shore covers 5400/76 = 71.05 SF');
ok(ellis.pattern === '8×8' && ellis.spacing === 8, 'which is an 8x8 grid (64 SF fits, 80 does not): ' + JSON.stringify([ellis.pattern, ellis.spacing]));
const under3 = r.steps[1];
const e3 = under3.opts.find(o => o.shore === '6-6 Ellis');
ok(e3 && e3.pattern === '10×10', 'under L3 at 22 PSF the same shore opens to the 10x10 cap: ' + JSON.stringify(e3));
// every offered shore is legal at that height; none outside its range is offered
const legal = await page.evaluate((h) => state.shores.map(s => ({ name: s.name, legal: h >= s.minH && h <= s.maxH })), under4.h);
const offered = new Set(under4.opts.map(o => o.shore));
ok(legal.filter(s => s.legal).every(s => offered.has(s.name)), 'every shore legal at 9\'-4" is offered: ' + legal.filter(s => s.legal).map(s => s.name).join(', '));
ok(legal.filter(s => !s.legal).every(s => !offered.has(s.name)), 'and none outside its height range is: ' + legal.filter(s => !s.legal).map(s => s.name).join(', '));
// a taller floor drops the short shores and raises the load-table capacity question
await build({ sdl: 25, ll: 40, reducible: true, f2f: 15 });
r = await solve();
const tall = r.steps[0];
near(tall.h, 15 - 8 / 12, 1e-6, 'at 15 ft floor-to-floor the shore is 14\'-4"');
ok(!tall.opts.find(o => o.shore === '6-6 Ellis'), 'the 6-6 Ellis (8-10 ft) is not offered any more');
const xl = tall.opts.find(o => /#5 HV/.test(o.shore));
ok(xl && xl.cap < 10083 && xl.pattern !== '8×8', 'a #5 HV is, at its de-rated 14\'-4" capacity, and the grid follows from THAT capacity: ' + JSON.stringify(xl));

console.log('E. the app runs the steps in that order');
const E = await page.evaluate(() => ({
  groups: GROUPS.map(g => [g.n, g.id, g.sections.join('+')]),
  gate: (() => { const save = { p: state.pdf.pages, l: state.levels }; state.pdf.pages = 0; state.levels = [];
    const b = stepBlockers('results').map(x => x.step); state.pdf.pages = save.p; state.levels = save.l; return b; })(),
  loadGate: (() => { const save = state.project.loadingConditions; state.project.loadingConditions = [];
    const b = stepBlockers('results').map(x => x.step); state.project.loadingConditions = save; return b; })(),
}));
ok(JSON.stringify(E.groups.map(g => g[1])) === JSON.stringify(['building', 'loads', 'areas', 'answer']),
   'Building -> Loads -> Areas -> Results: ' + JSON.stringify(E.groups));
ok(E.groups[0][2].split('+').indexOf('levels') < E.groups[0][2].split('+').indexOf('match'), 'levels (heights) are settled before the sheets are matched');
ok(E.gate.includes('drawings') && E.gate.includes('levels'), 'Results is gated on a drawing set and levels: ' + E.gate.join(', '));
ok(E.loadGate.includes('loads'), 'and on a load schedule: ' + E.loadGate.join(', '));

console.log('F. change the condition and the grid changes with it');
await build({ sdl: 25, ll: 40, reducible: false });   // 74 PSF: 130 -> 56 -> absorbed
r = await solve();
// MDL-19 (Sep 25): one level needed, so the absorbing floor gets the minimum second level
ok(r.steps[0].res === 56 && r.steps[1].res < 0 && r.reshore === 2, 'unreduced, 74 PSF floors: 56 under L3, L2 absorbs it and takes the minimum second level: ' + JSON.stringify(r.steps.map(s => s.res)));
const f = r.steps[0].opts.find(o => o.shore === '6-6 Ellis');
ok(f && f.pattern === '8×10' && f.spacing === 8, '5400/56 = 96 SF opens the grid to 8x10 (80 fits, 100 does not): ' + JSON.stringify(f));
await build({ sdl: 25, ll: 100, reducible: false });  // 148 PSF: everything absorbed at L3
r = await solve();
ok(r.steps[0].res < 0 && r.reshore === 0 && r.steps[0].opts.length === 0, 'a 148 PSF floor absorbs the pour outright: no reshore, no shore to pick: ' + JSON.stringify([r.steps[0].res, r.reshore, r.steps[0].opts.length]));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

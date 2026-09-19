// @rules MDL-11, MDL-12, MDL-13, MDL-14  (see DECISIONS.md)
// The floor edge as the pour's extent, and the top of the stack no longer
// asked for a capacity it can never use.
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import fs from 'node:fs';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// A bare stack, identity transform (1 image px = 1 building ft). Level 3 is
// the pour, 2 and 1 carry, 0 is on grade.
// The sheet is a stand-in: no PDF is loaded, but the step gates added in the
// flow rework want a drawing set and a sheet per floor before they will say
// anything else about a step, and these fixtures are pure geometry.
const build = () => page.evaluate(() => {
  state.pdf.doc = null; state.pdf.pages = 1; state.pdf.current = 1;
  const lv = (name, elev, cap) => ({ id: sid(), name, elevation: elev, slabThickness: 9,
    defaultCapacity: cap, zones: [], slabZones: [],
    alignment: { transform: [1, 0, 0, 1, 0, 0], ftPerInch: 12, nPoints: 2 } });
  state.levels = [lv('3', 30, 0), lv('2', 20, 60), lv('1', 10, 60), lv('0', 0, 0)];
  state.levels.forEach(l => { l.pdfPage = 1; });
  state.levels[3].onGrade = true;
  state.project.solveStepFt = 2; state.project.constructionDL = 30;
  state.activeLevelIdx = 0; state.activeZoneIdx = null;
  const sq = (x0, y0, x1, y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  // a 100 x 60 ft floor edge on the pour, and nothing else on it
  state.levels[0].slabZones.push({ id: sid(), kind: 'edge', polygon: sq(0, 0, 100, 60) });
  return sq(0, 0, 100, 60).length;
});
const solve = () => page.evaluate(() => {
  const s = solveAll({ step: state.project.solveStepFt });
  const L = s.levels[0];
  return { spatial: L.solve.spatial, reason: L.solve.reason,
    regions: (L.solve.regions || []).length,
    sf: Math.round((L.solve.regions || []).reduce((n, r) => n + r.areaSF, 0)),
    placement: L.solve.regions && L.solve.regions[0] && Math.round(L.solve.regions[0].placementLoad * 100) / 100,
    marks: L.solve.regions && L.solve.regions[0] ? [...L.solve.regions[0].loadingMarks] : null,
    steps: L.solve.regions && L.solve.regions[0] ? L.solve.regions[0].steps.map(s => Math.round((s.resultant ?? 0) * 100) / 100) : null };
});

console.log('A. a floor edge alone is enough to pour');
await build();
let r = await solve();
ok(r.spatial, 'it solves with no loading area on the pour: ' + JSON.stringify(r.reason || ''));
ok(r.sf >= 5900 && r.sf <= 6100, 'over the whole 100 x 60 ft edge: ' + r.sf + ' SF');
ok(r.placement === 142.5, '9" slab + 30 PSF construction = 142.5 PSF placed: ' + r.placement);
ok(Array.isArray(r.marks) && r.marks.length === 0, 'and no mark is invented for the pour: ' + JSON.stringify(r.marks));
ok(r.steps && r.steps[0] === 82.5, 'the first carrying floor sees 142.5 - 60 = 82.5: ' + JSON.stringify(r.steps));

console.log('B. with a floor edge, the edge decides the extent — areas are capacity only');
// This is the rule every OTHER floor already followed. The pour did not, and
// that was the bug: take the typical area up onto the level default, leave the
// exceptions drawn, and the pour collapsed to the exceptions.
await page.evaluate(() => {
  const sq = (x0, y0, x1, y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  state.levels[0].zones.push({ id: sid(), label: 'EXCEPTION', capacityPSF: 40, polygon: sq(0, 0, 50, 60) });
});
r = await solve();
ok(r.spatial, 'still solves');
ok(r.sf >= 5900 && r.sf <= 6100,
   'the whole floor edge is poured, not just the drawn area: ' + r.sf + ' SF');

console.log('C. and with only a small exception drawn — the typical-capacity workflow');
await page.evaluate(() => {
  const sq = (x0, y0, x1, y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  state.levels[0].zones.length = 0;
  state.levels[0].zones.push({ id: sid(), label: 'STAIR', capacityPSF: 40, polygon: sq(4, 4, 14, 14) });
});
r = await solve();
ok(r.sf >= 5900 && r.sf <= 6100,
   'a 100 SF patch does not shrink a 6,000 SF pour to 100 SF: ' + r.sf + ' SF');
await page.evaluate(() => { state.levels[0].zones.length = 0; });

console.log('C2. an area drawn past the pour edge is still not poured');
await page.evaluate(() => {
  const sq = (x0, y0, x1, y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  // (the slab-edge tolerance setting is gone, Sep 18 2026; the pour's own lap is drafting slop only)
  state.levels[0].zones.push({ id: sid(), polygon: sq(0, 0, 200, 60), mark: null, llMark: 'A', sdlMark: '1' });
});
const over = await page.evaluate(() => {
  const s = solveAll({ step: state.project.solveStepFt });
  return { sf: Math.round(s.levels[0].solve.regions.reduce((n, r) => n + r.areaSF, 0)),
           outside: Math.round(s.levels[0].solve.outsideEdgeSF || 0) };
});
ok(over.sf >= 5900 && over.sf <= 6100, 'the part inside the edge is poured: ' + over.sf + ' SF');
ok(over.outside > 5000, 'and the overhang is reported, not counted: ' + over.outside + ' SF');
await page.evaluate(() => { state.levels[0].zones.length = 0; });

console.log('D. with neither, it says what to draw');
await page.evaluate(() => { state.levels[0].slabZones.length = 0; });
r = await solve();
ok(!r.spatial, 'no extent, no solve');
ok(/floor edge/.test(r.reason) && /loading areas/.test(r.reason), 'and names both ways out: ' + JSON.stringify(r.reason));

console.log('E. the top of the stack is not asked for a capacity');
await build();
const caps = await page.evaluate(() => {
  const before = levelsWithoutCapacity();
  // the roof has no areas and no default; the floors below have defaults
  const status = stepStatus('areas');
  // now strip Level 2's default as well
  state.levels[1].defaultCapacity = 0;
  const after = levelsWithoutCapacity();
  state.levels[1].defaultCapacity = 60;
  return { before, after, status: status.text, top: state.levels[0].name };
});
ok(caps.before.length === 0, 'the roof is exempt, so nothing is flagged: ' + JSON.stringify(caps.before));
ok(caps.after.join(',') === '2', 'a floor that actually carries something still is: ' + JSON.stringify(caps.after));
ok(!/No areas on/.test(caps.status), 'and the Areas step does not go amber over it: ' + JSON.stringify(caps.status));

console.log('F. the bottom floor is never a pour, so it is not exempt');
const bottom = await page.evaluate(() => {
  state.levels[3].onGrade = false; state.levels[3].defaultCapacity = 0;
  const flagged = levelsWithoutCapacity();
  state.levels[3].onGrade = true;
  return flagged;
});
ok(bottom.includes('0'), 'the lowest floor is still asked: ' + JSON.stringify(bottom));

// ── G. the step gate ────────────────────────────────────────────────────
console.log('G. a floor edge with a typical capacity counts as a defined floor');
await build();
const gate = await page.evaluate(() => {
  // Level 3 pours off its floor edge; give 2 and 1 edges and typicals too and
  // draw nothing anywhere. This is a finished job with no loading areas in it.
  const sq = (x0, y0, x1, y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  for (const i of [1, 2]) state.levels[i].slabZones.push({ id: sid(), kind: 'edge', polygon: sq(0, 0, 100, 60) });
  state.levels[0].defaultCapacity = 0;             // the roof needs none
  const areas = stepStatus('areas'), results = stepStatus('results');
  return { areasCount: areasCount(), defined: definedCount(), pourable: pourableCount(),
           typical: typicalOnlyCount(), areasDone: areas.done, areasText: areas.text,
           resultsText: results.text };
});
ok(gate.areasCount === 0, 'not one loading area is drawn: ' + gate.areasCount);
ok(gate.defined === 4 && gate.pourable === 3, 'but every floor is defined: ' + JSON.stringify(gate));
ok(gate.areasDone, 'so the Areas step is done, not amber: ' + JSON.stringify(gate.areasText));
ok(/typical/.test(gate.areasText), 'and says how: ' + JSON.stringify(gate.areasText));
ok(!/areas/.test(gate.resultsText), 'and Results is no longer held behind "needs areas": ' + JSON.stringify(gate.resultsText));

console.log('H. a floor edge with NO typical capacity is still not defined');
const half = await page.evaluate(() => {
  const two = state.levels[1], keep = two.defaultCapacity;
  two.defaultCapacity = 0; two.defLL = null; two.defSDL = null;
  const r = { defined: levelDefined(two), bare: levelsWithoutCapacity(),
              areas: stepStatus('areas'), results: stepStatus('results') };
  two.defaultCapacity = keep;
  return r;
});
ok(!half.defined, 'an edge on its own says where the slab is, not what it carries');
ok(half.bare.includes('2'), 'so the floor is named: ' + JSON.stringify(half.bare));
ok(!half.areas.done && /No capacity on/.test(half.areas.text), 'and the step says which: ' + JSON.stringify(half.areas.text));
ok(half.results.locked, 'with Results held back');

console.log('I. and with nothing at all it still asks for something');
const none = await page.evaluate(() => {
  const keep = state.levels.map(l => ({ slab: l.slabZones.slice(), zones: l.zones.slice() }));
  state.levels.forEach(l => { l.slabZones.length = 0; l.zones.length = 0 });
  const r = { defined: definedCount(), pourable: pourableCount(), areas: stepStatus('areas'), results: stepStatus('results') };
  state.levels.forEach((l, i) => { l.slabZones.push(...keep[i].slab); l.zones.push(...keep[i].zones) });
  return r;
});
ok(none.pourable === 0, 'nothing can be poured: ' + JSON.stringify({ defined: none.defined, pourable: none.pourable }));
ok(/floor edge with a typical capacity/.test(none.areas.text),
   'and the prompt names both ways in: ' + JSON.stringify(none.areas.text));

// ── J. everything else that asks "which marks are in use" ───────────────
console.log('J. a mark used as a typical capacity is a mark in use');
const marks = await page.evaluate(() => {
  // combined-format schedule: one unconfirmed mark, used only as a typical
  state.project.loadingConditions = [
    { mark: '5', desc: 'TYP', sdl: 30, ll: 40, confirmed: false },
    { mark: '6', desc: 'OTHER', sdl: 20, ll: 20, confirmed: true }
  ];
  state.project.llSchedule = []; state.project.sdlSchedule = [];
  const two = state.levels[1];
  two.zones.length = 0; two.defMark = '5'; two.defLL = null; two.defaultCapacity = 0;
  const viaTypical = unconfirmedMarksInUse().map(String);
  two.defMark = null; two.defaultCapacity = 138;
  const without = unconfirmedMarksInUse().map(String);
  return { viaTypical, without };
});
ok(marks.viaTypical.includes('5'),
   'an unconfirmed mark carrying a floor as its typical is flagged: ' + JSON.stringify(marks.viaTypical));
ok(!marks.without.includes('5'), 'and not flagged once nothing uses it: ' + JSON.stringify(marks.without));

console.log('K. and the load map lists a typical as used');
const usedTable = await page.evaluate(() => {
  state.project.loadingConditions = [];
  state.project.llSchedule = [{ mark: 'B', desc: 'TYP', load: 100, reducible: true, confirmed: true }];
  state.project.sdlSchedule = [{ mark: '2', desc: 'TYP DL', load: 38 }];
  const two = state.levels[1];
  two.zones.length = 0; two.defMark = null; two.defLL = 'B'; two.defSDL = '2'; two.defaultCapacity = 0;
  openLoadMapModal(false);
  const rows = [...document.querySelectorAll('#lmUsed tr, .lm-used tr, #p-loads tr')]
    .map(r => r.textContent.replace(/\s+/g, ' ').trim()).filter(t => /B2/.test(t));
  return rows;
});
ok(usedTable.some(t => /typical on 1 floor/.test(t)),
   'the combination shows as carrying a floor, not as unused: ' + JSON.stringify(usedTable));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

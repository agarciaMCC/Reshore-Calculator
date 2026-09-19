// A FLOOR DRAWN ACROSS SEVERAL SHEETS.
// Big plans are split by area — grids 1-8 on one sheet, 8-15 on the next, the
// grid running through the match line. Each sheet is matched on its own; the
// project grid is labelled positions in BUILDING feet, so two sheets of one
// floor land in the same frame and the solver never learns there was a split.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';
const here = new URL('.', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// Two sheets, four pages pretended. Sheet 1 covers building X 0..100, sheet 2
// covers X 100..200 — the same floor, drawn at the same scale, so sheet 2's
// match carries an offset of 100 ft and its own pixels start at 0 again.
// A translated identity is exactly what a continuous grid produces.
const build = () => page.evaluate(() => {
  state.pdf.doc = null; state.pdf.pages = 4; state.pdf.current = 1;
  const A = { transform: [1, 0, 0, 1, 0, 0], ftPerInch: 12, nPoints: 2, page: 1 };
  const B = { transform: [1, 0, 0, 1, 100, 0], ftPerInch: 12, nPoints: 2, page: 2 };
  const lv = (name, elev, cap, pg) => ({ id: sid(), name, elevation: elev, slabThickness: 9,
    defaultCapacity: cap, zones: [], slabZones: [], pdfPage: pg,
    alignment: { transform: [1, 0, 0, 1, 0, 0], ftPerInch: 12, nPoints: 2, page: pg } });
  state.levels = [lv('3', 30, 0, 1), lv('2', 20, 60, 3), lv('1', 10, 60, 4), lv('0', 0, 0, null)];
  state.levels[3].onGrade = true;
  state.levels[0].alignment = A;
  state.levels[0].sheets = [{ page: 2, alignment: B }];
  state.project.solveStepFt = 2; state.project.constructionDL = 30;
  state.activeLevelIdx = 0; state.activeZoneIdx = null;
  const sq = (x0, y0, x1, y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  // half the floor edge on each sheet, each in ITS OWN sheet's pixels: both
  // read 0..100 across, because sheet 2's own origin is grid 8
  state.levels[0].slabZones.push({ id: sid(), kind: 'edge', polygon: sq(0, 0, 100, 60), page: 1 });
  state.levels[0].slabZones.push({ id: sid(), kind: 'edge', polygon: sq(0, 0, 100, 60), page: 2 });
  // the carrying floors are one sheet each, whole
  for (const i of [1, 2]) state.levels[i].slabZones.push({ id: sid(), kind: 'edge', polygon: sq(0, 0, 200, 60) });
  return true;
});

console.log('A. the model: a level holds a list of sheets');
await build();
let r = await page.evaluate(() => {
  const L = state.levels[0];
  return { n: levelSheets(L).length, pages: levelSheets(L).map(s => s.page),
    has1: levelHasPage(L, 1), has2: levelHasPage(L, 2), has3: levelHasPage(L, 3),
    for1: levelForPage(1), for2: levelForPage(2),
    full: levelFullyMatched(L), unmatched: levelSheetsUnmatched(L),
    onePage: levelSheets(state.levels[1]).length };
});
ok(r.n === 2, 'the pour has two sheets: ' + r.n);
ok(JSON.stringify(r.pages) === '[1,2]', 'in order, primary first: ' + JSON.stringify(r.pages));
ok(r.has1 && r.has2 && !r.has3, 'levelHasPage answers for each of them');
ok(r.for1 === 0 && r.for2 === 0, 'both sheets point back at the same floor');
ok(r.full && r.unmatched.length === 0, 'and it counts as matched only when both are');
ok(r.onePage === 1, 'a single-sheet floor still reads as one sheet: ' + r.onePage);

console.log('B. an unmatched second sheet holds the floor back');
r = await page.evaluate(() => {
  const L = state.levels[0], keep = L.sheets[0].alignment;
  L.sheets[0].alignment = null;
  const out = { full: levelFullyMatched(L), un: levelSheetsUnmatched(L), aligned: alignedCount() };
  L.sheets[0].alignment = keep;
  out.fullAfter = levelFullyMatched(L);
  return out;
});
ok(!r.full, 'not fully matched while sheet 2 has no match');
ok(JSON.stringify(r.un) === '[2]', 'and it says which sheet: ' + JSON.stringify(r.un));
ok(r.fullAfter, 'matched again once it is');

console.log('C. each area goes to feet through its own sheet');
r = await page.evaluate(() => {
  const list = levelZonesInBuilding(state.levels[0], 'slab');
  const bbs = list.map(e => [Math.round(e.bb.minX), Math.round(e.bb.maxX)]);
  return { n: list.length, bbs, sf: Math.round(list.reduce((n, e) => n + e.areaFt, 0)) };
});
ok(r.n === 2, 'both halves come back: ' + r.n);
ok(JSON.stringify(r.bbs) === '[[0,100],[100,200]]',
   'sheet 1 lands at 0-100 ft and sheet 2 at 100-200: ' + JSON.stringify(r.bbs));
ok(r.sf === 12000, 'one frame, 200 x 60 ft of floor: ' + r.sf);

console.log('D. an area whose sheet is not matched yet is simply not there');
r = await page.evaluate(() => {
  const L = state.levels[0], keep = L.sheets[0].alignment;
  L.sheets[0].alignment = null;
  const n = (levelZonesInBuilding(L, 'slab') || []).length;
  L.sheets[0].alignment = keep;
  return n;
});
ok(r === 1, 'only the matched half: ' + r);

console.log('E. the solver sees one floor, not two sheets');
r = await page.evaluate(() => {
  const s = solveAll({ step: state.project.solveStepFt });
  const L = s.levels[0];
  const regions = L.solve.regions || [];
  let minX = 1e9, maxX = -1e9;
  for (const reg of regions) { if (reg.bb.minX < minX) minX = reg.bb.minX; if (reg.bb.maxX > maxX) maxX = reg.bb.maxX; }
  return { spatial: L.solve.spatial, reason: L.solve.reason, n: regions.length,
    sf: Math.round(regions.reduce((n, reg) => n + reg.areaSF, 0)),
    minX: Math.round(minX), maxX: Math.round(maxX),
    placement: regions[0] && Math.round(regions[0].placementLoad * 100) / 100 };
});
ok(r.spatial, 'it solves: ' + JSON.stringify(r.reason || ''));
ok(r.sf >= 11800 && r.sf <= 12100, 'over the whole split floor: ' + r.sf + ' SF');
ok(r.minX <= 2 && r.maxX >= 198, 'the region set spans the match line: ' + r.minX + '..' + r.maxX);
ok(r.n === 1, 'and it is one region, not one per sheet: ' + r.n);
ok(r.placement === 142.5, 'same placement load as an unsplit floor: ' + r.placement);

console.log('F. a region crossing the match line is unbroken');
// one 9" slab, one capacity: the split must leave no seam in the answer
r = await page.evaluate(() => {
  const s = solveAll({ step: 2 });
  const reg = s.levels[0].solve.regions[0];
  const st = reg.cellStep, seen = new Set();
  for (let i = 0; i < reg.cells.length; i += 2) seen.add(Math.round(reg.cells[i] / st));
  const cols = [...seen].sort((a, b) => a - b);
  let gaps = 0;
  for (let i = 1; i < cols.length; i++) if (cols[i] - cols[i - 1] > 1) gaps++;
  return { gaps, cols: cols.length };
});
ok(r.gaps === 0, 'no column of cells is missing across the seam: ' + r.gaps + ' gaps');
ok(r.cols >= 95, 'and the sampling covers the full 200 ft: ' + r.cols + ' columns');

console.log('G. an area is drawn, hit and snapped only on its own sheet');
r = await page.evaluate(() => {
  const L = state.levels[0];
  const e1 = L.slabZones[0], e2 = L.slabZones[1];
  state.pdf.current = 1;
  const on1 = [zoneOnSheet(L, e1), zoneOnSheet(L, e2)];
  state.pdf.current = 2;
  const on2 = [zoneOnSheet(L, e1), zoneOnSheet(L, e2)];
  state.pdf.current = 3;
  const on3 = [zoneOnSheet(L, e1), zoneOnSheet(L, e2)];
  state.pdf.current = 1;
  // and an old area with no page recorded belongs to the primary sheet
  const legacy = { id: 'x', kind: 'edge', polygon: [] };
  const lp = zonePage(L, legacy);
  return { on1, on2, on3, lp };
});
ok(JSON.stringify(r.on1) === '[true,false]', 'sheet 1 shows only its own: ' + JSON.stringify(r.on1));
ok(JSON.stringify(r.on2) === '[false,true]', 'sheet 2 shows only its own: ' + JSON.stringify(r.on2));
ok(JSON.stringify(r.on3) === '[false,false]', 'another floor\'s sheet shows neither');
ok(r.lp === 1, 'an area with no page recorded is on the primary sheet: ' + r.lp);

console.log('H. drawing on a sheet stamps that sheet');
r = await page.evaluate(() => {
  const L = state.levels[0];
  state.pdf.current = 2; state.layer = 'loading';
  state.drawing.points = [{x:10,y:10},{x:40,y:10},{x:40,y:40},{x:10,y:40}];
  finishPolygon();
  const z = L.zones[L.zones.length - 1];
  state.pdf.current = 1;
  return { page: z.page, drawnOn2: (state.pdf.current = 2, zoneOnSheet(L, z)) };
});
ok(r.page === 2, 'the new area records sheet 2: ' + r.page);
ok(r.drawnOn2, 'and it lives there');
r = await page.evaluate(() => {
  const L = state.levels[0];
  // it went to feet through sheet 2's match, so it sits past the match line
  const e = (levelZonesInBuilding(L, 'loading') || [])[0];
  state.pdf.current = 1;
  return e ? [Math.round(e.bb.minX), Math.round(e.bb.maxX)] : null;
});
ok(JSON.stringify(r) === '[110,140]', 'through sheet 2\'s match, at 110-140 ft: ' + JSON.stringify(r));

console.log('I. the screen transform follows the sheet you are looking at');
r = await page.evaluate(() => {
  const L = state.levels[0];
  state.pdf.current = 1; const t1 = screenTransform(L);
  state.pdf.current = 2; const t2 = screenTransform(L);
  state.pdf.current = 3; const t3 = screenTransform(L);
  state.pdf.current = 1;
  return { t1, t2, t3, one: screenTransform(state.levels[1]) };
});
ok(r.t1 && r.t1[4] === 0, 'sheet 1: no offset');
ok(r.t2 && r.t2[4] === 100, 'sheet 2: the 100 ft offset of its own match: ' + (r.t2 && r.t2[4]));
ok(r.t3 === null, 'a sheet that is not this floor\'s has no transform');
ok(r.one === null, 'and a single-sheet floor viewed off its sheet has none either');

console.log('J. adding and removing sheets');
r = await page.evaluate(() => {
  const L = state.levels[1];               // level 2, one sheet (3)
  const before = levelSheets(L).length;
  addLevelSheet(L, 2);                      // already the pour's — the caller frees it first
  const after = levelSheets(L).map(s => s.page);
  removeLevelSheet(L, 2);
  const back = levelSheets(L).map(s => s.page);
  return { before, after, back };
});
ok(r.before === 1 && JSON.stringify(r.after) === '[3,2]', 'a second sheet appends: ' + JSON.stringify(r.after));
ok(JSON.stringify(r.back) === '[3]', 'and comes off again: ' + JSON.stringify(r.back));

r = await page.evaluate(() => {
  const L = state.levels[0];
  const n0 = L.slabZones.length + L.zones.length;
  const removed = removeLevelSheet(L, 2);
  const out = { removed, left: L.slabZones.length + L.zones.length, n0,
    pages: levelSheets(L).map(s => s.page),
    survivors: L.slabZones.concat(L.zones).map(z => zonePage(L, z)) };
  return out;
});
ok(r.removed === 2, 'taking a sheet off takes its areas with it: ' + r.removed + ' of ' + r.n0);
ok(JSON.stringify(r.pages) === '[1]', 'and the floor is back to one sheet: ' + JSON.stringify(r.pages));
ok(r.survivors.every(p => p === 1), 'only sheet 1\'s areas are left');

console.log('K. removing the PRIMARY sheet promotes the next one');
await build();
r = await page.evaluate(() => {
  const L = state.levels[0];
  const removed = removeLevelSheet(L, 1);
  return { removed, pdfPage: L.pdfPage, off: L.alignment && L.alignment.transform[4],
    pages: levelSheets(L).map(s => s.page), n: L.slabZones.length };
});
ok(r.pdfPage === 2, 'sheet 2 becomes the primary: ' + r.pdfPage);
ok(r.off === 100, 'carrying its own match with it: ' + r.off);
ok(JSON.stringify(r.pages) === '[2]', 'one sheet left: ' + JSON.stringify(r.pages));
ok(r.n === 1 && r.removed === 1, 'and only sheet 1\'s edge went');

console.log('L. a job saved before all this opens unchanged');
r = await page.evaluate(() => {
  // exactly the old shape: one pdfPage, one alignment, no z.page anywhere
  state.pdf.doc = null; state.pdf.pages = 2; state.pdf.current = 1;
  const sq = (x0, y0, x1, y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  const lv = (name, elev, cap, pg) => ({ id: sid(), name, elevation: elev, slabThickness: 9,
    defaultCapacity: cap, zones: [], slabZones: [], pdfPage: pg,
    alignment: { transform: [1, 0, 0, 1, 0, 0], ftPerInch: 12, nPoints: 2 } });
  state.levels = [lv('2', 20, 0, 1), lv('1', 10, 60, 2), lv('0', 0, 0, null)];
  state.levels[2].onGrade = true;
  state.levels[0].slabZones.push({ id: sid(), kind: 'edge', polygon: sq(0, 0, 100, 60) });
  state.levels[1].slabZones.push({ id: sid(), kind: 'edge', polygon: sq(0, 0, 100, 60) });
  state.activeLevelIdx = 0;
  const s = solveAll({ step: 2 });
  const L = s.levels[0];
  return { sheets: levelSheets(state.levels[0]).length,
    full: levelFullyMatched(state.levels[0]),
    onScreen: levelOnScreen() === state.levels[0],
    shown: zoneOnSheet(state.levels[0], state.levels[0].slabZones[0]),
    spatial: L.solve.spatial,
    sf: Math.round((L.solve.regions || []).reduce((n, r) => n + r.areaSF, 0)) };
});
ok(r.sheets === 1, 'one sheet, from pdfPage alone: ' + r.sheets);
ok(r.full, 'and it is matched');
ok(r.onScreen && r.shown, 'its areas show on it');
ok(r.spatial && r.sf >= 5900 && r.sf <= 6100, 'and it solves as before: ' + r.sf + ' SF');

console.log('M. the extra sheets survive save and open');
r = await page.evaluate(() => {
  state.pdf.pages = 4;
  const L = state.levels[0];
  L.sheets = [{ page: 3, alignment: { transform: [1, 0, 0, 1, 100, 0], ftPerInch: 12, nPoints: 2, page: 3 } }];
  L.zones.push({ id: sid(), polygon: [{x:0,y:0},{x:10,y:0},{x:10,y:10}], capacityPSF: 50, page: 3 });
  const json = jobJSON();
  const doc = JSON.parse(json);
  applyOpenedJob(doc);
  const R = state.levels[0];
  return { pages: levelSheets(R).map(s => s.page),
    off: (levelAlignmentFor(R, 3) || {}).transform,
    zp: R.zones[R.zones.length - 1].page,
    full: levelFullyMatched(R) };
});
ok(JSON.stringify(r.pages) === '[1,3]', 'both sheets come back: ' + JSON.stringify(r.pages));
ok(r.off && r.off[4] === 100, 'with the second sheet\'s own match: ' + JSON.stringify(r.off));
ok(r.zp === 3, 'and the area still remembers its sheet: ' + r.zp);
ok(r.full, 'the floor reads as matched');

console.log('N. the UI that has to speak about several sheets');
r = await page.evaluate(() => {
  state.pdf.pages = 4; state.pdf.current = 2;
  const L = state.levels[0];
  L.pdfPage = 1;
  L.sheets = [{ page: 2, alignment: { transform: [1,0,0,1,100,0], ftPerInch: 12, nPoints: 2, page: 2 } }];
  setStep('match'); renderMatchPanel();
  const ml = document.getElementById('matchList');
  const rows = [...ml.querySelectorAll('.match-row')];
  setStep('areas'); state.activeLevelIdx = 0; renderPageBar();
  const bar = document.getElementById('pageBar');
  state.pdf.current = 3; renderPageBar();
  const bar3 = document.getElementById('pageBar').textContent;
  state.pdf.current = 2;
  renderStepPanel();
  const drawings = (document.getElementById('p-drawings') || {}).textContent || '';
  return { rows: rows.length, levels: state.levels.length,
    firstHasPage: rows.some(x => x.querySelector('[data-matchpage="1"]')),
    secondHasPage: rows.some(x => x.querySelector('[data-matchpage="2"]')),
    names: rows.map(x => x.querySelector('.match-name').textContent.trim()),
    bar3, drawings };
});
ok(r.rows === r.levels + 1, 'the match panel lists a row per sheet, so the split floor gets two: '
   + r.rows + ' rows for ' + r.levels + ' floors');
ok(r.firstHasPage && r.secondHasPage, 'each row matches its own sheet');
ok(r.names[0].includes('sheet 1') && r.names[1].includes('sheet 2'),
   'and says which: ' + JSON.stringify(r.names.slice(0, 2)));
ok(/sheets 1, 2/.test(r.bar3), 'the sheet bar names both: ' + JSON.stringify(r.bar3.slice(0, 120)));

console.log('O. a sheet the sweep offers to ADD rather than swap');
r = await page.evaluate(() => {
  const list = [
    { page: 1, kind: 'plan', kindLabel: 'floor plan', levelName: '3', title: 'LEVEL 3 PLAN — AREA A',
      planRank: 3, elevN: 0, conf: 'high', why: 'title', primary: true, siblings: [1, 2] },
    { page: 2, kind: 'plan', kindLabel: 'floor plan', levelName: '3', title: 'LEVEL 3 PLAN — AREA B',
      planRank: 3, elevN: 0, conf: 'high', why: 'title', primary: false, siblings: [1, 2] }];
  state.levels[0].name = '3'; state.levels[0].pdfPage = 1; state.levels[0].sheets = [];
  list.forEach(decideSheetAction);
  const before = list.map(s => s.action);
  list[1].useAlso = true;
  list.forEach(decideSheetAction);
  const after = list.map(s => s.action);
  applySheetAssignments(list, new Set([2]));
  const L = state.levels[0];
  return { before, after, pages: levelSheets(L).map(s => s.page), actionable: sheetActionable(list[1]) };
});
ok(JSON.stringify(r.before) === '["ok","alt"]', 'by default the second plan is left alone: ' + JSON.stringify(r.before));
ok(r.after[1] === 'add', 'ticking "the plan is split" turns it into an add: ' + r.after[1]);
ok(r.actionable, 'and an add is something Apply will write');
ok(JSON.stringify(r.pages) === '[1,2]', 'both sheets end up on the floor: ' + JSON.stringify(r.pages));

console.log('P. the sheet bar lets you hand a second sheet to a floor by hand');
r = await page.evaluate(() => {
  state.levels[0].sheets = [];
  state.pdf.current = 2; state.activeLevelIdx = 0;
  renderPageBar();
  const sel = document.getElementById('pageBarSel');
  const optionForPour = sel ? [...sel.options].find(o => o.value === '0') : null;
  const disabled = optionForPour ? optionForPour.disabled : null;
  assignPageToLevel(2, 0);
  return { disabled, label: optionForPour && optionForPour.textContent,
    pages: levelSheets(state.levels[0]).map(s => s.page) };
});
ok(r.disabled === false, 'a floor already on another sheet stays pickable');
ok(/sheet 1/.test(r.label || ''), 'and the option says where it already is: ' + JSON.stringify(r.label));
ok(JSON.stringify(r.pages) === '[1,2]', 'picking it adds the sheet: ' + JSON.stringify(r.pages));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

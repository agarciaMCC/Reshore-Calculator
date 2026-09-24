// @rules MDL-05, RGN-01, RGN-02, RGN-05, RES-06, RES-10  (see DECISIONS.md)
// Overlapping loading areas behave as a CUTOUT (the smaller area governs its
// own space, the larger one governs everywhere else), conditions split by
// mark, and the Results highlight is teal (RES-10) and layer-independent.
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import fs from 'node:fs';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const file = 'file://' + path.resolve(here, '..', 'reshore-calc.html');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto(file);
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// ---- fixture: identity transform, 1 px = 1 ft. L2 pours over L1, which has
// a floor-wide area plus a smaller area drawn inside it. ----
const setup = (inner) => page.evaluate((o) => {
  const T = [1, 0, 0, 1, 0, 0];
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const mk = (name, el, slab, cap) => ({
    id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap,
    rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [],
    alignment: { transform: T, points: [] },
  });
  state.project = { name: 'overlap-test', loadingConditions: [], shoreChoices: {}, solveStepFt: 2 };
  state.levels = [mk('L2', 20, 9, 0), mk('L1', 10, 9, 0), mk('SOG', 0, 5, 0)];
  state.levels[2].onGrade = true;
  // the pour: one loading area over the whole floor
  state.levels[0].zones.push({ id: sid(), polygon: sq(0, 0, 100, 100), capacityPSF: 100, mark: 'A1', label: '', colorIdx: 0 });
  // L1: floor-wide area, then the smaller ones drawn inside it (draw order
  // as given, so a later test can prove order does not decide)
  state.levels[1].zones.push({ id: sid(), polygon: sq(0, 0, 100, 100), capacityPSF: o.bigCap, mark: o.bigMark, label: '', colorIdx: 0 });
  for (const z of o.inner) state.levels[1].zones.push({ id: sid(), polygon: sq(...z.box), capacityPSF: z.cap, mark: z.mark, label: '', colorIdx: 1 });
  state.results = null; state.activeLevelIdx = 0;
  renderSidebar(); persist();
}, inner);

const solve = () => page.evaluate(() => {
  const L = solveAll({ step: 2 }).levels[0].solve;
  return {
    spatial: L.spatial,
    regions: (L.regions || []).map(r => ({
      area: Math.round(r.areaSF), caps: r.caps,
      codes: r.steps.filter(s => !s.grade && !s.open).map(s => String(s.code || '').replace(/^#/, '')),
      capsPsf: r.steps.filter(s => !s.grade && !s.open).map(s => s.capacity),
    })),
  };
});

console.log('A. the smaller area cuts out of the larger one');
// 20×20 inner area at a LOWER capacity: it must govern its own 400 SF, which
// the old highest-capacity rule threw away entirely.
await setup({ bigCap: 138, bigMark: 'B2', inner: [{ box: [10, 10, 30, 30], cap: 125, mark: 'E2' }] });
let r = await solve();
ok(r.spatial, 'spatial solve');
let inner = r.regions.find(x => x.codes[0] === 'E2'), outer = r.regions.find(x => x.codes[0] === 'B2');
ok(!!inner && !!outer && r.regions.length === 2, 'two regions, one per mark: ' + JSON.stringify(r.regions));
ok(inner && inner.area === 400, 'inner area is its own 400 SF: ' + (inner && inner.area));
ok(inner && inner.capsPsf[0] === 125, 'inner takes the lower capacity 125: ' + (inner && inner.capsPsf[0]));
ok(outer && outer.capsPsf[0] === 138 && outer.area === 10000 - 400, 'outer keeps 138 over the rest: ' + JSON.stringify(outer));

console.log('B. it is size, not capacity or draw order, that decides');
// inner area at a HIGHER capacity still governs its own space
await setup({ bigCap: 100, bigMark: 'B2', inner: [{ box: [10, 10, 30, 30], cap: 200, mark: 'H1' }] });
r = await solve();
inner = r.regions.find(x => x.codes[0] === 'H1');
ok(inner && inner.area === 400 && inner.capsPsf[0] === 200, 'higher-capacity inner area also governs its space: ' + JSON.stringify(inner));
// same geometry with the big area drawn LAST: the small one must still win
const flipped = await page.evaluate(() => {
  const lv = state.levels[1]; const big = lv.zones.shift(); lv.zones.push(big);
  const L = solveAll({ step: 2 }).levels[0].solve;
  const g = L.regions.map(r => ({ area: Math.round(r.areaSF), code: String(r.steps[0].code || '').replace(/^#/, ''), cap: r.steps[0].capacity }));
  return g;
});
ok(flipped.some(g => g.code === 'H1' && g.area === 400), 'draw order does not change it: ' + JSON.stringify(flipped));

console.log('C. equal capacities, different marks → separate conditions');
await setup({ bigCap: 138, bigMark: 'B2', inner: [{ box: [10, 10, 30, 30], cap: 138, mark: 'C2' }] });
r = await solve();
ok(r.regions.length === 2, 'still two regions at the same PSF: ' + JSON.stringify(r.regions));
ok(r.regions.every(x => x.codes.length === 1 && x.codes[0]), 'each region carries exactly one mark per floor');
ok(r.regions.some(x => x.codes[0] === 'C2' && x.area === 400), 'C2 is its own 400 SF condition');

console.log('D. nesting: the innermost area wins');
await setup({ bigCap: 138, bigMark: 'B2', inner: [
  { box: [10, 10, 70, 70], cap: 125, mark: 'E2' },
  { box: [20, 20, 40, 40], cap: 90, mark: 'W1' },
] });
r = await solve();
let w = r.regions.find(x => x.codes[0] === 'W1'), e = r.regions.find(x => x.codes[0] === 'E2');
ok(w && w.area === 400 && w.capsPsf[0] === 90, 'innermost 20x20 keeps its own 90 PSF: ' + JSON.stringify(w));
ok(e && e.area === 3600 - 400, 'the middle area loses only the nested cutout: ' + JSON.stringify(e));
ok(r.regions.length === 3, 'three conditions on the floor: ' + JSON.stringify(r.regions.map(x => [x.codes[0], x.area])));
// A NESTED AREA UNDER THE MINIMUM REGION SIZE KEEPS ITS MARK.
// It used to be absorbed into the neighbor it shared the most boundary with,
// which is how a 177 SF C2 patch on the Kalae job came back inside the B2
// region beside it, labeled "B2 / C2". Adolfo, Sep 15 2026: "do not merge
// loading conditions." The minimum region size still absorbs a sliver whose
// capacity or shore height differs by a hair; a different MARK never merges,
// however small the piece.
await setup({ bigCap: 138, bigMark: 'B2', inner: [
  { box: [10, 10, 70, 70], cap: 125, mark: 'E2' },
  { box: [20, 20, 30, 30], cap: 90, mark: 'W1' },
] });
r = await solve();
ok(r.regions.some(x => x.codes[0] === 'W1' && x.area === 100),
   'a 100 SF cutout is still its own condition under the 200 SF minimum: ' + JSON.stringify(r.regions.map(x => [x.codes[0], x.area])));
const thr0 = await page.evaluate(() => {
  state.project.minRegionSF = 0;
  const L = solveAll({ step: 2 }).levels[0].solve;
  const g = L.regions.map(x => ({ area: Math.round(x.areaSF), code: String(x.steps[0].code || '').replace(/^#/, ''), cap: x.steps[0].capacity }));
  state.project.minRegionSF = null;
  return g;
});
ok(thr0.some(g => g.code === 'W1' && g.area === 100 && g.cap === 90), 'with the minimum at 0 it becomes its own condition: ' + JSON.stringify(thr0));

console.log('E. Results highlight: teal, one boundary, layer-independent');
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'test-set.pdf'));
const job = JSON.parse(fs.readFileSync(path.resolve(here, 'fixtures', 'test-job.reshore.json'), 'utf8'));
await page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none'; document.getElementById('pageNav').style.display = 'flex';
  runSchedule();
}, [pdf.toString('base64'), job]);

// his own job: the strip under E2 is now its own condition at 125 PSF
const real = await page.evaluate(() => {
  const L = schedSolve.levels.find(x => x.pour.name === 'Roof');
  return L.solve.regions.map((r, ri) => ({ label: regionLabel(r, ri), sf: Math.round(r.areaSF), codes: r.steps.filter(s => !s.grade && !s.open).map(s => String(s.code || '').replace(/^#/, '')) }));
});
ok(real.some(x => x.codes[0] === 'E2'), 'Kalae Roof pour now has an E2 condition: ' + JSON.stringify(real));
ok(real.some(x => x.codes[0] === 'C2'), 'and a C2 condition of its own');
ok(real.every(x => x.codes.every(c => c && !/\//.test(c))), 'no region mixes two marks on one floor any more');

// click the "reshore under 3" row of the biggest region on each layer and
// record what actually gets painted: the picture must not depend on the
// Areas tab, and the highlight must be the selection teal.
await page.evaluate(() => {
  window.__rec = null;
  const oFill = drawCtx.fillRect, oStroke = drawCtx.stroke, oPath = drawCtx.fill;
  drawCtx.fillRect = function (...a) { if (window.__rec) window.__rec.fills.push(String(this.fillStyle)); return oFill.apply(this, a); };
  drawCtx.fill = function (...a) { if (window.__rec) window.__rec.fills.push(String(this.fillStyle)); return oPath.apply(this, a); };
  drawCtx.stroke = function (...a) { if (window.__rec) window.__rec.strokes.push(String(this.strokeStyle)); return oStroke.apply(this, a); };
});
const paint = async (layer) => await page.evaluate(async (layer) => {
  const L = schedSolve.levels.find(x => x.pour.name === 'Roof');
  const r = L.solve.regions[0], lbl = regionLabel(r, 0);
  const lv3 = state.levels.find(l => l.name === '3');
  const li = state.levels.findIndex(l => l.id === lv3.id);
  setLayer(layer); setStep('results');
  state.ui.highlight = { cells: r.cells, step: r.cellStep, bb: r.bb, label: lbl, regionKey: r.key, pour: 'Roof' };
  await showRegionOn(li, r, lbl);
  window.__rec = { fills: [], strokes: [] };
  renderNow();
  const rec = window.__rec; window.__rec = null;
  return { layer: state.layer, fills: rec.fills, strokes: rec.strokes };
}, layer);
const pSlab = await paint('slab');
const pLoad = await paint('loading');
ok(pSlab.layer === 'slab' && pLoad.layer === 'loading', 'both layers exercised');
ok(JSON.stringify(pSlab.fills) === JSON.stringify(pLoad.fills), 'identical fills on either layer: ' + pSlab.fills.length + ' vs ' + pLoad.fills.length);
ok(JSON.stringify(pSlab.strokes) === JSON.stringify(pLoad.strokes), 'identical strokes on either layer');
const green = pLoad.fills.filter(c => /14, ?143, ?150|63, ?199, ?207/.test(c)).length;
const orange = pLoad.fills.filter(c => /255, ?140, ?0/.test(c)).length;
// the region is one clipped path now, not a fillRect per cell, so one green
// fill is the whole highlight
ok(green >= 1 && orange === 0, `the highlight is painted selection teal, no hazard orange: teal ${green}, orange ${orange}`);
ok(pLoad.strokes.some(c => /14, ?143, ?150|63, ?199, ?207/.test(c)), 'the region boundary is stroked in the same teal');
// one boundary path, not one per cell
ok(pLoad.strokes.filter(c => /20, ?110, ?60/.test(c)).length <= 2, 'the boundary is at most two stroked paths — the sample grid where regions meet, the drawn outline where the region reaches it');
// and with no highlight the Areas layer still decides
const noHl = await page.evaluate(() => {
  setResultHighlight(null); setStep('areas'); setLayer('slab');
  window.__rec = { fills: [], strokes: [] }; renderNow();
  const a = window.__rec.fills.join('|'); window.__rec = null;
  setLayer('loading');
  window.__rec = { fills: [], strokes: [] }; renderNow();
  const b = window.__rec.fills.join('|'); window.__rec = null;
  return a !== b;
});
ok(noHl, 'with nothing highlighted the Areas layer still changes the picture');

console.log('F. the cutout note is in the code where the rule lives');
ok(await page.evaluate(() => /cutout/i.test(capZoneAt.toString()) || true), 'capZoneAt reachable');
const src = fs.readFileSync(path.resolve(here, '..', 'reshore-calc.html'), 'utf8');
ok(/an overlap reads as a CUTOUT/.test(src), 'the rule is documented at capZoneAt');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

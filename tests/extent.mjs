// WHERE THE CONCRETE GOES (Adolfo, Sep 10, 2026).
//
// "it appears that floor edge is required in order to do calculations. but if
// a slab area is drawn then that should be taken into account in the absence
// of a floor edge."
//
// Half right: the loading areas were already an extent of their own, but a
// shape on the SLAB layer counted for nothing, so a floor drawn as a 9" deck
// and nothing else read as "nothing drawn on the pour level". Now, with no
// floor edge, the extent is the loading areas AND the slab (and on-grade)
// areas together — openings still punch out, a beam adds nothing on its own,
// and a floor edge still overrides both. Where slab areas add poured area a
// loading area did not cover, the header says so.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(Math.abs(a - b) < 1e-6, `${m}: got ${a}, want ${b}`);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(new URL('.', import.meta.url).pathname, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// ── fixture: three floors, 1 px = 1 ft, sampled at 10 ft ────────────────
// The pour (L3) is drawn differently in each case; L2 carries at 54 PSF and
// L1 is strong enough to absorb.
await page.evaluate(() => {
  window.SQ = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  window.setup = (opts) => {
    const T = [1, 0, 0, 1, 0, 0];
    const mk = (name, el, slab, cap) => ({
      id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap,
      rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [],
      alignment: { transform: T, points: [] },
    });
    state.project = { name: 'extent', loadingConditions: [], shoreChoices: {}, solveStepFt: 10 };
    state.levels = [mk('L3', 30, 7.5, 54), mk('L2', 20, 7.5, 54), mk('L1', 10, 7.5, 400)];
    // The step gates want a drawing set and a sheet per floor before they will
    // say anything else about a step (v12's flow rework). These fixtures are
    // pure geometry, so they stand in one sheet and bind every floor to it;
    // the identity transform above is the "match".
    state.pdf.pages = 1; state.pdf.current = 1;
    state.levels.forEach(l => { l.pdfPage = 1; });
    // ...and a schedule to have been read, for the same reason. The zones
    // below carry their capacity directly; this is only here so the Results
    // gate opens.
    state.project.loadingConditions = [{ mark: '1', desc: 'TYP', sdl: 14, ll: 40, confirmed: true }];
    (opts.loading || []).forEach(z => state.levels[0].zones.push({ id: sid(), polygon: SQ(...z.box), capacityPSF: z.psf == null ? 54 : z.psf, mark: '1', label: '', colorIdx: 0 }));
    (opts.slab || []).forEach(z => state.levels[0].slabZones.push({ id: sid(), polygon: SQ(...z.box), kind: z.kind || 'slab', thicknessIn: z.thick == null ? null : z.thick, offsetIn: z.off || 0, widthIn: z.widthIn, depthIn: z.depthIn, label: z.label || '' }));
    (opts.below || []).forEach(z => state.levels[1].slabZones.push({ id: sid(), polygon: SQ(...z.box), kind: z.kind || 'slab', thicknessIn: z.thick == null ? null : z.thick, offsetIn: z.off || 0, label: z.label || '' }));
    state.results = null; state.activeLevelIdx = 0;
    renderSidebar(); persist();
  };
  window.solveTop = () => {
    const s = solveAll({ step: 10 }).levels[0].solve;
    return { spatial: s.spatial, reason: s.reason, areaSF: s.areaSF, openSF: s.openAreaSF, gradeSF: s.gradeAreaSF,
      fromSlabsSF: s.fromSlabsSF, hadLoading: s.hadLoading, pourFromSlabs: s.pourFromSlabs, pourFromEdge: s.pourFromEdge,
      regions: (s.regions || []).map(r => [r.thicknessIn, r.areaSF]) };
  };
  // does the Results clip cover the same ground the solver sampled?
  window.clipArea = () => {
    const L = { pour: state.levels[0] };
    const zb = pourOutlineZones(L);
    if (!zb.length) return 0;
    let n = 0, step = 5;
    for (let x = -50; x < 300; x += step) for (let y = -50; y < 300; y += step) {
      const px = x + step / 2, py = y + step / 2;
      if (zb.some(e => bboxHit(e.bb, px, py) && pointInPoly({ x: px, y: py }, e.bPoly))) n++;
    }
    return n * step * step;
  };
});

// ── A. a slab area alone is enough ──────────────────────────────────────
console.log('A. a floor drawn on the slab layer, and nothing else');
await page.evaluate(() => setup({ slab: [{ box: [0, 0, 100, 100], thick: 9, label: 'deck' }] }));
let r = await page.evaluate(() => solveTop());
ok(r.spatial, 'it solves: ' + r.reason);
eq(r.areaSF, 10000, 'the whole slab area is poured');
ok(r.pourFromSlabs && !r.hadLoading, 'the extent came from the slab areas');
ok(r.regions.length === 1 && r.regions[0][0] === 9, 'at the thickness the slab area states: ' + JSON.stringify(r.regions));
ok(await page.evaluate(() => levelHasExtent(state.levels[0]) && pourableCount() === 1), 'the step gates see it');
ok(await page.evaluate(() => /Draw the loaded areas, the slab, or a floor edge/.test(stepStatus('areas').text) || stepStatus('areas').done),
  'the Areas step no longer asks only for loading areas or an edge: ' + await page.evaluate(() => stepStatus('areas').text));
eq(await page.evaluate(() => clipArea()), 10000, 'and the Results clip covers the same ground');
// the typical-capacity hatch is bounded by the slab area, since there is no edge
ok(await page.evaluate(() => !!typicalAreaPath(state.levels[0])), 'the typical-capacity hatch is painted inside it');

// ── B. an on-grade area alone ───────────────────────────────────────────
console.log('B. an on-grade area alone');
await page.evaluate(() => setup({ slab: [{ box: [0, 0, 100, 100], kind: 'grade', thick: 8 }] }));
r = await page.evaluate(() => solveTop());
ok(r.spatial, 'a pour on grade still lays out: ' + r.reason);
eq(r.gradeSF, 10000, 'and all of it is reported as placed on grade');
eq(r.areaSF, 0, 'with nothing to reshore');

// ── C. an opening, and a beam, on their own ─────────────────────────────
console.log('C. what does NOT make an extent');
await page.evaluate(() => setup({ slab: [{ box: [0, 0, 50, 50], kind: 'opening' }] }));
r = await page.evaluate(() => solveTop());
ok(!r.spatial && /draw its loading areas, its slab, or its floor edge/.test(r.reason || ''), 'an opening alone is not a floor: ' + r.reason);
await page.evaluate(() => setup({ slab: [{ box: [0, 0, 100, 4], kind: 'beam', widthIn: 24, depthIn: 36 }] }));
r = await page.evaluate(() => solveTop());
ok(!r.spatial, 'nor is a beam footprint on its own: ' + r.reason);

// ── D. a slab area lapping past the loading areas ───────────────────────
console.log('D. a slab step drawn past the loading areas');
await page.evaluate(() => setup({
  loading: [{ box: [0, 0, 100, 100] }],
  slab: [{ box: [90, 0, 130, 100], thick: 12, label: 'thick edge' }],
}));
r = await page.evaluate(() => solveTop());
eq(r.areaSF, 13000, 'the lap outside is poured too');
eq(r.fromSlabsSF, 3000, 'and the 3,000 SF it added is counted');
ok(r.hadLoading, 'the floor had loading areas as well');
ok(r.regions.some(([t, a]) => t === 12 && a === 4000) && r.regions.some(([t, a]) => t === 7.5 && a === 9000),
  'split at the step: 4,000 SF at 12" and 9,000 SF at 7.5": ' + JSON.stringify(r.regions));
eq(await page.evaluate(() => clipArea()), 13000, 'the clip follows the solver, not the loading areas');
await page.evaluate(() => { runSchedule(); });
ok(await page.$eval('#schedHead', e => /is poured from slab areas drawn outside this floor's loading areas/.test(e.textContent)),
  'the header says what the slab areas added: ' + await page.$eval('#schedHead', e => e.textContent.replace(/\s+/g, ' ').slice(0, 220)));
// an opening inside the lap still punches out
await page.evaluate(() => setup({
  loading: [{ box: [0, 0, 100, 100] }],
  slab: [{ box: [90, 0, 130, 100], thick: 12 }, { box: [110, 0, 130, 50], kind: 'opening' }],
}));
r = await page.evaluate(() => solveTop());
eq(r.areaSF, 12000, 'an opening drawn in the lap is not poured');
eq(r.openSF, 1000, 'and is reported as an opening');

// ── E. a floor edge still decides ───────────────────────────────────────
console.log('E. with a floor edge, the edge is the extent');
await page.evaluate(() => setup({
  loading: [{ box: [0, 0, 100, 100] }],
  slab: [{ box: [0, 0, 100, 100], kind: 'edge', label: 'edge' }, { box: [150, 0, 200, 100], thick: 12, label: 'off the floor' }],
}));
r = await page.evaluate(() => solveTop());
ok(r.pourFromEdge, 'the edge is in charge');
eq(r.areaSF, 10000, 'a slab area drawn outside the edge is not poured');
eq(r.fromSlabsSF, 0, 'nothing is credited to the slab areas');
eq(await page.evaluate(() => clipArea()), 10000, 'and the clip is the edge');

// ── F. the floors below are unchanged ───────────────────────────────────
console.log('F. below the pour, a slab area outside an edge is still no slab');
await page.evaluate(() => {
  setup({ loading: [{ box: [0, 0, 200, 100] }] });
  // L2 has an edge over the western half only, plus a slab area out east
  state.levels[1].slabZones.push({ id: sid(), polygon: SQ(0, 0, 100, 100), kind: 'edge', label: 'L2 edge' });
  state.levels[1].slabZones.push({ id: sid(), polygon: SQ(150, 0, 200, 100), kind: 'slab', thicknessIn: 12, offsetIn: 0, label: 'L2 slab out east' });
  state.results = null;
});
const below = await page.evaluate(() => {
  const s = solveAll({ step: 10 }).levels[0].solve;
  return s.regions.map(r => ({ sf: r.areaSF, steps: r.steps.map(x => x.level.name + ':' + (x.open ? (x.noSlab ? 'none' : 'open') : x.resultant.toFixed(1))) }));
});
const eastRegion = below.find(x => x.steps.some(s => /^L2:none/.test(s)));
ok(!!eastRegion, 'the point over the eastern slab area still reads "no slab" on L2, because L2 has an edge: ' + JSON.stringify(below));
ok(await page.evaluate(() => {
  // the same drawing without L2's edge: L2 exists everywhere and carries
  state.levels[1].slabZones = state.levels[1].slabZones.filter(z => slabKind(z) !== 'edge');
  state.results = null;
  const s = solveAll({ step: 10 }).levels[0].solve;
  return !s.regions.some(r => r.steps.some(x => x.open));
}), 'with no edge on L2 nothing reads as missing slab');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

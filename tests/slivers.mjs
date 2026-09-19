// @rules RGN-03, RGN-04, MDL-11  (see DECISIONS.md)
// A SLIVER MAY ONLY JOIN A REGION IT AGREES WITH (Adolfo, Sep 10, 2026).
//
// He looked at the plan and said of a corner patch: "this area is incorrectly
// reading a slab below when there is not one that exists." It was 176 SF with
// no slab under it for two floors, under the 200 SF minimum region size, so
// mergeSlivers folded it into the neighbour it shared the most boundary with
// and it inherited that region's 13'-9" shore on the floor below. Four rows
// where no shore in the catalog reaches were hidden that way.
//
// Now a sliver merges only into a neighbour whose cascade has the same SHAPE
// — bearing where it bears, no slab where it has none, an opening where it
// has one, grade where it ends. Capacity and shore-height differences still
// merge; a structural one never does.
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
const eq = (a, b, m) => ok(Math.abs(a - b) < 1e-6, `${m}: got ${a}, want ${b}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// ── fixture ─────────────────────────────────────────────────────────────
// A 100 x 100 ft pour. The floor below has a floor edge over all of it EXCEPT
// a 10 x 10 ft notch in one corner (100 SF, under the 200 SF minimum), so
// that patch has no slab under it; below that, another floor, then grade.
// A second small patch differs only in CAPACITY — a 10 x 10 ft area at a
// different mark — which is the sampling artifact the setting is for.
await page.evaluate(() => {
  window.SQ = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  window.build = (opts) => {
    const T = [1, 0, 0, 1, 0, 0];
    const mk = (name, el, slab, cap, extra) => Object.assign({
      id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap,
      rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [],
      alignment: { transform: T, points: [] },
    }, extra || {});
    state.project = { name: 'slivers', loadingConditions: [], shoreChoices: {}, solveStepFt: 2, minRegionSF: 200 };
    // the bottom floor is strong enough to absorb, and has no edge, so it
    // exists everywhere — the notch's shore spans down to it
    state.levels = [mk('L4', 40, 9, 54), mk('L3', 30, 9, 54), mk('L2', 20, 9, 54), mk('L1', 10, 9, 400)];
    // A stand-in sheet: no PDF is loaded, but the step gates added in the flow
    // rework want a drawing set and a sheet per floor before Results will
    // solve at all, and these fixtures are pure geometry.
    state.pdf.pages = 1; state.pdf.current = 1;
    state.levels.forEach(l => { l.pdfPage = 1; });
    state.project.loadingConditions = [{ mark: '1', desc: 'TYP', sdl: 14, ll: 40, confirmed: true }];
    // the pour: one loading area over the lot
    state.levels[0].zones.push({ id: sid(), polygon: SQ(0, 0, 100, 100), capacityPSF: 54, mark: '1', label: '', colorIdx: 0 });
    // L3: a floor edge that stops short of the corner notch
    state.levels[1].slabZones.push({ id: sid(), polygon: [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 10, y: 100 }, { x: 10, y: 90 }, { x: 0, y: 90 },
    ], kind: 'edge', label: 'L3 edge' });
    // L2 likewise, so the patch has nothing under it for two floors
    state.levels[2].slabZones.push({ id: sid(), polygon: [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 10, y: 100 }, { x: 10, y: 90 }, { x: 0, y: 90 },
    ], kind: 'edge', label: 'L2 edge' });
    if (opts && opts.capSliver) {
      // a patch on L3 with a MARK of its own: same load path, different
      // condition. Never merged since Sep 15 ("do not merge loading
      // conditions") however small it is.
      state.levels[1].zones.push({ id: sid(), polygon: SQ(50, 0, 60, 10), capacityPSF: 60, mark: '9', label: 'stray', colorIdx: 2 });
    }
    if (opts && opts.capOnly) {
      // and one that differs by CAPACITY ALONE — no mark, so it is the same
      // condition read a hair differently, and the minimum region size still
      // absorbs it (his Sep 10 call)
      state.levels[1].zones.push({ id: sid(), polygon: SQ(50, 0, 60, 10), capacityPSF: 60, mark: null, label: '', colorIdx: 2 });
    }
    state.results = null; state.activeLevelIdx = 0;
    renderSidebar(); persist();
  };
  window.top4 = () => {
    const L = solveAll({ step: 2 }).levels[0];
    return { pour: L.pour.name, areaSF: L.solve.areaSF, noShore: L.solve.noShoreRows,
      regions: L.solve.regions.map((r, i) => ({ name: regionLabel(r, i, L), sf: r.areaSF,
        sliverSF: r.sliverSF || 0, shape: cascadeShape(r),
        steps: r.steps.map(s => s.level.name + ':' + (s.grade ? 'grade' : s.open ? (s.noSlab ? 'noslab' : 'open') : s.resultant.toFixed(1))
          + (s.resultant > 0 && !s.open && !s.grade ? '/' + s.options.length + 'opt' : '')) })) };
  };
});

// ── A. a patch with nothing under it is not a sliver ────────────────────
console.log('A. no slab below: kept, however small');
await page.evaluate(() => build());
let r = await page.evaluate(() => top4());
const notch = r.regions.find(x => /noslab/.test(x.shape));
ok(!!notch, 'the 100 SF notch is its own region: ' + JSON.stringify(r.regions.map(x => [x.name, x.sf, x.shape])));
if (notch) {
  // 49 SF, not the notch's full 100: an overhang of 3 ft or less past the
  // floor below bears on it (Sep 18 2026 — falsework carries it back to the
  // slab edge), so the outer band of the notch is bearing, not no-slab
  eq(notch.sf, 49, 'at its own size, well under the 200 SF minimum');
  ok(notch.shape === 'noslab>noslab>bear', 'and it reads no slab, no slab, then the floor that carries it: ' + notch.shape);
  ok(/noslab/.test(notch.steps[0]) && /noslab/.test(notch.steps[1]), 'both floors below say no slab: ' + JSON.stringify(notch.steps));
}
eq(r.areaSF, 10000, 'the placement still totals the same area');
ok(r.regions.every(x => x.sliverSF === 0), 'nothing was absorbed as a sliver: ' + JSON.stringify(r.regions.map(x => x.sliverSF)));
ok(r.noShore > 0, 'and the row nothing reaches is reported: ' + r.noShore);
// it shows up in the Results band, by floor, region and height
await page.evaluate(() => { setStep('results'); runSchedule(); });
const band = await page.evaluate(() => {
  const L = schedSolve.levels[schedPourIdx];
  return { items: noShoreItems(L).map(x => [x.floor, x.label, x.heightFt, x.spansOpen, !!x.noSlab]),
    // the list of its own is gone (Sep 17 2026): a count in the summary head,
    // the words on the region rows themselves
    // region cards fold to one line (Sep 18 2026); the words sit in the folded strip
    text: document.getElementById('schedSummary').innerText.replace(/\s+/g, ' ') + ' ' + document.getElementById('schedBody').textContent.replace(/\s+/g, ' ') };
});
ok(band.items.length > 0, 'the no-shore rows are counted: ' + JSON.stringify(band.items));
ok(/\d+ rows? with nothing to shore against/i.test(band.text), 'the summary head counts them: '
  + (band.text.match(/\d+ rows? with nothing to shore against/i) || [''])[0]);
// this patch has no floor under it at all, so the honest line is not "no
// shore is tall enough" but "there is nothing to reshore against"
ok(band.items.every(x => x[4]), 'both rows are the no-slab kind: ' + JSON.stringify(band.items));
ok(/has no slab here, so there is nothing to reshore against/.test(band.text),
  'and the line says so: ' + (band.text.match(/L\d has no slab[^·]*/) || [''])[0]);
ok(/the load passes down to L1/.test(band.text), 'naming where the load goes instead: '
  + (band.text.match(/the load passes[^·]*/) || [''])[0]);

// ── B. a mark of its own is kept; capacity alone still merges ───────────
console.log('B. a stray MARK is kept, a difference of capacity alone is absorbed');
await page.evaluate(() => build({ capSliver: true }));
r = await page.evaluate(() => top4());
const stray = r.regions.find(x => x.sf === 100 && !/noslab/.test(x.shape));
ok(!!stray, 'the 100 SF patch with its own mark is its own region: ' + JSON.stringify(r.regions.map(x => [x.name, x.sf, x.sliverSF, x.shape])));
ok(r.regions.every(x => x.sliverSF === 0), 'nothing was absorbed: ' + JSON.stringify(r.regions.map(x => x.sliverSF)));
ok(r.regions.some(x => /noslab/.test(x.shape)), 'and the notch is still its own region too');
eq(r.areaSF, 10000, 'area unchanged');

await page.evaluate(() => build({ capOnly: true }));
r = await page.evaluate(() => top4());
const host = r.regions.find(x => x.sliverSF > 0);
ok(!!host, 'a patch differing only in capacity IS still absorbed: ' + JSON.stringify(r.regions.map(x => [x.name, x.sf, x.sliverSF, x.shape])));
if (host) eq(host.sliverSF, 100, 'all 100 SF of it');
eq(r.areaSF, 10000, 'area unchanged');

// ── C. the setting still switches it off entirely ────────────────────────
console.log('C. minimum region size 0');
await page.evaluate(() => { state.project.minRegionSF = 0; state.results = null; });
r = await page.evaluate(() => top4());
ok(r.regions.every(x => x.sliverSF === 0) && r.regions.length >= 3, 'every region kept: ' + r.regions.length);

// ── D. his own job: the corner he pointed at ────────────────────────────
console.log('D. the Bothell job, pour 3 — the corner below grid D at grid 1');
const job = JSON.parse(fs.readFileSync(path.resolve(here, '..', '1175_Bothell_Stem_4.reshore.json'), 'utf8'));
const real = await page.evaluate(d => {
  deserializeDoc(d); sortLevelsByElevation();
  state.project.minRegionSF = 200; state.project.solveStepFt = 2; state.results = null;
  const all = solveAll({ step: 2 });
  const L = all.levels.find(x => x.pour.name === '3');
  return { areaSF: L.solve.areaSF, noShore: L.solve.noShoreRows,
    regions: L.solve.regions.map((r, i) => ({ name: regionLabel(r, i, L), sf: r.areaSF, sliverSF: r.sliverSF || 0,
      shape: cascadeShape(r), bb: [Math.round(r.bb.minX), Math.round(r.bb.maxX), Math.round(r.bb.minY), Math.round(r.bb.maxY)] })) };
}, job);
console.log('   ' + JSON.stringify(real.regions.map(x => [x.name, x.sf, x.shape])));
// The numbers below were re-pinned on Sep 15 2026 against the job file as he
// last saved it (1175_Bothell_Stem_4.reshore.json, Sep 15) and the exact-area
// solver. They moved for two reasons that are not this rule: the saved job
// itself changed, and region areas now come from the region's polygon rather
// than from counting 2 ft sample cells. What the section is actually guarding
// is unchanged — the corner with nothing under it stays its own region and is
// reported, and only harmless slivers are absorbed.
ok(Math.abs(real.areaSF - 22779) / 22779 < 0.01, 'the placement area: ' + Math.round(real.areaSF));
const corner = real.regions.find(x => x.shape === 'noslab>noslab>grade');
ok(!!corner, 'the corner patch is its own region again');
if (corner) {
  ok(corner.sf > 120 && corner.sf < 180, 'about 150 SF of it: ' + Math.round(corner.sf));
  // names are the load path now (Sep 17 2026): this one says no slab under it
  // on both floors and slab on grade at the bottom
  ok(/^9" Slab – L2 no slab – L1 no slab – L0 SOG$/.test(corner.name), 'named by what is under it — no slab, no slab, then grade: ' + corner.name);
}
ok(real.noShore >= 1, 'the rows nothing in the catalog reaches are reported, where the merge showed none: ' + real.noShore);
const merged = real.regions.reduce((n, x) => n + x.sliverSF, 0);
ok(merged > 0 && merged < 200, 'only harmless slivers are absorbed: ' + Math.round(merged) + ' SF');
ok(real.regions.length === 5, 'five regions, not three: ' + real.regions.length);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

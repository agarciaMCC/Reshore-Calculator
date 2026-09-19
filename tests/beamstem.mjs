// @rules BEM-03  (see DECISIONS.md)
// A BEAM'S STEM FOLLOWS THE SLAB IT SITS IN, PIECE BY PIECE (Sep 18 2026)
// Adolfo: "if I have a beam that is the same depth as an adjacent slab for a
// portion of it, the calculator will assume no extra stem load for the
// entire beam even if a portion of the beam is deeper than another adjacent
// slab. that shouldnt happen."
//  A. a 20" beam over a 9" slab and, for part of its run, over a 20"-thick
//     slab patch small enough to be merged as a sliver: the deeper part still
//     carries its stem, the part flush with the thick slab carries none
//  B. the two items are named apart by stem
//  C. a beam wholly over one slab is still one item
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

await page.evaluate(() => {
  window.SQ = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  window.build = (opts) => {
    const T = [1, 0, 0, 1, 0, 0];
    const mk = (name, el, slab, cap) => ({
      id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap,
      rangeFrom: null, rangeTo: null, pdfPage: 1, zones: [], slabZones: [], alignment: { transform: T, points: [] },
    });
    state.project = { name: 'beamstem', loadingConditions: [{ mark: '1', desc: 'TYP', sdl: 14, ll: 40, confirmed: true }], shoreChoices: {}, solveStepFt: 2, minRegionSF: 200 };
    state.levels = [mk('L3', 30, 9, 54), mk('L2', 20, 9, 54), mk('L1', 10, 9, 400)];
    state.pdf.pages = 1; state.pdf.current = 1;
    const pour = state.levels[0];
    pour.zones.push({ id: sid(), polygon: SQ(0, 0, 100, 100), capacityPSF: 54, mark: '1', label: '', colorIdx: 0 });
    // a 2 ft wide, 20" deep beam running 60 ft across the pour
    pour.slabZones.push({ id: sid(), polygon: SQ(20, 40, 80, 42), kind: 'beam', widthIn: 24, depthIn: 20, label: 'B' });
    if (!opts || !opts.uniform) {
      // a thick slab patch (20", as deep as the beam) under 12 ft of its run — 144 SF,
      // under the 200 SF minimum, so the region it makes is a sliver
      pour.slabZones.push({ id: sid(), polygon: SQ(60, 36, 72, 48), kind: 'slab', thicknessIn: 20, offsetIn: 0, label: 'thick' });
    }
    state.results = null; state.activeLevelIdx = 0;
    renderSidebar(); persist();
  };
  window.beams = () => {
    const s = solveAll({ step: 2 }).levels[0].solve;
    return { spatial: s.spatial, regions: s.regions.map(r => [Math.round(r.areaSF), r.thicknessIn, r.sliverSF || 0]),
      beams: s.beams.map((b, i) => ({ name: beamLabel(b, i), stem: b.stemIn, plf: b.plf, sf: Math.round(b.areaSF), lf: b.lengthFt, thick: b.thicknessIn, split: !!b.stemSplit })) };
  };
});

console.log('A. a beam over two slab thicknesses keeps its stem where it is deeper');
const A = await page.evaluate(() => { build(); return beams(); });
console.log('   regions ' + JSON.stringify(A.regions) + '\n   beams ' + JSON.stringify(A.beams));
ok(A.spatial, 'solves');
ok(A.regions.length === 1 && A.regions[0][2] > 0, 'the thick patch was absorbed as a sliver into the 9" region (one region, sliver SF > 0): ' + JSON.stringify(A.regions));
const deep = A.beams.find(b => b.stem === 11), flush = A.beams.find(b => b.stem === 0);
ok(!!deep, 'the part over the 9" slab is its own item with an 11" stem: ' + JSON.stringify(A.beams));
ok(deep && deep.plf === Math.round((24 / 12) * (11 / 12) * 150 * 10) / 10 && deep.lf >= 46 && deep.lf <= 50, `carrying ${deep && deep.plf} PLF over ~48 LF (${deep && deep.lf})`);
ok(!!flush && flush.plf === 0 && flush.lf >= 10 && flush.lf <= 14, 'the part flush with the 20" slab carries no stem over ~12 LF: ' + JSON.stringify(flush));
ok(A.beams.length === 2, 'two items for one beam, not one');

console.log('B. named apart by stem');
ok(A.beams.every(b => b.split) && deep.name.includes('(11" stem)') && flush.name.includes('(0" stem)'), 'each item says its stem in its name: ' + A.beams.map(b => b.name).join(' | '));

console.log('C. a beam over one slab is still one item');
const C = await page.evaluate(() => { build({ uniform: true }); return beams(); });
ok(C.beams.length === 1 && C.beams[0].stem === 11 && !C.beams[0].split && !/stem\)/.test(C.beams[0].name), 'one item, 11" stem, plain name: ' + JSON.stringify(C.beams));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

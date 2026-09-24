// @rules BEM-09, RES-12  (see DECISIONS.md)
// A BEAM WHOSE TOP IS BELOW THE SLAB'S (Adolfo, Sep 24 2026)
//  A. the stem is the concrete below the slab soffit: a 20" beam topped 6"
//     below a 9" slab hangs 17" below it, not 11" (depth - slab assumed the
//     tops were level)
//  B. a beam riding on its slab is unchanged (depth - slab)
//  C. a beam topped 6" down, across a slab at typical and one dropped 6", is two items,
//     each with its own stem, and the Results highlight of each covers only
//     its own part of the beam
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
  window.build = (beamOff, dropHalf) => {
    const T = [1, 0, 0, 1, 0, 0];
    const mk = (name, el, slab, cap) => ({
      id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap,
      rangeFrom: null, rangeTo: null, pdfPage: 1, zones: [], slabZones: [], alignment: { transform: T, points: [] },
    });
    state.project = { name: 'beamdrop', loadingConditions: [{ mark: '1', desc: 'TYP', sdl: 14, ll: 40, confirmed: true }], shoreChoices: {}, solveStepFt: 2, minRegionSF: 200 };
    state.levels = [mk('L3', 30, 9, 54), mk('L2', 20, 9, 54), mk('L1', 10, 9, 400)];
    state.pdf.pages = 1; state.pdf.current = 1;
    const pour = state.levels[0];
    pour.zones.push({ id: sid(), polygon: SQ(0, 0, 100, 100), capacityPSF: 54, mark: '1', label: '', colorIdx: 0 });
    // a 2 ft wide, 20" deep beam running 60 ft across the pour
    pour.slabZones.push({ id: 'bm', polygon: SQ(20, 40, 80, 42), kind: 'beam', widthIn: 24, depthIn: 20, offsetIn: beamOff, label: 'B' });
    // the east half of the floor dropped 6"
    if (dropHalf) pour.slabZones.push({ id: sid(), polygon: SQ(50, 0, 100, 100), kind: 'slab', thicknessIn: 9, offsetIn: -6, label: 'drop' });
    state.results = null; state.activeLevelIdx = 0;
    renderSidebar(); persist();
  };
  window.beams = () => {
    const s = solveAll({ step: 2 }).levels[0].solve;
    return s.beams.map(b => ({ stem: b.stemIn, plf: b.plf, lf: b.lengthFt, key: beamHlKey(b), bb: b.bb }));
  };
});

console.log('A. a beam topped 6" below the slab');
const A = await page.evaluate(() => { build(-6, false); return beams(); });
ok(A.length === 1 && A[0].stem === 17, 'stem is 17" (20" beam from 6" down, under a 9" slab): ' + JSON.stringify(A));
ok(A[0] && A[0].plf === Math.round(2 * (17 / 12) * 150 * 10) / 10, 'and the PLF follows: ' + (A[0] && A[0].plf));
ok(await page.evaluate(() => beamStemIn(20, 9, 0, -6) === 17 && beamStemIn(20, 9, 0, null) === 11 && beamStemIn(8, 9, 0, 0) === 0 && beamStemIn(8, 9, 0, -6) === 5), 'beamStemIn: dropped, riding, shallow, shallow and dropped');
ok(await page.evaluate(() => beamSoffitIn(20, 9, 0, -6) === 20 && beamSoffitIn(4, 9, 0, -2) === 7), 'soffit: the lowest concrete, measured from the beam top');

console.log('B. a beam riding on its slab is as before');
const B = await page.evaluate(() => { build(null, false); return beams(); });
ok(B.length === 1 && B[0].stem === 11, 'depth - slab: ' + JSON.stringify(B));

console.log('C. a beam topped 6" down across a dropped half');
const C = await page.evaluate(() => { build(-6, true); return beams(); });
const s11 = C.find(b => b.stem === 17), s5 = C.find(b => b.stem === 11);
ok(C.length === 2 && s11 && s5, 'two items: 17" stem under the typical slab, 11" under the slab dropped to its top: ' + JSON.stringify(C.map(b => [b.stem, b.lf])));
ok(s11 && s5 && s11.key !== s5.key, 'each has its own highlight key');
ok(s11 && s11.bb.maxX <= 51 && s5 && s5.bb.minX >= 49, 'each covers its own half of the beam: ' + JSON.stringify([s11 && s11.bb, s5 && s5.bb]));
const H = await page.evaluate(k => {
  runSchedule();
  const L = schedSolve.levels[0];
  const mp = beamHighlightMp({ regionKey: k, pour: L.pour.name });
  const bb = mp ? mpBBox(mp) : null;
  return bb;
}, s5 && s5.key);
ok(H && H.minX >= 49 && H.maxX <= 81, 'the highlight of the dropped part lights only that part: ' + JSON.stringify(H));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

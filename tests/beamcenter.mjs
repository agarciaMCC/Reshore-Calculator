// A BEAM IS READ ALONG ITS CENTERLINE (Sep 18 2026)
// Adolfo: "if a beam above is slightly wider than a beam below, it will take
// the shore height of the slab outside of the narrower beam below. usually
// we'll try to install reshore at the center of the beam unless the beam is
// very wide and deep, then we might end up installing the shore out a bit
// wider." Chose: read what is under a beam along its centerline, always;
// with 2+ per cluster over a narrower beam below, flag the risk; an offset
// centerline that falls on slab reads the slab.
//  A. a 30" beam over a 24" beam below: ONE item, reshore height to the beam
//     below's soffit, no strips beside it
//  B. the beam below stops 20 ft short: two items along the run — over the
//     beam, then over slab (taller)
//  C. 2 per cluster over the narrower beam: the row warns; 1 per cluster: it
//     only notes what it stands on
//  D. beam above offset so its centerline is over slab: reads the slab
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';
const here = new URL('.', import.meta.url).pathname;
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
  window.build = (o) => {
    o = o || {};
    const T = [1, 0, 0, 1, 0, 0];
    const mk = (name, el, slab, cap) => ({ id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap, rangeFrom: null, rangeTo: null, pdfPage: 1, zones: [], slabZones: [], alignment: { transform: T, points: [] } });
    state.project = { name: 'bc', loadingConditions: [{ mark: '1', desc: 'TYP', sdl: 14, ll: 40, confirmed: true }], shoreChoices: {}, solveStepFt: 2, minRegionSF: 200 };
    // L3 pours; L2 carries with little spare so the beam is shored under L2; L1 strong
    state.levels = [mk('L3', 30, 9, 54), mk('L2', 20, 9, 30), mk('L1', 10, 9, 400)];
    state.pdf.pages = 1; state.pdf.current = 1;
    const pour = state.levels[0], below = state.levels[1];
    pour.zones.push({ id: sid(), polygon: SQ(0, 0, 100, 100), capacityPSF: 54, mark: '1', label: '', colorIdx: 0 });
    // the pour's beam: 30" wide (2.5 ft), 24" deep, 60 ft long, centred on y = 50
    const bx0 = o.offsetX ? 20 : 20, cy = o.shiftY != null ? o.shiftY : 50;
    pour.slabZones.push({ id: sid(), polygon: SQ(bx0, cy - 1.25, bx0 + 60, cy + 1.25), kind: 'beam', widthIn: 30, depthIn: 24, label: 'A' });
    // the beam below: 24" wide (2 ft), 18" deep, centred on y = 50, running the whole beam or stopping short
    const bl1 = o.short ? 60 : 80;
    below.slabZones.push({ id: sid(), polygon: SQ(20, 49, bl1, 51), kind: 'beam', widthIn: 24, depthIn: 18, label: 'B' });
    state.results = null; state.activeLevelIdx = 0;
    renderSidebar(); persist();
  };
  window.beams = () => {
    const s = solveAll({ step: 2 }).levels[0].solve;
    return s.beams.map((b, i) => ({ name: beamLabel(b, i), sf: Math.round(b.areaSF), lf: b.lengthFt, stem: b.stemIn,
      rows: b.rows.map(r => ({ under: r.level.name, h: r.shoreHeightFt != null ? feetToStr(r.shoreHeightFt) : null, net: Math.round(r.beamNet), open: !!r.open })),
      below: b.below && Object.fromEntries(Object.entries(b.below).map(([k, v]) => [k, [v.widthIn, v.slabHeightFt && feetToStr(v.slabHeightFt)]])) }));
  };
});

console.log('A. a 30" beam over a 24" beam below, full length');
const A = await page.evaluate(() => { build(); return beams(); });
console.log('   ' + JSON.stringify(A));
// L2 T.O.S. 20, L1 T.O.S. 10: shore to the L2 beam soffit = 10 - 18/12 = 8'-6"; to the L2 slab soffit = 10 - 9/12 = 9'-3"
ok(A.length === 1, 'one item for the beam, no strips beside the narrower beam below: ' + A.length);
ok(A[0] && A[0].lf >= 58 && A[0].lf <= 62, 'over its full 60 ft: ' + (A[0] && A[0].lf));
const rowA = A[0] && A[0].rows.find(r => r.under === 'L2');
ok(rowA && rowA.h === `8'-6"`, 'the reshore under L2 goes to the soffit of the beam below, 8\'-6": ' + JSON.stringify(rowA));
ok(A[0] && A[0].below && A[0].below['1'] && A[0].below['1'][0] === 24 && A[0].below['1'][1] === `9'-3"`, 'and remembers the 24" beam below with the 9\'-3" slab height beside it: ' + JSON.stringify(A[0] && A[0].below));

console.log('B. the beam below stops 20 ft short');
const B = await page.evaluate(() => { build({ short: true }); return beams(); });
console.log('   ' + JSON.stringify(B.map(b => [b.lf, b.rows.find(r => r.under === 'L2') && b.rows.find(r => r.under === 'L2').h])));
ok(B.length === 2, 'two items along the run: ' + B.length);
const onBeam = B.find(b => b.rows.some(r => r.under === 'L2' && r.h === `8'-6"`)), onSlab = B.find(b => b.rows.some(r => r.under === 'L2' && r.h === `9'-3"`));
ok(onBeam && onBeam.lf >= 38 && onBeam.lf <= 42, 'about 40 ft over the beam below at 8\'-6": ' + (onBeam && onBeam.lf));
ok(onSlab && onSlab.lf >= 18 && onSlab.lf <= 22, 'about 20 ft over the slab at 9\'-3": ' + (onSlab && onSlab.lf));

console.log('C. the per-cluster warning');
const C = await page.evaluate(() => {
  build();
  runSchedule ? null : null;
  const s = solveAll({ step: 2 }).levels[0].solve; const b = s.beams[0]; const row = b.rows.find(r => r.level.name === 'L2');
  const one = beamBelowNote(b, { ...row, beamPerCluster: 1 });
  const two = beamBelowNote(b, { ...row, beamPerCluster: 2 });
  return { one, two };
});
ok(/stands on the 24" beam below/.test(C.one) && !/lm-warn/.test(C.one), '1 per cluster: a quiet note of what it stands on: ' + C.one.replace(/<[^>]+>/g, ''));
ok(/lm-warn/.test(C.two) && /outer shores may stand on the slab beside the 24" beam below/.test(C.two) && /9(&#39;|')-3(&quot;|")/.test(C.two), '2 per cluster over a narrower beam: a warning with the slab height: ' + C.two.replace(/<[^>]+>/g, ''));

console.log('D. centerline off the beam below reads the slab');
const D = await page.evaluate(() => { build({ shiftY: 53 }); return beams(); });
const rowD = D[0] && D[0].rows.find(r => r.under === 'L2');
ok(D.length === 1 && rowD && rowD.h === `9'-3"`, 'a beam offset 3 ft so its centerline is over slab stands on the slab, 9\'-3": ' + JSON.stringify(D.map(b => [b.lf, b.rows])));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

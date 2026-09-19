// Curves. Every consumer works in straight segments, so the question is how
// finely a Bezier gets chopped — and whether Simplify can tell a traced curve
// from drafting litter. fixtures/curve.pdf is a generated sheet with a filled
// disc, a stroked circle and a plain square.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';
import fs from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'curve.pdf'));
await page.evaluate(async b64 => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
}, pdf.toString('base64'));

console.log('A. how finely a cubic gets chopped');
const unit = await page.evaluate(() => {
  const I = [1, 0, 0, 1, 0, 0];
  const K = 0.5522847498;
  // one quarter of a circle, radius 300, as its cubic
  const R = 300, k = K * R;
  const n = cubicSteps(I, R, 0, R, k, k, R, 0, R);
  const pts = [];
  cubicWalk(I, R, 0, R, k, k, R, 0, R, (x, y) => pts.push({ x, y }));
  let worst = 0, sag = 0;
  for (const p of pts) worst = Math.max(worst, Math.abs(Math.hypot(p.x, p.y) - R));
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    sag = Math.max(sag, R - Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2));
  }
  // a straight "curve" — three collinear controls — needs no chopping
  const straight = cubicSteps(I, 0, 0, 10, 0, 20, 0, 30, 0);
  // a bigger arc needs more pieces than a small one
  const small = cubicSteps(I, 30, 0, 30, K * 30, K * 30, 30, 0, 30);
  return { n, pts: pts.length, worst, sag, straight, small, tol: CURVE_TOL_PX };
});
ok(unit.tol === 0.25, 'the tolerance is a quarter of a device pixel: ' + unit.tol);
ok(unit.n >= 15 && unit.n <= 40, 'a 300 px quarter-circle takes a couple of dozen pieces: ' + unit.n);
ok(unit.pts === unit.n, 'and it hands back that many points');
ok(unit.worst < 0.15, 'every point lands on the true arc, within the cubic\'s own approximation of a circle: ' + unit.worst.toFixed(3) + ' px off');
ok(unit.sag <= 0.25 + 1e-6, 'and no chord sags past the tolerance: ' + unit.sag.toFixed(3) + ' px');
ok(unit.straight === 1, 'three collinear controls are left as one segment: ' + unit.straight);
ok(unit.small < unit.n, 'a smaller arc takes fewer pieces: ' + unit.small + ' vs ' + unit.n);

console.log('B. a filled disc traces as a disc, not a diamond');
const fill = await page.evaluate(async () => {
  const fr = await fillRegionObjects(1);
  const big = fr.filter(f => !f.white).sort((a, b) =>
    ((b.bbox.maxx - b.bbox.minx) * (b.bbox.maxy - b.bbox.miny)) - ((a.bbox.maxx - a.bbox.minx) * (a.bbox.maxy - a.bbox.miny)))[0];
  if (!big) return null;
  const poly = big.polys[0];
  const cx = (big.bbox.minx + big.bbox.maxx) / 2, cy = (big.bbox.miny + big.bbox.maxy) / 2;
  const R = (big.bbox.maxx - big.bbox.minx) / 2;
  let worst = 0;
  for (const p of poly) worst = Math.max(worst, Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - R));
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return { pts: poly.length, R, worst, area: Math.abs(a / 2), trueArea: Math.PI * R * R, diamond: 2 * R * R };
});
ok(fill && fill.pts >= 60, 'the disc comes back as a fine polygon, not four chords: ' + (fill && fill.pts) + ' points');
ok(fill && fill.worst < 0.6, 'every corner sits on the circle: ' + (fill && fill.worst.toFixed(2)) + ' px off');
const err = fill ? Math.abs(fill.area - fill.trueArea) / fill.trueArea : 1;
ok(err < 0.005, 'and its area is the circle\'s to under half a percent: ' + (err * 100).toFixed(2) + '%');
// what the old chord-only reading would have cost
const wouldHave = fill ? Math.abs(fill.diamond - fill.trueArea) / fill.trueArea : 0;
ok(wouldHave > 0.3, 'flattening to chords would have lost ' + (wouldHave * 100).toFixed(0) + '% of the area');

console.log('C. the detector follows the arc, not the chord');
// pageStrokes hands back flat [x1,y1,x2,y2,...] segment runs in device px
const ink = await page.evaluate(async () => {
  const ps = await pageStrokes(1);
  const cx = 612, cy = 1224, R = 240;      // the stroked circle, device space
  const seg = ps.heavy.length ? ps.heavy : ps.thin;
  let onRim = 0, longest = 0, total = 0;
  for (let i = 0; i + 3 < seg.length; i += 4) {
    const d1 = Math.abs(Math.hypot(seg[i] - cx, seg[i + 1] - cy) - R);
    const d2 = Math.abs(Math.hypot(seg[i + 2] - cx, seg[i + 3] - cy) - R);
    const len = Math.hypot(seg[i + 2] - seg[i], seg[i + 3] - seg[i + 1]);
    total++;
    if (d1 < 3 && d2 < 3) { onRim++; longest = Math.max(longest, len); }
  }
  // the middle of one quarter arc: a single chord would miss it by 0.29R
  const s = Math.SQRT1_2;
  let nearArc = Infinity;
  for (let i = 0; i + 3 < seg.length; i += 4)
    nearArc = Math.min(nearArc, Math.hypot(seg[i] - (cx + R * s), seg[i + 1] - (cy - R * s)));
  return { total, onRim, longest, nearArc, chordWouldBe: R * Math.SQRT2 };
});
ok(ink.total > 60, 'the stroked circle yields many segments, not four: ' + ink.total);
ok(ink.onRim > 60, 'and they sit on the rim: ' + ink.onRim);
ok(ink.longest < 40, 'no segment spans a quarter of the circle — longest is ' + ink.longest.toFixed(0) +
   ' px against the ' + ink.chordWouldBe.toFixed(0) + ' px a single chord would be');
ok(ink.nearArc < 15, 'there is ink at the middle of the arc, which a chord would miss by 70 px: ' + ink.nearArc.toFixed(1));

console.log('D. snapping geometry is tessellated too');
const snap = await page.evaluate(async () => {
  await ensurePageGeometry(1);
  const rec = geomCache[1], segs = rec.segs;
  const cx = 612, cy = 584, R = 300;        // the filled disc, device space
  let on = 0;
  for (let i = 0; i < rec.n; i++) {
    const o = i << 2;
    if (Math.abs(Math.hypot(segs[o] - cx, segs[o + 1] - cy) - R) < 3) on++;
  }
  return { n: rec.n, on };
});
ok(snap.n > 100, 'the page yields a tessellated segment set: ' + snap.n);
ok(snap.on > 50, 'plenty of it on the disc rim, so a corner snap finds the curve: ' + snap.on);

console.log('E. Simplify tells a curve from litter');
const simp = await page.evaluate(() => {
  // a half circle at 3 degrees, then a straight run with litter shaken onto it
  const poly = [];
  for (let a = 180; a >= 0; a -= 3) poly.push({ x: 400 + 200 * Math.cos(a * Math.PI / 180), y: 400 - 200 * Math.sin(a * Math.PI / 180) });
  for (let i = 1; i <= 10; i++) poly.push({ x: 600 - i * 40, y: 400 + (i % 2 ? 4 : -4) });
  const mask = curveRunMask(poly);
  const onCurve = [...mask].filter(Boolean).length;
  // the litter sits on the straight run, so it must NOT be called a curve
  const litterFlagged = [...mask].slice(61).filter(Boolean).length;
  const sag = pts => { let m = 0;
    for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1];
      if (a.y > 400.5 || b.y > 400.5) continue;
      m = Math.max(m, 200 - Math.hypot((a.x + b.x) / 2 - 400, (a.y + b.y) / 2 - 400)); }
    return m; };
  const out = {};
  for (const v of [25, 50, 100]) {
    const e = simplifyEps(poly, v);
    const plain = simplifyPoly(poly, e), kept = simplifyKeepingCurves(poly, e, 0.3);
    out[v] = { plainPts: plain.length, plainSag: +sag(plain).toFixed(2), keptPts: kept.length, keptSag: +sag(kept).toFixed(2) };
  }
  return { n: poly.length, onCurve, litterFlagged, out };
});
ok(simp.onCurve > 40 && simp.onCurve < simp.n, 'the arc is recognised as a curve, the rest is not: ' + simp.onCurve + ' of ' + simp.n);
ok(simp.litterFlagged === 0, 'litter on a straight run is never called a curve: ' + simp.litterFlagged);
ok(simp.out[100].plainSag > 100, 'plain simplify at full travel collapses the arc to its chord — ' + simp.out[100].plainSag.toFixed(0) + ' px off the true curve');
ok(simp.out[100].keptSag < 1, 'the curve-aware one holds the arc to under a pixel at full travel: ' + simp.out[100].keptSag);
ok([25, 50, 100].every(v => simp.out[v].keptSag < 1), 'at every setting: ' + JSON.stringify([25, 50, 100].map(v => simp.out[v].keptSag)));
ok(simp.out[100].keptPts < simp.n - 15, 'and the litter still goes: ' + simp.n + ' down to ' + simp.out[100].keptPts);
// a shape with no curve at all behaves exactly as before
const plainShape = await page.evaluate(() => {
  const poly = [{ x: 0, y: 0 }];
  for (let i = 1; i <= 9; i++) poly.push({ x: i * 40, y: (i % 2 ? 3 : -3) });
  poly.push({ x: 400, y: 300 }, { x: 0, y: 300 });
  const e = simplifyEps(poly, 100);
  return { plain: simplifyPoly(poly, e).length, kept: simplifyKeepingCurves(poly, e, 0.3).length };
});
ok(plainShape.plain === plainShape.kept, 'a shape with no curve simplifies identically: ' + JSON.stringify(plainShape));

console.log('F. the slider uses it');
const wired = await page.evaluate(() => {
  const T = [1, 0, 0, 1, 0, 0];
  const poly = [];
  for (let a = 180; a >= 0; a -= 3) poly.push({ x: 400 + 200 * Math.cos(a * Math.PI / 180), y: 400 - 200 * Math.sin(a * Math.PI / 180) });
  for (let i = 1; i <= 10; i++) poly.push({ x: 600 - i * 40, y: 400 + (i % 2 ? 4 : -4) });
  state.project = { name: 'curve', loadingConditions: [], shoreChoices: {} };
  state.levels = [{ id: sid(), name: 'L1', elevation: 10, floorToFloor: null, slabThickness: 9, defaultCapacity: 100,
    rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [], alignment: { transform: T, points: [] } }];
  state.levels[0].zones.push({ id: sid(), polygon: poly, capacityPSF: 100, mark: 'A', label: '', colorIdx: 0 });
  state.activeLevelIdx = 0; state.layer = 'loading'; state.activeZoneIdx = 0;
  setStep('areas'); setLayer('loading'); setTool('select');
  renderSidebar(); renderProperties();
  const inp = document.getElementById('propSimplify');
  if (!inp) return null;
  inp.value = 100; inp.dispatchEvent(new Event('input', { bubbles: true }));
  const after = state.levels[0].zones[0].polygon;
  let m = 0;
  for (let i = 0; i + 1 < after.length; i++) { const a = after[i], b = after[i + 1];
    if (a.y > 400.5 || b.y > 400.5) continue;
    m = Math.max(m, 200 - Math.hypot((a.x + b.x) / 2 - 400, (a.y + b.y) / 2 - 400)); }
  inp.value = 0; inp.dispatchEvent(new Event('input', { bubbles: true }));
  return { before: poly.length, after: after.length, sag: +m.toFixed(2), restored: state.levels[0].zones[0].polygon.length };
});
ok(wired && wired.after < wired.before, 'the slider still drops corners on a curved shape: ' + JSON.stringify(wired));
ok(wired && wired.sag < 1, 'without straightening the curve: ' + (wired && wired.sag) + ' px');
ok(wired && wired.restored === wired.before, 'and dragging back is still lossless');
// the quarter-inch tolerance in real units on a matched sheet
const epsPx = await page.evaluate(() => {
  const T = [0.0694, 0, 0, 0.0694, 0, 0];        // 1" = 10' at render scale 2
  const lv = { alignment: { transform: T } };
  return curveEpsPx(lv, [{ x: 0, y: 0 }, { x: 100, y: 100 }]);
});
ok(epsPx > 0.2 && epsPx < 0.45, 'a quarter building inch works out at about a third of a pixel: ' + epsPx.toFixed(2));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

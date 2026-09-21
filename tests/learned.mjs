// @rules EDG-09  (see DECISIONS.md)
// LEARNED FROM THE EDGES ADOLFO DREW ON KINECT (Sep 17 2026)
// "is it possible for you to learn patterns for the floor edge from what I
// have drawn now?" His edges: run straight past column bumps and drop caps;
// cut X-marked openings out along their OUTLINE, never along the X's legs;
// and are closed by hand where the drawing leaves them open.
//  A. flattenScallops: a jog out (or in) and straight back, no deeper than
//     2.5 ft and no wider than 6 ft, is not edge — the run goes straight past
//  B. a real step is kept: deeper than 2.5 ft, or wider than 6 ft, or one
//     that does not come back to the same line
//  C. on an unmatched sheet (no scale) it falls back to fractions of the
//     outline's diagonal
//  D. the detector runs every candidate through it (2.5 ft / 6 ft) and
//     reports how many bumps it flattened
//  E. what was tried and parked stays parked: painting the X in and erasing
//     dashed lines are OFF, the closing radius is 4 — each made his Kinect
//     edges worse (project doc claude/reshore-learned-edges.md)
//  F. an X-marked opening is found by its outline and cut out along it, not
//     along the X (the opening detector, on the 1175 set)
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
const appPath = path.resolve(here, '..', 'reshore-calc.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + appPath);
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// A 100 x 60 ft slab (1 px = 1 ft) with bumps on its bottom edge. Each bump is
// [x, width, depth]: depth > 0 juts out (down), < 0 notches in.
await page.evaluate(() => {
  window.slab = (bumps) => {
    const P = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    let x = 100;
    // walk the bottom edge right to left
    const bs = bumps.slice().sort((a, b) => b[0] - a[0]);
    P.push({ x: 100, y: 60 });
    for (const [bx, w, d] of bs) {
      P.push({ x: bx + w, y: 60 }); P.push({ x: bx + w, y: 60 + d }); P.push({ x: bx, y: 60 + d }); P.push({ x: bx, y: 60 });
    }
    P.push({ x: 0, y: 60 });
    return P;
  };
  window.area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a) / 2; };
  window.offLine = (P) => P.filter(p => p.y !== 0 && p.y !== 60 && p.x !== 0 && p.x !== 100).length;
});

console.log('A. column bumps are flattened');
const A = await page.evaluate(() => {
  const P = slab([[20, 2, 2], [50, 4, 1.5], [80, 3, -2]]);   // two pilasters out, one notch in
  const r = flattenScallops(P, 1, 2.5, 6);
  return { before: P.length, after: r.polygon.length, removed: r.removed, area: area(r.polygon), off: offLine(r.polygon), areaBefore: area(P) };
});
ok(A.before === 16 && A.removed === 6, 'three bumps -> six corners dropped: ' + JSON.stringify([A.before, A.removed]));
ok(A.after === 10, 'the run keeps the two points where each bump met the line: ' + A.after);
ok(A.off === 0, 'no vertex is left off the straight edge');
ok(Math.abs(A.area - 6000) < 1e-6, 'the edge runs straight past them: the slab is 100 x 60 again: ' + A.area);
ok(A.areaBefore !== 6000, '(the bumps had changed the area: ' + A.areaBefore + ')');

console.log('B. a real step is kept');
const B = await page.evaluate(() => {
  const deep = flattenScallops(slab([[20, 4, 4]]), 1, 2.5, 6);       // 4 ft deep: a step, not a column
  const wide = flattenScallops(slab([[20, 8, 2]]), 1, 2.5, 6);       // 8 ft wide: a bay, not a column
  const edge = flattenScallops(slab([[20, 4, 2.5], [60, 6, 2]]), 1, 2.5, 6);  // exactly at the limits: still a bump
  // a jog that does not come back to the same line is a step in the edge
  const P = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 52, y: 60 }, { x: 52, y: 62.5 }, { x: 48, y: 62.5 }, { x: 48, y: 62.2 }, { x: 0, y: 62.2 }];
  const uneven = flattenScallops(P, 1, 2.5, 6);
  return { deep: deep.removed, wide: wide.removed, edge: edge.removed, uneven: uneven.removed };
});
ok(B.deep === 0, 'a 4 ft deep jog is a step and stays: ' + B.deep);
ok(B.wide === 0, 'an 8 ft wide jog is a bay and stays: ' + B.wide);
ok(B.edge === 4, 'jogs right at 2.5 ft deep / 6 ft wide are still bumps: ' + B.edge);
ok(B.uneven === 0, 'a jog whose legs do not come back to the same line is a step: ' + B.uneven);

console.log('C. no scale: fractions of the diagonal');
const C = await page.evaluate(() => {
  // 1000 x 600 px outline, diagonal ~1166: depth limit ~7 px, width ~17.5 px.
  // Bumps of 15x6 px (goes), 30x6 px (too wide, stays), 15x15 px (too deep, stays)
  const P = slab([[20, 1.5, 0.6], [50, 3, 0.6], [80, 1.5, 1.5]]).map(p => ({ x: p.x * 10, y: p.y * 10 }));
  const r = flattenScallops(P, null, 2.5, 6);
  return { removed: r.removed, n: r.polygon.length };
});
ok(C.removed === 2 && C.n === 14, 'only the small bump goes; the wide one and the deep one stay: ' + JSON.stringify(C));
const C2 = await page.evaluate(() => flattenScallops([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 1, 2.5, 6));
ok(C2.removed === 0 && C2.polygon.length === 4, 'a plain rectangle is left alone');

console.log('D. the detector runs its candidates through it');
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'test-set.pdf'));
await page.evaluate(async b64 => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 3; state.pdf.pageImages = {};
}, pdf.toString('base64'));
const D = await page.evaluate(async () => {
  const r = await detectFloorEdge(3);
  return { ok: r.ok, cands: (r.candidates || []).map(c => ({ scallops: c.scallops, n: c.polygon.length, traced: c.traced })) };
});
ok(D.ok && D.cands.length >= 1, 'sheet 3 detects: ' + D.cands.length + ' offered');
ok(D.cands.every(c => typeof c.scallops === 'number' && c.scallops >= 0 && Number.isInteger(c.scallops)), 'every candidate reports how many bumps were flattened: ' + JSON.stringify(D.cands.map(c => c.scallops)));
const src = fs.readFileSync(appPath, 'utf8');
ok(/flattenScallops\([^)]*pageFtPerPx\(num\),\s*2\.5,\s*6\)/.test(src), 'and it is called with his limits: 2.5 ft deep, 6 ft wide');

console.log('E. what was tried and parked stays parked');
ok(/const ERASE_DASHED=false;/.test(src), 'erasing dashed lines is OFF (it opened L3 North\'s pocket)');
ok(/const FILL_X_OPENINGS=false;/.test(src), 'painting the X in is OFF (it made a white ring round the opening into slab)');
ok(await page.evaluate(() => EDGE_CLOSE_R) === 4, 'the closing radius is 4 (6 welded every Kinect sheet into a rectangle)');

console.log('F. an X-marked opening is cut out along its outline, not the X');
const F = await page.evaluate(async () => {
  const r = await detectOpenings(3);
  return r.items.map(i => ({ n: i.polygon ? i.polygon.length : 0, how: i.why, failed: !!i.failed, label: i.label }));
});
console.log('   ' + JSON.stringify(F));
ok(F.length >= 1, 'openings found on sheet 3: ' + F.length);
ok(F.filter(i => !i.failed).every(i => i.n >= 4), 'each traced opening is a closed outline of 4+ corners, not the two legs of an X: ' + JSON.stringify(F.map(i => i.n)));
ok(F.some(i => /outline/i.test(i.how)), 'and at least one says it followed the printed outline: ' + JSON.stringify(F.map(i => i.how)));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

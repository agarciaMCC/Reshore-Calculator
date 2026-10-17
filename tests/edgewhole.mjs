// @rules EDG-11, EDG-12  (see DECISIONS.md)
// Horizon House garage (Oct 17, 2026): the automatic floor-edge read found
// only part of the slab on B6 and B1.
//  A. B6: a run of the diagonal wall drawn with thin lines broke the heavy
//     edge; the break is closed and the whole floor is read (EDG-11)
//  B. B1–B3: the "3 1/2" CONCRETE ON STEEL DECK" area east of grid 8 is cut
//     out of the outline, and the read says so (EDG-12)
//  C. what does NOT close a break: dashes, a line off the edge, half a
//     break, a break past the cap (EDG-11)
//  D. the deck label is read in its usual spellings (EDG-12)
// The answer is the estimator's own edge in tests/fixtures/horizon/horizon-job.reshore.json.
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
const here = fileURLToPath(new URL('.', import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'horizon', 'horizon-garage.pdf'));
const job = fs.readFileSync(path.resolve(here, 'fixtures', 'horizon', 'horizon-job.reshore.json'), 'utf8');
await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.pageImages = {};
  document.getElementById('upload-prompt').style.display = 'none';
}, pdf.toString('base64'));
await page.evaluate((j) => { deserializeDoc(JSON.parse(j)); sortLevelsByElevation(); }, job);

// the first read against the estimator's edge: SF, and how far the boxes differ (ft)
const read = (name) => page.evaluate(async (name) => {
  const area = p => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j].x + p[i].x) * (p[j].y - p[i].y); return Math.abs(s / 2); };
  const box = p => [Math.min(...p.map(q => q.x)), Math.min(...p.map(q => q.y)), Math.max(...p.map(q => q.x)), Math.max(...p.map(q => q.y))];
  const lv = state.levels.find(l => l.name === name);
  const pg = lv.pdfPage, f = pageFtPerPx(pg);
  const est = lv.slabZones.find(z => z.kind === 'edge').polygon;
  const r = await detectFloorEdge(pg);
  const a = box(r.polygon), b = box(est);
  return { got: Math.round(area(r.polygon) * f * f), want: Math.round(area(est) * f * f),
           boxFt: Math.round(Math.max(...a.map((v, i) => Math.abs(v - b[i]))) * f),
           corners: r.polygon.length, notes: r.notes || [], bridges: (await edgeRaster(pg)).nBridges };
}, name);
const near = x => Math.abs(x.got - x.want) <= 0.05 * x.want;

console.log('A. B6 reads the whole floor (EDG-11)');
const B6 = await read('B6');
ok(near(B6), `B6 ${B6.got} SF, estimator ${B6.want} SF (was 14.0k)`);
ok(B6.boxFt <= 3, 'B6 reaches the estimator\'s extent on every side: off by ' + B6.boxFt + ' ft');
ok(B6.corners <= 12, 'B6 is a clean outline, not one running along interior walls: ' + B6.corners + ' corners');
ok(B6.bridges >= 1, 'B6 closes at least one break: ' + B6.bridges);

console.log('B. B1–B3 leave the steel deck out (EDG-12)');
for (const n of ['B1', 'B2', 'B3']) {
  const x = await read(n);
  ok(near(x), `${n} ${x.got} SF, estimator ${x.want} SF`);
  ok(x.boxFt <= 3, `${n} stops at grid 8, not the deck's far side: off by ${x.boxFt} ft`);
  ok(x.notes.some(t => /metal deck left out \([\d,]+ SF\)/.test(t)), `${n} says the deck was left out: ` + JSON.stringify(x.notes));
}
console.log('   and the floors with no deck are unchanged');
for (const n of ['B4', 'B7']) {
  const x = await read(n);
  ok(near(x), `${n} ${x.got} SF, estimator ${x.want} SF`);
  ok(!x.notes.some(t => /deck/.test(t)), `${n} cuts no deck`);
}

console.log('C. what does not close a break (EDG-11)');
const C = await page.evaluate(() => {
  // a heavy edge along y = 100, from 0–400 and 800–1200: a 400 px break
  const heavy = new Map([[2.9, [0, 100, 400, 100, 800, 100, 1200, 100]]]);
  const run = thin => edgeBridges([2.9], heavy, thin, 1.2, [], 999, 6000).length / 4;
  return {
    wall: run([400, 100, 800, 100, 0.5]),                                   // one solid thin line across
    twoPieces: run([400, 100, 590, 100, 0.5, 610, 100, 800, 100, 0.5]),     // split at a column
    dashes: run([...Array(10)].flatMap((_, i) => [400 + i * 40, 100, 430 + i * 40, 100, 0.5])),
    offLine: run([400, 112, 800, 112, 0.5]),                                 // parallel, 12 px off
    partial: run([400, 100, 600, 100, 0.5]),                                 // half the break
    tooFar: edgeBridges([2.9], new Map([[2.9, [0, 100, 400, 100, 1000, 100, 1400, 100]]]),
      [400, 100, 1000, 100, 0.5], 1.2, [], 999, 6000).length / 4,           // 600 px > 8% of 6000
  };
});
ok(C.wall === 1, 'a solid thin line across the break closes it: ' + C.wall);
ok(C.twoPieces === 1, 'two long pieces either side of a column close it: ' + C.twoPieces);
ok(C.dashes === 0, 'short dashes do not');
ok(C.offLine === 0, 'a thin line off the edge\'s own line does not');
ok(C.partial === 0, 'a thin line under 80% of the break does not');
ok(C.tooFar === 0, 'a break wider than the cap is left open');

console.log('D. the deck label (EDG-12)');
const D = await page.evaluate(() => [
  '3 1/2" CONCRETE ON STEEL DECK', '3" CONC. ON METAL DECK', 'LW CONC OVER 2" COMPOSITE DECK', 'CONCRETE TOPPING ON MTL DECK',
  'METAL DECK ROOF', 'CONCRETE SLAB ON GRADE', 'SEE DECK PLAN',
].map(s => DECK_RE.test(s)));
ok(D.slice(0, 4).every(Boolean), 'deck labels are read: ' + D);
ok(!D.slice(4).some(Boolean), 'a roof deck, a slab on grade or a deck-plan reference is not: ' + D);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

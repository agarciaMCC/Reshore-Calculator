// ANNOTATIONS ARE NOT SLAB (Sep 17 2026)
// Adolfo: "is there a way to avoid slab edge tracing to dimension lines and
// other non-slab edge elements?" Dimension lines (a feet-inch string on a thin
// line with a tick at each end and an extension line crossing each end) and
// section/detail markers (a small filled shape with a number beside it) are
// painted out of the raster before the pocket is traced. The sheet is traced
// both ways; the clean outline is preferred unless taking the dimensions out
// collapsed the pocket, in which case the as-drawn outline is offered and
// says so.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';
import fs from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
const pdf = fs.readFileSync(path.resolve(here, '..', 'Kinect', '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));
await page.evaluate(async ([b64]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
}, [pdf.toString('base64')]);

console.log('A. the text tells a dimension from anything else');
const A = await page.evaluate(() => [`7'-0"`, `1'-0"`, `7'-5" CL`, `30'-7 1/4"`, `20"`, `(3'-6")`, `LEVEL 3`, `T/SLAB 345.50`, `#Q`, `12x24 BM`].map(isDimText));
ok(A.slice(0, 6).every(Boolean), 'feet-inch strings read as dimensions: ' + JSON.stringify(A.slice(0, 6)));
ok(A.slice(6).every(x => !x), 'labels, elevations, codes and beam sizes do not: ' + JSON.stringify(A.slice(6)));

console.log('B. sheet 11 (Level 3 South): the clean outline is preferred and loses the dimension notches');
const B = await page.evaluate(async () => {
  const r = await detectFloorEdge(11);
  const c = r.candidates;
  const clean = c.find(x => x.clean === true), raw = c.find(x => x.clean === false);
  return { ok: r.ok, first: c[0] && c[0].clean, nDim: r.ink.nDim, cleanArea: clean && clean.areaPx2, rawArea: raw && raw.areaPx2, n: c.length };
});
ok(B.ok && B.first === true, 'the outline with dimensions kept out comes first');
ok(B.nDim > 20, 'dozens of dimensions were found and kept out: ' + B.nDim);
ok(B.rawArea && B.cleanArea < B.rawArea && B.cleanArea > B.rawArea * 0.97,
  'it is a little smaller than the as-drawn one — the notches — not collapsed: ' + Math.round(B.cleanArea) + ' vs ' + Math.round(B.rawArea));

console.log('C. sheet 12 (Level 4): the slab edge is not drawn closed, so the as-drawn outline is kept and says so');
const C = await page.evaluate(async () => {
  const r = await detectFloorEdge(12);
  return { first: r.candidates[0].clean, note: (r.notes || []).join(' | '), why: r.candidates[0].why, area: r.areaPx2 };
});
ok(C.first === false, 'the as-drawn outline wins where the clean one collapsed: ' + C.why);
ok(/closes only with a dimension line/.test(C.note), 'and the note says which side to check: ' + C.note);
ok(C.area > 9e6, 'it is the whole floor, not the hatched pour: ' + Math.round(C.area));

console.log('D. sheet 10 (Level 3 North): the as-drawn outline followed the perimeter dimension chain; the clean one follows the slab');
const D = await page.evaluate(async () => {
  const r = await detectFloorEdge(10);
  const c = r.candidates;
  const raw = c.find(x => x.clean === false);
  return { first: c[0].clean, area: r.areaPx2, rawArea: raw && raw.areaPx2 };
});
ok(D.first === true && D.rawArea && D.area < D.rawArea * 0.97, 'the clean outline wins even though it is smaller: ' + Math.round(D.area) + ' vs ' + Math.round(D.rawArea));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

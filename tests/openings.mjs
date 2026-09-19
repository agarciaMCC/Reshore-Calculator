// @rules ARE-02, ARE-09, EDG-06  (see DECISIONS.md)
// AN OPENING HAS ITS OUTLINE DRAWN (Sep 17 2026)
// Adolfo: "there are many instances of misreading crossing lines/dimension
// lines as openings." A diagonal dimension line crossing a grid line makes an
// X just like an opening's does — but nothing is drawn round it. Every X is
// now checked for a drawn outline along the four sides of its hull; a bare
// crossing is not offered, a tagged one is kept and says so.
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

console.log('A. the coverage test itself');
const A = await page.evaluate(() => {
  const sq = [{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
  const seg = (x0,y0,x1,y1) => ({x0,y0,x1,y1,len:Math.hypot(x1-x0,y1-y0)});
  const boxed = [seg(0,0,100,0),seg(100,0,100,100),seg(100,100,0,100),seg(0,100,0,0)];
  const crossOnly = [seg(0,0,100,100),seg(100,0,0,100),seg(-50,50,150,50)];   // an X and a grid line through it
  const threeSides = boxed.slice(0,3);
  return { boxed: isOutlined(outlineCoverage(sq, boxed)), cross: isOutlined(outlineCoverage(sq, crossOnly)),
    three: isOutlined(outlineCoverage(sq, threeSides)), cov3: outlineCoverage(sq, threeSides) };
});
ok(A.boxed && !A.cross, 'a drawn box is outlined; an X with a line through it is not');
ok(!A.three && A.cov3[3] === 0, 'three sides are not enough — a side with nothing drawn fails it: ' + JSON.stringify(A.cov3));

console.log('B. Kinect plan sheets: every tagged opening stays, the bare crossings go');
const B = await page.evaluate(async () => {
  const out = [];
  for (const n of [8, 9, 10, 11, 12]) {
    await ensurePageGeometry(n); for (let i = 0; i < 80 && geomStatus(n) === 'loading'; i++) await new Promise(r => setTimeout(r, 100));
    const r = await detectOpenings(n);
    const items = r.items.filter(i => !i.failed);
    out.push({ n, xMarks: r.xMarks, labels: r.labels, kept: items.length, dropped: r.unoutlined,
      tagged: items.filter(i => i.label).length, flagged: items.filter(i => !i.outlined).map(i => i.label),
      untaggedUnoutlined: items.filter(i => !i.label && !i.outlined).length, tiny: items.filter(i => i.areaPx2 < OPENING_MIN_PX2).length });
  }
  return out;
});
console.log('   ' + B.map(b => `p${b.n}: ${b.xMarks} X → ${b.kept} kept (${b.tagged} tagged, ${b.dropped} bare crossings dropped)`).join('  '));
ok(B.every(b => b.dropped > 0), 'every sheet had bare crossings that are no longer offered: ' + B.map(b => b.dropped).join(','));
ok(B.reduce((s, b) => s + b.dropped, 0) >= 40, 'dozens across the set: ' + B.reduce((s, b) => s + b.dropped, 0));
ok(B.every(b => b.tagged >= Math.min(b.labels, 1)), 'a sheet with OPNG/OPEN tags still offers tagged openings: ' + B.map(b => `${b.tagged}/${b.labels}`).join(','));
ok(B.every(b => b.untaggedUnoutlined === 0), 'nothing untagged is offered without a drawn outline');
ok(B.every(b => b.tiny === 0), 'and nothing smaller than the minimum opening');
const flagged = B.flatMap(b => b.flagged);
ok(flagged.length && flagged.every(l => l), 'a tagged X whose outline is partly missing is kept and flagged to check: ' + JSON.stringify(flagged));

console.log('C. an outline drawn with the rectangle operator counts');
const C = await page.evaluate(async () => { let n = 0; for (const p of [1,2,3,4,5,6,7,8,9,10,11,12]) n += (await pageColourSegs(p)).filter(s => s.rect).length; return n; });
ok(C % 4 === 0, 'every rectangle read comes out as four segments (this set draws ' + C / 4 + ' of them with the rectangle operator)');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

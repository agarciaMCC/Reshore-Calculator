// @rules PRT-01  (see DECISIONS.md)
// THE PRINT SHOWS WHERE (Sep 21 2026). Adolfo: "the PDF should have
// screenshots of the area in question." Every region and beam row carries a
// crop of its sheet with the region glowing; every floor that gets reshoring
// gets its plan shaded by required spacing with the legend. Run on the 1175
// Bothell job over its own set.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setInputFiles('#fileInput', path.resolve(here, 'fixtures', 'test-set.pdf'));
await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 180000 });
await page.waitForTimeout(2500);
const job = JSON.parse(fs.readFileSync(path.resolve(here, '..', '1175_Bothell_Stem_4.reshore.json'), 'utf8'));
await page.evaluate(d => applyOpenedJob(d, 'print'), job);
await page.waitForTimeout(1500);
await page.evaluate(() => setStep('results'));
await page.waitForFunction(() => schedSolve && schedSolve.levels.length && schedSolve.levels[schedPourIdx].solve.spatial, null, { timeout: 120000 });

console.log('A. the printed sheet carries a snippet per region and beam, and a shaded plan per floor');
const A = await page.evaluate(async () => {
  const L = schedSolve.levels[schedPourIdx], s = L.solve;
  // a real detached document stands in for the print window, so the
  // snippets have somewhere to land
  const doc = document.implementation.createHTMLDocument('print');
  let html = '';
  const fake = { document: { write: h => { html += h; doc.open(); doc.write(h); doc.close(); }, close() {}, querySelectorAll: sel => doc.querySelectorAll(sel) }, print() { fake.printed = true; } };
  const real = window.openPrintWindow;
  window.openPrintWindow = () => fake;
  try { printSchedule(); } finally { window.openPrintWindow = real; }
  const written = { regionSlots: (html.match(/data-snip="r:/g) || []).length, beamSlots: (html.match(/data-snip="b:/g) || []).length, floorSlots: (html.match(/data-snip="f:/g) || []).length,
    overviewBeforeAssumptions: html.indexOf('data-snip="f:') > 0 && html.indexOf('data-snip="f:') < html.indexOf('Calculation assumptions'),
    afterInstall: html.indexOf('data-snip="f:') > html.indexOf('What goes in under each floor') };
  // the snippets are drawn after the document is open
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const waiting = doc.querySelectorAll('.snip-wait').length;
    if (!waiting) break;
    await new Promise(r => setTimeout(r, 300));
  }
  const imgs = [...doc.querySelectorAll('.snip img')];
  const regionImgs = [...doc.querySelectorAll('[data-snip^="r:"] img')].length;
  const beamImgs = [...doc.querySelectorAll('[data-snip^="b:"] img')].length;
  const floorImgs = [...doc.querySelectorAll('[data-snip^="f:"] .snip-ov img')].length;
  const legend = [...doc.querySelectorAll('.ov-legend .lg-item')].length;
  window.__snip = { region: doc.querySelector('[data-snip^="r:"] img').src, floor: doc.querySelector('[data-snip^="f:"] .snip-ov img').src };
  const sizes = await Promise.all(imgs.slice(0, 3).map(im => new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = im.src; })));
  const t1 = Date.now(); while (!fake.printed && Date.now() - t1 < 3000) await new Promise(r => setTimeout(r, 100));
  return { regions: s.regions.length, beams: (s.beams || []).length, floors: resultsTabFloors(L).length, written, regionImgs, beamImgs, floorImgs, legend, sizes,
    allData: imgs.every(im => /^data:image\/png/.test(im.src)), waiting: doc.querySelectorAll('.snip-wait').length, printed: !!fake.printed };
});
console.log('   ' + JSON.stringify({ regions: A.regions, beams: A.beams, floors: A.floors, regionImgs: A.regionImgs, beamImgs: A.beamImgs, floorImgs: A.floorImgs, sizes: A.sizes }));
ok(A.written.regionSlots === A.regions && A.written.beamSlots === A.beams, `a slot per region row (${A.written.regionSlots}/${A.regions}) and per beam row (${A.written.beamSlots}/${A.beams})`);
ok(A.written.floorSlots === A.floors && A.floors > 0, `a page per floor that gets reshoring: ${A.written.floorSlots}/${A.floors}`);
ok(A.written.afterInstall && A.written.overviewBeforeAssumptions, 'the floor pages follow the install table, before the assumptions');
ok(A.waiting === 0, 'every slot was filled');
ok(A.regionImgs === A.regions, `every region row got its plan snippet: ${A.regionImgs}`);
ok(A.beamImgs === A.beams, `and every beam row: ${A.beamImgs}`);
ok(A.floorImgs >= A.floors, `every floor page got its shaded plan: ${A.floorImgs}`);
ok(A.legend > 0, 'with a legend of the patterns: ' + A.legend + ' items');
ok(A.allData && A.sizes.every(sz => sz && sz[0] > 200 && sz[1] > 100), 'the snippets are real images of a useful size: ' + JSON.stringify(A.sizes));
ok(A.printed, 'and the sheet prints once they are in');

console.log('B. a snippet is a crop around the region, glowing, on the pour\'s own sheet');
const B = await page.evaluate(async () => {
  const L = schedSolve.levels[schedPourIdx], r = L.solve.regions[0];
  const lv = pourLevelDef(L);
  const pg = regionZonePage(r, L) || lv.pdfPage;
  const img = await pageImageFor(pg);
  let glow = 0, fills = [];
  const oG = glowStroke; glowStroke = function () { glow++; return oG.apply(this, arguments) };
  const oFill = CanvasRenderingContext2D.prototype.fill;
  CanvasRenderingContext2D.prototype.fill = function () { fills.push(String(this.fillStyle)); return oFill.apply(this, arguments) };
  const url = await regionSnippet(r, L, 'R1', false);
  CanvasRenderingContext2D.prototype.fill = oFill; glowStroke = oG;
  const sz = await new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = url; });
  return { pg, sheet: [img.width, img.height], sz, glow, teal: fills.some(c => /14, ?143, ?150/.test(c)) };
});
ok(B.sz && B.sz[0] <= 720 * 1.01 && B.sz[0] < B.sheet[0] && B.sz[1] < B.sheet[1], `a crop, not the whole sheet: ${JSON.stringify(B.sz)} of ${JSON.stringify(B.sheet)}`);
ok(B.glow >= 1 && B.teal, 'the region is drawn with the same teal glow as on screen');

if (process.env.SNIP_OUT) { const d = await page.evaluate(() => window.__snip); for (const k of ['region', 'floor']) fs.writeFileSync(path.join(process.env.SNIP_OUT, 'snip-' + k + '.png'), Buffer.from(d[k].split(',')[1], 'base64')); }
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

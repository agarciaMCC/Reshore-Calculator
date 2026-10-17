// @rules ARE-31, ARE-19, ARE-11  (see DECISIONS.md)
// A SLAB ZONE FROM ITS NOTE (Bothell, Oct 16 2026)
// Sheet 5 shows 7", 8 1/2", 22" and 22 1/2" PT slab zones, but the scan
// offered none: it found thickened slabs only as solid gray fills, and these
// are drawn as outlines, dashed boxes and a pink hatch, named by boxed
// callouts. Now each thickness note other than the floor's typical leads a
// trace; what traces cleanly is a candidate to review, what does not is
// listed to draw by hand.
//
//  A. the note reader: fractions ("8 1/2\" PT SLAB"), and the drawn-shape
//     reader (adSheetReads) takes them too
//  B. Horizon House B1 (typical 12"): the two 10" SLAB zones are traced
//     along their leaders, inside the floor edge, with their thickness
//  C. accepting one writes the note's thickness
//  D. Bothell sheet 5 (where the set is present): the 8 1/2" hatch zone is
//     traced, 22" and 22 1/2" into one bay give one candidate (the thicker),
//     the 7" and 8" dashed boxes are listed to draw by hand; sheet 6's 17"
//     note in an elevation is not offered
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
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
const open = async (pdf, job) => {
  await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
  await page.waitForFunction(() => typeof solveAll === 'function');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.setInputFiles('#fileInput', pdf);
  await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.evaluate(d => applyOpenedJob(d, 'slabnotes'), JSON.parse(fs.readFileSync(job, 'utf8')));
  await page.waitForTimeout(1200);
  await page.evaluate(() => { if (typeof beamScan !== 'undefined' && beamScan) cancelBeamScan(); });
};
const detect = pg => page.evaluate(async pg => {
  await goToPage(pg);
  const lv = state.levels[levelForPage(pg)];
  const T = levelAlignmentFor(lv, pg).transform, f = Math.hypot(T[0], T[2]);
  const edge = edgeOf(lv, pg), band = edgeBandPx(lv, pg, edge);
  const items = await detectSlabNotes(pg, lv);
  return items.map(it => ({ label: it.label, tIn: it.tIn, tosFt: it.tosFt, failed: !!it.failed, why: it.why,
    sf: it.polygon ? Math.round(it.areaPx2 * f * f) : 0,
    inEdge: it.polygon ? it.polygon.filter(q => insideEdgeBand(q, edge, band)).length / it.polygon.length : null }));
}, pg);

const HH = path.resolve(here, '..', 'Project Testing', 'Horizon House');
await open(path.join(HH, 'GARAGE LEVELS-RESHORE TEST.pdf'), path.join(HH, 'Horizon House - grid rebuilt.reshore.json'));

console.log('A. reading the note');
const A = await page.evaluate(() => ({
  a: ['8 1/2" PT SLAB', '22 1/2″ PT SLAB', '7" PT SLAB', '12" THICKENED SLAB', '10" SLAB', '8-1/2" SLAB', '9.5" P.T. SLAB'].map(t => slabNoteInches(t)),
  no: ['1/2" SLAB DEPRESSION', 'T/SLAB: 119\'-11 1/2"', '24X17 BM', '9" PT SLAB EDGE'].map(t => slabNoteInches(t)),
}));
ok(JSON.stringify(A.a) === JSON.stringify([8.5, 22.5, 7, 12, 10, 8.5, 9.5]), 'thicknesses, fractions included: ' + JSON.stringify(A.a));
ok(A.no.every(v => v == null), 'a depression, a T/SLAB, a beam tag and a longer note are not slab notes: ' + JSON.stringify(A.no));

console.log('B. Horizon House B1: two 10" SLAB zones');
const B = await detect(10);
console.log('   ' + JSON.stringify(B.map(b => [b.label, b.failed, b.sf])));
const tens = B.filter(b => !b.failed && b.tIn === 10);
ok(tens.length === 2, 'both 10" zones traced: ' + JSON.stringify(B.map(b => [b.label, b.failed, b.sf])));
ok(tens.every(b => b.sf > 100 && b.sf < 2000 && b.inEdge > 0.9), 'each a zone-sized region inside the floor edge: ' + JSON.stringify(tens.map(b => [b.sf, b.inEdge])));
ok(tens.every(b => /check its outline/.test(b.why)), 'and each says it came from the note, to check');
const B2 = await page.evaluate(async () => {
  const out = [];
  for (const pg of [5, 6, 7, 8, 9]) { const lv = state.levels[levelForPage(pg)]; out.push(...(await detectSlabNotes(pg, lv)).filter(i => !i.failed).map(i => [pg, i.label])); }
  return out;
});
ok(B2.length === 0, 'no traced candidates on the other Horizon floors (their notes are the typical): ' + JSON.stringify(B2));

console.log('C. accepting one writes its thickness');
const C = await page.evaluate(async () => {
  const pg = 10, li = levelForPage(pg), lv = state.levels[li];
  const it = (await detectSlabNotes(pg, lv)).find(i => !i.failed);
  beamScan = { page: pg, levelIdx: li, items: [{ ...it, page: pg, levelIdx: li }], sel: -1, what: 'beams', view: 'queue' };
  const added = scanCommit(beamScan.items, 'test');
  const z = added[0] && added[0].z;
  const res = z ? { kind: z.kind, t: z.thicknessIn, label: z.label, page: z.page } : null;
  if (z) lv.slabZones = lv.slabZones.filter(q => q !== z);
  beamScan = null;
  return res;
});
ok(C && C.kind === 'slab' && C.t === 10 && C.page === 10 && /10" SLAB/.test(C.label), 'the slab area takes 10" from its note: ' + JSON.stringify(C));

const BOT = process.env.BOTHELL_DIR || path.resolve(here, '..', 'Project Testing', 'Bothell');
const bJob = path.join(BOT, 'Bothell_TrustAll_2026.10.16.reshore.json'), bPdf = path.join(BOT, 'Reshore Calculator Test.pdf');
if (!fs.existsSync(bJob) || !fs.existsSync(bPdf)) console.log('D. (Bothell test set not in this checkout, skipped)');
else {
  console.log('D. Bothell sheet 5');
  await open(bPdf, bJob);
  const D = await detect(5);
  console.log('   ' + JSON.stringify(D.map(d => [d.label, d.failed ? 'by hand' : d.sf + ' SF'])));
  const half = D.find(d => d.tIn === 8.5);
  ok(half && !half.failed && half.sf > 550 && half.sf < 800 && half.inEdge > 0.9, 'the 8 1/2" hatched zone is traced (~680 SF): ' + JSON.stringify(half));
  ok(half && Math.abs(half.tosFt - (119 + 11.5 / 12)) < 0.01, 'with its T/SLAB 119\'-11 1/2"');
  const deep = D.filter(d => d.tIn >= 22 && !d.failed);
  ok(deep.length === 1 && deep[0].tIn === 22.5 && /22″? and 22½|both point here/.test(deep[0].why), '22" and 22 1/2" into one bay: one candidate, the thicker, saying so: ' + JSON.stringify(deep));
  const hand = D.filter(d => d.failed);
  ok(hand.length >= 4 && hand.every(d => d.tIn === 7 || d.tIn === 8) && hand.every(d => /draw it by hand/.test(d.why)), 'the 7" and 8" dashed boxes are listed to draw by hand: ' + JSON.stringify(hand.map(d => d.label)));
  ok(!D.some(d => d.tIn === 9), 'no candidate from the typical 9" notes');
  const D6 = await detect(6);
  ok(!D6.some(d => d.tIn === 17), 'sheet 6: the 17" note in the building elevation is not offered: ' + JSON.stringify(D6));
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

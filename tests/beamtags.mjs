// @rules BEM-10, BEM-08  (see DECISIONS.md)
// READING BEAM TAGS (Bothell, Oct 16 2026). The scan left 8 beams blank or
// measured them about 1" too wide: two tags were sideways, four sat a little
// further off the beam than the old 70 px, "24X22 1/2" lost its half, and a
// beam broken by a column had its tag on the other piece.
// A. Every beam the estimator drew on Bothell reads the drawn size from the scan.
// B. Sideways tags read their size; set-back tags are flagged to check.
// C. Fractions in the depth; the middle of sideways text.
// D. A piece that continues a sized beam takes its size; disagreeing
//    neighbours and a piece off the line stay blank.
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
page.on('dialog', d => d.accept());
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');

console.log('C. Fractions and sideways text');
const C = await page.evaluate(() => ({
  frac: parseSizeLabel('24X22 1/2 BM'), plain: parseSizeLabel('22X17 BM'), wfrac: parseSizeLabel('31 3/4 x24 COL'),
  // a tag reading upward from (461,599), 63 px long, 16 px tall: its middle is left of and above the start
  up: textCenter({ x: 461, y: 599, w: 63, h: 16, v: true, dx: 0, dy: -1 }),
  level: textCenter({ x: 100, y: 200, w: 60, h: 16 }),
}));
ok(C.frac && C.frac.wIn === 24 && C.frac.dIn === 22.5 && C.frac.isBeam, '"24X22 1/2 BM" is 24 x 22.5: ' + JSON.stringify(C.frac));
ok(C.plain.wIn === 22 && C.plain.dIn === 17, '"22X17 BM" unchanged');
ok(C.wfrac.wIn === 31.75 && !C.wfrac.isBeam, 'a column size still reads as a column');
ok(C.up[0] === 453 && C.up[1] === 567.5, 'a sideways tag\'s middle sits along its own direction: ' + C.up);
ok(C.level[0] === 130 && C.level[1] === 192, 'level text is placed exactly as before: ' + C.level);

console.log('D. A piece that continues a sized beam');
const D = await page.evaluate(() => {
  const bm = (x0, y0, x1, y1, size) => ({ kind: 'beam', bbox: { minx: x0, miny: y0, maxx: x1, maxy: y1 }, sized: !!size, widthIn: size ? size[0] : null, depthIn: size ? size[1] : null, label: size ? `${size[0]}X${size[1]} BM` : null, why: '' });
  const a = [bm(405, 997, 435, 1215, [24, 17]), bm(405, 864, 435, 970)];
  beamContinuations(a);
  const b = [bm(405, 997, 435, 1215, [24, 17]), bm(405, 600, 435, 840, [22, 17]), bm(405, 864, 435, 970)];
  beamContinuations(b);
  const c = [bm(405, 997, 435, 1215, [24, 17]), bm(470, 864, 500, 970)];          // off the line
  beamContinuations(c);
  const d = [bm(405, 997, 435, 1215, [24, 17]), bm(405, 700, 435, 800)];          // too far apart
  beamContinuations(d);
  return { a: a[1], b: b[2], c: c[1], d: d[1] };
});
ok(D.a.sized && D.a.widthIn === 24 && D.a.depthIn === 17 && D.a.check && /continues/.test(D.a.why), 'the piece across the column takes 24x17, flagged: ' + JSON.stringify(D.a));
ok(!D.b.sized, 'two sized neighbours that disagree leave it blank');
ok(!D.c.sized, 'a piece off the line is not a continuation');
ok(!D.d.sized, 'a piece more than three widths away is not a continuation');

console.log('A/B. Bothell: every drawn beam reads the drawn size');
const job = fs.readFileSync(path.resolve(here, '..', 'Project Testing', 'Bothell', 'Bothell_Test_2026.10.16.reshore.json'), 'utf8');
const pdfPath = path.resolve(here, '..', 'Project Testing', 'Bothell', 'Reshore Calculator Test.pdf');
if (fs.existsSync(pdfPath)) {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.evaluate(async ([j, p]) => {
    applyOpenedJob(JSON.parse(j), 'Bothell_Test_2026.10.16.reshore.json');
    const bin = atob(p); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    await loadFile(new File([u8], 'Reshore Calculator Test.pdf', { type: 'application/pdf' }));
  }, [job, fs.readFileSync(pdfPath).toString('base64')]);
  await new Promise(r => setTimeout(r, 2000));
  const A = await page.evaluate(async () => {
    const bbOf = pts => ({ x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) });
    const res = { drawn: 0, matched: 0, wrong: [], flagged: [], read: [] };
    for (const lv of state.levels) {
      const pg = levelSheets(lv)[0] && levelSheets(lv)[0].page; if (!pg) continue;
      const det = (await detectGreyShapes(pg)).items.filter(i => i.kind === 'beam');
      for (const z of (lv.slabZones || []).filter(z => z.kind === 'beam')) {
        const Z = bbOf(z.polygon); res.drawn++;
        const ov = b => { const B = b.bbox, ix = Math.min(B.maxx, Z.x1) - Math.max(B.minx, Z.x0), iy = Math.min(B.maxy, Z.y1) - Math.max(B.miny, Z.y0); return ix > 0 && iy > 0 ? ix * iy : 0; };
        const b = det.slice().sort((p, q) => ov(q) - ov(p))[0];
        if (!b || !ov(b)) continue;
        if (b.sized && b.widthIn === z.widthIn && b.depthIn === z.depthIn) { res.matched++; res.read.push(b.label); } else res.wrong.push(`${lv.name}: ${z.widthIn}x${z.depthIn} read ${b.sized ? b.widthIn + 'x' + b.depthIn : 'blank'} (${b.why})`);
        if (b.check) res.flagged.push(`${lv.name} ${b.label}`);
      }
    }
    return res;
  });
  console.log(`  ${A.matched} of ${A.drawn} drawn beams read the drawn size; ${A.flagged.length} flagged to check`);
  ok(A.wrong.length === 0, 'no drawn beam reads a different size or blank: ' + A.wrong.join('; '));
  ok(A.matched >= 23, 'at least the 23 beams found on Oct 16 read the drawn size: ' + A.matched);
  ok(A.read.some(l => /18X57/.test(l)) && A.read.some(l => /24X22 1\/2/.test(l)), 'the sideways tags 18X57 and 24X22 1/2 read their sizes: ' + A.read.join(', '));
  ok(A.flagged.some(f => /^Roof 22X17/.test(f)), 'the tag set back 119 px from its beam is used and flagged to check: ' + A.flagged.join(', '));
} else console.log('  (skipped: Bothell test set not present)');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

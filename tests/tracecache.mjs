// @rules LOD-11, LOD-12  (see DECISIONS.md)
// THE TRACE READS THE SET THAT IS OPEN (Sep 22 2026)
// Adolfo, on kinect4: "the load trace doesnt appear to be working correctly."
// Level 4 came back as two areas — a diagonal #F sliver and a 58 SF #J — with
// "grid bubbles not found around the plan". Cause: the per-page vector caches
// (strokes, painted shapes, rasters, traced maps) were never cleared when a
// new set was loaded, so Kinect's tags were traced against the previous set's
// page-5 linework. This replays that: one set, then the Kinect set, then his
// job — page 5 must come back whole. Plus the hole rule: a tag in the hole of
// a ring-shaped area is not inside the ring.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
page.on('dialog', d => d.accept());
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const loadSet = async (file, name) => {
  const b64 = fs.readFileSync(file).toString('base64');
  await page.evaluate(async ([b64, name]) => {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    await loadFile(new File([u8], name, { type: 'application/pdf' }));
  }, [b64, name]);
};

console.log('A. the hole rule on a ring (LOD-12)');
{
  const H = await page.evaluate(() => {
    const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const ring = { polys: [sq(0, 0, 100, 100), sq(30, 30, 70, 70)] };
    return { rim: fillObjectPaints(ring, 10, 50), hole: fillObjectPaints(ring, 50, 50), outside: fillObjectPaints(ring, 150, 50),
             plain: fillObjectPaints({ polys: [sq(0, 0, 100, 100)] }, 50, 50), noRings: fillObjectPaints({ polys: [] }, 50, 50) };
  });
  ok(H.rim && !H.hole && !H.outside, 'rim paints, hole and outside do not: ' + JSON.stringify(H));
  ok(H.plain && H.noRings, 'a plain shape paints its inside; a shape with no rings is trusted');
}

console.log('B. another set first, touching its page-5 caches');
await loadSet(path.resolve(here, 'fixtures', 'test-set.pdf'), 'test-set.pdf');
await page.waitForFunction(() => state.levels.length > 0 && sheetRead && sheetRead.size > 0, null, { timeout: 180000 });
await page.waitForTimeout(500);
const before = await page.evaluate(async () => {
  await pageStrokes(5); await fillRegionObjects(5); await heavyRaster(5, false);
  const T = await tracedLoadMaps();
  return { W: strokeCache[5].W, objs: fillObjCache[5].length, raster: !!rasterCache['5h'], traced: traceCache.size, plans: T.plans.length };
});
ok(before.W > 0 && before.objs > 0 && before.raster && before.traced > 0, 'page-5 caches are warm from the first set: ' + JSON.stringify(before));

console.log('C. the Kinect set replaces it: every page-keyed cache is gone (LOD-11)');
await loadSet(path.resolve(here, '..', 'Kinect', '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'), 'kinect.pdf');
await page.waitForFunction(() => state.pdf.pages === 12 && sheetRead && sheetRead.size >= 12, null, { timeout: 180000 });
const cleared = await page.evaluate(() => ({
  strokes: Object.keys(strokeCache).length, fills: Object.keys(fillObjCache).length, rasters: Object.keys(rasterCache).length,
  edge: Object.keys(edgeRasterCache).length, xmarks: Object.keys(xMarkCache).length, ready: traceReady,
}));
// the new set's own arrival reads may have warmed some pages again, so the
// check is that nothing from the OLD set survived: page 5 was 5184 px wide
// there and is 6048 px wide here
const p5 = await page.evaluate(async () => { const s = await pageStrokes(5); const o = await fillRegionObjects(5); return { W: s.W, objs: o.length }; });
ok(p5.W === 6048 && p5.objs !== before.objs, 'page 5 strokes and shapes are the Kinect set\'s: ' + JSON.stringify(p5) + ' (was ' + JSON.stringify(before) + ')');
ok(cleared.ready === null || (cleared.ready && cleared.ready.key !== undefined), 'the ready flag did not carry over untouched');

console.log('D. his job on top, then the trace: Level 4 comes back whole');
const job = fs.readFileSync(path.resolve(here, '..', 'Kinect', 'kinect4.json'), 'utf8');
ok(await page.evaluate(t => applyOpenedJob(JSON.parse(t), 'kinect4.json'), job), 'kinect4.json opens');
const T = await page.evaluate(async () => {
  const T = await tracedLoadMaps();
  const p5 = T.plans.filter(p => p.page === 5);
  return { nTags: T.nTags, plans: p5.map(p => ({ title: p.title, ok: p.match.ok, reason: p.match.reason, manual: !!p.match.manual, fpi: p.match.fit && p.match.fit.ftPerInch,
           codes: p.fills.map(f => f.code), modes: [...new Set(p.fills.map(f => f.mode))], sf: p.fills.map(f => Math.round(f.areaSF || 0)) })),
           failed5: T.failed.filter(f => f.page === 5).length };
});
ok(T.nTags >= 60, 'the tags across the five titled load maps (5+10+10+22+17): ' + T.nTags);
ok(T.plans.length === 1 && T.plans[0].title === 'LEVEL 4 LOADING PLAN', 'one plan on sheet 5: ' + JSON.stringify(T.plans.map(p => p.title)));
const P = T.plans[0] || {};
ok(P.ok && !P.manual && P.fpi && Math.abs(P.fpi - 20) < 0.1, 'matched from its own bubbles at 1" = 20\': ' + JSON.stringify({ ok: P.ok, reason: P.reason, fpi: P.fpi }));
ok(P.codes && P.codes.length === 17, 'all 17 tags placed, none lost to a background or a hole: ' + (P.codes || []).join(' '));
ok(P.modes && P.modes.length === 1 && P.modes[0] === 'fill', 'every area is a painted shape, no flood-fill fallback: ' + JSON.stringify(P.modes));
ok(!(P.codes || []).includes('?'), 'nothing left untagged');
const count = c => (P.codes || []).filter(x => x === c).length;
ok(count('#J') === 3 && count('#Q') === 4 && count('#F') === 4 && count('#B') === 3 && count('#C') === 2 && count('#G') === 1, 'the tag mix reads as drawn (3 J, 4 Q, 4 F, 3 B, 2 C, 1 G): ' + JSON.stringify(P.codes));
ok(T.failed5 === 0, 'nothing failed on sheet 5');
// the ring: the corridor is Q and keeps its own code — the J tags in its hole
// belong to the J shapes drawn there
const big = (P.sf || []).filter(a => a > 20000).length;
ok(big >= 3, 'the residential areas and the corridor ring read at their real size (three areas over 20k SF): ' + JSON.stringify(P.sf));
ok(!(P.sf || []).some(a => a > 60000), 'and the plan\'s background rectangle is not among them');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

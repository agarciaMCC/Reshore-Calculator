// @rules ARE-30, ARE-12, MDL-20, MDL-14  (see DECISIONS.md)
// THE LOAD MAP IS PART OF THE AREAS REVIEW (Bothell, Oct 16 2026)
// A run that trusted every suggestion never opened a floor's Loading tab, so
// the load-map areas were never offered: Areas read Done and Results ran on
// the typical alone — floor 3's 125 PSF mechanical area under its 138 PSF
// typical was missed, and an area below the typical always counts (MDL-20).
//
//  A. the read runs on arriving at Areas, Slab tab included
//  B. an area below the typical holds the step, named; at or above: optional
//  C. reviewing the floor (Add … & back, even with all skipped) clears it;
//     a floor with load-map areas drawn, the top floor and on-grade are left out
//  D. Bothell's own load map (where the set is present): L3's 125 PSF is named
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
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const KIN = path.resolve(here, '..', 'Kinect');
const pdf = fs.readFileSync(path.join(KIN, '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));
const job = JSON.parse(fs.readFileSync(path.join(KIN, 'kinect4.json'), 'utf8'));
await page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); if (typeof resetPageTextCache === 'function') resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
}, [pdf.toString('base64'), job]);

console.log('A. the read starts on the Slab tab too');
const A = await page.evaluate(async () => {
  let called = 0; const f0 = window.autoTraceBackground;
  window.autoTraceBackground = () => { called++; };
  setStep('areas'); state.layer = 'slab'; renderSidebar();
  window.autoTraceBackground = f0;
  if (typeof beamScan !== 'undefined' && beamScan) cancelBeamScan();
  return called;
});
ok(A > 0, 'arriving on Areas › Slab starts the background load-map read: ' + A);

console.log('B. what the step says');
const B = await page.evaluate(() => {
  // a read result, as the background read leaves it, for the floors under the top
  const mid = state.levels.map((l, i) => i).filter(i => state.levels[i].id !== topLevelId() && !levelOnGrade(state.levels[i]));
  const li = mid[0], lv = state.levels[li];
  lv.zones = (lv.zones || []).filter(z => !z.fromLoadMap); delete lv.loadMapReviewed;
  const typ = levelDefaultCapacity(lv) || 100;
  if (!(levelDefaultCapacity(lv) > 0)) lv.defaultCapacity = typ;
  const top = state.levels.findIndex(l => l.id === topLevelId());
  const set = caps => { traceReady = { key: traceCacheKey(), byLevel: { [li]: caps.length, [top]: 1 }, caps: { [li]: caps, [top]: [1] }, plans: 1 }; };
  set([typ, typ - 13, typ + 75]);
  const low = stepStatus('areas');
  const lm = loadMapUnreviewed().map(x => [x.lv.name, x.low]);
  set([typ, typ + 75]);
  const high = stepStatus('areas');
  return { name: levelTagName(lv.name), typ, low, high, lm, topName: state.levels[top].name, li };
});
ok(!B.low.done && new RegExp(B.name + "'s load map has 1 loading area below its typical").test(B.low.text) && B.low.text.includes(`${Math.round(B.typ - 13)} < ${Math.round(B.typ)} PSF`), 'an area below the typical holds the step, by floor and PSF: ' + B.low.text);
ok(B.lm.every(x => x[0] !== B.topName), 'the top floor’s load map is not asked for (MDL-14)');
ok(B.high.done && /load-map areas? on .* not reviewed \(at or above the typical: optional\)/.test(B.high.text), 'at or above the typical only: Done, and named as optional: ' + B.high.text);

console.log('C. reviewing clears it');
const C = await page.evaluate(async li => {
  const lv = state.levels[li]; const typ = levelDefaultCapacity(lv);
  traceReady.caps[li] = [typ - 13]; traceReady.byLevel[li] = 1;
  const held = !stepStatus('areas').done;
  // a floor review where every area was skipped still counts as looked at
  autoTrace = { page: 1, pages: [1], plans: [{ title: 'LOAD MAP', page: 1, levelIdx: li, zone: '', match: { ok: true }, fills: [{ accepted: false, polygon: [], capacity: typ - 13 }] }], failed: [], nTags: 1, empty: [] };
  await acceptAutoTrace();
  const after = stepStatus('areas'), reviewed = !!lv.loadMapReviewed;
  const saved = JSON.parse(JSON.stringify(serializeDoc())).levels[li].loadMapReviewed === true;
  delete lv.loadMapReviewed;
  zonesOf(lv, 'loading').push({ id: 'lm-x', polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], capacityPSF: typ - 13, fromLoadMap: true });
  const drawn = loadMapUnreviewed().some(x => x.li === li);
  lv.zones = lv.zones.filter(z => z.id !== 'lm-x');
  return { held, after: after.text, reviewed, saved, drawn };
}, B.li);
ok(C.held, 'held before the review');
ok(C.reviewed && C.saved && !/below its typical/.test(C.after), 'reviewing the floor, all skipped, clears it and is saved: ' + C.after);
ok(!C.drawn, 'a floor with load-map areas already drawn is not asked again');

// ── D. Bothell's own load map ──
const BOT = process.env.BOTHELL_DIR || path.resolve(here, '..', 'Project Testing', 'Bothell');
const bJob = path.join(BOT, 'Bothell_Test_2026.10.16.reshore.json'), bPdf = path.join(BOT, 'Reshore Calculator Test.pdf');
if (!fs.existsSync(bJob) || !fs.existsSync(bPdf)) console.log('D. (Bothell test set not in this checkout, skipped)');
else {
  console.log('D. Bothell: no loading areas drawn');
  await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
  await page.waitForFunction(() => typeof solveAll === 'function');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.setInputFiles('#fileInput', bPdf);
  await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 180000 });
  await page.waitForTimeout(2000);
  await page.evaluate(d => applyOpenedJob(d, 'lm'), JSON.parse(fs.readFileSync(bJob, 'utf8')));
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => stepStatus('areas'));
  await page.evaluate(() => { setStep('areas'); state.layer = 'slab'; renderSidebar(); });
  await page.waitForFunction(() => traceReady && traceReady.key === traceCacheKey(), null, { timeout: 240000 });
  const after = await page.evaluate(() => stepStatus('areas'));
  console.log('   before: ' + before.text + ' · after: ' + after.text);
  ok(!after.done && /L3's load map has 1 loading area below its typical capacity \(125 < 138 PSF\)/.test(after.text), 'L3’s 125 PSF mechanical area holds Areas: ' + after.text);
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

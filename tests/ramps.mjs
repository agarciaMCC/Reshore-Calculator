// @rules MDL-17, RVT-13  (see DECISIONS.md)
// RAMPS (Adolfo, Sep 21 2026): "ramps need to have elevations at each break
// to establish high and low points for shore height."
//
// A ramp arrives from Revit as ONE floor element with a falling top, so
// zmax - zmin was the slope RISE plus the slab and the Kalae L3 ramp
// exported 103" thick with a single T.O.S. taken off its high corner.
//
//   RVT-13  the extractor keeps the top face and groups it by the PLANE its
//           triangles lie in, so each run and each landing comes out as its
//           own piece with its own high and low top, and the thickness has
//           the rise taken back out of it.
//   MDL-17  in the calculator the shore height under a sloped area is a
//           RANGE. The tallest governs the pick — this floor at its high
//           point standing on the floor below at its low one — and the low
//           end is checked against the chosen shore's closed length, since
//           a shore cannot close shorter than its own minimum height.
//
//   node tests/ramps.mjs [reshore-calc.html] [kalae-revit-job.json]
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import fs from 'node:fs';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const root = path.resolve(here, '..');
const app = process.argv[2] || path.join(root, 'reshore-calc.html');
const kalae = process.argv[3] || path.join(root, 'Revit export', '1268_KALAE-revit.reshore.json');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

console.log('A. RVT-13: the Kalae export — the ramps come out as slabs, not as 103" of concrete');
if (!fs.existsSync(kalae)) { console.log('  (no Kalae export at ' + kalae + ' — skipped)'); }
else {
  const job = JSON.parse(fs.readFileSync(kalae, 'utf8'));
  const zones = l => (l.modelZones || []);
  const sloped = job.levels.flatMap(l => zones(l).filter(z => z.sloped).map(z => ({ lv: l.name, ...z })));
  ok(sloped.length >= 8, `the model's sloped pieces come across (${sloped.length})`);
  ok(sloped.every(z => z.offsetLowIn != null && z.offsetLowIn < z.offsetIn),
     'every one carries a low T.O.S. below its high one');
  ok(job.levels.every(l => zones(l).every(z => z.sloped || z.offsetLowIn == null)),
     'and a flat area carries none');
  // the two big podium ramps: 9" MS SLAB, about 94" of fall
  const big = sloped.filter(z => z.offsetIn - z.offsetLowIn > 80);
  ok(big.length === 2 && big.every(z => z.lv === '3' || z.lv === '4'),
     `the L3 and L4 ramps are the long ones (${big.map(z => z.lv).join(', ')})`);
  ok(big.every(z => Math.abs(z.thicknessIn - 9) < 0.5),
     `each 9" thick, not the 103" its bounding box measures (${big.map(z => z.thicknessIn).join(', ')})`);
  ok(big.every(z => z.offsetIn - z.offsetLowIn > 93 && z.offsetIn - z.offsetLowIn < 95),
     `falling about 94" (${big.map(z => +(z.offsetIn - z.offsetLowIn).toFixed(1)).join(', ')})`);
  // on grade is not a shore-height question whatever it does
  ok(job.levels.every(l => zones(l).every(z => !(z.sloped && z.kind === 'grade'))),
     'an on-grade ramp is not flagged: it bears on the ground');
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(app));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const KIN = path.resolve(root, 'Kinect');
const pdf = fs.readFileSync(path.join(KIN, '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));
const jobFile = fs.existsSync(path.join(KIN, 'kinect4-new.json')) ? 'kinect4-new.json' : 'kinect4.json';
const kjob = JSON.parse(fs.readFileSync(path.join(KIN, jobFile), 'utf8'));
await page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); if (typeof resetPageTextCache === 'function') resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
  await warmSheetSizes(state.levels.flatMap(l => levelSheets(l).map(s => s.page)));
  setStep('results');
}, [pdf.toString('base64'), kjob]);
await page.waitForFunction(() => schedSolve && schedSolve.levels.length && schedSolve.levels.every(L => L.solve), null, { timeout: 120000 });

console.log('B. MDL-17: a flat job says nothing about slopes');
{
  const r = await page.evaluate(() => {
    let steps = 0, sloped = 0;
    for (const L of schedSolve.levels) for (const rg of (L.solve.regions || [])) for (const st of rg.steps) {
      steps++; if (st.sloped || st.shoreHeightMinFt != null) sloped++;
    }
    return { steps, sloped };
  });
  ok(r.steps > 0 && r.sloped === 0, `not one of the ${r.steps} rows on the Kinect job claims a range`);
}

console.log('C. MDL-17: make one area a ramp and the shore height becomes a range');
const C = await page.evaluate(() => {
  // the floor the L4 pour reshores onto, and a slab area on it
  const pourIdx = schedSolve.levels.findIndex(L => L.pour.name === '4');
  const L = schedSolve.levels[pourIdx];
  const st0 = (L.solve.regions || []).flatMap(r => r.steps).find(s => !s.open && !s.grade && s.resultant > 0 && s.shoreHeightFt != null);
  if (!st0) return { none: true };
  const target = st0.level.name;
  const lv = state.levels.find(l => l.name === target);
  const before = st0.shoreHeightFt;
  // a ramp over the whole floor: copy its own edge outline into a slab area
  // that falls 24", so every sample on it reads the slope
  const edge = zonesOf(lv, 'slab').filter(z => slabKind(z) === 'edge')
    .sort((a, b) => Math.abs(polyAreaFt(b.polygon)) - Math.abs(polyAreaFt(a.polygon)))[0];
  if (!edge) return { none: true, target };
  const z = { id: sid(), polygon: edge.polygon.map(p => ({ x: p.x, y: p.y })), kind: 'slab',
              thicknessIn: lv.slabThickness, offsetIn: 0, label: 'test ramp' };
  if (edge.page != null) z.page = edge.page;
  zonesOf(lv, 'slab').push(z);
  // FLAT first, at the ramp's high point: that is the height the pick must
  // keep once the area starts falling
  state.results = null; runSchedule();
  const flatBy = {};
  for (const s of (schedSolve.levels[pourIdx].solve.regions || []).flatMap(r => r.steps))
    if (s.level.name === target && s.shoreHeightFt != null) flatBy[s.choiceKey] = s.shoreHeightFt;
  z.offsetLowIn = -24; z.sloped = true;
  state.results = null; runSchedule();
  const L2 = schedSolve.levels[pourIdx];
  const hits = (L2.solve.regions || []).flatMap((r, ri) => r.steps.map(s => ({ r, ri, s })))
    .filter(x => x.s.sloped && x.s.level.name === target);
  const x = hits[0];
  return { target, before: x ? flatBy[x.s.choiceKey] : null, n: hits.length,
    hi: x && x.s.shoreHeightFt, lo: x && x.s.shoreHeightMinFt,
    text: x && shoreHeightText(x.s), ri: x && x.ri, ck: x && x.s.choiceKey,
    card: x && cardKey(L2, x.r) };
});
ok(!C.none, 'a slab area on the floor below the pour is made a ramp: ' + C.target);
ok(C.n > 0, `the rows under ${C.target} come back sloped (${C.n})`);
ok(C.hi != null && C.lo != null && C.hi > C.lo, `with a range: ${C.lo} … ${C.hi}`);
ok(Math.abs((C.hi - C.lo) - 2) < 0.05, `the 24" fall is the whole range (${((C.hi - C.lo) * 12).toFixed(1)}")`);
ok(Math.abs(C.hi - C.before) < 1e-6, `and the TALLEST is what the same area flat at its high point gives — the pick does not change (${C.hi} vs ${C.before})`);
ok(/–/.test(C.text || ''), 'it reads as a range: ' + C.text);

console.log('D. MDL-17: the row says so on Results');
const D = await page.evaluate(ck => {
  openCards.add(ck); renderSchedule();
  const card = document.querySelector(`#schedBody .sched-region[data-card="${ck}"]`);
  const row = card && [...card.querySelectorAll('.ra-row')].find(el => el.querySelector('.rs-ramp'));
  return { found: !!row, text: row && row.querySelector('.rs-dim').textContent.trim(),
           title: row && row.querySelector('.rs-dim').getAttribute('title') };
}, C.card);
ok(D.found, 'the region row carries a ramp mark');
ok(/–/.test(D.text || ''), 'showing both ends: ' + D.text);
ok(/the tallest governs/.test(D.title || ''), 'and says which one governs: ' + (D.title || '').slice(-60));

console.log('E. MDL-17: a shore that cannot close at the low end is flagged');
const E = await page.evaluate(ck => {
  const L = schedSolve.levels[schedPourIdx];
  const hit = (L.solve.regions || []).flatMap(r => r.steps.map(s => ({ r, s }))).find(x => x.s.sloped);
  if (!hit) return { none: true };
  const st = hit.s;
  const opts = st.options || [];
  const out = {};
  // a shore whose closed length is longer than the ramp's short end
  const tooLong = opts.find(o => o.shore.minH > st.shoreHeightMinFt);
  const fits = opts.find(o => o.shore.minH <= st.shoreHeightMinFt);
  for (const [name, o] of [['tooLong', tooLong], ['fits', fits]]) {
    if (!o) { out[name] = null; continue; }
    shoreChoices()[st.choiceKey] = o.shoreId;
    state.results = null; runSchedule();
    const L2 = schedSolve.levels[schedPourIdx];
    const h2 = (L2.solve.regions || []).flatMap(r => r.steps).find(s => s.sloped && s.choiceKey === st.choiceKey);
    openCards.add(ck); renderSchedule();
    const card = document.querySelector(`#schedBody .sched-region[data-card="${ck}"]`);
    const row = card && [...card.querySelectorAll('.ra-row')].find(el => el.querySelector('.rs-ramp'));
    out[name] = { shore: o.shore.name, minH: o.shore.minH, fail: !!slopeShortEndFail(h2),
                  warn: row ? (row.querySelector('.ra-thru') || {}).textContent || '' : '' };
  }
  out.lowEnd = st.shoreHeightMinFt;
  return out;
}, C.card);
if (E.none || (!E.tooLong && !E.fits)) { console.log('   (no shore options on this row — skipped)'); }
else {
  if (E.tooLong) {
    ok(E.tooLong.fail, `${E.tooLong.shore} closes to ${E.tooLong.minH}' and the ramp runs to ${E.lowEnd.toFixed(2)}' — flagged`);
    ok(/will not close at the low end/.test(E.tooLong.warn), 'and the row says so: ' + E.tooLong.warn.slice(0, 90));
  } else console.log('   (no shore in the catalog is too long for this row)');
  if (E.fits) {
    ok(!E.fits.fail, `${E.fits.shore} closes to ${E.fits.minH}' and is not flagged`);
    ok(!/will not close/.test(E.fits.warn || ''), 'no warning on a shore that fits');
  } else console.log('   (no shore in the catalog fits the low end)');
}

await browser.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

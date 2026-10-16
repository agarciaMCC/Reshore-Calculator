// @rules UI-12, ARE-13, ARE-25, MDL-04  (see DECISIONS.md)
// "OK — THAT'S SLAB ON GRADE" DRAWS IT (Bothell, Oct 16 2026)
// A run that trusted every suggestion pressed Match floors' OK for the 154 ft
// of floor 1 past floor 0 — and the OK only silenced the row. The solver never
// heard of the soil: ~12,000 SF of floor 1 was a suspended slab over nothing,
// a false "no floor below" on every placement. The estimator drew it as a
// 12,348 SF on-grade area. Now the OK draws it.
//
//  A. Kinect L3 South past L2: the OK draws an on-grade area inside the floor
//     edge and outside what L2 describes; the row reads on grade, no warning
//  B. the area is marked to check on the Slab tab's checks until its OK
//  C. an older job with the OK saved but no area: the note offers to draw it
//  D. Bothell's trusted job on its drawing set (where the set is present):
//     ~12,348 SF drawn on floor 1, and the placements above stop reporting
//     load with no floor below
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
  setStep('match');
  await warmSheetSizes(state.levels.flatMap(l => levelSheets(l).map(s => s.page)));
  if (typeof beamScan !== 'undefined' && beamScan) cancelBeamScan();
}, [pdf.toString('base64'), job]);

console.log('A. the OK draws the on-grade area');
const A = await page.evaluate(async () => {
  const lv = state.levels.find(l => l.name === '3');
  // the job's own on-grade areas go: the ground past L2 is undrawn again
  lv.slabZones = lv.slabZones.filter(z => !isGradeZone(z));
  const row = () => sheetStackRows().find(r => r.level === '3' && r.zone === 'South');
  const r1 = row();
  state.ui.stackOpen = true; renderSheetStack();
  const host = document.getElementById('sheetStack');
  const btn = host.querySelector('button[data-ssok]');
  let toastText = ''; const t0 = window.toast; window.toast = (t, ms) => { toastText = t; return t0 ? t0(t, ms) : undefined; };
  if (btn) btn.click();
  window.toast = t0;
  await new Promise(r => setTimeout(r, 50));
  const r2 = row();
  const drawn = zonesOf(lv, 'slab').filter(z => z.fromStack);
  const T = levelAlignmentFor(lv, 11).transform;
  const edge = transformPolyToBuilding(edgeOf(lv, 11).polygon, T);
  const u = r1.belowBox;
  // every drawn corner sits on or inside the floor edge, none inside L2's ground
  const inEdge = p => pointInPoly(p, edge) || edge.some((q, i) => { const s = edge[(i + 1) % edge.length]; const L = Math.hypot(s.x - q.x, s.y - q.y) || 1; return Math.abs((s.x - q.x) * (p.y - q.y) - (s.y - q.y) * (p.x - q.x)) / L < 0.6; });
  const bps = drawn.map(z => transformPolyToBuilding(z.polygon, T));
  const cen = bps.map(b => polyCentroid(b));
  return {
    over: r1.over, warned: r1.issues.length > 0, hadBtn: !!btn,
    n: drawn.length, page: drawn.map(z => z.page), flags: drawn.every(z => z.kind === 'grade' && z.stackReview && z.label === 'Slab on grade'),
    sf: bps.map(b => Math.round(Math.abs(polyAreaFt(b)))),
    inside: bps.every(b => b.every(inEdge)),
    outside: cen.every(c => !(c.x > u.minX && c.x < u.maxX && c.y > u.minY && c.y < u.maxY)),
    onGrade: r2.overOnGrade, issues: r2.issues, notes: r2.notes, saved: !!lv.stackOk, toastText,
  };
});
ok(A.warned && A.hadBtn, 'with no on-grade area the row warns and offers the OK: ' + JSON.stringify(A.over));
ok(A.n >= 1 && A.page.every(p => p === 11) && A.flags, 'the OK draws an on-grade area on the row’s own sheet, marked to check: ' + JSON.stringify({ n: A.n, page: A.page }));
ok(A.sf.every(s => s >= 100), 'of real size: ' + JSON.stringify(A.sf));
ok(A.inside, 'inside the floor edge');
ok(A.outside, 'and outside the ground the floor below describes');
ok(A.onGrade && !A.issues.length && A.notes.some(t => /on grade there/.test(t)), 'the row now reads on grade, no warning: ' + JSON.stringify(A.notes));
ok(A.saved, 'the OK is still remembered on the job');
ok(/drawn as slab on grade/.test(A.toastText) && /Check its outline/.test(A.toastText), 'the toast says what was drawn and to check it: ' + A.toastText);

console.log('B. the drawn area is a check on the Slab tab until its OK');
const Bc = await page.evaluate(async () => {
  const li = state.levels.findIndex(l => l.name === '3'); const lv = state.levels[li];
  state.activeLevelIdx = li; setStep('areas'); state.layer = 'slab';
  if (typeof beamScan !== 'undefined' && beamScan) cancelBeamScan();
  await goToPage(11); renderSidebar();
  const c1 = adChecks(lv).filter(c => c.stack);
  const btn = document.querySelector('[data-adokstack]');
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 50));
  const c2 = adChecks(lv).filter(c => c.stack);
  return { n1: c1.length, text: c1.map(c => c.text), hadBtn: !!btn, n2: c2.length, left: zonesOf(lv, 'slab').filter(z => z.stackReview).length };
});
ok(Bc.n1 >= 1 && Bc.text.every(t => /drawn from Match floors/.test(t)), 'the Slab checks list it: ' + JSON.stringify(Bc.text));
ok(Bc.hadBtn && Bc.n2 === Bc.n1 - 1, 'its OK takes it off the list: ' + JSON.stringify(Bc));

console.log('C. an older job: the OK saved, no area drawn');
const C = await page.evaluate(async () => {
  const lv = state.levels.find(l => l.name === '3');
  lv.slabZones = lv.slabZones.filter(z => !z.fromStack);
  setStep('match');
  const row = () => sheetStackRows().find(r => r.level === '3' && r.zone === 'South');
  const r1 = row();
  state.ui.stackOpen = true; renderSheetStack();
  const host = document.getElementById('sheetStack');
  const btn = host.querySelector('button[data-ssdraw]');
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 50));
  const r2 = row();
  return { accepted: r1.overAccepted, onGrade1: r1.overOnGrade, hadBtn: !!btn && /Draw it as slab on grade/.test(btn.textContent), onGrade2: r2.overOnGrade, n: zonesOf(lv, 'slab').filter(z => z.fromStack).length };
});
ok(C.accepted && !C.onGrade1 && C.hadBtn, 'the accepted row offers "Draw it as slab on grade": ' + JSON.stringify(C));
ok(C.onGrade2 && C.n >= 1, 'which draws it');

// ── D. Bothell, where the test set is in this checkout ──
const BOT = process.env.BOTHELL_DIR || path.resolve(here, '..', 'Project Testing', 'Bothell');
const bJob = path.join(BOT, 'Bothell_TrustAll_2026.10.16.reshore.json'), bPdf = path.join(BOT, 'Reshore Calculator Test.pdf');
if (!fs.existsSync(bJob) || !fs.existsSync(bPdf)) console.log('D. (Bothell test set not in this checkout, skipped)');
else {
  console.log('D. Bothell: floor 1 past floor 0');
  await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
  await page.waitForFunction(() => typeof solveAll === 'function');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.setInputFiles('#fileInput', bPdf);
  await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 180000 });
  await page.waitForTimeout(2000);
  await page.evaluate(d => applyOpenedJob(d, 'gradepast'), JSON.parse(fs.readFileSync(bJob, 'utf8')));
  await page.waitForTimeout(1500);
  const unres = async () => {
    await page.evaluate(() => { state.results = null; setStep('results'); runSchedule(); });
    await page.waitForFunction(() => schedSolve && schedSolve.levels.length, null, { timeout: 180000 });
    return page.evaluate(() => Object.fromEntries(schedSolve.levels.map(L => [state.levels[L.pourIdx].name,
      Math.round((L.solve.regions || []).filter(r => r.unresolved && r.steps.some(st => st.level.name === '1' || st.level.name === '0')).reduce((t, r) => t + r.areaSF, 0))])));
  };
  const before = await unres();
  const sf = await page.evaluate(() => { const r = sheetStackRows().find(x => x.level === '1' && x.over); return r ? Math.round(drawGradePastBelow(r)) : 0; });
  const after = await unres();
  console.log('   unresolved SF reaching floors 1/0 by pour, before ' + JSON.stringify(before) + ' after ' + JSON.stringify(after) + ' · drawn ' + sf + ' SF');
  ok(Math.abs(sf - 12348) / 12348 < 0.02, 'floor 1 gets ~12,348 SF on grade, as the estimator drew it: ' + sf);
  ok(before['1'] > 10000 && before['2'] > 10000, 'before: pours 1 and 2 had load with nothing under floor 1');
  ok(after['1'] === 0 && after['2'] === 0 && after['Roof'] === 0, 'after: none: ' + JSON.stringify(after));
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

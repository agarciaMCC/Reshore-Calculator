// @rules RVT-09, RVT-10, RVT-11, BLD-12, BLD-13  (see DECISIONS.md)
// THE MODEL ON McCLONE'S OWN PRINTED SET (Sep 21 2026). Adolfo: "are you able
// to use the IFC in tandem with the typical printed PDF set that McClone
// provides to the field? ... the PDF set is going to be easier to review for
// our engineering manager than the one you produced."
//
// So the job brings no sheets of its own (RVT-09). Its geometry travels in
// FEET, in the frame the project grid is written in. Fitting one of his sheets
// to that grid from the sheet's own bubbles IS the registration, and the same
// transform places the model's polygons on it (RVT-10). A polygon is placed on
// the sheet it lands on and cut at the page edge, so a floor split North /
// South gets each half on its own sheet (RVT-11). His set draws the podium
// twice over and then ONE typical tower plan, so a sheet serves many floors
// (BLD-12). And the fit is seeded rather than taken over every crossing,
// because the key plan in his title block carries bubbles of its own (BLD-13).
//
//   node tests/field-set.mjs [reshore-calc.html] [set.pdf] [job.reshore.json]
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import fs from 'node:fs';
import path from 'node:path';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const root = path.resolve(here, '..');
const html = process.argv[2] || path.join(root, 'reshore-calc.html');
const pdfPath = process.argv[3] || path.join(root, 'Kalae PDF Set.pdf');
const jobPath = process.argv[4] || path.join(root, 'Revit export', '1268_KALAE-revit.reshore.json');
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('file://' + path.resolve(html));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

console.log('A. his set, then the model job');
await page.setInputFiles('#fileInput', path.resolve(pdfPath));
await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 180000 });
ok(await page.evaluate(() => state.pdf.pages) === 12, 'the McClone set loads: 12 pages');
await page.waitForTimeout(9000);
ok(await page.evaluate(d => applyOpenedJob(d, 'revit field export'), job), 'the field job is accepted');
await page.waitForTimeout(2500);
const shape = await page.evaluate(() => ({
  levels: state.levels.length,
  withModel: state.levels.filter(l => (l.modelZones || []).length).length,
  anySheet: state.levels.filter(l => levelSheets(l).length).length,
  gx: (state.project.grid.x || []).length, gy: (state.project.grid.y || []).length,
}));
ok(shape.withModel === 42, `RVT-09: all 42 floors carry model geometry (${shape.withModel})`);
ok(shape.anySheet === 0, 'RVT-09: the job brings no sheets of its own');
ok(shape.gx >= 6 && shape.gy >= 6, `the model's project grid came across (${shape.gx}x${shape.gy})`);

console.log('B. his sheets: the podium twice over, then one typical tower plan');
const assign = await page.evaluate(() => {
  const li = n => state.levels.findIndex(l => l.name === n);
  for (const [pg, name] of [[1,'1'],[2,'1'],[3,'2'],[4,'2'],[5,'3'],[6,'3'],[7,'4'],[8,'4'],[9,'4.5'],[10,'4.5']]) {
    const i = li(name); if (i < 0) continue;
    if (!levelHasPage(state.levels[i], pg)) addLevelSheet(state.levels[i], pg);
    setSheetZone(state.levels[i], pg, addProjectZone(pg % 2 ? 'North' : 'South'));
  }
  const tower = state.levels.filter(l => (l.modelZones || []).length && !['1','2','3','4','4.5'].includes(l.name));
  for (const l of tower) if (!levelHasPage(l, 12)) addLevelSheet(l, 12);
  return { tower: tower.length, holders: levelsForPage(12).length, active: (state.activeLevelIdx != null && levelHasPage(state.levels[state.activeLevelIdx], 12)) ? state.levels[state.activeLevelIdx].name : null };
});
ok(assign.holders === assign.tower && assign.tower > 30, `BLD-12: one typical plan serves ${assign.holders} floors`);
ok(await page.evaluate(() => { const i = state.levels.findIndex(l => l.name === '20'); state.activeLevelIdx = i; return levelForPage(12) === i; }),
   'BLD-12: on a shared sheet the floor being worked on is the one meant');

console.log('C. registration: his bubbles against the model grid');
const match = await page.evaluate(async () => {
  const p = await proposeMatchAll();
  const row = r => ({ name: r.name, page: r.page, v: r.verdict, rms: r.fit ? +(r.fit.rmsFt * 12).toFixed(2) : null, ft: r.fit ? +r.fit.ftPerInch.toFixed(2) : null });
  return { rows: p.rows.map(row), written: (p.rows.forEach(r => { if (r.fit && r.verdict !== 'poor') r.pick = true; }), applyMatchAll()) };
});
const podium = match.rows.filter(r => r.page <= 10), tower = match.rows.filter(r => r.page === 12);
const good = podium.filter(r => r.v === 'good');
console.log('  podium:', JSON.stringify(podium.map(r => `${r.name}/p${r.page} ${r.v} ${r.rms ?? '-'}"`)));
ok(tower.length > 30 && tower.every(r => r.v === 'good' && r.rms < 1), `RVT-10: the tower plan fits at ±${tower[0] && tower[0].rms}" across ${tower.length} floors`);
ok(good.length >= 6, `BLD-13: ${good.length} of ${podium.length} podium sheets fit from their own bubbles`);
ok(good.every(r => Math.abs(r.ft - 10.67) < 0.1), `BLD-13: every good podium fit is at the sheet's own 3/32" = 1'-0" (not the key plan's): ${JSON.stringify(good.map(r => r.ft))}`);
ok(good.every(r => r.rms < 3), `BLD-13: and within 3" RMS: ${JSON.stringify(good.map(r => r.rms))}`);
await page.waitForTimeout(1200);

console.log('D. the model placed on his drawings');
const placed = await page.evaluate(async () => {
  const p = await proposeModelPlacement();
  const written = applyModelPlacement();
  const sf = (lv, pg, kind) => {
    const T = levelAlignmentFor(lv, pg); if (!T || !T.transform) return null;
    const z = lv.slabZones.find(x => x.kind === kind && zonePage(lv, x) === pg);
    return z ? Math.round(Math.abs(polyAreaFt(transformPolyToBuilding(z.polygon, T.transform)))) : null;
  };
  const L7 = state.levels.find(l => l.name === '7'), L2 = state.levels.find(l => l.name === '2');
  return { written, ready: p.rows.filter(r => r.placed && r.placed.length).length,
    l7: { edge: sf(L7, 12, 'edge'), areas: L7.slabZones.length, beams: L7.slabZones.filter(z => z.kind === 'beam').length },
    l2: levelSheets(L2).map(sh => ({ page: sh.page, matched: !!(sh.alignment && sh.alignment.transform), edge: sf(L2, sh.page, 'edge') })),
    l2Model: Math.round(Math.abs(polyAreaFt(L2.modelZones.find(z => z.kind === 'edge').polygonFt.map(q => ({ x: q[0], y: q[1] }))))) };
});
console.log('  placed:', JSON.stringify(placed));
ok(placed.written > 500, `RVT-10: model geometry written onto his sheets (${placed.written} areas)`);
ok(placed.l7.edge === 14690, `RVT-10: L7's floor edge lands on his tower plan at 14,690 SF (got ${placed.l7.edge})`);
ok(placed.l7.beams > 0, `RVT-10: and its beams came with it (${placed.l7.beams})`);
// L2 is drawn over two sheets, so whichever of them matched carries a PART of
// the floor, cut at the page edge — never the whole 60,654 SF.
const whole = placed.l2Model, half = placed.l2.filter(h => h.matched && h.edge != null);
ok(half.length >= 1, 'RVT-11: at least one of L2\'s two sheets matched');
ok(half.every(h => h.edge > whole * 0.15 && h.edge < whole * 0.98),
   `RVT-11: each matched sheet carries a cut part of the floor, not the whole ${whole} SF: ` + JSON.stringify(placed.l2));
// A sheet the fit could not settle is NOT written: it is left for a hand match.
const poor = match.rows.filter(r => r.v === 'poor' || r.v === 'none');
ok(poor.length > 0 && placed.l2.filter(h => h.matched).length < placed.l2.length,
   `BLD-13: ${poor.length} sheet(s) the bubbles could not settle are left unmatched for a hand fit, not written wrong`);

ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

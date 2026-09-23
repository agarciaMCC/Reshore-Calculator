// @rules BLD-18, BLD-19, BLD-20, BLD-21, LOD-11, LOD-12, LOD-13  (see DECISIONS.md)
// Horizon House garage levels (Sep 23, 2026) — Adolfo's report:
//   "the loading diagrams and load charts could not be read. The calculator
//    mistook the loading diagram pages for floor plans. The match floor through
//    grid alignment was off and I couldnt get all of the floors to match. The
//    scale was being read incorrectly on a few floor when matching and later
//    prompted to scale 2x."
//   "Would it make sense for the user to verify scale of the plan view and then
//    the calculator uses that as its 'gospel' for the gridline matching?"
//
//  A. load-map sheets are not floor plans (BLD-18)
//  B. the split LL / SDL charts read as drawn (LOD-12)
//  C. every map on a load-map sheet is filed under its floor (LOD-11)
//  D. his saved job: the grid held two frames 41.9 ft apart; one rebuild at
//     the locked scale matches every floor to the drawn gridlines (BLD-19..21)
//  E. the load maps trace and land on the rebuilt grid (LOD-13)
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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'horizon', 'horizon-garage.pdf'));
const job = fs.readFileSync(path.resolve(here, 'fixtures', 'horizon', 'horizon-job.reshore.json'), 'utf8');
const loadPdf = () => page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.pageImages = {};
  document.getElementById('upload-prompt').style.display = 'none';
}, pdf.toString('base64'));
await loadPdf();

console.log('A. a fresh read of the set: three load-map sheets, seven plans');
const A = await page.evaluate(async () => {
  await autoReadBuilding();
  return state.levels.map(l => ({ name: l.name, pages: levelSheets(l).map(s => s.page) }));
});
ok(A.length === 7, 'seven levels, B1 to B7: ' + A.map(l => l.name).join(','));
ok(!A.some(l => /22-28|33|ROOF/i.test(l.name)), 'no level from a load-map title (22-28, 33, Roof)');
ok(A.every(l => l.pages.every(p => p >= 4)), 'no level bound to a load-map sheet (1-3): ' + JSON.stringify(A));
ok(A.find(l => l.name === 'B7').pages.join() === '4', 'B7 stands on its foundation plan alone');

console.log('B. the LL and SDL designations, as drawn');
const B = await page.evaluate(async () => {
  const sc = await scanLoadMap();
  return { shape: sc.shape, ll: sc.ll.map(r => [r.mark, r.desc, r.load, !!r.reducibleFromDrawing, r.comments || '']), sdl: sc.sdl.map(r => [r.mark, r.desc, r.load]) };
});
ok(B.shape === 'split', 'read as split schedules');
ok(B.ll.map(r => r[0]).join('') === 'ABCDEFGH', 'eight live-load marks A-H: ' + B.ll.map(r => r[0]).join(''));
ok(JSON.stringify(B.ll.map(r => r[2])) === JSON.stringify([40, 40, 125, 100, 20, 50, 100, 60]), 'live loads 40 40 125 100 20 50 100 60: ' + B.ll.map(r => r[2]));
ok(B.ll.filter(r => r[3]).map(r => r[0]).join('') === 'ABFH', '(R) reducible on A, B, F, H');
ok(/PARTITION/i.test(B.ll[5][4]), 'F keeps its "+ 15 PARTITION" as a comment: ' + B.ll[5][4]);
ok(B.ll[2][1] === 'MECH/ELEC/STORAGE', 'a centred description is not taken as the mark: ' + B.ll[2][1]);
ok(B.sdl.length === 12 && B.sdl.map(r => r[0]).join(',') === '1,2,3,4,5,6,7,8,9,10,11,12', 'twelve SDL marks: ' + B.sdl.map(r => r[0]));
ok(JSON.stringify(B.sdl.map(r => r[2])) === JSON.stringify([25, 10, 5, 10, 20, 35, 20, 80, 120, 115, 240, 10]), 'the TOTAL SDL column, not a component: ' + B.sdl.map(r => r[2]));
ok(B.sdl[4][1] === 'ROOF', 'the TYPE column is the description, not "SPECIAL LOAD DESCRIPTION": ' + B.sdl[4][1]);

console.log('C. the maps on each load-map sheet, filed by floor');
const C = await page.evaluate(async () => {
  const t = [];
  for (const p of [1, 2, 3]) t.push(loadMapTitles(await pageTextCached(p)).map(x => x.token));
  return { t, b1: state.levels[guessLevelIdx('B1')] && state.levels[guessLevelIdx('B1')].name, one: guessLevelIdx('1'), b7: state.levels[guessLevelIdx('B7')].name };
});
ok(C.t[0].join() === 'B7,B6,B5,B4,B3,B2', 'S-1.01: six maps B7 to B2 — ' + C.t[0]);
ok(C.t[1].includes('3-21') && C.t[1].includes('B1') && C.t[1].includes('1'), 'S-1.02 carries B1, 1 and the ranges: ' + C.t[1]);
ok(C.t[2].includes('ROOF') && C.t[2].includes('33'), 'S-1.03: 33 and ROOF: ' + C.t[2]);
ok(C.b1 === 'B1' && C.one === -1 && C.b7 === 'B7', 'token B1 is level B1; token 1 is not B1 when there is no level 1');

console.log('D. his saved job: the grid does not hold together; rebuild at the locked scale');
const D = await page.evaluate(async (j) => {
  deserializeDoc(JSON.parse(j)); sortLevelsByElevation();
  setStep('match'); renderMatchPanel();
  const before = { scale: JSON.parse(JSON.stringify(state.project.planScale || null)), need: !!gridNeedsRebuild(), status: stepStatus('match').text, btn: !!document.getElementById('btnRebuildGrid') };
  // a hand match on B6 takes the job scale, not the 1/4" detail note under the click
  const b6 = state.levels.findIndex(l => l.name === 'B6');
  startAlignment(b6, 5);
  for (let i = 0; i < 100 && !state.align.locked; i++) await new Promise(r => setTimeout(r, 100));
  const hand = state.align.sheetScale;
  cancelAlignment();
  const P = await rebuildGridAndRematch();
  const rows = P.rows.map(r => ({ name: r.name, v: r.verdict, ft: r.fit && r.fit.ftPerInch, rms: r.fit && r.fit.rmsFt * 12, off: (r.off || []).map(o => o.label), from: r.scaleFrom || null }));
  P.rows.forEach(r => { r.pick = !!r.fit }); applyMatchAll();
  await new Promise(r => setTimeout(r, 5000));
  // every line on every sheet, read again through its fit, against the grid
  const lines = [];
  for (const lv of state.levels) {
    const a = lv.alignment, pg = lv.pdfPage;
    const prop = await autoMatchPointsMain(await pageTextCached(pg), pg);
    let worst = 0, kinked = 0;
    for (const v of prop.xs) { if (v.kinked) kinked++; const g = gridPos('x', v.label); if (g == null) continue; const d = Math.abs(pixelToBuilding(v.pos, 500, a.transform).bx - g) * 12; if (d < 60) worst = Math.max(worst, d); }
    for (const v of prop.ys) { if (v.kinked) kinked++; const g = gridPos('y', v.label); if (g == null) continue; const d = Math.abs(pixelToBuilding(500, v.pos, a.transform).by - g) * 12; if (d < 60) worst = Math.max(worst, d); }
    lines.push({ name: lv.name, worst, kinked });
  }
  return { before, hand, rows, lines, g26: gridPos('x', '2.6'), g27: gridPos('x', '2.7'), g11: gridPos('x', '1.1'), after: !!gridNeedsRebuild(), status: stepStatus('match').text };
}, job);
ok(D.before.scale && D.before.scale.ftPerInch === 8 && D.before.scale.confirmed, 'the job scale comes from his confirmed matches: 1/8" = 1\'-0"');
ok(D.before.need && /rebuild/.test(D.before.status) && D.before.btn, 'the Match step says the grid does not hold together and offers Rebuild: ' + D.before.status);
ok(D.hand === 8, 'a hand match on B6 is held at the job scale, not the detail note beside the click: ' + D.hand);
ok(D.rows.length === 7 && D.rows.every(r => r.ft && Math.abs(r.ft - 8) < 0.04), 'every floor fits at 1" = 8\': ' + D.rows.map(r => r.ft && r.ft.toFixed(3)));
ok(D.rows.every(r => r.v === 'good'), 'and every fit is good: ' + JSON.stringify(D.rows.map(r => [r.name, r.v])));
ok(D.rows.every(r => r.rms < 0.25), 'to under a quarter inch RMS: ' + D.rows.map(r => r.rms.toFixed(2)));
ok(D.rows.find(r => r.name === 'B6').off.includes('11'), 'B6\'s key-plan bubble 11 is named as off the grid, not fitted');
ok(/job scale/.test(D.rows[0].from || ''), 'the grid-defining row says its scale is the job\'s: ' + D.rows[0].from);
ok(D.lines.every(l => l.worst <= 0.25), 'every gridline on every sheet lands within 1/4" of the grid: ' + JSON.stringify(D.lines.map(l => [l.name, +l.worst.toFixed(2)])));
ok(D.lines.every(l => l.kinked >= 1), 'the elbowed bubbles (2.7, H.1) are followed to their lines on every sheet: ' + D.lines.map(l => l.kinked));
ok(Math.abs(D.g27 - D.g26 - 2.25) < 0.05, `2.7 sits 2'-3" off 2.6 as dimensioned: ${(D.g27 - D.g26).toFixed(3)} ft`);
ok(D.g11 == null, 'no "1.1" line from a key plan');
ok(!D.after, 'and the grid holds together afterwards: ' + D.status);

console.log('E. the load maps trace and land on the rebuilt grid');
const E = await page.evaluate(async () => {
  const r = await autoTracePage(1);
  return r.plans.map(p => ({ title: p.title, lv: p.levelIdx >= 0 ? state.levels[p.levelIdx].name : null, ok: !!(p.match && p.match.ok), n: p.fills.length,
    big: (p.fills.slice().sort((a, b) => b.areaPx2 - a.areaPx2)[0] || {}), sf: Math.round(p.fills.reduce((a, f) => Math.max(a, f.areaSF || 0), 0)) }))
    .map(p => ({ ...p, big: { code: p.big.code, pick: p.big.pick, note: p.big.note || '' } }));
});
ok(E.length === 6 && E.map(p => p.lv).join() === 'B7,B6,B5,B4,B3,B2', 'six maps, each on its floor: ' + E.map(p => p.lv));
ok(E.every(p => p.ok), 'each map fitted to the project grid from its own bubbles');
ok(E.every(p => p.n >= 4), 'each with its load areas traced: ' + E.map(p => p.n));
ok(E.every(p => p.sf > 5000 && p.sf < 40000), 'the main area of each floor is floor-sized in feet, not the sheet: ' + E.map(p => p.sf));
ok(E.find(p => p.lv === 'B6').big.pick === 'B3' && /tags inside/.test(E.find(p => p.lv === 'B6').big.note), 'where room tags leaked into the parking area, it is offered as B3 with the tags named: ' + JSON.stringify(E.find(p => p.lv === 'B6').big));

console.log('F. the scale card');
const F = await page.evaluate(async () => {
  state.project.planScale.confirmed = false; renderMatchPanel();
  const card = document.querySelector('.ps-card'), btn = document.getElementById('btnScaleConfirm');
  const st1 = stepStatus('match').text;
  confirmAllMatches();
  const c1 = state.project.planScale.confirmed;
  setJobPlanScale(4, true);
  const need = !!gridNeedsRebuild();
  history.undo();
  return { card: card && card.textContent, btn: !!btn, st1, c1, need, back: state.project.planScale.ftPerInch };
});
ok(F.card && /1\/8" = 1'-0"/.test(F.card) && F.btn, 'the card names the scale and offers Confirm');
ok(F.c1, 'confirming the matches made at that scale confirms it too');
ok(F.need, 'changing the scale under confirmed matches asks for a rebuild');
ok(F.back === 8, 'Ctrl+Z puts the scale back');

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

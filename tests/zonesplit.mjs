// @rules ARE-10, ARE-03, UI-11  (see DECISIONS.md)
// ONE LOADING AREA, TWO ZONE SHEETS + THAT GROUND IS ON GRADE (Sep 17 2026)
// Adolfo: "if a loading area is split by a floor edge and appears in multiple
// zones as a result, draw the loading area in both zones. right now it only
// appears in one." Chose: cut it along each sheet's floor edge, one piece per
// sheet with the same mark, for areas added from the load-map trace.
// And: "in this case, the area outside of the L2 zone is slab on grade, which
// is ok. allow the user to confirm ok to get rid of warning." Chose: no
// warning where an on-grade area covers the overshoot, an OK button where
// it does not, remembered on the job until the overshoot grows.
//
//  A. the clipper: rectangle ∩ L, ∩ nothing, cut in two by a U
//  B. an outline straddling Level 2 North/South splits into a piece per sheet
//  C. Add from the trace: a straddling fill lands on both sheets, a fill on
//     one sheet lands whole as before, a zone-named plan is never split
//  D. the pieces are listed on their own sheets and say where they continue
//  E. Level 3 South past Level 2 is on grade → a note, not a warning
//  F. an overshoot with no on-grade drawn: OK accepts it, it persists,
//     a bigger overshoot brings it back, recheck takes it back
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
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// ── A. the clipper ─────────────────────────────────────────────────────
console.log('A. clipPolyFt');
const A = await page.evaluate(() => {
  const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const area = p => Math.abs(polyAreaFt(p));
  // an L: 100x100 with the top-right 50x50 missing
  const L = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const r = rect(25, 25, 125, 75);                 // 100x50 = 5000, of which the L holds 25x25 + 75x25 = 2500
  const a = clipPolyFt(r, L);
  // a U: 100 wide, arms 30 wide, 100 tall, base 20 tall
  const U = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 80 }, { x: 70, y: 80 }, { x: 70, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const b = clipPolyFt(rect(-10, 20, 110, 40), U);  // a bar across the arms: two 30x20 pieces
  const c = clipPolyFt(rect(200, 200, 300, 300), L);
  const d = clipPolyFt(rect(10, 10, 40, 40), L);     // wholly inside: comes back as itself
  return { a: a.map(p => [p.length, Math.round(area(p))]), b: b.map(p => [p.length, Math.round(area(p))]), c: c.length,
           d: d.map(p => [p.length, Math.round(area(p))]), dCorners: d.length === 1 && d[0].every(q => [10, 40].includes(Math.round(q.x)) && [10, 40].includes(Math.round(q.y))) };
});
ok(A.a.length === 1 && Math.abs(A.a[0][1] - 2500) < 60, 'rectangle ∩ L is the 2,500 SF that overlaps: ' + JSON.stringify(A.a));
ok(A.a.length === 1 && A.a[0][0] <= 8, 'and comes back as a clean outline, not a staircase: ' + JSON.stringify(A.a));
ok(A.b.length === 2 && A.b.every(p => Math.abs(p[1] - 600) < 30), 'a bar across a U is cut into two 600 SF pieces: ' + JSON.stringify(A.b));
ok(A.c === 0, 'nothing overlapping gives nothing: ' + A.c);
ok(A.d.length === 1 && Math.abs(A.d[0][1] - 900) < 20 && A.dCorners, 'an outline wholly inside comes back on its own corners: ' + JSON.stringify(A.d));

// ── the Kinect job: Level 2 is North (sheet 8) / South (sheet 9) ───────
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
  setStep('areas');
  await warmSheetSizes(state.levels.flatMap(l => levelSheets(l).map(s => s.page)));
}, [pdf.toString('base64'), job]);

console.log('B. an outline across Level 2 North/South splits by sheet');
const B = await page.evaluate(() => {
  const lv = state.levels.find(l => l.name === '2');
  const gN = polyBBoxFt(sheetGroundFt(lv, 8)[0]), gS = polyBBoxFt(sheetGroundFt(lv, 9)[0]);
  // 20 ft wide, from well inside North to well inside South
  const x0 = (gN.minX + gN.maxX) / 2 - 10, x1 = x0 + 20;
  const y0 = gN.maxY - 30, y1 = gS.minY + 30;           // North's edge stops at gN.maxY; South's starts at gS.minY
  const poly = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const pieces = splitBuildingPolyBySheets(lv, poly);
  const whole = splitBuildingPolyBySheets(lv, [{ x: x0, y: gN.minY + 5 }, { x: x1, y: gN.minY + 5 }, { x: x1, y: gN.minY + 25 }, { x: x0, y: gN.minY + 25 }]);
  return { gN: [Math.round(gN.minY), Math.round(gN.maxY)], gS: [Math.round(gS.minY), Math.round(gS.maxY)], poly, total: Math.abs(polyAreaFt(poly)),
    pieces: pieces && pieces.map(p => ({ page: p.page, sf: Math.round(p.areaSF), bb: polyBBoxFt(p.bPoly) })), whole };
});
console.log('   North y ' + B.gN + ' · South y ' + B.gS + ' · pieces ' + JSON.stringify(B.pieces && B.pieces.map(p => [p.page, p.sf])));
ok(B.pieces && B.pieces.length === 2 && B.pieces.some(p => p.page === 8) && B.pieces.some(p => p.page === 9), 'one piece on each sheet');
ok(B.pieces && B.pieces.every(p => (p.page === 8 ? p.bb.maxY <= B.gN[1] + 0.6 : p.bb.minY >= B.gS[0] - 0.6)), 'each piece stops at its own sheet’s floor edge: ' + JSON.stringify(B.pieces && B.pieces.map(p => [p.page, Math.round(p.bb.minY), Math.round(p.bb.maxY)])));
ok(B.whole === null, 'an outline on one sheet only is not split (placed whole, as before)');

console.log('C. Add from the load-map trace');
const C = await page.evaluate(async () => {
  const li = state.levels.findIndex(l => l.name === '2');
  const lv = state.levels[li];
  const arr = zonesOf(lv, 'loading');
  const n0 = arr.length;
  const gN = polyBBoxFt(sheetGroundFt(lv, 8)[0]), gS = polyBBoxFt(sheetGroundFt(lv, 9)[0]);
  const xm = (gN.minX + gN.maxX) / 2;
  const straddle = [{ x: xm - 10, y: gN.maxY - 30 }, { x: xm + 10, y: gN.maxY - 30 }, { x: xm + 10, y: gS.minY + 30 }, { x: xm - 10, y: gS.minY + 30 }];
  const northOnly = [{ x: xm - 10, y: gN.minY + 5 }, { x: xm + 10, y: gN.minY + 5 }, { x: xm + 10, y: gN.minY + 25 }, { x: xm - 10, y: gN.minY + 25 }];
  const fill = (bPoly, code) => ({ accepted: true, bPoly, polygon: bPoly.map(p => ({ x: p.x, y: p.y })), capacity: 125, mark: code, code, areaSF: Math.abs(polyAreaFt(bPoly)) });
  autoTrace = { page: 1, pages: [1], plans: [
    { title: 'LEVEL 2 KEY PLAN', page: 1, levelIdx: li, zone: '', match: { ok: true }, fills: [fill(straddle, 'X'), fill(northOnly, 'Y')] },
    // a plan whose title names the zone: everything on it belongs to that zone, whole
    { title: 'LEVEL 2 LOADING PLAN - SOUTH', page: 1, levelIdx: li, zone: 'South', match: { ok: true }, fills: [fill(straddle, 'Z')] },
  ], failed: [], nTags: 3, empty: [] };
  let toastText = ''; const t0 = window.toast; window.toast = (t, ms) => { toastText = t; return t0 ? t0(t, ms) : undefined; };
  await acceptAutoTrace();
  window.toast = t0;
  const added = arr.slice(n0).map(z => ({ page: z.page, mark: z.mark, group: z.splitGroup || null, corners: z.polygon.length, sf: Math.round(Math.abs(polyAreaFt(transformPolyToBuilding(z.polygon, zoneAlignment(lv, z).transform)))) }));
  return { added, toastText, n0, n1: arr.length };
});
console.log('   ' + JSON.stringify(C.added) + '\n   toast: ' + C.toastText);
const X = C.added.filter(a => a.mark === 'X'), Y = C.added.filter(a => a.mark === 'Y'), Z = C.added.filter(a => a.mark === 'Z');
ok(X.length === 2 && X.some(a => a.page === 8) && X.some(a => a.page === 9), 'the straddling area is drawn on North AND South: ' + JSON.stringify(X));
ok(X.length === 2 && X[0].group && X[0].group === X[1].group, 'as two pieces of one group');
ok(X.every(a => a.corners >= 3 && a.sf > 100), 'each piece is materialized in its sheet’s pixels with real area');
ok(Y.length === 1 && Y[0].page === 8 && !Y[0].group, 'an area on North alone lands there whole, as before: ' + JSON.stringify(Y));
ok(Z.length === 1 && Z[0].page === 9 && !Z[0].group, 'a plan titled for the South zone puts its area on South, uncut: ' + JSON.stringify(Z));
ok(/crosses between zone sheets/.test(C.toastText), 'the toast says one crossed: ' + C.toastText);

console.log('D. the Areas list on each sheet');
const D = await page.evaluate(async () => {
  // the arrival scan (UI-17 / ARE-11) may still be showing its first candidate; this section is about the list, so close it
  if (typeof beamScan !== 'undefined' && beamScan) cancelBeamScan();
  const li = state.levels.findIndex(l => l.name === '2');
  state.activeLevelIdx = li; state.layer = 'loading'; state.activeZoneIdx = null;
  await goToPage(8); renderSidebar();
  const rowsN = [...document.querySelectorAll('#zoneList .sb-item')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
  await goToPage(9); renderSidebar();
  const rowsS = [...document.querySelectorAll('#zoneList .sb-item')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
  return { rowsN, rowsS };
});
ok(D.rowsN.some(t => /X/.test(t) && /continues on South/.test(t)), 'on North the piece says it continues on South: ' + JSON.stringify(D.rowsN.filter(t => /X/.test(t))));
ok(D.rowsS.some(t => /X/.test(t) && /continues on North/.test(t)), 'on South it says North: ' + JSON.stringify(D.rowsS.filter(t => /X/.test(t))));
ok(!D.rowsN.some(t => /Z/.test(t)) && D.rowsS.some(t => /Z/.test(t) && !/continues/.test(t)), 'the uncut South area is listed on South only, with no "continues"');

console.log('E. Level 3 South stands past Level 2 — on grade there');
const E = await page.evaluate(() => sheetStackRows().filter(r => r.level === '3' && r.zone === 'South').map(r => ({ issues: r.issues, notes: r.notes, over: r.over, onGrade: r.overOnGrade }))[0]);
ok(E && E.over && E.over.south > 20, 'the overshoot is still measured: ' + JSON.stringify(E.over));
ok(E && E.onGrade && !E.issues.length, 'but it is not a warning — the on-grade area covers it: ' + JSON.stringify(E.issues));
ok(E && E.notes.some(t => /on grade there/.test(t)), 'the row says so: ' + JSON.stringify(E.notes));
const E2 = await page.evaluate(() => {
  state.ui.stackOpen = true; renderSheetStack();
  const host = document.getElementById('sheetStack');
  return { bad: host.querySelectorAll('.ss-row.bad').length, notes: [...host.querySelectorAll('.ss-note')].map(e => e.textContent), warnHead: !!host.querySelector('.ss-head.warn'), okBtns: host.querySelectorAll('button[data-ssok]').length };
});
ok(E2.bad === 0 && !E2.warnHead, 'nothing to look at on this job: ' + JSON.stringify(E2));
ok(E2.notes.some(t => /on grade there/.test(t)) && E2.okBtns === 0, 'the note is shown muted, with no OK to press');

console.log('F. an overshoot with no on-grade drawn: OK, persist, grow, recheck');
const F = await page.evaluate(async () => {
  const lv = state.levels.find(l => l.name === '3');
  const grade = zonesOf(lv, 'slab').filter(isGradeZone);
  const keep = grade.map(z => z.kind);
  grade.forEach(z => { z.kind = 'slab'; });        // the same ground, no longer on grade
  const row = () => sheetStackRows().find(r => r.level === '3' && r.zone === 'South');
  const r1 = row();
  const warned = r1.issues.some(t => /south of anything 2 describes/.test(t)) && !r1.overOnGrade && !r1.overAccepted;
  state.ui.stackOpen = true; renderSheetStack();
  const host = document.getElementById('sheetStack');
  const btn = host.querySelector('button[data-ssok]');
  const hadBtn = !!btn && /slab on grade/i.test(btn.textContent);
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 50));
  const r2 = row();
  const accepted = r2.overAccepted && !r2.issues.length && r2.notes.some(t => /confirmed OK/.test(t));
  const shown = host.querySelectorAll('.ss-row.bad').length === 0 && !!host.querySelector('button[data-ssundo]');
  const saved = JSON.parse(JSON.stringify(serializeDoc())).levels.find(l => l.name === '3').stackOk;
  // the overshoot grows by 10 ft: the edge is moved south in building feet
  const edge = zonesOf(lv, 'slab').find(z => isEdgeZone(z) && zonePage(lv, z) === 11);
  const T = levelAlignmentFor(lv, 11).transform;
  const keepPoly = edge.polygon.map(p => ({ x: p.x, y: p.y }));
  const bp = transformPolyToBuilding(edge.polygon, T);
  const maxY = Math.max(...bp.map(p => p.y));
  edge.polygon = bp.map(p => { const q = buildingToPixel(p.x, p.y + (p.y > maxY - 1 ? 10 : 0), T); return { x: q.px, y: q.py }; });
  const r3 = row();
  const back = !r3.overAccepted && r3.issues.some(t => /south of anything 2 describes/.test(t));
  edge.polygon = keepPoly;
  const r4 = row();
  const again = r4.overAccepted && !r4.issues.length;
  renderSheetStack();
  const undo = host.querySelector('button[data-ssundo]'); if (undo) undo.click();
  await new Promise(r => setTimeout(r, 50));
  const r5 = row();
  const undone = !r5.overAccepted && r5.issues.some(t => /south of anything 2 describes/.test(t)) && !lv.stackOk;
  grade.forEach((z, i) => { z.kind = keep[i]; });
  return { warned, hadBtn, accepted, shown, saved, back, again, undone, over: r1.over };
});
ok(F.warned, 'with the on-grade areas turned into plain slab the warning is back: ' + JSON.stringify(F.over));
ok(F.hadBtn, 'and the row offers "OK — that’s slab on grade"');
ok(F.accepted && F.shown, 'pressing it accepts the overshoot: no warning, a muted note, a recheck link');
ok(F.saved && F.saved['11'] && F.saved['11'].south === F.over.south, 'the acceptance is saved with the job: ' + JSON.stringify(F.saved));
ok(F.back, 'when the overshoot grows by 10 ft the warning returns');
ok(F.again, 'and stands again once the edge is put back');
ok(F.undone, 'recheck takes the acceptance back');

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

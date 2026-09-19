// @rules UI-11, UI-12  (see DECISIONS.md)
// DO THE FLOORS LINE UP? (Kinect, Sep 17 2026)
// Adolfo: "The calculator is not recognizing a floor below when it does in
// fact exist... we need to be able to line up the floors and loading areas.
// Right now its really confusing for the user."
//
//  A. the check reads the real job and names, in feet, what each sheet of
//     each floor says — and what the floor below does NOT say
//  B. the ghost draws the floor below on the sheet you are on
//  C. a load-map area over ground no sheet of that floor shows is left out
//     rather than piled onto the first sheet
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
  // This section is about the CHECK, and the job has since had the faults it
  // describes put right (1B is drawn North/South now, and Level 2 South has an
  // edge). Rebuild them here so the check has something to catch: 1B back to
  // its north sheet only, and Level 2 South's floor edge taken off.
  const l1b = state.levels.find(l => l.name === '1B');
  if (l1b && (l1b.sheets || []).length) l1b.sheets = [];
  const l2 = state.levels.find(l => l.name === '2');
  const south = levelSheets(l2).map(s => s.page).sort((a, b) => a - b)[1];
  l2.slabZones = l2.slabZones.filter(z => !(z.kind === 'edge' && zonePage(l2, z) === south));
  window.__southPage = south;
  await warmSheetSizes(state.levels.flatMap(l => levelSheets(l).map(s => s.page)));
}, [pdf.toString('base64'), job]);

// ── A. the check ───────────────────────────────────────────────────────
console.log('A. a row per floor per sheet, in building feet');
const R = await page.evaluate(() => sheetStackRows().map(r => ({
  level: r.level, page: r.page, zone: r.zone, matched: r.matched, edges: r.nEdges,
  bb: r.bb && [Math.round(r.bb.minX), Math.round(r.bb.maxX), Math.round(r.bb.minY), Math.round(r.bb.maxY)],
  issues: r.issues })));
console.log('   ' + JSON.stringify(R.map(r => [r.level, r.zone || r.page, r.edges, r.bb])));
ok(R.length === 6, 'six floor-sheets on this job: ' + R.length);
ok(R.every(r => r.matched), 'all matched');
const s2n = R.find(r => r.level === '2' && r.zone === 'North');
const s2s = R.find(r => r.level === '2' && r.zone === 'South');
const s3s = R.find(r => r.level === '3' && r.zone === 'South');
const s1b = R.find(r => r.level === '1B');
ok(s2n && s2s && s3s && s1b, 'the split floors are listed by their zone names');
ok(s2s.edges === 0 && s2s.issues.some(t => /no floor edge/.test(t)),
  'Level 2 South is called out for having no floor edge: ' + JSON.stringify(s2s.issues));
ok(s2n.edges === 1 && !s2n.issues.length, 'Level 2 North is clean: ' + JSON.stringify(s2n.issues));
// UI-12 (Sep 17 2026): the overshoot warning auto-clears where the ground
// outside the lower floor is slab on grade. This job's bottom is on grade, so
// standing past what the floor below describes is fine here — and must be
// raised again the moment that is not true.
ok(!s3s.issues.some(t => /south of anything/.test(t)) && !s2s.issues.some(t => /south of anything/.test(t)),
  'standing past the floor below is not flagged while the ground there is on grade: ' + JSON.stringify([s3s.issues, s2s.issues]));
const noGrade = await page.evaluate(() => {
  // the auto-clear reads the on-grade AREAS drawn there, not just the flag
  const marks = state.levels.map(l => ({ og: l.onGrade, ok: l.stackOk, kinds: (l.slabZones || []).map(z => z.kind) }));
  state.levels.forEach(l => { l.onGrade = false; delete l.stackOk;
    (l.slabZones || []).forEach(z => { if (z.kind === 'grade') z.kind = 'slab'; }); });
  const out = sheetStackRows().map(r => ({ level: r.level, zone: r.zone, issues: r.issues }));
  state.levels.forEach((l, i) => { l.onGrade = marks[i].og; if (marks[i].ok) l.stackOk = marks[i].ok;
    (l.slabZones || []).forEach((z, j) => { z.kind = marks[i].kinds[j]; }); });
  return out;
});
const n3s = noGrade.find(r => r.level === '3' && r.zone === 'South') || { issues: [] };
const n2s = noGrade.find(r => r.level === '2' && r.zone === 'South') || { issues: [] };
ok(n3s.issues.some(t => /south of anything 2 describes/.test(t)),
  'with nothing on grade below, Level 3 South is told it stands past what Level 2 describes: ' + JSON.stringify(n3s.issues));
ok(n2s.issues.some(t => /south of anything 1B describes/.test(t)),
  'and Level 2 South past what 1B describes — 1B has only its north sheet: ' + JSON.stringify(n2s.issues));
ok(!s1b.issues.length, 'the bottom floor answers to nothing below it');
// the numbers are the ground, not the page
ok(s2n.bb[3] - s2n.bb[2] > 150 && s3s.bb[2] > s2n.bb[2],
  'north and south land on different ground: ' + JSON.stringify([s2n.bb, s3s.bb]));
// two sheets of one floor on the SAME ground is the other failure it catches
const dup = await page.evaluate(() => {
  const lv = state.levels.find(l => l.name === '2');
  const sh = lv.sheets.find(s => s.page === window.__southPage) || lv.sheets[0];
  const keep = sh.alignment;
  sh.alignment = JSON.parse(JSON.stringify(lv.alignment));   // South matched as if it were North
  const got = sheetStackRows().filter(r => r.level === '2').map(r => r.issues.join(' | '));
  sh.alignment = keep;
  return got;
});
ok(dup.some(t => /same ground/.test(t)), 'two sheets of one floor over the same ground is flagged: ' + JSON.stringify(dup));

// the panel renders it and a row takes you there
console.log('   the panel');
const P = await page.evaluate(async () => {
  state.ui.stackOpen = true; renderSheetStack();
  const host = document.getElementById('sheetStack');
  const rows = [...host.querySelectorAll('.ss-row')];
  const bad = rows.filter(r => r.classList.contains('bad')).length;
  return { shown: host.style.display !== 'none', rows: rows.length, bad,
           warnHead: !!host.querySelector('.ss-head.warn'), ghostBox: !!host.querySelector('#ssGhost') };
});
ok(P.shown && P.rows === 6, 'the panel lists every floor-sheet: ' + JSON.stringify(P));
ok(P.bad >= 1 && P.warnHead, 'the ones to look at are marked, and the header says so: ' + JSON.stringify(P));
ok(P.ghostBox, 'with the ghost switch on it');
const jumped = await page.evaluate(async () => {
  const rows = sheetStackRows();
  const i = rows.findIndex(r => r.level === '2' && r.zone === 'South');
  document.querySelectorAll('#sheetStack .ss-row')[i].click();
  await new Promise(r => setTimeout(r, 400));
  return { page: state.pdf.current, level: state.levels[state.activeLevelIdx].name };
});
const l2pages = await page.evaluate(() => levelSheets(state.levels.find(l => l.name === '2')).map(s => s.page).sort((a, b) => a - b));
ok(jumped.page === l2pages[1] && jumped.level === '2', `clicking a row goes to that floor on that sheet: ${JSON.stringify(jumped)} want page ${l2pages[1]}`);

// ── B. the ghost ───────────────────────────────────────────────────────
console.log('B. the floor below, drawn under the sheet you are on');
const G = await page.evaluate(() => {
  const i = state.levels.findIndex(l => l.name === '3');
  state.activeLevelIdx = i; state.pdf.current = 10; setStep('areas');
  const count = () => {
    const c = document.getElementById('drawCanvas').getContext('2d');
    let strokes = 0, texts = [];
    const s0 = c.stroke.bind(c), t0 = c.fillText.bind(c);
    c.stroke = function () { strokes++; return s0.apply(c, arguments) };
    c.fillText = function (t) { texts.push(String(t)); return t0.apply(c, arguments) };
    renderNow();
    c.stroke = s0; c.fillText = t0;
    return { strokes, ghosted: texts.some(t => /FLOOR BELOW/.test(t)) };
  };
  state.ui.ghostBelow = false; const off = count();
  state.ui.ghostBelow = true;  const on = count();
  const below = levelBelowOf(state.levels[i]);
  return { off, on, below: below && below.name };
});
ok(G.below === '2', 'the floor below Level 3 is Level 2: ' + G.below);
ok(!G.off.ghosted && G.on.ghosted, 'the ghost is off until asked for, then labelled: ' + JSON.stringify(G));
ok(G.on.strokes > G.off.strokes, 'and it actually draws: ' + JSON.stringify([G.off.strokes, G.on.strokes]));
ok(await page.evaluate(() => { setStep('loads'); state.ui.ghostBelow = true;
  const c = document.getElementById('drawCanvas').getContext('2d'); let t = [];
  const t0 = c.fillText.bind(c); c.fillText = function (x) { t.push(String(x)); return t0.apply(c, arguments) };
  renderNow(); c.fillText = t0; setStep('areas');
  return !t.some(x => /FLOOR BELOW/.test(x)); }), 'and stays on the Areas step');

// ── C. trace only adds what a sheet of that floor shows ────────────────
console.log('C. a traced area with no sheet to live on is left out');
const C = await page.evaluate(async () => {
  const li = state.levels.findIndex(l => l.name === '2');
  const lv = state.levels[li];
  const arr = zonesOf(lv, 'loading');
  const n0 = arr.length;
  // one area on each of this floor's own sheets, and one a mile away
  const boxAt = (x, y) => [{x:x-8,y:y-8},{x:x+8,y:y-8},{x:x+8,y:y+8},{x:x-8,y:y+8}];
  const [pgN, pgS] = levelSheets(lv).map(sh => sh.page).sort((a, b) => a - b);
  const f7 = sheetFootprintFt(lv, pgN), f8 = sheetFootprintFt(lv, pgS);
  const c = b => [(b.minX+b.maxX)/2, (b.minY+b.maxY)/2];
  autoTrace = { page: 1, plans: [{ title: 'KEY PLAN', levelIdx: li, match: { ok: true },
    fills: [
      { accepted: true, bPoly: boxAt(...c(f7)), capacity: 100 },
      { accepted: true, bPoly: boxAt(...c(f8)), capacity: 100 },
      { accepted: true, bPoly: boxAt(9000, 9000), capacity: 100 },
    ] }] };
  await acceptAutoTrace();
  const got = arr.slice(n0).map(z => z.page);
  history.undo();
  return { got, n0, after: arr.length, pgN, pgS };
});
ok(C.got.length === 2, 'the two areas a sheet shows are added, the third is not: ' + JSON.stringify(C));
ok(C.got.includes(C.pgN) && C.got.includes(C.pgS), `each landing on the sheet that shows it: ${JSON.stringify(C.got)} want ${C.pgN}/${C.pgS}`);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);

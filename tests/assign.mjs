// @rules BLD-04, BLD-07, JOB-01, BLD-06  (see DECISIONS.md)
// Assign sheets to levels: read every page in the set once and work out what
// it is — which floor each plan shows, and which sheets are sections,
// elevations, details, schedules or load maps that never need a floor.
// Run against Adolfo's own test set and the WWU set.
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

const readPdf = f => fs.readFileSync(path.resolve(here, 'fixtures', f)).toString('base64');
const loadPdf = (b64, job) => page.evaluate(async ([b, d]) => {
  const bin = atob(b); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  if (d) { deserializeDoc(d); sortLevelsByElevation(); }
  else { state.levels = []; state.project.skippedPages = []; state.activeLevelIdx = null; }
  history.stack = []; history.idx = -1;
  document.getElementById('upload-prompt').style.display = 'none';
  document.getElementById('pageNav').style.display = 'flex';
}, [b64, job || null]);
const propose = () => page.evaluate(async () => {
  const l = await proposeSheetAssignments();
  return l.map(s => ({ page: s.page, kind: s.kind, kindLabel: s.kindLabel, level: s.levelName ?? null,
    action: s.action, conf: s.conf, title: s.title, why: s.why, note: s.note ?? null,
    levelIdx: s.levelIdx, primary: s.primary ?? null, pick: sheetPickDefault(s) }));
});

const kalae = readPdf('test-set.pdf');
const job = JSON.parse(fs.readFileSync(path.resolve(here, 'fixtures', 'test-job.reshore.json'), 'utf8'));

// ── A. every page of his own set, classified ────────────────────────────
console.log('A. the whole Kalae set read in one pass');
await loadPdf(kalae, job);
let L = await propose();
ok(L.length === 11, 'all eleven pages are looked at: ' + L.length);
const k = n => L.find(s => s.page === n);
ok(k(1).kind === 'loadmap', 'page 1 is the load map, not a Roof plan: ' + k(1).kind);
ok([2, 3, 4, 5, 6].every(n => k(n).kind === 'plan'), 'pages 2-6 are the floor plans');
ok([2, 3, 4, 5, 6].map(n => k(n).level).join(',') === '0,1,2,3,Roof',
   'each names its own floor: ' + [2, 3, 4, 5, 6].map(n => k(n).level).join(','));
ok([7, 8, 9].every(n => k(n).kind === 'detail'),
   'the three details sheets are not mistaken for plans of the floors their callouts name: '
   + [7, 8, 9].map(n => k(n).kind).join(','));
ok(k(10).kind === 'elevation', 'page 10 is the building elevations: ' + k(10).kind);
ok(k(11).kind === 'section', 'page 11 is the shear-wall section: ' + k(11).kind);
ok([1, 7, 8, 9, 10, 11].every(n => k(n).action === 'skip' || k(n).action === 'ok'),
   'every non-plan is proposed as "not a floor plan"');
ok([2, 3, 4, 5, 6].every(n => k(n).action === 'ok'),
   'his own assignments are recognized as already right, so nothing is rewritten');
ok(L.filter(s => s.action === 'skip').every(s => s.pick), 'the skips come ticked');
ok(k(7).why.includes('drawing titles'), 'a details sheet says why: ' + k(7).why);
ok(k(10).why.includes('BUILDING ELEVATION'), 'an elevation sheet quotes its title: ' + k(10).why);

// ── B. cold: no levels at all ───────────────────────────────────────────
console.log('B. cold start, before any levels exist');
await loadPdf(kalae, null);
L = await propose();
ok(L.filter(s => s.kind === 'plan').every(s => s.action === 'nolevel'),
   'a plan with no level yet is held back rather than guessed at');
ok(L.find(s => s.page === 3).note.includes('Read levels from drawings'),
   'and it says how to get the levels: ' + L.find(s => s.page === 3).note);
ok(L.filter(s => s.action === 'nolevel').every(s => !s.pick), 'those rows are not ticked');
ok(L.filter(s => s.kind !== 'plan').every(s => s.action === 'skip'),
   'the non-plans can still be settled without any levels');

// ── C. levels read from the drawings, then the sheets assigned ──────────
console.log('C. Read levels from drawings, then assign the rest');
const after = await page.evaluate(async () => {
  const prop = await proposeLevelsFromDrawings();
  applyLevelDrawingProposals(prop, new Set(prop.map(p => p.page)));
  const list = await proposeSheetAssignments();
  const picks = new Set(list.filter(sheetPickDefault).map(s => s.page));
  const r = applySheetAssignments(list, picks);
  return { r, levels: state.levels.map(l => ({ name: l.name, page: l.pdfPage })),
           skipped: skippedPages().slice().sort((a, b) => a - b),
           unclaimed: Array.from({ length: state.pdf.pages }, (_, i) => i + 1)
             .filter(p => levelForPage(p) < 0 && !pageIsSkipped(p)) };
});
ok(after.levels.map(l => l.name + ':' + l.page).join(',') === 'Roof:6,3:5,2:4,1:3,0:2',
   'every floor ends up on its own sheet: ' + after.levels.map(l => l.name + ':' + l.page).join(','));
ok(after.skipped.join(',') === '1,7,8,9,10,11',
   'and the six sheets that are not floor plans are marked so: ' + after.skipped.join(','));
ok(after.unclaimed.length === 0, 'nothing is left asking "which floor is this?": ' + after.unclaimed.join(','));
ok(after.r.skipped === 6, 'the toast counts what it wrote: ' + JSON.stringify(after.r));

console.log('D. one undo puts the whole pass back');
const undone = await page.evaluate(() => {
  history.undo();
  return { skipped: skippedPages().slice(), pages: state.levels.map(l => l.pdfPage) };
});
ok(undone.skipped.length === 0, 'the skips are gone: ' + undone.skipped.join(','));
await page.evaluate(() => history.redo());

console.log('E. running it again changes nothing');
const again = await page.evaluate(async () => {
  const list = await proposeSheetAssignments();
  return { actionable: list.filter(s => s.action === 'assign' || s.action === 'skip').length,
           ok: list.filter(s => s.action === 'ok').length };
});
ok(again.actionable === 0, 'a second pass has nothing left to write: ' + again.actionable);
ok(again.ok === 11, 'and reports all eleven as already right: ' + again.ok);

// ── F. the soffit preference, on a floor with several plans ─────────────
console.log('F. a floor with a soffit, a framing and a dimension plan');
const rank = await page.evaluate(() => {
  const mk = (page, title) => {
    const pr = planRankOf(title);
    return { page, kind: 'plan', kindLabel: pr.what, planRank: pr.rank, levelName: '3',
             title, titles: [title], elevN: 5, conf: 'high' };
  };
  const list = [mk(11, 'LEVEL 03 DIMENSION PLAN'), mk(12, 'LEVEL 03 FRAMING PLAN'),
                mk(13, 'LEVEL 03 (SOFFIT PLAN)'), mk(14, 'LEVEL 03 FLOOR PLAN')];
  list.sort((a, b) => b.planRank - a.planRank || b.elevN - a.elevN || a.page - b.page);
  list.forEach((s, i) => { s.primary = i === 0; s.siblings = list.map(o => o.page) });
  list.forEach(decideSheetAction);
  const first = list[0];
  // now swap the framing plan in, the way the "Use this sheet" button does
  for (const o of list) o.primary = (o.page === 12);
  list.forEach(decideSheetAction);
  const swapped = list.filter(o => o.action === 'assign' || o.action === 'nolevel').map(o => o.page);
  return { order: list.slice().sort((a, b) => a.page - b.page).map(o => [o.page, o.kindLabel]),
           winner: first.page, winnerKind: first.kindLabel,
           altNote: list.find(o => o.page === 13).note, swapped };
});
ok(rank.winner === 13, 'the soffit plan is the one bound: page ' + rank.winner + ' (' + rank.winnerKind + ')');
ok(rank.winnerKind === 'soffit plan', 'and it is named as such: ' + rank.winnerKind);
ok(JSON.stringify(rank.order) === JSON.stringify([[11, 'dimension plan'], [12, 'framing plan'], [13, 'soffit plan'], [14, 'floor plan']]),
   'each plan is labeled by what it is: ' + JSON.stringify(rank.order));
ok(rank.altNote && rank.altNote.includes('another plan of 3'), 'the runners-up say why they are left alone: ' + rank.altNote);
ok(rank.swapped.join(',') === '12', 'the swap makes the framing plan the bound one: ' + rank.swapped.join(','));

console.log('G. a level named any of the usual ways still matches its sheet');
const nm = await page.evaluate(() => ['LEVEL 03', 'L3', '03', '3', 'Level-3', 'lvl 3'].map(normLevelName));
ok(nm.every(v => v === '3'), 'L3 / 03 / LEVEL 03 all read as floor 3: ' + JSON.stringify(nm));
const nmr = await page.evaluate(() => [normLevelName('Roof'), normLevelName('LEVEL ROOF'), normLevelName('P1')]);
ok(nmr[0] === 'ROOF' && nmr[1] === 'LEVELROOF' && nmr[2] === 'P1', 'and a named floor is left alone: ' + JSON.stringify(nmr));

console.log('H. a hand assignment is never stomped');
const hand = await page.evaluate(async () => {
  history.record('by hand'); assignPageToLevel(10, 0);      // the elevation sheet, on purpose
  const list = await proposeSheetAssignments();
  const s = list.find(o => o.page === 10);
  return { action: s.action, note: s.note };
});
ok(hand.action === 'alt', 'a sheet the user assigned by hand is left alone: ' + hand.action);
ok(hand.note && hand.note.includes('by hand'), 'and says so: ' + hand.note);
await page.evaluate(() => history.undo());

// ── I. the WWU set: a different title convention, and load diagrams ─────
console.log('I. the WWU set');
await loadPdf(readPdf('test3.pdf'), null);
L = await propose();
ok(L.length === 7, 'seven pages: ' + L.length);
ok(L.find(s => s.page === 1).kind === 'loadmap' && L.find(s => s.page === 2).kind === 'loadmap',
   'the two loading-diagram sheets are read as load maps even though height cannot pick out their titles: '
   + [1, 2].map(n => L.find(s => s.page === n).kind).join(','));
ok(L.find(s => s.page === 1).why.includes('SUPERIMPOSED DEAD LOAD'),
   'quoting the diagram title: ' + L.find(s => s.page === 1).why);
ok([3, 4, 5, 6, 7].every(n => L.find(s => s.page === n).kind === 'plan'), 'pages 3-7 are the plans');
ok([3, 4, 5, 6, 7].map(n => L.find(s => s.page === n).level).join(',') === '1,2,3,4,5',
   'the LEVEL-2 hyphen convention reads the same as LEVEL 02: ' + [3, 4, 5, 6, 7].map(n => L.find(s => s.page === n).level).join(','));
ok(L.find(s => s.page === 3).kindLabel === 'slab-on-grade plan', 'the slab-on-grade sheet is named for what it is: ' + L.find(s => s.page === 3).kindLabel);
ok(L.find(s => s.page === 3).conf === 'medium',
   'a plan with no elevation callouts is offered, but not claimed as certain: ' + L.find(s => s.page === 3).conf);

const wwu = await page.evaluate(async () => {
  const prop = await proposeLevelsFromDrawings();
  applyLevelDrawingProposals(prop, new Set(prop.map(p => p.page)));
  const list = await proposeSheetAssignments();
  applySheetAssignments(list, new Set(list.filter(sheetPickDefault).map(s => s.page)));
  return { levels: state.levels.map(l => l.name + ':' + l.pdfPage).join(','), skipped: skippedPages().slice().sort((a, b) => a - b) };
});
ok(wwu.levels === '5:7,4:6,3:5,2:4,1:3', 'every WWU floor lands on its sheet: ' + wwu.levels);
ok(wwu.skipped.join(',') === '1,2', 'and the two diagram sheets are marked not a floor plan: ' + wwu.skipped.join(','));

// ── J–L. the one-shot review is gone; the table pre-fills itself ─────────
// Adolfo, Sep 17 2026: "The assign rest of the sheets step is a little
// convoluted." The two readers on Levels are replaced by the automatic read
// (levels + sheets) and a Sheets section with a row per page. What the old
// review decided is now what the table arrives pre-filled with.
console.log('J. no second button; the Sheets section holds the table');
await loadPdf(kalae, null);
await page.evaluate(() => setStep('levels'));
ok(await page.$('#btnAssignSheets') === null, 'the "Assign the rest of the sheets" button is gone');
ok(await page.evaluate(() => document.getElementById('sheetTable').closest('.step-panel').dataset.step === 'sheets'),
   'the sheets table lives on its own Sheets section');
ok(await page.evaluate(() => GROUPS[0].sections.indexOf('sheets') === GROUPS[0].sections.indexOf('levels') + 1),
   'which comes right after Levels: ' + await page.evaluate(() => GROUPS[0].sections.join(',')));
ok(await page.evaluate(() => !!document.getElementById('levelsConfirm')), 'and Levels ends in a Confirm row');

console.log('K. the automatic pre-fill does what the review used to');
const filled = await page.evaluate(async () => {
  const prop = await proposeLevelsFromDrawings();
  applyLevelDrawingProposals(prop, new Set(prop.map(p => p.page)));
  state.levels.forEach(l => l.pdfPage = null);   // levels by hand, sheets unbound
  await readSheetTitles(true);
  const r = autoAssignSheets();
  return { r, skipped: skippedPages().slice().sort((a, b) => a - b).join(','),
    levels: state.levels.map(l => l.name + ':' + l.pdfPage).join(','), unsure: sheetUnsure().slice().sort((a, b) => a - b),
    rows: sheetTableRows().length };
});
ok(filled.skipped === '1,7,8,9,10,11', 'the non-plans are marked not a floor plan: ' + filled.skipped);
ok(filled.levels === 'Roof:6,3:5,2:4,1:3,0:2', 'and every floor is bound to its sheet: ' + filled.levels);
ok(filled.rows === 11, 'every page keeps a row in the table — nothing filtered: ' + filled.rows);
console.log('   flagged to check: ' + JSON.stringify(filled.unsure));
const bar = await page.evaluate(() => { state.pdf.current = 7; renderPageBar();
  return document.getElementById('pageBar').textContent; });
ok(/not a floor plan/.test(bar), 'and sheet 7 stops asking which floor it is: ' + JSON.stringify(bar.slice(0, 60)));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

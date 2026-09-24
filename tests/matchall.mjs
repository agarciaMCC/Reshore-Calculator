// @rules BLD-07, RES-08, UI-15, UI-23  (see DECISIONS.md)
// Match every floor in one pass (Sep 10, 2026), and the no-shore alert
// saying WHERE.
//
//  A. the button and its review panel: a row per bound sheet, a verdict per
//     row, and NOTHING written until Apply
//  B. the cold start — no project grid at all — and the fits that follow it
//  C. Apply, against Adolfo's own hand matches, and one undo
//  D. an already-matched sheet arrives unticked, with the drift stated
//  E. Show draws the proposed grid on its own sheet; Escape peels it
//  F. "no shore in the catalog reaches" names the floor, the region and the
//     height, and clicking a line puts that area on the plan
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

const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'test-set.pdf'));
const job = JSON.parse(fs.readFileSync(path.resolve(here, 'fixtures', 'test-job.reshore.json'), 'utf8'));
await page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
  window.HAND = state.levels.map(l => l.alignment && l.alignment.transform && l.alignment.transform.slice());
  setStep('match');
}, [pdf.toString('base64'), job]);

// ── A/B. cold start: wipe every fit AND the project grid ────────────────
console.log('A. one button, every sheet, nothing written yet');
await page.evaluate(() => {
  state.levels.forEach(l => { l.alignment = null; (l.sheets || []).forEach(s => { s.alignment = null; }); });
  state.project.grid = { x: [], y: [] };
  matchProposal = null; renderMatchPanel();
});
ok(await page.$$eval('#matchList button[data-automatch]', b => b.length) === 0, 'the per-floor Auto button is gone');
ok(await page.$eval('#btnMatchAll', b => /every floor/i.test(b.textContent)), 'one button matches every floor');
// matching runs itself on arrival; the button is the re-run, in the hand-tools row under the list (UI-31)
ok(await page.$eval('#btnMatchAll', b => !!b.closest('[data-byhand="match"]') && b.offsetParent !== null), 'and it lives in the hand-tools row, in view');
await page.evaluate(() => openByHand('match'));
await page.click('#btnMatchAll');
await page.waitForFunction(() => !!matchProposal, { timeout: 120000 });
await page.waitForTimeout(200);
const P = await page.evaluate(() => matchProposal.rows.map(r => ({
  name: r.name, page: r.page, has: !!r.fit, err: r.err || null, verdict: r.verdict, why: r.why,
  pick: r.pick, defines: !!r.definesGrid, scaleFrom: r.scaleFrom || null, hadMatch: !!r.hadMatch,
  ft: r.fit && +r.fit.ftPerInch.toFixed(3), rmsIn: r.fit && +(r.fit.rmsFt * 12).toFixed(3),
  rot: r.fit && +r.fit.rotationDeg.toFixed(3), n: r.fit && r.fit.points,
})));
console.log('   ' + JSON.stringify(P.map(r => [r.name, r.page, r.verdict, r.ft, r.rmsIn, r.n])));
const bound = await page.evaluate(() => state.levels.filter(l => levelNeedsAlignment(l) && levelSheets(l).length).length);
ok(P.length >= bound && P.length === await page.evaluate(() => matchTargets().length), 'a row per sheet that needs one: ' + P.length);
ok(P.every(r => r.has), 'every sheet in the set was read: ' + JSON.stringify(P.filter(r => !r.has).map(r => [r.name, r.err])));
ok(P.every(r => r.verdict === 'good'), 'and every fit comes out good on this set: ' + JSON.stringify(P.map(r => [r.name, r.verdict, r.why])));
ok(P.every(r => r.rmsIn <= 0.5 && Math.abs(r.rot) < 0.05 && Math.abs(r.ft - 10) < 0.05),
  'sub-half-inch residuals, square, 1" = 10\': ' + JSON.stringify(P.map(r => [r.rmsIn, r.rot, r.ft])));
ok(P.every(r => r.pick), 'all ticked, since no sheet had a match');
// B. the first row had no grid to fit to
ok(P.filter(r => r.defines).length === 1 && P[0].defines, 'exactly one row defines the project grid, and it is the first: ' + JSON.stringify(P.map(r => r.defines)));
// (Sep 17 2026: the plan's own scale note is the authority now, with the
// dimension chain as the check — the chain read a sub-chain on Kinect)
ok(/under the plan title|dimension chain/.test(P[0].scaleFrom || ''), 'its scale came from the note under the plan title (or the chain): ' + P[0].scaleFrom);
// nothing written
const before = await page.evaluate(() => ({
  aligned: state.levels.filter(l => l.alignment && l.alignment.transform).length,
  grid: (state.project.grid.x.length + state.project.grid.y.length),
  undos: history.stack ? history.stack.length : null,
}));
ok(before.aligned === 0 && before.grid === 0, 'nothing is written until Apply: ' + JSON.stringify(before));
ok(await page.$$eval('#matchList .match-row.proposed', r => r.length) === P.length, 'each proposal sits on its own sheet row (UI-34): ' + await page.$$eval('#matchList .match-row.proposed', r => r.length));
ok(await page.$$eval('#matchList .mp-panel', r => r.length) === 0, 'there is no separate proposal panel');
ok(await page.$eval('#btnConfirmProposed', b => /Confirm all \d+ proposed/.test(b.textContent)), 'the primary counts what it would confirm: ' + await page.$eval('#btnConfirmProposed', b => b.textContent.trim()));

// ── E. Show draws the fit on its own sheet, Escape peels it ─────────────
console.log('E. Show, and Escape');
const drew = await page.evaluate(async () => {
  // record what the overlay strokes
  const c = document.getElementById('drawCanvas').getContext('2d');
  let strokes = 0, texts = [];
  const s0 = c.stroke.bind(c), t0 = c.fillText.bind(c);
  c.stroke = function () { strokes++; return s0.apply(c, arguments) };
  c.fillText = function (t) { texts.push(String(t)); return t0.apply(c, arguments) };
  const i = matchProposal.rows.findIndex(r => r.fit);
  await previewMatchRow(i);
  renderNow();
  c.stroke = s0; c.fillText = t0;
  return { strokes, texts, page: state.pdf.current, want: matchProposal.rows[i].page,
           sel: !!state.ui.matchPreview, pts: matchProposal.rows[i].keep.length };
});
ok(drew.page === drew.want, 'Show goes to that row\'s sheet: page ' + drew.page);
ok(drew.sel, 'the preview is up');
ok(drew.strokes > 10, 'it strokes the grid it implies and the crossings it used: ' + drew.strokes);
ok(drew.texts.some(t => /^\d+$/.test(t)) && drew.texts.some(t => /,/.test(t)),
  'labelled grid lines and labelled crossings: ' + JSON.stringify(drew.texts.slice(0, 6)));
ok(await page.$eval('#matchList .match-row.sel button[data-mshow]', b => b.textContent.trim() === 'Showing'), 'the row says it is showing');
// UI-36 (Sep 24 2026): the grid marks and lines belong to Match floors alone —
// on any other section they are neither kept nor drawn
for (const sec of ['drawings', 'levels', 'edge']) {
  const d2 = await page.evaluate(async (sec) => {
    setStep('match'); await previewMatchRow(matchProposal.rows.findIndex(r => r.fit));
    const had = !!state.ui.matchPreview;
    setStep(sec);
    const c = document.getElementById('drawCanvas').getContext('2d');
    let strokes = 0; const s0 = c.stroke.bind(c);
    c.stroke = function () { strokes++; return s0.apply(c, arguments) };
    const before = strokes; renderNow();
    const withPreview = strokes - before;
    c.stroke = s0;
    return { had, step: curStep, sel: !!state.ui.matchPreview, gr: !!state.ui.gridReview };
  }, sec);
  ok(d2.had && !d2.sel && !d2.gr, 'moving to ' + sec + ' drops the grid preview: ' + JSON.stringify(d2));
}
await page.evaluate(() => setStep('match'));
await page.evaluate(async () => { await previewMatchRow(matchProposal.rows.findIndex(r => r.fit)); });
ok(await page.evaluate(() => { setStep('loads'); return !state.ui.matchPreview }), 'leaving for Loads drops the preview too');
await page.evaluate(async () => { setStep('match'); await previewMatchRow(matchProposal.rows.findIndex(r => r.fit)); });
await page.keyboard.press('Escape');
ok(await page.evaluate(() => !state.ui.matchPreview && !!matchProposal), 'Escape takes the drawing off but keeps the proposal');
await page.keyboard.press('Escape');
ok(await page.evaluate(() => !matchProposal), 'a second Escape closes the proposal');
ok(await page.$$eval('#matchList .match-row.proposed', r => r.length) === 0, 'and the rows are back to plain');

// ── C. Apply ────────────────────────────────────────────────────────────
console.log('C. Apply, against his hand matches');
await page.click('#btnMatchAll');
await page.waitForFunction(() => !!matchProposal, { timeout: 120000 });
await page.click('#btnConfirmProposed');
await page.waitForTimeout(300);
// A cold start has no reason to land on the same ORIGIN he happened to use —
// his first hand match anchored the grid where it anchored it. What has to
// hold is that the whole set agrees with his fits up to one shared
// translation: same scale, same rotation, same relative position of every
// floor. So measure the offset per floor and check they are all the same.
const applied = await page.evaluate(() => {
  const out = { aligned: 0, grid: state.project.grid.x.length + state.project.grid.y.length, off: [], gone: !matchProposal };
  state.levels.forEach((l, i) => {
    const a = l.alignment;
    if (!(a && a.transform)) return;
    out.aligned++;
    if (!window.HAND[i]) return;
    const d = [];
    for (const [x, y] of [[200, 200], [2600, 200], [200, 1800], [2600, 1800]]) {
      const p = pixelToBuilding(x, y, window.HAND[i]), q = pixelToBuilding(x, y, a.transform);
      d.push([q.bx - p.bx, q.by - p.by]);
    }
    out.off.push({ name: l.name, dx: d[0][0], dy: d[0][1],
      spread: Math.max(...d.map(([u, v]) => Math.hypot(u - d[0][0], v - d[0][1]))) });
  });
  return out;
});
const dxs = applied.off.map(o => o.dx), dys = applied.off.map(o => o.dy);
const sameShift = Math.max(...dxs) - Math.min(...dxs) < 0.15 && Math.max(...dys) - Math.min(...dys) < 0.15;
console.log('   against his hand fits: one shared offset of '
  + `${dxs[0] != null ? dxs[0].toFixed(2) : '?'}, ${dys[0] != null ? dys[0].toFixed(2) : '?'} ft`
  + ` · worst in-sheet spread ${Math.max(...applied.off.map(o => o.spread)).toFixed(3)} ft`);
ok(applied.aligned === P.length, `every ticked sheet is matched: ${applied.aligned} of ${P.length}`);
ok(applied.grid >= 8, 'the project grid was filled in: ' + applied.grid + ' labels (5 columns + 4 rows on this set)');
ok(applied.gone, 'the proposal closes once applied');
ok(await page.evaluate(() => matchSheetRows().every(r => r.confirmed)), 'and every sheet written this way is confirmed in the same press (UI-34)');
// 0.06% of a 240 ft sheet: the cold-started scale is 1" = 10.006' off the
// dimension chain against the 10.000' his hand match used, so the far corner
// of the sheet lands 2" out. Nothing in the calc reads at that resolution.
ok(applied.off.every(o => o.spread < 0.25), 'each fit has his scale and rotation to within 3" across the sheet: '
  + JSON.stringify(applied.off.map(o => [o.name, +o.spread.toFixed(3)])));
ok(sameShift, 'and every floor is shifted by the SAME amount, so the set is one frame: '
  + JSON.stringify(applied.off.map(o => [o.name, +o.dx.toFixed(2), +o.dy.toFixed(2)])));
ok(await page.evaluate(() => alignedCount() === state.levels.length), 'the step reads as matched');
await page.evaluate(() => { history.undo(); refreshFlow(); });
ok(await page.evaluate(() => state.levels.every(l => !(l.alignment && l.alignment.transform))), 'one undo takes the whole pass back');
await page.evaluate(() => { history.redo(); refreshFlow(); });
ok(await page.evaluate(() => alignedCount() === state.levels.length), 'and redo puts it back');

// ── D. a sheet that is already matched ──────────────────────────────────
console.log('D. a second run leaves existing matches alone');
await page.click('#btnMatchAll');
await page.waitForFunction(() => !!matchProposal, { timeout: 120000 });
const second = await page.evaluate(() => matchProposal.rows.map(r => ({
  had: !!r.hadMatch, pick: r.pick, drift: r.drift == null ? null : +r.drift.toFixed(3), v: r.verdict })));
ok(second.every(r => r.had), 'every row is now an already-matched sheet');
ok(second.every(r => !r.pick), 'so none of them is ticked');
ok(second.every(r => r.drift != null && r.drift < 0.05), 'each says how far its re-fit would move the sheet: ' + JSON.stringify(second.map(r => r.drift)));
ok(await page.$$eval('#matchList button[data-mpuse]', b => b.length) === 0, 'a re-read that moves nothing offers nothing on the rows');
ok(await page.$$eval('#btnConfirmProposed', b => b.length) === 0, 'and there is nothing to confirm');
await page.keyboard.press('Escape');

// ── F. the no-shore alert says where ────────────────────────────────────
console.log('F. no shore in the catalog reaches — where?');
const ns = await page.evaluate(() => {
  setStep('results');
  // the pour whose cascade needs a shore taller than anything in the catalog
  const i = schedSolve.levels.findIndex(L => L.solve.spatial && L.solve.noShoreRows > 0);
  if (i < 0) return { none: true };
  schedPourIdx = i; renderSchedule();
  const items = noShoreItems(schedSolve.levels[i]);
  return { pour: schedSolve.levels[i].pour.name, rows: schedSolve.levels[i].solve.noShoreRows,
    items: items.map(x => ({ floor: x.floor, label: x.label, h: x.heightFt, spans: x.spansOpen, sf: x.areaSF })),
    text: document.getElementById('schedSummary').innerText.replace(/\s+/g, ' '),
    head: document.getElementById('schedHead').innerText.replace(/\s+/g, ' ') };
});
ok(!ns.none, 'the test job has a row nothing in the catalog reaches (pour ' + ns.pour + ')');
ok(ns.items.length === ns.rows, `one line per row: ${ns.items.length} of ${ns.rows}`);
// a row can be unshoreable two ways: nothing in the catalog reaches the
// height, or there is no floor below to stand on at all (the bottom of the
// defined stack) — the line has to say which
ok(ns.items.every(x => x.floor && x.label && (x.h > 0 || !x.support)), 'each names the floor, the region and either the height or that there is nothing to stand on: ' + JSON.stringify(ns.items));
ok(ns.items.some(x => x.h > 0), 'at least one is a real height nothing reaches: ' + JSON.stringify(ns.items.map(x => x.h)));
// a row can be unshoreable three ways, and each says which: no shore in the
// catalog reaches the height, there is no floor below to stand on, or that
// floor has no slab here at all so there is nothing to reshore against
// RES-07 (Sep 17 2026) relegated the "nothing to shore against" list: it is a
// COUNT in the install summary now, with the reason carried on the region rows.
// The old block of .ns-row lines in #schedSummary is gone on purpose — what is
// asserted here is the count, the reason in its new home, and RES-08's rule
// that the line still names the floor, the region and the height and clicks
// onto the plan.
ok(/\d+\s+rows?\s+with nothing to shore against/i.test(ns.text),
  'the summary heads it as a count: ' + (ns.text.match(/\d+ rows? with nothing to shore against/i) || ['(absent)'])[0]);
ok(+(ns.text.match(/(\d+) rows? with nothing to shore against/i) || [0, 0])[1] === ns.items.length,
  `the count is the number of rows: ${(ns.text.match(/(\d+) rows? with nothing to shore against/i) || [])[1]} vs ${ns.items.length}`);
ok(await page.$$eval('#schedSummary .ns-row', r => r.length) === 0,
  'and the old list of lines is no longer a block of its own in the summary');
ok(!/no shore in the catalog tall enough/i.test(ns.head), 'the bare count is not in the header');

// the reason sits on the region rows
const nsBody = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#schedBody .ra-row')];
  return { text: rows.map(r => r.innerText.replace(/\s+/g, ' ')).join(' | '),
    goes: rows.filter(r => r.classList.contains('sched-go')).length };
});
ok(/No shore in the catalog reaches|nothing to shore against|nothing below|no floor under the pour/i.test(nsBody.text),
  'a region row says why it cannot be shored: ' + nsBody.text.slice(0, 160));
ok(ns.items.some(x => new RegExp(x.floor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(nsBody.text)),
  'naming the floor it is under');
ok(/\d+'-\d/.test(nsBody.text) || ns.items.every(x => !x.h),
  'and the height needed where there is one: ' + (nsBody.text.match(/\d+'-[\d\s\-/]+"/g) || []).slice(0, 3).join(', '));
ok(nsBody.goes > 0, 'the rows are clickable: ' + nsBody.goes);

// RES-08: the line clicks onto the plan
const picked = await page.evaluate(async () => {
  const L0 = schedSolve.levels[schedPourIdx];
  const it = noShoreItems(L0)[0];
  const want = it.kind === 'beam' ? null : L0.solve.regions[it.ri];
  const row = [...document.querySelectorAll('#schedBody .ra-row.sched-go')][0];
  row.click();
  await new Promise(r => setTimeout(r, 1200));
  return { hl: state.ui.highlight && state.ui.highlight.regionKey, anyWant: !!want,
    page: state.pdf.current, lit: document.querySelectorAll('#schedBody .sched-region.lit').length,
    pages: state.levels.map(l => (levelSheets(l)[0] || {}).page) };
});
ok(picked.hl, 'clicking a row puts a region on the plan: ' + picked.hl);
ok(picked.pages.includes(picked.page), 'on a floor sheet of this job: page ' + picked.page);
ok(picked.lit === 1, 'and its card lights up in the schedule');

// ── G. the read says where it is ────────────────────────────────────────
// This pass runs by itself on arrival, and the only thing that said so was the
// label on a button folded away inside the by-hand disclosure — so it looked
// like nothing happened (Adolfo, Sep 21: "also, the grid auto detect is gone?").
console.log('G. the read says where it is');
{
  const run = await page.evaluate(async () => {
    const seen = [];
    const orig = setMatchRead;
    window.setMatchRead = v => {
      const r = orig(v);
      if (v) seen.push({ at: `${v.i} of ${v.n}`, txt: (document.getElementById('matchProgress') || {}).textContent || '',
        inSlot: !!document.querySelector('#matchList .primary-act #matchProgress') });
      return r;
    };
    matchProposal = null; renderMatchPanel();
    await proposeMatchAll();
    window.setMatchRead = orig;
    return { seen, after: matchRead, el: !!document.getElementById('matchProgress'),
      rows: matchProposal ? matchProposal.rows.length : 0 };
  });
  ok(run.seen.length === run.rows && run.rows > 1, 'it reports every sheet as it reads it: '
    + JSON.stringify(run.seen.map(s => s.at)));
  ok(run.seen.every(s => /Reading sheet \d+ of \d+ for its grid bubbles/.test(s.txt)),
    'saying which sheet it is on: ' + JSON.stringify(run.seen[0]));
  ok(run.seen.every(s => s.inSlot), 'in the step\'s own primary slot, not inside the by-hand disclosure');
  ok(run.after === null && !run.el, 'and it stops saying so once the proposal is up');
  ok(await page.evaluate(() => !!matchProposal && matchProposal.rows.length > 1), 'which is the proposal itself (on the rows where it has something to offer)');
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

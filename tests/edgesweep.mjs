// @rules EDG-01, UI-03, UI-22  (see DECISIONS.md)
// THE FLOOR EDGE, READ FOR THE WHOLE JOB AND CONFIRMED (Adolfo, Sep 14, 2026):
// "can we have the floor edge be automatically done and then confirmed by the
//  user? then the option to redraw floor edge in case the floorplan gets
//  updated and changed in an updated drawing set?"
//
// One button reads every sheet the job is bound to. Each read lands on THAT
// SHEET'S OWN ROW in the Floor edge list (Sep 21: "this seems redundant to
// have these 2 steps, right?" — there is no second review panel), carrying
// what it found and, where the floor already has an edge, WHAT CHANGES: the
// area either side, how far the outline moves, and how many drawn areas would
// fall outside it. Nothing is written until Use this (or Use all N). Show
// draws that outline over its own sheet with the edge it would replace beside
// it in grey; Redetect re-reads one sheet — the answer to a re-issued set.
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
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation(); state.activeLevelIdx = 0; renderSidebar(); persist();
  document.getElementById('upload-prompt').style.display = 'none';
  // this suite drives the sweep BY HAND; the sweep that runs itself on
  // arrival (UI-16, tests/flow.mjs) is stood down so it does not race it
  edgeAutoKey = planSheetRows().map(r => r.page).join(',');
  setStep('edge'); setLayer('slab'); renderSidebar();
}, [pdf.toString('base64'), job]);

// the ONE list: the Floor edge rows, which now carry the reads
const panel = () => page.$eval('#edgeRows', e => e.innerText.replace(/\s+/g, ' '));
const rowKey = i => page.evaluate(k => `${edgeSweep.rows[k].levelIdx}:${edgeSweep.rows[k].page}`, i);
const rows = () => page.evaluate(() => (edgeSweep ? edgeSweep.rows.map(r => ({
  name: r.name, page: r.page, corners: r.corners || 0, verdict: r.verdict, pick: !!r.pick,
  had: !!r.had, areaSF: r.areaSF, err: r.err || null })) : null));
const nEdges = () => page.evaluate(() => state.levels.map(l => levelEdges(l).length));

// ── A. the button, and a row per bound sheet ────────────────────────────
console.log('A. one button, a row per sheet');
// the whole-job read is a button on the FLOOR EDGE section of the Building
// step (Sep 17 2026), where the edges are picked and confirmed before the
// Areas detectors are let loose inside them
ok(await page.$eval('#edgeDetectAll', b => b.offsetParent !== null && /every sheet/.test(b.textContent)), 'the whole-job button is on the Floor edge section');
ok(await page.evaluate(() => document.getElementById('edgeRows').closest('.step-panel').dataset.step === 'edge'), 'and the rows it reads into are on the same step');
ok(await page.evaluate(() => { const p = document.getElementById('edgeSweepPanel'); return !p || p.style.display === 'none' }),
  'there is no second review panel');
ok(await page.evaluate(() => document.getElementById('adEdge').closest('label').hidden), 'the Areas auto-detect no longer offers the floor edge');

const targets = await page.evaluate(() => edgeSweepTargets().map(t => [t.name, t.page]));
ok(targets.length === 5, 'five bound sheets, one row each: ' + JSON.stringify(targets));
ok(targets.every(t => t[1] >= 2 && t[1] <= 6), 'each row carries its own sheet, not the floor\'s first: ' + JSON.stringify(targets));

const before = await nEdges();
ok(before.every(n => n === 0), 'no floor has an edge yet: ' + JSON.stringify(before));

// ── B. the sweep runs and proposes, writing nothing ─────────────────────
console.log('B. the sweep proposes, writes nothing');
// the first moment of the run: it is marked running and the panel is already
// up, saying which sheet it is on and holding the button
const t0 = await page.evaluate(() => {
  runEdgeSweep();
  return { running: !!(edgeSweep && edgeSweep.running), rows: edgeSweep ? edgeSweep.rows.length : 0,
    panel: document.getElementById('edgeRows').innerText.replace(/\s+/g, ' '),
    btn: detectBtn() ? detectBtn().textContent : '' };
});
ok(t0.running && t0.rows === 5, 'the review is up before the first sheet is read: ' + JSON.stringify([t0.running, t0.rows]));
ok(/Reading sheet 1 of 5/.test(t0.panel), 'the step says which sheet it is on: ' + t0.panel.slice(0, 90));
ok(/reading this sheet…/.test(t0.panel), 'and the rows not read yet say so');
await page.waitForFunction(() => edgeSweep && !edgeSweep.running, null, { timeout: 180000 });
ok(/Reading…/.test(t0.btn), 'the button that started it is held while it reads: ' + t0.btn);
ok(await page.evaluate(() => !/Reading sheet/.test(detectBtn().textContent)), 'and goes back to its own label when it is done: '
  + await page.evaluate(() => detectBtn().textContent));

const R = await rows();
ok(R.length === 5, 'five rows read: ' + JSON.stringify(R.map(r => [r.name, r.page, r.verdict, r.corners])));
ok(JSON.stringify(await nEdges()) === JSON.stringify(before), 'and NOTHING was written to the job: ' + JSON.stringify(await nEdges()));
ok(await page.evaluate(() => history.depth()) === 0, 'nothing on the undo stack either');
const read = R.filter(r => r.corners > 0);
ok(read.length >= 4, 'at least four sheets read an outline: ' + read.length);
ok(read.every(r => r.areaSF > 1000), 'each has an area in square feet, so the sheets are matched: '
  + JSON.stringify(read.map(r => Math.round(r.areaSF))));
ok(R.every(r => r.had === false), 'none of them replaces anything yet');
const P = await panel();
ok(/read from the sheet/.test(P), 'each read sits on its own sheet\'s row: ' + P.slice(0, 110));
ok(/Review/.test(P) && /Dismiss/.test(P), 'with Review and Dismiss on the row (UI-35)');
ok(/Review \d reads? from the bottom floor up/.test(await page.$eval('#edgeReviewAll', b => b.textContent)),
  'and one primary action counts them: ' + await page.$eval('#edgeReviewAll', b => b.textContent));
ok(await page.evaluate(() => !document.getElementById('edgeConfirmAll')), 'Confirm all waits its turn');

// ── C. a doubtful read arrives unticked, with the reason ────────────────
console.log('C. confident ticked, doubtful not');
ok(R.filter(r => r.verdict === 'good').every(r => r.pick), 'every confident read is ticked');
ok(R.filter(r => r.verdict !== 'good').every(r => !r.pick), 'every doubtful or failed one is not: '
  + JSON.stringify(R.filter(r => r.verdict !== 'good').map(r => [r.name, r.verdict])));
// force one: a two-corner outline is not a slab edge
await page.evaluate(() => {
  const r = edgeSweep.rows[0];
  r._keep = { polygon: r.polygon, corners: r.corners, verdict: r.verdict, pick: r.pick, why: r.why };
  r.polygon = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]; r.corners = 3; r.notes = [];
  const v = edgeVerdict(r); r.verdict = v.v; r.why = v.why; r.pick = v.v === 'good';
  renderEdgeSweepPanel();
});
let r0 = (await rows())[0];
ok(r0.verdict === 'check' && !r0.pick, 'a three-corner outline is doubtful and unticked: ' + JSON.stringify([r0.verdict, r0.pick]));
ok(/only 3 corners/.test(await page.evaluate(() => edgeSweep.rows[0].why)), 'and the reason is on it: '
  + await page.evaluate(() => edgeSweep.rows[0].why));
await page.evaluate(() => {
  const r = edgeSweep.rows[0]; Object.assign(r, r._keep); delete r._keep; renderEdgeSweepPanel();
});
ok((await rows())[0].pick, 'put back');
// and the reason is on the row itself, not in a panel somewhere else
await page.evaluate(() => { edgeSweep.rows[0].notes = ['small for the plan']; renderEdgeSection() });
ok(/small for the plan/.test(await panel()), 'a doubtful read carries its reason on its row');
await page.evaluate(() => { edgeSweep.rows[0].notes = []; renderEdgeSection() });

// ── D. Show draws it over its own sheet, with the current edge beside it ─
console.log('D. Show');
const target = (await rows()).findIndex(r => r.corners > 0 && r.page !== 1);
await page.evaluate(i => showEdgeSweepRow(i), target);
await page.waitForFunction(i => edgeSweep.sel === i && state.pdf.current === edgeSweep.rows[i].page,
  target, { timeout: 30000 });
ok(true, 'clicking a row flips to that row\'s own sheet');
ok(await page.evaluate(i => state.activeLevelIdx === edgeSweep.rows[i].levelIdx, target), 'and makes that floor active');
ok(await page.evaluate(i => document.querySelector(`.ed-row[data-edgo="${edgeSweep.rows[i].levelIdx}:${edgeSweep.rows[i].page}"]`).classList.contains('here'), target), 'the row reads as the one on screen');
// it really draws: count the strokes the overlay lays down
const drew = await page.evaluate(() => {
  const calls = []; const p = drawCtx.stroke, f = drawCtx.fillText;
  drawCtx.stroke = function () { calls.push(['stroke', drawCtx.strokeStyle]); return p.apply(this, arguments) };
  drawCtx.fillText = function (t) { calls.push(['text', t]); return f.apply(this, arguments) };
  renderNow();
  drawCtx.stroke = p; drawCtx.fillText = f;
  return calls;
});
ok(drew.some(c => c[0] === 'text' && /PROPOSED FLOOR EDGE/.test(c[1])), 'the proposal is labelled on the plan: '
  + JSON.stringify(drew.filter(c => c[0] === 'text').map(c => c[1]).slice(0, 3)));
ok(drew.some(c => c[0] === 'text' && /nothing there yet/.test(c[1])), 'and says there is nothing under it yet');
// Esc peels the drawing first, the review second
ok(await page.evaluate(() => escapeOnce({}) === 'edgesweeppreview' && edgeSweep && edgeSweep.sel === -1),
  'Esc takes the drawing off the plan first');
ok(await page.evaluate(() => escapeOnce({}) === 'edgesweep' && edgeSweep === null), 'and then closes the review');
ok(!/Use this/.test(await panel()), 'and the reads go off the rows with it');
ok(JSON.stringify(await nEdges()) === JSON.stringify(before), 'still nothing written: ' + JSON.stringify(await nEdges()));

// ── E. Apply writes one edge per ticked sheet, under one undo ───────────
console.log('E. Apply');
await page.evaluate(() => { runEdgeSweep(); });
await page.waitForFunction(() => edgeSweep && !edgeSweep.running, null, { timeout: 120000 });
const want = (await rows()).filter(r => r.pick).length;
ok(want >= 4, want + ' rows ticked to apply');
const d0 = await page.evaluate(() => history.depth());
await page.evaluate(() => edgeSweepUseAll());   // the engine's bulk write; the UI walks the queue instead (UI-35)
await page.waitForFunction(() => !edgeSweep || !edgeSweep.rows.some(r => r.polygon), null, { timeout: 10000 });
const after = await nEdges();
ok(after.filter(n => n === 1).length === want, `one floor edge on each of the ${want} ticked floors: ` + JSON.stringify(after));
ok(after.every(n => n <= 1), 'never two on one floor');
ok(await page.evaluate(() => state.levels.every(l => levelEdges(l).every(z => z.kind === 'edge' && z.detected))),
  'each is a Floor edge shape, marked as detected');
ok(await page.evaluate(() => state.levels.every(l => levelEdges(l).every(z => z.page === l.pdfPage))),
  'and carries the sheet it was read from');
ok(await page.evaluate(() => history.depth()) === d0 + 1, 'the whole sweep is ONE undo entry');
// the row can no longer contradict the list above it — there is only one list
ok(!/no floor edge yet/.test(await panel()), 'no row still claims there is no edge: ' + (await panel()).slice(0, 120));
ok(/drawn ·/.test(await panel()), 'they read as drawn, waiting to be confirmed');
await page.evaluate(() => history.undo());
ok(JSON.stringify(await nEdges()) === JSON.stringify(before), 'one Ctrl+Z puts every one of them back: ' + JSON.stringify(await nEdges()));
await page.evaluate(() => history.redo());
ok(JSON.stringify(await nEdges()) === JSON.stringify(after), 'and redo brings them back');
ok(await page.evaluate(() => state.results === null), 'the answer is stale, so it will be solved again');

// ── F. a re-issued drawing set: what changes, and Redetect ──────────────
console.log('F. the set is re-issued');
// only one floor bound now, so this is one sheet's read, not five
await page.evaluate(() => {
  const keep = state.levels.findIndex(l => l.name === '3');
  state.levels.forEach((l, i) => { if (i !== keep) { l._page = l.pdfPage; l.pdfPage = null } });
  const lv = state.levels[keep];
  state.activeLevelIdx = keep;
  // pretend the edge on file came from the old set: pull it in by 30 ft on
  // the building's east side, and leave a drawn area out beyond the new one
  const e = levelEdges(lv)[0];
  e._orig = e.polygon.map(p => ({ x: p.x, y: p.y }));
  const maxX = Math.max(...e.polygon.map(p => p.x));
  const ftPerPx = Math.hypot(lv.alignment.transform[0], lv.alignment.transform[2]);
  e.polygon = e.polygon.map(p => ({ x: p.x > maxX - 10 ? p.x - 30 / ftPerPx : p.x, y: p.y }));
  zonesOf(lv, 'loading').push({ id: sid(), page: lv.pdfPage,
    polygon: [{ x: maxX - 20, y: 300 }, { x: maxX + 400, y: 300 }, { x: maxX + 400, y: 500 }, { x: maxX - 20, y: 500 }],
    capacityPSF: 50, mark: 'X', label: 'off the slab', colorIdx: 0 });
  renderSidebar();
});
await page.evaluate(() => { runEdgeSweep(); });
await page.waitForFunction(() => edgeSweep && !edgeSweep.running, null, { timeout: 60000 });
const one = await rows();
ok(one.length === 1, 'only the bound sheet is read: ' + JSON.stringify(one.map(r => [r.name, r.page])));
ok(one[0].had, 'the row knows this floor already has an edge');
const txt = await panel();
ok(/re-read/.test(txt), 'the row reads as a re-read against what is there: ' + txt.slice(txt.indexOf('re-read') - 30, txt.indexOf('re-read') + 60));
ok(/replaces the current edge/.test(txt), 'and leads with what it does');
const chg = await page.evaluate(() => edgeChangeText(edgeSweep.rows[0]).replace(/<[^>]*>/g, ''));
ok(/\d[\d.]*k? SF → \d[\d.]*k? SF/.test(chg), 'the area either side of the change: ' + chg);
ok(/\(\+/.test(chg), 'and which way it went');
ok(/outline moves up to \d+'-/.test(chg), 'how far the outline moves, in feet and inches: '
  + (chg.match(/outline moves up to [^·]*/) || [''])[0]);
const shiftFt = await page.evaluate(() => edgeSweep.rows[0].shiftFt);
ok(shiftFt > 25 && shiftFt < 35, 'which is the 30 ft the old outline was short by: ' + shiftFt.toFixed(1));
ok(await page.evaluate(() => edgeSweep.rows[0].areaAfter > edgeSweep.rows[0].areaBefore),
  'the new outline is the larger one');
const out0 = await page.evaluate(() => edgeSweep.rows[0].outside);
ok(out0 > 0 && /\d+ drawn areas? would fall outside it/.test(chg), 'and how many drawn areas it would leave out: '
  + (chg.match(/\d+ drawn areas? would fall outside it/) || [''])[0]);
ok(/lm-warn/.test(await page.evaluate(() => edgeChangeText(edgeSweep.rows[0]))), 'in the warning colour');
// the count itself, on a floor whose every shape is placed by hand: one area
// inside the new outline, one beyond it
const counted = await page.evaluate(() => {
  const SQ = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const lv = { id: 'T', name: 'T', pdfPage: 9, zones: [], slabZones: [],
    alignment: { transform: [1, 0, 0, 1, 0, 0] } };
  const New = SQ(0, 0, 100, 100);
  lv.slabZones.push({ id: 'e', page: 9, kind: 'edge', polygon: SQ(0, 0, 60, 100) });
  lv.zones.push({ id: 'a', page: 9, polygon: SQ(10, 10, 30, 30) });     // inside
  const before = edgeChangeVs(lv, 9, New, lv.alignment.transform).outside;
  lv.zones.push({ id: 'b', page: 9, polygon: SQ(120, 10, 150, 30) });   // beyond it
  const after = edgeChangeVs(lv, 9, New, lv.alignment.transform).outside;
  lv.slabZones.push({ id: 'o', page: 9, kind: 'opening', polygon: SQ(200, 10, 220, 30) });
  const withSlab = edgeChangeVs(lv, 9, New, lv.alignment.transform).outside;
  lv.zones.push({ id: 'c', page: 8, polygon: SQ(300, 10, 330, 30) });   // another sheet
  const otherSheet = edgeChangeVs(lv, 9, New, lv.alignment.transform).outside;
  const grew = edgeChangeVs(lv, 9, New, lv.alignment.transform);
  return { before, after, withSlab, otherSheet, had: grew.had,
    areaBefore: grew.areaBefore, areaAfter: grew.areaAfter, shiftFt: grew.shiftFt,
    none: edgeChangeText({ had: false }) };
});
ok(counted.before === 0, 'an area inside the new outline is not counted: ' + counted.before);
ok(counted.after === 1, 'one beyond it is: ' + counted.after);
ok(counted.withSlab === 2, 'a slab shape counts the same as a loading area: ' + counted.withSlab);
ok(counted.otherSheet === 2, 'and a shape on another sheet is none of this outline\'s business: ' + counted.otherSheet);
ok(counted.areaBefore === 6000 && counted.areaAfter === 10000,
  'the areas either side are the real ones: ' + JSON.stringify([counted.areaBefore, counted.areaAfter]));
ok(Math.abs(counted.shiftFt - 40) < 0.001, 'and the shift is the furthest the outline moves, not the average: ' + counted.shiftFt);
ok(counted.none === 'no floor edge on this sheet yet', 'where there is no edge yet the row simply says so: ' + counted.none);

// Redetect re-reads that one sheet on its own
console.log('   Redetect');
await page.evaluate(() => { edgeSweep.rows[0].polygon = null; edgeSweep.rows[0].corners = 0; edgeSweep.rows[0].err = 'cleared'; renderEdgeSection() });
ok(/could not be read/.test(await panel()), 'a sheet that would not read says so on its row');
await page.click(`button[data-esredo="${await rowKey(0)}"]`);
await page.waitForFunction(() => edgeSweep && edgeSweep.rows[0].polygon, null, { timeout: 60000 });
ok((await rows())[0].corners > 3, 'Redo reads that sheet again on its own: ' + (await rows())[0].corners + ' corners');
await page.waitForFunction(() => typeof edgeQueueActive === 'function' && edgeQueueActive() && edgeProposal && edgeProposal.queue, null, { timeout: 10000 }).catch(() => {});
ok(await page.evaluate(() => edgeQueueActive() && edgeQueueRow() === edgeSweep.rows[0] && edgeProposal && edgeProposal.queue), 'and walks it in the bar over the plan (UI-35): ' + await page.evaluate(() => JSON.stringify({q: !!edgeQueue, i: edgeQueue && edgeQueue.i, same: edgeQueue && edgeQueueRow() === edgeSweep.rows[0], ep: !!edgeProposal, epq: edgeProposal && edgeProposal.queue, cands: edgeSweep.rows[0].cands && edgeSweep.rows[0].cands.length, mode: edgeQueue && edgeQueue.mode})));
await page.evaluate(() => { edgeQueueClose(); });
ok(await page.evaluate(() => state.levels.filter(l => levelEdges(l).length).length) === want,
  'while still writing nothing — the job is as Apply left it');

// ── G. the guards ───────────────────────────────────────────────────────
console.log('G. guards');
await page.evaluate(() => { edgeSweep = null; renderEdgeSweepPanel() });
await page.evaluate(() => { state.levels.forEach(l => { if (l._page) { l.pdfPage = l._page; delete l._page } }) });
const noPdf = await page.evaluate(async () => {
  const d = state.pdf.doc; state.pdf.doc = null;
  const r = await runEdgeSweep(); state.pdf.doc = d;
  const t = document.querySelectorAll('.toast'); return { r, t: t.length ? t[t.length - 1].textContent : '' };
});
ok(noPdf.r === null && /vector PDF/.test(noPdf.t), 'on an image set it says what it needs instead: ' + JSON.stringify(noPdf.t));
const noSheets = await page.evaluate(async () => {
  const keep = state.levels.map(l => l.pdfPage);
  state.levels.forEach(l => l.pdfPage = null);
  const r = await runEdgeSweep();
  state.levels.forEach((l, i) => l.pdfPage = keep[i]);
  const t = document.querySelectorAll('.toast'); return { r, t: t.length ? t[t.length - 1].textContent : '' };
});
ok(noSheets.r === null && /Levels step/.test(noSheets.t), 'with no sheet bound it sends you to the Levels step: ' + JSON.stringify(noSheets.t));
const nothingRead = await page.evaluate(() => {
  edgeSweep = { rows: [{ levelIdx: 0, page: 2, polygon: null, err: 'nothing' }], sel: -1, running: false, done: 1 };
  const n = edgeSweepUseAll();
  const t = document.querySelectorAll('.toast');
  const r = { n, t: t.length ? t[t.length - 1].textContent : '', still: !!edgeSweep };
  edgeSweep = null; renderEdgeSection(); return r;
});
ok(nothingRead.n === 0 && /Nothing read to use/.test(nothingRead.t) && nothingRead.still,
  'Use all with nothing readable does nothing and keeps the row: ' + JSON.stringify(nothingRead));
// ── H. one row, one sheet: Use this and Keep current ────────────────────
console.log('H. the row is the choice');
{
  const st = await page.evaluate(async () => {
    state.levels.forEach(l => { if (l._page) { l.pdfPage = l._page; delete l._page } });
    // confirm what is drawn, so the top action is free to count the reads
    edgeConfirmAll();
    const lv = state.levels.find(l => levelEdges(l).length);
    const li = state.levels.indexOf(lv), pg = levelEdges(lv)[0].page;
    // a second sheet with no edge on it, so one read is a proposal and the
    // other is a first read
    const other = state.levels.findIndex((l, i) => i !== li && l.pdfPage != null);
    const ol = state.levels[other];
    zonesOf(ol, 'slab').splice(0, zonesOf(ol, 'slab').length);
    const op = ol.pdfPage;
    // one read that would replace an edge, one for a sheet with none
    const SQ = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    edgeSweep = { rows: [
      { levelIdx: li, page: pg, name: lv.name, polygon: SQ(50, 50, 950, 650), corners: 4, notes: [], had: true },
      { levelIdx: other, page: op, name: state.levels[other].name, polygon: SQ(60, 60, 900, 600), corners: 4, notes: [], had: false }
    ], sel: -1, running: false, done: 2 };
    renderEdgeSection();
    return { li, pg, other, op, text: document.getElementById('edgeRows').innerText.replace(/\s+/g, ' ') };
  });
  ok(/re-read/.test(st.text) && /Keep current/.test(st.text), 'a read on a sheet that has an edge is a re-read with Keep current: ' + st.text.slice(0, 120));
  ok(/Review 2 reads/.test(await page.$eval('#edgeReviewAll', b => b.textContent)), 'both are counted at the top');
  const d1 = await page.evaluate(() => history.depth());
  await page.evaluate(([o, op]) => edgeSweepUse(o, op), [st.other, st.op]);
  const used = await page.evaluate(([li, pg, o]) => ({
    wrote: levelEdges(state.levels[o]).length,
    gone: !edgeSweep.rows.some(r => r.levelIdx === o),
    left: edgeSweep.rows.length, depth: history.depth()
  }), [st.li, st.pg, st.other]);
  ok(used.wrote === 1 && used.gone && used.left === 1, 'Use this writes that one sheet and takes its read off the row: ' + JSON.stringify(used));
  ok(used.depth === d1 + 1, 'one undo entry for it');
  const kept = await page.evaluate(() => { const lv = state.levels[edgeSweep.rows[0].levelIdx];
    return { before: levelEdges(lv)[0].polygon.length } });
  await page.click(`button[data-esdrop="${st.li}:${st.pg}"]`);
  const after2 = await page.evaluate(([li]) => ({ still: levelEdges(state.levels[li]).length, sweep: edgeSweep }), [st.li]);
  ok(after2.still === 1 && after2.sweep === null, 'Keep current drops the read and writes nothing: ' + JSON.stringify([after2.still, after2.sweep, kept.before]));
  await page.evaluate(() => history.undo());
}

// a new job clears the review
await page.evaluate(() => { edgeSweep = { rows: [], sel: -1, running: false, done: 0 }; });
await page.evaluate(() => startNewJob());
ok(await page.evaluate(() => edgeSweep === null), 'starting a new job clears the review');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

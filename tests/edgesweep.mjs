// THE FLOOR EDGE, READ FOR THE WHOLE JOB AND CONFIRMED (Adolfo, Sep 14, 2026):
// "can we have the floor edge be automatically done and then confirmed by the
//  user? then the option to redraw floor edge in case the floorplan gets
//  updated and changed in an updated drawing set?"
//
// One button reads every sheet the job is bound to and lays the outlines out
// as a review list. Nothing is written until Apply. A doubtful read arrives
// unticked with the reason on it. Clicking Show draws that outline over its
// own sheet with the edge it would replace beside it in grey. Redetect
// re-reads one sheet — the answer to a re-issued drawing set — and where a
// floor already has an edge the row says WHAT CHANGES: the area either side,
// how far the outline moves, and how many drawn areas would fall outside it.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';
import fs from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
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
  setStep('edge'); setLayer('slab'); renderSidebar();
}, [pdf.toString('base64'), job]);

const panel = () => page.$eval('#edgeSweepPanel', e => e.innerText.replace(/\s+/g, ' '));
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
ok(await page.evaluate(() => document.getElementById('edgeSweepPanel').closest('.step-panel').dataset.step === 'edge'), 'and so is its review panel');
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
    panel: document.getElementById('edgeSweepPanel').innerText.replace(/\s+/g, ' '),
    btn: detectBtn() ? detectBtn().textContent : '' };
});
ok(t0.running && t0.rows === 5, 'the review is up before the first sheet is read: ' + JSON.stringify([t0.running, t0.rows]));
ok(/reading 1 of 5/.test(t0.panel), 'it says which sheet it is on: ' + t0.panel.slice(0, 90));
ok(/reading…/.test(t0.panel), 'and the rows not read yet say so');
await page.waitForFunction(() => edgeSweep && !edgeSweep.running, null, { timeout: 180000 });
ok(/Reading sheet \d+ of 5/.test(t0.btn), 'the button that started it shows the progress: ' + t0.btn);
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
ok(/nothing is written until you apply/i.test(P), 'the head says so out loud: ' + P.slice(0, 90));
ok(/no floor edge on this sheet yet/.test(P), 'and each row says there is nothing there yet');
ok(/Use \d floor edges?/.test(P), 'the Apply button counts what is ticked: ' + (P.match(/Use \d+ floor edges?/) || [''])[0]);

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
// Tick all readable overrides it by hand
await page.evaluate(() => { edgeSweep.rows.forEach(r => r.pick = false); renderEdgeSweepPanel(); });
await page.click('#esAll');
ok((await rows()).filter(r => r.corners > 0).every(r => r.pick), 'Tick all readable ticks every row that read');
ok((await rows()).filter(r => !r.corners).every(r => !r.pick), 'and cannot tick one that did not');

// ── D. Show draws it over its own sheet, with the current edge beside it ─
console.log('D. Show');
const target = (await rows()).findIndex(r => r.corners > 0 && r.page !== 1);
await page.evaluate(i => showEdgeSweepRow(i), target);
await page.waitForFunction(i => edgeSweep.sel === i && state.pdf.current === edgeSweep.rows[i].page,
  target, { timeout: 30000 });
ok(true, 'clicking a row flips to that row\'s own sheet');
ok(await page.evaluate(i => state.activeLevelIdx === edgeSweep.rows[i].levelIdx, target), 'and makes that floor active');
ok(/Showing/.test(await panel()), 'the row says it is the one being shown');
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
ok(await page.$eval('#edgeSweepPanel', e => e.style.display === 'none'), 'the panel goes with it');
ok(JSON.stringify(await nEdges()) === JSON.stringify(before), 'still nothing written: ' + JSON.stringify(await nEdges()));

// ── E. Apply writes one edge per ticked sheet, under one undo ───────────
console.log('E. Apply');
await page.evaluate(() => { runEdgeSweep(); });
await page.waitForFunction(() => edgeSweep && !edgeSweep.running, null, { timeout: 120000 });
const want = (await rows()).filter(r => r.pick).length;
ok(want >= 4, want + ' rows ticked to apply');
const d0 = await page.evaluate(() => history.depth());
await page.click('#esApply');
await page.waitForFunction(() => edgeSweep === null, null, { timeout: 10000 });
const after = await nEdges();
ok(after.filter(n => n === 1).length === want, `one floor edge on each of the ${want} ticked floors: ` + JSON.stringify(after));
ok(after.every(n => n <= 1), 'never two on one floor');
ok(await page.evaluate(() => state.levels.every(l => levelEdges(l).every(z => z.kind === 'edge' && z.detected))),
  'each is a Floor edge shape, marked as detected');
ok(await page.evaluate(() => state.levels.every(l => levelEdges(l).every(z => z.page === l.pdfPage))),
  'and carries the sheet it was read from');
ok(await page.evaluate(() => history.depth()) === d0 + 1, 'the whole sweep is ONE undo entry');
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
ok(/has an edge already/.test(txt), 'the row is flagged: ' + (txt.match(/\S+ [^·]*has an edge already/) || [''])[0]);
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
await page.evaluate(() => { edgeSweep.rows[0].polygon = null; edgeSweep.rows[0].corners = 0; renderEdgeSweepPanel() });
ok(!/corners/.test(await panel()), 'cleared for the test');
await page.click('button[data-esredo="0"]');
await page.waitForFunction(() => edgeSweep && edgeSweep.rows[0].polygon, null, { timeout: 60000 });
ok((await rows())[0].corners > 3, 'Redetect reads that sheet again on its own: ' + (await rows())[0].corners + ' corners');
ok(await page.evaluate(() => edgeSweep.sel === 0), 'and shows what it found');
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
const nothingTicked = await page.evaluate(() => {
  edgeSweep = { rows: [{ levelIdx: 0, page: 2, polygon: null }], sel: -1, running: false, done: 1 };
  const n = applyEdgeSweep();
  const t = document.querySelectorAll('.toast');
  const r = { n, t: t.length ? t[t.length - 1].textContent : '', still: !!edgeSweep };
  edgeSweep = null; renderEdgeSweepPanel(); return r;
});
ok(nothingTicked.n === 0 && /Nothing ticked/.test(nothingTicked.t) && nothingTicked.still,
  'Apply with nothing ticked does nothing and stays open: ' + JSON.stringify(nothingTicked));
// a new job clears the review
await page.evaluate(() => { edgeSweep = { rows: [], sel: -1, running: false, done: 0 }; });
await page.evaluate(() => startNewJob());
ok(await page.evaluate(() => edgeSweep === null), 'starting a new job clears the review');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

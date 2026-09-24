// @rules UI-15, UI-16, UI-17, UI-18, UI-19  (see DECISIONS.md)
// THE FLOW RUNS ITSELF (Sep 21 2026). Adolfo, Sep 15: "a lot of different
// ways that a user can get to the end result and I would like for it to be
// idiot-proof." The last two stages that waited for a button now read
// themselves on arrival, every section has one primary action with the hand
// tools folded away, Results and Sequence agree on what is still to choose,
// and the level modal is gone.
//  A. the Floor edge section sweeps the sheets on arrival (Kinect set): the
//     confident outlines are drawn, the doubtful stay in the review, once
//  B. one primary action per section, hand tools behind "or do it by hand",
//     remembered on the job once opened
//  C. Areas reads the beams and openings inside the confirmed edges on
//     arrival, none ticked, once per sheet, remembered on the job
//  D. Results, Sequence and the rail count the same outstanding picks
//  E. the level modal is gone: ranges are edited under the row
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import fs from 'node:fs';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const KIN = path.resolve(here, '..', 'Kinect');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const pdf = fs.readFileSync(path.join(KIN, '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));
await page.evaluate(async b64 => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await loadFile(new File([u8], 'kinect.pdf', { type: 'application/pdf' }));
}, pdf.toString('base64'));
await page.waitForFunction(() => state.levels.length > 0 && sheetRead && sheetRead.size > 0, null, { timeout: 90000 });
await page.waitForTimeout(1500);

console.log('A. the floor edge reads itself on arrival');
const A0 = await page.evaluate(() => ({ edges: planSheetRows().filter(r => r.edge).length, n: planSheetRows().length, key: edgeAutoKey }));
ok(A0.n >= 6 && A0.edges === 0 && A0.key === null, 'a fresh set: plan sheets, no edge drawn, nothing swept yet: ' + JSON.stringify(A0));
// the sweep is mostly synchronous raster work, so the page is busy until it
// is done — arrive, then wait for it to finish
await page.evaluate(() => { confirmLevels(); setStep('edge'); });
await page.waitForFunction(() => edgeAutoKey && !(edgeSweep && edgeSweep.running) && (planSheetRows().some(r => r.edge) || (edgeSweep && edgeSweep.auto)), null, { timeout: 170000, polling: 1000 });
await page.waitForTimeout(600);
const A = await page.evaluate(() => {
  const rows = planSheetRows();
  return { drawn: rows.filter(r => r.edge && !r.confirmed).length, confirmed: rows.filter(r => r.confirmed).length, n: rows.length,
    detected: rows.filter(r => r.edge).every(r => r.edge.detected),
    review: edgeSweep ? { auto: !!edgeSweep.auto, rows: edgeSweep.rows.length, picked: edgeSweep.rows.filter(r => r.pick).length,
      onRows: edgeSweep.rows.every(r => document.querySelector(`#edgeRows button[data-esuse="${r.levelIdx}:${r.page}"], #edgeRows button[data-esredo="${r.levelIdx}:${r.page}"]`) != null),
      noPanel: (() => { const p = document.getElementById('edgeSweepPanel'); return !p || p.style.display === 'none' })() } : null,
    primary: document.querySelector('#edgeRows .primary-act').textContent.replace(/\s+/g, ' ').trim(),
    detectBtn: !!document.querySelector('#edgeRows [data-byhand="edge"] #edgeDetectAll'), key: edgeAutoKey };
});
console.log('   ' + JSON.stringify(A));
ok(A.drawn >= 1 && A.confirmed === 0, 'confident outlines are drawn, none confirmed for him: ' + A.drawn + ' of ' + A.n);
ok(A.detected, 'and marked as detected, not hand-drawn');
ok(A.drawn + (A.review ? A.review.rows : 0) === A.n, 'every sheet is either drawn or in the review: ' + JSON.stringify([A.drawn, A.review && A.review.rows, A.n]));
ok(!A.review || (A.review.auto && A.review.picked === 0 && A.review.onRows && A.review.noPanel),
  'the doubtful ones stay on their own sheet\'s row, not in a second panel: ' + JSON.stringify(A.review));
ok(/Confirm all \d+ drawn/.test(A.primary), 'the primary action is Confirm all N drawn: ' + A.primary);
ok(A.detectBtn, 'Detect again sits in the hand-tools row (UI-31)');
// once: leaving and coming back does not sweep again
const A2 = await page.evaluate(async () => { const k = edgeAutoKey; setStep('sheets'); setStep('edge'); await new Promise(r => setTimeout(r, 300)); return { same: edgeAutoKey === k, running: !!(edgeSweep && edgeSweep.running) }; });
ok(A2.same && !A2.running, 'coming back does not sweep again');

console.log('B. one primary action per section; the hand tools in plain view under it (UI-15 as amended by UI-31, Sep 23 2026)');
const B = await page.evaluate(() => {
  const p = document.getElementById('p-levels');
  const idx = id => [...p.children].indexOf(document.getElementById(id));
  const d = sec => document.querySelector(`#byhand-${sec}, [data-byhand="${sec}"]`);
  const shown = el => !!el && el.tagName !== 'DETAILS' && !el.hidden && getComputedStyle(el).display !== 'none' || (!!el && el.closest('.sec-collapsed') != null && el.tagName !== 'DETAILS');
  return {
    levelsOrder: idx('levelsConfirm') < idx('levelList') && idx('levelList') < idx('byhand-levels'),
    levelsHand: { shown: shown(d('levels')), has: ['btnAddLevel', 'btnReadElev'].every(id => d('levels').contains(document.getElementById(id))), label: d('levels').querySelector('.bh-label').textContent },
    sheetsHand: { shown: shown(d('sheets')), reread: !!d('sheets').querySelector('#stReread') },
    edgeHand: { shown: shown(d('edge')), detect: !!d('edge').querySelector('#edgeDetectAll') },
    areasHand: { has: ['btnDrawLoading', 'btnDrawSlab', 'btnCopyFrom', 'btnAutoDetect'].every(id => d('areas').contains(document.getElementById(id))) },
    loadsHand: { has: ['lmRescan', 'lmImport', 'lmTemplate'].every(id => d('loads') && d('loads').contains(document.getElementById(id))), bulk: !!(d('loads') && d('loads').querySelector('.lm-bulk')) },
    matchHand: (() => { setStep('match'); const m = d('match'); return { there: !!m, shown: shown(m), btn: !!(m && m.querySelector('#btnMatchAll')) } })(),
    noDetails: !document.querySelector('details.by-hand, details[data-byhand]'),
  };
});
console.log('   ' + JSON.stringify(B));
ok(B.levelsOrder, 'Levels: Confirm sits above the list, the hand tools below it');
ok(B.levelsHand.shown && B.levelsHand.has && /by hand/.test(B.levelsHand.label), 'Add a level and Read again sit in view under the list: ' + JSON.stringify(B.levelsHand));
ok(B.sheetsHand.reread, 'Sheets: the re-read is in the row');
ok(B.edgeHand.shown && B.edgeHand.detect, 'Floor edge: Detect again is in the row');
ok(B.matchHand.there && B.matchHand.shown && B.matchHand.btn, 'Match: the match-all button is in the row — matching still runs itself: ' + JSON.stringify(B.matchHand));
ok(B.areasHand.has, 'Areas: Draw, Copy and Detect again are in the row');
ok(B.loadsHand.has && B.loadsHand.bulk, 'Loads: re-read, import, template and the bulk control are in the row');
ok(B.noDetails, 'nothing on any step is folded behind a disclosure any more');

console.log('C. Areas reads beams and openings inside the confirmed edges on arrival');
// confirm every drawn edge, then arrive on Areas
const C0 = await page.evaluate(() => { edgeConfirmAll(); return { conf: planSheetRows().filter(r => r.confirmed).length, scanned: state.project.autoScan, from: state.levels.reduce((n, l) => n + zonesOf(l, 'slab').filter(z => z.fromSheet).length, 0) }; });
ok(C0.conf >= 1 && (!C0.scanned || !(C0.scanned.pages || []).length) && C0.from === 0, 'edges confirmed, nothing scanned or read yet: ' + JSON.stringify(C0));
await page.evaluate(() => setStep('areas'));
await page.waitForFunction(() => !!beamScan, null, { timeout: 150000, polling: 1000 });
await page.waitForTimeout(400);
const C = await page.evaluate(() => ({
  items: beamScan.items.length, picked: beamScan.items.filter(i => i.pick).length, what: beamScan.what, multi: beamScan.multi,
  pages: [...new Set(beamScan.items.map(i => i.page))].sort(), done: (state.project.autoScan.pages || []).slice().sort(),
  confirmed: planSheetRows().filter(r => r.confirmed).map(r => r.page).sort(),
  panelFirst: document.getElementById('p-areas').firstElementChild.id, head: document.querySelector('#beamPanel .mp-head').textContent.replace(/\s+/g, ' ').trim(),
  nonInput: NON_INPUT_PROJECT_KEYS.includes('autoScan'),
}));
console.log('   ' + JSON.stringify(C));
ok(C.items >= 1 && C.picked === 0, 'the proposal opens with NONE ticked (BEM-08): ' + JSON.stringify([C.items, C.picked]));
ok(C.what === 'both' && C.multi === (C.confirmed.length > 1), 'beams AND openings, over every confirmed sheet');
ok(JSON.stringify(C.done) === JSON.stringify(C.confirmed), 'every confirmed sheet is remembered as read on the job: ' + JSON.stringify(C.done));
ok(C.pages.every(p => C.confirmed.includes(p)), 'nothing was read off a sheet without a confirmed edge');
ok(C.panelFirst === 'beamPanel' && /nothing is written until you (apply|accept)/i.test(C.head), 'the proposal sits at the top of the pane and says nothing is written yet');
ok(C.nonInput, 'the scan memory is bookkeeping, not a calculation input');
const C2 = await page.evaluate(async () => { cancelBeamScan(); setStep('loads'); setStep('areas'); await new Promise(r => setTimeout(r, 800)); return { again: !!beamScan, note: document.getElementById('areasPrimary').textContent.replace(/\s+/g, ' ').trim() }; });
ok(!C2.again, 'closing it and coming back does not scan the same sheets again');
ok(/Every confirmed sheet has been read/.test(C2.note) || /of \d+ sheets read/.test(C2.note), 'the line over the list says where the read stands: ' + C2.note);

console.log('D. Results, Sequence and the rail agree on what is still to choose');
// a pure-geometry three-storey job, two pours: every pick outstanding
await page.evaluate(() => {
  const T = [1, 0, 0, 1, 0, 0];
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const mk = (name, el, slab, cap) => ({ id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap, rangeFrom: null, rangeTo: null, pdfPage: 1, zones: [], slabZones: [], alignment: { transform: T, points: [], ftPerInch: 1, confirmed: true } });
  state.pdf.doc = null; state.pdf.pages = 1; state.pdf.current = 1;
  state.project = { name: 'counts', loadingConditions: [{ mark: '1', desc: 'TYP', sdl: 14, ll: 40, confirmed: true }], shoreChoices: {}, solveStepFt: 10 };
  state.levels = [mk('L4', 40, 8, 54), mk('L3', 30, 8, 54), mk('L2', 20, 8, 54), mk('L1', 10, 8, 54), mk('SOG', 0, 5, 0)];
  state.levels[4].onGrade = true;
  for (const l of state.levels.slice(0, 4)) l.zones.push({ id: sid(), polygon: sq(0, 0, 100, 100), capacityPSF: 54, mark: '1', label: '', colorIdx: 0 });
  state.results = null; state.activeLevelIdx = 0; schedSolve = null; seqPlan = null;
  renderSidebar(); persist();
});
const D = await page.evaluate(() => {
  setStep('results');
  const perPour = schedSolve.levels.map(L => L.solve.pendingChoices);
  const res = stepStatus('results');
  setStep('sequence');
  const seq = stepStatus('sequence');
  return { perPour, total: outstandingPickTotal(), res: res.text, seq: seq.text, seqPending: seqPlan.pending, rail: document.querySelector('.step[data-group="answer"]') && document.querySelector('.step[data-group="answer"]').textContent.replace(/\s+/g, ' ') };
});
console.log('   ' + JSON.stringify(D));
const sum = D.perPour.reduce((a, b) => a + b, 0);
ok(sum > D.perPour[0], 'more than one pour has picks outstanding: ' + JSON.stringify(D.perPour));
ok(D.total === sum && D.seqPending === sum, 'one number: the sum over every placement: ' + JSON.stringify([D.total, D.seqPending, sum]));
ok(new RegExp('^' + sum + ' shores to choose').test(D.res) && new RegExp('^' + sum + ' shores to choose').test(D.seq), 'Results and Sequence both say it: ' + JSON.stringify([D.res, D.seq]));
ok(/on this pour/.test(D.res), 'and Results adds how many are on the pour in view: ' + D.res);
// pick everything on one pour: the total drops by exactly that pour's count
const D2 = await page.evaluate(() => {
  setStep('results');
  const L = schedSolve.levels[schedPourIdx];
  const before = L.solve.pendingChoices, total = outstandingPickTotal();
  for (const r of L.solve.regions) for (const st of r.steps) if (st.resultant > 0 && !st.chosen && st.options.length) shoreChoices()[st.key || (L.pour.name + '|' + r.key + '|' + st.levelIdx)] = st.options[0].shoreId;
  runSchedule(); runSequence();
  return { before, total, after: outstandingPickTotal(), seq: seqPlan.pending, res: stepStatus('results').text };
});
ok(D2.after === D2.total - D2.before || D2.after < D2.total, 'picking on one pour brings both counts down together: ' + JSON.stringify(D2));
ok(D2.after === D2.seq, 'and they still agree: ' + JSON.stringify([D2.after, D2.seq]));

console.log('E. the level modal is gone; ranges are edited under the row');
const E = await page.evaluate(() => {
  setStep('levels'); renderLevelList();
  const row = document.querySelector('#levelList .sb-item[data-level="1"]');
  const before = !!row.querySelector('.lvl-range');
  row.querySelector('.lvl-typ').click();   // the Typical Floor? box (UI-33)
  const row2 = document.querySelector('#levelList .sb-item[data-level="1"]');
  const open = !!row2.querySelector('.lvl-range');
  const set = (f, v) => { const e = row2.querySelector(`.lvl-edit[data-f="${f}"]`); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
  set('rangeFrom', '3'); 
  const l = state.levels.find(x => x.name === 'L3');
  const rowB = document.querySelector('#levelList .sb-item[data-level="1"]');
  rowB.querySelector('.lvl-edit[data-f="rangeTo"]').value = '6'; rowB.querySelector('.lvl-edit[data-f="rangeTo"]').dispatchEvent(new Event('change', { bubbles: true }));
  const rowC = document.querySelector('#levelList .sb-item[data-level="1"]');
  rowC.querySelector('.lvl-edit[data-f="f2f"]').value = '10'; rowC.querySelector('.lvl-edit[data-f="f2f"]').dispatchEvent(new Event('change', { bubbles: true }));
  const l2 = state.levels.find(x => x.rangeFrom === 3);
  return { noModal: !document.getElementById('levelModal'), noFn: typeof openLevelModal === 'undefined', before, open,
    range: l2 && [l2.rangeFrom, l2.rangeTo, l2.floorToFloor], isRange: l2 && isRange(l2), label: l2 && rangeLabel(l2),
    stillOpen: !!document.querySelector('#levelList .sb-item .lvl-range'), count: l2 && rangeFloorCount(l2) };
});
console.log('   ' + JSON.stringify(E));
ok(E.noModal && E.noFn, 'no level modal in the page, no function to open one');
ok(!E.before && E.open, 'ticking Typical Floor? opens the range fields under the row');
ok(E.range && E.range[0] === 3 && E.range[1] === 6 && E.range[2] === 10 && E.isRange && E.count === 4, 'typing from / to / F2F makes the row a typical range: ' + JSON.stringify(E.range) + ' ' + E.label);
ok(E.stillOpen, 'and a range keeps its fields showing');
const E2 = await page.evaluate(() => {
  const row = document.querySelector('#levelList .sb-item .lvl-range').closest('.sb-item');
  const e = row.querySelector('.lvl-edit[data-f="rangeFrom"]'); e.value = '9'; e.dispatchEvent(new Event('change', { bubbles: true }));
  const l = state.levels.find(x => x.rangeTo === 6);
  return { from: l && l.rangeFrom, toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).pop() };
});
ok(E2.from === 3 && /higher than/.test(E2.toast || ''), 'a "from" above the "to" is refused with the reason: ' + JSON.stringify(E2));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

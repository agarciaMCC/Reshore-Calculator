// @rules RES-02, RES-03  (see DECISIONS.md)
// READING THE RESULTS (Sep 18 2026)
// Adolfo: "we need a much easier way to navigate/interpret results." Chose:
// floor tabs with the plan shaded by pattern, one-line region cards, and a
// Next button through the rows still waiting for a shore.
//
//  A. tabs: Overview + one per floor (per zone) that gets reshoring
//  B. a floor's tab: legend, plan shaded by pattern on that floor's sheet,
//     cards filtered to that zone with that floor's chip active and its row
//     alone in the strip
//  C. one-line cards: folded by default with a chip per floor; the arrow
//     opens one; clicking a card opens it and lights it on the plan
//  D. Next: steps through outstanding rows in order — card open, plan on the
//     floor's sheet, picker focused; a pick shrinks the list and Next moves on
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
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const KIN = path.resolve(here, '..', 'Kinect');
const pdf = fs.readFileSync(path.join(KIN, '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));
const jobFile = fs.existsSync(path.join(KIN, 'kinect4-new.json')) ? 'kinect4-new.json' : 'kinect4.json';
const job = JSON.parse(fs.readFileSync(path.join(KIN, jobFile), 'utf8'));
await page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); if (typeof resetPageTextCache === 'function') resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
  await warmSheetSizes(state.levels.flatMap(l => levelSheets(l).map(s => s.page)));
  setStep('results');
}, [pdf.toString('base64'), job]);
await page.waitForFunction(() => schedSolve && schedSolve.levels.length && schedSolve.levels.every(L => L.solve), null, { timeout: 120000 });

// Level 3 pour (North + South), a shore on most rows so patterns exist, a few left open
const A = await page.evaluate(() => {
  schedPourIdx = schedSolve.levels.findIndex(L => L.pour.name === '3');
  const L = schedSolve.levels[schedPourIdx];
  const rows = bulkRowsFor('pour', L, null);
  const best = bulkCandidates(rows)[0];
  const ch = shoreChoices();
  rows.forEach((r, i) => { if (i % 4 !== 0 && r.options.some(o => String(o.shoreId) === String(best.shoreId))) ch[r.key] = best.shoreId; });
  runSchedule();
  const head = document.getElementById('schedHead');
  const tabs = [...head.querySelectorAll('.rs-tab')].map(b => ({ key: b.dataset.rsf, text: b.textContent.replace(/\s+/g, ' ').trim(), active: b.classList.contains('active') }));
  const floors = resultsTabFloors(L).map(f => [f.key, f.name, f.zone, f.general, f.pending]);
  const cards = [...document.querySelectorAll('#schedBody .sched-region')].map(c => ({ folded: c.classList.contains('folded'), chips: [...c.querySelectorAll('.pat-chip')].map(x => x.textContent.trim()), hasFold: !!c.querySelector('.card-fold') }));
  return { tabs, floors, cards, outstanding: outstandingItems(L).length, next: !!document.getElementById('rsNext') };
});
console.log('   tabs: ' + JSON.stringify(A.tabs.map(t => t.text)));
console.log('A. the tabs');
ok(A.tabs.length === A.floors.length + 1 && A.tabs[0].text === 'All floors' && A.tabs[0].active, 'All floors plus one tab per floor that gets reshoring: ' + JSON.stringify(A.floors));
ok(A.tabs.slice(1).every((t, i) => t.key === A.floors[i][0] && new RegExp('^Under ' + A.floors[i][1]).test(t.text)), 'each tab names its floor (and zone): ' + JSON.stringify(A.tabs.slice(1).map(t => t.text)));
ok(A.tabs.some(t => /North/.test(t.text)) && A.tabs.some(t => /South/.test(t.text)), 'split floors get a tab per zone');
ok(A.tabs.slice(1).some(t => /\d+×\d+/.test(t.text)), 'a tab shows the floor\'s general pattern once shores are chosen');

console.log('C. one-line cards');
ok(A.cards.length > 0 && A.cards.every(c => c.folded && c.hasFold), 'every card starts folded to one line with a fold arrow');
ok(A.cards.every(c => c.chips.length >= 1), 'each card carries a chip per floor: ' + JSON.stringify(A.cards[0].chips));
ok(A.cards.some(c => c.chips.some(t => /\d+×\d+/.test(t))) && A.cards.some(c => c.chips.some(t => /pick a shore/.test(t))), 'chips read the pattern, or "pick a shore" where none is chosen yet');
const C = await page.evaluate(async () => {
  const host = document.getElementById('schedBody');
  const card = host.querySelector('.sched-region');
  const key = card.dataset.card;
  card.querySelector('.card-fold').click();
  const afterFold = host.querySelector(`.sched-region[data-card="${key}"]`);
  const opened = afterFold && !afterFold.classList.contains('folded') && !!afterFold.querySelector('.ra-row');
  const noHl = !state.ui.highlight;
  afterFold.querySelector('.card-fold').click();
  const refolded = host.querySelector(`.sched-region[data-card="${key}"]`).classList.contains('folded');
  // clicking the head itself opens AND lights the region on the plan
  const card2 = host.querySelectorAll('.sched-region')[1];
  const key2 = card2.dataset.card;
  card2.querySelector('.sched-region-head').click();
  await new Promise(r => setTimeout(r, 900));
  const c2 = host.querySelector(`.sched-region[data-card="${key2}"]`);
  return { opened, noHl, refolded, litOpen: c2 && c2.classList.contains('lit') && !c2.classList.contains('folded'), hl: state.ui.highlight && state.ui.highlight.regionKey };
});
ok(C.opened && C.noHl, 'the arrow opens a card (strip visible) without touching the plan');
ok(C.refolded, 'and folds it back');
ok(C.litOpen && C.hl, 'clicking the card head opens it and puts the region on the plan');

console.log('B. a floor\'s tab');
const B = await page.evaluate(async () => {
  const L = schedSolve.levels[schedPourIdx];
  state.ui.highlight = null;
  const f = resultsTabFloors(L).find(x => x.name === '2' && x.zone === 'North') || resultsTabFloors(L)[0];
  document.querySelector(`.rs-tab[data-rsf="${f.key}"]`).click();
  await new Promise(r => setTimeout(r, 1500));
  const head = document.getElementById('schedHead');
  const legend = head.querySelector('.rs-legend');
  const lgItems = legend ? [...legend.querySelectorAll('.lg-item b')].map(b => b.textContent) : [];
  const cards = [...document.querySelectorAll('#schedBody .sched-region[data-card-ri]')];
  const ris = cards.map(c => +c.dataset.cardRi);
  const allOnTab = ris.every(ri => regionOnFloorTab(L.solve.regions[ri], f, L) && stepForFloor(L.solve.regions[ri], f));
  const activeChips = cards.map(c => [...c.querySelectorAll('.pat-chip.active')].map(x => x.textContent.trim()));
  // open one card: its strip is that floor's row alone
  cards[0].querySelector('.card-fold').click();
  const rows = [...document.querySelectorAll('#schedBody .sched-region')[0].querySelectorAll('.ra-row .ra-fl')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
  // the plan: on floor 2's sheet, shaded by pattern
  const lv = state.levels[state.activeLevelIdx];
  const c = document.getElementById('drawCanvas').getContext('2d');
  const fills = new Set(); const f0 = c.fill.bind(c); const t = [];
  c.fill = function () { fills.add(String(this.fillStyle)); return f0.apply(c, arguments) };
  const t0 = c.fillText.bind(c); c.fillText = function (x) { t.push(String(x)); return t0.apply(c, arguments) };
  renderNow(); c.fill = f0; c.fillText = t0;
  const sc = floorPatternScale(L, f);
  const patColours = sc.list.map(e => e.color.toLowerCase());
  const painted = [...fills].map(x => x.toLowerCase());
  return { key: f.key, name: f.name, zone: f.zone, page: state.pdf.current, onFloorSheet: levelHasPage(lv, state.pdf.current) && lv.name === f.name,
    legend: !!legend, lgItems, nCards: cards.length, allOnTab, activeChips: activeChips.filter(a => a.length).length, rows,
    patColours, paintedPat: patColours.filter(pc => painted.includes(pc)).length, labels: t.filter(x => /^\d+×\d+$/.test(x) || /pick shore/.test(x)).length,
    tabActive: document.querySelector('.rs-tab.active').dataset.rsf };
});
console.log('   ' + JSON.stringify({ tab: B.key, page: B.page, legend: B.lgItems, cards: B.nCards, rows: B.rows, painted: B.paintedPat + '/' + B.patColours.length, labels: B.labels }));
ok(B.tabActive === B.key, 'the tab is active: ' + B.tabActive);
ok(B.onFloorSheet, `the plan flipped to ${B.name}'s sheet (sheet ${B.page})`);
ok(B.legend && B.lgItems.some(x => /\d+×\d+/.test(x)), 'a legend of the patterns under this floor: ' + JSON.stringify(B.lgItems));
ok(B.nCards > 0 && B.allOnTab, `the cards are the regions over this floor in this zone (${B.nCards})`);
ok(B.activeChips === B.nCards, 'each card has this floor\'s chip marked active');
ok(B.rows.length === 1 && new RegExp('under ' + B.name).test(B.rows[0]), 'an opened card shows this floor\'s row alone: ' + JSON.stringify(B.rows));
ok(B.paintedPat >= 1, 'the plan is shaded in the legend\'s pattern colors: ' + B.paintedPat + ' of ' + B.patColours.length);
ok(B.labels > 0, 'with the pattern written on the regions that have room: ' + B.labels);

console.log('D. Next through the outstanding rows');
const D = await page.evaluate(async () => {
  const L0 = () => schedSolve.levels[schedPourIdx];      // fresh after every solve
  document.querySelector('.rs-tab[data-rsf=""]').click();
  await new Promise(r => setTimeout(r, 600));
  const items0 = outstandingItems(L0());
  const n0 = items0.length;
  const seq = [];
  for (let k = 0; k < 3; k++) {
    document.getElementById('rsNext').click();
    await new Promise(r => setTimeout(r, 1800));
    const hl = state.ui.highlight;
    const lit = document.querySelector('#schedBody .sched-region.lit');
    const focused = document.activeElement;
    const it = outstandingItems(L0()).find(x => x.ord === state.ui.nextOrd);
    seq.push({ ord: state.ui.nextOrd, key: it && it.key, hlKey: hl && hl.regionKey, litOpen: !!lit && !lit.classList.contains('folded'),
      focusedKey: focused && focused.classList.contains('sched-shore') ? focused.dataset.key : null, page: state.pdf.current, floor: it && it.level.name,
      counter: (document.querySelector('.rs-next-n') || {}).textContent, onSheet: it ? levelHasPage(state.levels.find(l => l.id === (it.level.defId || it.level.id)), state.pdf.current) : false });
  }
  // answer the current one: the list shrinks, Next moves on past it
  const cur = outstandingItems(L0()).find(x => x.ord === state.ui.nextOrd);
  const sel = document.querySelector(`select.sched-shore[data-key="${cur.key}"]`);
  const opt = [...sel.options].find(o => o.value);
  sel.value = opt.value; sel.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 800));
  const n1 = outstandingItems(L0()).length;
  document.getElementById('rsNext').click();
  await new Promise(r => setTimeout(r, 1000));
  const after = outstandingItems(L0()).find(x => x.ord === state.ui.nextOrd);
  return { n0, seq, n1, movedOn: after && after.key !== cur.key };   // past the last one it wraps to the first
});
console.log('   ' + JSON.stringify(D.seq.map(x => [x.floor, x.counter, x.page])));
ok(D.n0 >= 2, 'rows still waiting for a shore: ' + D.n0);
ok(D.seq.every(x => x.key && x.hlKey), 'each Next lands on an outstanding row and lights its region');
ok(D.seq.every(x => x.litOpen), 'the card is open and lit');
ok(D.seq.every(x => x.focusedKey === x.key), 'and the shore picker for that row has focus: ' + JSON.stringify(D.seq.map(x => [x.key, x.focusedKey])));
ok(D.seq.every(x => x.onSheet), 'the plan is on the sheet of the floor being answered');
ok(D.seq[0].ord < D.seq[1].ord && (D.n0 <= 2 || D.seq[1].ord < D.seq[2].ord), 'in reading order (wrapping past the last): ' + JSON.stringify(D.seq.map(x => x.ord)));
ok(/^\d+ of \d+$/.test(D.seq[2].counter), 'with a counter: ' + D.seq[2].counter);
ok(D.n1 === D.n0 - 1 && D.movedOn, 'a pick shrinks the list and Next moves on to another row: ' + JSON.stringify([D.n0, D.n1, D.movedOn]));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

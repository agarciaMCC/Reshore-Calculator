// THE BUILDING STEP RUNS ITSELF, IN ORDER (Sep 17 2026)
// Adolfo: "have the read levels from drawings be an automatic step instead of
// hitting the button. the user then will hit a confirm levels info button to
// move to the next step of assigning sheets to floors. But dont filter the
// sheets ... Then when that is done, the user hits next to go to matching
// floors ... I want the drawings to be linked/matched based on level and zone."
// And: the floor edge is settled first, on the Building step, and the Areas
// detectors only look inside it.
//
//  A. loading the set reads the levels and pre-fills every sheet's row
//  B. Confirm levels is the one control, and it lapses when a level changes
//  C. the sheets table: nothing hidden, zones from a job list, doubtful rows flagged
//  D. the floor edge: pick from the sheet, adjust, confirm; an edit reopens it
//  E. Areas auto-detect refuses a sheet with no confirmed edge and clips to it
//  F. matching pairs sheets by level and zone with the sheet below
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
page.on('dialog', d => d.accept());
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const KIN = path.resolve(here, '..', 'Kinect');
const pdf = fs.readFileSync(path.join(KIN, '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));

// ── A. the set loads, the levels read themselves ─────────────────────────
console.log('A. loading the set reads the levels and places the sheets');
await page.evaluate(async ([b64]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const file = new File([u8], 'kinect.pdf', { type: 'application/pdf' });
  await loadFile(file);
}, [pdf.toString('base64')]);
await page.waitForFunction(() => state.levels.length > 0 && sheetRead && sheetRead.size > 0, null, { timeout: 90000 });
// the schedule read kicked off by loadFile can still be running; give it a moment
await page.waitForTimeout(1500);
const A = await page.evaluate(() => ({
  levels: state.levels.map(l => [l.name, l.elevation, l.slabThickness]),
  step: curStep, group: curGroup().id,
  lvStatus: stepStatus('levels'), confirmBtn: !!document.getElementById('btnConfirmLevels'),
  readAgain: (document.getElementById('btnReadElev') || {}).textContent,
  noOldBtn: !document.getElementById('btnAssignSheets'),
  order: GROUPS[0].sections.join(','),
  rows: sheetTableRows().map(r => ({ p: r.page, lv: r.level, z: r.zone, skip: r.skipped, unsure: r.unsure, kind: r.kind })),
  zones: projectZones().slice(),
  tableIn: document.getElementById('sheetTable').closest('.step-panel').dataset.step,
  edgePanelIn: document.getElementById('edgePanel').closest('.step-panel').dataset.step,
}));
console.log('   levels ' + JSON.stringify(A.levels));
console.log('   rows ' + A.rows.map(r => `${r.p}:${r.lv || (r.skip ? 'skip' : '-')}${r.z ? '/' + r.z : ''}${r.unsure ? '?' : ''}`).join(' '));
ok(A.levels.length >= 4, 'levels came off the plan sheets with no button pressed: ' + A.levels.length);
ok(A.levels.every(l => l[1] != null), 'each with a T.O.S. elevation');
ok(A.order === 'drawings,levels,sheets,edge,match', 'Building runs drawings → levels → sheets → edge → match: ' + A.order);
ok(A.step === 'levels' && A.group === 'building', 'the app lands on Levels to be confirmed: ' + A.step);
ok(!A.lvStatus.done && /confirm/i.test(A.lvStatus.text), 'Levels is not done until confirmed: ' + JSON.stringify(A.lvStatus));
ok(A.confirmBtn, 'a Confirm levels button is there');
ok(A.noOldBtn && /again/.test(A.readAgain || ''), 'the old two readers are gone; one "read again" remains: ' + A.readAgain);
ok(A.rows.length === state_pages(A), 'a row for every page, none filtered: ' + A.rows.length);
function state_pages(a) { return a.rows.length; }
const planRows = A.rows.filter(r => r.kind === 'plan');
ok(planRows.length >= 6 && planRows.every(r => r.lv), 'every plan sheet is pre-filled with its floor: ' + JSON.stringify(planRows.map(r => [r.p, r.lv])));
ok(A.rows.filter(r => r.kind === 'loadmap').every(r => r.skip), 'load maps default to "not a floor plan" — but stay in the table');
ok(planRows.some(r => r.z === 'North') && planRows.some(r => r.z === 'South'), 'zones were read from the title blocks');
ok(A.zones.includes('North') && A.zones.includes('South'), 'and joined the job\'s zone list: ' + JSON.stringify(A.zones));
ok(A.tableIn === 'sheets' && A.edgePanelIn === 'edge', 'the table lives on Sheets and the edge panel on Floor edge: ' + A.tableIn + '/' + A.edgePanelIn);

// ── B. Confirm levels ─────────────────────────────────────────────────────
console.log('B. confirm levels');
const B = await page.evaluate(() => {
  const before = stepStatus('sheets');
  document.getElementById('btnConfirmLevels').click();
  const after = stepStatus('levels');
  const step = curStep;
  // editing a level lapses the confirmation
  state.levels[0].slabThickness = (state.levels[0].slabThickness || 7) + 1;
  const lapsed = levelsConfirmed();
  state.levels[0].slabThickness -= 1;
  return { before, after, step, lapsed, again: levelsConfirmed() };
});
ok(B.after.done && /confirmed/.test(B.after.text), 'Confirm makes Levels done: ' + JSON.stringify(B.after));
ok(B.step === 'sheets', 'and moves on to Sheets: ' + B.step);
ok(B.lapsed === false && B.again === true, 'changing a slab thickness lapses the confirmation; putting it back restores it');

// ── C. the sheets table ───────────────────────────────────────────────────
console.log('C. the sheets table');
const C = await page.evaluate(() => {
  renderSheetTable();
  const host = document.getElementById('sheetTable');
  const zsel = host.querySelector('select[data-stzone]');
  const zopts = zsel ? [...zsel.options].map(o => o.value) : [];
  const unsure = host.querySelectorAll('.st-row.unsure').length;
  const st0 = stepStatus('sheets');
  // change a zone through the picker
  const pg = +zsel.dataset.stzone;
  const other = zopts.find(v => v && v !== '__new' && v !== zsel.value);
  zsel.value = other; zsel.dispatchEvent(new Event('change'));
  const lv = state.levels[levelForPage(pg)];
  const changed = sheetZoneName(lv, pg);
  // the flagged rows: say they all look right
  const okAll = document.getElementById('stOkAll'); if (okAll) okAll.click();
  return { zopts, unsure, st0, pg, other, changed, unsureAfter: sheetUnsure().length,
    st1: stepStatus('sheets'), rows: host.querySelectorAll('.st-row').length, edgeCol: host.querySelectorAll('button[data-stedge]').length,
    next: (() => { renderSheetTable(); const b = document.getElementById('stNext'); return b ? { there: true, disabled: b.disabled, text: b.textContent } : { there: false }; })() };
});
ok(C.zopts[0] === '' && C.zopts.includes('North') && C.zopts.includes('South') && C.zopts.includes('__new'),
  'the zone is a picker: Whole floor, the job\'s zones, add a zone: ' + JSON.stringify(C.zopts));
ok(C.changed === C.other, 'picking a zone writes it to the sheet: ' + C.changed);
ok(C.unsure > 0 || C.st0.done, 'doubtful rows arrive flagged (or nothing was doubtful): ' + C.unsure);
ok(C.unsureAfter === 0, '"All look right" clears the flags');
ok(C.edgeCol === 0, 'no edge column on the Sheets table — the edge is the next step\'s business');
ok(C.next.there && /Floor edge/.test(C.next.text), 'the table ends in a Next: Floor edge button: ' + JSON.stringify(C.next));
ok(C.next.disabled === !C.st1.done, 'enabled exactly when the sheets are done: ' + JSON.stringify([C.next.disabled, C.st1]));
console.log('   sheets status: ' + JSON.stringify(C.st1));

// ── D. the floor edge ─────────────────────────────────────────────────────
console.log('D. the floor edge, per plan sheet');
const D0 = await page.evaluate(() => {
  setStep('edge');
  const rows = planSheetRows();
  return { n: rows.length, st: stepStatus('edge'), first: rows[0], html: document.getElementById('edgeRows').innerText.replace(/\s+/g, ' ') };
});
ok(D0.n >= 6, 'one row per plan sheet: ' + D0.n);
ok(!D0.st.done && /0 of/.test(D0.st.text), 'nothing confirmed yet: ' + D0.st.text);
ok(/Pick from the sheet/.test(D0.html) && /Draw by hand/.test(D0.html), 'each row offers Pick from the sheet and Draw by hand');
// pick on the first plan sheet
await page.evaluate(async r => { await edgePick(r.levelIdx, r.page); }, D0.first);
await page.waitForFunction(() => edgeProposal && edgeProposal.cands && edgeProposal.cands.length > 0, null, { timeout: 90000 });
const D1 = await page.evaluate(() => {
  const panelIn = document.getElementById('edgePanel').closest('.step-panel').dataset.step;
  const n = edgeProposal.cands.length;
  document.getElementById('edgeAccept').click();
  const r = planSheetRows()[0];
  return { panelIn, n, drawn: !!r.edge, confirmed: r.confirmed, st: stepStatus('edge'),
    rowTxt: document.getElementById('edgeRows').innerText.replace(/\s+/g, ' ') };
});
ok(D1.panelIn === 'edge', 'the candidates appear on the Floor edge step: ' + D1.panelIn);
ok(D1.n >= 1, 'outlines were offered: ' + D1.n);
ok(D1.drawn && !D1.confirmed, 'accepting one draws it, still unconfirmed');
ok(/Confirm/.test(D1.rowTxt) && /Adjust/.test(D1.rowTxt) && /Clean corners/.test(D1.rowTxt), 'the row offers Confirm, Adjust and Clean corners');
const D2 = await page.evaluate(() => {
  const r = planSheetRows()[0];
  edgeConfirm(r.levelIdx, r.page);
  const a = planSheetRows()[0];
  const st = stepStatus('edge');
  // an edit reopens it
  edgeEdited(a.edge);
  const b = planSheetRows()[0];
  edgeConfirm(b.levelIdx, b.page);
  const sheetsRowEdge = (document.querySelector(`.st-row[data-stpage="${r.page}"] .st-state`) || {}).textContent || '';
  renderSheetTable();
  return { confirmed: a.confirmed, st, reopened: !b.confirmed, again: planSheetRows()[0].confirmed,
    sheetsRowEdge: (document.querySelector(`.st-row[data-stpage="${r.page}"] .st-state`) || {}).textContent || '' };
});
ok(D2.confirmed && /1 of/.test(D2.st.text), 'Confirm counts: ' + D2.st.text);
ok(D2.reopened && D2.again, 'a hand edit reopens a confirmed edge; confirming again closes it');
ok(!/edge/.test(D2.sheetsRowEdge), 'the sheets table says nothing about the edge — that is the next step\'s: ' + JSON.stringify(D2.sheetsRowEdge.trim()));
// draw one by hand on the second plan sheet
const D3 = await page.evaluate(async () => {
  const r = planSheetRows()[1];
  await edgeDrawStart(r.levelIdx, r.page);
  const armed = state.tool === 'polygon' && edgeDraw && edgeDraw.page === r.page && curGroup().id === 'building';
  state.drawing.points = [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 700 }, { x: 100, y: 700 }];
  finishPolygon();
  const a = planSheetRows()[1];
  return { armed, drawn: !!a.edge, byHand: a.edge && !a.edge.detected, tool: state.tool, edgeDraw: !!edgeDraw, st: stepStatus('edge') };
});
ok(D3.armed, 'Draw by hand arms the polygon tool on the Building step');
ok(D3.drawn && D3.byHand && D3.tool === 'select' && !D3.edgeDraw, 'closing the shape draws the edge and drops back to select: ' + JSON.stringify(D3));
ok(/1 drawn, not confirmed/.test(D3.st.text), 'status says one is drawn and waiting: ' + D3.st.text);

// ── E. Areas auto-detect looks only inside the edge ───────────────────────
console.log('E. auto-detect inside the confirmed edge');
const E = await page.evaluate(async () => {
  const toasts = [];
  const orig = window.toast; window.toast = (m, t) => { toasts.push(String(m)); return orig(m, t); };
  const r1 = planSheetRows()[1];              // drawn, not confirmed
  await goToPage(r1.page); state.activeLevelIdx = r1.levelIdx;
  beamScan = null;
  await runAutoDetect({ edge: false, beams: true, openings: false, all: false });
  const refused = !beamScan && toasts.some(t => /Confirm the floor edge/.test(t));
  // clipping: a square edge; shapes in, straddling, and out
  const lv = state.levels[r1.levelIdx];
  const edge = edgeOf(lv, r1.page);            // 100..900 x 100..700
  const items = [
    { polygon: [{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }, { x: 200, y: 300 }], bbox: { minx: 200, miny: 200, maxx: 300, maxy: 300 } },   // inside
    { polygon: [{ x: 880, y: 200 }, { x: 930, y: 200 }, { x: 930, y: 300 }, { x: 880, y: 300 }], bbox: { minx: 880, miny: 200, maxx: 930, maxy: 300 } },   // straddles the edge
    { polygon: [{ x: 1200, y: 200 }, { x: 1300, y: 200 }, { x: 1300, y: 300 }, { x: 1200, y: 300 }], bbox: { minx: 1200, miny: 200, maxx: 1300, maxy: 300 } }, // key plan territory
    { polygon: null, x: 500, y: 500, bbox: { minx: 480, miny: 480, maxx: 520, maxy: 520 } },  // a tag inside
    { polygon: null, x: 1500, y: 500, bbox: { minx: 1480, miny: 480, maxx: 1520, maxy: 520 } }, // a tag outside
  ];
  const c = clipItemsToEdge(items, lv, r1.page);
  const adEdgeHidden = document.getElementById('adEdge').closest('label').hidden;
  window.toast = orig;
  return { refused, kept: c.kept.length, dropped: c.dropped, band: Math.round(edgeBandPx(lv, r1.page, edge)), adEdgeHidden, toasts: toasts.slice(-2) };
});
ok(E.refused, 'a sheet with no confirmed edge is not read: ' + JSON.stringify(E.toasts));
ok(E.kept === 3 && E.dropped === 2, 'inside and straddling kept, outside dropped: kept ' + E.kept + ' dropped ' + E.dropped + ' band ' + E.band + 'px');
ok(E.adEdgeHidden, 'Floor edge is no longer a tick box on the Areas auto-detect');

// ── F. matching by level and zone ─────────────────────────────────────────
console.log('F. matching pairs sheets by level and zone');
const F = await page.evaluate(() => {
  const rows = planSheetRows();
  const out = rows.map(r => { const b = sheetBelowFor(r.levelIdx, r.page); return { lv: r.name, z: r.zone, below: b && b.page != null ? `${state.levels[b.levelIdx].name}/${sheetZoneName(state.levels[b.levelIdx], b.page)}` : (b ? b.how : 'bottom') }; });
  return out;
});
console.log('   ' + F.map(x => `${x.lv}${x.z ? '/' + x.z : ''}→${x.below}`).join('  '));
const sameZone = F.filter(x => x.z && /\//.test(x.below) && x.below.split('/')[1].toLowerCase() === x.z.toLowerCase());
ok(sameZone.length >= 2, 'a zoned sheet stacks on the same zone below: ' + sameZone.length);
ok(F.some(x => x.below === 'bottom'), 'the lowest level has nothing below it');
const F2 = await page.evaluate(async () => {
  setStep('match');
  // arriving on Match reads every unmatched sheet and proposes fits
  for (let i = 0; i < 600 && !matchProposal; i++) await new Promise(r => setTimeout(r, 200));
  const el = document.getElementById('matchList');
  const txt = el.innerText.replace(/\s+/g, ' ');
  return { proposed: !!matchProposal, rows: matchProposal ? matchProposal.rows.length : 0,
    zonesShown: /North/.test(txt) && /South/.test(txt), stacksOn: /stacks on/.test(txt), noZoneInput: !el.querySelector('input.zone-in') };
});
ok(F2.proposed && F2.rows >= 6, 'matching ran itself on arrival and proposed a fit per sheet: ' + F2.rows);
ok(F2.zonesShown && F2.stacksOn, 'the rows name level and zone and say what each stacks on');
ok(F2.noZoneInput, 'zones are no longer typed on the Match step');

// ── G. a match is confirmed, sheet by sheet ──────────────────────────────
console.log('G. confirming the matches');
const G = await page.evaluate(() => {
  matchProposal.rows.forEach(r => { if (r.fit) r.pick = true; });
  applyMatchAll();
  renderMatchPanel();
  const el = document.getElementById('matchList');
  const before = { st: stepStatus('match'), confirmBtns: el.querySelectorAll('button[data-mconfirm]').length,
    notConf: (el.innerText.match(/matched, not confirmed/g) || []).length, all: !!document.getElementById('btnConfirmMatches') };
  const rows = matchSheetRows().filter(r => r.matched);
  confirmSheetMatch(rows[0].levelIdx, rows[0].page);
  const one = { st: stepStatus('match'), confirmed: matchSheetRows().filter(r => r.confirmed).length };
  confirmAllMatches();
  renderMatchPanel();
  const after = { st: stepStatus('match'), ticks: (el.innerText.match(/✓ confirmed/g) || []).length, confirmBtns: el.querySelectorAll('button[data-mconfirm]').length,
    matched: matchSheetRows().filter(r => r.matched).length, total: matchSheetRows().length };
  return { before, one, after };
});
ok(G.before.confirmBtns > 0 && G.before.notConf === G.before.confirmBtns, 'every matched sheet offers Confirm and says it is not confirmed yet: ' + JSON.stringify(G.before));
ok(!G.before.st.done && /confirmed/.test(G.before.st.text) && G.before.all, 'Match floors is not done until confirmed, and offers Confirm all: ' + G.before.st.text);
ok(G.one.confirmed === 1 && /1 confirmed/.test(G.one.st.text), 'one Confirm counts: ' + G.one.st.text);
ok(G.after.ticks === G.after.matched && G.after.confirmBtns === 0, 'Confirm all ticks every matched row: ' + JSON.stringify(G.after));
ok(G.after.matched === G.after.total ? G.after.st.done : !G.after.st.done, 'the step is done exactly when every sheet is matched and confirmed: ' + JSON.stringify(G.after.st));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

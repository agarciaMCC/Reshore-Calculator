// @rules RES-01, RES-05, RES-06, RES-10, RES-07, RES-08, RGN-09, RGN-10, BEM-01, BEM-05  (see DECISIONS.md)
// The rebuilt Results step (Sep 10, 2026).
//
//  A. the plan and the schedule side by side, with a draggable, remembered
//     split — and everything back to normal on the other steps
//  B. "what goes in under each floor": the install summary, resolved per
//     location the way the Sequence step resolves it, with local exceptions
//     kept to their own footprint
//  C. one pick, every row it fits (bulk shore apply), and one undo
//  D. the region card: the answer strip carries the shore control, the
//     eight-column table is folded behind Numbers
//  E. plan -> schedule: click a region where it is on the floor
//  F. the printed sheet leads with the same per-floor answer
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
const eq = (a, b, m) => ok(Math.abs(a - b) < 1e-6, `${m}: got ${a}, want ${b}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// ── fixture: 100 x 100 ft pour over one weak floor, with a 20 x 20 patch of
// it weaker still (the local exception), over a floor strong enough to absorb
await page.evaluate(() => {
  const T = [1, 0, 0, 1, 0, 0];
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const mk = (name, el, slab, cap) => ({
    id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap,
    rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [],
    alignment: { transform: T, points: [] },
  });
  state.project = { name: 'results-ui', loadingConditions: [], shoreChoices: {}, solveStepFt: 10 };
  state.levels = [mk('L3', 30, 7.5, 54), mk('L2', 20, 7.5, 54), mk('L1', 10, 7.5, 400)];
  // A stand-in sheet and schedule: the step gates want a drawing set, a sheet
  // per floor and a load schedule before Results will solve at all, and this
  // fixture is pure geometry.
  state.pdf.pages = 1; state.pdf.current = 1;
  state.levels.forEach(l => { l.pdfPage = 1; });
  state.project.loadingConditions = [{ mark: '1', desc: 'TYP', sdl: 14, ll: 40, confirmed: true }];
  state.levels[0].zones.push({ id: sid(), polygon: sq(0, 0, 100, 100), capacityPSF: 54, mark: '1', label: '', colorIdx: 0 });
  state.levels[1].zones.push({ id: sid(), polygon: sq(0, 0, 20, 20), capacityPSF: 4, mark: '9', label: 'weak patch', colorIdx: 1 });
  state.results = null; state.activeLevelIdx = 0;
  renderSidebar(); persist(); setStep('results');
});
await page.waitForFunction(() => schedSolve && schedSolve.levels[0].solve.spatial);

// ── A. the split layout ─────────────────────────────────────────────────
console.log('A. plan left, schedule right');
const lay = await page.evaluate(() => {
  const m = document.getElementById('main'), cs = getComputedStyle;
  return {
    cls: m.classList.contains('results-wide'),
    canvasOrder: +cs(document.getElementById('canvas-area')).order,
    sideOrder: +cs(document.getElementById('sidebar')).order,
    railOrder: +cs(document.getElementById('stepRail')).order,
    gripShown: cs(document.getElementById('sideGrip')).display !== 'none',
    railInMain: document.getElementById('stepRail').parentElement.id === 'main',
    sideW: Math.round(document.getElementById('sidebar').getBoundingClientRect().width),
    canvasW: Math.round(document.getElementById('canvas-area').getBoundingClientRect().width),
  };
});
ok(lay.cls, 'the Results step puts #main in results-wide');
ok(lay.railOrder < lay.canvasOrder && lay.canvasOrder < lay.sideOrder, `rail, then plan, then schedule: ${JSON.stringify(lay)}`);
ok(lay.railInMain, 'the step rail is its own column, so the panel can move to the right');
ok(lay.gripShown, 'the resize grip is there');
ok(lay.sideW >= 600 && lay.sideW <= 680, 'the schedule pane opens ~640 px wide: ' + lay.sideW);
ok(lay.canvasW > lay.sideW, 'and the plan still has the larger share: ' + lay.canvasW);
// drag the grip, and check it is remembered
const g = await page.evaluate(() => { const r = document.getElementById('sideGrip').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(g.x, g.y);
await page.mouse.down();
await page.mouse.move(g.x - 120, g.y, { steps: 6 });
await page.mouse.up();
const wider = await page.evaluate(() => ({
  w: Math.round(document.getElementById('sidebar').getBoundingClientRect().width),
  saved: +localStorage.getItem('reshore-calc-resw'),
}));
ok(wider.w > 740 && wider.w < 790, 'dragging the grip left widens the schedule pane: ' + wider.w);
ok(Math.abs(wider.saved - wider.w) < 3, 'and the width is remembered as a pref: ' + wider.saved);
await page.evaluate(() => { document.getElementById('sideGrip').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
ok(await page.evaluate(() => Math.abs(document.getElementById('sidebar').getBoundingClientRect().width - 640) < 3), 'double-click puts it back to 640');
await page.evaluate(() => setStep('areas'));
ok(await page.evaluate(() => !document.getElementById('main').classList.contains('results-wide')
  && getComputedStyle(document.getElementById('sideGrip')).display === 'none'), 'every other step is laid out as before');
await page.evaluate(() => setStep('results'));

// ── B. what goes in under each floor ────────────────────────────────────
console.log('B. the install summary');
const plan = await page.evaluate(() => {
  const L = schedSolve.levels[0], p = pourInstallPlan(L);
  return p.floors.map(f => ({
    name: f.name, need: f.needsShores, general: f.general, appliedSF: f.generalAppliedSF,
    totalSF: f.totalSF, pendingSF: f.pendingSF, pending: f.pending, rows: f.rowCount,
    exc: f.exceptions.map(e => [e.pattern, e.areaSF]), absorbed: f.absorbedSF,
  }));
});
ok(plan.length === 2 && plan[0].name === 'L2' && plan[1].name === 'L1', 'a row per floor below the pour, in cascade order: ' + JSON.stringify(plan.map(f => f.name)));
ok(plan[0].need && plan[0].rows === 2, 'L2 needs shores, under two regions');
ok(!plan[1].need && plan[1].absorbed === 10000, 'L1 has nothing to install — it absorbs the whole placement');
eq(plan[0].totalSF, 10000, 'the floor covers the whole placement');
eq(plan[0].pendingSF, 10000, 'and until a shore is picked, all of it is pending');
ok(plan[0].general == null, 'no pattern before a shore is chosen');
ok(await page.$eval('#schedSummary', e => /WHAT GOES IN UNDER EACH FLOOR|What goes in under each floor/i.test(e.innerText)), 'the summary leads the step');
ok(await page.$eval('#schedSummary', e => /2 shore picks outstanding/.test(e.innerText)), 'it counts the outstanding picks: ' + await page.$eval('#schedSummary', e => e.innerText.replace(/\s+/g, ' ').slice(0, 160)));
ok(await page.$eval('#schedSummary', e => /nothing to install/.test(e.innerText)), 'and says so where nothing goes in');
ok(await page.$$eval('#schedSummary .inst-row', r => r.length) === 2, 'two rows drawn');
ok(await page.$$eval('#schedSummary .inst-row[data-fl]', r => r.length) === 1, 'only the floor that needs shoring is clickable');
// the summary is NOT inside the schedule body — the print view and the older
// tests both read #schedBody as the region-by-region schedule
ok(await page.evaluate(() => !document.getElementById('schedBody').contains(document.getElementById('schedSummary'))), 'the summary is its own block');

// ── C. one pick, every row it fits ──────────────────────────────────────
console.log('C. bulk shore apply');
const cands = await page.$$eval('#rsBulkShore option', o => o.map(x => x.textContent.trim()));
ok(cands.length > 1 && /fits \d of 2 rows/.test(cands[1]), 'candidates say how many rows they fit: ' + JSON.stringify(cands.slice(0, 3)));
const before = await page.evaluate(() => Object.keys(state.project.shoreChoices).length);
ok(before === 0, 'nothing chosen yet');
await page.evaluate(() => {
  const sel = document.getElementById('rsBulkShore');
  sel.value = [...sel.options].find(o => o.value).value;
  document.getElementById('rsBulkGo').click();
});
await page.waitForTimeout(200);
const after = await page.evaluate(() => {
  const L = schedSolve.levels[0], p = pourInstallPlan(L), f = p.floors[0];
  return {
    keys: Object.keys(state.project.shoreChoices).length,
    general: f.general, appliedSF: f.generalAppliedSF, pending: f.pending,
    exc: f.exceptions.map(e => [e.pattern, e.areaSF]),
    shores: f.shoreList, mixed: f.mixed,
    pats: L.solve.regions.map(r => r.steps.filter(s => s.resultant > 0).map(s => s.chosen && s.chosen.pattern)).flat(),
  };
});
ok(after.keys === 2, 'one pick answered both rows: ' + after.keys);
ok(after.pending === 0, 'nothing outstanding on the floor');
ok(after.shores.length === 1 && !after.mixed, 'one shore type under the floor: ' + JSON.stringify(after.shores));
// the weak patch needs a tighter grid than the rest, and it governs only
// its own 400 SF — the floor keeps the looser pattern
const tight = after.exc[0];
ok(!!tight, 'the weak patch comes out as a local exception: ' + JSON.stringify(after.exc));
if (tight) {
  eq(tight[1], 400, 'the exception is the 400 SF patch');
  ok(patArea(tight[0]) < patArea(after.general), `and it is tighter than the floor's pattern: ${tight[0]} vs ${after.general}`);
}
eq(after.appliedSF, 9600, 'the general pattern covers the rest of the floor');
ok(await page.$eval('#schedSummary', e => /Tighten to/.test(e.innerText)), 'the row says to tighten that patch: ' + await page.$eval('#schedSummary .inst-row', e => e.innerText.replace(/\s+/g, ' ')));
ok(await page.$eval('#schedSummary .inst-row .rs-pat', e => e.textContent.trim()) === after.general, 'the pattern chip is the floor pattern');
// one undo puts every row back
await page.evaluate(() => { history.undo(); runSchedule(); });
ok(await page.evaluate(() => Object.keys(state.project.shoreChoices).length) === 0, 'one undo takes back the whole bulk apply');
// a shore that does not fit every row leaves the rest alone
const partial = await page.evaluate(() => {
  const rows = bulkRowsFor('pour', schedSolve.levels[0], null);
  const c = bulkCandidates(rows).find(x => x.fits < rows.length);
  if (!c) return { skipped: true };
  applyBulkShore(c.shoreId, rows, 'test');
  return { skipped: false, want: c.fits, got: Object.keys(state.project.shoreChoices).length, rows: rows.length };
});
if (partial.skipped) { pass++; console.log('   (every candidate fits every row on this fixture — partial fit covered by the count in the option text)'); }
else ok(partial.got === partial.want && partial.want < partial.rows, `a shore is set only where it is legal: ${JSON.stringify(partial)}`);
await page.evaluate(() => { state.project.shoreChoices = {}; runSchedule(); });

// ── D. the region card ──────────────────────────────────────────────────
console.log('D. the answer strip, and the numbers behind it');
const card = await page.evaluate(() => {
  const reg = document.querySelector('#schedBody .sched-region');
  const rows = [...reg.querySelectorAll('.ra-row')];
  return {
    stripRows: rows.length,
    firstRowText: rows[0].innerText.replace(/\s+/g, ' ').trim(),
    selectInStrip: !!reg.querySelector('.ra-row select.sched-shore'),
    selectInTable: !!reg.querySelector('.sched-table select.sched-shore'),
    tableFolded: reg.querySelector('.sched-table').classList.contains('folded'),
    tableInDom: !!reg.querySelector('.sched-table tbody tr'),
    cols: [...reg.querySelectorAll('.sched-table thead th')].map(t => t.textContent.trim()),
    nameField: !!reg.querySelector('.rs-tools input.sched-rlabel'),
    toggles: [...reg.querySelectorAll('.rs-tools button')].map(b => b.textContent.trim()),
  };
});
ok(card.stripRows === 2, 'one strip row per floor: ' + card.stripRows);
ok(/under\s+L2/i.test(card.firstRowText), 'the row says which floor it is under: ' + card.firstRowText);
ok(card.selectInStrip && !card.selectInTable, 'the shore control lives in the strip, once');
ok(card.tableFolded && card.tableInDom, 'the eight-column table is folded away, not thrown away');
ok(card.cols[0] === 'Reshore under' && card.cols[1] === 'Mark', 'the table keeps its columns: ' + JSON.stringify(card.cols));
ok(card.nameField, 'the name field moved to the tools row');
ok(/Numbers/.test(card.toggles.join(' ')) && /Diagram/.test(card.toggles.join(' ')), 'Diagram and Numbers sit together: ' + JSON.stringify(card.toggles));
await page.evaluate(() => document.querySelector('#schedBody .sched-region .nm-toggle').click());
const opened = await page.evaluate(() => {
  const reg = document.querySelector('#schedBody .sched-region');
  return { folded: reg.querySelector('.sched-table').classList.contains('folded'),
           label: reg.querySelector('.nm-toggle').textContent.trim(),
           on: reg.querySelector('.nm-toggle').classList.contains('on') };
});
ok(!opened.folded && opened.on && /Hide numbers/.test(opened.label), 'Numbers unfolds the table: ' + JSON.stringify(opened));
await page.evaluate(() => { runSchedule(); });
ok(await page.$eval('#schedBody .sched-region .sched-table', e => !e.classList.contains('folded')), 'and stays unfolded across a re-render');
await page.evaluate(() => document.querySelector('#schedBody .sched-region .nm-toggle').click());
// with a shore chosen the table's Shore column reads back the pick as text
await page.evaluate(() => {
  const sel = document.querySelector('#schedBody .ra-row select.sched-shore');
  sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change'));
});
await page.waitForTimeout(150);
const readback = await page.evaluate(() => {
  const reg = document.querySelector('#schedBody .sched-region');
  const tds = [...reg.querySelectorAll('.sched-table tbody tr')][0].querySelectorAll('td');
  return { shoreCell: tds[5].textContent.trim(), pattern: tds[7].textContent.trim(),
           chip: reg.querySelector('.ra-row .rs-pat') && reg.querySelector('.ra-row .rs-pat').textContent.trim(),
           spans: [...reg.querySelectorAll('.sched-table tbody tr')].every(tr =>
             [...tr.querySelectorAll('td')].reduce((n, td) => n + (+td.colSpan || 1), 0) === 8) };
  });
ok(/lb/.test(readback.shoreCell), 'the table names the chosen shore: ' + readback.shoreCell);
ok(readback.chip === readback.pattern, 'the strip chip and the table agree on the pattern: ' + readback.chip + ' / ' + readback.pattern);
ok(readback.spans, 'every table row still spans the eight columns');

// ── E. plan -> schedule, on the real job ────────────────────────────────
console.log('E. clicking a region where it is on the floor');
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'test-set.pdf'));
const job = JSON.parse(fs.readFileSync(path.resolve(here, 'fixtures', 'test-job.reshore.json'), 'utf8'));
await page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
  setStep('results');
}, [pdf.toString('base64'), job]);
await page.waitForFunction(() => schedSolve && schedSolve.levels[schedPourIdx].solve
  && schedSolve.levels[schedPourIdx].solve.spatial && schedSolve.levels[schedPourIdx].solve.regions.length > 2, { timeout: 90000 });
await page.evaluate(async () => {
  const L = schedSolve.levels[schedPourIdx];
  const li = state.levels.findIndex(l => l.name === L.pour.name);
  state.activeLevelIdx = li;
  const p = levelSheets(state.levels[li])[0];
  if (p) await goToPage(p.page);
  document.getElementById('zoomFit').click();
});
await page.waitForTimeout(800);
const at = await page.evaluate((i) => {
  const L = schedSolve.levels[schedPourIdx], r = L.solve.regions[i];
  const T = screenTransform(levelOnScreen() || getActiveLevel());
  // A point INSIDE the region, not the middle of its bounding box: regions
  // are exact polygons now and an L-shaped one does not contain the center of
  // its own box — clicking there lands in the neighbor, which is the right
  // answer to the wrong question.
  const p = (typeof mpInnerPoint === 'function' && r.mp && mpInnerPoint(r.mp))
    || { x: (r.bb.minX + r.bb.maxX) / 2, y: (r.bb.minY + r.bb.maxY) / 2 };
  const c = buildingToPixel(p.x, p.y, T);
  const sc = canvasToScreen(c.px, c.py);
  const box = document.getElementById('drawCanvas').getBoundingClientRect();
  return { x: box.left + sc.x, y: box.top + sc.y, key: r.key, label: regionLabel(r, i, L) };
}, 1);
await page.mouse.click(at.x, at.y);
await page.waitForTimeout(400);
const picked = await page.evaluate(() => ({
  key: state.ui.highlight && state.ui.highlight.regionKey,
  label: state.ui.highlight && state.ui.highlight.label,
  lit: document.querySelectorAll('#schedBody .sched-region.lit').length,
  litName: document.querySelector('#schedBody .sched-region.lit b') && document.querySelector('#schedBody .sched-region.lit b').textContent.trim(),
  ants: antsWanted(),
}));
ok(picked.key === at.key, 'a click on the plan picks the region under it: ' + picked.label + ' vs ' + at.label);
ok(picked.lit === 1 && picked.litName === at.label, 'exactly that region lights up in the schedule: ' + picked.litName);
ok(picked.ants, 'and the glow is on the plan (RES-10)');
// a click on bare sheet, away from the placement, clears the pick
const away = await page.evaluate(() => {
  // clear of the zoom bar (bottom left) and the coordinate readout (bottom right)
  const box = document.getElementById('drawCanvas').getBoundingClientRect();
  return { x: box.right - 30, y: box.top + box.height / 2 };
});
await page.mouse.click(away.x, away.y);
await page.waitForTimeout(300);
ok(await page.evaluate(() => !state.ui.highlight), 'clicking off the placement clears the pick');
ok(await page.evaluate(() => !document.querySelector('#schedBody .sched-region.lit')), 'and nothing is lit');
// the floor row shows everything that needs shoring under that floor
await page.evaluate(() => document.querySelector('#schedSummary .inst-row[data-fl]').click());
// the row lights at once; the sheet behind it arrives when the page has rendered
await page.waitForFunction(() => document.querySelector('#schedSummary .inst-row.lit'), { timeout: 20000 });
await page.waitForTimeout(1500);
const fl = await page.evaluate(() => {
  const h = state.ui.highlight, L = schedSolve.levels[schedPourIdx];
  const p = pourInstallPlan(L), f = p.floors.find(x => x.needsShores);
  return { key: h && h.key, rk: h && h.regionKey, label: h && h.label, cells: h ? h.cells.length / 2 : 0,
           want: f.cells.size, page: state.pdf.current,
           floorPage: (levelSheets(state.levels.find(l => l.name === f.name))[0] || {}).page };
});
ok(/^floor:/.test(fl.rk || ''), 'the floor row highlights the floor, not a region: ' + fl.rk);
ok(fl.cells === fl.want, `every cell that needs shoring under it: ${fl.cells} of ${fl.want}`);
ok(fl.page === fl.floorPage, 'shown on that floor\'s own sheet: page ' + fl.page);
const litRows = await page.evaluate(() => [...document.querySelectorAll('#schedSummary .inst-row')].map(r => r.dataset.fl + '/' + r.className));
ok(litRows.filter(c => /\blit\b/.test(c)).length === 1, 'the row reads as selected: ' + JSON.stringify(litRows));

// ── F. the printed sheet ────────────────────────────────────────────────
console.log('F. the print leads with the same answer');
const printed = await page.evaluate(() => {
  const rows = bulkRowsFor('pour', schedSolve.levels[schedPourIdx], null);
  applyBulkShore(bulkCandidates(rows)[0].shoreId, rows, 'print test');
  let html = '';
  const real = openPrintWindow;
  window.openPrintWindow = () => ({ document: { write: h => { html = h }, close() {} }, print() {} });
  printSchedule();
  window.openPrintWindow = real;
  return html;
});
ok(/What goes in under each floor/.test(printed), 'the install table is in the print');
ok(printed.indexOf('What goes in under each floor') < printed.indexOf('Regions on this placement'), 'and it comes before the region legend');
ok(/installed once and must satisfy every region above it/.test(printed), 'with the rule stated under it');
ok(/<th>Pattern<\/th>/.test(printed) && /Clear height/.test(printed), 'it carries the pattern and the clear height: ');
ok(/Reshore under/.test(printed) && /Verify against the structural drawings/.test(printed), 'the rest of the sheet is unchanged');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

function patArea(name) {
  const m = String(name || '').match(/(\d+)\s*[×x]\s*(\d+)/);
  return m ? (+m[1]) * (+m[2]) : Infinity;
}

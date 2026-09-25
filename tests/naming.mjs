// @rules RGN-07, RGN-08, RES-09, RES-15, RES-16  (see DECISIONS.md)
// How regions are designated: a name that IS the load path — the pour's slab
// thickness, then each floor below with its capacity (Adolfo, Sep 17 2026:
// "Slab Thickness - Level below load capacity - Level below that load
// capacity - and so on"), with marks / grid bays added only where two
// regions would otherwise read the same; a color keyed to the region's own
// signature so neither churns when the list is re-sorted; and a label you
// can type over the top.
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
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'test-set.pdf'));
const job = JSON.parse(fs.readFileSync(path.resolve(here, 'fixtures', 'test-job.reshore.json'), 'utf8'));
await page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
  document.getElementById('pageNav').style.display = 'flex';
  runSchedule();
}, [pdf.toString('base64'), job]);

console.log('A. with only the hand-matched grid, names fall back');
const sparse = await page.evaluate(() => {
  const L = schedSolve.levels.find(x => x.pour.name === 'Roof');
  return { grid: (state.project.grid.x || []).length + (state.project.grid.y || []).length,
           names: L.solve.regions.map((r, i) => regionLabel(r, i, L)) };
});
ok(sparse.grid <= 6, 'his hand match recorded only the crossings he clicked: ' + sparse.grid + ' labels');
ok(sparse.names.every(n => n), 'every region still gets a name: ' + JSON.stringify(sparse.names.slice(0, 2)));

console.log('B. auto-match fills the grid, and the names become locations');
const named = await page.evaluate(async () => {
  for (let i = 0; i < state.levels.length; i++) {
    if (!state.levels[i].pdfPage) continue;
    await autoMatchLevel(i);
    if (state.align.points.length >= 2) finishAlignment();
  }
  runSchedule();
  for (const L of schedSolve.levels) {
    if (!L.solve.spatial) continue;
    for (const r of L.solve.regions) for (const st of r.steps) if (st.resultant > 0 && st.options.length && !st.chosen) shoreChoices()[st.choiceKey] = st.options[0].shoreId;
  }
  runSchedule();
  const out = {};
  for (const L of schedSolve.levels) {
    if (!L.solve.spatial) continue;
    out[L.pour.name] = L.solve.regions.map((r, i) => ({ name: regionLabel(r, i, L), color: regionColorIdx(r, i, L), sf: Math.round(r.areaSF), key: r.key, grid: regionGridTag(r) }));
  }
  return out;
});
const roof = named['Roof'];
ok(roof.length === 5, 'five regions on the Roof placement');
ok(roof.every(r => /^9" Slab – L3 \d+(\.\d)? PSF – L2 \d+(\.\d)? PSF/.test(r.name)), 'each is named by its load path — slab, then each floor with its capacity: ' + JSON.stringify(roof.map(r => r.name)));
// Found by size rather than pinned to it: region areas come from the region's
// own polygon now, not from counting 2 ft sample cells, so the numbers moved a
// little (11,212 → ~11,050 and so on) without anything about the NAMES
// changing, which is what this file is about.
const near = (sf, want, tol) => Math.abs(sf - want) <= (tol == null ? want * 0.03 : tol);
const west = roof.find(r => near(r.sf, 11100, 400));
const east = roof.find(r => near(r.sf, 9270, 400));
const e2 = roof.find(r => near(r.sf, 615, 60));
// RES-15 (Sep 25): "remove the grid range in the pour titles". The bays no
// longer tell two patches apart in the name; they move to the row's small
// print, and the patches are numbered (a height differing would name it).
ok(west && /^9" Slab – L3 138 PSF – L2 138 PSF \(B2\)$/.test(west.name), 'the west patch of the B2 condition carries no grid bays in its name: ' + JSON.stringify(roof.map(r => [r.name, r.sf])));
ok(east && /^9" Slab – L3 138 PSF – L2 138 PSF \(B2\) \(\d\)$/.test(east.name), 'the east patch is told apart by a number, not its bays: ' + (east && east.name));
ok(roof.every(r => !/ · \d+-\d+ \/ [A-Z]-[A-Z]/.test(r.name)), 'no region name carries a grid range');
ok(west && /^1-6 \/ A-D$/.test(west.grid || '') && east && /^[4-6]-10 \/ A-D$/.test(east.grid || ''), 'the bays are still worked out for the small print: ' + (west && west.grid) + ' / ' + (east && east.grid));
ok(e2 && /^9" Slab – L3 125 PSF – L2 138 PSF$/.test(e2.name), 'the E2 cutout has its own numbers, so no mark or bays are needed: ' + (e2 && e2.name));
ok(roof.some(r => /\(C2\)$/.test(r.name)), 'the C2 region, same numbers as B2, carries its mark in brackets: ' + JSON.stringify(roof.map(r => r.name)));
ok(new Set(roof.map(r => r.name)).size === roof.length, 'names are unique within the placement: ' + JSON.stringify(roof.map(r => r.name)));
ok(new Set(roof.map(r => r.color)).size === roof.length, 'so are the colors: ' + JSON.stringify(roof.map(r => r.color)));

console.log('C. neither the name nor the color moves when the list does');
const stable = await page.evaluate(() => {
  const before = {};
  for (const L of schedSolve.levels) { if (!L.solve.spatial) continue;
    L.solve.regions.forEach((r, i) => { before[L.pour.name + '|' + r.key] = [regionLabel(r, i, L), regionColorIdx(r, i, L)]; }); }
  // a re-solve that changes the region set and its ordering
  state.project.minRegionSF = 50; runSchedule();
  let same = 0, moved = 0, checked = 0;
  for (const L of schedSolve.levels) { if (!L.solve.spatial) continue;
    L.solve.regions.forEach((r, i) => {
      const b = before[L.pour.name + '|' + r.key]; if (!b) return;
      checked++;
      const now = [regionLabel(r, i, L), regionColorIdx(r, i, L)];
      if (now[0] === b[0] && now[1] === b[1]) same++; else moved++;
    }); }
  state.project.minRegionSF = null; runSchedule();
  return { same, moved, checked };
});
ok(stable.checked >= 10 && stable.moved === 0, `every region kept its name and color through a re-solve (${stable.same}/${stable.checked})`);
// and the old scheme would have moved: the tag is no longer the sort index
ok(await page.evaluate(() => {
  const L = schedSolve.levels.find(x => x.pour.name === 'Roof');
  return !/^R\d/.test(regionLabel(L.solve.regions[0], 0, L));
}), 'the name is no longer R + position');

console.log('D. a label of your own');
const lbl = await page.evaluate(() => {
  const L = schedSolve.levels.find(x => x.pour.name === 'Roof');
  const r = L.solve.regions[0], key = r.key;
  const derived = regionLabel(r, 0, L);
  setRegionLabel('Roof', key, 'West half');
  const named = regionLabel(r, 0, L);
  setRegionLabel('Roof', key, '   ');
  const cleared = regionLabel(r, 0, L);
  setRegionLabel('Roof', key, 'West half');
  const ser = serializeDoc();
  const doc = typeof ser === 'string' ? JSON.parse(ser) : ser;
  return { derived, named, cleared, stored: (doc.project.regionLabels || {})['Roof|' + key] };
});
ok(lbl.named === 'West half', 'a typed label wins');
ok(lbl.cleared === lbl.derived, 'clearing it brings the derived name back');
ok(lbl.stored === 'West half', 'and it is saved with the job');
// the color does not change when you name it
ok(await page.evaluate(() => {
  const L = schedSolve.levels.find(x => x.pour.name === 'Roof');
  const before = regionColorIdx(L.solve.regions[0], 0, L);
  setRegionLabel('Roof', L.solve.regions[0].key, 'Podium');
  const after = regionColorIdx(L.solve.regions[0], 0, L);
  setRegionLabel('Roof', L.solve.regions[0].key, 'West half');
  return before === after;
}), 'naming a region does not change its color');

console.log('E. in the schedule');
await page.evaluate(() => { setStep('results'); renderSchedule(); });
ok(await page.$eval('#schedBody', e => /West half/.test(e.textContent)), 'the schedule shows the typed name');
ok(await page.$$eval('#schedBody .sched-region-head .lm-swatch', s => s.length) === 5, 'a swatch on every region head');
ok(await page.$$eval('#schedBody .sched-region-head .lm-swatch', s => new Set(s.map(x => x.style.background)).size) === 5, 'the swatches are distinct');
ok(await page.$$eval('#schedBody input.sched-rlabel', i => i.length) === 5, 'each region offers a name field');
// typing in the field must not also fire the show-on-plan click
const typed = await page.evaluate(() => {
  const inp = document.querySelectorAll('#schedBody input.sched-rlabel')[1];
  const key = inp.dataset.rkey;
  inp.value = 'Elevator core';
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  const L = schedSolve.levels.find(x => x.pour.name === 'Roof');
  const i = L.solve.regions.findIndex(r => r.key === key);
  return { name: regionLabel(L.solve.regions[i], i, L), undoable: history.canUndo ? history.canUndo() : true };
});
ok(typed.name === 'Elevator core', 'typing into the field names the region: ' + JSON.stringify(typed));
await page.evaluate(() => history.undo());
ok(await page.evaluate(() => {
  const L = schedSolve.levels.find(x => x.pour.name === 'Roof');
  return !Object.values(state.project.regionLabels || {}).includes('Elevator core');
}), 'and undo takes the name back off');

console.log('F. on the plan and in the print');
const painted = await page.evaluate(async () => {
  const li = state.levels.findIndex(l => l.name === 'Roof');
  state.activeLevelIdx = li; await goToPage(state.levels[li].pdfPage);
  setStep('results'); setResultHighlight(null);
  const rec = [];
  const oFill = drawCtx.fillRect, oText = drawCtx.fillText, oPath = drawCtx.fill;
  const texts = [];
  drawCtx.fillRect = function (...a) { rec.push(String(this.fillStyle)); return oFill.apply(this, a); };
  drawCtx.fill = function (...a) { rec.push(String(this.fillStyle)); return oPath.apply(this, a); };
  drawCtx.fillText = function (t, ...a) { texts.push(String(t)); return oText.apply(this, [t, ...a]); };
  renderNow();
  drawCtx.fillRect = oFill; drawCtx.fillText = oText; drawCtx.fill = oPath;
  const L = schedSolve.levels.find(x => x.pour.name === 'Roof');
  const norm = c => String(c).replace(/\s+/g, '');
  const seen = new Set(rec.map(norm));
  const want = L.solve.regions.map((r, i) => norm(regionColorCss(regionColorIdx(r, i, L), 0.20)));
  return { hits: want.filter(c => seen.has(c)).length, n: want.length,
           // a name goes on the plan one step per line, where the region has room for it
           // RES-16: the plan carries each region's NUMBER, not its name
           names: L.solve.regions.map((r, i) => regionNum(i)).filter(n => texts.includes(n)).length,
           long: texts.filter(t => / Slab/.test(t)).length,
           dbg: { curStep, pourIdx: schedPourIdx, onScreen: (levelOnScreen()||{}).name, page: state.pdf.current,
                  want: want.slice(0,2), sample: [...new Set(rec)].slice(0,8) } };
});
ok(painted.hits === painted.n, `every region is painted in its own color (${painted.hits}/${painted.n})`);
ok(painted.names >= 2 && painted.long === 0, `the big regions carry their numbers on the plan, not their names; small patches go by color (${painted.names}/${painted.n}, ${painted.long} names)`);
// with a region selected, the teal selection (RES-10) still goes over the top
const selPaint = await page.evaluate(() => {
  const L = schedSolve.levels.find(x => x.pour.name === 'Roof');
  const r = L.solve.regions[0];
  state.ui.highlight = { cells: r.cells, step: r.cellStep, bb: r.bb, label: regionLabel(r, 0, L), regionKey: r.key, pour: 'Roof' };
  const rec = []; const oFill = drawCtx.fillRect, oPath = drawCtx.fill;
  drawCtx.fillRect = function (...a) { rec.push(String(this.fillStyle)); return oFill.apply(this, a); };
  drawCtx.fill = function (...a) { rec.push(String(this.fillStyle)); return oPath.apply(this, a); };
  renderNow(); drawCtx.fillRect = oFill; drawCtx.fill = oPath;
  setResultHighlight(null);
  return { green: rec.some(c => /14, ?143, ?150|63, ?199, ?207/.test(c)), map: rec.some(c => /148, ?103, ?189|43, ?87, ?151|200, ?90, ?58/.test(c)) };
});
ok(selPaint.green && selPaint.map, 'the selection glow sits over the region map: ' + JSON.stringify(selPaint));
// the print legend
const legend = await page.evaluate(() => {
  let html = '';
  const open = window.open;
  window.open = () => ({ document: { write: h => { html += h; }, close() {} }, focus() {}, print() {} });
  try { printSchedule(); } finally { window.open = open; }
  return html;
});
ok(/Regions on this placement/.test(legend), 'the print opens with a legend');
ok((legend.match(/class="sw"/g) || []).length >= 10, 'swatches in the legend and on every heading: ' + (legend.match(/class="sw"/g) || []).length);
ok(/West half/.test(legend), 'the legend uses the names');
ok(/smaller area cuts out of the larger one/.test(legend) && !/higher capacity governs/.test(legend), 'the print note matches the cutout rule');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

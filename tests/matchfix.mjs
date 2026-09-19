// The Match step, three complaints (Adolfo, Sep 10, 2026):
//   "we need to be able to clear the match. redo doesnt clear anything and
//    creating new points doesnt work unless they match a previous floor. I
//    thought we added the functionality to add multiple sheets/zones to one
//    floor in case the plans were split up into multiple sheets? Maybe
//    something like creating groupings for zones/sheets (i.e. North, south,
//    east, west or Zone 1,2,3,4 A,B,C,D Etc.) make it so you can name the
//    groups."
//
//  A. Clear drops one sheet's fit and nothing else; one undo puts it back
//  B. one crossing the grid already knows + the sheet's scale places a sheet
//     whose other grid labels are new, and those labels join the grid
//  C. a named zone per sheet, shown wherever the app names a sheet, saved
//     with the job
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(Math.abs(a - b) < 1e-6, `${m}: got ${a}, want ${b}`);
const here = new URL('.', import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// ── fixture: an image job (no PDF pages) is not enough here — the sheet
// machinery is keyed on page numbers, so fake a 3-page set and put one floor
// on two of them, as a plan split by area would be.
const build = () => page.evaluate(() => {
  while (history.canUndo()) history.undo();
  state.pdf.doc = null; state.pdf.pages = 3; state.pdf.current = 1;
  state.project = { name: 'matchfix', grid: { x: [], y: [] }, loadingConditions: [], shoreChoices: {} };
  const T = s => ({ transform: [s, 0, 0, s, 0, 0], ftPerInch: s * 144, scale: s, rotationDeg: 0, mirror: false,
    rmsFt: 0, worstFt: 0, nPoints: 2, points: [] });
  const lv = (name, elev) => ({ id: sid(), name, elevation: elev, slabThickness: 9, defaultCapacity: 100,
    zones: [], slabZones: [], pdfPage: null, alignment: null, sheets: [] });
  state.levels = [lv('3', 30), lv('2', 20)];
  // Level 3 is drawn on sheets 1 and 2; sheet 1 is matched, sheet 2 is not
  state.levels[0].pdfPage = 1; state.levels[0].alignment = T(0.07);
  state.levels[0].sheets = [{ page: 2, alignment: null }];
  state.levels[1].pdfPage = 3; state.levels[1].alignment = T(0.07);
  // a grid the first match defined: columns 1-8, rows A-D
  state.project.grid = { x: [{ label: '1', pos: 0 }, { label: '4', pos: 90 }, { label: '8', pos: 210 }],
                         y: [{ label: 'A', pos: 0 }, { label: 'D', pos: 80 }] };
  state.activeLevelIdx = 0; state.activeZoneIdx = null;
  state.levels[0].zones.push({ id: sid(), polygon: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 250 }, { x: 100, y: 250 }], mark: null, label: 'Bay A', page: 1 });
  document.getElementById('upload-prompt').style.display = 'none';
  setStep('match'); renderSidebar(); renderCanvas();
});

// ── A. Clear ────────────────────────────────────────────────────────────
console.log('A. clearing one sheet\'s match');
await build();
const rows = await page.$$eval('#matchList .match-row', r => r.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
ok(rows.length === 3, 'a row per sheet that a floor is drawn on, plus the single-sheet floor: ' + JSON.stringify(rows));
ok(await page.$$eval('#matchList button[data-matchclear]', b => b.length) === 2,
  'a Clear button on each matched sheet, and none on the unmatched one: ' + await page.$$eval('#matchList button[data-matchclear]', b => b.length));
const areas0 = await page.evaluate(() => JSON.stringify(state.levels[0].zones[0].polygon));
await page.evaluate(() => { clearSheetMatch(0, 1); });
ok(await page.evaluate(() => !state.levels[0].alignment), 'the fit is gone');
ok(await page.evaluate(() => state.levels[0].sheets[0].page === 2), 'the sheet is still on the floor');
ok(await page.evaluate(() => JSON.stringify(state.levels[0].zones[0].polygon)) === areas0,
  'and what is drawn on it has not moved');
ok(await page.evaluate(() => state.levels[0].zones.length === 1), 'nor been deleted');
ok(await page.evaluate(() => { const t = document.querySelectorAll('.toast'); return t.length ? t[t.length - 1].textContent : ''; })
  .then(t => /Match cleared/.test(t) && /areas stay where they are/.test(t)), 'and it says what did not happen to them');
ok(await page.evaluate(() => !levelFullyMatched(state.levels[0])), 'the floor reads as not fully matched');
await page.evaluate(() => { history.undo(); refreshFlow(); });
ok(await page.evaluate(() => !!(state.levels[0].alignment && state.levels[0].alignment.transform)), 'one undo puts the fit back');
// clearing a non-primary sheet touches only that sheet
await page.evaluate(() => { state.levels[0].sheets[0].alignment = { transform: [0.07, 0, 0, 0.07, 5, 5], ftPerInch: 10, nPoints: 2, points: [] }; refreshFlow(); });
await page.evaluate(() => { clearSheetMatch(0, 2); });
ok(await page.evaluate(() => !state.levels[0].sheets[0].alignment && !!state.levels[0].alignment),
  'the second sheet is cleared, the first is left alone');
// Redo (the old button) still only starts a fresh set of picks
await page.evaluate(() => { startAlignment(0, 1); });
ok(await page.evaluate(() => state.align.active && state.align.points.length === 0 && !!state.levels[0].alignment),
  'Redo starts fresh picks and leaves the stored fit until Done — which is why Clear exists');
await page.keyboard.press('Escape');

// ── B. one known crossing + the sheet's scale ───────────────────────────
console.log('B. a sheet whose grid labels are new');
await build();
// sheet 2 covers grids 8-15: only "8" and the rows are on the grid already
await page.evaluate(() => { startAlignment(0, 2); });
await page.waitForTimeout(120);                // let the sheet's own scale read settle
const anchored = await page.evaluate(() => {
  state.align.sheetScale = 10;                 // 1" = 10', as the sheet states
  // one crossing the grid knows: 8-A
  state.align.points = [{ px: 100, py: 100, gx: '8', gy: 'A' }];
  const now = alignFitNow(state.align.points);
  return { mode: now.mode, canFinish: alignCanFinish(), ft: now.fit && +now.fit.ftPerInch.toFixed(3),
    rot: now.fit && now.fit.rotationDeg, model: now.fit && now.fit.model,
    text: (document.getElementById('alignStatusText') || {}).textContent || '' };
});
ok(anchored.mode === 'anchor', 'one known crossing plus the scale is a fit: ' + JSON.stringify(anchored));
ok(anchored.canFinish, 'Done is offered on one point');
eq(anchored.ft, 10, 'at the sheet\'s scale');
eq(anchored.rot, 0, 'square, as plans are');
await page.evaluate(() => { updateAlignStatus(); });
ok(await page.$eval('#alignStatusText', e => /1 crossing the grid knows/.test(e.textContent)
  && /new labels join the grid/.test(e.textContent)), 'and the bar says what is happening: '
  + await page.$eval('#alignStatusText', e => e.textContent.slice(0, 160)));
// now click two NEW crossings as well and finish: they should join the grid
const joined = await page.evaluate(() => {
  state.align.points.push({ px: 300, py: 100, gx: '12', gy: 'A' });
  state.align.points.push({ px: 300, py: 300, gx: '12', gy: 'F' });
  finishAlignment();
  const g = state.project.grid;
  const at = (ax, l) => { const e = (g[ax] || []).find(x => String(x.label) === l); return e ? Math.round(e.pos * 100) / 100 : null };
  const a = state.levels[0].sheets[0].alignment;
  return { placed: !!(a && a.transform), ft: a && +a.ftPerInch.toFixed(3),
    x8: at('x', '8'), x12: at('x', '12'), yA: at('y', 'A'), yF: at('y', 'F'),
    pts: a && a.nPoints };
});
ok(joined.placed, 'the sheet is matched');
eq(joined.ft, 10, 'at the sheet scale');
// the anchor 8-A sat at grid x=210,y=0; 200 px further along at 10 ft/in
// (0.0694 ft/px) is 210 + 200*0.0694 = 223.89 ft
eq(joined.x8, 210, 'the known label keeps its position');
eq(joined.x12, 223.89, 'the new column joins the grid where this sheet puts it');
eq(joined.yA, 0, 'the known row keeps its position');
eq(joined.yF, 13.89, 'and the new row joins too');
// with no known crossing at all it still refuses, and says what to do
await page.evaluate(() => { startAlignment(1, 3); });
await page.waitForTimeout(120);
const refused = await page.evaluate(() => {
  state.align.sheetScale = 10;
  state.align.points = [{ px: 10, py: 10, gx: '77', gy: 'ZZ' }, { px: 90, py: 90, gx: '78', gy: 'YY' }];
  const before = JSON.stringify(state.levels[1].alignment);
  finishAlignment();
  const t = document.querySelectorAll('.toast');
  return { unchanged: JSON.stringify(state.levels[1].alignment) === before,
    toast: t.length ? t[t.length - 1].textContent : '' };
});
ok(refused.unchanged, 'a sheet with no known crossing is not placed');
ok(/None of those crossings are on the grid yet/.test(refused.toast) && /new ones will join the grid/.test(refused.toast),
  'and the refusal says what to click: ' + JSON.stringify(refused.toast));
await page.keyboard.press('Escape');

// ── C. a named zone per sheet ───────────────────────────────────────────
console.log('C. naming the zones');
await build();
// Zones are picked on the SHEETS section now (Sep 17 2026), from a list the
// job keeps, so North is spelled North on every floor; Match floors shows the
// zone on each row and what the sheet stacks on, and no longer asks for names.
ok(await page.$$eval('#matchList input.zone-in', i => i.length) === 0, 'Match floors no longer has name fields');
ok(await page.evaluate(() => { renderMatchPanel(); return /stacks on|bottom of the stack/.test(document.getElementById('matchList').innerText) }),
  'each row says what it stacks on instead');
await page.evaluate(() => { setStep('sheets'); renderSheetTable(); });
ok(await page.$$eval('#sheetTable select[data-stzone]', i => i.length) === 3, 'every assigned sheet has a zone picker on Sheets: '
  + await page.$$eval('#sheetTable select[data-stzone]', i => i.length));
ok(await page.$eval('#sheetTable select[data-stzone]', s => s.options[0].textContent === 'Whole floor' && [...s.options].some(o => o.value === '__new')),
  'offering Whole floor and "add a zone"');
await page.evaluate(() => { setSheetZoneFor(1, 'North'); setSheetZoneFor(2, 'South'); });
ok(await page.evaluate(() => JSON.stringify(projectZones())) === '["North","South"]', 'the names join the job\'s zone list: '
  + await page.evaluate(() => JSON.stringify(projectZones())));
ok(await page.evaluate(() => { renderSheetTable(); const s = document.querySelector('#sheetTable select[data-stzone="3"]'); return [...s.options].map(o => o.value).join('|') }) === '|North|South|__new',
  'and the single-sheet floor can pick them too');
const named = await page.evaluate(() => ({
  zones: state.levels[0].sheetZones,
  tag1: sheetTag(state.levels[0], 1), tag2: sheetTag(state.levels[0], 2),
  list: sheetListLabel(state.levels[0]),
  plain: sheetListLabel(state.levels[1]),
}));
ok(named.zones && named.zones[1] === 'North' && named.zones[2] === 'South', 'both zones are named: ' + JSON.stringify(named.zones));
ok(named.tag1 === 'North (sheet 1)' && named.tag2 === 'South (sheet 2)', 'and each sheet is named by its zone: ' + JSON.stringify([named.tag1, named.tag2]));
ok(named.list === 'North, South', 'the floor\'s sheets read as its zones: ' + named.list);
ok(named.plain === 'sheet 3', 'a floor with no zone named still reads by page: ' + named.plain);
// the sheet bar over the plan speaks in zones
const bar = await page.evaluate(() => { state.pdf.current = 2; state.activeLevelIdx = 1; renderPageBar();
  return document.getElementById('pageBar').textContent.replace(/\s+/g, ' '); });
ok(/South/.test(bar), 'the bar names the zone of the sheet you are on: ' + JSON.stringify(bar.slice(0, 140)));
ok(/sheet 3/.test(bar), 'and where the active floor\'s own areas are');
// the picker lists zones
const picker = await page.evaluate(() => { state.pdf.current = 2;
  state.levels.forEach(l => { if (levelHasPage(l, 2)) removeLevelSheet(l, 2) }); renderPageBar();
  return [...document.querySelectorAll('#pageBarSel option')].map(o => o.textContent); });
ok(picker.some(t => /North/.test(t)), 'the "which floor is this sheet" picker lists zones: ' + JSON.stringify(picker));
// the Drawings step too
ok(await page.evaluate(() => { setStep('drawings'); renderDrawingsPanel();
  return /North/.test(document.getElementById('drawingsInfo').textContent); }), 'so does the Drawings step\'s list');
// and it survives save / open
const round = await page.evaluate(() => {
  const doc = JSON.parse(JSON.stringify(serializeDoc()));
  state.levels[0].sheetZones = {};
  deserializeDoc(doc);
  return { z: state.levels[0].sheetZones, tag: sheetTag(state.levels[0], 1) };
});
ok(round.z && round.z[1] === 'North', 'the names are saved with the job: ' + JSON.stringify(round.z));
ok(round.tag === 'North (sheet 1)', 'and come back on open');
// a typical range carries them through the solve
ok(await page.evaluate(() => {
  const c = concreteLevel(state.levels[0], '3', 30, state.levels[0], 0);
  return c.sheetZones && c.sheetZones[1] === 'North';
}), 'a typical range keeps its zone names');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

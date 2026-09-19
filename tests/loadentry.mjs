// @rules LOD-01, LOD-03, LOD-04, LOD-05  (see DECISIONS.md)
// THE LOAD CHART CAN BE TYPED IN OR BROUGHT IN (Adolfo, Sep 14, 2026):
// "we need a way to enter in loads manually for the load chart or to upload
//  an excel file"
//
// Until now the schedule could only come off the drawings — the numbers were
// editable but there was no way to add a mark, delete one, or start from
// nothing, and the empty state said "add conditions by hand" while offering
// no way to. The import reads a capacity chart as it is written: his own
// Kalae chart is the fixture, `*` on the mark and all.
//
// A row remembers where it came from, so reading the drawings again keeps
// what he typed and FLAGS a disagreement instead of quietly resolving it.
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
const eq = (a, b, m) => ok(a === b, `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
let sayYes = true;
page.on('dialog', d => sayYes ? d.accept() : d.dismiss());
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
const xl = fs.readFileSync(path.resolve(here, 'fixtures', 'capacity-chart.xlsx'));
const b64 = xl.toString('base64');

const marks = () => page.evaluate(() => getConditions().map(c => [String(c.mark), c.sdl, c.ll, !!c.reducible, c.source || 'drawing']));
const shape = () => page.evaluate(() => scheduleShape());
const panelText = () => page.$eval('#lmImportPanel', e => e.innerText.replace(/\s+/g, ' '));
const startText = () => page.$eval('#lmStart', e => e.innerText.replace(/\s+/g, ' '));
const chartText = () => page.$eval('#p-loads', e => e.innerText.replace(/\s+/g, ' '));
const lastToast = () => page.evaluate(() => { const t = document.querySelectorAll('.toast'); return t.length ? t[t.length - 1].textContent : ''; });
const takeFile = (name) => page.evaluate(async ([d, n]) => {
  const bin = atob(d); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await takeLoadFile(new File([u8], n));
}, [b64, name]);
const reset = () => page.evaluate(() => {
  while (history.canUndo()) history.undo();
  state.project.loadingConditions = []; state.project.llSchedule = []; state.project.sdlSchedule = [];
  state.levels = []; state.pdf.doc = null; state.pdf.pages = 0;
  loadImport = null; renderLoadImportPanel();
  document.getElementById('upload-prompt').style.display = 'none';
  setStep('loads'); openLoadMapModal();
});

// ── A. nothing to read it off: the way in ───────────────────────────────
console.log('A. the empty state');
await reset();
eq(await shape(), 'none', 'no schedule yet');
ok(await page.$eval('#lmStart', e => e.style.display !== 'none'), 'the chooser is up');
const st = await startText();
ok(/Start a combined chart/.test(st) && /Start split LL \+ SDL schedules/.test(st),
  'offering both shapes: ' + st.slice(0, 120));
ok(/Import from Excel/.test(st) && /Blank template/.test(st), 'and a file either way');
ok(/SDL \+ 1.6\/1.3 × LL/.test(st), 'saying how capacity comes out, so nothing is a black box');
ok(await page.$eval('#lmCombined', e => e.style.display === 'none'), 'the empty table is out of the way');
ok(await page.$eval('.lm-bulk', e => e.style.display === 'none'), 'so is a bulk control with nothing to act on');
ok(await page.$eval('#lmNoteCombined', e => e.style.display === 'none'), 'and the note about what the drawing says');
ok(/nothing to read a schedule off/.test(await chartText()), 'the status says why: ' + (await chartText()).slice(0, 90));

console.log('   starting a combined chart');
await page.click('#lsCombined');
eq(await shape(), 'combined', 'a combined chart now');
eq((await marks()).length, 1, 'with one row to type into');
eq((await marks())[0][4], 'manual', 'marked as typed in');
ok(await page.$eval('#lmStart', e => e.style.display === 'none'), 'the chooser steps aside');
ok(await page.$eval('#lmCombined', e => e.style.display !== 'none'), 'and the table comes back');
ok(/typed in by hand/.test(await chartText()), 'the status line says where it came from');
await page.evaluate(() => history.undo());
eq(await shape(), 'none', 'one undo puts the empty state back');

console.log('   starting split schedules');
await page.click('#lsSplit');
eq(await shape(), 'split', 'split now');
eq(await page.evaluate(() => [llSchedule().length, sdlSchedule().length]).then(JSON.stringify), '[1,1]',
  'one live-load mark and one dead-load mark');
ok(await page.$eval('#lmSplit', e => /Live load schedule/.test(e.innerText) && /Superimposed dead load/.test(e.innerText)),
  'both tables are drawn');
await page.evaluate(() => history.undo());

// ── B. typing the chart in ──────────────────────────────────────────────
console.log('B. adding, renaming, deleting by hand');
await reset();
await page.click('#lsCombined');
await page.click('#lmAdd');
await page.click('#lmAdd');
eq((await marks()).map(m => m[0]).join(','), '1,2,3', 'Add a mark takes the next free number');
ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('lm-mk')),
  'and puts the cursor in the new row\'s mark');
// type a row in
await page.evaluate(() => {
  const set = (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })) };
  set('#lmBody tr[data-ci="0"] input[data-f="sdl"]', '25');
  set('#lmBody tr[data-ci="0"] input[data-f="ll"]', '40');
  set('#lmBody tr[data-ci="0"] input[data-desc="0"]', 'Residential');
});
let m0 = (await marks())[0];
ok(m0[1] === 25 && m0[2] === 40, 'the numbers go in: ' + JSON.stringify(m0));
eq(await page.evaluate(() => conditionCapacity(getConditions()[0])), 54,
  'and capacity comes out of them — 25 + 1.6/1.3 × 0.6 × 40');
eq(await page.$eval('#lmBody tr[data-ci="0"] input[data-desc]', e => e.value), 'Residential',
  'the description is editable too');

console.log('   renaming carries the drawing with it');
await page.evaluate(() => {
  state.levels = [{ id: 'L', name: '2', elevation: 10, slabThickness: 9, defaultCapacity: 0, zones: [], slabZones: [], defMark: '1' }];
  zonesOf(state.levels[0], 'loading').push({ id: 'z', polygon: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }], mark: '1', capacityPSF: 54 });
  renderLoadMapTable();
});
await page.evaluate(() => {
  const e = document.querySelector('#lmBody tr[data-ci="0"] input[data-mk]');
  e.value = 'A1'; e.dispatchEvent(new Event('change', { bubbles: true }));
});
eq((await marks())[0][0], 'A1', 'the mark is renamed');
eq(await page.evaluate(() => [state.levels[0].zones[0].mark, state.levels[0].defMark].join(',')), 'A1,A1',
  'and every area and typical floor tagged with it comes along');
await page.evaluate(() => {
  const e = document.querySelector('#lmBody tr[data-ci="1"] input[data-mk]');
  e.value = 'A1'; e.dispatchEvent(new Event('change', { bubbles: true }));
});
eq((await marks())[1][0], '2', 'a rename onto a mark already there is refused');
ok(/already in the schedule/.test(await lastToast()), 'and says so: ' + JSON.stringify(await lastToast()));

console.log('   deleting');
const d0 = await page.evaluate(() => history.depth());
sayYes = false;
await page.click('#lmBody tr[data-ci="0"] button[data-del]');
eq((await marks()).length, 3, 'deleting a mark an area uses asks first, and no means no');
eq(await page.evaluate(() => history.depth()), d0, 'nothing on the undo stack for a refused delete');
sayYes = true;
await page.click('#lmBody tr[data-ci="0"] button[data-del]');
eq((await marks()).length, 2, 'yes deletes it');
await page.click('#lmBody tr[data-ci="1"] button[data-del]');
eq((await marks()).length, 1, 'an unused mark goes without a question');
await page.evaluate(() => { history.undo(); history.undo(); });
eq((await marks()).length, 3, 'and both come back');

// ── C. his own capacity chart, imported ─────────────────────────────────
console.log('C. importing the Kalae capacity chart');
await reset();
await takeFile('Kalae Reshore Calcsv2.xlsx');
const P = await page.evaluate(() => ({
  sheet: loadImport.parse.sheetName, sheets: loadImport.parse.sheets.length,
  target: loadImport.target, n: loadImport.rows.length, skipped: loadImport.parse.skipped,
  checked: loadImport.parse.checked, agreed: loadImport.parse.agreed,
  bad: loadImport.rows.filter(r => r.capMismatch).length,
  statuses: [...new Set(loadImport.rows.map(r => r.status))],
  picked: loadImport.rows.filter(r => r.pick).length,
}));
eq(P.sheet, 'Floor Capacity Chart', 'it found the chart, not the first tab of the workbook');
eq(P.sheets, 2, 'having looked through every sheet');
eq(P.target, 'combined', 'SDL and LL on one row is a combined chart');
eq(P.n, 27, 'all 27 marks');
eq(P.skipped, 2, 'the two footnote lines skipped as notes, not read as marks');
eq(P.checked, 27, 'every row checked against the total capacity the sheet states');
eq(P.agreed, 27, 'and every one of them agrees with ours');
eq(P.bad, 0, 'nothing that does not add up');
eq(P.statuses.join(','), 'new', 'against an empty schedule they are all new');
eq(P.picked, 27, 'so all 27 are ticked');
const red = await page.evaluate(() => loadImport.rows.filter(r => r.reducible).map(r => r.mark));
ok(red.includes('1') && red.includes('3') && !red.includes('4') && !red.includes('11'),
  'the * on the mark is read as a reduced live load: ' + red.join(','));
eq(await page.evaluate(() => loadImport.rows.find(r => r.mark === '4').basis),
  'no * on the mark, so full live load', 'and its absence as a full one');
eq(await page.evaluate(() => loadImport.rows.find(r => r.mark === '11').stated), 2107,
  'the stated capacity rides along for the check');

console.log('   nothing is written until you import');
eq((await marks()).length, 0, 'the schedule is still empty');
eq(await page.evaluate(() => history.depth()), 0, 'and the undo stack untouched');
const pt = await panelText();
ok(/nothing is written until you import/.test(pt), 'the panel says so: ' + pt.slice(0, 70));
ok(/27 new/.test(pt) && /0 changed/.test(pt), 'with the count of each');
ok(/2 rows skipped as headings or notes/.test(pt), 'and what it left out');
ok(/Checked against the sheet's own total capacity: 27 agree/.test(pt), 'and the check: '
  + (pt.match(/Checked[^.]*\./) || [''])[0]);

const before = await page.evaluate(() => history.depth());
await page.click('#liApply');
eq((await marks()).length, 27, 'Import writes them');
eq(await page.evaluate(() => history.depth()), before + 1, 'as ONE undo entry');
eq(await page.evaluate(() => conditionCapacity(conditionByMark('1'))), 54, 'mark 1 comes out at the 54 PSF his sheet states');
eq(await page.evaluate(() => conditionCapacity(conditionByMark('11'))), 2107, 'and mark 11 at 2107');
eq(await page.evaluate(() => conditionCapacity(conditionByMark('12'))), 401, 'and mark 12 at 401');
ok((await marks()).every(m => m[4] === 'import'), 'every row knows it was imported');
ok(/imported from Kalae Reshore Calcsv2.xlsx/.test(await chartText()), 'and the status line names the file');
ok(await page.$eval('#lmImportPanel', e => e.style.display === 'none'), 'the review closes behind it');
await page.evaluate(() => history.undo());
eq((await marks()).length, 0, 'one Ctrl+Z takes all 27 back out');
await page.evaluate(() => history.redo());

// ── D. importing onto a schedule that already has marks ─────────────────
console.log('D. the second import');
await page.evaluate(() => {
  const c = conditionByMark('2'); c.ll = 120;           // changed
  conditionByMark('3').desc = 'Mechanical';
  const i = getConditions().findIndex(x => String(x.mark) === '5');
  getConditions().splice(i, 1);                          // missing
});
await takeFile('Kalae Reshore Calcsv2.xlsx');
const D = await page.evaluate(() => ({
  n: loadImport.rows.length,
  neu: loadImport.rows.filter(r => r.status === 'new').map(r => r.mark),
  chg: loadImport.rows.filter(r => r.status === 'changed').map(r => r.mark),
  same: loadImport.rows.filter(r => r.status === 'same').length,
  pickedSame: loadImport.rows.filter(r => r.status === 'same' && r.pick).length,
  fields: loadImport.rows.find(r => r.mark === '2').fields,
}));
eq(D.neu.join(','), '5', 'the mark that is missing reads as new');
eq(D.chg.join(','), '2', 'the one whose number changed reads as changed');
eq(D.same, 25, 'and the other 25 as already the same');
eq(D.pickedSame, 0, 'an unchanged row arrives unticked — there is nothing to do to it');
eq(JSON.stringify(D.fields), JSON.stringify([{ f: 'LL', was: 120, now: 100 }]),
  'the changed row says what changes, old to new');
ok(/LL 120 → 100/.test(await panelText()), 'and shows it that way round: '
  + ((await panelText()).match(/LL 120[^·]*/) || [''])[0]);
await page.click('#liApply');
eq(await page.evaluate(() => conditionByMark('2').ll), 100, 'applying takes the file\'s value');
eq((await marks()).length, 27, 'and puts the missing mark back');
eq(await page.evaluate(() => conditionByMark('3').desc), 'Mechanical',
  'a description the file has nothing to say about is left alone');
eq(await page.evaluate(() => getConditions().map(c => String(c.mark)).join(',')),
  [...Array(23)].map((_, i) => i + 1).concat([25, 26, 31, 32]).join(','),
  'and the chart stays in mark order');

// ── E. reading the drawings again ───────────────────────────────────────
console.log('E. a re-scan keeps what he typed and flags the difference');
const conflict = await page.evaluate(() => {
  // what a scan of the drawings would have found: mark 1 agreeing, mark 2
  // disagreeing, mark 99 not in the chart at all
  const m = mergeScanIntoConditions({ shape: 'combined', pagesWith: [3], conflicts: [], marks: [
    { mark: '1', desc: '', sdl: 25, ll: 40, conc: null, pages: [3] },
    { mark: '2', desc: '', sdl: 20, ll: 90, conc: null, pages: [3] },
    { mark: '99', desc: 'new off the sheet', sdl: 10, ll: 50, conc: null, pages: [3] },
  ] });
  renderLoadMapTable();
  const c2 = conditionByMark('2');
  return { m, two: [c2.sdl, c2.ll, c2.scan_sdl, c2.scan_ll], one: hasClash(conditionByMark('1')),
    n: getConditions().length, n99: conditionByMark('99') ? conditionByMark('99').source || 'drawing' : null };
});
eq(conflict.two.slice(0, 2).join(','), '15,100', 'the imported values are NOT overwritten');
eq(conflict.two.slice(2).join(','), '20,90', 'what the drawings read is kept beside them');
eq(conflict.m.clashed, 1, 'one clash reported');
ok(!conflict.one, 'a mark the drawings agree with is not flagged');
eq(conflict.n, 28, 'a mark only the drawings have is still added');
eq(conflict.n99, 'drawing', 'and is marked as coming from them');
const ct = await chartText();
ok(/the drawings read SDL 20 · LL 90/.test(ct), 'the row says what the sheet has: '
  + ((ct.match(/the drawings read[^\n]*/) || [''])[0] || '').slice(0, 60));
ok(/take it/.test(ct), 'with one click to take it');
await page.click('#lmBody tr[data-ci="1"] button[data-take]');
eq(await page.evaluate(() => [conditionByMark('2').sdl, conditionByMark('2').ll].join(',')), '20,90',
  'which applies the drawing\'s numbers');
ok(await page.evaluate(() => !hasClash(conditionByMark('2')) && conditionByMark('2').source === 'drawing'),
  'and the row is the drawing\'s from then on');
await page.evaluate(() => history.undo());
eq(await page.evaluate(() => [conditionByMark('2').sdl, conditionByMark('2').ll].join(',')), '15,100',
  'undo puts his numbers back');

// ── F. the guards, and the template ─────────────────────────────────────
console.log('F. guards');
const notASchedule = await page.evaluate(async () => {
  const csv = 'Some notes\nabout nothing\n1,2,3\n';
  try { await takeLoadFile(new File([csv], 'notes.csv')); } catch (e) {}
  const t = document.querySelectorAll('.toast');
  return { open: !!loadImport, t: t.length ? t[t.length - 1].textContent : '' };
});
ok(!notASchedule.open && /no load schedule/.test(notASchedule.t),
  'a file with no schedule in it says what it was looking for: ' + JSON.stringify(notASchedule.t));
const csvOk = await page.evaluate(async () => {
  await takeLoadFile(new File(['Mark,Description,SDL,LL,Reducible\nZ,Plaza,60,100,yes\n'], 'hand.csv'));
  return loadImport && { n: loadImport.rows.length, mark: loadImport.rows[0].mark,
    red: loadImport.rows[0].reducible, basis: loadImport.rows[0].basis,
    cap: markCapacity(loadImport.rows[0].sdl, loadImport.rows[0].ll, loadImport.rows[0].reducible) };
});
ok(csvOk && csvOk.n === 1 && csvOk.mark === 'Z' && csvOk.cap === 133,
  'a CSV with plain headings reads too: ' + JSON.stringify(csvOk));
ok(/Reducible column/.test(csvOk.basis), 'and a Reducible column beats the * convention: ' + csvOk.basis);
await page.evaluate(() => { loadImport = null; renderLoadImportPanel(); });
const nothingTicked = await page.evaluate(() => {
  loadImport = { parse: { fileName: 'x.csv' }, rows: [{ mark: 'Q', pick: false, status: 'same', fields: [] }], target: 'combined' };
  const n = applyLoadImport();
  const t = document.querySelectorAll('.toast');
  const r = { n, t: t.length ? t[t.length - 1].textContent : '', still: !!loadImport };
  loadImport = null; renderLoadImportPanel(); return r;
});
ok(nothingTicked.n === 0 && /Nothing ticked/.test(nothingTicked.t) && nothingTicked.still,
  'importing with nothing ticked does nothing and stays open: ' + JSON.stringify(nothingTicked));
ok(await page.evaluate(() => /Designation,Description,SDL \(psf\),LL \(psf\)/.test(LOAD_TEMPLATE)),
  'the blank template carries the headings the import reads');
ok(await page.evaluate(() => { const r = parseLoadRows(readCsvRows(LOAD_TEMPLATE.replace(/^#.*$/gm, '')), 't'); return r && r.rows.length === 3 }),
  'and the template imports straight back in');

// a split job keeps its shape
console.log('   a split job stays split');
await reset();
await page.click('#lsSplit');
await takeFile('Kalae Reshore Calcsv2.xlsx');
eq(await page.evaluate(() => loadImport.target), 'll', 'a combined file lands in the live-load schedule');
ok(await page.evaluate(() => loadImport.mixedShape), 'and the panel knows it is a half fit');
ok(/live and dead load marks/.test(await panelText()), 'saying so in words: '
  + ((await panelText()).match(/This job keeps[^.]*\./) || [''])[0]);
await page.click('#liApply');
eq(await shape(), 'split', 'still split afterwards');
ok(await page.evaluate(() => llSchedule().length >= 27 && getConditions().length === 0),
  'the marks went into the live-load schedule and nothing into a combined chart');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

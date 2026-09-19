// @rules BLD-04  (see DECISIONS.md)
// EVERY SHEET, ONE ROW, LEVEL AND ZONE (Sep 17 2026)
// Adolfo: "The sheet assigning is still clunky. We need to be able to assign
// level and zone for each sheet. The calculator incorrectly assumes some
// drawings are not floor plans and it also is not very intuitive what is going
// on when the floor is split up into multiple sheets."
//
//  A. the reading: a drawing that calls itself a plan is a plan, even when the
//     sheet also carries a building section, and the zone comes out of the
//     title block instead of being typed
//  B. the table: a row per page, with what the title block says
//  C. assigning a floor from the table, and naming its zone
//  D. a floor on two sheets reads as that, and taking a sheet off says what
//     it takes with it
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
page.on('dialog', d => d.accept());
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const KIN = path.resolve(here, '..', 'Kinect');
const pdf = fs.readFileSync(path.join(KIN, '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));
await page.evaluate(async ([b64]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  document.getElementById('upload-prompt').style.display = 'none';
  setStep('drawings');
  await readSheetTitles(true);
}, [pdf.toString('base64')]);

// ── A. the reading ─────────────────────────────────────────────────────
console.log('A. what each sheet says about itself');
const C = await page.evaluate(() => [...sheetRead.values()].map(x =>
  ({ page: x.page, kind: x.kind, level: x.levelName || null, zone: x.zone || '', conf: x.conf, title: x.title })));
console.log('   ' + C.map(c => `${c.page}:${c.kind}${c.level ? '/' + c.level : ''}${c.zone ? '/' + c.zone : ''}`).join('  '));
const plans = C.filter(c => c.kind === 'plan');
ok(plans.length === 7, 'all seven plan sheets read as plans (the set gained a page on Sep 17): ' + JSON.stringify(C.filter(c => c.kind !== 'plan').map(c => [c.page, c.kind])));
const p8 = C.find(c => c.page === 9);
ok(p8.kind === 'plan' && p8.level === '2',
  'sheet 9 — the one whose BUILDING SECTION title used to win — is a plan of Level 2: ' + JSON.stringify(p8));
ok(p8.conf === 'medium' || p8.conf === 'high', 'read with a stated confidence: ' + p8.conf);
ok(C.find(c => c.page === 8).zone === 'North' && C.find(c => c.page === 9).zone === 'South'
   && C.find(c => c.page === 10).zone === 'North' && C.find(c => c.page === 11).zone === 'South',
  'North and South come straight out of the title blocks: ' + JSON.stringify(plans.map(c => [c.page, c.zone])));
ok(C.filter(c => c.kind === 'loadmap').length === 5, 'the five loading plans are still load maps');
ok(await page.evaluate(() => [sheetZoneFromTitle('L3 (SOFFIT PLAN) - SOUTH'), sheetZoneFromTitle('LEVEL 2 PLAN AREA B'),
  sheetZoneFromTitle('LEVEL 2 - ZONE 3'), sheetZoneFromTitle('LEVEL-4 (SOFFIT PLAN)')].join('|'))
  === 'South|Zone B|Zone 3|', 'areas and zones are read too, and a sheet with no zone gets none');

// ── B. the table ───────────────────────────────────────────────────────
console.log('B. a row per page');
const T = await page.evaluate(() => {
  renderSheetTable();
  const host = document.getElementById('sheetTable');
  const rows = [...host.querySelectorAll('.st-row')];
  return { shown: host.style.display !== 'none', rows: rows.length,
    pages: rows.map(r => +r.dataset.stpage),
    selects: host.querySelectorAll('select[data-stsel]').length,
    opts: [...host.querySelector('select[data-stsel]').options].map(o => o.value),
    suggest: [...host.querySelectorAll('button[data-stuse]')].map(b => [+b.dataset.stuse, b.dataset.stlv]) };
});
ok(T.shown && T.rows === 12, 'every page of the set has a row: ' + T.rows);
ok(JSON.stringify(T.pages) === JSON.stringify([1,2,3,4,5,6,7,8,9,10,11,12]), 'in page order');
ok(T.selects === 12, 'each with its own Floor picker');
ok(T.opts.includes('') && T.opts.includes('skip') && T.opts.includes('new'),
  '"not assigned", "not a floor plan" and "+ new level" are choices, not verdicts: ' + JSON.stringify(T.opts));
ok(T.suggest.some(s => s[0] === 9 && s[1] === '2'), 'sheet 9 offers its reading as a one-click suggestion: ' + JSON.stringify(T.suggest));

// ── C. assigning, and the zone ─────────────────────────────────────────
console.log('C. assigning a floor and naming the zone');
const A = await page.evaluate(() => {
  // the suggestion button creates the level and binds the sheet
  document.querySelector('button[data-stuse="8"]').click();
  const lv = state.levels[levelForPage(8)];
  return { level: lv && lv.name, page: lv && lv.pdfPage, zone: lv && sheetZoneName(lv, 8),
           levels: state.levels.length };
});
ok(A.level === '2' && A.page === 8, 'one click puts sheet 8 on a new Level 2: ' + JSON.stringify(A));
ok(A.zone === 'North', 'and takes the zone from the title block — nothing typed: ' + A.zone);
const B = await page.evaluate(() => {
  // and the dropdown assigns the south sheet to the same floor
  const sel = document.querySelector('select[data-stsel="9"]');
  const i = [...sel.options].findIndex(o => o.textContent === '2');
  sel.value = sel.options[i].value; sel.dispatchEvent(new Event('change'));
  const lv = state.levels[levelForPage(9)];
  return { pages: levelSheets(lv).map(s => s.page), zones: levelSheets(lv).map(s => sheetZoneName(lv, s.page)) };
});
ok(JSON.stringify(B.pages) === '[8,9]' && JSON.stringify(B.zones) === '["North","South"]',
  'the second sheet joins the same floor, each with its own zone: ' + JSON.stringify(B));
// the zone is a picker from the job's list now (Sep 17 2026); a new name is
// added through it and then offered everywhere
const Z = await page.evaluate(() => {
  const sel = document.querySelector('select[data-stzone="9"]');
  const opts = [...sel.options].map(o => o.value);
  setSheetZoneFor(9, 'South half');
  renderSheetTable();
  const sel2 = document.querySelector('select[data-stzone="9"]');
  return { opts, zone: sheetZoneName(state.levels[levelForPage(9)], 9), now: sel2.value, list: projectZones().slice() };
});
ok(Z.opts[0] === '' && Z.opts.includes('North') && Z.opts.includes('South') && Z.opts.includes('__new'), 'the picker offers Whole floor, the job\'s zones and add-a-zone: ' + JSON.stringify(Z.opts));
ok(Z.zone === 'South half' && Z.now === 'South half' && Z.list.includes('South half'), 'a new zone name is taken and joins the list: ' + JSON.stringify(Z));

// ── D. a split floor, and taking a sheet off ───────────────────────────
console.log('D. what the table says about a split floor');
const S = await page.evaluate(() => {
  renderSheetTable();
  const el = document.querySelector('#sheetTable .st-split');
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
});
ok(/2 is on 2 sheets/.test(S || '') && /North/.test(S) && /South half/.test(S),
  'the split is spelled out: ' + S);
const D = await page.evaluate(() => {
  const lv = state.levels[levelForPage(9)];
  lv.slabZones.push({ id: 'zz', kind: 'slab', page: 9, polygon: [{x:0,y:0},{x:9,y:0},{x:9,y:9}] });
  const sel = document.querySelector('select[data-stsel="9"]');
  sel.value = 'skip'; sel.dispatchEvent(new Event('change'));   // dialog auto-accepted
  const after = { pages: levelSheets(lv).map(s => s.page), skipped: pageIsSkipped(9),
                  gone: !lv.slabZones.some(z => z.id === 'zz') };
  history.undo();
  // undo replaces the level objects, so look the floor up again
  const back = state.levels.find(l => l.name === '2');
  return { after, back: levelSheets(back).map(s => s.page), kept: back.slabZones.some(z => z.id === 'zz') };
});
ok(JSON.stringify(D.after.pages) === '[8]' && D.after.skipped && D.after.gone,
  'taking the sheet off removes it and its areas, after asking: ' + JSON.stringify(D.after));
ok(JSON.stringify(D.back) === '[8,9]' && D.kept, 'and one undo puts both back: ' + JSON.stringify(D));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);

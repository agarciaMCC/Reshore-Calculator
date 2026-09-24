// @rules UI-33, BLD-22, UI-13  (see DECISIONS.md)
// The Levels table on the table system (Sep 23 2026): fixed columns with the
// headers over their fields, SOG and Typical Floor? as boxes, shore height
// and F2F working off each other on a range, a Show button per row, a green
// Confirm, the import with the other hand tools — and the reader picking a
// slab-on-grade elevation out of a bubble-and-leader tag.
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(a === b, m + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const mk = (name, elevation, slab) => ({ id: Math.random().toString(36).slice(2), name, elevation, floorToFloor: null, slabThickness: slab,
  defaultCapacity: 0, rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [] });
const setup = () => page.evaluate(levels => {
  state.project = { name: 'levels-table', loadingConditions: [], shoreChoices: {} };
  state.levels = levels; state.activeLevelIdx = 0; state.activeZoneIdx = null; state.results = null; state.ui.rangeOpen = null;
  setStep('levels'); renderSidebar(); renderNow();
}, [mk('Roof', 40, 8), mk('3', 30, 8), mk('2', 20, 8), mk('1', 10, 8)]);

console.log('A. one grid: the headers sit over their fields and read as asked (UI-33, UI-13)');
await setup();
{
  const r = await page.evaluate(() => {
    const head = document.querySelector('#levelList .tbl-head');
    const cols = [...head.querySelectorAll('span[data-col]')].map(s => s.textContent.trim());
    const rows = [...document.querySelectorAll('#levelList .sb-item .lvl-main')];
    const left = (el) => Math.round(el.getBoundingClientRect().left);
    const right = (el) => Math.round(el.getBoundingClientRect().right);
    const hdr = c => head.querySelector(`span[data-col="${c}"]`);
    const misaligned = [];
    for (const row of rows) {
      const el = row.querySelector('.lvl-edit[data-f="elevation"]'), sl = row.querySelector('.lvl-edit[data-f="slab"]');
      if (Math.abs(right(hdr('elevation')) - right(el)) > 2) misaligned.push('elev');
      if (Math.abs(right(hdr('slab')) - right(sl)) > 2) misaligned.push('slab');
      if (Math.abs(left(hdr('name')) - left(row.querySelector('.lvl-namecell'))) > 2) misaligned.push('name');
    }
    const widths = rows.map(r => Math.round(r.querySelector('.lvl-edit[data-f="elevation"]').getBoundingClientRect().width));
    const nameW = Math.round(rows[0].querySelector('.lvl-name-in').getBoundingClientRect().width);
    const elevW = widths[0];
    return { cols, misaligned, sameWidth: widths.every(w => w === widths[0]), nameW, elevW, grid: getComputedStyle(rows[0]).display };
  });
  eq(r.cols.join('|'), 'Level|TOS Elev|Slab Thickness (in)|SOG|Typical Floor?|Sheet|', 'the columns read Level · TOS Elev · Slab Thickness (in) · SOG · Typical Floor? · Sheet');
  eq(r.grid, 'grid', 'every row is a grid row on the shared columns');
  eq(r.misaligned.length, 0, 'headers sit over their fields on every row: ' + JSON.stringify(r.misaligned));
  ok(r.sameWidth, 'the elevation field is the same width on every row');
  ok(r.elevW >= 80 && r.nameW < 260, 'the elevation column is wide enough for feet-inches and the name column no longer hogs the row: ' + JSON.stringify([r.elevW, r.nameW]));
}

console.log('B. SOG is a box; ticking it marks the floor on grade');
await setup();
{
  const r0 = await page.$$eval('#levelList .lvl-sog', b => b.map(b => b.type + ':' + b.checked));
  eq(r0.join(','), 'checkbox:false,checkbox:false,checkbox:false,checkbox:false', 'a checkbox per floor, none ticked');
  await page.click('#levelList .lvl-sog[data-soglevel="3"]');
  ok(await page.evaluate(() => levelOnGrade(state.levels[3])), 'ticking marks the floor slab on grade');
  ok(await page.$eval('#levelList .sb-item[data-level="3"] .lvl-sog', b => b.checked), 'and the box stays ticked after the re-render');
  ok(await page.$eval('#levelList .sb-item[data-level="3"] .lvl-meta', e => /slab on grade/.test(e.textContent)), 'the line under the row says so');
  await page.click('#levelList .lvl-sog[data-soglevel="3"]');
  ok(await page.evaluate(() => !levelOnGrade(state.levels[3])), 'unticking makes it suspended again');
}

console.log('C. Typical Floor? is a box; ticking it asks for the range and the shore height');
await setup();
{
  ok(await page.$eval('#levelList .sb-item[data-level="1"]', r => !r.querySelector('.lvl-range')), 'no range fields on a plain floor');
  await page.click('#levelList .lvl-typ[data-morelevel="1"]');
  const r = await page.evaluate(() => {
    const row = document.querySelector('#levelList .sb-item[data-level="1"]');
    const rng = row.querySelector('.lvl-range');
    return { open: !!rng, fields: rng ? [...rng.querySelectorAll('.lvl-edit')].map(e => e.dataset.f) : [], focused: document.activeElement.dataset.f };
  });
  ok(r.open, 'ticking opens the range line under the row');
  eq(r.fields.join(','), 'rangeFrom,rangeTo,shore,f2f', 'with floors from / to, the shore height, and the F2F');
  eq(r.focused, 'rangeFrom', 'and lands in the first of them');
  const set = (f, v) => page.evaluate(([f, v]) => { const e = document.querySelector(`#levelList .sb-item[data-level="1"] .lvl-edit[data-f="${f}"]`); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, [f, v]);
  await set('rangeFrom', '3'); await set('rangeTo', '6');
  await set('shore', "9-9");
  const l = await page.evaluate(() => { const l = state.levels.find(x => x.rangeFrom === 3); return l && { f2f: l.floorToFloor, slab: l.slabThickness, label: rangeLabel(l), isRange: isRange(l) }; });
  ok(l && l.isRange && /^3.6$/.test(l.label), 'from / to make the row a typical range: ' + JSON.stringify(l));
  ok(l && Math.abs(l.f2f - (9.75 + 8 / 12)) < 1e-9, "typing the shore height 9'-9\" with an 8\" slab gives F2F 10'-5\": " + (l && l.f2f));
  const shown = await page.evaluate(() => { const row = document.querySelector('#levelList .sb-item .lvl-range').closest('.sb-item'); return { shore: row.querySelector('.lvl-edit[data-f="shore"]').value, f2f: row.querySelector('.lvl-edit[data-f="f2f"]').value, typ: row.querySelector('.lvl-typ').checked, sog: !!row.querySelector('.lvl-sog') }; });
  eq(shown.f2f, `10'-5"`, 'the F2F field shows it');
  eq(shown.shore, `9'-9"`, 'and the shore height reads back');
  ok(shown.typ && !shown.sog, 'a range row shows Typical ticked and offers no SOG box');
  await page.evaluate(() => { const row = document.querySelector('#levelList .sb-item .lvl-range').closest('.sb-item'); const e = row.querySelector('.lvl-edit[data-f="f2f"]'); e.value = '11'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  const after = await page.evaluate(() => { const row = document.querySelector('#levelList .sb-item .lvl-range').closest('.sb-item'); return row.querySelector('.lvl-edit[data-f="shore"]').value; });
  eq(after, `10'-4"`, 'typing the F2F 11 shows the shore height 10\'-4"');
  // unticking a range makes it one floor again
  await page.evaluate(() => { const row = document.querySelector('#levelList .sb-item .lvl-range').closest('.sb-item'); row.querySelector('.lvl-typ').click(); });
  await page.waitForTimeout(60);
  ok(await page.evaluate(() => !state.levels.some(isRange)), 'unticking Typical Floor? on a range makes it a single floor');
  await page.evaluate(() => history.undo());
  ok(await page.evaluate(() => state.levels.some(isRange)), 'one undo brings the range back');
}

console.log('D. Show opens the level\'s sheet fitted; Confirm is green; the import sits with the hand tools');
await setup();
{
  const r = await page.evaluate(() => ({
    noShow: document.querySelectorAll('#levelList .lvl-show').length,
    confirmGreen: !!document.querySelector('#btnConfirmLevels.btn-go') && !document.querySelector('#btnConfirmLevels.btn-primary'),
    importInHand: !!document.getElementById('lvImportBtn').closest('#byhand-levels'),
    addInHand: !!document.getElementById('btnAddLevel').closest('#byhand-levels'),
  }));
  eq(r.noShow, 0, 'with no sheets assigned there is nothing to show');
  ok(r.confirmGreen, 'Confirm levels is the green confirm, like the other sections');
  ok(r.importInHand && r.addInHand, 'Import from Excel sits in the hand-tools row with Add a level');
  // a stand-in sheet gives the row a Show button
  await page.evaluate(() => { state.pdf.pages = 2; state.pdf.current = 1; state.levels[1].pdfPage = 2; state.drawing.imgW = 2000; state.drawing.imgH = 1500; state.drawing.zoom = 3; renderLevelList(); });
  const s = await page.evaluate(() => ({ btns: [...document.querySelectorAll('#levelList .sb-item')].map(r => !!r.querySelector('.lvl-show')), tab: document.querySelector('#levelList .lvl-show').tabIndex }));
  eq(s.btns.join(','), 'false,true,false,false', 'the one floor with a sheet gets Show');
  eq(s.tab, -1, 'Show is not a Tab stop');
  await page.evaluate(() => { window.__went = null; const g = goToPage; window.goToPage = async n => { window.__went = n; state.pdf.current = n; }; });
  await page.click('#levelList .lvl-show[data-showlevel="1"]');
  await page.waitForTimeout(100);
  const w = await page.evaluate(() => ({ went: window.__went, active: state.activeLevelIdx, zoom: state.drawing.zoom }));
  eq(w.went, 2, 'Show goes to that level\'s sheet');
  eq(w.active, 1, 'makes it the active level');
  ok(w.zoom < 3, 'and fits the sheet to the window');
}

console.log('E. the reader picks a slab-on-grade elevation out of a bubble-and-leader tag (BLD-22)');
{
  await page.reload();
  await page.waitForFunction(() => typeof solveAll === 'function');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} state.levels = []; state.project = { name: 'tag', loadingConditions: [], shoreChoices: {} }; renderSidebar(); });
  await page.setInputFiles('#fileInput', path.resolve(here, 'fixtures', 'sog-tag.pdf'));
  await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    const items = await pageTextCached(1), st = await pageStrokes(1);
    const tags = readSheetElevationTags(items, st);
    const dims = readSheetElevationTags(await pageTextCached(2), await pageStrokes(2));
    const props = await proposeLevelsFromDrawings();
    return { tags: tags.map(t => Math.round(t.f * 96) / 96), dims: dims.length, props: props.map(p => ({ name: p.name, elev: p.elev, n: p.elevN, tot: p.elevTotal, fromTag: p.fromTag, onGrade: p.onGrade })),
      levels: state.levels.map(l => [l.name, l.elevation == null ? null : Math.round(l.elevation * 96) / 96, !!l.onGrade]) };
  });
  eq(JSON.stringify(r.tags), JSON.stringify([197 + 4 / 12, 197 + 4 / 12, 196]), 'the three boxed tags read; the dimension string that says 197\'-4" the same way does not');
  eq(r.dims, 0, 'a sheet with dimension strings and no tags reads nothing');
  const p0 = r.props.find(p => p.name === '0');
  ok(p0 && p0.fromTag && p0.onGrade && Math.abs(p0.elev - (197 + 4 / 12)) < 1e-6 && p0.n === 2 && p0.tot === 3, 'the foundation plan proposes 197\'-4" from the tags (2 of 3 agree), on grade: ' + JSON.stringify(p0));
  const p1 = r.props.find(p => p.name === '1');
  ok(p1 && p1.elev == null && !p1.fromTag, 'the soffit plan with only dimensions proposes no elevation: ' + JSON.stringify(p1));
  ok(r.levels.some(l => l[0] === '0' && Math.abs(l[1] - (197 + 4 / 12)) < 1e-6 && l[2]), 'and the level read on load carries it: ' + JSON.stringify(r.levels));
  const txt = await page.evaluate(async () => { await renderElevProposal(true); return document.getElementById('elevProposal').textContent; });
  ok(/elevation tag/.test(txt), 'the read-again review says the elevation came from the tags');
}

await browser.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

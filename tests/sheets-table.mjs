// @rules UI-33, UI-34, UI-36, BLD-18  (see DECISIONS.md)
// Batch 3 of the Sep 23 2026 list: the Sheets table on the table system with
// nothing back-of-house in the rows, and Match floors as one list where a
// proposed fit is confirmed on its own row.
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
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} state.levels = []; state.project = { name: 'sheets', loadingConditions: [], shoreChoices: {} }; });
await page.setInputFiles('#fileInput', path.resolve(here, 'fixtures', 'test-set.pdf'));
await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 120000 });
await page.waitForTimeout(3000);
await page.evaluate(() => setStep('sheets'));

console.log('A. the Sheets table is one grid with nothing back-of-house in it (UI-33)');
{
  const r = await page.evaluate(() => {
    const host = document.getElementById('sheetTable');
    const head = host.querySelector('.tbl-head'), rows = [...host.querySelectorAll('.tbl-row.st-row')];
    const right = el => Math.round(el.getBoundingClientRect().left);
    const hdr = [...head.children].map(s => s.textContent.trim());
    const floorCol = head.children[2], zoneCol = head.children[3];
    const mis = rows.filter(r => Math.abs(right(r.querySelector('.st-lv')) - right(floorCol)) > 2 || Math.abs(right(r.querySelector('.st-zone')) - right(zoneCol)) > 2).length;
    const first = rows[0];
    return {
      hdr, rows: rows.length, pages: state.pdf.pages, mis,
      toggle: !!host.querySelector('#stToggle, .st-head'),
      also: host.querySelectorAll('select[data-stadd]').length,
      titleOnly: rows.every(r => !r.querySelector('.st-title .lm-dim')),
      kindWords: rows.filter(r => { const t = sheetTableRows().find(x => x.page === +r.dataset.stpage); return r.querySelector('.st-title').textContent.trim() !== (t.title || '(no title read)'); }).length,
      notPlanText: rows.filter(r => /not a floor plan/.test(r.querySelector('.st-state').textContent)).length,
      tip: first.title,
      flagged: rows.filter(r => r.classList.contains('unsure')).map(r => ({ page: +r.dataset.stpage, oneLine: !!r.querySelector('.st-state .st-unsure') && !!r.querySelector('.st-state button[data-stok]') && (() => { const a = r.querySelector('.st-unsure').getBoundingClientRect(), b = r.querySelector('button[data-stok]').getBoundingClientRect(); return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 8 && b.right <= r.getBoundingClientRect().right + 1; })() })),
      loadmap: (() => { const r = sheetTableRows().find(x => x.kind === 'loadmap'); return r && { page: r.page, skipped: r.skipped, unsure: r.unsure }; })(),
    };
  });
  eq(r.hdr.join('|'), 'Pg|Title block|Floor|Zone|', 'the columns read Pg · Title block · Floor · Zone');
  eq(r.rows, r.pages, 'a row per page, all in view');
  eq(r.mis, 0, 'the Floor and Zone pickers sit under their headers on every row');
  ok(!r.toggle, 'the table is not folded behind a toggle');
  eq(r.also, 0, 'no "+ also serves" picker');
  ok(r.titleOnly && r.kindWords === 0, 'the row shows the title block alone — what the reader made of it is not written under it');
  eq(r.notPlanText, 0, '"not a floor plan" is the picker\'s value, not a second line');
  ok(/read as a/.test(r.tip), 'the reader\'s verdict lives in the row tooltip: ' + r.tip);
  ok(r.flagged.length > 0 && r.flagged.every(f => f.oneLine), 'a row to check carries its flag and Looks right on one line: ' + JSON.stringify(r.flagged));
  ok(r.loadmap && r.loadmap.skipped && !r.loadmap.unsure, 'the load-map sheet is recognized from its title and set not a floor plan, unflagged (BLD-18): ' + JSON.stringify(r.loadmap));
}

console.log('B. Match floors is one list: the proposed fit is confirmed on its row (UI-34)');
{
  await page.evaluate(() => { confirmLevels(); setStep('match'); });
  await page.waitForFunction(() => !!matchProposal && !matchRead, null, { timeout: 180000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const el = document.getElementById('matchList');
    const rows = [...el.querySelectorAll('.match-row')];
    return {
      panel: !!el.querySelector('.mp-panel, .mp-head'),
      proposed: rows.filter(r => r.classList.contains('proposed')).length,
      total: rows.length, nFit: matchProposal.rows.filter(x => x.fit && x.pick).length,
      perRow: rows.filter(r => r.querySelector('button[data-mpuse]') && r.querySelector('button[data-mshow]') && /proposed/.test(r.textContent)).length,
      secondConfirm: el.querySelectorAll('button[data-mconfirm]').length,
      primary: (document.getElementById('btnConfirmProposed') || {}).textContent,
      lists: el.querySelectorAll('.match-row').length === matchSheetRows().length,
    };
  });
  ok(!r.panel, 'no separate "Proposed matches" panel above the sheets');
  ok(r.proposed === r.nFit && r.perRow === r.nFit, 'every proposed fit sits on its sheet row with Show grid and Confirm: ' + JSON.stringify(r));
  eq(r.secondConfirm, 0, 'and nothing asks to be confirmed twice');
  ok(/^Confirm all \d+ proposed matches$/.test((r.primary || '').trim()), 'one primary confirms them all: ' + r.primary);
  ok(r.lists, 'the list is the sheet list itself, one row per sheet');
  // UI-36: the grid shows itself — the sheet on screen draws its proposed fit with no button pressed,
  // and clicking a proposed row previews it rather than asking for two crossings
  const auto = await page.evaluate(async () => { const r = matchProposal.rows.find(x => x.fit); await goToPage(r.page); return { preview: !!state.ui.matchPreview && state.ui.matchPreview.page === state.pdf.current, align: state.align.active }; });
  ok(auto.preview && !auto.align, 'paging to a proposed sheet on Match floors draws its proposed fit, and asks for no points: ' + JSON.stringify(auto));
  const other = await page.evaluate(() => { const rows = [...document.querySelectorAll('#matchList .match-row.proposed')]; const r = rows.find(x => +x.dataset.reviewpage !== state.pdf.current); r.click(); return { page: +r.dataset.reviewpage }; });
  await page.waitForFunction(pg => state.pdf.current === pg && state.ui.matchPreview && state.ui.matchPreview.page === pg, other.page, { timeout: 20000 });
  ok(await page.evaluate(() => !state.align.active && !!state.ui.matchPreview), 'clicking another proposed row opens that sheet with its proposed grid drawn, no pick-two-points prompt');
  const toasts = await page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).filter(t => /two grid crossings/.test(t)).length);
  eq(toasts, 0, 'and no "click two grid crossings" toast');
  await page.click('#matchList button[data-mpuse]');
  await page.waitForTimeout(300);
  const one = await page.evaluate(() => ({ matched: matchSheetRows().filter(x => x.matched).length, confirmed: matchSheetRows().filter(x => x.confirmed).length, scale: !!(state.project.planScale && state.project.planScale.confirmed) }));
  ok(one.matched === 1 && one.confirmed === 1, 'one press writes the fit and confirms it: ' + JSON.stringify(one));
  ok(one.scale, 'and confirms the plan scale it was made at (BLD-19)');
  await page.click('#btnConfirmProposed');
  await page.waitForTimeout(300);
  const all = await page.evaluate(() => ({ st: stepStatus('match'), proposal: !!matchProposal, confirmed: matchSheetRows().filter(x => x.confirmed).length, total: matchSheetRows().length }));
  ok(all.confirmed === all.total && all.st.done && !all.proposal, 'Confirm all finishes the step: ' + JSON.stringify(all));
  // once written, paging to a sheet draws its fitted grid by itself
  await page.evaluate(async () => { state.ui.gridReview = null; state.ui.matchPreview = null; const r = matchSheetRows().find(x => x.page !== state.pdf.current); await goToPage(r.page); });
  ok(await page.evaluate(() => !!state.ui.gridReview && state.ui.gridReview.page === state.pdf.current), 'paging to a matched sheet on Match floors draws its grid without pressing Show grid');
}

await browser.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

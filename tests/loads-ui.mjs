// @rules UI-38, UI-33, LOD-08  (see DECISIONS.md)
// Batch 5 of the Sep 23 2026 list — the Loads step: the Add buttons at the
// top of their own tables, the typical-capacity block on the table system
// with nothing shifting when a mark is picked, Notes editable on both
// schedules, the hand tools closing the step.
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

const setup = shape => page.evaluate(shape => {
  const mk = (name, el) => ({ id: sid(), name, elevation: el, floorToFloor: null, slabThickness: 8, defaultCapacity: 0, rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [] });
  state.project = { name: 'loads-ui', loadingConditions: [], shoreChoices: {} };
  state.levels = [mk('4', 40), mk('3', 30), mk('2', 20), mk('1', 10)];
  if (shape === 'split') {
    state.project.llSchedule = [{ mark: 'A', desc: 'TYP', load: 40, reducible: true, comments: '', confirmed: true, source: 'manual' }, { mark: 'B', desc: 'STAIRS', load: 100, reducible: false, comments: 'NOTE 5', confirmed: true, source: 'manual' }];
    state.project.sdlSchedule = [{ mark: '1', desc: 'TYP', load: 15, comments: '', confirmed: true, source: 'manual' }, { mark: '2', desc: 'TOPPING', load: 90, comments: '', confirmed: true, source: 'manual' }];
    state.project.loadingConditions = [];
  } else {
    state.project.llSchedule = []; state.project.sdlSchedule = [];
    state.project.loadingConditions = [{ mark: '1', desc: 'TYP', sdl: 15, ll: 40, confirmed: true }, { mark: '2', desc: 'HEAVY', sdl: 30, ll: 100, confirmed: true }];
  }
  state.activeLevelIdx = 0; state.results = null;
  setStep('loads'); renderLoadMapTable(); renderLoadActions(); renderSidebar();
  return scheduleShape();
}, shape);

console.log('A. split schedules: Add buttons at the top of their own tables, colored; Notes on both, editable (UI-38)');
{
  eq(await setup('split'), 'split', 'a split schedule is up');
  const r = await page.evaluate(() => {
    const regions = [...document.querySelectorAll('#lmSplit .sched-region')];
    const pos = (region, sel) => { const el = region.querySelector(sel); return el ? [...region.querySelectorAll('*')].indexOf(el) : -1; };
    const ll = regions[0], sdl = regions[1];
    const heads = [...document.querySelectorAll('#lmSplit .lm-table thead th')].map(t => t.textContent.replace(/\s+/g, ' ').trim());
    const col = getComputedStyle(ll.querySelector('#lmAddLL')).backgroundColor;
    return {
      llAdd: !!ll.querySelector('#lmAddLL'), sdlAdd: !!sdl.querySelector('#lmAddSDL'),
      llAbove: pos(ll, '#lmAddLL') < pos(ll, 'tbody tr'), sdlAbove: pos(sdl, '#lmAddSDL') < pos(sdl, 'tbody tr'),
      colored: col !== 'rgba(0, 0, 0, 0)' && col !== 'rgb(255, 255, 255)' && !/^rgb\(2[45]\d, 2[45]\d, 2[45]\d\)$/.test(col), col,
      heads, notesInputs: document.querySelectorAll('#lmSplit input[data-lnote], #lmSplit input[data-snote]').length,
      bar: (document.getElementById('lmActions') || {}).style ? document.getElementById('lmActions').style.display : null,
      combinedHidden: getComputedStyle(document.getElementById('lmCombined')).display === 'none',
      handLast: (() => { const pl = document.getElementById('p-loads'); const kids = [...pl.children].filter(c => c.offsetParent !== null || c.classList.contains('sec-next')); const i = kids.indexOf(document.getElementById('byhand-loads')); return i >= 0 && kids.slice(i + 1).every(c => c.classList.contains('sec-next')); })(),
    };
  });
  ok(r.llAdd && r.sdlAdd, 'each table carries its own Add button');
  ok(r.llAbove && r.sdlAbove, 'and it sits above the rows, not under them');
  ok(r.colored, 'the Add buttons are colored so they read as actions: ' + r.col);
  ok(r.heads.filter(h => h === 'Notes').length === 2 && !r.heads.includes('Comments'), 'both tables head the column "Notes": ' + JSON.stringify(r.heads));
  eq(r.notesInputs, 4, 'the notes are inputs, one per mark');
  eq(r.bar, 'none', 'the old buttons bar under the chart is gone for a split schedule');
  ok(r.combinedHidden, 'the combined chart\'s header is not shown over the split tables');
  ok(r.handLast, 'the read again / import / add by hand row closes the step');
  await page.fill('#lmSplit input[data-snote="1"]', 'NOTE 7'); await page.keyboard.press('Tab');
  await page.waitForTimeout(100);
  eq(await page.evaluate(() => sdlSchedule()[1].comments), 'NOTE 7', 'typing a note on a dead-load mark stores it');
  await page.fill('#lmSplit input[data-lnote="0"]', 'see plan'); await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  eq(await page.evaluate(() => llSchedule()[0].comments), 'see plan', 'and on a live-load mark');
  ok(await page.evaluate(() => { const n = llSchedule().length; document.getElementById('lmAddLL').click(); return llSchedule().length === n + 1 && !!document.getElementById('lmAddLL'); }), 'Add a live-load mark adds a row and the button stays at the top');
}

console.log('B. the typical-capacity block is a grid; picking a mark shifts nothing (UI-33)');
{
  await setup('split');
  const r = await page.evaluate(() => {
    const blk = document.getElementById('lmTypical');
    const head = [...blk.querySelectorAll('.tbl-head span')].map(s => s.textContent.trim());
    const row = blk.querySelector('.typ-brow[data-tli="1"]');
    const box = el => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width)]; };
    const before = { psf: box(row.querySelector('.tb-psfcell')), state: box(row.querySelector('.tb-state')), cap: !!row.querySelector('.lvl-edit[data-f="cap"]') };
    const sel = row.querySelector('.lvl-edit[data-f="defLL"]'); sel.value = 'A'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    const sel2 = document.querySelector('#lmTypical .typ-brow[data-tli="1"] .lvl-edit[data-f="defSDL"]'); sel2.value = '1'; sel2.dispatchEvent(new Event('change', { bubbles: true }));
    const row2 = document.querySelector('#lmTypical .typ-brow[data-tli="1"]');
    const after = { psf: box(row2.querySelector('.tb-psfcell')), state: box(row2.querySelector('.tb-state')), cap: !!row2.querySelector('.lvl-edit[data-f="cap"]'), shown: row2.querySelector('.tb-psf') && row2.querySelector('.tb-psf').textContent.trim() };
    const cols = [...blk.querySelectorAll('.typ-brow')].map(r => Math.round(r.querySelector('.tb-psfcell').getBoundingClientRect().left));
    return { head, before, after, cols, grid: getComputedStyle(row2).display };
  });
  eq(r.head.join('|'), 'Floor|LL|DL|PSF|', 'the block heads Floor · LL · DL · PSF');
  eq(r.grid, 'grid', 'rows are grid rows on the shared columns');
  ok(r.before.cap && !r.after.cap && /^\d+$/.test(r.after.shown || ''), 'before a mark the PSF cell is a box; after, it is the worked-out figure: ' + JSON.stringify([r.before.cap, r.after.cap, r.after.shown]));
  ok(r.before.psf[0] === r.after.psf[0] && r.before.psf[1] === r.after.psf[1] && r.before.state[0] === r.after.state[0], 'the PSF and state cells stay exactly where they were when a mark is picked: ' + JSON.stringify([r.before, r.after]));
  ok(r.cols.every(c => c === r.cols[0]), 'the PSF column lines up down every row: ' + JSON.stringify(r.cols));
}

console.log('C. the combined chart keeps one Add, above the chart');
{
  eq(await setup('combined'), 'combined', 'a combined chart is up');
  const r = await page.evaluate(() => {
    const bar = document.getElementById('lmActions'), scroll = document.querySelector('.lm-scroll');
    const kids = [...bar.parentNode.children];
    return { shown: bar.style.display !== 'none', add: !!bar.querySelector('#lmAdd.btn-add'), above: kids.indexOf(bar) < kids.indexOf(scroll),
      head: [...document.querySelectorAll('#lmTypical .tbl-head span')].map(s => s.textContent.trim()).join('|') };
  });
  ok(r.shown && r.add && r.above, '+ Add a mark sits above the chart, colored: ' + JSON.stringify(r));
  eq(r.head, 'Floor|Mark|PSF|', 'the typical block heads Floor · Mark · PSF for a combined chart');
}

await browser.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

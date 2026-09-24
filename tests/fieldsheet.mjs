// @rules RES-11  (see DECISIONS.md)
// Results read top-down like a field sheet (Sep 21 2026): one context row,
// notes folded away, floor tabs that say "Under 3", chips that say "under 3",
// the Next pick as the pane's one primary action, and the pane opening on
// the pour's own sheet.
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// the results-ui fixture: a 100x100 pour over a weak floor with a weaker patch
await page.evaluate(() => {
  const T = [1, 0, 0, 1, 0, 0];
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const mk = (name, el, slab, cap) => ({
    id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap,
    rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [],
    alignment: { transform: T, points: [] },
  });
  state.project = { name: 'field-sheet', loadingConditions: [], shoreChoices: {}, solveStepFt: 10 };
  state.levels = [mk('3', 30, 7.5, 54), mk('2', 20, 7.5, 54), mk('1', 10, 7.5, 400)];
  state.pdf.pages = 2; state.pdf.current = 1;
  state.levels.forEach((l, i) => { l.pdfPage = i === 0 ? 2 : 1; });
  state.project.loadingConditions = [{ mark: '1', desc: 'TYP', sdl: 14, ll: 40, confirmed: true }];
  state.levels[0].zones.push({ id: sid(), polygon: sq(0, 0, 100, 100), capacityPSF: 54, mark: '1', label: '', colorIdx: 0 });
  state.levels[1].zones.push({ id: sid(), polygon: sq(0, 0, 20, 20), capacityPSF: 4, mark: '9', label: 'weak patch', colorIdx: 1 });
  state.results = null; state.activeLevelIdx = 0;
  // no PDF is loaded, so page flips are recorded rather than rendered
  window.__flips = []; window.goToPage = async p => { window.__flips.push(p); state.pdf.current = p; };
  renderSidebar(); persist(); setStep('results');
});
await page.waitForFunction(() => schedSolve && schedSolve.levels[0].solve.spatial);
await page.waitForTimeout(400);

console.log('A. the pane opens on the pour\'s own sheet');
{
  const r = await page.evaluate(() => ({ flips: window.__flips.slice(), cur: state.pdf.current, pour: schedSolve.levels[schedPourIdx].pour.name }));
  ok(r.flips.includes(2) && r.cur === 2, `arriving on Results flipped to the pour's sheet (pour ${r.pour}, sheet 2): ${JSON.stringify(r.flips)}`);
}

console.log('B. one context row; notes folded into the assumptions box');
{
  const r = await page.evaluate(() => {
    const head = document.getElementById('schedHead');
    return {
      rows: head.querySelectorAll('.sched-head-row').length,
      pourLabel: (head.querySelector('.sched-head-row label') || {}).textContent,
      current: /Calculated from current inputs/.test(head.textContent),
      ms: /\d+ ms\b/.test(head.textContent),
      warnBanner: !!head.querySelector('.lm-conflicts'),
      dimOutside: [...head.querySelectorAll('.lm-dim')].filter(d => !d.closest('details')).length,
      summary: (head.querySelector('.review-assumptions summary') || {}).textContent || '',
    };
  });
  ok(r.rows === 1 && /^Pour\b/.test(r.pourLabel.trim()), 'one context row, led by the pour: ' + JSON.stringify(r.pourLabel));
  ok(!r.current && !r.ms, 'no "Calculated from current inputs" line and no millisecond count');
  ok(r.dimOutside === 0, 'no gray explanatory note sits outside the assumptions box');
  ok(/^Notes & assumptions/.test(r.summary), 'the box is called Notes & assumptions: ' + r.summary);
}

console.log('C. tabs and chips name the floor as "under"');
{
  const r = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll('.rs-tab')].map(t => t.textContent.trim()),
    chips: [...document.querySelectorAll('#schedBody .pat-chip .pc-fl')].map(c => c.textContent.trim()),
  }));
  ok(r.tabs[0] === 'All floors' && r.tabs.slice(1).every(t => /^Under \d/.test(t)), 'tabs: ' + JSON.stringify(r.tabs));
  ok(r.chips.length > 0 && r.chips.every(c => /^under \d/.test(c)), 'every chip says which floor it is under: ' + JSON.stringify([...new Set(r.chips)]));
}

console.log('D. the Next pick is the pane\'s one primary action; cards lead with the name');
{
  const r = await page.evaluate(() => {
    const prim = [...document.querySelectorAll('#schedSummary .btn-primary, #schedBody .btn-primary')].filter(b => b.offsetParent !== null).map(b => b.id || b.textContent.trim());
    const nx = document.getElementById('rsNext');
    const name = document.querySelector('#schedBody .sched-region .card-name');
    const cs = name && getComputedStyle(name);
    return { prim, nextPrimary: !!nx && nx.classList.contains('btn-primary'), pill: !!document.querySelector('.rs-next .pill.need'), nameSize: cs && cs.fontSize, nameWeight: cs && cs.fontWeight };
  });
  ok(r.nextPrimary && r.pill, 'Next pick is primary and the count is an amber pill');
  ok(r.prim.length === 1, 'and it is the only primary button in the results pane: ' + JSON.stringify(r.prim));
  ok(r.nameSize === '14px' && +r.nameWeight >= 700, 'a card leads with its name at the title size: ' + r.nameSize + ' / ' + r.nameWeight);
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

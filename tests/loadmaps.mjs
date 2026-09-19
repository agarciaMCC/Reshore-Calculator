// EVERY LOAD MAP IN ONE PASS (Sep 17 2026)
// Adolfo: "the trace loading areas and adding to floors flow is clunky. partly
// because the loading diagrams are spread across multiple pages. requires a
// lot of back and forth between tabs." Chose: one pass over every load-map
// sheet, each plan filed under the floor its title names (with a zone picker),
// one review grouped by floor, areas landing on whichever sheet they fall in.
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

const pdf = fs.readFileSync(path.resolve(here, '..', 'Kinect', '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));
await page.evaluate(async ([b64]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await loadFile(new File([u8], 'kinect.pdf', { type: 'application/pdf' }));
}, [pdf.toString('base64')]);
await page.waitForFunction(() => state.levels.length > 0 && sheetRead && sheetRead.size > 0 && scheduleShape() !== 'none', null, { timeout: 120000 });
await page.waitForTimeout(1000);

console.log('A. the sheets to read');
const A = await page.evaluate(async () => ({ pages: await loadMapPageList(), label: document.getElementById('btnAutoTrace').textContent }));
ok(A.pages.length >= 4, 'every load-map sheet is found: ' + JSON.stringify(A.pages));
ok(/every load map/.test(A.label), 'the button says it reads them all: ' + A.label);

console.log('B. one pass, one review grouped by floor');
await page.evaluate(() => { setStep('loads'); });
await page.evaluate(() => startAutoTrace());
await page.waitForFunction(() => autoTrace && autoTrace.pages && autoTrace.pages.length > 0, null, { timeout: 300000 });
const B = await page.evaluate(() => {
  const R = autoTrace;
  const host = document.getElementById('autoTracePanel');
  return {
    pages: R.pages, plans: R.plans.map(p => ({ page: p.page, title: p.title, lv: p.levelIdx >= 0 ? state.levels[p.levelIdx].name : null, zone: p.zone, unsure: p.unsure, n: p.fills.length, matched: p.match.ok })),
    groups: [...host.querySelectorAll('.at-group-head b')].map(b => b.textContent),
    zoneSel: host.querySelectorAll('select.at-zone').length, lvSel: host.querySelectorAll('select.at-level').length,
    show: host.querySelectorAll('button[data-atgo]').length, unsureRows: host.querySelectorAll('.at-plan.at-unsure').length,
    head: host.querySelector('.at-head').textContent.replace(/\s+/g, ' ').slice(0, 160), onScreen: state.pdf.current,
  };
});
console.log('   ' + B.plans.map(p => `p${p.page}:${p.title}→${p.lv || '?'}${p.zone ? '/' + p.zone : ''}(${p.n}${p.matched ? '' : ',unmatched'})`).join('  '));
ok(B.pages.length >= 3, 'several sheets were read in the one pass: ' + JSON.stringify(B.pages));
ok(B.plans.filter(p => p.lv).length >= 3, 'the plans are filed under floors from their titles: ' + B.plans.filter(p => p.lv).map(p => p.lv).join(','));
ok(B.groups.length >= 3 && B.groups.every(g => g), 'the review is grouped by floor: ' + JSON.stringify(B.groups));
ok(B.lvSel === B.plans.length && B.zoneSel === B.plans.length, 'every plan has a level and a zone picker');
ok(B.plans.some(p => !p.lv) ? B.unsureRows > 0 : true, 'a plan whose floor is unknown is flagged: ' + B.unsureRows);
ok(/Load maps on \d+ sheets/.test(B.head), 'the head says how many sheets: ' + B.head);
ok(B.pages.includes(B.onScreen), 'the plan on screen is one of the traced sheets');

console.log('C. Show flips to a map\'s sheet; the overlay follows');
const C = await page.evaluate(async () => {
  const R = autoTrace;
  const other = R.plans.find(p => p.page !== state.pdf.current);
  if (!other) return { skipped: true };
  const before = state.pdf.current;
  document.querySelector(`button[data-atgo="${R.plans.indexOf(other)}"]`).click();
  for (let i = 0; i < 100 && state.pdf.current !== other.page; i++) await new Promise(r => setTimeout(r, 50));
  const list = autoTraceFillList();
  return { before, now: state.pdf.current, want: other.page, editing: autoTraceEditing() || state.layer !== 'loading',
    listOnPage: list.length && list.every(f => R.plans[f._pi].page === state.pdf.current) };
});
ok(C.skipped || (C.now === C.want && C.now !== C.before), 'Show opens the map\'s own sheet: ' + JSON.stringify(C));
ok(C.skipped || C.listOnPage, 'and only that sheet\'s traced areas are editable there');

console.log('D. match the sheets, then add everything at once');
const D = await page.evaluate(async () => {
  await proposeMatchAll();
  matchProposal.rows.forEach(r => { if (r.fit) r.pick = true; });
  applyMatchAll();
  const R = autoTrace;
  // pick a floor for any plan the title did not place, so nothing blocks Add
  R.plans.forEach(p => { if (p.levelIdx < 0) p.fills.forEach(f => f.accepted = false); });
  const before = state.levels.map(l => zonesOf(l, 'loading').length);
  await acceptAutoTrace();
  const after = state.levels.map(l => ({ name: l.name, n: zonesOf(l, 'loading').length,
    pages: [...new Set(zonesOf(l, 'loading').map(z => zonePage(l, z)))].sort(), pending: pendingZoneCount(l) }));
  return { before, after, closed: !autoTrace, skipped: skippedPages().slice().sort((a, b) => a - b) };
});
console.log('   ' + D.after.map(a => `${a.name}: ${a.n} on sheets ${a.pages.join('/')}${a.pending ? ' pending ' + a.pending : ''}`).join('  '));
ok(D.closed, 'Add closes the review');
ok(D.after.filter(a => a.n > 0).length >= 3, 'areas went to several floors in one Add');
const split = D.after.find(a => a.pages.length > 1);
ok(!!split, 'a split floor\'s areas land on both of its sheets by position: ' + (split ? `${split.name} → ${split.pages.join('/')}` : 'none'));
ok(D.skipped.some(p => p <= 5), 'the load-map sheets are marked not a floor plan: ' + JSON.stringify(D.skipped));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

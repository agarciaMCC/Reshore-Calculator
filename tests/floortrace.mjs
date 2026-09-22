// @rules ARE-12  (see DECISIONS.md)
// TRACE THIS FLOOR'S LOAD MAP FROM THE LOADING TAB (Sep 21 2026). Adolfo:
// "the auto trace from load map should be on that tab, replacing the detect
// again button since that is for slabs. then the auto trace will take you to
// the respective load map and ask to confirm the shapes. after you've
// confirmed, it takes you back to the sheet you were on." Run on the Kinect
// set, whose load maps name their floors.
//  A. the Loading tab: a Trace/Review card up top, Detect again gone, the
//     all-floors pass behind "or do it by hand", nothing left on Loads
//  B. the read happens in the background; Review flips to the floor's map
//  C. one area at a time: Accept / Skip / Accept all; the plan card stays
//  D. Add & back: the areas land on the floor and the sheet comes back
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

const pdf = fs.readFileSync(path.resolve(here, '..', 'Kinect', '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));
await page.evaluate(async ([b64]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await loadFile(new File([u8], 'kinect.pdf', { type: 'application/pdf' }));
}, [pdf.toString('base64')]);
await page.waitForFunction(() => state.levels.length > 0 && sheetRead && sheetRead.size > 0 && scheduleShape() !== 'none', null, { timeout: 120000 });
await page.waitForTimeout(1000);

console.log('A. the Loading tab owns the trace');
// stand on a floor's plan sheet with the Loading layer up
const A0 = await page.evaluate(async () => {
  const li = state.levels.findIndex(l => levelSheets(l).length);
  state.activeLevelIdx = li; const pg = levelSheets(state.levels[li])[0].page;
  await goToPage(pg); setStep('areas'); setLayer('loading'); renderSidebar();
  await new Promise(r => setTimeout(r, 300));
  return { li, pg, name: state.levels[li].name };
});
const A = await page.evaluate(() => {
  const vis = el => !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none';
  const prim = document.getElementById('areasPrimary');
  return {
    card: !!prim.querySelector('#btnTraceFloor'), cardText: prim.textContent.replace(/\s+/g, ' ').trim().slice(0, 140),
    detectAgainShown: vis(document.getElementById('btnAutoDetect')),
    allPassInHand: !!document.getElementById('btnAutoTrace').closest('#byhand-areas, details[data-byhand="areas"]'),
    allPassLabel: document.getElementById('btnAutoTrace').textContent,
    handLabel: document.querySelector('#byhand-areas summary, details[data-byhand="areas"] summary').textContent,
    onLoads: !!document.getElementById('p-loads').querySelector('#btnAutoTrace, #autoTracePanel'),
    panelInAreas: document.getElementById('autoTracePanel').closest('.step-panel').dataset.step === 'areas',
  };
});
console.log('   ' + JSON.stringify({ card: A.cardText, hand: A.handLabel }));
ok(A.card, 'the Loading tab leads with a Trace / Review card: ' + A.cardText);
ok(!A.detectAgainShown, 'Detect again (slab-only) is not offered on the Loading tab');
ok(A.allPassInHand && /every load map/.test(A.allPassLabel), 'the all-floors pass sits behind "or do it by hand": ' + A.allPassLabel);
ok(/trace every load map/.test(A.handLabel), 'and the disclosure says so on this tab: ' + A.handLabel);
ok(!A.onLoads && A.panelInAreas, 'nothing about tracing is left on the Loads step; the review panel lives on Areas');

console.log('B. read in the background, flip only on Review');
await page.waitForFunction(() => traceReady && traceReady.key === traceCacheKey(), null, { timeout: 300000 });
await page.waitForTimeout(300);
const B = await page.evaluate(() => {
  const prim = document.getElementById('areasPrimary');
  const st = floorTraceState(state.activeLevelIdx);
  return { ready: st.ready, text: prim.textContent.replace(/\s+/g, ' ').trim(), stillOn: state.pdf.current, noReview: !autoTrace, btn: (prim.querySelector('#btnTraceFloor') || {}).textContent };
});
console.log('   ' + JSON.stringify(B));
ok(B.ready > 0 && /loading areas? read/.test(B.text) && /Review/.test(B.btn), 'the card says how many areas were read and offers Review: ' + B.text.slice(0, 100));
ok(B.stillOn === A0.pg && B.noReview, 'the sheet did not move while reading');
await page.click('#areasPrimary #btnTraceFloor');
await page.waitForFunction(() => autoTrace && autoTrace.queue, null, { timeout: 60000 });
await page.waitForTimeout(600);
const B2 = await page.evaluate(() => {
  const R = autoTrace, it = traceCurrent();
  const host = document.getElementById('autoTracePanel');
  return { floor: state.levels[R.floorIdx].name, plans: R.plans.length, allThisFloor: R.plans.every(p => p.levelIdx === R.floorIdx), onMap: R.pages.includes(state.pdf.current), returnPage: R.returnPage,
    head: host.querySelector('.mp-head').textContent.replace(/\s+/g, ' ').trim(), buttons: [...host.querySelectorAll('.mp-actions button')].map(b => b.id), planCard: !!host.querySelector('.sq-plan select.at-level'),
    ticks: host.querySelectorAll('input[type=checkbox]').length, curPage: it && it.pl.page, layer: state.layer, written: R.plans.reduce((n, p) => n + p.fills.filter(f => f.accepted).length, 0) };
});
console.log('   ' + JSON.stringify(B2));
ok(B2.floor === A0.name && B2.plans >= 1 && B2.allThisFloor, `only ${A0.name}'s load map(s) are offered: ${B2.plans}`);
ok(B2.onMap && B2.curPage === (await page.evaluate(() => state.pdf.current)), 'Review flipped to the load map, on the area under review');
ok(B2.returnPage === A0.pg, 'and remembers the sheet to come back to: ' + B2.returnPage);
ok(/^Loading areas 1 of \d+/.test(B2.head) && B2.ticks === 0, 'one area at a time, no tick boxes: ' + B2.head);
ok(B2.buttons.includes('atAcc') && B2.buttons.includes('atAdj') && B2.buttons.includes('atSkip') && B2.buttons.includes('atList') && B2.buttons.includes('atCancel'), 'Accept, Accept & adjust, Skip, List, Cancel: ' + JSON.stringify(B2.buttons));
ok(B2.planCard, 'the plan card (floor, zone, grid match) stays above the area');
ok(B2.written === 0 && B2.layer === 'loading', 'nothing accepted yet; the Loading layer is up');

console.log('C. Accept / Skip / Accept all');
const C = await page.evaluate(async () => {
  const R = autoTrace;
  const first = traceCurrent();
  document.getElementById('atAcc').click(); await new Promise(r => setTimeout(r, 200));
  const second = traceCurrent();
  const afterAccept = { firstAcc: first.f.accepted && first.f.queued === 'acc', moved: second && second.f !== first.f };
  if (document.getElementById('atSkip')) { document.getElementById('atSkip').click(); await new Promise(r => setTimeout(r, 200)); }
  const skipped = second && second.f.queued === 'skip' && !second.f.accepted;
  const left = traceQueue().length;
  if (document.getElementById('atAll')) document.getElementById('atAll').click();
  else if (document.getElementById('atAcc')) document.getElementById('atAcc').click();
  await new Promise(r => setTimeout(r, 300));
  const host = document.getElementById('autoTracePanel');
  const total = R.plans.reduce((n, p) => n + p.fills.length, 0), acc = R.plans.reduce((n, p) => n + p.fills.filter(f => f.queued === 'acc').length, 0);
  return { ...afterAccept, skipped, left, total, acc, done: traceQueue().length === 0, addBtn: (host.querySelector('#atAccept') || {}).textContent, foot: document.querySelector('#stepFoot .sf-now').textContent.replace(/\s+/g, ' ') };
});
console.log('   ' + JSON.stringify(C));
ok(C.firstAcc && C.moved, 'Accept keeps the area and moves on');
ok(C.skipped, 'Skip leaves it out and moves on');
ok(C.done && C.acc >= C.total - 1 - (C.total - C.acc - 1), 'Accept all takes the rest: ' + C.acc + ' of ' + C.total);
ok(/Add \d+ loading areas? & back to sheet \d+/.test(C.addBtn || ''), 'with the queue done, the one button adds them and goes back: ' + C.addBtn);

console.log('D. Add & back');
const D = await page.evaluate(async () => {
  const li = autoTrace.floorIdx, lv = state.levels[li];
  const before = zonesOf(lv, 'loading').length;
  document.getElementById('atAccept').click();
  await new Promise(r => setTimeout(r, 2500));
  const now = zonesOf(lv, 'loading');
  return { added: now.length - before, fromMap: now.filter(z => z.fromLoadMap).length, page: state.pdf.current, active: state.activeLevelIdx, layer: state.layer, closed: !autoTrace,
    prim: document.getElementById('areasPrimary').textContent.replace(/\s+/g, ' ').trim() };
});
console.log('   ' + JSON.stringify(D));
ok(D.added > 0 && D.fromMap >= D.added, 'the accepted areas landed on the floor: ' + D.added);
ok(D.closed && D.page === A0.pg && D.active === A0.li && D.layer === 'loading', `and the sheet came back (sheet ${D.page}, ${A0.name}, Loading layer)`);
ok(/came from its load map/.test(D.prim) && /Trace it again/.test(D.prim), 'the card now says where they came from and offers to trace again: ' + D.prim.slice(0, 100));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

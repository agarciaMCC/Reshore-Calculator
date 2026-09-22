// @rules ARE-11  (see DECISIONS.md)
// THE SCAN IS A REVIEW QUEUE (Sep 21 2026). Adolfo: "you have to click show
// and then tick the box to be sure what is highlighted. they all show up at
// once instead of being presented level by level. they should be broken out
// by type when confirming and have a confirm all button. you should also be
// able to adjust the shape before confirming … something like a next button
// would be helpful." Run against the 1175 set, sheets 4 and 3.
//  A. the queue opens on one candidate, shown on its sheet, by type then floor
//  B. Accept writes that one shape and moves on; Skip writes nothing
//  C. Accept & adjust writes it and leaves it selected with its corners live
//  D. Accept all remaining <type> takes the rest of that type, sized only
//  E. Enter / N drive it from the keyboard; the list is one click away
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'test-set.pdf'));
await page.evaluate(async b64 => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 4; state.pdf.pageImages = {};
  document.getElementById('upload-prompt').style.display = 'none';
  document.getElementById('pageNav').style.display = 'flex';
  const T = [1, 0, 0, 1, 0, 0];
  const mk = (name, el, pg) => ({ id: sid(), name, elevation: el, floorToFloor: null, slabThickness: 9, defaultCapacity: 54, rangeFrom: null, rangeTo: null, pdfPage: pg, zones: [], slabZones: [], alignment: { transform: T, points: [] } });
  state.levels = [mk('L4', 40, 4), mk('L3', 30, 3), mk('L2', 20, 2)];
  state.project = { name: 'scan', loadingConditions: [], shoreChoices: {} };
  state.activeLevelIdx = 0; renderSidebar(); setStep('areas');
}, pdf.toString('base64'));

// a hand-made queue: the shapes of sheets 4 and 3 as the detector reads them
await page.evaluate(async () => {
  const items = [];
  for (const [pg, li] of [[4, 0], [3, 1]]) {
    const r = await detectGreyShapes(pg);
    for (const it of r.items) items.push({ ...it, page: pg, levelIdx: li });
  }
  // one opening candidate, drawn by hand, so the type order can be seen
  items.push({ kind: 'opening', polygon: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 180 }, { x: 100, y: 180 }], areaPx2: 8000, pick: false, why: 'test opening', page: 4, levelIdx: 0, label: 'OPNG' });
  beamScan = { page: null, levelIdx: 0, items, sel: -1, multi: true, what: 'both', view: 'queue' };
  await scanShow(scanCurrent());
});
await page.waitForTimeout(500);

console.log('A. one candidate at a time, by type then floor');
const A = await page.evaluate(() => {
  const q = scanQueue(), cur = scanCurrent();
  const panel = document.getElementById('beamPanel');
  return {
    n: beamScan.items.length, qn: q.length,
    order: q.map(x => x.kind), levels: q.filter(x => x.kind === 'beam').map(x => x.levelIdx),
    curKind: cur.kind, curLevel: cur.levelIdx, curPage: cur.page, onPage: state.pdf.current,
    head: panel.querySelector('.mp-head').textContent.replace(/\s+/g, ' ').trim(),
    ticks: panel.querySelectorAll('input[data-bpick]').length,
    buttons: [...panel.querySelectorAll('.mp-actions button')].map(b => b.id),
    sel: beamScan.sel === beamScan.items.indexOf(cur),
    written: state.levels.reduce((k, l) => k + zonesOf(l, 'slab').length, 0),
  };
});
console.log('   ' + JSON.stringify({ n: A.n, head: A.head, buttons: A.buttons }));
ok(A.qn === A.n, 'every readable candidate is in the queue: ' + A.qn + ' of ' + A.n);
ok(A.order.every((k, i) => i === 0 || ({ beam: 0, slab: 1, opening: 2 })[A.order[i - 1]] <= ({ beam: 0, slab: 1, opening: 2 })[k]), 'beams first, then thickened slabs, then openings: ' + JSON.stringify([...new Set(A.order)]));
ok(A.levels.every((l, i) => i === 0 || A.levels[i - 1] <= l), 'and floor by floor within a type: ' + JSON.stringify(A.levels));
ok(A.curKind === 'beam' && A.curLevel === 0 && A.curPage === 4 && A.onPage === 4, 'the first candidate is a beam on L4, and the plan is on its sheet');
ok(/^Beams 1 of \d+/.test(A.head) && /L4/.test(A.head) && /nothing is written until you accept/.test(A.head), 'the head says type, position and floor: ' + A.head);
ok(A.ticks === 0, 'no tick boxes in the queue');
ok(A.buttons.includes('bsAccept') && A.buttons.includes('bsAdjust') && A.buttons.includes('bsSkip') && A.buttons.includes('bsAllType') && A.buttons.includes('bsList'), 'Accept, Accept & adjust, Skip, Accept all, List: ' + JSON.stringify(A.buttons));
ok(A.sel, 'the candidate under review is the one highlighted on the plan');
ok(A.written === 0, 'nothing is written yet');

console.log('B. Accept writes one; Skip writes none');
const B = await page.evaluate(async () => {
  const first = scanCurrent();
  const before = zonesOf(state.levels[0], 'slab').length;
  document.getElementById('bsAccept').click();
  await new Promise(r => setTimeout(r, 300));
  const afterAccept = zonesOf(state.levels[0], 'slab');
  const second = scanCurrent();
  document.getElementById('bsSkip').click();
  await new Promise(r => setTimeout(r, 300));
  const afterSkip = zonesOf(state.levels[0], 'slab').length;
  const third = scanCurrent();
  const panel = document.getElementById('beamPanel');
  return { before, added: afterAccept.length - before, z: afterAccept[afterAccept.length - 1], firstDone: first.done, moved: second !== first,
    afterSkip, secondDone: second.done, movedAgain: third !== second, head: panel.querySelector('.mp-head').textContent.replace(/\s+/g, ' ').trim(),
    back: !!document.getElementById('bsBack'), undo: history.canUndo ? history.canUndo() : true };
});
ok(B.added === 1 && B.z && B.z.kind === 'beam' && B.z.fromSheet && B.z.srcPage === 4 && B.z.page === 4, 'Accept added that one beam to L4, stamped with its sheet: ' + JSON.stringify(B.z && [B.z.kind, B.z.widthIn, B.z.depthIn, B.z.page]));
ok(B.firstDone === 'added' && B.moved, 'and the queue moved on');
ok(B.afterSkip === B.before + 1 && B.secondDone === 'skipped' && B.movedAgain, 'Skip wrote nothing and moved on');
ok(/^Beams 1 of \d+/.test(B.head) && / 1 added/.test(B.head), 'the head counts what is left and what was added: ' + B.head);
ok(B.back, 'a Back button offers the skipped one again');

console.log('C. Accept & adjust leaves the shape selected with live corners');
const C = await page.evaluate(async () => {
  const cur = scanCurrent();
  document.getElementById('bsAdjust').click();
  await new Promise(r => setTimeout(r, 300));
  const lv = state.levels[cur.levelIdx];
  const zs = zonesOf(lv, 'slab');
  const selZ = zs[state.activeZoneIdx];
  const panel = document.getElementById('beamPanel');
  const buttons = [...panel.querySelectorAll('.mp-actions button')].map(b => b.id);
  const stillCur = scanCurrent() === cur;
  // done adjusting: Next moves on
  document.getElementById('bsNext').click();
  await new Promise(r => setTimeout(r, 300));
  return { layer: state.layer, tool: state.tool, selected: !!selZ && selZ.id === cur.zoneId, stillCur, buttons, movedOn: scanCurrent() !== cur, deselected: state.activeZoneIdx == null };
});
ok(C.selected && C.layer === 'slab' && C.tool === 'select', 'the added shape is selected on the slab layer with the select tool: ' + JSON.stringify([C.layer, C.tool, C.selected]));
ok(C.buttons.includes('bsNext') && !C.buttons.includes('bsAccept'), 'while adjusting, the one action is Next: ' + JSON.stringify(C.buttons));
ok(C.movedOn && C.deselected, 'Next moves on and drops the selection');

console.log('D. Accept all remaining beams');
const D = await page.evaluate(async () => {
  const q = scanQueue();
  const beamsLeft = q.filter(x => x.kind === 'beam'), sized = beamsLeft.filter(x => x.sized), unsized = beamsLeft.filter(x => !x.sized);
  const before = state.levels.reduce((k, l) => k + zonesOf(l, 'slab').length, 0);
  const btn = document.getElementById('bsAllType');
  const label = btn && btn.textContent.trim();
  btn.click();
  await new Promise(r => setTimeout(r, 400));
  const after = state.levels.reduce((k, l) => k + zonesOf(l, 'slab').length, 0);
  const cur = scanCurrent();
  return { beamsLeft: beamsLeft.length, sized: sized.length, unsized: unsized.length, label, added: after - before, curKind: cur && cur.kind, leftBeams: scanQueue().filter(x => x.kind === 'beam').length };
});
console.log('   ' + JSON.stringify(D));
ok(/^Accept all \d+ beams$/.test(D.label || ''), 'the button names the type and the count: ' + D.label);
ok(D.added === D.sized, `it added every sized beam left (${D.added} of ${D.sized}) and none of the ${D.unsized} unsized`);
ok(D.leftBeams === D.unsized, 'the unsized beams stay in the queue for a look: ' + D.leftBeams);

console.log('E. keyboard, and the list one click away');
const E = await page.evaluate(async () => {
  // skip past any unsized beams to reach the opening
  let guard = 0;
  while (scanCurrent() && scanCurrent().kind !== 'opening' && guard++ < 20) { document.getElementById('bsSkip').click(); await new Promise(r => setTimeout(r, 120)); }
  const cur = scanCurrent();
  const before = zonesOf(state.levels[0], 'slab').length;
  document.getElementById('drawCanvas').focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  const after = zonesOf(state.levels[0], 'slab');
  const panel = document.getElementById('beamPanel');
  const doneHead = panel.textContent.replace(/\s+/g, ' ');
  const listBtn = document.getElementById('bsList');
  if (listBtn) listBtn.click();
  await new Promise(r => setTimeout(r, 200));
  const rows = document.querySelectorAll('#beamPanel .mp-row').length, ticks = document.querySelectorAll('#beamPanel input[data-bpick]').length;
  return { curKind: cur && cur.kind, added: after.length - before, kind: after[after.length - 1] && after[after.length - 1].kind, doneHead, rows, ticks, skipped: beamScan.items.filter(x => x.done === 'skipped').length };
});
ok(E.curKind === 'opening' && E.added === 1 && E.kind === 'opening', 'Enter accepts the candidate under review (the opening)');
ok(/added/.test(E.doneHead), 'with the queue empty the panel sums up: ' + E.doneHead.slice(0, 120));
ok(E.rows === E.skipped && E.ticks === E.skipped, `the list shows the ${E.skipped} skipped ones with tick boxes, not the ones already added: ${E.rows} rows`);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

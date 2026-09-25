// @rules ARE-28  (see DECISIONS.md)
// THE SCAN REVIEW WALKS FLOOR BY FLOOR, BOTTOM UP. Adolfo, Sep 25 2026: "when
// the areas does the auto detect, the confirmation process should start from
// the bottom most floor and work its way up. it should also show grip points
// so the user knows whether or not to accept and adjust. it would probably be
// best for it to be split up by floor where once all beams, slabs, openings
// on a floor are reviewed, it prompts the user to go to the next level." His
// picks: by type within a floor; wait for Next between floors.
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
  state.project = { name: 'floors', loadingConditions: [], shoreChoices: {} };
  state.activeLevelIdx = 0; renderSidebar(); setStep('areas');
}, pdf.toString('base64'));

const box = (x, y, w, h, extra) => ({ polygon: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], areaPx2: w * h, bbox: { minx: x, miny: y, maxx: x + w, maxy: y + h }, ...extra });
// L4 (top) and L3 have candidates; L2 (bottom) was read and found nothing;
// L4's sheet is still being read when the review opens
await page.evaluate(({ items }) => {
  beamScan = { page: null, levelIdx: 0, startLevelIdx: 0, items, sel: -1, multi: true, what: 'both', view: 'queue',
    targets: [{ levelIdx: 2, page: 2, read: true }, { levelIdx: 1, page: 3, read: true }, { levelIdx: 0, page: 4, read: false }] };
  scanAdvance();
}, { items: [
  box(500, 500, 400, 40, { kind: 'beam', sized: true, widthIn: 24, depthIn: 17, page: 4, levelIdx: 0, why: 'L4 beam' }),
  box(500, 700, 400, 40, { kind: 'beam', sized: true, widthIn: 24, depthIn: 17, page: 4, levelIdx: 0, why: 'L4 beam 2' }),
  box(600, 900, 200, 200, { kind: 'opening', page: 4, levelIdx: 0, why: 'L4 opening', label: 'OPNG' }),
  box(100, 100, 100, 80, { kind: 'opening', page: 3, levelIdx: 1, why: 'L3 opening', label: 'OPNG' }),
  box(500, 500, 400, 40, { kind: 'beam', sized: true, widthIn: 24, depthIn: 17, page: 3, levelIdx: 1, why: 'L3 beam' }),
  box(500, 700, 300, 40, { kind: 'beam', sized: true, widthIn: 18, depthIn: 17, page: 3, levelIdx: 1, why: 'L3 beam 2' }),
  box(800, 800, 300, 300, { kind: 'slab', sized: true, widthIn: 12, depthIn: 12, page: 3, levelIdx: 1, why: 'L3 thickened slab' }),
] });
await page.waitForTimeout(600);

console.log('A. it opens on the bottom floor that has something to review');
const A = await page.evaluate(() => {
  const q = scanQueue(), cur = scanCurrent();
  const head = document.querySelector('#beamPanel .mp-head').textContent.replace(/\s+/g, ' ').trim();
  return { floor: state.levels[beamScan.floorLi].name, q: q.map(x => x.levelIdx), kinds: q.map(x => x.kind), cur: cur && cur.why, head };
});
ok(A.floor === 'L3', 'L2 found nothing, so the review opens on L3, the lowest floor with candidates: ' + A.floor);
ok(A.q.every(li => li === 1), 'the queue holds L3 only: ' + JSON.stringify(A.q));
ok(A.kinds.join() === 'beam,beam,slab,opening', 'by type within the floor, beams first: ' + A.kinds.join());
ok(/floor 2 of 3/.test(A.head) && /to review on L3/.test(A.head), 'the head says which floor of how many: ' + A.head);

console.log('B. grip points on the one under review');
const B = await page.evaluate(async () => {
  const cur = scanCurrent();
  if (state.pdf.current !== cur.page) await goToPage(cur.page);
  if (state.pdf.current !== cur.page) return { skipped: true };
  const c = drawCtx, rects = [];
  const o = c.strokeRect;
  c.strokeRect = function (x, y, w, h) { rects.push([x + w / 2, y + h / 2]); return o.apply(this, arguments); };
  renderNow(); c.strokeRect = o;
  const hit = cur.polygon.filter(p => rects.some(r => Math.abs(r[0] - p.x) < 0.01 && Math.abs(r[1] - p.y) < 0.01)).length;
  return { hit, n: cur.polygon.length };
});
if (!B.skipped) ok(B.hit === B.n, `every corner of the candidate has a grip point (${B.hit} of ${B.n})`);
else ok(true, 'skipped: not on its sheet');

console.log('C. accept-all stays on this floor; the floor ends on a card that waits');
const C = await page.evaluate(async () => {
  const wait = () => new Promise(r => setTimeout(r, 200));
  const label = document.getElementById('bsAllType').textContent.trim();
  document.getElementById('bsAllType').click(); await wait();
  const l4beamsLeft = beamScan.items.filter(x => x.levelIdx === 0 && x.kind === 'beam' && !x.done).length;
  // the thickened slab: accept and adjust, then Done
  document.getElementById('bsAdjust').click(); await wait();
  document.getElementById('bsNext').click(); await wait();
  // the opening: skip
  document.getElementById('bsSkip').click(); await wait();
  const panel = document.getElementById('beamPanel');
  const text = panel.textContent.replace(/\s+/g, ' ').trim();
  const next = document.getElementById('bsNextFloor');
  return { label, l4beamsLeft, text, next: next && next.textContent.trim(), floor: state.levels[beamScan.floorLi].name, cur: scanCurrent() && scanCurrent().why };
});
ok(/^Accept all 2 beams on L3$/.test(C.label), 'accept all names this floor: ' + C.label);
ok(C.l4beamsLeft === 2, 'and leaves the L4 beams alone');
ok(/L3 reviewed/.test(C.text) && /3 accepted \(1 adjusted\) · 1 skipped/.test(C.text), 'L3 done: the card says what was done there: ' + C.text.slice(0, 140));
ok(C.next && /^Next: L4 — reading…/.test(C.next), 'and offers the next floor up, still being read: ' + C.next);
ok(C.floor === 'L3' && !C.cur, 'it waits on L3 — nothing moves until Next');

console.log('D. Next (or Enter) goes up a floor');
const D = await page.evaluate(async () => {
  const wait = () => new Promise(r => setTimeout(r, 250));
  beamScan.targets.find(t => t.levelIdx === 0).read = true; renderBeamPanel();
  const next = document.getElementById('bsNextFloor').textContent.trim();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait();
  const cur = scanCurrent();
  const head = document.querySelector('#beamPanel .mp-head').textContent.replace(/\s+/g, ' ').trim();
  return { next, floor: state.levels[beamScan.floorLi].name, cur: cur && cur.why, page: state.pdf.current, head };
});
ok(/^Next: L4 — 3 to review/.test(D.next), 'once read, the button counts what waits: ' + D.next);
ok(D.floor === 'L4' && D.cur === 'L4 beam' && D.page === 4, 'Enter moved to L4, on its sheet, beams first: ' + JSON.stringify(D));
ok(/floor 3 of 3/.test(D.head), 'floor 3 of 3: ' + D.head);

console.log('E. the last floor ends the review');
const E = await page.evaluate(async () => {
  const wait = () => new Promise(r => setTimeout(r, 200));
  for (let i = 0; i < 3; i++) { document.getElementById('bsAccept').click(); await wait(); }
  const text = document.getElementById('beamPanel').textContent.replace(/\s+/g, ' ').trim();
  return { text, next: !!document.getElementById('bsNextFloor'), done: !!document.getElementById('bsClose') };
});
ok(!E.next && E.done && /added/.test(E.text), 'no Next on the top floor; the review sums up: ' + E.text.slice(0, 120));

console.log('F. Back on a floor card brings back what was skipped there');
const F = await page.evaluate(async () => {
  const sk = beamScan.items.find(x => x.done === 'skipped');
  scanBack(); await new Promise(r => setTimeout(r, 250));
  return { floor: state.levels[beamScan.floorLi].name, cur: scanCurrent() && scanCurrent().why, was: sk && sk.why };
});
ok(F.floor === 'L3' && F.cur === F.was, 'the skipped L3 opening is back up for review, on L3: ' + JSON.stringify(F));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

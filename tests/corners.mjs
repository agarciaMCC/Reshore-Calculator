// Corner removal: the eraser sweep, the box, Delete on a hovered corner, the
// forgiving grab radius, and the Simplify slider.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';
const here = new URL('.', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// a level with one many-cornered shape: a square with 8 extra corners strung
// along its top edge, exactly the litter a tracer leaves behind
const setup = () => page.evaluate(() => {
  const T = [1, 0, 0, 1, 0, 0];
  state.project = { name: 'corners', loadingConditions: [], shoreChoices: {} };
  const poly = [{ x: 100, y: 100 }];
  for (let i = 1; i <= 8; i++) poly.push({ x: 100 + i * 30, y: 100 + (i % 2 ? 6 : -6) });
  poly.push({ x: 420, y: 100 }, { x: 420, y: 400 }, { x: 100, y: 400 });
  state.levels = [{ id: sid(), name: 'L1', elevation: 10, floorToFloor: null, slabThickness: 9,
    defaultCapacity: 100, rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [],
    alignment: { transform: T, points: [] } }];
  state.levels[0].zones.push({ id: sid(), polygon: poly, capacityPSF: 100, mark: 'A', label: '', colorIdx: 0 });
  state.activeLevelIdx = 0; state.layer = 'loading'; state.activeZoneIdx = 0; state.ui.vertexIdx = null;
  setStep('areas'); setLayer('loading'); setTool('select');
  state.drawing.zoom = 1; state.drawing.panX = 0; state.drawing.panY = 0;
  renderSidebar(); renderNow();
  return state.levels[0].zones[0].polygon.length;
});
const n = () => page.evaluate(() => state.levels[0].zones[0].polygon.length);
ok(await setup() === 12, 'fixture has 12 corners');

console.log('A. a bigger target when you are aiming to remove');
const tol = await page.evaluate(() => {
  const p = state.levels[0].zones[0].polygon[1];
  const s = canvasToScreen(p.x, p.y);
  // 14 px off the corner: too far to grab for a drag, close enough to rub out
  return { drag: hitTest(s.x + 14, s.y, {}), erase: hitTest(s.x + 14, s.y, { anyVertex: true }) };
});
ok(!tol.drag || tol.drag.kind !== 'vertex', 'a 14 px miss does not grab a corner for dragging');
ok(tol.erase && tol.erase.kind === 'vertex' && tol.erase.vi === 1, 'but it does find it to remove: ' + JSON.stringify(tol.erase));
// and it takes the NEAREST corner, not the first one it walks past
const nearest = await page.evaluate(() => {
  const poly = state.levels[0].zones[0].polygon;
  const a = canvasToScreen(poly[2].x, poly[2].y), b = canvasToScreen(poly[3].x, poly[3].y);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return hitTest(mid.x + 6, mid.y, { anyVertex: true });
});
ok(nearest && nearest.vi === 3, 'the nearer of two corners in reach wins: ' + JSON.stringify(nearest));

console.log('B. Shift+drag rubs out a run in one stroke');
const sweep = await page.evaluate(() => {
  const poly = state.levels[0].zones[0].polygon;
  const a = canvasToScreen(poly[1].x, poly[1].y), b = canvasToScreen(poly[8].x, poly[8].y);
  const before = poly.length;
  ptr = { down: true, id: 1, btn: 0, startS: a, lastS: a, didDrag: false, moved: 99, mode: null, hit: null, shift: true, alt: false };
  beginDrag();
  const mode = ptr.mode;
  // walk the pointer along the top edge in a few steps
  for (let i = 1; i <= 6; i++) {
    const s = { x: a.x + (b.x - a.x) * i / 6, y: a.y + (b.y - a.y) * i / 6 };
    updateDrag(s); ptr.lastS = s;
  }
  const erased = ptr.erased;
  endDrag();
  ptr = { down: false, mode: null };
  return { mode, before, after: state.levels[0].zones[0].polygon.length, erased };
});
ok(sweep.mode === 'erase', 'Shift+drag enters the eraser: ' + sweep.mode);
ok(sweep.after === 4, 'the eight strays go and the square is left: ' + JSON.stringify(sweep));
ok(sweep.erased === 8, 'it reports what it took: ' + sweep.erased);
const undone = await page.evaluate(() => { history.undo(); return state.levels[0].zones[0].polygon.length; });
ok(undone === 12, 'one undo puts the whole sweep back: ' + undone);
// it will not eat a triangle
const floor = await page.evaluate(() => {
  const z = state.levels[0].zones[0];
  z.polygon = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }];
  const a = canvasToScreen(100, 100), b = canvasToScreen(300, 300);
  ptr = { down: true, id: 1, btn: 0, startS: a, lastS: a, didDrag: false, moved: 99, mode: null, hit: null, shift: true, alt: false };
  beginDrag();
  for (let i = 1; i <= 8; i++) { const s = { x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8 }; updateDrag(s); ptr.lastS = s; }
  endDrag(); ptr = { down: false, mode: null };
  return z.polygon.length;
});
ok(floor === 3, 'a triangle keeps its three corners: ' + floor);
await setup();

console.log('C. Shift+Alt+drag boxes a cluster');
const box = await page.evaluate(() => {
  const poly = state.levels[0].zones[0].polygon;
  const a = canvasToScreen(poly[1].x - 10, poly[1].y - 30), b = canvasToScreen(poly[4].x + 10, poly[4].y + 30);
  ptr = { down: true, id: 1, btn: 0, startS: a, lastS: a, didDrag: false, moved: 99, mode: null, hit: null, shift: true, alt: true };
  beginDrag();
  const mode = ptr.mode;
  updateDrag(b);
  const caught = (ptr.boxHits || []).length;
  renderNow();                      // the box and its catch are drawn
  endDrag(); ptr = { down: false, mode: null };
  return { mode, caught, after: state.levels[0].zones[0].polygon.length };
});
ok(box.mode === 'vbox', 'Shift+Alt+drag draws a box: ' + box.mode);
ok(box.caught === 4 && box.after === 8, 'it takes the four corners inside it: ' + JSON.stringify(box));
ok(await page.evaluate(() => { history.undo(); return state.levels[0].zones[0].polygon.length; }) === 12, 'one undo for the box too');

console.log('D. hover a corner and press Delete');
await setup();
const hov = await page.evaluate(() => {
  const p = state.levels[0].zones[0].polygon[1];
  const s = canvasToScreen(p.x, p.y);
  state.ui.hover = hitTest(s.x, s.y, { anyVertex: true });
  const hit = !!(state.ui.hover && state.ui.hover.kind === 'vertex');
  const took = removeHoveredCorner();
  return { hit, took, after: state.levels[0].zones[0].polygon.length };
});
ok(hov.hit && hov.took && hov.after === 11, 'no modifier, no click: ' + JSON.stringify(hov));
// the real key, through the keyboard, with nothing selected
await setup();
const viaKey = await page.evaluate(() => {
  const p = state.levels[0].zones[0].polygon[2];
  const s = canvasToScreen(p.x, p.y);
  state.ui.hover = hitTest(s.x, s.y, { anyVertex: true });
  state.activeZoneIdx = 0; state.ui.vertexIdx = null;
  return state.levels[0].zones[0].polygon.length;
});
await page.evaluate(() => { try { drawCvs.focus(); } catch (e) {} });
await page.keyboard.press('Delete');
ok(await n() === viaKey - 1, 'the Delete key removes the hovered corner rather than the whole area');
ok(await page.evaluate(() => state.levels[0].zones.length) === 1, 'and the area survives');

console.log('E. the Simplify slider');
await setup();
await page.evaluate(() => { state.activeZoneIdx = 0; renderProperties(); });
ok(await page.$('#propSimplify') !== null, 'the properties panel has the slider');
const simp = await page.evaluate(() => {
  const inp = document.getElementById('propSimplify');
  const poly = () => state.levels[0].zones[0].polygon.length;
  const at = v => { inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); return poly(); };
  const out = { start: poly(), curve: [0, 25, 50, 75, 100].map(at) };
  out.shown = document.getElementById('propSimplifyN').textContent;
  at(0);
  out.backAt0 = poly();
  at(100);
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  out.committed = poly();
  history.undo();
  out.undone = poly();
  return out;
});
ok(simp.curve[0] === 12 && simp.curve[4] === 4, 'the slider runs from every corner to the bare square: ' + JSON.stringify(simp.curve));
ok(simp.curve.every((v, i, a) => i === 0 || v <= a[i - 1]), 'and never adds corners on the way: ' + JSON.stringify(simp.curve));
ok(simp.shown === '4', 'the corner count follows the slider live: ' + simp.shown);
ok(simp.backAt0 === 12, 'dragging back is lossless — nothing is committed until release');
ok(simp.committed === 4 && simp.undone === 12, 'release commits it, one undo returns it: ' + JSON.stringify(simp));
// a shape that is already clean is left alone
const clean = await page.evaluate(() => {
  const z = state.levels[0].zones[0];
  z.polygon = [{ x: 100, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 400 }, { x: 100, y: 400 }];
  renderProperties();
  const inp = document.getElementById('propSimplify');
  inp.value = 100; inp.dispatchEvent(new Event('input', { bubbles: true }));
  const after = z.polygon.length;
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return { after, committed: z.polygon.length };
});
ok(clean.after === 4 && clean.committed === 4, 'a square stays a square at full simplify: ' + JSON.stringify(clean));

console.log('F. the hints say how');
await setup();
await page.evaluate(() => { state.activeZoneIdx = 0; renderProperties(); });
const hint = await page.$eval('.corner-hint', e => e.textContent.replace(/\s+/g, ' '));
ok(/Shift\+drag rubs out a run/.test(hint) && /Shift\+Alt\+drag boxes/.test(hint) && /press Delete/.test(hint),
   'every route is on the panel: ' + hint);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

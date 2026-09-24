// @rules UI-06  (see DECISIONS.md)
// Moving a whole area: select first then drag, object snap on the corner
// nearest the grab, Shift to keep the move square, one undo, and a toast so
// an accidental nudge cannot go unnoticed.
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// Two floors, identity transform (1 image px = 1 building ft), no PDF: a
// 200x150 area on the level being edited and a second shape to snap to.
const reset = () => page.evaluate(() => {
  // drain the undo stack FIRST: an undo replays an older doc over whatever
  // this function is about to build
  while (history.canUndo()) history.undo();
  state.pdf.doc = null; state.pdf.pages = 0;
  const lv = (name, elev) => ({ id: sid(), name, elevation: elev, slabThickness: 9, defaultCapacity: 100,
    zones: [], slabZones: [], alignment: { transform: [1, 0, 0, 1, 0, 0], ftPerInch: 12, nPoints: 2 } });
  state.levels = [lv('2', 20), lv('1', 10)];
  state.activeLevelIdx = 0; state.layer = 'loading'; state.activeZoneIdx = null;
  state.levels[0].zones.push({ id: sid(), polygon: [{x:200,y:200},{x:400,y:200},{x:400,y:350},{x:200,y:350}], mark: null, label: 'Bay A' });
  state.levels[0].zones.push({ id: sid(), polygon: [{x:640,y:520},{x:760,y:520},{x:760,y:620},{x:640,y:620}], mark: null, label: 'Bay B' });
  state.drawing.zoom = 1; state.drawing.panX = 0; state.drawing.panY = 0;
  state.snap = true; state.ortho = false; state.ui.shift = false;
  document.getElementById('upload-prompt').style.display = 'none';
  setStep('areas'); setTool('select'); renderSidebar(); renderCanvas();
});
const poly = (zi = 0) => page.evaluate(i => state.levels[0].zones[i].polygon.map(p => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]), zi);
const at = (x, y) => page.evaluate(([cx, cy]) => { const p = canvasToScreen(cx, cy);
  const r = drawCvs.getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; }, [x, y]);
const lastToast = () => page.evaluate(() => { const t = document.querySelectorAll('.toast'); return t.length ? t[t.length - 1].textContent : ''; });
async function drag(from, to, opts = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    if (opts.shiftAt === i) await page.keyboard.down('Shift');
    await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
  }
  if (opts.escape) { await page.keyboard.press('Escape'); }
  await page.mouse.up();
  if (opts.shiftAt) await page.keyboard.up('Shift');
  await page.waitForTimeout(60);
}

// ── A. select first, then drag ──────────────────────────────────────────
console.log('A. a press inside an unselected area only selects it');
await reset();
const before = await poly();
await drag(await at(300, 275), await at(380, 335));
ok(JSON.stringify(await poly()) === JSON.stringify(before), 'the shape has not moved: ' + JSON.stringify(await poly()));
ok(await page.evaluate(() => state.activeZoneIdx) === 0, 'but it is now selected');
ok(await page.evaluate(() => history.depth()) === 0, 'and nothing went on the undo stack: ' + await page.evaluate(() => history.depth()));

console.log('B. dragging it again moves it, and one undo puts it back');
await drag(await at(300, 275), await at(380, 335));
let now = await poly();
ok(now[0][0] === 280 && now[0][1] === 260, 'moved by the pointer delta: ' + JSON.stringify(now[0]));
ok(await page.evaluate(() => history.depth()) === 1, 'one undo entry for the whole move');
ok(/Bay A moved/.test(await lastToast()) && /Ctrl\+Z/.test(await lastToast()), 'and it says so: ' + JSON.stringify(await lastToast()));
ok(/100'-0"/.test(await lastToast()), 'in building feet, not pixels: ' + JSON.stringify(await lastToast()));
await page.keyboard.press('Control+z');
await page.waitForTimeout(120);
ok(JSON.stringify(await poly()) === JSON.stringify(before), 'undo restores it exactly: ' + JSON.stringify(await poly()));

// ── C. the snap ─────────────────────────────────────────────────────────
console.log('C. the corner nearest the grab is what snaps');
await reset();
await page.evaluate(() => { state.activeZoneIdx = 0; renderSidebar() });
// grab near the bottom-right corner (400,350) and drop it close to Bay B's
// top-left corner (640,520) — a few px short, inside the snap aperture
await drag(await at(390, 340), await at(636, 516));
let p = await poly();
ok(p[2][0] === 640 && p[2][1] === 520,
   'the grabbed corner lands exactly on the other shape\'s corner: ' + JSON.stringify(p[2]));
ok(p[0][0] === 440 && p[0][1] === 370, 'and every other corner moved by the same vector: ' + JSON.stringify(p[0]));
ok(/onto a corner/.test(await lastToast()), 'the toast names what it caught: ' + JSON.stringify(await lastToast()));

console.log('D. a shape never snaps to itself');
await reset();
await page.evaluate(() => { state.activeZoneIdx = 0; state.levels[0].zones.length = 1; renderSidebar() });
await drag(await at(300, 275), await at(303, 279));   // a tiny move, all of it inside its own aperture
p = await poly();
ok(p[0][0] === 203 && p[0][1] === 204, 'a small move is not swallowed by its own corners: ' + JSON.stringify(p[0]));

console.log('E. and it still snaps when the grab is nowhere near a corner');
await reset();
await page.evaluate(() => { state.activeZoneIdx = 0; renderSidebar() });
// grab dead center; the nearest corner is the top-left (200,200)
await drag(await at(300, 275), await at(742, 597));
p = await poly();
ok(p[0][0] === 640 && p[0][1] === 520, 'the nearest corner to the grab is the one that lands: ' + JSON.stringify(p[0]));

// ── F. ortho ────────────────────────────────────────────────────────────
console.log('F. Shift held during the move keeps it square');
await reset();
await page.evaluate(() => { state.activeZoneIdx = 0; state.levels[0].zones.length = 1; state.snap = false; renderSidebar() });
await drag(await at(300, 275), await at(460, 315), { shiftAt: 2 });
p = await poly();
ok(p[0][1] === 200, 'the y is unchanged, so it slid straight sideways: ' + JSON.stringify(p[0]));
ok(p[0][0] === 360, 'and the x carries the full travel: ' + JSON.stringify(p[0]));

console.log('G. Shift held BEFORE the press is still the corner eraser, not a move');
await reset();
await page.evaluate(() => { state.activeZoneIdx = 0; renderSidebar() });
const c0 = await page.evaluate(() => state.levels[0].zones[0].polygon.length);
await page.keyboard.down('Shift');
await drag(await at(200, 200), await at(400, 200));
await page.keyboard.up('Shift');
const c1 = await page.evaluate(() => state.levels[0].zones[0].polygon.length);
ok(c1 < c0, 'corners were rubbed out rather than the shape moved: ' + c0 + ' -> ' + c1);

// ── H. Escape mid-move ──────────────────────────────────────────────────
console.log('H. Escape during a move puts it straight back');
await reset();
await page.evaluate(() => { state.activeZoneIdx = 0; renderSidebar() });
const b4 = await poly();
await drag(await at(300, 275), await at(420, 380), { escape: true });
ok(JSON.stringify(await poly()) === JSON.stringify(b4), 'the shape is where it started: ' + JSON.stringify(await poly()));
ok(await page.evaluate(() => history.depth()) === 0, 'and the abandoned move left no undo entry behind');

// ── I. the cursor ───────────────────────────────────────────────────────
console.log('I. only a selected shape offers the move cursor');
await reset();
const inside = await at(300, 275);
await page.mouse.move(inside.x, inside.y);
await page.waitForTimeout(60);
ok(await page.evaluate(() => drawCvs.style.cursor) === 'pointer', 'unselected reads as pick: ' + await page.evaluate(() => drawCvs.style.cursor));
await page.evaluate(() => { state.activeZoneIdx = 0; renderSidebar(); renderCanvas() });
await page.mouse.move(inside.x + 1, inside.y + 1);
await page.waitForTimeout(60);
ok(await page.evaluate(() => drawCvs.style.cursor) === 'move', 'selected reads as move: ' + await page.evaluate(() => drawCvs.style.cursor));

// ── J. slab layer behaves the same ──────────────────────────────────────
console.log('J. the same on the slab layer');
await reset();
await page.evaluate(() => {
  state.layer = 'slab';
  state.levels[0].slabZones.push({ id: sid(), kind: 'slab', thicknessIn: 12,
    polygon: [{x:150,y:600},{x:300,y:600},{x:300,y:700},{x:150,y:700}] });
  state.activeZoneIdx = null; renderSidebar(); renderCanvas();
});
const sp = () => page.evaluate(() => state.levels[0].slabZones[0].polygon.map(p => [Math.round(p.x), Math.round(p.y)]));
const sb = await sp();
await drag(await at(225, 650), await at(275, 690));
ok(JSON.stringify(await sp()) === JSON.stringify(sb), 'first drag only selects it');
await drag(await at(225, 650), await at(275, 690));
const sa = await sp();
ok(sa[0][0] === 200 && sa[0][1] === 640, 'second drag moves it: ' + JSON.stringify(sa[0]));
ok(/12" Slab moved/.test(await lastToast()), 'named from its own values in the toast: ' + JSON.stringify(await lastToast()));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

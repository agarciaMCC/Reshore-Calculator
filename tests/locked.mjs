// THE MARKUP IS LOCKED ON RESULTS AND SEQUENCE (Adolfo, Sep 10, 2026):
// "loading/slab areas should not be editable in the results/sequence tabs.
// they should be locked."
//
// On those steps the plan is a map of the answer. Pan, zoom and picking a
// region still work; selecting, dragging, erasing corners, inserting corners,
// Delete and arming a drawing tool all do nothing, and the first attempt says
// where to go instead. Areas (step 5) is unaffected — the control case here.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const here = new URL('.', import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// Two floors, identity transform (1 image px = 1 building ft), no PDF.
const reset = () => page.evaluate(() => {
  while (history.canUndo()) history.undo();
  state.pdf.doc = null; state.pdf.pages = 0;
  const lv = (name, elev) => ({ id: sid(), name, elevation: elev, slabThickness: 9, defaultCapacity: 100,
    zones: [], slabZones: [], alignment: { transform: [1, 0, 0, 1, 0, 0], ftPerInch: 12, nPoints: 2 } });
  state.levels = [lv('2', 20), lv('1', 10)];
  state.activeLevelIdx = 0; state.layer = 'loading'; state.activeZoneIdx = null;
  state.levels[0].zones.push({ id: sid(), polygon: [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 350 }, { x: 200, y: 350 }], mark: null, label: 'Bay A' });
  state.levels[0].slabZones.push({ id: sid(), polygon: [{ x: 220, y: 220 }, { x: 300, y: 220 }, { x: 300, y: 300 }, { x: 220, y: 300 }], kind: 'slab', thicknessIn: 12, offsetIn: 0, label: 'drop' });
  state.drawing.zoom = 1; state.drawing.panX = 0; state.drawing.panY = 0;
  state.snap = false; state.ortho = false; state.ui.shift = false;
  document.getElementById('upload-prompt').style.display = 'none';
  setStep('areas'); setTool('select'); renderSidebar(); renderCanvas();
});
const poly = (layer = 'zones', zi = 0) => page.evaluate(([l, i]) =>
  state.levels[0][l][i].polygon.map(p => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]), [layer, zi]);
const at = (x, y) => page.evaluate(([cx, cy]) => { const p = canvasToScreen(cx, cy);
  const r = drawCvs.getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; }, [x, y]);
const lastToast = () => page.evaluate(() => { const t = document.querySelectorAll('.toast'); return t.length ? t[t.length - 1].textContent : ''; });
const pan = () => page.evaluate(() => [Math.round(state.drawing.panX), Math.round(state.drawing.panY)]);
async function drag(from, to, opts = {}) {
  await page.mouse.move(from.x, from.y);
  if (opts.shift) await page.keyboard.down('Shift');
  if (opts.alt) await page.keyboard.down('Alt');
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8);
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up('Shift');
  if (opts.alt) await page.keyboard.up('Alt');
  await page.waitForTimeout(80);
}
const clearToasts = () => page.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); lockToastAt = -1e9; });

// ── A. the control: on Areas everything still works ─────────────────────
console.log('A. Areas is unaffected');
await reset();
ok(await page.evaluate(() => !areasLocked()), 'the Areas step is not locked');
const start = await poly();
await drag(await at(300, 275), await at(340, 305));        // select
await drag(await at(300, 275), await at(340, 305));        // then move
ok(JSON.stringify(await poly()) !== JSON.stringify(start), 'a selected area still drags there: ' + JSON.stringify((await poly())[0]));
await page.keyboard.press('Control+z');
await page.waitForTimeout(120);
ok(JSON.stringify(await poly()) === JSON.stringify(start), 'undone');

// ── B. Results: nothing edits ───────────────────────────────────────────
console.log('B. Results');
await page.evaluate(() => { state.activeZoneIdx = 0; state.ui.vertexIdx = 1; setStep('results'); });
ok(await page.evaluate(() => areasLocked()), 'the Results step is locked');
ok(await page.evaluate(() => state.activeZoneIdx === null && state.ui.vertexIdx === null),
  'arriving there drops the selection, so no handles are offered');
const depth0 = await page.evaluate(() => history.depth());
const pan0 = await pan();
// a drag inside the area pans the plan instead of moving anything
await clearToasts();
await drag(await at(300, 275), await at(380, 335));
ok(JSON.stringify(await poly()) === JSON.stringify(start), 'a drag inside an area does not move it: ' + JSON.stringify((await poly())[0]));
ok(JSON.stringify(await pan()) !== JSON.stringify(pan0), 'it pans the plan: ' + JSON.stringify([pan0, await pan()]));
ok(await page.evaluate(() => history.depth()) === depth0, 'nothing on the undo stack');
ok(/locked on the Results step/.test(await lastToast()) && /Areas \(step 5\)/.test(await lastToast()),
  'and it says where to go: ' + JSON.stringify(await lastToast()));
// a corner drag does not move the corner either
await page.evaluate(() => { state.drawing.panX = 0; state.drawing.panY = 0; renderCanvas(); });
await drag(await at(400, 350), await at(430, 380));
ok(JSON.stringify(await poly()) === JSON.stringify(start), 'a corner cannot be dragged: ' + JSON.stringify(await poly()));
// hovering a corner offers nothing
await page.mouse.move((await at(400, 350)).x, (await at(400, 350)).y);
await page.waitForTimeout(80);
ok(await page.evaluate(() => !state.ui.hover), 'hovering a corner shows no handle');
ok(await page.evaluate(() => cursorFor()) === 'default', 'and the cursor stays plain: ' + await page.evaluate(() => cursorFor()));
// Shift+drag (the corner eraser) and Alt+click (insert) are both off
await page.evaluate(() => { state.drawing.panX = 0; state.drawing.panY = 0; renderCanvas(); });
await drag(await at(180, 190), await at(420, 370), { shift: true });
ok((await poly()).length === 4, 'Shift+drag does not rub corners out: ' + (await poly()).length);
const alt = await at(300, 200);
await page.keyboard.down('Alt'); await page.mouse.click(alt.x, alt.y); await page.keyboard.up('Alt');
await page.waitForTimeout(80);
ok((await poly()).length === 4, 'Alt+click does not insert one: ' + (await poly()).length);
ok(await page.evaluate(() => state.activeZoneIdx === null), 'and a plain click still selects nothing');
// Delete / Backspace
await clearToasts();
await page.evaluate(() => { state.activeZoneIdx = 0; });
await page.keyboard.press('Delete');
await page.waitForTimeout(80);
ok(await page.evaluate(() => state.levels[0].zones.length) === 1, 'Delete does not delete an area');
ok(/locked on the Results step/.test(await lastToast()), 'Delete says why: ' + JSON.stringify(await lastToast()));
await page.evaluate(() => { state.activeZoneIdx = null; });
// the drawing tools cannot be armed
await clearToasts();
await page.keyboard.press('p');
ok(await page.evaluate(() => state.tool) === 'select', 'P does not arm the polygon tool: ' + await page.evaluate(() => state.tool));
await page.keyboard.press('f');
ok(await page.evaluate(() => state.tool) === 'select', 'F does not arm the fill tool');
ok(/locked on the Results step/.test(await lastToast()), 'and both say why');
// the slab layer is locked the same way
await page.evaluate(() => { setLayer('slab'); renderCanvas(); });
const slab0 = await poly('slabZones');
await page.evaluate(() => { state.activeZoneIdx = 0; });
await drag(await at(260, 260), await at(290, 290));
ok(JSON.stringify(await poly('slabZones')) === JSON.stringify(slab0), 'slab conditions are locked too: ' + JSON.stringify((await poly('slabZones'))[0]));
await page.evaluate(() => { setLayer('loading'); state.activeZoneIdx = null; });
// zoom still works
const z0 = await page.evaluate(() => state.drawing.zoom);
await page.evaluate(() => { document.getElementById('zoomIn').click(); });
ok(await page.evaluate(() => state.drawing.zoom) > z0, 'zoom still works while locked');

// ── C. Sequence, the same ───────────────────────────────────────────────
console.log('C. Sequence');
await page.evaluate(() => { state.drawing.zoom = 1; state.drawing.panX = 0; state.drawing.panY = 0; setStep('sequence'); });
ok(await page.evaluate(() => areasLocked()), 'the Sequence step is locked');
await clearToasts();
await page.evaluate(() => { state.activeZoneIdx = 0; });
await drag(await at(300, 275), await at(380, 335));
ok(JSON.stringify(await poly()) === JSON.stringify(start), 'a drag there moves nothing: ' + JSON.stringify((await poly())[0]));
ok(/locked on the Sequence step/.test(await lastToast()), 'and it names that step: ' + JSON.stringify(await lastToast()));
await page.keyboard.press('Delete');
await page.waitForTimeout(80);
ok(await page.evaluate(() => state.levels[0].zones.length) === 1, 'Delete does nothing there either');

// ── D. and back on Areas it is all live again ───────────────────────────
console.log('D. back to Areas');
await page.evaluate(() => { state.drawing.panX = 0; state.drawing.panY = 0; setStep('areas'); setTool('select'); renderCanvas(); });
ok(await page.evaluate(() => !areasLocked()), 'not locked');
await drag(await at(300, 275), await at(340, 305));        // select
await drag(await at(300, 275), await at(340, 305));        // move
ok(JSON.stringify(await poly()) !== JSON.stringify(start), 'the area moves again: ' + JSON.stringify((await poly())[0]));
await page.keyboard.press('p');
ok(await page.evaluate(() => state.tool) === 'polygon', 'and the polygon tool arms again');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

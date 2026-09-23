// @rules UI-01, UI-02, UI-04, UI-05, UI-07, UI-09, UI-10, BEM-02  (see DECISIONS.md)
// Interaction update (Sep 4, evening): Slab wording + beam offset, unified
// Escape, Shift+click vertex delete / Alt+click insert, Shift ortho, copy
// markups between floors, slab-condition colours, entry flow.
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';

const file = 'file://' + path.resolve(decodeURIComponent(new URL('.', import.meta.url).pathname), '..', 'reshore-calc.html');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(Math.abs(a - b) < 1e-6, `${m}: got ${a}, want ${b}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto(file);
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const setup = async () => { await setupIn(); await page.waitForTimeout(60); };
const setupIn = () => page.evaluate(() => {
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const mk = (name, el, T) => ({ id: sid(), name, elevation: el, floorToFloor: null, slabThickness: 7.5, defaultCapacity: 54, rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [], alignment: T ? { transform: T, points: [] } : null });
  state.project = { name: 'ix', loadingConditions: [], shoreChoices: {}, solveStepFt: 10 };
  // L2 at 1 px = 1 ft; L1 at 1 px = 0.5 ft (a sheet plotted twice as large)
  state.levels = [mk('L2', 20, [1, 0, 0, 1, 0, 0]), mk('L1', 10, [0.5, 0, 0, 0.5, 0, 0]), mk('B1', 0, [1, 0, 0, 1, 0, 0])];
  // A stand-in sheet: no PDF is loaded, but the step gates added in the flow
  // rework want a drawing set and a sheet per floor before Results will
  // solve at all, and these fixtures are pure geometry.
  state.pdf.pages = 1; state.pdf.current = 1;
  state.levels.forEach(l => { l.pdfPage = 1; });
  state.project.loadingConditions = [{ mark: '1', desc: 'TYP', sdl: 14, ll: 40, confirmed: true }];
  state.levels[0].zones.push({ id: sid(), polygon: sq(100, 100, 300, 300), capacityPSF: 54, mark: '1', label: 'A', colorIdx: 0 });
  state.levels[0].slabZones.push({ id: sid(), polygon: sq(120, 120, 180, 180), kind: 'slab', thicknessIn: 10, offsetIn: -6, label: 'drop' });
  state.levels[0].slabZones.push({ id: sid(), polygon: sq(130, 130, 170, 140), kind: 'beam', widthIn: 24, depthIn: 36, offsetIn: null, label: 'gb' });
  state.activeLevelIdx = 0; state.activeZoneIdx = null; state.results = null;
  setTool('select'); setLayer('slab'); renderSidebar(); renderCanvas(); persist();
  setStep('areas');
});

console.log('1. Slab wording, beam offset');
await setup();
ok(await page.$eval('#drawSlabPop', e => [...e.querySelectorAll('button[data-newkind]')].map(b => b.firstChild.textContent.trim()).join(',')) === 'Slab,Opening,Beam,Floor edge', 'the draw menu reads Slab');
ok(await page.evaluate(() => { state.activeZoneIdx = 0; renderProperties(); return document.getElementById('propKind').options[0].text; }) === 'Slab — different thickness or T.O.S. offset', 'Type option wording');
ok(await page.evaluate(() => { state.levels[0].slabZones[0].label = ''; renderZoneList(); const t = document.getElementById('zoneList').textContent; state.levels[0].slabZones[0].label = 'drop'; renderZoneList(); return /Slab areas/.test(t) && /" Slab/.test(t) && !/Slab step/.test(t); }), 'zone list says Slab, named from its thickness');
let st = await page.evaluate(() => {
  const lv = state.levels[0]; const list = levelZonesInBuilding(lv, 'slab');
  const inBeam = slabStateAt(lv, list, 150, 135);      // beam inside the -6 drop
  const inDrop = slabStateAt(lv, list, 125, 170);      // drop only
  return { inBeam: { off: inBeam.off, soffit: inBeam.soffitIn, thick: inBeam.thick, beam: !!inBeam.beam }, inDrop: { off: inDrop.off, thick: inDrop.thick } };
});
eq(st.inBeam.off, -6, 'beam inherits the drop offset'); eq(st.inBeam.soffit, 36, 'beam soffit = depth'); eq(st.inBeam.thick, 10, 'thickness from the drop');
eq(st.inDrop.off, -6, 'drop offset'); eq(st.inDrop.thick, 10, 'drop thickness');
st = await page.evaluate(() => { state.levels[0].slabZones[1].offsetIn = 3; const lv = state.levels[0]; const r = slabStateAt(lv, levelZonesInBuilding(lv, 'slab'), 150, 135); state.levels[0].slabZones[1].offsetIn = null; return r.off; });
eq(st, 3, "beam's own offset wins");
// props: beam offset field exists, blank = inherit
ok(await page.evaluate(() => { state.activeZoneIdx = 1; renderProperties(); const o = document.getElementById('propOff'); return o && o.placeholder === 'inherit' && o.value === ''; }), 'beam offset field, inherit placeholder');
await page.evaluate(() => { const o = document.getElementById('propOff'); o.value = '-6'; o.dispatchEvent(new Event('change')); });
ok(await page.evaluate(() => state.levels[0].slabZones[1].offsetIn === -6), 'beam offset set');
await page.evaluate(() => { const o = document.getElementById('propOff'); o.value = ''; o.dispatchEvent(new Event('change')); });
ok(await page.evaluate(() => state.levels[0].slabZones[1].offsetIn === null), 'blank returns to inherit');
// shore height under L1 uses the beam's local T.O.S.: put the same drop+beam on L1
// (L1 drop −6, beam 36 deep → soffit at 10 − 0.5 − 3 = 6.5; stands on B1 at 0 → 6.5 ft)
st = await page.evaluate(() => {
  copyMarkupsBetweenFloors(0, 1, { loading: false, slab: true, replace: true });
  const L = solveAll({ step: 5 }).levels[0].solve;
  const r = L.regions.find(r => r.caps.some(c => /B36/.test(String(c))));
  return r && r.steps[0].shoreHeightFt;
});
eq(st, 6.5, 'beam soffit height under L1 through the drop offset');

console.log('2. Escape peels one layer at a time');
await setup();
// field: revert + blur, no commit
await page.evaluate(() => { state.activeZoneIdx = 0; renderProperties(); });
await page.focus('#propThick');
await page.keyboard.type('99');
await page.keyboard.press('Escape');
ok(await page.evaluate(() => state.levels[0].slabZones[0].thicknessIn === 10), 'Escape in a field does not commit');
ok(await page.evaluate(() => document.activeElement !== document.getElementById('propThick')), 'field blurred');
ok(await page.evaluate(() => document.getElementById('propThick').value === '10'), 'field shows the original value');
// polygon in progress → tool → selection
await page.evaluate(() => { setTool('polygon'); state.drawing.points = [{ x: 1, y: 1 }, { x: 5, y: 1 }]; });
let seq = await page.evaluate(() => { const a = escapeOnce({}); const b = escapeOnce({}); return [a, b, state.tool, state.drawing.points.length]; });
ok(seq[0] === 'polygon' && seq[1] === 'tool' && seq[2] === 'select' && seq[3] === 0, 'polygon then tool: ' + JSON.stringify(seq));
await page.evaluate(() => { state.activeZoneIdx = 0; state.ui.vertexIdx = 1; });
seq = await page.evaluate(() => [escapeOnce({}), escapeOnce({}), state.activeZoneIdx, escapeOnce({})]);
ok(seq[0] === 'vertex' && seq[1] === 'zone' && seq[2] === null && seq[3] === null, 'vertex then zone then nothing: ' + JSON.stringify(seq));
// modal
await page.evaluate(() => document.getElementById('copyModal').classList.add('open'));
ok(await page.evaluate(() => escapeOnce({}) === 'modal' && !document.getElementById('copyModal').classList.contains('open')), 'modal closes');
// alignment
await page.evaluate(() => { state.drawing.imgW = 1000; startAlignment(0); });
ok(await page.evaluate(() => state.align.active && escapeOnce({}) === 'align' && !state.align.active), 'alignment cancelled');
// drag in progress: undo the move
await page.evaluate(() => {
  state.activeZoneIdx = 0; history.record('Move vertex');
  state.levels[0].slabZones[0].polygon[0] = { x: 999, y: 999 };
  ptr.down = true; ptr.mode = 'vertex'; ptr.hit = { kind: 'vertex', zi: 0, vi: 0 }; ptr.didDrag = true;
});
ok(await page.evaluate(() => { const r = escapeOnce({}); const p = state.levels[0].slabZones[0].polygon[0]; return r === 'drag' && p.x === 120 && p.y === 120 && !ptr.down; }), 'drag cancelled and undone');
// real keyboard Escape while a field is focused reaches the router (capture)
await page.evaluate(() => { setTool('polygon'); state.drawing.points = [{ x: 1, y: 1 }]; state.activeZoneIdx = 0; renderProperties(); });
await page.focus('#propLabel');
await page.keyboard.press('Escape');
ok(await page.evaluate(() => state.drawing.points.length === 1 && document.activeElement !== document.getElementById('propLabel')), 'keyboard Escape in a field only leaves the field');
await page.keyboard.press('Escape');
ok(await page.evaluate(() => state.drawing.points.length === 0), 'second Escape drops the polygon');

console.log('3. Shift+click delete, Alt+click insert, ortho');
await setup();
const click = (x, y, mods = {}) => page.evaluate(([x, y, mods]) => {
  const s = canvasToScreen(x, y);
  handleClick({ button: 0, clientX: s.x, clientY: s.y, shiftKey: !!mods.shift, altKey: !!mods.alt }, s);
}, [x, y, mods]);
await page.evaluate(() => { state.activeZoneIdx = 0; state.drawing.zoom = 2; renderCanvas(); });
await page.evaluate(() => { const p = state.levels[0].slabZones[0].polygon; p.splice(2, 0, { x: 180, y: 150 }); });   // 5 corners
await click(180, 150, { shift: true });
ok(await page.evaluate(() => state.levels[0].slabZones[0].polygon.length === 4), 'Shift+click removed the corner');
await page.evaluate(() => history.undo());
ok(await page.evaluate(() => state.levels[0].slabZones[0].polygon.length === 5), 'undo restores it');
await page.evaluate(() => history.redo());
// refuse below 3
await page.evaluate(() => { state.levels[0].slabZones[0].polygon = [{ x: 120, y: 120 }, { x: 180, y: 120 }, { x: 180, y: 180 }]; renderCanvas(); });
await click(180, 120, { shift: true });
ok(await page.evaluate(() => state.levels[0].slabZones[0].polygon.length === 3), 'triangle keeps its 3 corners');
// Alt+click on the edge from (120,120) to (180,120) at x=150
await click(150, 120, { alt: true });
let poly = await page.evaluate(() => state.levels[0].slabZones[0].polygon);
ok(poly.length === 4 && Math.abs(poly[1].x - 150) < 1e-6 && Math.abs(poly[1].y - 120) < 1e-6, 'Alt+click inserted on the edge: ' + JSON.stringify(poly));
// ortho unit
let o = await page.evaluate(() => orthoPoint({ x: 200, y: 108 }, { x: 100, y: 100 }, [{ x: 100, y: 100 }, { x: 201, y: 40 }], 1));
ok(o.pt.y === 100 && o.pt.x === 201 && o.guides.length === 2, 'ortho horizontal + aligned to another corner x: ' + JSON.stringify(o.pt));
o = await page.evaluate(() => orthoPoint({ x: 104, y: 300 }, { x: 100, y: 100 }, [{ x: 100, y: 100 }], 1, { perp: false }));
ok(o.pt.x === 100 && o.pt.y === 300 && o.guides.length === 1, 'ortho vertical');
// the tracking ray now also locks square onto a line it crosses
o = await page.evaluate(() => {
  const z = state.levels[0].slabZones[0];
  const before = z.polygon.map(p => ({ ...p }));
  z.polygon = [{ x: 300, y: 260 }, { x: 340, y: 260 }, { x: 340, y: 340 }, { x: 300, y: 340 }];
  const r = orthoPoint({ x: 302, y: 300 }, { x: 100, y: 300 }, [], 1);
  z.polygon = before;
  return { kind: r.lockKind, x: r.pt.x, y: r.pt.y, guides: r.guides.map(g => g.kind) };
});
ok(o.kind === 'perpedge' && Math.abs(o.x - 300) < 1e-6 && Math.abs(o.y - 300) < 1e-6,
   'ortho locks onto the area edge it crosses: ' + JSON.stringify(o));
ok(o.guides.includes('track') && o.guides.includes('perp'), 'and reports a tracking ray plus a lock marker');
// drawing with Shift: click placement squares to the last point
await page.evaluate(() => { setTool('polygon'); state.snap = false; state.drawing.points = [{ x: 400, y: 400 }]; });
await click(500, 407, { shift: true });
poly = await page.evaluate(() => state.drawing.points);
ok(poly.length === 2 && poly[1].x === 500 && poly[1].y === 400, 'Shift click placed square: ' + JSON.stringify(poly[1]));
await click(505, 500, { shift: true });
poly = await page.evaluate(() => state.drawing.points);
ok(poly[2].x === 500 && poly[2].y === 500, 'second Shift click vertical and aligned: ' + JSON.stringify(poly[2]));
// dragging a vertex with Shift held
await page.evaluate(() => {
  state.drawing.points = []; setTool('select'); state.activeZoneIdx = 0;
  state.levels[0].slabZones[0].polygon = [{ x: 120, y: 120 }, { x: 180, y: 120 }, { x: 180, y: 180 }, { x: 120, y: 180 }];
  state.ui.shift = true; ptr.mode = 'vertex'; ptr.hit = { kind: 'vertex', zi: 0, vi: 2 }; ptr.down = true; ptr.didDrag = true;
  const s = canvasToScreen(184, 200); updateDrag(s);
});
poly = await page.evaluate(() => ({ p: state.levels[0].slabZones[0].polygon[2], g: (state.drawing.guides || []).length, t: state.drawing.snapPt && state.drawing.snapPt.type }));
ok(poly.p.x === 180 && poly.p.y === 200 && poly.g >= 1, 'Shift drag squares to the neighbour: ' + JSON.stringify(poly));
await page.evaluate(() => { ptr.down = false; ptr.mode = null; state.ui.shift = false; state.drawing.guides = null; state.snap = true; });

console.log('4. Copy markups between floors');
await setup();
let r = await page.evaluate(() => copyMarkupsBetweenFloors(0, 1, { loading: true, slab: true, replace: false }));
ok(r.copied === 3 && r.pending === 0, 'copied 3: ' + JSON.stringify(r));
let c = await page.evaluate(() => ({ z: state.levels[1].zones, s: state.levels[1].slabZones, src: state.levels[0].zones[0] }));
ok(c.z.length === 1 && c.s.length === 2, 'both layers');
ok(c.z[0].id !== c.src.id && c.z[0].mark === '1' && c.z[0].label === 'A' && c.z[0].capacityPSF === 54, 'independent copy keeps code/label/capacity');
ok(Math.abs(c.z[0].polygon[0].x - 200) < 1e-6 && Math.abs(c.z[0].polygon[2].x - 600) < 1e-6, 'geometry rescaled through both matches (1 px=1 ft → 1 px=0.5 ft): ' + JSON.stringify(c.z[0].polygon[0]) + ' ' + JSON.stringify(c.z[0].polygon[2]));
ok(c.s[1].kind === 'beam' && c.s[1].offsetIn === null && c.s[0].offsetIn === -6, 'slab conditions carry their fields');
// same footprint in feet
let same = await page.evaluate(() => { const a = levelZonesInBuilding(state.levels[0], 'loading')[0].bPoly, b = levelZonesInBuilding(state.levels[1], 'loading')[0].bPoly; return a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-6 && Math.abs(p.y - b[i].y) < 1e-6); });
ok(same, 'same building footprint on both floors');
// undo is one step
await page.evaluate(() => history.undo());
ok(await page.evaluate(() => state.levels[1].zones.length === 0 && state.levels[1].slabZones.length === 0), 'one undo removes the whole copy');
await page.evaluate(() => history.redo());
// append vs replace
r = await page.evaluate(() => copyMarkupsBetweenFloors(0, 1, { loading: true, slab: false, replace: false }));
ok(await page.evaluate(() => state.levels[1].zones.length === 2 && state.levels[1].slabZones.length === 2), 'append adds');
r = await page.evaluate(() => copyMarkupsBetweenFloors(0, 1, { loading: true, slab: false, replace: true }));
ok(await page.evaluate(() => state.levels[1].zones.length === 1 && state.levels[1].slabZones.length === 2), 'replace only touches the copied layer');
// unmatched target: pending, then materialise on match
await page.evaluate(() => { state.levels[2].alignment = null; });
r = await page.evaluate(() => copyMarkupsBetweenFloors(0, 2, { loading: true, slab: true, replace: false }));
ok(r.copied === 3 && r.pending === 3, 'unmatched target: pending ' + JSON.stringify(r));
ok(await page.evaluate(() => pendingZoneCount(state.levels[2]) === 3 && state.levels[2].zones[0].polygon.length === 0 && state.levels[2].zones[0].bPoly.length === 4), 'waiting as bPoly');
ok(await page.evaluate(() => { state.levels[2].alignment = { transform: [2, 0, 0, 2, 0, 0], points: [] }; return materializeLevelZones(state.levels[2]) === 3 && Math.abs(state.levels[2].zones[0].polygon[0].x - 50) < 1e-6; }), 'materialised on match at the new scale');
// dialog: source list excludes the target and empty floors; default = nearest
await page.evaluate(() => { state.activeLevelIdx = 1; openCopyFrom(); });
ok(await page.$eval('#copyModal', e => e.classList.contains('open')), 'dialog opens');
ok(await page.$eval('#cpSource', e => [...e.options].map(o => o.text).join(',') === 'L2,B1' && e.value === '0'), 'sources: L2,B1, default nearest');
ok(await page.$eval('#cpTarget', e => e.value === 'L1'), 'target shown');
await page.evaluate(() => { document.getElementById('cpSlab').checked = false; document.querySelector('input[name="cpMode"][value="replace"]').checked = true; });
await page.click('#cpGo');
ok(await page.evaluate(() => !document.getElementById('copyModal').classList.contains('open') && state.levels[1].zones.length === 1 && state.levels[1].slabZones.length === 2), 'dialog copy honours options');
ok(await page.$$eval('#btnCopyFrom', b => b.length === 1), 'button on the Areas step');
// no source: toast, no dialog
await page.evaluate(() => { state.levels.forEach(l => { l.zones = []; l.slabZones = []; }); openCopyFrom(); });
ok(await page.$eval('#copyModal', e => !e.classList.contains('open')), 'no markups anywhere: dialog stays closed');

console.log('5. Colours');
await setup();
ok(await page.evaluate(() => slabInkHex(state.levels[0].slabZones[0]) === '#465f82' && slabInkHex(state.levels[0].slabZones[1]) === '#785528'), 'kind defaults');
await page.evaluate(() => { state.project.slabKindColors = { beam: '#e65100' }; });
ok(await page.evaluate(() => slabInkHex(state.levels[0].slabZones[1]) === '#e65100'), 'per-kind project colour');
await page.evaluate(() => { state.levels[0].slabZones[1].color = '#2e7d32'; });
ok(await page.evaluate(() => slabInkHex(state.levels[0].slabZones[1]) === '#2e7d32' && hexToRgbStr('#2e7d32') === '46,125,50'), 'per-shape override wins');
await page.evaluate(() => { state.activeZoneIdx = 0; renderSidebar(); });
ok(await page.$$eval('#propsContent .swatch[data-color]', b => b.length === 9), '8 swatches + default on the panel');
await page.evaluate(() => document.querySelector('#propsContent .swatch[data-color="#6a1b9a"]').click());
ok(await page.evaluate(() => state.levels[0].slabZones[0].color === '#6a1b9a'), 'swatch click sets colour');
ok(await page.$eval('#zoneList .slab-dot', e => e.style.getPropertyValue('--c') === '#6a1b9a'), 'list dot follows');
await page.evaluate(() => document.querySelector('#propsContent .swatch-def').click());
ok(await page.evaluate(() => !('color' in state.levels[0].slabZones[0])), 'default swatch clears override');
await page.evaluate(() => history.undo());
ok(await page.evaluate(() => state.levels[0].slabZones[0].color === '#6a1b9a'), 'undo restores colour');
ok(await page.$$eval('#advSlabColors .adv-kind-row', r => r.length === 5), 'Advanced has 5 kind rows');
await page.evaluate(() => document.querySelector('#advSlabColors .swatch[data-kind="opening"][data-kind-color="#00838f"]').click());
ok(await page.evaluate(() => state.project.slabKindColors.opening === '#00838f'), 'Advanced sets a kind colour');
ok(await page.evaluate(() => JSON.parse(JSON.stringify(serializeDoc())).project.slabKindColors.opening === '#00838f' && JSON.parse(JSON.stringify(serializeDoc())).levels[0].slabZones[0].color === '#6a1b9a'), 'colours persist');
await page.evaluate(() => renderCanvas());

console.log('6. Entry flow');
await setup();
await page.evaluate(() => { setTool('polygon'); state.ui.slabKind = 'slab'; state.drawing.points = [{ x: 500, y: 500 }, { x: 560, y: 500 }, { x: 560, y: 560 }, { x: 500, y: 560 }]; finishPolygon(); });
await page.waitForTimeout(80);
ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'propThick'), 'slab: thickness focused after close');
await page.keyboard.type('9');
await page.keyboard.press('Enter');
await page.waitForTimeout(80);
ok(await page.evaluate(() => state.levels[0].slabZones[2].thicknessIn === 9 && document.activeElement.id === 'propOff'), 'Enter commits and moves to offset: ' + await page.evaluate(() => document.activeElement.id));
await page.keyboard.type('-4');
await page.keyboard.press('Enter');
await page.waitForTimeout(80);
ok(await page.evaluate(() => state.levels[0].slabZones[2].offsetIn === -4 && document.activeElement.id === 'propOffEl'), 'offset commits and moves to its paired elevation (UI-28): ' + await page.evaluate(() => document.activeElement.id));
await page.keyboard.press('Enter');
await page.waitForTimeout(80);
ok(await page.evaluate(() => state.levels[0].slabZones[2].offsetIn === -4 && document.activeElement.id === 'drawCanvas'), 'last field commits and returns to the plan: ' + await page.evaluate(() => document.activeElement.id));
await page.evaluate(() => { state.ui.slabKind = 'beam'; state.drawing.points = [{ x: 600, y: 500 }, { x: 660, y: 500 }, { x: 660, y: 520 }, { x: 600, y: 520 }]; finishPolygon(); });
await page.waitForTimeout(80);
ok(await page.evaluate(() => document.activeElement.id === 'propBw'), 'beam: width focused');
await page.evaluate(() => { state.ui.slabKind = 'opening'; state.drawing.points = [{ x: 700, y: 500 }, { x: 760, y: 500 }, { x: 760, y: 560 }, { x: 700, y: 560 }]; finishPolygon(); });
await page.waitForTimeout(80);
ok(await page.evaluate(() => document.activeElement.id === 'propLabel'), 'opening: label focused');
// loading area without a PDF (no suggestion) → capacity field
await page.evaluate(() => { setLayer('loading'); setTool('polygon'); state.drawing.points = [{ x: 800, y: 500 }, { x: 860, y: 500 }, { x: 860, y: 560 }, { x: 800, y: 560 }]; finishPolygon(); });
await page.waitForTimeout(80);
ok(await page.evaluate(() => ['propCap', 'propMark', 'propLL'].includes(document.activeElement.id)), 'loading area: mark/capacity focused: ' + await page.evaluate(() => document.activeElement.id));
// UI-29 (Sep 23 2026): Tab keeps walking the pane; Escape cancels the edit and returns to the plan
await page.evaluate(() => { setLayer('slab'); state.activeZoneIdx = 0; renderProperties(); });
await page.focus('#propOff');
await page.keyboard.press('Tab');
await page.waitForTimeout(60);
ok(await page.evaluate(() => document.activeElement.id === 'propOffEl'), 'Tab from the offset goes to the next field, the elevation: ' + await page.evaluate(() => document.activeElement.id));
await page.keyboard.type('999');
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
ok(await page.evaluate(() => document.activeElement.id === 'drawCanvas' && state.levels[0].slabZones[0].offsetIn !== (999 - state.levels[0].elevation) * 12), 'Escape drops the edit and returns to the plan: ' + await page.evaluate(() => document.activeElement.id));

console.log('7. Mark column');
await setup();
await page.evaluate(() => {
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  // split-schedule marks: pour L2 is A1; L1 carries E2 on the left half (125 PSF) and its default (54, no code) elsewhere
  state.project.llSchedule = [{ mark: 'A', ll: 40, reducible: false }, { mark: 'E', ll: 100, reducible: false }];
  state.project.sdlSchedule = [{ mark: '1', sdl: 10 }, { mark: '2', sdl: 20 }];
  state.levels[0].zones[0] = { id: sid(), polygon: sq(100, 100, 300, 300), capacityPSF: 59, llMark: 'A', sdlMark: '1', label: '', colorIdx: 0 };
  state.levels[0].slabZones = [];
  state.levels[1].zones.push({ id: sid(), polygon: sq(200, 200, 400, 600), capacityPSF: 125, llMark: 'E', sdlMark: '2', label: '', colorIdx: 0 });
  state.levels[1].zones.push({ id: sid(), polygon: sq(400, 200, 600, 600), capacityPSF: 54, llMark: 'A', sdlMark: '1', label: '', colorIdx: 1 });
  runSchedule();
});
let mk = await page.evaluate(() => { const L = schedSolve.levels[0].solve; return L.regions.map(r => ({ label: regionLabel(r, 0), codes: r.steps.map(s => s.code) })); });
ok(mk.every(r => !/A1/.test(r.label) && /7½" slab/i.test(r.label)), 'region label has no pour mark: ' + mk.map(r => r.label).join(' | '));
ok(mk.some(r => r.codes[0] === 'E2') && mk.some(r => r.codes[0] === 'A1'), 'L1 rows carry the carrying floor\'s mark: ' + JSON.stringify(mk.map(r => r.codes)));
ok(await page.$eval('#schedBody', e => { const th = [...e.querelectorAll ? [] : e.querySelectorAll('thead th')].map(t => t.textContent.trim()); return th[1] === 'Mark' && th[2].startsWith('Capacity'); }), 'Mark column sits before Capacity');
ok(await page.$eval('#schedBody', e => e.querySelectorAll('tbody tr').length && [...e.querySelectorAll('tbody tr')].every(tr => tr.querySelectorAll('td').length === 8 || [...tr.querySelectorAll('td')].reduce((n, td) => n + (+td.colSpan || 1), 0) === 8)), 'every row spans 8 columns');
ok(await page.$eval('#schedBody .sched-region-head', e => /pour-level mark A1/.test(e.title)), 'pour mark kept in the region tooltip');

console.log('8. Result highlight shows only the areas in question');
await setup();
await page.evaluate(() => {
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  state.levels[0].slabZones = [];
  state.levels[1].zones.push({ id: 'left', polygon: sq(200, 200, 400, 600), capacityPSF: 125, mark: '7', label: '', colorIdx: 0 });
  state.levels[1].zones.push({ id: 'right', polygon: sq(400, 200, 600, 600), capacityPSF: 54, mark: '1', label: '', colorIdx: 1 });
  state.levels[1].zones.push({ id: 'far', polygon: sq(1000, 1000, 1200, 1200), capacityPSF: 54, mark: '1', label: '', colorIdx: 2 });
  runSchedule();
});
let hl = await page.evaluate(() => {
  const L = schedSolve.levels[0].solve;
  const r = L.regions.find(r => r.steps[0].capacity === 125);
  state.ui.highlight = { cells: r.cells, step: r.cellStep, bb: r.bb, label: 'x', regionKey: r.key, pour: 'L2' };
  const k1 = highlightTouchSet(state.levels[1]), k0 = highlightTouchSet(state.levels[0]);
  return { l1: [...k1], l0: k0.size, none: highlightTouchSet(state.levels[2]) === null ? 'null' : 'set' };
});
ok(hl.l1.length === 1 && hl.l1[0] === 'left', 'only the carrying area on L1 is kept: ' + JSON.stringify(hl.l1));
ok(hl.l0 === 1, 'the pour area on L2 is kept');
ok(await page.evaluate(() => { state.activeLevelIdx = 1; setLayer('loading'); const s = canvasToScreen(500, 400); return hitTest(s.x, s.y) === null; }), 'hidden shape is not clickable');
ok(await page.evaluate(() => { const s = canvasToScreen(300, 400); const h = hitTest(s.x, s.y); return h && h.kind === 'zone' && state.levels[1].zones[h.zi].id === 'left'; }), 'kept shape still is');
ok(await page.evaluate(() => { escapeOnce({}); return state.ui.highlight === null && hitTest(canvasToScreen(500, 400).x, canvasToScreen(500, 400).y) !== null; }), 'Esc clears and everything is back');
await page.evaluate(() => renderCanvas());

console.log('9. Overhang past the floor below (MDL-11)');
// The "Slab edge tolerance" setting this section used to drive was removed on
// Sep 18 2026 (MDL-11): an overhang of 3 ft or less bears on the floor below,
// because falsework carries it back to the slab edge, and anything wider reads
// as no slab and spans through. There is no setting to poke any more.
await setup();
await page.evaluate(() => {
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  state.levels[0].slabZones = [];
  state.levels[0].zones[0].polygon = sq(0, 0, 100, 20);
  // L1 is at 0.5 ft/px, so 0..196 px = 0..98 ft: the pour overhangs it by 2 ft.
  // Extent comes from the FLOOR EDGE shape; the loading area is capacity only.
  state.levels[1].zones.push({ id: sid(), polygon: sq(0, 0, 196, 40), capacityPSF: 54, mark: '1', label: '', colorIdx: 0 });
  state.levels[1].slabZones.push({ id: sid(), polygon: sq(0, 0, 196, 40), kind: 'edge', thicknessIn: null, offsetIn: 0, label: '' });
});
let tol = await page.evaluate(() => {
  const run = () => { const L = solveAll({ step: 1 }).levels[0].solve; return L.regions.map(r => ({ area: r.areaSF, edge: r.edgeSamples, none: r.steps.some(s => s.open && s.noSlab), h: r.steps[0].shoreHeightFt, label: regionLabel(r, 0) })); };
  state.project.minRegionSF = 0;   // keep slivers so the band itself is visible
  const near = run();
  // pull the floor below back to 0..184 px = 0..92 ft, an 8 ft overhang
  const pullBack = poly => poly.forEach(pt => { if (pt.x === 196) pt.x = 184; });
  pullBack(state.levels[1].zones[state.levels[1].zones.length - 1].polygon);
  pullBack(state.levels[1].slabZones[state.levels[1].slabZones.length - 1].polygon);
  const far = run();
  // a tolerance saved in an older job must be ignored, not honoured
  state.project.edgeTolFt = 1;
  const ignored = edgeToleranceFt();
  delete state.project.edgeTolFt; delete state.project.minRegionSF;
  return { near, far, bearFt: edgeToleranceFt(), ignored };
});
ok(tol.near.length === 1 && tol.near[0].edge === 40 && !tol.near[0].none && Math.abs(tol.near[0].h - 9.375) < 1e-6,
   'a 2 ft overhang bears on the floor below, one region: ' + JSON.stringify(tol.near));
ok(tol.far.some(r => r.none), 'an 8 ft overhang reads as no slab and spans through: ' + JSON.stringify(tol.far));
ok(tol.far.some(r => r.none && r.area < 400) && tol.far.some(r => !r.none && r.area > 1500), 'and it is the band that does, not the whole pour: ' + JSON.stringify(tol.far.map(r => r.area)));
ok(tol.bearFt === 3, 'the rule is a constant 3 ft: ' + tol.bearFt);
ok(tol.ignored === 3, 'an edgeTolFt saved in an older job is ignored: ' + tol.ignored);
ok(await page.evaluate(() => !document.getElementById('advEdgeTol')), 'and the Settings row for it is gone');

console.log('10. Sliver merge');
await setup();
await page.evaluate(() => {
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  state.levels[0].slabZones = [];
  state.levels[0].zones[0].polygon = sq(0, 0, 100, 100);
  // L1 (0.5 ft/px): strong area over x 0..49 ft, weak over 49..100 → the 1 ft strip at x 48..49 vs 49..50 sampling makes slivers at 1 ft step
  state.levels[1].zones.push({ id: sid(), polygon: sq(0, 0, 98, 200), capacityPSF: 125, mark: '7', label: '', colorIdx: 0 });
  state.levels[1].zones.push({ id: sid(), polygon: sq(98, 0, 200, 200), capacityPSF: 54, mark: '1', label: '', colorIdx: 1 });
  // a 10" drop on L1 covering a 3 ft × 20 ft strip → 60 SF sliver at step 1
  state.levels[1].slabZones.push({ id: sid(), polygon: sq(20, 20, 26, 60), kind: 'slab', thicknessIn: 10, offsetIn: 0, label: '' });
});
let sl = await page.evaluate(() => {
  const run = () => { const L = solveAll({ step: 1 }).levels[0].solve; return { n: L.regions.length, areas: L.regions.map(r => r.areaSF), sliver: L.regions.map(r => r.sliverSF || 0), total: L.sliverSF }; };
  state.project.minRegionSF = 0; const off = run();
  delete state.project.minRegionSF; const on = run();
  state.project.minRegionSF = 50; const low = run();
  delete state.project.minRegionSF;
  return { off, on, low };
});
ok(sl.off.n === 3 && sl.off.areas.includes(60), 'without merging the 60 SF drop strip is its own region: ' + JSON.stringify(sl.off));
ok(sl.on.n === 2 && sl.on.total === 60 && sl.on.sliver.some(v => v === 60), 'default 200 SF: merged into a neighbour, noted: ' + JSON.stringify(sl.on));
ok(sl.on.areas.reduce((a, b) => a + b, 0) === 10000, 'no area lost in the merge');
ok(sl.on.areas.includes(4900) && sl.on.areas.includes(5100), 'merged into the region it shares the most boundary with (the 125 half, back to 49×100): ' + JSON.stringify(sl.on.areas));
ok(sl.low.n === 3, 'threshold below the sliver keeps it');
await page.evaluate(() => { state.project.solveStepFt = 1; runSchedule(); });
ok(await page.$eval('#schedBody', e => /absorbs 60 SF of slivers/.test(e.textContent)), 'region head notes the merge');
ok(await page.$eval('#advMinRegion', e => e.value === '200'), 'Advanced shows the default');

console.log('11. Beams as their own blocks with per-row effective width');
await setup();
await page.evaluate(() => {
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  state.levels[0].slabZones = [{ id: 'gb', polygon: sq(100, 140, 300, 142), kind: 'beam', widthIn: 24, depthIn: 36, offsetIn: null, label: 'GB-1' }];
  state.levels[0].zones[0].polygon = sq(100, 100, 300, 300);
  // L1 54 everywhere (default), B1 default 54
  state.project.shoreChoices = {}; state.project.solveStepFt = 2;
  runSchedule();
});
let bm = await page.evaluate(() => {
  const L = schedSolve.levels[0].solve;
  return { nReg: L.regions.length, regLabels: L.regions.map((r, i) => regionLabel(r, i)), beams: L.beams.map(b => ({ plf: b.plf, w: b.widthFt, lf: b.lengthFt, over: b.regionIndex, rows: b.rows.map(r => ({ lv: r.level.name, in: r.beamIn, spare: r.spare, net: r.beamNet, effW: r.effW, h: r.shoreHeightFt, nOpt: r.options.length })), levels: b.beamLevels, unres: b.beamUnresolved })) };
});
ok(bm.nReg === 1 && !/beam/.test(bm.regLabels[0]), 'beam does not split the slab region: ' + JSON.stringify(bm.regLabels));
ok(bm.beams.length === 1 && bm.beams[0].plf === 712.5 && bm.beams[0].w === 2 && bm.beams[0].over === 0, 'one beam item over R1: ' + JSON.stringify(bm.beams[0] && { plf: bm.beams[0].plf, w: bm.beams[0].w, over: bm.beams[0].over }));
// slab cascade: 123.75 → L1 (54) resultant 69.75 → B1 (54) 15.75 → unresolved (no grade). Beam: L1 spare 0 → 712.5 net; B1 spare 0 → 712.5 net; runs out
let r0 = bm.beams[0].rows;
ok(r0[0].lv === 'L1' && r0[0].spare === 0 && r0[0].net === 712.5 && r0[0].effW === 2 && r0[0].nOpt > 0 && Math.abs(r0[0].h - 9.375) < 1e-6, 'L1 row: slab over capacity, no spare, full stem shored: ' + JSON.stringify(r0[0]));
ok(bm.beams[0].unres, 'stem not absorbed in this stack');
// give B1 213 PSF: slab load arriving there is 69.75 (L1 passed it on) → spare (213 − 69.75) × 2 ft = 286.5 → net 426
await page.evaluate(() => { state.levels[2].defaultCapacity = 213; runSchedule(); });
bm = await page.evaluate(() => { const b = schedSolve.levels[0].solve.beams[0]; return b.rows.map(r => ({ lv: r.level.name, spare: r.spare, net: r.beamNet, effW: r.effW })); });
ok(Math.abs(bm[1].spare - 286.5) < 1e-6 && Math.abs(bm[1].net - 426) < 1e-6, 'B1 credits (213 − 69.75) × 2 ft: ' + JSON.stringify(bm[1]));
// effective width per row: widen B1 to 6 ft → spare 859.5 ≥ 712.5 → absorbed at B1
await page.evaluate(() => { const inp = [...document.querySelectorAll('input.sched-effw')].find(i => /B1/.test(i.closest('tr').textContent)); inp.value = '6'; inp.dispatchEvent(new Event('change')); });
bm = await page.evaluate(() => { const b = schedSolve.levels[0].solve.beams[0]; return { rows: b.rows.map(r => ({ lv: r.level.name, spare: r.spare, net: r.beamNet, effW: r.effW })), abs: b.absorbedAt && b.absorbedAt.name, levels: b.beamLevels, unres: b.beamUnresolved }; });
ok(bm.rows[1].effW === 6 && Math.abs(bm.rows[1].spare - 859.5) < 1e-6 && bm.rows[1].net === 0 && bm.abs === 'B1' && bm.levels === 1 && !bm.unres, 'per-row effective width absorbs the stem at B1: ' + JSON.stringify(bm));
ok(bm.rows[0].effW === 2, 'L1 row keeps the default width');
ok(await page.$eval('#schedBody', e => /absorbed by the slab here — no beam shores under B1/.test(e.textContent)), 'absorbed row text');
await page.evaluate(() => history.undo());
ok(await page.evaluate(() => { runSchedule(); return schedSolve.levels[0].solve.beams[0].rows[1].effW === 2; }), 'undo restores the width');
ok(await page.evaluate(() => JSON.parse(JSON.stringify(serializeDoc())).project.shoreChoices !== undefined), 'widths live in the job (shoreChoices)');
// cluster + shore selects readable: both carry sched-shore styling
ok(await page.$eval('#schedBody select.sched-beam-n', e => e.classList.contains('sel-styled') && !e.classList.contains('sched-shore') && getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)'), 'cluster dropdown styled but NOT bound to the shore handler');
// slab table unaffected by the beam
ok(await page.$eval('#schedBody .sched-region:not(.sched-beam) .sched-table tbody', e => e.querySelectorAll('tr').length === 2), 'slab table has its two rows only');
// print includes the beam block
const pr = await page.evaluate(async () => { let html = ''; const w = { document: { write: s => { html += s; }, close() {} }, print() {} }; const o = window.open; window.open = () => w; try { printSchedule(); } finally { window.open = o; } return html; });
// The exact heading is RGN-07 / BEM-06 business and is asserted in naming.mjs;
// what matters here is that the beam prints as its own block, identified by
// size and label, with the effective-width arithmetic shown (BEM-01).
ok(/24&quot;×36&quot;/.test(pr) && /GB-1/.test(pr) && /Slab spare PSF × eff. width ft = PLF/.test(pr),
   'print has the beam block: ' + (pr.match(/[^>]*24&quot;×36&quot;[^<]*/) || ['(no beam heading found)'])[0]);

console.log('12. Load-path diagram');
await setup();
await page.evaluate(() => {
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  state.levels[0].slabZones = [{ id: 'gb', polygon: sq(100, 140, 300, 150), kind: 'beam', widthIn: 24, depthIn: 36, offsetIn: null, label: 'GB-1' }];
  state.levels[2].onGrade = true; state.project.solveStepFt = 5;
  setStep('results'); runSchedule();
});
ok(await page.$$eval('#schedBody .dg-toggle', b => b.length === 2), 'a Diagram toggle on the region and on the beam');
ok(await page.$$eval('#schedBody .dg-wrap', d => d.length === 0), 'closed by default');
await page.evaluate(() => document.querySelector('#schedBody .sched-region:not(.sched-beam) .dg-toggle').click());
let dg = await page.$eval('#schedBody .sched-region:not(.sched-beam) .dg-wrap svg', e => e.textContent);
ok(/L1 \(54 psf capacity\)/.test(dg) && /123\.8 − 54 = 69\.8 PSF/.test(dg) && /choose a shore in the table/.test(dg), 'region diagram: floor bar, arithmetic, pending shore: ' + dg.replace(/\s+/g, ' ').slice(0, 200));
ok(/B1 — slab on grade/.test(dg) && /absorbs the remaining 69\.8 PSF/.test(dg), 'cascade ends on the grade bar');
ok((dg.match(/PSF/g) || []).length >= 4 && /9'-4½" shore/.test(dg), 'arrows carry PSF, shore height dimension present');
// pick a shore → the diagram shows lb / SF / pattern / name
await page.evaluate(() => { const st = schedSolve.levels[0].solve.regions[0].steps[0]; shoreChoices()[st.choiceKey] = st.options[0].shoreId; runSchedule(); });
dg = await page.$eval('#schedBody .sched-region:not(.sched-beam) .dg-wrap svg', e => e.textContent);
ok(/lb \/ 69\.8 PSF = \d+ SF\/shore/.test(dg) && /\d+×\d+ pattern/.test(dg) && /Ellis|Post|HV/.test(dg), 'chosen shore appears with lb, SF, pattern, name: ' + dg.replace(/\s+/g, ' ').slice(-220));
ok(await page.evaluate(() => diagOpen.size === 1), 'toggle state kept across re-render');
// clicking the toggle must not trigger the region highlight
ok(await page.evaluate(() => state.ui.highlight === null), 'toggle click did not highlight');
// beam diagram
await page.evaluate(() => document.querySelector('#schedBody .sched-beam .dg-toggle').click());
dg = await page.$eval('#schedBody .sched-beam .dg-wrap svg', e => e.textContent);
ok(/stem 712\.5 PLF/.test(dg) && /713 − 0 spare = 713 PLF/.test(dg) && /no spare capacity under the beam/.test(dg), 'beam diagram in PLF, zero spare stated plainly: ' + dg.replace(/\s+/g, ' ').slice(0, 220));
// print carries one diagram per region and per beam
const prn = await page.evaluate(async () => { let html = ''; const w = { document: { write: s => { html += s; }, close() {} }, print() {} }; const o = window.open; window.open = () => w; try { printSchedule(); } finally { window.open = o; } return html; });
ok((prn.match(/class="dg-print"/g) || []).length === 2 && /<svg class="dg"/.test(prn), 'print has a diagram per region and per beam');
// toggle button text flips
ok(await page.$eval('#schedBody .sched-region:not(.sched-beam) .dg-toggle', b => b.textContent === 'Hide diagram' && b.classList.contains('on')), 'toggle reads Hide diagram when open');

console.log('13. Settings menu');
await page.evaluate(() => { setStep('areas'); const p = document.getElementById('advPop'); if (p) p.classList.remove('open'); });
ok(await page.$eval('#btnAdv', e => /Settings/.test(e.textContent) && !/Advanced/.test(e.textContent)), 'the button reads Settings');
await page.click('#btnAdv');
ok(await page.$eval('#advPop', e => e.classList.contains('open')), 'it opens');
ok(await page.$eval('#advPop', e => /Default slab condition colors/.test(e.textContent)), 'colours heading renamed');
// The edge-tolerance setting went with MDL-11 (Sep 18 2026), so the minimum
// region size is the only solver setting left.
ok(await page.$eval('#advPop', e => e.querySelectorAll('.adv-note').length === 1), 'the solver setting carries an explanation');
ok(await page.$eval('#advPop', e => /absorbed by the neighbour/.test(e.textContent)
   && /same loading marks/.test(e.textContent)), 'the explanation says what it means, marks included');
ok(await page.$eval('#advPop', e => !/overhang/i.test(e.textContent)) && await page.evaluate(() => !document.getElementById('advEdgeTol')), 'and no edge-tolerance setting survives here');
// picking colours must not close it — the re-render detaches the clicked node
for (const i of [1, 2]) {
  await page.evaluate(() => { const b = document.querySelectorAll('#advSlabColors .swatch[data-kind-color]'); b[b.length - 1].click(); });
  await page.waitForTimeout(60);
  ok(await page.$eval('#advPop', e => e.classList.contains('open')), 'still open after colour pick ' + i);
}
ok(await page.evaluate(() => Object.keys(state.project.slabKindColors || {}).length > 0), 'the colour was actually applied');
await page.click('#advMinRegion'); await page.waitForTimeout(60);   // was #advEdgeTol, removed with MDL-11
ok(await page.$eval('#advPop', e => e.classList.contains('open')), 'clicking a field keeps it open');
await page.keyboard.press('Escape'); await page.waitForTimeout(60);
await page.keyboard.press('Escape'); await page.waitForTimeout(60);
ok(!await page.$eval('#advPop', e => e.classList.contains('open')), 'Escape closes it');
await page.click('#btnAdv'); await page.waitForTimeout(50);
await page.mouse.click(700, 620); await page.waitForTimeout(90);
ok(!await page.$eval('#advPop', e => e.classList.contains('open')), 'a click outside closes it');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

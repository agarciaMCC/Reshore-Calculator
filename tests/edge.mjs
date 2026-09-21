// @rules EDG-05, MDL-15, EDG-04  (see DECISIONS.md)
// Detect floor edge on the test set (tests/fixtures/test-set.pdf) + the
// Floor edge shape kind and extent rule.
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
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'test-set.pdf'));
const job = JSON.parse(fs.readFileSync(path.resolve(here, 'fixtures', 'test-job.reshore.json'), 'utf8'));
await page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation(); state.activeLevelIdx = 0; renderSidebar(); persist();
  document.getElementById('upload-prompt').style.display = 'none';
}, [pdf.toString('base64'), job]);

console.log('A. detector on every floor plan');
// expected areas (px² at render scale) from the verified prototype run, ±3%
const expect = { 2: 2110652, 3: 4711424, 4: 4706084, 5: 4750548, 6: 4561956 };
for (const n of [2, 3, 4, 5, 6]) {
  const r = await page.evaluate(async (n) => { const r = await detectFloorEdge(n); return { ok: r.ok, n: r.polygon && r.polygon.length, area: r.areaPx2, bounded: r.bounded, notes: r.notes, ms: r.ms, ink: r.ink }; }, n);
  ok(r.ok, `page ${n} detected`);
  if (r.ok) {
    ok(Math.abs(r.area - expect[n]) / expect[n] < 0.03, `page ${n} area ${Math.round(r.area)} within 3% of ${expect[n]}`);
    ok(r.n >= 8 && r.n <= 40, `page ${n} corner count sane: ${r.n}`);
    ok(r.bounded && r.notes.length === 0, `page ${n} bounded by grid bubbles, no notes: ${JSON.stringify(r.notes)}`);
    ok(r.ink.heavyW.length && r.ink.thr >= 1.2, `page ${n} sheet-relative threshold ${r.ink.thr}, weights ${r.ink.heavyW}`);
  }
}
// page 1 is the load-map sheet: small key plans only, so whatever it finds is far smaller than a floor plan
const p1 = await page.evaluate(async () => { const r = await detectFloorEdge(1); return { ok: r.ok, notes: r.notes || [], frac: r.frac, area: r.areaPx2 }; });
ok(!p1.ok || p1.area < expect[3] * 0.5, 'sheet 1 (load maps) yields at most a key-plan-sized outline: ' + JSON.stringify(p1));

console.log('B. Level 3 in feet: detected edge matches the drawn footprint');
const cmp = await page.evaluate(async () => {
  const lv = state.levels.find(l => l.name === '3');
  const r = await detectFloorEdge(lv.pdfPage);
  const bp = transformPolyToBuilding(r.polygon, lv.alignment.transform);
  const drawn = levelZonesInBuilding(lv, 'loading').reduce((a, e) => a + Math.abs(polyAreaFt(e.bPoly)), 0);
  return { detSF: Math.abs(polyAreaFt(bp)), drawnSF: drawn };
});
ok(Math.abs(cmp.detSF - cmp.drawnSF) / cmp.drawnSF < 0.06, `detected ${Math.round(cmp.detSF)} SF vs drawn loading areas ${Math.round(cmp.drawnSF)} SF (within 6%)`);

console.log('C. UI: propose, cancel with Esc, accept, replace, undo');
// The floor edge is settled on the BUILDING step now (Adolfo, Sep 17 2026):
// its own section, a row per plan sheet, "Pick from the sheet" on each. The
// Areas auto-detect no longer offers it.
await page.evaluate(() => { setStep('edge'); state.activeLevelIdx = state.levels.findIndex(l => l.name === '3'); renderEdgeSection(); });
ok(await page.evaluate(() => GROUPS[0].sections.join(',') === 'drawings,levels,sheets,edge,match'), 'Floor edge is a section of Building, before Match floors');
ok(await page.evaluate(() => document.getElementById('adEdge').closest('label').hidden), 'and is no longer a tick box on the Areas auto-detect');
const pickBtn = await page.evaluate(() => {
  const lv = getActiveLevel(); const b = document.querySelector(`button[data-edpick="${state.activeLevelIdx}:${lv.pdfPage}"]`);
  return b ? b.textContent : null;
});
ok(/Pick from the sheet/.test(pickBtn || ''), 'the floor\'s row offers Pick from the sheet: ' + pickBtn);
await page.evaluate(() => { const lv = getActiveLevel(); document.querySelector(`button[data-edpick="${state.activeLevelIdx}:${lv.pdfPage}"]`).click(); });
await page.waitForFunction(() => edgeProposal !== null, null, { timeout: 60000 });
ok(await page.evaluate(() => { const b = document.getElementById('edgeDetectAll'); return !b.disabled && !/Reading/.test(b.textContent) }),
   'the button that started it is held while it reads and released with the proposal: ' + await page.evaluate(() => document.getElementById('edgeDetectAll').textContent));
ok(await page.$eval('#edgePanel', e => e.style.display !== 'none' && /Floor edge for 3/.test(e.textContent) && /corners/.test(e.textContent)), 'proposal panel shows');
ok(await page.evaluate(() => document.getElementById('edgePanel').closest('.step-panel').dataset.step === 'edge'), 'on the Floor edge section');
ok(await page.evaluate(() => state.pdf.current === state.levels[state.activeLevelIdx].pdfPage), 'flipped to the floor\'s sheet');
ok(await page.evaluate(() => escapeOnce({}) === 'edge' && edgeProposal === null), 'Esc cancels the proposal');
await page.evaluate(() => startDetectFloorEdge());
await page.waitForFunction(() => edgeProposal !== null, null, { timeout: 30000 });
const before = await page.evaluate(() => zonesOf(state.levels[state.activeLevelIdx], 'slab').length);
await page.click('#edgeAccept');
let z = await page.evaluate(() => { const lv = state.levels[state.activeLevelIdx]; const e = levelEdges(lv); return { n: e.length, kind: e[0] && e[0].kind, corners: e[0] && e[0].polygon.length, total: zonesOf(lv, 'slab').length, sel: state.activeZoneIdx, tool: state.tool, detected: e[0] && e[0].detected }; });
ok(z.n === 1 && z.kind === 'edge' && z.total === before + 1 && z.detected, 'accepted as one Floor edge shape: ' + JSON.stringify(z));
ok(z.sel === z.total - 1 && z.tool === 'select', 'new edge selected in Select for editing');
ok(await page.evaluate(() => { const r = planSheetRows().find(r => r.levelIdx === state.activeLevelIdx && r.page === state.pdf.current); return r && r.edge && !r.confirmed && /Confirm/.test(document.getElementById('edgeRows').innerText) }), 'the row now says drawn and offers Confirm');
await page.evaluate(() => { const i = state.activeLevelIdx; setStep('areas'); state.activeLevelIdx = i; setLayer('slab'); state.activeZoneIdx = zonesOf(getActiveLevel(), 'slab').length - 1; renderSidebar(); renderProperties(); });
ok(await page.$eval('#zoneList', e => /Floor edge/.test(e.textContent) && /slab inside this outline/.test(e.textContent) && /Slab areas/.test(e.textContent)), 'zone list names it, under Slab areas, with the slab it implies');
ok(await page.$eval('#propKind', e => e.value === 'edge'), 'Type shows Floor edge');
// re-detect replaces rather than adds
await page.evaluate(() => { const i = state.activeLevelIdx; setStep('edge'); state.activeLevelIdx = i; return startDetectFloorEdge(); });
await page.waitForFunction(() => edgeProposal !== null, null, { timeout: 30000 });
ok(await page.$eval('#edgePanel', e => /replaces the floor edge already/.test(e.textContent)), 'panel warns it will replace');
await page.click('#edgeAccept');
ok(await page.evaluate(() => levelEdges(state.levels[state.activeLevelIdx]).length === 1), 'still one floor edge');
await page.evaluate(() => { history.undo(); history.undo(); });
ok(await page.evaluate(() => levelEdges(state.levels[state.activeLevelIdx]).length === 0), 'two undos remove both');
await page.evaluate(() => { history.redo(); });

console.log('D. extent rule in the solver');
// with Level 3's detected edge in place, pour on Roof: samples of the Roof over
// Level 3 outside its edge read "no slab"; inside they bear on Level 3
const ext = await page.evaluate(() => {
  const all = solveAll({ step: 2 });
  const R = all.levels.find(L => L.pour.name === 'Roof').solve;
  const L3 = all.levels.find(L => L.pour.name === '3').solve;
  return { roofRegions: R.regions.map((r, i) => ({ label: regionLabel(r, i), area: r.areaSF, l3: r.steps.find(s => s.level.name === '3') })), outside: R.outsideEdge, l3out: L3.outsideEdge, l3outSF: L3.outsideEdgeSF };
});
ok(ext.roofRegions.length >= 1 && ext.roofRegions.every(r => r.l3 && !r.l3.noSlab), 'Roof over Level 3: every region finds Level 3 inside its edge: ' + JSON.stringify(ext.roofRegions.map(r => [r.label, r.area])));
ok(ext.l3out === 0 || ext.l3outSF < 400, 'Level 3 loading areas essentially inside its own edge (outside: ' + ext.l3outSF + ' SF)');
// shrink Level 3's edge to its west half → east half of the Roof pour reads "no slab" at Level 3
const shrunk = await page.evaluate(() => {
  const lv = state.levels.find(l => l.name === '3');
  const e = levelEdges(lv)[0]; const bb = e.polygon.reduce((a, p) => ({ minx: Math.min(a.minx, p.x), maxx: Math.max(a.maxx, p.x), miny: Math.min(a.miny, p.y), maxy: Math.max(a.maxy, p.y) }), { minx: 1e9, maxx: -1e9, miny: 1e9, maxy: -1e9 });
  const mid = (bb.minx + bb.maxx) / 2;
  e.polygon = [{ x: bb.minx, y: bb.miny }, { x: mid, y: bb.miny }, { x: mid, y: bb.maxy }, { x: bb.minx, y: bb.maxy }];
  const R = solveAll({ step: 2 }).levels.find(L => L.pour.name === 'Roof').solve;
  return { none: R.regions.filter(r => r.steps.some(s => s.level.name === '3' && s.noSlab)).reduce((a, r) => a + r.areaSF, 0), total: R.areaSF };
});
ok(shrunk.none > shrunk.total * 0.3 && shrunk.none < shrunk.total * 0.7, `half the Roof now spans past Level 3: ${Math.round(shrunk.none)} of ${Math.round(shrunk.total)} SF`);
// no edge at all → the floor exists everywhere (no noSlab rows anywhere)
const none = await page.evaluate(() => {
  const lv = state.levels.find(l => l.name === '3'); lv.slabZones = lv.slabZones.filter(z => !isEdgeZone(z));
  const R = solveAll({ step: 2 }).levels.find(L => L.pour.name === 'Roof').solve;
  return R.regions.some(r => r.steps.some(s => s.level.name === '3' && s.noSlab));
});
ok(!none, 'without a floor edge Level 3 exists everywhere');

console.log('E. corner removal affordances');
await page.evaluate(() => { const lv = state.levels.find(l => l.name === '3'); state.activeLevelIdx = state.levels.indexOf(lv); setLayer('loading'); state.activeZoneIdx = 1; state.ui.vertexIdx = null; renderProperties(); });
ok(await page.$eval('#propRemoveCorner', b => b.disabled), 'Remove corner disabled with no corner selected');
let nBefore = await page.evaluate(() => { const z = getActiveZone(); state.ui.vertexIdx = 0; renderProperties(); return z.polygon.length; });
ok(await page.$eval('#propRemoveCorner', b => !b.disabled), 'enabled once a corner is selected');
await page.evaluate(() => document.getElementById('propRemoveCorner').click());
ok(await page.evaluate(() => getActiveZone().polygon.length) === nBefore - 1, 'button removes the corner');
await page.evaluate(() => history.undo());
// Shift+click on an UNselected shape's corner
const sc = await page.evaluate(() => {
  const lv = getActiveLevel(); state.activeZoneIdx = null; renderProperties();
  const z = lv.zones[1]; const n = z.polygon.length; const p = z.polygon[2];
  const s = canvasToScreen(p.x, p.y);
  handleClick({ button: 0, clientX: s.x, clientY: s.y, shiftKey: true, altKey: false }, s);
  return { before: n, after: z.polygon.length };
});
ok(sc.after === sc.before - 1, 'Shift+click removes a corner on an unselected shape: ' + JSON.stringify(sc));

// ── F. the floor edge is a LINE, not a fill ────────────────────────────
// Adolfo, Sep 16 2026: "the floor edge appears to have some sort of invisible
// fill that makes it impossible to select anything behind it. we don't want
// this. we just want the floor edge to be visually represented by the line."
console.log('F. the floor edge catches the pointer on its line only');
const F = await page.evaluate(() => {
  const lv = getActiveLevel();
  setLayer('slab');
  const arr = zonesOf(lv, 'slab');
  arr.length = 0;
  const pg = state.pdf.current;
  // a small slab area, then the floor edge ON TOP of it (worst case for picking)
  arr.push({ id: 'inner', kind: 'slab', page: pg, thicknessIn: 9,
    polygon: [{x:300,y:300},{x:500,y:300},{x:500,y:500},{x:300,y:500}] });
  arr.push({ id: 'fe', kind: 'edge', page: pg, offsetIn: 0, thicknessIn: null,
    polygon: [{x:100,y:100},{x:1400,y:100},{x:1400,y:1200},{x:100,y:1200}] });
  state.activeZoneIdx = null; state.ui.vertexIdx = null; renderSidebar();
  const at = (x, y, o) => { const s = canvasToScreen(x, y); return hitTest(s.x, s.y, o || {}); };
  const id = h => (h && h.kind === 'zone') ? arr[h.zi].id : (h ? h.kind : null);
  return {
    blank:  id(at(900, 900)),          // inside the edge, nothing else there
    inner:  id(at(400, 400)),          // inside the edge AND inside the slab area
    online: id(at(700, 100)),          // on the edge's top line
    corner: id(at(100, 100)),          // on one of its corners
    near:   id(at(700, 104)),          // a few px off the line — still on it
    off:    id(at(700, 160)),          // well clear of the line
    vtx:    at(1400, 1200, { anyVertex: true }),
  };
});
ok(F.blank === null, 'a click inside the outline with nothing drawn there picks NOTHING: ' + F.blank);
ok(F.inner === 'inner', 'a slab area inside the outline is reachable even with the edge on top: ' + F.inner);
ok(F.online === 'fe', 'the line itself still picks the floor edge: ' + F.online);
ok(F.corner === 'fe', 'so does a corner of it: ' + F.corner);
ok(F.near === 'fe', 'and within the normal pick radius of the line: ' + F.near);
ok(F.off === null, 'but not well inside it: ' + F.off);
ok(F.vtx && F.vtx.kind === 'vertex', 'Shift+click corner removal still finds its corners: ' + JSON.stringify(F.vtx));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

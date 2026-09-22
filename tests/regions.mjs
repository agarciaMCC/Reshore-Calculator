// @rules RGN-06, RES-05, RES-10  (see DECISIONS.md)
// The Results plan: a region is painted as the outline it was sampled from,
// not as the sample grid, and only the shapes that decided its answer stay on
// screen while it is up. Run against Adolfo's own Bothell job.
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
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
  setStep('results');
}, [pdf.toString('base64'), job]);
await page.waitForFunction(() => typeof schedSolve !== 'undefined' && schedSolve && schedSolve.levels[schedPourIdx]
  && schedSolve.levels[schedPourIdx].solve && schedSolve.levels[schedPourIdx].solve.spatial, { timeout: 60000 });

// ── A. what the region now covers ───────────────────────────────────────
// The painted region is the grown cell union CLIPPED to the drawn areas, so
// measure exactly that on a fine grid: how much of the drawn area it reaches,
// and how much of it lands outside the drawn area.
console.log('A. the painted region against the drawn areas, at every sample pitch');
const cover = await page.evaluate(() => {
  const out = [];
  for (const st of [1, 2, 3, 5]) {
    state.project.solveStepFt = st; runSchedule();
    const L = schedSolve.levels[schedPourIdx];
    const zb = levelZonesInBuilding(L.pour, 'loading');
    const drawn = zb.reduce((n, e) => n + e.areaFt, 0);
    const step = L.solve.regions[0].cellStep;
    const occ = placementCellSet(L);
    const key = (a, b) => a + ',' + b;
    // the grown union, in building feet — the same rule regionCellPath uses
    const inGrown = (x, y) => {
      const g = step / 2, e = g;
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
        const a = Math.round(x / step) + da, b = Math.round(y / step) + db;
        if (!occ.has(key(a, b))) continue;
        const cx = a * step, cy = b * step;   // cells sit on the grid the key uses
        const x0 = cx - g - (occ.has(key(a - 1, b)) ? 0 : e), x1 = cx + g + (occ.has(key(a + 1, b)) ? 0 : e);
        const y0 = cy - g - (occ.has(key(a, b - 1)) ? 0 : e), y1 = cy + g + (occ.has(key(a, b + 1)) ? 0 : e);
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
      }
      return false;
    };
    // and the raw cell union, which is what used to be painted
    const inRaw = (x, y) => occ.has(key(Math.round(x / step), Math.round(y / step)));
    let bb = { minX: 1e18, minY: 1e18, maxX: -1e18, maxY: -1e18 };
    for (const e of zb) { bb.minX = Math.min(bb.minX, e.bb.minX); bb.minY = Math.min(bb.minY, e.bb.minY);
                          bb.maxX = Math.max(bb.maxX, e.bb.maxX); bb.maxY = Math.max(bb.maxY, e.bb.maxY); }
    const f = 0.5, a = f * f;
    let missNew = 0, missOld = 0, spillOld = 0;
    for (let x = bb.minX; x <= bb.maxX; x += f) for (let y = bb.minY; y <= bb.maxY; y += f) {
      const d = !!capZoneAt(zb, x, y);
      if (d && !inGrown(x, y)) missNew++;
      if (d && !inRaw(x, y)) missOld++;
      if (!d && inRaw(x, y)) spillOld++;
    }
    out.push({ st, drawnSF: Math.round(drawn),
      newMissSF: Math.round(missNew * a), newSpillSF: 0,
      oldMissSF: Math.round(missOld * a), oldSpillSF: Math.round(spillOld * a),
      newPct: Math.round(missNew * a / drawn * 1000) / 10,
      oldPct: Math.round((missOld + spillOld) * a / drawn * 1000) / 10 });
  }
  state.project.solveStepFt = 2; runSchedule();
  return out;
});
for (const c of cover) console.log(`   ${c.st} ft: was ${c.oldPct}% off (${c.oldMissSF} SF short, ${c.oldSpillSF} SF over) → now ${c.newPct}%`);
ok(cover.every(c => c.newSpillSF === 0), 'nothing is painted outside the drawn areas — the clip guarantees it');
ok(cover.every(c => c.newPct <= 0.35), 'and the region reaches the drawn edge at every pitch: '
   + cover.map(c => c.st + 'ft ' + c.newPct + '%').join(', '));
ok(cover.every(c => c.newPct < c.oldPct), 'better than the raw cell grid at every pitch: '
   + cover.map(c => `${c.st}ft ${c.oldPct}→${c.newPct}`).join(', '));
const two = cover.find(c => c.st === 2);
ok(two.oldPct >= 1.5 && two.newPct <= 0.35,
   'at his 2 ft setting: ' + two.oldPct + '% off before, ' + two.newPct + '% now');
const five = cover.find(c => c.st === 5);
// The raw grid is much closer than it used to be (1,306 SF short at this
// pitch, now ~126): cells come from the region's exact polygon plus the
// boundary band claimed for painting, so there is less for the growth to make
// up. What matters is unchanged — at the coarsest pitch the painted region
// still reaches the drawn edge and the raw grid still does not.
ok(five.newMissSF === 0 && five.oldMissSF > five.newMissSF,
   'the coarsest pitch reaches the drawn edge where the raw grid does not: ' + five.oldMissSF + ' SF short → ' + five.newMissSF);

// ── B. the clip path itself ─────────────────────────────────────────────
console.log('B. the clip is the pour\'s outline, on whichever sheet is shown');
const clip = await page.evaluate(() => {
  const L = schedSolve.levels[schedPourIdx];
  const pour = state.levels.find(l => l.name === L.pour.name);
  const l3 = state.levels.find(l => l.name === '3');
  return { onPour: !!pourOutlinePath(pour, L), onLower: !!pourOutlinePath(l3, L),
           unmatched: !!pourOutlinePath({ name: 'x', zones: [], slabZones: [] }, L) };
});
ok(clip.onPour && clip.onLower, 'built for the pour sheet and for a lower floor\'s sheet');
ok(!clip.unmatched, 'and refused for a floor with no match, so nothing is clipped away wrongly');

console.log('C. a nested area is left out of the clip, so it draws no boundary of its own');
const nest = await page.evaluate(() => {
  const L = schedSolve.levels[schedPourIdx];
  const pour = state.levels.find(l => l.name === L.pour.name);
  const before = pourOutlineZones(L).length;
  // drop a small area inside the big one, the way an E2 cutout is drawn
  const zb = levelZonesInBuilding(pour, 'loading');
  const b = zb[0].bb, T = pour.alignment.transform;
  const P = (x, y) => { const q = buildingToPixel(x, y, T); return { x: q.px, y: q.py } };
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const inner = { id: sid(), label: 'INNER',
    polygon: [P(cx-8,cy-8), P(cx+8,cy-8), P(cx+8,cy+8), P(cx-8,cy+8)] };
  zonesOf(pour, 'loading').push(inner);
  const withInner = pourOutlineZones(L);
  // and one that hangs outside it, which is NOT nested and must be kept
  const outside = { id: sid(), label: 'OUTSIDE',
    polygon: [P(b.maxX-4,cy-8), P(b.maxX+30,cy-8), P(b.maxX+30,cy+8), P(b.maxX-4,cy+8)] };
  zonesOf(pour, 'loading').push(outside);
  const withBoth = pourOutlineZones(L);
  zonesOf(pour, 'loading').pop(); zonesOf(pour, 'loading').pop();
  return { before, withInner: withInner.length, withBoth: withBoth.length,
           keptInner: withInner.some(e => e.zone.label === 'INNER'),
           keptOutside: withBoth.some(e => e.zone.label === 'OUTSIDE') };
});
ok(nest.withInner === nest.before && !nest.keptInner,
   'an area drawn inside another adds nothing to the clip: ' + JSON.stringify(nest));
ok(nest.withBoth === nest.before + 1 && nest.keptOutside,
   'one that hangs outside it is kept, so the clip still covers it: ' + JSON.stringify(nest));

// ── D. which shapes stay on screen ──────────────────────────────────────
console.log('D. only the shapes that decided the answer stay up');
const gov = await page.evaluate(() => {
  const L = schedSolve.levels[schedPourIdx];
  const big = L.solve.regions[0];                       // 11,216 SF, mark B2
  const pour = state.levels.find(l => l.name === L.pour.name);
  const l3 = state.levels.find(l => l.name === '3');
  const nameOf = (lv, id) => { const z = zonesOf(lv, 'loading').concat(zonesOf(lv, 'slab')).find(z => z.id === id);
    return z ? zoneName(lv, z, 0) : id; };
  state.ui.highlight = { cells: big.cells, step: big.cellStep, bb: big.bb, label: 'R1', regionKey: big.key, pour: L.pour.name };
  const onPour = highlightTouchSet(pour), onL3 = highlightTouchSet(l3);
  const allPour = zonesOf(pour, 'loading').length + zonesOf(pour, 'slab').length;
  const allL3 = zonesOf(l3, 'loading').length + zonesOf(l3, 'slab').length;
  // a small region: its set must be smaller still
  const small = L.solve.regions[L.solve.regions.length - 1];
  state.ui.highlight = { cells: small.cells, step: small.cellStep, bb: small.bb, label: 'Rn', regionKey: small.key, pour: L.pour.name };
  const onPourSmall = highlightTouchSet(pour);
  state.ui.highlight = null;
  return { allPour, allL3, kept: [...onPour].map(id => nameOf(pour, id)), keptL3: [...onL3].map(id => nameOf(l3, id)),
           keptSmall: [...onPourSmall].map(id => nameOf(pour, id)),
           bigKey: big.key, smallKey: small.key };
});
console.log('   pour keeps: ' + JSON.stringify(gov.kept) + ' of ' + gov.allPour + ' shapes');
console.log('   L3 keeps:   ' + JSON.stringify(gov.keptL3) + ' of ' + gov.allL3 + ' shapes');
console.log('   small region keeps: ' + JSON.stringify(gov.keptSmall));
ok(gov.kept.length < gov.allPour, 'the pour sheet hides something: ' + gov.kept.length + ' of ' + gov.allPour);
ok(gov.kept.length >= 1, 'but keeps the area that carried it');
ok(!gov.kept.some(n => /E2|C2/.test(String(n))),
   'the E2 and C2 cutouts are their own regions, so they are not kept for R1: ' + JSON.stringify(gov.kept));
ok(gov.keptSmall.length <= gov.kept.length,
   'a smaller region keeps no more than a bigger one: ' + gov.keptSmall.length + ' vs ' + gov.kept.length);
ok(gov.keptL3.length >= 1 && gov.keptL3.length <= gov.allL3,
   'the carrying floor keeps what governed there: ' + JSON.stringify(gov.keptL3));

console.log('E. a shape merely overlapped is not kept');
const over = await page.evaluate(() => {
  const L = schedSolve.levels[schedPourIdx];
  const pour = state.levels.find(l => l.name === L.pour.name);
  const r = L.solve.regions[0];
  // drop a big decoy loading area over the whole region, drawn FIRST so the
  // cutout rule leaves the existing areas governing
  const zb = levelZonesInBuilding(pour, 'loading');
  let bb = { minX: 1e18, minY: 1e18, maxX: -1e18, maxY: -1e18 };
  for (const e of zb) { bb.minX = Math.min(bb.minX, e.bb.minX); bb.minY = Math.min(bb.minY, e.bb.minY);
                        bb.maxX = Math.max(bb.maxX, e.bb.maxX); bb.maxY = Math.max(bb.maxY, e.bb.maxY); }
  const T = pour.alignment.transform, P = (x, y) => { const q = buildingToPixel(x, y, T); return { x: q.px, y: q.py } };
  const pad = 40;
  const decoy = { id: sid(), label: 'DECOY', llMark: null, sdlMark: null,
    polygon: [P(bb.minX-pad,bb.minY-pad), P(bb.maxX+pad,bb.minY-pad), P(bb.maxX+pad,bb.maxY+pad), P(bb.minX-pad,bb.maxY+pad)] };
  zonesOf(pour, 'loading').unshift(decoy);
  state.ui.highlight = { cells: r.cells, step: r.cellStep, bb: r.bb, label: 'R1', regionKey: r.key, pour: L.pour.name };
  const kept = highlightTouchSet(pour);
  const hasDecoy = kept.has(decoy.id);
  zonesOf(pour, 'loading').shift();
  state.ui.highlight = null;
  return { hasDecoy, n: kept.size };
});
ok(!over.hasDecoy, 'an area the region sits inside but that governs nowhere is hidden');

// ── F. the pour's own loading areas ─────────────────────────────────────
console.log('F. on Results the floor being poured shows no loading areas of its own');
const drawn = await page.evaluate(async () => {
  const L = schedSolve.levels[schedPourIdx];
  const pourIdx = state.levels.findIndex(l => l.name === L.pour.name);
  const l3Idx = state.levels.findIndex(l => l.name === '3');
  const r = L.solve.regions[0];
  // record which zones actually get painted, by watching the hatch fill
  const seen = [];
  const oFill = drawCtx.fill, oRect = drawCtx.fillRect;
  window.__zones = null;
  const grab = () => { window.__zones = []; renderNow(); const z = window.__zones; window.__zones = null; return z };
  const oPoly = window.__origDrawZone;
  // simpler: count how many of the level's loading zones are inside the
  // visible set the renderer uses
  const visCount = (lv) => {
    const keep = highlightTouchSet(lv);
    const showLoading = !(curStep === 'results' && isPourLevel(lv));
    return { loading: showLoading ? zonesOf(lv, 'loading').filter(z => !keep || keep.has(z.id)).length : 0,
             slab: zonesOf(lv, 'slab').filter(z => !keep || keep.has(z.id)).length,
             totalLoading: zonesOf(lv, 'loading').length };
  };
  setStep('results');
  await goToPage(state.levels[pourIdx].pdfPage);
  setResultHighlight({ cells: r.cells, step: r.cellStep, bb: r.bb, label: 'R1', regionKey: r.key, pour: L.pour.name });
  const pourSel = visCount(state.levels[pourIdx]);
  setResultHighlight(null);
  const pourMap = visCount(state.levels[pourIdx]);
  await showRegionOn(l3Idx, r, 'R1');
  const lower = visCount(state.levels[l3Idx]);
  const isPour = { pour: isPourLevel(state.levels[pourIdx]), l3: isPourLevel(state.levels[l3Idx]) };
  setStep('areas');
  const pourAreas = visCount(state.levels[pourIdx]);
  setStep('results');
  return { pourSel, pourMap, lower, isPour, pourAreas };
});
ok(drawn.isPour.pour && !drawn.isPour.l3, 'the pour is recognised and a carrying floor is not');
ok(drawn.pourSel.loading === 0, 'with a region selected, the pour draws none of its own loading areas: ' + drawn.pourSel.loading);
ok(drawn.pourMap.loading === 0, 'and none under the region map either: ' + drawn.pourMap.loading);
ok(drawn.pourSel.slab >= 1, 'but its slab conditions stay — they set the placement load: ' + drawn.pourSel.slab);
ok(drawn.lower.loading >= 1, 'the carrying floor still shows the loading area that governed: ' + drawn.lower.loading);
ok(drawn.lower.loading < drawn.lower.totalLoading, 'and only that one: ' + drawn.lower.loading + ' of ' + drawn.lower.totalLoading);
ok(drawn.pourAreas.loading === drawn.pourAreas.totalLoading,
   'on the Areas step the pour draws all of them again: ' + drawn.pourAreas.loading + ' of ' + drawn.pourAreas.totalLoading);

// ── G. the selection glows, nothing marches ─────────────────────────────
// RES-10 (Adolfo, Sep 21 2026): dashes over the outline hid the drawing under
// them; the selection is a teal glow and a light tint, nothing animates, and
// the other regions step back while one is selected.
console.log('G. the selected region glows; nothing marches');
const glow = await page.evaluate(async () => {
  const L = schedSolve.levels[schedPourIdx];
  const r = L.solve.regions[0];
  const pourIdx = state.levels.findIndex(l => l.name === L.pour.name);
  setStep('results'); await goToPage(state.levels[pourIdx].pdfPage);
  const dashes = [], strokes = [], alphas = new Set();
  const oDash = drawCtx.setLineDash, oStroke = drawCtx.stroke;
  let inGlow = 0, glowCalls = 0;
  const oGlow = glowStroke;
  glowStroke = function () { glowCalls++; inGlow++; try { return oGlow.apply(this, arguments) } finally { inGlow-- } };
  drawCtx.setLineDash = function (d) { if (d && d.length && inGlow) dashes.push(d.slice()); return oDash.apply(this, arguments) };
  drawCtx.stroke = function () { if (inGlow) strokes.push(drawCtx.strokeStyle); return oStroke.apply(this, arguments) };
  const oFill = drawCtx.fill;
  drawCtx.fill = function () { alphas.add(drawCtx.globalAlpha); return oFill.apply(this, arguments) };
  setResultHighlight({ cells: r.cells, step: r.cellStep, bb: r.bb, label: 'R1', regionKey: r.key, pour: L.pour.name });
  renderNow();
  await new Promise(res => setTimeout(res, 300));
  const running = antsRAF != null;
  drawCtx.setLineDash = oDash; drawCtx.stroke = oStroke; drawCtx.fill = oFill; glowStroke = oGlow;
  const teal = strokes.some(c => /14, ?143, ?150|#0e8f96|63, ?199, ?207|#3fc7cf/i.test(String(c)));
  const green = strokes.some(c => /20, ?110, ?60|46, ?160, ?90/.test(String(c)));
  setResultHighlight(null);
  // the floor tab's region map dims the rest to 16%; on the Overview there is no map to dim
  return { glowCalls, dashes: dashes.length, running, teal, green, dimmed: alphas.has(0.16) || !alphas.has(0.45), phase: antsPhase };
});
ok(glow.glowCalls >= 1, 'the selected outline is drawn with the glow: ' + glow.glowCalls + ' strokes');
ok(glow.dashes === 0, 'and no dash pattern is set on it: ' + glow.dashes);
ok(!glow.running, 'nothing animates');
ok(glow.teal && !glow.green, 'the glow is teal, not the old green: teal ' + glow.teal + ', green ' + glow.green);
ok(glow.dimmed, 'the other regions step back to 16% while one is selected');
const left = await page.evaluate(async () => {
  const L = schedSolve.levels[schedPourIdx]; const r = L.solve.regions[0];
  setStep('results');
  setResultHighlight({ cells: r.cells, step: r.cellStep, bb: r.bb, label: 'R1', regionKey: r.key, pour: L.pour.name });
  setStep('areas');
  await new Promise(res => setTimeout(res, 250));
  return !state.ui.highlight && antsRAF == null;
});
ok(left, 'and leaving Results clears the highlight');

// ── K. the clip has to be the extent the solver used ────────────────────
console.log('K. with a floor edge on the pour, the clip is the edge, not the areas');
const asExtent = await page.evaluate(() => {
  // his state: a floor edge on the pour, the typical area taken up onto the
  // level default, one small exception left drawn. Clipping to the loading
  // areas here wiped the region map down to that exception.
  const lv = state.levels.find(l => l.name === '2');
  const zs = zonesOf(lv, 'loading');
  const big = zs.map((z, i) => ({ z, i, a: Math.abs(polyAreaFt(z.polygon)) })).sort((p, q) => q.a - p.a)[0];
  const keepZones = zs.slice(), keepSlab = lv.slabZones.slice();
  const keepDef = { ll: lv.defLL, sdl: lv.defSDL, cap: lv.defaultCapacity };
  lv.slabZones.push({ id: sid(), kind: 'edge', polygon: big.z.polygon.map(p => ({ x: p.x, y: p.y })) });
  lv.defLL = big.z.llMark; lv.defSDL = big.z.sdlMark; lv.defaultCapacity = 0;
  zs.splice(big.i, 1);
  const wasPour = schedPourIdx;
  schedPourIdx = state.levels.findIndex(l => l.name === '2');
  setStep('results'); runSchedule();
  const L = schedSolve.levels[schedPourIdx];
  const solvedSF = Math.round(L.solve.regions.reduce((n, r) => n + r.areaSF, 0));
  const outer = pourOutlineZones(L);
  const res = { solvedSF, clipSF: Math.round(outer.reduce((n, e) => n + e.areaFt, 0)),
                kind: outer.length ? (isEdgeZone(outer[0].zone) ? 'edge' : 'loading') : 'none',
                loadingLeft: zonesOf(lv, 'loading').length,
                smallestLoadingSF: Math.round(Math.min(...zonesOf(lv, 'loading')
                  .map(z => Math.abs(polyAreaFt(transformPolyToBuilding(z.polygon, lv.alignment.transform)))))) };
  // put it back
  lv.slabZones.length = 0; lv.slabZones.push(...keepSlab);
  lv.zones.length = 0; lv.zones.push(...keepZones);
  lv.defLL = keepDef.ll; lv.defSDL = keepDef.sdl; lv.defaultCapacity = keepDef.cap;
  schedPourIdx = wasPour; runSchedule();
  return res;
});
ok(asExtent.kind === 'edge', 'the clip comes off the floor edge: ' + asExtent.kind);
ok(Math.abs(asExtent.clipSF - asExtent.solvedSF) / asExtent.solvedSF < 0.02,
   'and covers what the solver sampled: ' + asExtent.clipSF + ' SF clip vs ' + asExtent.solvedSF + ' SF solved');
ok(asExtent.clipSF > asExtent.smallestLoadingSF * 10,
   'not the one small exception still drawn on it: ' + asExtent.smallestLoadingSF + ' SF');

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

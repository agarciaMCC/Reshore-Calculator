// @rules BLD-02, UI-04, UI-15  (see DECISIONS.md)
// Reading the sheets: auto-match a floor from its grid bubbles, read T/SLAB
// elevations and thicknesses, and the ortho tracking line's perpendicular
// lock. Run against Adolfo's own test set, so the numbers are checked
// against what he entered by hand.
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
const load = () => page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
  document.getElementById('pageNav').style.display = 'flex';
}, [pdf.toString('base64'), job]);
await load();

console.log('A. levels read straight out of the drawings');
const prop = await page.evaluate(async () => {
  const before = state.levels.map(l => ({ name: l.name, elev: l.elevation, thick: l.slabThickness, page: l.pdfPage }));
  const p = await proposeLevelsFromDrawings();
  return { before, list: p.map(x => ({ name: x.name, page: x.page, title: x.title, elev: x.elev, n: x.elevN, total: x.elevTotal,
    thick: x.thickIn, thickN: x.thickN, clr: x.clrFt, clrOffIn: x.clrOffIn, below: x.clrBelow, steps: x.steps.length,
    onGrade: x.onGrade, levelIdx: x.levelIdx, curElev: x.curElev, curThick: x.curThick })) };
});
const L = prop.list;
ok(L.length === 5, 'five floor plans found in the set: ' + L.length);
ok(L.map(p => p.name).join(',') === 'Roof,3,2,1,0', 'named off the sheet titles, top down: ' + L.map(p => p.name).join(','));
ok(L.map(p => p.page).join(',') === '6,5,4,3,2', 'each bound to its own sheet: ' + L.map(p => p.page).join(','));
ok(L.every(p => p.levelIdx >= 0), 'they line up with the levels he entered by hand');
ok(L.every(p => Math.abs(p.elev - p.curElev) < 1e-6),
   'every read elevation matches what he entered: ' + JSON.stringify(L.map(p => [p.name, p.elev, p.curElev])));
ok(L.filter(p => p.thickN >= 3).every(p => p.thick === 9),
   'the slab reads 9" wherever the callouts back it: ' + JSON.stringify(L.map(p => [p.name, p.thick, p.thickN])));
ok(L.find(p => p.name === '0').onGrade, 'the foundation plan comes in flagged on grade');
ok(!L.find(p => p.name === '3').onGrade, 'a soffit plan does not');
ok(L.every(p => p.n >= 4), 'each elevation is backed by several callouts: ' + JSON.stringify(L.map(p => p.n)));
const withClr = L.filter(p => p.clrOffIn != null);
ok(withClr.length >= 4, 'the clear-height check runs on the floors that have one');
ok(withClr.every(p => Math.abs(p.clrOffIn) <= 0.75),
   'CLR HT on the sheet agrees with the stack: ' + JSON.stringify(withClr.map(p => [p.name, p.clrOffIn])));
ok(L.find(p => p.name === '3').steps === 7, 'the seven off-level T/SLAB callouts on Level 3 are reported as steps');
ok(L.find(p => p.name === 'Roof').steps === 0, 'a flat floor reports no steps');
// the section sheet names five levels and settles on none, so it is not a plan
ok(!L.some(p => p.page === 10), 'the section sheet on page 10 is not mistaken for a floor plan');
// the dimension parser
const dims = await page.evaluate(() => ['120\'-0"', '119\'-11 1/2"', "31'-6\"", '73\'-5"', 'CLR HT', '9" PT SLAB', "12'-13\""]
  .map(s => dimFeet(s)));
ok(dims[0] === 120 && Math.abs(dims[1] - 119.9583333) < 1e-6 && Math.abs(dims[2] - 31.5) < 1e-9,
   'feet-inches parse, fractions included: ' + JSON.stringify(dims.slice(0, 3)));
ok(dims[4] === null && dims[5] === null && dims[6] === null, 'non-dimensions and 13 inches are rejected');
// from nothing at all: no levels defined, everything comes off the drawings
const scratch = await page.evaluate(async () => {
  const keep = state.levels;
  state.levels = [];
  const list = await proposeLevelsFromDrawings();
  const r = applyLevelDrawingProposals(list, null);
  const made = state.levels.map(l => ({ name: l.name, elev: l.elevation, thick: l.slabThickness, page: l.pdfPage, og: !!l.onGrade }));
  history.undo();
  const afterUndo = state.levels.length;
  state.levels = keep; sortLevelsByElevation();
  return { r, made, afterUndo };
});
ok(scratch.r.created === 5, 'with no levels defined it creates all five: ' + JSON.stringify(scratch.r));
ok(scratch.made.map(l => l.name).join(',') === 'Roof,3,2,1,0', 'in elevation order: ' + scratch.made.map(l => l.name).join(','));
ok(scratch.made.every(l => l.page), 'each carrying its sheet, so the Drawings step is bound too');
ok(scratch.made.find(l => l.name === '0').og, 'the on-grade flag comes with it');
ok(scratch.made.find(l => l.name === '3').elev === 120 && scratch.made.find(l => l.name === '3').thick === 9,
   'with the right numbers: ' + JSON.stringify(scratch.made.find(l => l.name === '3')));
ok(scratch.afterUndo === 0, 'and one undo takes them all back off');
// applying twice changes nothing the second time
const idem = await page.evaluate(async () => {
  const list = await proposeLevelsFromDrawings();
  return applyLevelDrawingProposals(list, null);
});
ok(idem.created === 0 && idem.changed === 0, 'running it again is a no-op: ' + JSON.stringify(idem));
// the UI
await page.evaluate(() => setStep('levels'));
ok(await page.$('#btnReadElev') !== null, 'the Levels step has the button');
// the read runs itself when a set loads (Sep 17 2026); the button is the re-read
ok(await page.$eval('#btnReadElev', b => /Read the levels again/.test(b.textContent)), 'as a re-read — the first read is automatic: ' + await page.$eval('#btnReadElev', b => b.textContent));
ok(await page.$('#levelsConfirm') !== null, 'and Levels has its Confirm row');
ok(await page.evaluate(() => { const p = document.getElementById('p-levels'); const c = document.getElementById('levelsConfirm'), l = document.getElementById('levelList'); return c && l && [...p.children].indexOf(c) < [...p.children].indexOf(l) }), 'the Confirm row is the primary action, above the list (UI-18)');
ok(await page.$eval('#btnReadElev', b => !!b.closest('#byhand-levels')), 'the re-read is behind "or do it by hand"');
await page.evaluate(() => openByHand('levels'));
await page.click('#btnReadElev');
await page.waitForFunction(() => document.querySelectorAll('#elevProposal .ep-row').length > 0, null, { timeout: 20000 });
ok(await page.$$eval('#elevProposal .ep-row', r => r.length) === 5, 'the review panel lists every floor plan');
ok(await page.$eval('#elevProposal', e => /agrees with the stack/.test(e.textContent)), 'it shows the clear-height check');
ok(await page.$eval('#elevProposal', e => /LEVEL 03 \(SOFFIT PLAN\)/.test(e.textContent)), 'and names the sheet each came from');
ok(await page.$eval('#epApply', b => b.disabled), 'nothing to apply when the levels already agree');
await page.click('#epClose');
ok(await page.$eval('#elevProposal', e => e.innerHTML === ''), 'Close dismisses it');

console.log('B. auto-match from grid bubbles');
// against his own hand fits: wipe each floor's fit, keep the project grid
const am = await page.evaluate(async () => {
  const out = [];
  const old = state.levels.map(l => l.alignment && l.alignment.transform && l.alignment.transform.slice());
  for (let i = 0; i < state.levels.length; i++) {
    if (!state.levels[i].pdfPage) continue;
    state.levels[i].alignment = null;
    await autoMatchLevel(i);
    const a = state.align;
    const r = { name: state.levels[i].name, n: a.points.length,
      rms: a.auto ? a.auto.fit.rmsFt * 12 : null, ft: a.auto ? a.auto.fit.ftPerInch : null,
      rot: a.auto ? a.auto.fit.rotationDeg : null, nx: a.auto && a.auto.nx, ny: a.auto && a.auto.ny };
    if (a.points.length >= 2) finishAlignment();
    r.committed = !!(state.levels[i].alignment && state.levels[i].alignment.transform);
    if (old[i] && r.committed) {
      let worst = 0;
      for (const [x, y] of [[200, 200], [2600, 200], [200, 1800], [2600, 1800]]) {
        const p = pixelToBuilding(x, y, old[i]), q = pixelToBuilding(x, y, state.levels[i].alignment.transform);
        worst = Math.max(worst, Math.hypot(p.bx - q.bx, p.by - q.by));
      }
      r.offFtVsHand = worst;
    }
    out.push(r);
  }
  return out;
});
ok(am.length === 5, 'every floor auto-matched');
ok(am.every(r => r.committed), 'and committed a transform');
ok(am.every(r => r.n >= 12), 'each used a dozen or more crossings: ' + JSON.stringify(am.map(r => r.n)));
ok(am.every(r => r.rms < 1), 'RMS under 1 inch on every floor: ' + JSON.stringify(am.map(r => [r.name, +r.rms.toFixed(2)])));
ok(am.every(r => Math.abs(r.ft - 10) < 0.05), 'scale reads 1" = 10\' on every floor: ' + JSON.stringify(am.map(r => +r.ft.toFixed(3))));
ok(am.every(r => Math.abs(r.rot) < 0.1), 'no spurious rotation');
ok(am.every(r => r.offFtVsHand < 1.5),
   'agrees with his hand match to under 1.5 ft across the sheet: ' + JSON.stringify(am.map(r => [r.name, +r.offFtVsHand.toFixed(2)])));
// bubbles use the circle center, not the label's text origin
const bias = await page.evaluate(async () => {
  await goToPage(5); await ensurePageGeometry(5);
  const items = await pageTextCached(5);
  const b = bubbleCentres(items, 5);
  if (!b.length) return null;
  let dx = 0, dy = 0;
  for (const q of b) { dx += q.x - q.tx; dy += q.y - q.ty; }
  return { n: b.length, dx: dx / b.length, dy: dy / b.length };
});
ok(bias && bias.n > 20 && bias.dx > 1 && bias.dy < -1,
   'the circle center sits up and right of the text origin, and that is what is used: ' + JSON.stringify(bias));
// a detail marker with the same number as a grid line must not pose as one
const clean = await page.evaluate(async () => {
  const items = await pageTextCached(5);
  const bands = gridBubbleBands(items, 5);
  const xs = axisFilter(bubbleAxisPositions(bubbleCentres(items, 5), bands.cols, 'x', 3), 'x');
  const ys = axisFilter(bubbleAxisPositions(bubbleCentres(items, 5), bands.rows, 'y', 3), 'y');
  return { xs: xs.map(v => v.label), ys: ys.map(v => v.label) };
});
ok(clean.xs.every(l => /^\d/.test(l)) && clean.ys.every(l => /^[A-Z]/.test(l)),
   'columns come out numbered and rows lettered, no cross-contamination: ' + JSON.stringify(clean));
ok(clean.xs.length >= 8 && clean.ys.length >= 4, 'and the full bands were found: ' + JSON.stringify(clean));

console.log('C. cold start: no project grid, scale from the dimension chain');
await load();
const cold = await page.evaluate(async () => {
  state.project.grid = { x: [], y: [] };
  state.levels.forEach(l => { l.alignment = null; });
  let r = null;
  for (let i = 0; i < state.levels.length; i++) {
    if (!state.levels[i].pdfPage) continue;
    await autoMatchLevel(i);
    const a = state.align;
    if (state.levels[i].name === '3') r = { n: a.points.length, ft: a.auto && a.auto.fit.ftPerInch, rms: a.auto && a.auto.fit.rmsFt * 12 };
    if (a.points.length >= 2) finishAlignment();
  }
  const gx = state.project.grid.x;
  const sp = [];
  for (let k = 1; k < gx.length; k++) sp.push({ from: gx[k - 1].label, to: gx[k].label, ft: gx[k].pos - gx[k - 1].pos });
  r.spans = sp;
  return r;
});
ok(Math.abs(cold.ft - 10) < 0.1, 'the dimension chain gives 1" = 10\' with no grid to fit to: ' + cold.ft);
ok(cold.rms < 1, 'and the fit is tight: ' + cold.rms.toFixed(2) + '"');
const bay = cold.spans.find(s => s.from === '7' && s.to === '8');
ok(bay && Math.abs(bay.ft - 31.5) < 0.25, 'bay 7→8 comes out at the drawn 31\'-6": ' + JSON.stringify(bay));
const tot = cold.spans.reduce((n, s) => n + s.ft, 0);
ok(Math.abs(tot - 273.33) < 1, 'grid 1→10 totals the drawn 273\'-4": ' + tot.toFixed(2));
// a sub-chain dimension must not win over the real one
const scaleScore = await page.evaluate(() => {
  const items = [{ s: "31'-6\"", x: 250, y: 10 }, { s: "10'-0\"", x: 240, y: 30 },
                 { s: "31'-6\"", x: 550, y: 10 }, { s: "63'-0\"", x: 400, y: 40 }];
  const pos = [{ label: '1', pos: 100 }, { label: '2', pos: 400 }, { label: '3', pos: 700 }];
  return gridSpanScale(items, pos, 'x');
});
ok(scaleScore && Math.abs(scaleScore - 31.5 / 300) < 1e-6,
   'the scale that explains the whole chain wins over a sub-dimension: ' + scaleScore);

console.log('D. ortho tracking and the perpendicular lock');
await load();
await page.evaluate(async () => { state.activeLevelIdx = 1; setStep('areas'); setLayer('loading'); await goToPage(5); });
await page.waitForFunction(() => { const r = geomCache[state.pdf.current]; return r && r.ready; }, null, { timeout: 60000 });
ok(await page.$('#orthoToggle') !== null, 'the toolbar has an Ortho toggle');
ok(await page.evaluate(() => { setOrtho(true); return orthoOn() && document.getElementById('orthoToggle').checked; }),
   'the toggle engages ortho with no Shift held');
await page.keyboard.press('F8');
ok(await page.evaluate(() => !state.ortho), 'F8 toggles it');
ok(await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('reshore-calc-snap')); return d.ortho === false; }), 'and it persists');
ok(await page.evaluate(() => orthoOn({ shiftKey: true }) && !orthoOn({ shiftKey: false })), 'Shift still engages it while held');
// the ray locks square onto a real drawing line
const lock = await page.evaluate(() => {
  const lv = getActiveLevel(), poly = zonesOf(lv, 'loading')[0].polygon;
  let minx = 1e9, miny = 1e9, maxy = -1e9;
  for (const p of poly) { minx = Math.min(minx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); }
  const anchor = { x: minx - 300, y: (miny + maxy) / 2 };
  const o = orthoPoint({ x: minx + 4, y: anchor.y + 2 }, anchor, [], 1);
  const plain = orthoPoint({ x: minx + 4, y: anchor.y + 2 }, anchor, [], 1, { perp: false });
  return { kind: o.lockKind, onRay: Math.abs(o.pt.y - anchor.y) < 1e-9, guides: o.guides.map(g => g.kind),
           plainKind: plain.lockKind || null, plainX: plain.pt.x, cursorX: minx + 4 };
});
ok(lock.kind === 'perp' || lock.kind === 'perpedge', 'it locks onto what the ray crosses: ' + JSON.stringify(lock));
ok(lock.onRay, 'the locked point stays on the ortho ray');
ok(lock.guides.includes('track'), 'a tracking ray is drawn');
ok(lock.plainKind === null && Math.abs(lock.plainX - lock.cursorX) < 1e-9, 'perp:false still gives the plain projection');
// a lined-up corner beats a crossing
const both = await page.evaluate(() => {
  const a = { x: 1000, y: 1000 }, other = { x: 1400, y: 600 };
  const o = orthoPoint({ x: 1401, y: 1002 }, a, [a, other], 1);
  return { kind: o.lockKind, x: o.pt.x, guides: o.guides.map(g => g.kind) };
});
ok(both.kind === 'align' && Math.abs(both.x - 1400) < 1e-6, 'a lined-up corner still wins: ' + JSON.stringify(both));
// what actually gets painted: a blue dashed ray, extended across the view
const painted = await page.evaluate(() => {
  const rec = { strokes: [], dashes: [] };
  const oStroke = drawCtx.stroke, oDash = drawCtx.setLineDash;
  drawCtx.stroke = function (...a) { rec.strokes.push(String(this.strokeStyle)); return oStroke.apply(this, a); };
  drawCtx.setLineDash = function (d) { rec.dashes.push((d || []).join('/')); return oDash.call(this, d); };
  setTool('polygon'); state.snap = false; setOrtho(true);
  state.drawing.points = [{ x: 900, y: 900 }];
  state.drawing.guides = orthoPoint({ x: 1600, y: 930 }, state.drawing.points[0], [], state.drawing.zoom, { perp: false }).guides;
  renderNow();
  drawCtx.stroke = oStroke; drawCtx.setLineDash = oDash;
  setOrtho(false); state.snap = true; setTool('select'); state.drawing.points = []; state.drawing.guides = null;
  return rec;
});
ok(painted.strokes.some(c => /37, ?99, ?235/.test(c)), 'the tracking ray is painted blue: ' + JSON.stringify([...new Set(painted.strokes)].slice(0, 6)));
ok(painted.dashes.some(d => d && d !== '' && /\//.test(d)), 'and dashed');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

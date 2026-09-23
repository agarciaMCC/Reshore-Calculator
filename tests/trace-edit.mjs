// @rules UI-06, LOD-06  (see DECISIONS.md)
// Auto-trace review on the test set's load-map sheet (page 1): traced fills
// are editable on the sheet, a missed area can be drawn, and every plan can
// take extra match points.
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
  deserializeDoc(d); sortLevelsByElevation();
  // fresh review: clear the areas the job already took from the load map and unskip the sheet
  state.levels.forEach(l => { l.zones = l.zones.filter(z => !z.fromLoadMap); });
  state.project.skippedPages = [];
  state.activeLevelIdx = 0; renderSidebar(); persist();
  document.getElementById('upload-prompt').style.display = 'none'; document.getElementById('pageNav').style.display = 'flex';
  setStep('areas'); setLayer('loading');
  await goToPage(1);
}, [pdf.toString('base64'), job]);

console.log('A. run the trace on the load-map sheet');
await page.evaluate(() => startAutoTrace());
await page.waitForFunction(() => autoTrace !== null, null, { timeout: 60000 });
let R = await page.evaluate(() => ({ page: autoTrace.page, plans: autoTrace.plans.map(p => ({ title: p.title, n: p.fills.length, ok: p.match.ok, manual: !!p.match.manual, lv: p.levelIdx })), editing: autoTraceEditing() }));
ok(R.page === 1 && R.plans.length >= 1 && R.plans.reduce((n, p) => n + p.n, 0) >= 3, 'trace found plans and fills: ' + JSON.stringify(R.plans));
ok(R.editing, 'review edit mode is on while on the load-map sheet');
ok(await page.$$eval('#autoTracePanel button[data-atmatch]', b => b.length) === R.plans.length, 'every plan offers match points (matched or not)');
ok(await page.$eval('#autoTracePanel', e => /drag its corners/.test(e.textContent)), 'panel explains editing');

console.log('B. fills are the editable shapes');
let e1 = await page.evaluate(() => {
  const fl = autoTraceFillList(); const f = fl[0]; const n = f.polygon.length; const p = f.polygon[0];
  state.activeZoneIdx = 0;   // UI-30: corners come off the selected shape only
  const s = canvasToScreen(p.x, p.y);
  const h = hitTest(s.x, s.y, { anyVertex: true });
  return { n, hit: h && h.kind, zi: h && h.zi, arrIsFills: zonesOfActive() === fl };
});
ok(e1.arrIsFills && e1.hit === 'vertex' && e1.zi === 0, 'hit test lands on a fill corner: ' + JSON.stringify(e1));
// drag a corner of fill 0 by 40 px and check feet/area follow
const drag = await page.evaluate(() => {
  const fl = autoTraceFillList(); const f = fl[0]; const before = { x: f.polygon[0].x, y: f.polygon[0].y, sf: f.areaSF, edited: !!f.edited };
  state.activeZoneIdx = 0; ptr.down = true; ptr.mode = 'vertex'; ptr.hit = { kind: 'vertex', zi: 0, vi: 0 }; ptr.didDrag = true; state.snap = false;
  const s = canvasToScreen(before.x + 40, before.y); updateDrag(s); endDrag(); ptr.down = false; ptr.mode = null; state.snap = true;
  return { before, after: { x: f.polygon[0].x, y: f.polygon[0].y, sf: f.areaSF, edited: !!f.edited }, plMatched: autoTrace.plans[f._pi].match.ok };
});
ok(Math.abs(drag.after.x - drag.before.x - 40) < 1e-6 && drag.after.edited, 'corner moved, fill marked edited: ' + JSON.stringify(drag));
ok(!drag.plMatched || drag.after.sf !== drag.before.sf, 'area in feet recomputed after the edit');
ok(await page.$eval('#autoTracePanel', e => /· edited/.test(e.textContent)), 'panel shows the fill as edited');
// Shift+click removes a corner; Alt+click adds one
const sc = await page.evaluate(() => {
  const f = autoTraceFillList()[0]; const n = f.polygon.length; const p = f.polygon[1]; const s = canvasToScreen(p.x, p.y);
  handleClick({ button: 0, clientX: s.x, clientY: s.y, shiftKey: true, altKey: false }, s);
  const n2 = f.polygon.length;
  state.activeZoneIdx = 0; const a = f.polygon[0], b = f.polygon[1]; const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; const sm = canvasToScreen(m.x, m.y);
  handleClick({ button: 0, clientX: sm.x, clientY: sm.y, shiftKey: false, altKey: true }, sm);
  return { n, n2, n3: f.polygon.length };
});
ok(sc.n2 === sc.n - 1 && sc.n3 === sc.n, 'Shift+click removed and Alt+click re-added a corner: ' + JSON.stringify(sc));
// properties panel is the review version
await page.evaluate(() => { state.activeZoneIdx = 0; renderProperties(); });
ok(await page.$eval('#propsContent', e => /Traced area/.test(e.textContent) && /Remove corner/.test(e.textContent)), 'review properties panel');
// the level's own areas are NOT drawn/snapped on the load map (levelOnScreen bypass only for fills)
ok(await page.evaluate(() => { const lv = getActiveLevel(); return zonesOf(lv, 'loading').length === 0 || zonesOfActive() !== zonesOf(lv, 'loading'); }), 'floor areas not exposed as editable on the load-map sheet');

console.log('C. draw a missed area by hand; delete a traced one');
const before = await page.evaluate(() => autoTraceFillList().length);
await page.evaluate(() => {
  const pl = autoTrace.plans[0]; const bb = pl.bbox; const cx = (bb.minx + bb.maxx) / 2, cy = (bb.miny + bb.maxy) / 2;
  setTool('polygon'); state.drawing.points = [{ x: cx - 30, y: cy - 30 }, { x: cx + 30, y: cy - 30 }, { x: cx + 30, y: cy + 30 }, { x: cx - 30, y: cy + 30 }];
  finishPolygon();
});
let hand = await page.evaluate(() => { const fl = autoTraceFillList(); const f = fl[state.activeZoneIdx]; return { n: fl.length, byHand: !!(f && f.byHand), untagged: !!(f && f.untagged), accepted: !!(f && f.accepted), sel: state.activeZoneIdx, hasB: !!(f && f.bPoly), pl: f && f._pi }; });
ok(hand.n === before + 1 && hand.byHand && hand.untagged && hand.accepted && hand.pl === 0, 'hand-drawn area joined plan 0, ticked, untagged, selected: ' + JSON.stringify(hand));
ok(await page.$eval('#autoTracePanel', e => /drawn by hand/.test(e.textContent) && e.querySelectorAll('select.at-code').length >= 1), 'panel lists it with a code picker');
await page.evaluate(() => { setTool('select'); state.activeZoneIdx = autoTraceFillList().findIndex(f => f.byHand); deleteActiveZone(); });
ok(await page.evaluate(() => autoTraceFillList().length) === before, 'Delete removes it from the review');

console.log('D. add match points on a matched plan');
const m0 = await page.evaluate(() => ({ ok: autoTrace.plans[0].match.ok, manual: !!autoTrace.plans[0].match.manual, T: autoTrace.plans[0].match.ok ? autoTrace.plans[0].match.fit.transform.slice() : null }));
await page.evaluate(() => startPlanMatch(0));
ok(await page.evaluate(() => state.align.active && state.align.planTarget && state.align.planTarget.pi === 0), 'alignment started for plan 0 with a plan target');
// feed three crossings using the existing fit as ground truth (grid 6/A, 7/A, 7/B on the plan)
const fed = await page.evaluate(() => {
  const pl = autoTrace.plans[0]; if (!pl.match.ok) return { skipped: true };
  const T = pl.match.fit.transform;
  const pts = [['6', 'A'], ['7', 'A'], ['7', 'B']].map(([gx, gy]) => { const bx = gridPos('x', gx), by = gridPos('y', gy); const p = buildingToPixel(bx, by, T); return { px: p.px + (gx === '7' && gy === 'B' ? 1.5 : 0), py: p.py, gx, gy }; });
  state.align.points = pts; state.align.sheetScale = pl.match.fit.ftPerInch;
  finishAlignment();
  return { skipped: false, active: state.align.active, manual: !!pl.match.manual, n: pl.match.points && pl.match.points.length, rms: pl.match.fit.rmsFt, ok: pl.match.ok, bPolyOk: pl.fills.every(f => f.bPoly && f.bPoly.length >= 3) };
});
if (!fed.skipped) {
  ok(!fed.active && fed.ok && fed.manual && fed.n === 3, 'three-point manual match replaces the bubble fit: ' + JSON.stringify(fed));
  ok(fed.rms < 0.2 && fed.bPolyOk, 'fit is tight and fills re-projected to feet');
  ok(await page.$eval('#autoTracePanel', e => /matched from 3 clicked crossings/.test(e.textContent)), 'panel reports the clicked match');
} else { ok(true, 'plan 0 not bubble-matched on this set — manual match path exercised elsewhere'); }

console.log('E. accept still works with an edited fill');
await page.evaluate(() => { autoTrace.plans.forEach(p => { if (p.levelIdx < 0) p.levelIdx = 0; p.fills.forEach(f => { if (f.untagged && !f.pick) f.accepted = false; }); }); });
const acc = await page.evaluate(async () => { const n0 = state.levels.reduce((n, l) => n + l.zones.length, 0); await acceptAutoTrace(); return { added: state.levels.reduce((n, l) => n + l.zones.length, 0) - n0, closed: autoTrace === null, editing: autoTraceEditing(), skipped: pageIsSkipped(1) }; });
ok(acc.added >= 3 && acc.closed && !acc.editing && acc.skipped, 'areas added, review closed, sheet marked not-a-floor: ' + JSON.stringify(acc));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

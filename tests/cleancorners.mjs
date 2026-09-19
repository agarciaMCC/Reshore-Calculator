// @rules EDG-01, EDG-02  (see DECISIONS.md)
// Clean corners, on a shape that already exists: the button is there, it
// rebuilds the outline on the drafted lines, a spurious mid-edge vertex like
// the one Adolfo screenshotted goes away, and one undo puts it all back.
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

console.log('A. a detected edge, accepted, then poked full of holes');
await page.evaluate(() => {
  setStep('areas');
  state.activeLevelIdx = state.levels.findIndex(l => l.name === '3');
  setLayer('slab'); renderSidebar();
});
await page.evaluate(() => startDetectFloorEdge());
await page.waitForFunction(() => edgeProposal !== null, null, { timeout: 60000 });
await page.evaluate(() => acceptDetectFloorEdge());
const base = await page.evaluate(() => {
  const lv = getActiveLevel(), arr = zonesOf(lv, 'slab');
  const i = arr.findIndex(z => isEdgeZone(z));
  state.activeZoneIdx = i; renderProperties();
  return { n: arr[i].polygon.length, i };
});
ok(base.n >= 6 && base.n <= 20, `the accepted edge has ${base.n} corners`);
ok(await page.$eval('#propCleanCorners', b => !!b && b.offsetParent !== null), 'Clean corners is on the properties panel');

// the artifact from the screenshot: one drafted corner arriving as two
// vertices with a short off-axis jog between them
const poked = await page.evaluate(() => {
  const lv = getActiveLevel(), arr = zonesOf(lv, 'slab'), z = arr[state.activeZoneIdx];
  const p = z.polygon;
  // find the longest edge and push two extra vertices into it, 2 px off line
  let bi = 0, bl = -1;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L > bl) { bl = L; bi = i; }
  }
  const a = p[bi], b = p[(bi + 1) % p.length];
  const nx = (b.y - a.y) / bl, ny = -(b.x - a.x) / bl;
  const mk = t => ({ x: a.x + (b.x - a.x) * t + nx * 2, y: a.y + (b.y - a.y) * t + ny * 2 });
  z.polygon = p.slice(0, bi + 1).concat([mk(0.33), mk(0.66)], p.slice(bi + 1));
  renderCanvas(); renderProperties();
  return { n: z.polygon.length, edgeLen: bl };
});
ok(poked.n === base.n + 2, `two spurious vertices added (${base.n} → ${poked.n})`);

console.log('B. Clean corners takes them out and leaves the outline where it was');
const areaBefore = await page.evaluate(() => {
  const z = zonesOf(getActiveLevel(), 'slab')[state.activeZoneIdx];
  return Math.abs(z.polygon.reduce((s, p, i) => { const q = z.polygon[(i + 1) % z.polygon.length]; return s + (p.x * q.y - q.x * p.y) }, 0) / 2);
});
await page.evaluate(() => cleanCornersActive());
await page.waitForFunction(n => zonesOf(getActiveLevel(), 'slab')[state.activeZoneIdx].polygon.length !== n, poked.n, { timeout: 60000 });
const after = await page.evaluate(() => {
  const z = zonesOf(getActiveLevel(), 'slab')[state.activeZoneIdx];
  const area = Math.abs(z.polygon.reduce((s, p, i) => { const q = z.polygon[(i + 1) % z.polygon.length]; return s + (p.x * q.y - q.x * p.y) }, 0) / 2);
  return { n: z.polygon.length, area };
});
ok(after.n <= base.n, `the spurious vertices are gone: ${poked.n} → ${after.n} (was ${base.n} before poking)`);
ok(Math.abs(after.area - areaBefore) / areaBefore < 0.02, `area held within 2% (${((after.area - areaBefore) / areaBefore * 100).toFixed(2)}%)`);

console.log('C. one undo puts it back');
await page.evaluate(() => history.undo());
const undone = await page.evaluate(() => zonesOf(getActiveLevel(), 'slab')[state.activeZoneIdx].polygon.length);
ok(undone === poked.n, `undo restores the poked outline: ${undone} corners`);
await page.evaluate(() => history.redo && history.redo());

console.log('D. it refuses to move a shape that has nothing to sit on');
const far = await page.evaluate(async () => {
  const lv = getActiveLevel(), arr = zonesOf(lv, 'slab');
  // a small square out in the margin of the sheet, where nothing is drawn
  const z = { id: sid(), kind: 'slab', thicknessIn: 8, offsetIn: 0, label: 'test', page: state.pdf.current,
              polygon: [{ x: 60, y: 60 }, { x: 260, y: 60 }, { x: 260, y: 200 }, { x: 60, y: 200 },
                        { x: 60, y: 170 }, { x: 60, y: 140 }, { x: 60, y: 110 }] };
  arr.push(z); state.activeZoneIdx = arr.length - 1; renderProperties();
  const before = z.polygon.map(p => ({ x: p.x, y: p.y }));
  await cleanCornersActive();
  const now = zonesOf(getActiveLevel(), 'slab')[state.activeZoneIdx].polygon;
  let moved = 0;
  for (const p of now) {
    let d = 1e18;
    for (const q of before) d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y));
    moved = Math.max(moved, d);
  }
  return { n: now.length, moved };
});
ok(far.moved < 6, `a shape over blank paper is not dragged anywhere (max ${far.moved.toFixed(1)} px)`);
ok(far.n <= 7, `and its collinear vertices may be tidied, not multiplied: ${far.n}`);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

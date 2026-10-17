// @rules LOD-16, LOD-17, ARE-34, BLD-23, EDG-10, UI-39  (see DECISIONS.md)
// Horizon House garage, "trust every default" run (Oct 17, 2026). Accepting
// everything the calculator proposed gave far too few reshores on B3–B6 and
// too many on B2. The worst misreads, each pinned here:
//  A. slab thickness from the sheet's TYP note: B2 12" (not 28" from a
//     thickened band's T/B pair), B1 12" (not 7½"), B7 a 4'-0" mat on grade (BLD-23)
//  B. B4 and B5's parking area offered as B3 34 PSF, not C3 158 PSF (LOD-16)
//  C. the same area is not traced or written twice (ARE-34)
//  D. the load map proposes each floor's typical (LOD-17)
//  E. a floor edge far smaller than the floor above or below is not a good read (EDG-10)
//  F. between suspended floors, "Do the floors line up?" leads with checking
//     the floor below's edge (UI-39)
// Fixture: the job as the run saved it (tests/fixtures/horizon/horizon-trustall.reshore.json).
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
const here = fileURLToPath(new URL('.', import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'horizon', 'horizon-garage.pdf'));
const job = fs.readFileSync(path.resolve(here, 'fixtures', 'horizon', 'horizon-trustall.reshore.json'), 'utf8');
await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.pageImages = {};
  document.getElementById('upload-prompt').style.display = 'none';
}, pdf.toString('base64'));
const openJob = () => page.evaluate((j) => { deserializeDoc(JSON.parse(j)); sortLevelsByElevation(); traceCache = new Map(); }, job);

console.log('A. slab thickness from the TYP note (BLD-23)');
const A = await page.evaluate(async () => {
  await autoReadBuilding();
  const by = n => state.levels.find(l => l.name === n) || {};
  return { slab: Object.fromEntries(state.levels.map(l => [l.name, l.slabThickness])), b7grade: !!by('B7').onGrade,
    band: readSheetTypicalSlab([{ s: 'THICKNED SLAB; TYP.' }, { s: '12" MIN/15" MAX SLAB W/FLAT SOFFIT' }]),
    short: readSheetTypicalSlab([{ s: '8" SLAB TYP.' }]) };
});
ok(A.slab.B2 === 12, 'B2 is 12" from its note, not 28" from the band\'s T/B pair: ' + A.slab.B2);
ok(A.slab.B1 === 12, 'B1 is 12" from its note, not the 7½" default: ' + A.slab.B1);
ok(['B3', 'B4', 'B5', 'B6'].every(n => A.slab[n] === 10), 'B3–B6 stay 10": ' + JSON.stringify(A.slab));
ok(A.slab.B7 === 48 && A.b7grade, 'B7 reads its 4\'-0" mat and is on grade: ' + A.slab.B7);
ok(A.band == null, 'a thickened-band note or a min/max range is not the typical');
ok(A.short && A.short.thickIn === 8, 'the short form "8" SLAB TYP." is read');

await openJob();
console.log('B/C. the load maps (LOD-16, ARE-34)');
const B = await page.evaluate(async () => {
  const r = await autoTracePage(1);
  return r.plans.map(p => {
    const big = p.fills.slice().sort((a, b) => b.areaPx2 - a.areaPx2)[0];
    const sigs = p.fills.map(f => f.code + ':' + Math.round(f.areaPx2) + ':' + [f.bbox.minx, f.bbox.miny].map(Math.round));
    return { lv: state.levels[p.levelIdx].name, pick: big.pick || big.code, cap: big.capacity, note: big.note || '', dup: sigs.length - new Set(sigs).size };
  });
});
const lm = n => B.find(p => p.lv === n) || {};
for (const n of ['B3', 'B4', 'B5', 'B6'])
  ok(lm(n).pick === 'B3' && lm(n).cap === 34, `${n}'s main area is B3 34 PSF: ${JSON.stringify(lm(n))}`);
ok(/C3/.test(lm('B4').note) && /C3/.test(lm('B5').note), 'the leaked C3 room tags are named in the note');
ok(B.every(p => p.dup === 0), 'no area traced twice: ' + B.map(p => p.lv + ':' + p.dup));

const C = await page.evaluate(async () => {
  const lv = state.levels.find(l => l.name === 'B3');
  zonesOf(lv, 'loading').length = 0;
  const T = await tracedLoadMaps();
  const plans = T.plans.filter(p => state.levels[p.levelIdx] === lv);
  const go = async () => {
    autoTrace = { pages: T.read, page: T.read[0], plans: plans.map(p => ({ ...p, fills: p.fills.map(f => ({ ...f, accepted: !!(f.llMark != null || f.mark != null) })) })), failed: [], nTags: 0, empty: [] };
    await acceptAutoTrace();
    return zonesOf(lv, 'loading').length;
  };
  const n1 = await go(), n2 = await go();
  const a = { llMark: 'C', sdlMark: '4', bPoly: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
  return { n1, n2, same: sameLoadArea(a, { ...a, bPoly: [{ x: 10.3, y: 0 }, { x: 0, y: 0.2 }, { x: 10, y: 10 }] }),
    other: sameLoadArea(a, { ...a, sdlMark: '3' }), moved: sameLoadArea(a, { ...a, bPoly: a.bPoly.map(p => ({ x: p.x + 2, y: p.y })) }) };
});
ok(C.n1 > 0 && C.n2 === C.n1, `accepting B3's map twice writes its areas once: ${C.n1} then ${C.n2}`);
ok(C.same && !C.other && !C.moved, 'same mark and outline within 0.5 ft is a copy; another mark or a moved outline is not');

await openJob();
console.log('D. the load map proposes the typical (LOD-17)');
const D = await page.evaluate(async () => {
  for (const l of state.levels) { l.defLL = l.defSDL = l.defMark = undefined; l.defaultCapacity = 0; l.typicalAssumed = undefined; zonesOf(l, 'loading').length = 0; }
  prefillTypicals();
  if (_typicalMapRead) await _typicalMapRead;
  return Object.fromEntries(state.levels.map(l => [l.name, { ll: l.defLL, sdl: l.defSDL, from: l.typicalAssumed || '' }]));
});
for (const n of ['B3', 'B4', 'B5', 'B6'])
  ok(D[n].ll === 'B' && D[n].sdl === '3' && /load map/.test(D[n].from), `${n} proposed B3 from its load map, assumed: ${JSON.stringify(D[n])}`);
ok(D.B2.ll != null, 'B2 gets a proposal too: ' + JSON.stringify(D.B2));
ok(D.B1.ll == null && D.B7.ll == null, 'nothing for the top floor or the floor on grade');

await openJob();
console.log('E. a short floor edge is not a good read (EDG-10)');
const E = await page.evaluate(async () => {
  const sw = await runEdgeSweep();
  const v = Object.fromEntries(sw.rows.map(r => [state.levels[r.levelIdx].name, { v: r.verdict, why: r.why, pick: r.pick }]));
  renderEdgeSweepPanel();
  return v;
});
ok(E.B6.v === 'check' && !E.B6.pick && /B5 above/.test(E.B6.why), 'B6 (14.0k SF under B5\'s 25.0k) is look closely: ' + JSON.stringify(E.B6));
ok(E.B1.v === 'check' && /B2 below/.test(E.B1.why), 'B1 (17.8k SF over B2\'s 27.9k) is look closely: ' + JSON.stringify(E.B1));
ok(['B2', 'B3', 'B4', 'B5', 'B7'].every(n => E[n].v === 'good'), 'the full floors still read well: ' + JSON.stringify(Object.fromEntries(Object.entries(E).map(([k, o]) => [k, o.v]))));

await openJob();
console.log('F. between suspended floors, check the floor below first (UI-39)');
const F = await page.evaluate(async () => {
  for (const r of sheetStackRows()) if (r.over) unacceptStackOvershoot(r.lv, r.page);
  state.ui.stackOpen = true;
  renderSheetStack();
  const host = document.getElementById('sheetStack');
  const chk = [...host.querySelectorAll('button[data-sschk]')].map(b => b.textContent);
  const okb = host.querySelectorAll('button[data-ssok]').length;
  const first = [...host.querySelectorAll('.ss-why')].filter(w => w.querySelector('[data-sschk]')).every(w => w.querySelector('button') === w.querySelector('[data-sschk]'));
  const b = host.querySelector('button[data-sschk]');
  if (b) b.click();
  await new Promise(r => setTimeout(r, 300));
  return { chk, okb, first, step: state.ui.step || (typeof currentStep === 'function' ? currentStep() : null), active: state.levels[state.activeLevelIdx] && state.levels[state.activeLevelIdx].name };
});
ok(F.chk.length >= 1 && F.chk.every(t => /^Check B\d's floor edge$/.test(t)), 'overshoots onto a suspended floor offer "Check <floor>\'s floor edge": ' + JSON.stringify(F.chk));
ok(F.okb >= F.chk.length, 'the slab-on-grade OK is still offered beside it');
ok(F.first, 'the check comes first');
ok(/^B\d$/.test(F.active || '') && F.chk.some(t => t.includes(F.active)), 'clicking it opens that floor: ' + F.active);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

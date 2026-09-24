// @rules BLD-14, ARE-08, MDL-15, LOD-08, LOD-10  (see DECISIONS.md)
// The typical capacity, drawn from the floor edge rather than stored as a
// second shape: it covers the slab, the drawn areas read as exceptions cut out
// of it, it follows the edge through any edit because it IS the edge, and it
// changes nothing the solver does.
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

// A stack with an identity transform (1 image px = 1 building ft): Level 3
// pours, 2 and 1 carry, 0 is on grade. Level 2 gets a 100x60 floor edge, a
// 20x20 exception inside it, and a 6x6 area nested inside THAT.
const build = () => page.evaluate(() => {
  while (history.canUndo()) history.undo();
  state.pdf.doc = null; state.pdf.pages = 0;
  const lv = (name, elev, cap) => ({ id: sid(), name, elevation: elev, slabThickness: 9,
    defaultCapacity: cap, zones: [], slabZones: [],
    alignment: { transform: [1, 0, 0, 1, 0, 0], ftPerInch: 12, nPoints: 2 } });
  state.levels = [lv('3', 30, 0), lv('2', 20, 138), lv('1', 10, 138), lv('0', 0, 0)];
  state.levels[3].onGrade = true;
  const sq = (x0, y0, x1, y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  state.levels[0].slabZones.push({ id: sid(), kind: 'edge', polygon: sq(0, 0, 100, 60) });
  const two = state.levels[1];
  two.slabZones.push({ id: sid(), kind: 'edge', polygon: sq(0, 0, 100, 60) });
  two.zones.push({ id: sid(), label: 'EXCEPTION', capacityPSF: 60, polygon: sq(10, 10, 30, 30) });
  two.zones.push({ id: sid(), label: 'NESTED', capacityPSF: 40, polygon: sq(14, 14, 20, 20) });
  state.activeLevelIdx = 1; state.layer = 'loading'; state.activeZoneIdx = null;
  state.project.solveStepFt = 2; state.project.constructionDL = 30;
  document.getElementById('upload-prompt').style.display = 'none';
  setStep('areas'); renderSidebar(); renderCanvas();
});
// is a point inside the painted typical area? tested off-screen at identity,
// so it is the geometry being checked and not the view transform
const inTypical = (li, x, y) => page.evaluate(([i, px, py]) => {
  const p = typicalAreaPath(state.levels[i]);
  if (!p) return null;
  const c = document.createElement('canvas').getContext('2d');
  return c.isPointInPath(p, px, py, 'evenodd');
}, [li, x, y]);

await build();

console.log('A. it covers the slab, and the exceptions are holes in it');
ok(await inTypical(1, 50, 40) === true, 'a point out in the typical floor is covered');
ok(await inTypical(1, 1, 1) === true, 'right up to the floor edge');
ok(await inTypical(1, 20, 25) === false, 'the drawn exception is punched out');
ok(await inTypical(1, 17, 17) === false,
   'and an area nested inside that exception stays out — punching it again would fill it back in');
ok(await inTypical(1, 120, 40) === false, 'nothing outside the floor edge');

console.log('B. no floor edge, nothing to bound it with');
const noEdge = await page.evaluate(() => {
  const two = state.levels[1], keep = two.slabZones.slice();
  two.slabZones.length = 0;
  const p = typicalAreaPath(two);
  two.slabZones.push(...keep);
  return p === null;
});
ok(noEdge, 'the path is null — the floor exists everywhere and there is no outline');

console.log('C. it follows the edge, with nothing to keep in sync');
const followed = await page.evaluate(() => {
  const two = state.levels[1];
  const edge = levelEdges(two)[0];
  const c = document.createElement('canvas').getContext('2d');
  const at = (x, y) => c.isPointInPath(typicalAreaPath(two), x, y, 'evenodd');
  const before = at(90, 50);
  edge.polygon[1] = { x: 60, y: 0 };            // drag the top-right corner in
  edge.polygon[2] = { x: 60, y: 60 };
  const after = at(90, 50);
  const stillIn = at(30, 50);
  edge.polygon[1] = { x: 100, y: 0 }; edge.polygon[2] = { x: 100, y: 60 };
  return { before, after, stillIn, back: at(90, 50) };
});
ok(followed.before === true && followed.after === false,
   'shrinking the edge shrinks the typical area, with no separate shape to update');
ok(followed.stillIn === true, 'the part still inside stays covered');
ok(followed.back === true, 'and it comes back when the edge does');

console.log('D. the label says what it is, and flags a floor with nothing set');
const labels = await page.evaluate(() => {
  const two = state.levels[1], three = state.levels[0];
  const a = { cap: levelDefaultCapacity(two), code: levelDefaultCode(two), at: typicalLabelAt(two) };
  const b = { cap: levelDefaultCapacity(three), at: typicalLabelAt(three) };
  return { a, b };
});
ok(labels.a.cap === 138 && Math.round(labels.a.at.x) === 50 && Math.round(labels.a.at.y) === 30,
   'the label sits in the middle of the biggest edge shape: ' + JSON.stringify(labels.a.at));
ok(labels.b.cap === 0 && !!labels.b.at,
   'a floor with no typical capacity still gets one, to show it is unset: ' + JSON.stringify(labels.b));

console.log('E. the Areas step shows the level default and points at its home');
// Adolfo, Sep 21 2026: the typical capacity has ONE home — the Loads step.
// The Areas row and the Levels row show it read-only and link there.
await page.evaluate(() => { state.activeLevelIdx = 1; setLayer('loading'); renderSidebar() });
const row = await page.evaluate(() => {
  const r = document.querySelector('#zoneList .typ-row');
  return r && { text: r.textContent.replace(/\s+/g, ' ').trim(), unset: r.classList.contains('unset'),
                controls: r.querySelectorAll('.lvl-edit').length, ro: !!r.querySelector('.lvl-cap-ro'), link: !!r.querySelector('a[data-golo]') };
});
ok(row && /Typical capacity/.test(row.text), 'the row is there: ' + JSON.stringify(row && row.text));
ok(row && /138 PSF/.test(row.text), 'showing the capacity');
ok(row && /inside the floor edge/.test(row.text), 'and saying it is bounded by the edge');
ok(row && !row.unset, 'not flagged, because it is set');
ok(row && row.controls === 0 && row.ro && row.link, 'read-only, with a link to the Loads step: ' + JSON.stringify(row));
// BLD-14 (Sep 21 2026): the Levels row says nothing about loads at all — no
// capacity cell, no link, no PSF in its worked-out line; Building is geometry
const lvRow = await page.evaluate(() => { renderLevelList(); const r = document.querySelector('#levelList .sb-item[data-level="1"]');
  return { ro: !!r.querySelector('.lvl-cap-ro'), edits: r.querySelectorAll('.lvl-edit[data-f="cap"], .lvl-edit[data-f="defMark"], .lvl-edit[data-f="defLL"]').length, psf: /PSF/.test(r.textContent), capHead: !!document.querySelector('#levelList .lvl-cols span[data-col="cap"]') } });
ok(!lvRow.ro && lvRow.edits === 0 && !lvRow.psf && !lvRow.capHead, 'the Levels row carries nothing about loads (BLD-14): ' + JSON.stringify(lvRow));

const unset = await page.evaluate(() => {
  state.activeLevelIdx = 0; renderSidebar();          // Level 3 has no default
  const r = document.querySelector('#zoneList .typ-row');
  return r && { unset: r.classList.contains('unset'), text: r.textContent.replace(/\s+/g, ' ').trim() };
});
ok(unset && unset.unset && /not set/.test(unset.text), 'a floor with none is flagged: ' + JSON.stringify(unset && unset.text));

const onSlab = await page.evaluate(() => { setLayer('slab'); renderSidebar();
  return !document.querySelector('#zoneList .typ-row') });
ok(onSlab, 'and it is not on the slab layer, which is not about capacity');
await page.evaluate(() => setLayer('loading'));

console.log('F. the Loads step edits it, and it takes one undo');
const edited = await page.evaluate(() => {
  const link = document.querySelector('#zoneList .typ-row a[data-golo]');
  link.click();
  const landed = curStep;
  const blk = document.getElementById('lmTypical');
  const inp = blk && blk.querySelector('.typ-brow[data-tli="1"] .lvl-edit[data-f="cap"]');
  const before = { cap: state.levels[1].defaultCapacity, depth: history.depth(), rows: blk ? blk.querySelectorAll('.typ-brow').length : -1 };
  inp.value = '175';
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  const after = { cap: levelDefaultCapacity(state.levels[1]), depth: history.depth(),
    shown: (() => { const r = document.querySelector('#lmTypical .typ-brow[data-tli="1"]'); const sp = r.querySelector('.tb-psf'), inp = r.querySelector('.lvl-edit[data-f="cap"]'); return sp ? sp.textContent.trim() : inp ? inp.value + ' PSF' : ''; })() };
  history.undo();
  return { landed, before, after, undone: levelDefaultCapacity(state.levels[1]) };
});
ok(edited.landed === 'loads', 'the link lands on the Loads step: ' + edited.landed);
ok(edited.before.rows >= 1, 'which has a typical row per carrying floor: ' + edited.before.rows);
ok(edited.after.cap === 175 && edited.after.shown === '175 PSF', 'the level default is what changes: ' + JSON.stringify(edited.after));
ok(edited.after.depth === edited.before.depth + 1, 'one undo entry: ' + JSON.stringify(edited));
ok(edited.undone === 138, 'and undo puts it back: ' + edited.undone);
await page.evaluate(() => setStep('areas'));

console.log('G. drawing it changes nothing the solver does');
await build();
const solved = await page.evaluate(() => {
  const s = solveAll({ step: 2 });
  const L = s.levels[0];
  const r0 = L.solve.regions[0];
  return { regions: L.solve.regions.length,
           sf: Math.round(L.solve.regions.reduce((n, r) => n + r.areaSF, 0)),
           first: Math.round((r0.steps[0].resultant ?? 0) * 100) / 100 };
});
ok(solved.sf >= 5900 && solved.sf <= 6100, 'the pour still covers its floor edge: ' + solved.sf + ' SF');
ok(solved.first === 4.5, 'and Level 2 still carries 142.5 - 138 = 4.5 PSF from its default: ' + solved.first);
const regionsWithout = await page.evaluate(() => {
  // the typical area is drawing only: removing Level 2's floor edge (which
  // bounds the drawing) must not move a single number
  const two = state.levels[1], keep = two.slabZones.slice();
  two.slabZones.length = 0;
  const a = solveAll({ step: 2 }).levels[0];
  two.slabZones.push(...keep);
  const b = solveAll({ step: 2 }).levels[0];
  const sum = L => Math.round(L.solve.regions.reduce((n, r) => n + r.areaSF, 0));
  return { a: sum(a), b: sum(b), ra: a.solve.regions.length, rb: b.solve.regions.length };
});
ok(regionsWithout.a === regionsWithout.b && regionsWithout.ra === regionsWithout.rb,
   'identical with and without the boundary it is drawn against: ' + JSON.stringify(regionsWithout));

console.log('H. outermost-only, so an overlap that is not nested still counts');
const outer = await page.evaluate(() => {
  const two = state.levels[1];
  const sq = (x0, y0, x1, y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  // one that straddles the edge of the exception rather than sitting inside it
  two.zones.push({ id: sid(), label: 'STRADDLE', capacityPSF: 50, polygon: sq(25, 25, 45, 45) });
  const c = document.createElement('canvas').getContext('2d');
  const at = (x, y) => c.isPointInPath(typicalAreaPath(two), x, y, 'evenodd');
  const r = { inStraddle: at(40, 40), inException: at(20, 25), inNested: at(17, 17), open: at(70, 40) };
  two.zones.pop();
  return r;
});
ok(outer.inStraddle === false, 'an area that only overlaps another is still punched out');
ok(outer.inException === false && outer.inNested === false, 'the nested pair behave as before');
ok(outer.open === true, 'and the rest of the floor is untouched');

// ── I. the regression his report caught ─────────────────────────────────
console.log('I. Results reads the typical capacity, on the pour and below it');
const readIt = await page.evaluate(() => {
  // Level 2 carries at its typical 138; Level 3 pours with only a small
  // exception drawn on it, the state the typical area leaves you in
  const sq = (x0, y0, x1, y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  const three = state.levels[0];
  three.zones.length = 0;
  three.zones.push({ id: sid(), label: 'STAIR', capacityPSF: 40, polygon: sq(4, 4, 14, 14) });
  const s = solveAll({ step: 2 });
  const L = s.levels[0];
  const sf = Math.round(L.solve.regions.reduce((n, r) => n + r.areaSF, 0));
  // and Level 2's typical capacity is what the cascade used
  const caps = L.solve.regions.map(r => r.steps.filter(t => !t.open && !t.grade).map(t => t.capacity));
  return { sf, regions: L.solve.regions.length, caps: caps[0] };
});
ok(readIt.sf >= 5900 && readIt.sf <= 6100,
   'the pour covers its floor edge, not the one small area drawn on it: ' + readIt.sf + ' SF');
ok(readIt.caps.includes(138), "and Level 2's typical 138 PSF is what carries it: " + JSON.stringify(readIt.caps));

console.log('J. and it is drawn on the floor whose typical capacity carried it');
const shown = await page.evaluate(() => {
  const s = solveAll({ step: 2 });
  const L = s.levels[0], r = L.solve.regions[0];
  state.ui.highlight = { cells: r.cells, step: r.cellStep, bb: r.bb, label: 'R1', regionKey: r.key, pour: L.pour.name };
  const two = state.levels[1], three = state.levels[0];
  const res = { two: highlightUsedDefault(two), three: highlightUsedDefault(three),
                keptOnTwo: [...highlightTouchSet(two)].length };
  state.ui.highlight = null;
  return res;
});
ok(shown.two === true, 'Level 2 is flagged as having carried it on its typical capacity');
ok(shown.keptOnTwo === 2, 'its two exceptions are kept as well, since they governed their own patches: ' + shown.keptOnTwo);
const bare = await page.evaluate(() => {
  // a floor carrying entirely on its typical capacity keeps no shape at all —
  // which is exactly why the fill has to be drawn for it
  const two = state.levels[1], keep = two.zones.slice();
  two.zones.length = 0;
  const s = solveAll({ step: 2 }), L = s.levels[0], r = L.solve.regions[0];
  state.ui.highlight = { cells: r.cells, step: r.cellStep, bb: r.bb, label: 'R1', regionKey: r.key, pour: L.pour.name };
  const set = highlightTouchSet(two);
  const res = { kept: [...set].length, used: highlightUsedDefault(two),
                loadingKept: zonesOf(two,'loading').filter(z=>set.has(z.id)).length,
                edgeKept: levelEdges(two).filter(z=>set.has(z.id)).length };
  state.ui.highlight = null; two.zones.push(...keep);
  return res;
});
ok(bare.loadingKept === 0 && bare.used === true,
   'no loading shape is kept, and the typical is flagged instead: ' + JSON.stringify(bare));
ok(bare.edgeKept === 1, 'only the floor edge, which is what bounds the fill: ' + JSON.stringify(bare));

// ── H. the card says where it stands, and the step waits for it ─────────
// Adolfo, Sep 21 2026: "make this section stand out more. it feels like it
// can easily get missed." Styling is half of it; the other half is that the
// Loads step used to go green on confirmed marks alone (LOD-10).
console.log('H. the typical capacity is not a footnote');
const H = await page.evaluate(() => {
  setStep('loads');
  const rows = state.levels.filter(l => !levelOnGrade(l) && l.id !== topLevelId());
  const blk = () => document.getElementById('lmTypical');
  const read = () => ({ needs: blk().classList.contains('needs'),
    chip: blk().querySelector('.typ-state').textContent.trim(),
    status: stepStatus('loads'), gap: typicalGap() });
  rows.forEach(l => delete l.typicalAssumed);
  renderTypicalBlock();
  const allSet = read();
  // the two pickers are the live- and dead-load marks: side by side, labeled
  const sels = [...blk().querySelectorAll('.typ-brow.first .lvl-sel')].map(e => e.getBoundingClientRect());
  const lbls = [...blk().querySelectorAll('.typ-brow.first .tb-lbl')].map(e => e.textContent.trim());
  const picker = { n: sels.length, sameRow: sels.length < 2 || Math.abs(sels[0].top - sels[1].top) < 2, lbls };
  rows[0].typicalAssumed = 'the TYPICAL row of the schedule';
  renderTypicalBlock();
  const assumed = Object.assign(read(), { btn: !!blk().querySelector('.typ-act #typConfirmAll') });
  const last = rows[rows.length - 1];
  const keep = { ll: last.defLL, sdl: last.defSDL, mark: last.defMark, cap: last.defaultCapacity };
  last.defLL = null; last.defSDL = null; last.defMark = null; last.defaultCapacity = 0;
  renderTypicalBlock();
  const unset = Object.assign(read(), { flagged: !!blk().querySelector('.typ-brow.unset') });
  Object.assign(last, { defLL: keep.ll, defSDL: keep.sdl, defMark: keep.mark, defaultCapacity: keep.cap });
  delete rows[0].typicalAssumed;
  renderTypicalBlock();
  return { allSet, assumed, unset, back: read(), picker, n: rows.length };
});
ok(!H.allSet.needs && /all \d set/.test(H.allSet.chip), 'with every floor set the card is quiet and says so: ' + H.allSet.chip);
ok(H.assumed.needs && /1 to confirm/.test(H.assumed.chip), 'an assumed value turns the card amber: ' + H.assumed.chip);
ok(H.assumed.btn, 'with Confirm all N assumed as its own action');
ok(H.unset.needs && /1 still to set/.test(H.unset.chip) && H.unset.flagged, 'a floor with none is flagged on its row: ' + H.unset.chip);
ok(!H.back.needs && /all \d set/.test(H.back.chip), 'put back, the card goes quiet again: ' + H.back.chip);
// what the step does with all this is asserted where a schedule exists:
// tests/loadentry.mjs, section E
ok(H.picker.sameRow, 'the live- and dead-load pickers sit side by side, not stacked: ' + JSON.stringify(H.picker));
ok(H.picker.n < 2 || /LL/.test(H.picker.lbls.join('')), 'each labeled, so B and 2 do not read as one code: ' + JSON.stringify(H.picker.lbls));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

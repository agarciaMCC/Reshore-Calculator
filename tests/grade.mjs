// Slab-on-grade behaviour: whole-level flag, per-area kind, warnings,
// schedule rows, persistence, and a Kalae regression check.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';

const file = 'file://' + path.resolve(new URL('.', import.meta.url).pathname, '..', 'reshore-calc.html');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(Math.abs(a - b) < 1e-6, `${m}: got ${a}, want ${b}`);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto(file);
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// ---- fixture: identity transform, 1 px = 1 ft ----
const setup = (opts) => page.evaluate((o) => {
  const T = [1, 0, 0, 1, 0, 0];
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const mk = (name, el, slab, cap, extra = {}) => ({
    id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap,
    rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [], alignment: { transform: T, points: [] }, ...extra,
  });
  state.project = { name: 'grade-test', loadingConditions: [{ mark: '1', desc: 'TYP', sdl: 14, ll: 40, confirmed: true }], shoreChoices: {}, solveStepFt: 10 };
  state.levels = o.levels.map(l => mk(...l.args, l.extra || {}));
  // A stand-in sheet: the step gates want a drawing set and a sheet per floor
  // before Results will solve, and these fixtures are pure geometry.
  state.pdf.pages = 1; state.pdf.current = 1;
  state.levels.forEach(l => { l.pdfPage = 1; });
  state.levels[0].zones.push({ id: sid(), polygon: sq(0, 0, 100, 100), capacityPSF: 54, mark: '1', label: '', colorIdx: 0 });
  if (o.gradeArea) {
    const lv = state.levels.find(l => l.name === o.gradeArea.level);
    lv.slabZones.push({ id: sid(), polygon: sq(...o.gradeArea.box), kind: 'grade', thicknessIn: null, offsetIn: 0, label: 'pad' });
  }
  state.results = null; state.activeLevelIdx = 0;
  renderSidebar(); persist();
}, opts);

const solve = () => page.evaluate(() => {
  const s = solveAll({ step: 10 });
  const L = s.levels[0].solve;
  return {
    spatial: L.spatial, reason: L.reason, unaligned: L.unaligned, unresolved: L.anyUnresolved, hasGrade: L.hasGrade,
    regions: (L.regions||[]).map(r => ({
      key: r.key, area: r.areaSF, reshore: r.reshoreLevels, toGrade: r.toGrade, unresolved: r.unresolved,
      steps: r.steps.map(st => ({ name: st.level.name, res: st.resultant, rem: st.remaining, grade: !!st.grade, open: !!st.open, h: st.shoreHeightFt, sup: st.supportLevel && st.supportLevel.name, nOpt: st.options.length })),
    })),
    warnings: levelStackWarnings(),
  };
});

console.log('A. whole-level SOG at the bottom, matched like every other floor');
// Sep 15 2026, Adolfo reversed the exemption: "it still needs to match so
// that it can align with the floors above, right? since reshore will sit on
// this level." So the SOG carries a match here, and a SOG WITHOUT one is a
// floor not matched — checked at the end of this section.
await setup({ levels: [
  { args: ['L3', 30, 7.5, 54] }, { args: ['L2', 20, 7.5, 54] }, { args: ['L1', 10, 7.5, 54] },
  { args: ['SOG', 0, 5, 0], extra: { onGrade: true } },
] });
let r = await solve();
ok(r.spatial, 'spatial solve: ' + r.reason + ' ' + JSON.stringify(r.unaligned));
ok(r.regions.length === 1, 'one region');
let st = r.regions[0].steps;
eq(st[0].res, 69.75, 'L2 resultant'); eq(st[1].res, 15.75, 'L1 resultant');
ok(st[2].grade && st[2].name === 'SOG', 'third row is the grade row');
eq(st[2].rem, 15.75, 'load arriving at grade');
ok(!r.unresolved && !r.regions[0].unresolved, 'not unresolved');
ok(r.regions[0].reshore === 2, 'two reshore levels');
ok(r.regions[0].toGrade, 'region flagged to grade');
eq(st[1].h, 10 - 7.5 / 12, 'L1 shore stands on SOG T.O.S.');
ok(st[1].sup === 'SOG' && st[1].nOpt > 0, 'L1 row has shore options standing on SOG');
ok(r.warnings.length === 0, 'no stack warnings: ' + r.warnings.join(' | '));
ok(r.hasGrade, 'hasGrade');
// the beam on that stack ends at grade too
let beam = await page.evaluate(() => {
  const stack = expandLevels(); stack.forEach(l => { l._capAt = levelDefaultCapacity(l); l._slabAt = slabAt(l, null); });
  const res = cascadeAtPoint(stack, 0, 7.5, 30, state.shores);
  const item = { beamId: 'b', regionKey: 'k', widthFt: 2, plf: 712.5, profile: beamProfileAt(stack, 0, res.steps, state.shores) };
  const ch = beamChain(item, 'L3');
  return { unresolved: ch.unresolved, last: ch.rows[ch.rows.length - 1], n: ch.rows.length };
});
ok(!beam.unresolved && beam.last.grade && beam.last.beamNet === 0, 'beam stem absorbed at grade: ' + JSON.stringify(beam));
// ...and the reversal itself: a slab on grade with no sheet match is a floor
// not matched, like any other, because the reshoring stands on it
await setup({ levels: [
  { args: ['L3', 30, 7.5, 54] }, { args: ['L2', 20, 7.5, 54] }, { args: ['L1', 10, 7.5, 54] },
  { args: ['SOG', 0, 5, 0], extra: { onGrade: true, alignment: null } },
] });
const unmatchedSOG = await solve();
ok(!unmatchedSOG.spatial && (unmatchedSOG.unaligned || []).includes('SOG'),
  'a SOG with no match is a floor not matched, not an exemption: '
  + unmatchedSOG.reason + ' ' + JSON.stringify(unmatchedSOG.unaligned));

console.log('B. same stack, SOG not marked');
await page.evaluate(() => { state.levels[3].onGrade = false; state.levels[3].alignment = { transform: [1, 0, 0, 1, 0, 0], points: [] }; state.results = null; });
r = await solve();
ok(r.spatial, 'spatial: '+r.reason+' '+JSON.stringify(r.unaligned));
st = r.regions[0].steps;
eq(st[2].res, 15.75, 'bottom floor at 0 PSF passes 15.75');
ok(r.unresolved && !r.hasGrade, 'unresolved, no grade in stack');
await page.evaluate(() => { runSchedule(); });
let head = await page.$eval('#schedHead', e => e.textContent);
ok(/mark the lowest floor as slab on grade/.test(head), 'hint to mark SOG: ' + head.slice(0, 200));
// unmarked SOG needs a match again
await page.evaluate(() => { state.levels[3].alignment = null; });
r = await solve();
ok(!r.spatial && r.unaligned.includes('SOG'), 'unmarked bottom floor needs a match');

console.log('C. partial SOG area on L1 with a basement below');
await setup({ levels: [
  { args: ['L2', 20, 7.5, 54] }, { args: ['L1', 10, 7.5, 54] }, { args: ['B1', 0, 7.5, 88] },
], gradeArea: { level: 'L1', box: [0, 0, 50, 100] } });
r = await solve();
ok(r.regions.length === 2, 'two regions: ' + r.regions.map(x => x.key).join(' ; '));
let g = r.regions.find(x => x.toGrade), s2 = r.regions.find(x => !x.toGrade);
ok(g && s2, 'one region to grade, one suspended');
eq(g.area, 5000, 'grade half area'); eq(s2.area, 5000, 'suspended half area');
// L1 is the first floor under the pour; on grade there it takes the whole
// placement load and nothing is shored (the formwork under L2 is not this calc)
ok(g.steps.length === 1 && g.steps[0].grade && g.steps[0].name === 'L1', 'grade half: L1 absorbs at once, no shore rows: ' + JSON.stringify(g.steps));
eq(g.steps[0].rem, 123.75, 'grade half: full placement load arrives at grade');
ok(g.reshore === 0, 'grade half: zero reshore levels');
ok(s2.steps.length === 2 && s2.steps[0].res === 69.75 && s2.steps[1].name === 'B1' && Math.abs(s2.steps[1].res - (-18.25)) < 1e-6, 'suspended half continues to B1: ' + JSON.stringify(s2.steps));
ok(!r.unresolved, 'nothing unresolved');
ok(r.warnings.length === 0, 'partial SOG allows floors below: ' + r.warnings.join('|'));

console.log('D. floors under a whole-level SOG are flagged');
await page.evaluate(() => { state.levels[1].onGrade = true; state.results = null; });
r = await solve();
ok(r.warnings.some(w => /L1 is slab on grade, but B1 sits below it/.test(w)), 'stack warning: ' + r.warnings.join('|'));
ok(r.regions.every(x => x.steps[x.steps.length - 1].grade), 'cascade stops at L1 everywhere');
let stepTxt = await page.evaluate(() => stepStatus('levels').text);
ok(/slab on grade/.test(stepTxt), 'Levels step shows the warning: ' + stepTxt);
await page.evaluate(() => { state.levels[2].onGrade = true; });
r = await solve();
ok(r.warnings.some(w => /also marked slab on grade/.test(w)), 'two grade levels flagged');

console.log('E. pour on grade area needs no reshoring');
await setup({ levels: [ { args: ['L1', 10, 7.5, 54] }, { args: ['B1', 0, 7.5, 54] } ], gradeArea: { level: 'L1', box: [0, 0, 100, 40] } });
let e = await page.evaluate(() => { const L = solveAll({ step: 10 }).levels[0].solve; return { g: L.gradeSamples, a: L.areaSF, ga: L.gradeAreaSF }; });
eq(e.ga, 4000, 'grade area on pour'); eq(e.a, 6000, 'sampled area');

console.log('F. UI: level row toggle, kind switch, schedule row, undo, persistence');
await setup({ levels: [ { args: ['L2', 20, 7.5, 54] }, { args: ['L1', 10, 7.5, 54] }, { args: ['SOG', 0, 5, 0] } ] });
ok(await page.$$eval('#levelList .lvl-sog', b => b.length) === 3, 'a grade toggle per level');
await page.evaluate(() => setStep('levels'));
await page.click('#levelList .lvl-sog[data-soglevel="2"]');
ok(await page.evaluate(() => levelOnGrade(state.levels[2])), 'click marks SOG');
ok(await page.$eval('#levelList', e => /SOG/.test(e.querySelector('.sb-item[data-level="2"] .lvl-sog-badge')?.textContent || '')), 'badge replaces the capacity control');
ok(await page.$eval('#levelList', e => !e.querySelector('.sb-item[data-level="2"] .lvl-edit[data-f="cap"]')), 'no PSF input on a grade level');
ok(await page.$eval('#levelList .sb-item[data-level="2"] .lvl-meta', e => /slab on grade/.test(e.textContent)), 'meta says slab on grade');
await page.evaluate(() => history.undo());
ok(!(await page.evaluate(() => levelOnGrade(state.levels[2]))), 'undo unmarks');
await page.evaluate(() => history.redo());
ok(await page.evaluate(() => levelOnGrade(state.levels[2])), 'redo re-marks');
ok(await page.evaluate(() => levelsWithoutCapacity().length === 0), 'grade level not reported as missing capacity');
await page.evaluate(() => { runSchedule(); });
let body = await page.$eval('#schedBody', e => e.textContent);
ok(/on grade — absorbs the remaining 69\.8 PSF; no shores below/.test(body), 'grade row text: ' + body.replace(/\s+/g, ' ').slice(-300));
ok(await page.$$eval('#schedBody tr.sched-grade', t => t.length) === 1, 'one grade row');
head = await page.$eval('#schedHead', e => e.textContent);
ok(!/Load still remains/.test(head), 'no unresolved warning');
// the draw menu offers the four things you can start as; grade is reached
// through a slab area's Type box instead
ok(await page.$eval('#drawSlabPop', e => [...e.querySelectorAll('button[data-newkind]')].map(b => b.dataset.newkind).join(',')) === 'slab,opening,beam,edge', 'draw menu options');
await page.evaluate(() => {
  setLayer('slab'); state.ui.slabKind = 'grade'; state.activeLevelIdx = 1;
  state.drawing.points = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }];
  finishPolygon();
});
let z = await page.evaluate(() => { const z = zonesOf(state.levels[1], 'slab')[0]; return { kind: z.kind, t: z.thicknessIn, lbl: polygonToolLabel() }; });
ok(z.kind === 'grade' && z.t === 7.5, 'drawn shape is grade with level thickness');
ok(/on-grade/.test(z.lbl), 'tool label: ' + z.lbl);
ok(await page.$eval('#zoneList', e => /Slab on grade/.test(e.textContent) && /On grade/.test(e.textContent)), 'zone list names it and groups it');
ok(await page.$eval('#propKind', e => e.value === 'grade'), 'Type select shows grade');
await page.evaluate(() => setStep('areas'));
await page.selectOption('#propKind', 'opening');
ok(await page.evaluate(() => zonesOf(state.levels[1], 'slab')[0].kind === 'opening'), 'convert to opening');
await page.selectOption('#propKind', 'grade');
ok(await page.evaluate(() => { const z = zonesOf(state.levels[1], 'slab')[0]; return z.kind === 'grade' && z.thicknessIn === 7.5; }), 'convert back restores thickness');
// canvas draws without error
await page.evaluate(() => renderCanvas());
// persistence
await page.evaluate(() => persist());
const raw = await page.evaluate(() => localStorage.getItem('reshore-calc-state'));
const doc = JSON.parse(raw);
ok(doc.levels[2].onGrade === true, 'onGrade persisted');
ok(doc.levels[1].slabZones[0].kind === 'grade', 'grade kind persisted');
await page.evaluate(() => { state.levels = []; loadState(); renderSidebar(); });
ok(await page.evaluate(() => levelOnGrade(state.levels[2]) && isGradeZone(zonesOf(state.levels[1], 'slab')[0])), 'restored after loadState');
// save / open job round trip through serializeDoc
ok(await page.evaluate(() => JSON.parse(JSON.stringify(serializeDoc())).levels[2].onGrade === true), 'serializeDoc keeps onGrade');
// range levels get no toggle
await page.evaluate(() => { state.levels[0].rangeFrom = 2; state.levels[0].rangeTo = 5; state.levels[0].name = 'L5'; state.levels[0].floorToFloor = 10; renderLevelList(); });
ok(await page.$$eval('#levelList .sb-item[data-level="0"] .lvl-sog', b => b.length) === 0, 'no toggle on a typical range');

console.log('G. Kalae regression (no grade anywhere)');
await setup({ levels: [ { args: ['L8', 80, 7.5, 54] }, { args: ['L7', 70, 7.5, 54] }, { args: ['L6', 60, 7.5, 54] }, { args: ['L5', 50, 7.5, 88] }, { args: ['L4', 40, 7.5, 88] } ] });
r = await solve();
st = r.regions[0].steps;
eq(st[0].res, 69.75, 'L7'); eq(st[1].res, 15.75, 'L6'); eq(st[2].res, -72.25, 'L5');
ok(st.length === 3 && !r.unresolved && !st.some(x => x.grade), 'absorbed at L5, no grade rows');

console.log('H. print view includes the grade note');
await setup({ levels: [ { args: ['L2', 20, 7.5, 54] }, { args: ['L1', 10, 7.5, 54] }, { args: ['SOG', 0, 5, 0], extra: { onGrade: true } } ] });
const printed = await page.evaluate(async () => {
  runSchedule();
  let html = '';
  const w = { document: { write: s => { html += s; }, close() {} }, print() {} };
  const orig = window.open; window.open = () => w;
  try { printSchedule(); } finally { window.open = orig; }
  return html;
});
ok(/SOG is slab on grade: the remaining 69\.8 PSF is taken by the soil/.test(printed), 'print note present');
ok(/A slab on grade \(whole floor or drawn area\) absorbs/.test(printed), 'footer assumption present');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

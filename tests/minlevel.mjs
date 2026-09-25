// @rules MDL-19  (see DECISIONS.md)
// MINIMUM 2 LEVELS OF RESHORE. Adolfo, Sep 25 2026: "For our typical reshore
// of our slabs (beams excluded) if only one level of reshore is required, we
// would default to 2 levels of reshore (except where not possible when
// reshore goes to slab on grade) as a safety measure since slabs are still
// pretty 'green' when we pour on top of them ... Maybe just have something
// that says 'minimum 2 levels of reshore required' at the 2nd level." The
// second level goes in at the loosest pattern ("loosest pattern"). And where
// a floor absorbs the load with no shores under it, what lies below it no
// longer splits a region ("they should be merged").
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

console.log('A. the cascade, on a stack built by hand');
const A = await page.evaluate(() => {
  // pour at 40 ft, floors every 10 ft; 9" slabs → 142.5 PSF placed
  const mk = (name, el, cap, extra) => ({ name, elevation: el, slabThickness: 9, _slabAt: { open: false, thick: 9, off: 0, soffitIn: 9, ...(extra || {}) }, _capAt: cap });
  const run = caps => {
    const st = [mk('P', 40, 0)].concat(caps.map((c, i) => c === 'grade' ? mk('G' + i, 30 - i * 10, 0, { grade: true }) : mk('F' + i, 30 - i * 10, c)));
    const res = cascadeAtPoint(st, 0, 9, 30, state.shores);
    return res.steps.map(s => ({ n: s.level.name, res: s.resultant, min: !!s.minLevel, needs: stNeeds(s), h: s.shoreHeightFt, pats: [...new Set((s.options || []).map(o => o.pattern))], grade: !!s.grade, onGrade: !!s.onGrade })).concat([{ levels: res.reshoreLevels }]);
  };
  return {
    one: run([100, 200, 50, 'grade']),       // one level needed, absorbed at the 2nd
    two: run([50, 60, 100, 'grade']),        // two needed already
    toGrade: run([100, 'grade']),            // the 2nd floor down is on grade
    none: run([200, 100, 'grade']),          // the first floor takes it all
    onGradeBelow: run([100, 200, 'grade']),  // the 2nd level stands on grade
    bottom: [(() => { const st = [mk('P', 40, 0), mk('F0', 30, 100), mk('F1', 20, 200)]; const r = cascadeAtPoint(st, 0, 9, 30, state.shores); return r.steps.map(s => !!s.minLevel); })()],
    loose: GRID_PATTERNS[GRID_PATTERNS.length - 1].name,
  };
});
const [a0, a1] = A.one;
ok(a0.res > 0 && a0.needs && !a0.min, 'one level needed: the first floor down carries 42.5 PSF of shores: ' + JSON.stringify(a0));
ok(a1.res <= 0 && a1.min && a1.needs, 'the floor that absorbs it gets the second level anyway: ' + JSON.stringify(a1));
ok(a1.pats.length === 1 && a1.pats[0] === A.loose, `at the loosest pattern (${A.loose}) whatever the shore: ` + JSON.stringify(a1.pats));
ok(Math.abs(a1.h - (20 - 9 / 12 - 10)) < 1e-6, 'with its own shore height, soffit of F1 to F2: ' + a1.h);
ok(A.one[A.one.length - 1].levels === 2, 'and the region counts two reshore levels');
ok(A.two.filter(s => s.min).length === 0 && A.two[1].res > 0, 'where two levels are needed already, nothing is added: ' + JSON.stringify(A.two.slice(0, 3)));
ok(A.toGrade.filter(s => s.min).length === 0 && A.toGrade[1].grade, 'where the floor under the first level is on grade, no second level (not possible)');
ok(A.none.filter(s => s.min).length === 0, 'where the first floor takes it all, nothing is added');
ok(A.onGradeBelow[1].min && A.onGradeBelow[1].onGrade, 'a second level standing on grade is still added, and knows its base is on grade (MDL-18 pad)');
ok(A.bottom[0].every(m => !m), 'with no floor under the absorbing floor, there is nothing to stand on: no second level');

console.log('B. on the 1175 Bothell job');
const bothell = path.resolve(here, '..', '1175_Bothell_Stem_4.reshore.json');
if (fs.existsSync(bothell)) {
  await page.setInputFiles('#fileInput', path.resolve(here, 'fixtures', 'test-set.pdf'));
  await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 180000 });
  await page.waitForTimeout(2000);
  await page.evaluate(d => applyOpenedJob(d, 'minlevel'), JSON.parse(fs.readFileSync(bothell, 'utf8')));
  await page.waitForTimeout(1500);
  await page.evaluate(() => setStep('results'));
  await page.waitForFunction(() => schedSolve && schedSolve.levels.length, null, { timeout: 120000 });
  const B = await page.evaluate(() => {
    const k = schedSolve.levels.findIndex(L => L.pour.name === 'Roof');
    schedPourIdx = k; renderSchedule();
    const L = schedSolve.levels[k];
    const regs = L.solve.regions.map((r, i) => ({ name: regionLabel(r, i, L), key: r.key, steps: r.steps.map(s => ({ n: s.level.name, min: !!s.minLevel, res: s.resultant, sup: s.supportLevel && s.supportLevel.name, onGrade: !!s.onGrade, idx: s.levelIdx, supIdx: s.supportIdx })) }));
    const r0 = L.solve.regions[0], st = r0.steps.find(s => s.minLevel);
    // pick a stiff shore for the second level and see the pad note come up
    const steel = st && st.options.find(o => !o.timber);
    if (steel) { shoreChoices()[st.choiceKey] = steel.shoreId; runSchedule(); schedPourIdx = k; renderSchedule(); }
    const L2 = schedSolve.levels[k], r2 = L2.solve.regions[0], st2 = r2.steps.find(s => s.minLevel);
    const card = [...document.querySelectorAll('#schedBody .sched-region')].find(c => c.dataset.cardRi === '0');
    const plan = pourInstallPlan(L2);
    const under2 = plan && plan.floors.find(f => f.level && f.level.name === '2');
    let html = '';
    const open = window.open;
    window.open = () => ({ document: { write: h => { html += h; }, close() {} }, focus() {}, print() {} });
    try { printSchedule(); } finally { window.open = open; }
    const beams = (L2.solve.beams || []).flatMap(b => b.rows.map(r => !!r.minLevel));
    if (steel) { delete shoreChoices()[st.choiceKey]; runSchedule(); }
    return { regs, chosen: st2 && st2.chosen && st2.chosen.pattern, pad: !!(st2 && needsPad(st2)),
             cardText: card ? card.textContent : '', under2: under2 ? { name: under2.name, general: under2.general, absorbed: under2.absorbedSF } : null,
             printed: /minimum 2 levels of reshore required/.test(html), beamMin: beams.some(x => x) };
  });
  const r1 = B.regs[0];
  ok(r1.steps.length === 2 && !r1.steps[0].min && r1.steps[1].min, 'Roof region 1: L3 carries the load, L2 absorbs it and gets the second level: ' + JSON.stringify(r1.steps));
  ok(/– L1 SOG$/.test(r1.name), 'its name goes on to what the second level stands on: ' + r1.name);
  ok(B.chosen === '10×10', 'a shore picked for the second level goes in at 10×10: ' + B.chosen);
  ok(B.pad, 'a steel shore on the second level, standing on grade, needs the wood pad (MDL-18)');
  ok(/minimum 2 levels of reshore required/.test(B.cardText), 'the card says "minimum 2 levels of reshore required" at the 2nd level');
  ok(!/minimum 2 levels/.test(B.cardText.split('under')[1] || ''), 'and says it once, not on the first level');
  ok(B.under2 && B.under2.general, 'the install plan now puts shores in under 2: ' + JSON.stringify(B.under2));
  ok(B.printed, 'the print carries the note');
  ok(!B.beamMin, 'beams keep their own chain: no beam row gets a second level');
  // the key reaches only as deep as shores go
  const depthOk = await page.evaluate(() => schedSolve.levels.every(L => !L.solve || !L.solve.spatial || L.solve.regions.every(r => {
    const last = r.steps[r.steps.length - 1]; if (!last || last.grade || last.open) return true;
    const parts = r.key.split('|').length - 1;               // floors in the key
    if (stNeeds(last)) return parts >= last.levelIdx;         // down to what the shores stand on
    return parts === last.levelIdx;                           // stops at the absorbing floor
  })));
  ok(depthOk, 'a region reaches only as far down as shores go: what lies under a floor that absorbs the load with no shores under it never splits a region');
} else console.log('  (1175 job not in this checkout, skipped)');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

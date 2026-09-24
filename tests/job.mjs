// @rules MDL-03, RES-13  (see DECISIONS.md)
// Regression on Adolfo's saved test job (tests/fixtures/test-job.reshore.json):
// Level 1 is half suspended (B2 area, east) and half on grade (west). The
// pour on Level 3 must see Level 1 as GRADE over the west half, not "no slab".
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import fs from 'node:fs';

const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const file = 'file://' + path.resolve(here, '..', 'reshore-calc.html');
const job = JSON.parse(fs.readFileSync(path.resolve(here, 'fixtures', 'test-job.reshore.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto(file);
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.evaluate((d) => { deserializeDoc(d); sortLevelsByElevation(); state.activeLevelIdx = 0; renderSidebar(); persist(); }, job);

const r = await page.evaluate(() => {
  const all = solveAll({ step: 2 });
  const L3 = all.levels.find(L => L.pour.name === '3').solve;
  const rows = L3.regions.map((r, i) => ({
    label: regionLabel(r, i), area: r.areaSF,
    steps: r.steps.map(s => ({ lv: s.level.name, res: s.resultant, grade: !!s.grade, open: !!s.open, noSlab: !!s.noSlab, h: s.shoreHeightFt, nOpt: s.options.length })),
  }));
  return { spatial: L3.spatial, total: L3.areaSF, noShore: L3.noShoreRows, unresolved: L3.anyUnresolved, rows };
});
ok(r.spatial, 'solves spatially');
console.log(JSON.stringify(r.rows.map(x => [x.label, x.area, x.steps.map(s => s.lv + ':' + (s.grade ? 'grade' : s.open ? (s.noSlab ? 'none' : 'open') : s.res.toFixed(1) + (s.h!=null?'@'+s.h.toFixed(2):''))).join(' ')])));
const west = r.rows.find(x => x.steps.some(s => s.lv === '1' && s.grade));
ok(!!west, 'a region reaches Level 1 as ON GRADE (the L1 SOG area): ' + JSON.stringify(r.rows.map(x => [x.label, x.area, x.steps.map(s => s.lv + ':' + (s.grade ? 'grade' : s.open ? (s.noSlab ? 'none' : 'open') : s.res.toFixed(1))).join(' ')])));
ok(!r.rows.some(x => x.steps.some(s => s.lv === '1' && s.noSlab)), 'no region calls Level 1 "no slab here"');
if (west) {
  ok(west.area > 9000, 'the grade half is the big western region: ' + west.area);
  ok(west.steps[0].lv === '2' && Math.abs(west.steps[0].res - 4.5) < 1e-6 && Math.abs(west.steps[0].h - (105.5 - 0.75 - 91)) < 1e-6, 'Level 2 row: 4.5 PSF on a 13\'-9" shore standing on Level 1: ' + JSON.stringify(west.steps[0]));
  ok(west.steps[0].nOpt > 0, 'a shore fits 13\'-9"');
}
const east = r.rows.find(x => x.steps.some(s => s.lv === '1' && !s.grade && !s.open && s.res < 0));
ok(!!east, 'the eastern region is absorbed by Level 1\'s suspended slab');
ok(!r.unresolved, 'nothing unresolved');
// the 31 ft rows should only remain where Level 1 really has an opening under Level 2 slab
const tall = r.rows.filter(x => x.steps.some(s => s.h != null && s.h > 30));
ok(tall.every(x => x.steps.some(s => s.lv === '1' && s.open && !s.noSlab)), 'any 31 ft shore is over a real Level 1 opening, not a missing slab: ' + JSON.stringify(tall.map(x => x.label)));

// RES-13: the print refuses a result the inputs have moved on from
const pr = await page.evaluate(() => {
  // the fixture has no drawing set, so the Results gate stops runSchedule; solve as it would
  schedSolve = solveAll(); calculatedInputKey = calculationKey();
  const fresh = resultsCurrent() && checkPrintFreshness(false);
  state.project.constructionDL = (state.project.constructionDL || 30) + 5;   // an input changes
  const stale = checkPrintFreshness(false);
  return { fresh, stale, cleared: !schedSolve || !resultsCurrent() };
});
ok(pr.fresh, 'a current result may print');
ok(!pr.stale && pr.cleared, 'after an input change the print is refused and the old result cleared: ' + JSON.stringify(pr));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

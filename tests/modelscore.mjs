// @rules RVT-15, ARE-32  (see DECISIONS.md)
// THE MODEL AS ANSWER KEY (Oct 16 2026)
// Bothell's drawing set (Reshore Calculator Test.pdf) was printed from its
// Revit model, so the model says what every floor should read back: floor
// edge, slab on grade, openings, slab zones, beams. `Revit export/answer-key.py`
// pulled it into tests/fixtures/bothell-model.json; tests/tools/model-score.js
// puts it in the project grid's frame and grades a job against it.
//
//  A. the key: the model sits on the job's grid to a tenth of a foot, and
//     reads back what Revit says (floor 1's slab on grade, floor 3's zones)
//  B. the scorer: the hand-checked 1175 job scores full marks where it
//     was drawn by hand (edges, openings, beams) — so a low score is the job
//  C. the scan today on floors 2 and 3 (drawing set in the repo): its
//     slab-zone candidates, all accepted, scored — a floor, not a ceiling
//  D. the Oct 16 jobs, where present: scores printed
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
const here = fileURLToPath(new URL('.', import.meta.url));
const root = path.resolve(here, '..');
const { report } = await import('./tools/model-score.mjs');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const raw = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'bothell-model.json'), 'utf8'));
const job = JSON.parse(fs.readFileSync(path.join(root, '1175_Bothell_Stem_4.reshore.json'), 'utf8'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.join(root, 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.addScriptTag({ path: path.join(here, 'tools', 'model-score.js') });

console.log('A. the answer key');
const A = await page.evaluate(([d, raw]) => {
  deserializeDoc(d); sortLevelsByElevation();
  const k = modelAnswerKey(raw);
  const L = n => k.levels.find(l => l.name === n);
  return { fit: k.fit, n: k.levels.map(l => l.name), l0: L('LEVEL 00').onGrade, l1grade: Math.round(L('LEVEL 01').gradeSF), l1typ: L('LEVEL 01').typ,
    l3: L('LEVEL 03').zones.map(z => [z.type, Math.round(z.sf), z.offIn]), edges: k.levels.map(l => Math.round(l.edgeSF)), beams: k.levels.map(l => l.beams.length) };
}, [job, raw]);
console.log('   ' + JSON.stringify(A));
ok(A.fit.worstFt < 0.25 && A.fit.nx >= 8 && A.fit.ny >= 4, 'the model sits on the job’s project grid to a tenth of a foot: ' + JSON.stringify(A.fit));
ok(JSON.stringify(A.n) === JSON.stringify(['LEVEL 00', 'LEVEL 01', 'LEVEL 02', 'LEVEL 03', 'LEVEL ROOF']), 'five floors (the penthouse roof has no slab): ' + A.n);
ok(A.l0 === true, 'LEVEL 00 is on grade, whole');
ok(Math.abs(A.l1grade - 12058) / 12058 < 0.04, 'LEVEL 01 is partly on grade, ~12,000 SF (Revit: 12,058): ' + A.l1grade);
ok(A.l1typ && A.l1typ.t === 9 && A.l1typ.off === 0, 'its typical is the 9" PT slab');
const has = (t, lo, hi) => A.l3.some(z => z[0] === t && z[1] >= lo && z[1] <= hi);
ok(has('8 1/2" PT SLAB', 700, 900) && has('7 1/2" MS SLAB', 450, 560) && has('22" PT SLAB', 80, 110) && has('22 1/2" PT SLAB', 30, 50) && has('8" PT SLAB', 140, 180),
  'LEVEL 03’s slab zones are read: ' + JSON.stringify(A.l3));
ok(A.beams.join() === '0,2,4,8,7', 'beams per floor as modeled: ' + A.beams);

console.log('B. the hand-checked 1175 job scores full marks where it was drawn');
const B = await page.evaluate(([d, raw]) => { deserializeDoc(d); sortLevelsByElevation(); return modelScore(modelAnswerKey(raw)); }, [job, raw]);
console.log(report({ score: B }, '1175_Bothell_Stem_4.reshore.json').split('\n').map(s => '   ' + s).join('\n'));
const sus = B.levels.filter(s => s.name !== 'LEVEL 00');
ok(sus.every(s => s.edge.iou > 0.99), 'floor edges overlap the model by over 99%: ' + sus.map(s => s.edge.iou));
ok(sus.every(s => s.openings.found === s.openings.key && !s.openings.extra), 'every opening, nothing extra');
ok(sus.every(s => s.beams.foundLen === 100 && s.beams.sizedLen === 100), 'every beam, sized right');
const g1 = B.levels.find(s => s.name === 'LEVEL 01').grade;
ok(g1 && g1.iou > 0.98, 'its floor 1 slab on grade overlaps the model’s by over 98%: ' + JSON.stringify(g1));

console.log('C. the scan today: floor 3’s slab-zone candidates, all accepted');
await page.reload(); await page.waitForFunction(() => typeof solveAll === 'function');
await page.setInputFiles('#fileInput', path.join(root, 'Reshore Calculator Test.pdf'));
await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.evaluate(d => applyOpenedJob(d, 'modelscore'), job);
await page.waitForTimeout(1200);
await page.addScriptTag({ path: path.join(here, 'tools', 'model-score.js') });
const C = await page.evaluate(async raw => {
  if (typeof beamScan !== 'undefined' && beamScan) cancelBeamScan();
  for (const pg of [4, 5]) {
    const li = levelForPage(pg), lv = state.levels[li];
    await goToPage(pg);
    const items = (await detectSlabNotes(pg, lv)).filter(i => !i.failed).map(i => ({ ...i, page: pg, levelIdx: li }));
    beamScan = { page: pg, levelIdx: li, items, sel: -1, what: 'beams', view: 'queue' };
    scanCommit(items, 'model score'); beamScan = null;
  }
  const sc = modelScore(modelAnswerKey(raw)).levels;
  return { ...sc.find(x => x.name === 'LEVEL 03').zones, l2: sc.find(x => x.name === 'LEVEL 02').zones };
}, raw);
for (const z of C.list) console.log(`   ${z.right ? 'ok  ' : 'MISS'} ${z.type} ${z.sf} SF · covered ${Math.round(z.covered * 100)}%${z.jobT != null ? ` · scan says ${z.jobT}"` : ''}`);
console.log(`   ${C.rightSF} of ${C.keySF} SF right · ${C.extra.length} candidate(s) not in the model`);
console.log(`   floor 2: ${C.l2.rightSF} of ${C.l2.keySF} SF right (${C.l2.right} of ${C.l2.key} zones) · ${C.l2.extra.length} not in the model`);
const half = C.list.find(z => z.type === '8 1/2" PT SLAB');
ok(half && half.right, 'the 8 1/2" zone is right, thickness and top: ' + JSON.stringify(half));
ok(C.rightSF >= 1100, 'floor 3: at least 1,100 SF of slab zones right (ARE-32, Oct 17: 852 before): ' + C.rightSF);
for (const t of ['8" PT SLAB', '22" PT SLAB', '22 1/2" PT SLAB']) ok(C.list.some(z => z.type === t && z.right), `the ${t} zone is right`);
ok(!C.list.some(z => z.jobT != null && Math.abs(z.jobT - z.tIn) > 1 && z.sf > 100), 'no zone over 100 SF is offered at the wrong thickness (the stepped bay was 22 1/2" over a 7 1/2" slab)');
ok(C.l2.rightSF >= 10 && C.l2.extra.length === 0, 'floor 2: a 7" pocket right, nothing outside the model: ' + C.l2.rightSF);
ok(C.extra.length === 0, 'no candidate lands where the model has no slab zone');

const BOT = process.env.BOTHELL_DIR || path.join(root, 'Project Testing', 'Bothell');
const jobsD = ['Bothell_Test_2026.10.16.reshore.json', 'Bothell_TrustAll_2026.10.16.reshore.json'].map(f => path.join(BOT, f)).filter(f => fs.existsSync(f));
if (!jobsD.length) console.log('D. (the Oct 16 Bothell jobs are not in this checkout, skipped)');
for (const f of jobsD) {
  console.log('D. ' + path.basename(f));
  await page.reload(); await page.waitForFunction(() => typeof solveAll === 'function');
  await page.addScriptTag({ path: path.join(here, 'tools', 'model-score.js') });
  const D = await page.evaluate(([d, raw]) => { deserializeDoc(d); sortLevelsByElevation(); return modelScore(modelAnswerKey(raw)); }, [JSON.parse(fs.readFileSync(f, 'utf8')), raw]);
  console.log(report({ score: D }, path.basename(f)).split('\n').filter(s => /TOTAL|on grade|openings  /.test(s)).map(s => '   ' + s).join('\n'));
  ok(D.levels.every(s => s.missing || s.edge.iou > 0.97), 'floor edges hold');
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

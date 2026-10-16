// @rules RES-18, MDL-21  (see DECISIONS.md)
// THE PODIUM SPEED-UP (Kalae, Oct 16 2026).
// A. A shore pick, a bulk apply, a beam width and shores per cluster are read
//    into the standing solve — and what they show (rows, beams, the install
//    summary) is exactly what a full solve shows afterwards (RES-18).
// B. A pick does not solve again: it takes a fraction of the full solve.
// C. The full solve of the 42-level job stays well under its old 11 s (MDL-21).
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
const job = fs.readFileSync(path.resolve(here, '..', 'Revit export', '1268_KALAE.reshore.json'), 'utf8');
const pdf = fs.readFileSync(path.resolve(here, '..', 'Revit export', '1268_KALAE-revit-plans.pdf')).toString('base64');
const wait = ms => new Promise(r => setTimeout(r, ms));

const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
page.on('dialog', d => d.accept());
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.evaluate(async ([j, p]) => {
  applyOpenedJob(JSON.parse(j), '1268_KALAE.reshore.json');
  const bin = atob(p); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await loadFile(new File([u8], '1268_KALAE-revit-plans.pdf', { type: 'application/pdf' }));
}, [job, pdf]);
await wait(1500);

// what Results shows, in one comparable string
await page.evaluate(() => {
  window.__view = () => JSON.stringify(schedSolve.levels.map(L => { const s = L.solve; if (!s.spatial) return null;
    const plan = pourInstallPlan(L);
    return [s.pendingChoices, s.noShoreRows, s.anyUnresolved,
      plan ? plan.floors.map(f => [f.general, f.pending, f.generalAppliedSF, (f.exceptions || []).map(e => [e.pattern, e.areaSF]), f.shoreList]) : null,
      s.regions.map(r => r.steps.map(st => [st.choiceKey || '', st.chosen ? st.chosen.shoreId : null])),
      (s.beams || []).map(b => [b.beamId, b.count || 1, (b.rows || []).map(x => [x.beamKey || '', x.beamChosen ? x.beamChosen.shoreId : null, x.beamSpacingFt, x.beamPerCluster, x.effW, x.beamNet])])]; }));
});

console.log('C. The full solve (MDL-21)');
const full = await page.evaluate(() => { setStep('loads'); const t = performance.now(); setStep('results'); return performance.now() - t; });
await page.waitForFunction(() => schedSolve && schedSolve.levels.length);
console.log(`  full solve ${Math.round(full)} ms`);
ok(full < 8000, 'the 42-level job solves in under 8 s (was 11 s): ' + Math.round(full) + ' ms');

console.log('A/B. A pick is read in, and matches a full solve (RES-18)');
const A = await page.evaluate(() => {
  const out = {};
  const rows = pickRows(schedSolve).filter(r => !r.chosen && r.opts.length);
  const slab = rows.find(r => !r.beam && r.L.pour.name === '4.5') || rows.find(r => !r.beam);
  const beam = rows.find(r => r.beam && r.L.pour.name === '4.5') || rows.find(r => r.beam);
  const solves = []; const real = solveAll; window.solveAll = o => { solves.push(1); return real(o); };
  // one slab pick through the row's own dropdown
  schedPourIdx = schedSolve.levels.indexOf(slab.L); renderSchedule();
  const sel = document.querySelector(`select.sched-shore[data-key="${CSS.escape(slab.key)}"]`);
  let t = performance.now();
  if (sel) { sel.value = String(slab.opts[0].shoreId); sel.dispatchEvent(new Event('change', { bubbles: true })); }
  else { shoreChoices()[slab.key] = slab.opts[0].shoreId; repickSchedule([slab.key]); }
  out.pickMs = performance.now() - t; out.viaSelect = !!sel;
  // a beam pick, its width and its shores per cluster
  shoreChoices()[beam.key] = beam.opts[0].shoreId; shoreChoices()[beam.key + '|W'] = 2.5; shoreChoices()[beam.key + 'N'] = '2';
  repickSchedule([beam.key]);
  // a bulk apply on every placement
  const many = pickRows(schedSolve).filter(r => !r.chosen && r.opts.length).slice(0, 60);
  const sid = many[0].opts[0].shoreId;
  t = performance.now();
  applyBulkShore(sid, many.map(r => ({ key: r.key, options: r.opts })), 'on test rows');
  out.bulkMs = performance.now() - t;
  out.solvesDuring = solves.length;
  out.fast = __view();
  window.solveAll = real;
  t = performance.now(); runSchedule(); out.fullMs = performance.now() - t;
  out.slow = __view();
  return out;
});
console.log(`  pick ${Math.round(A.pickMs)} ms · bulk ${Math.round(A.bulkMs)} ms · full solve ${Math.round(A.fullMs)} ms`);
ok(A.viaSelect, 'the slab pick went through the row\'s dropdown');
ok(A.solvesDuring === 0, 'no pick, width, cluster or bulk apply ran the solver: ' + A.solvesDuring);
ok(A.fast === A.slow, 'what the picks show read in place is exactly what a full solve shows');
ok(A.pickMs < A.fullMs / 4, `a pick takes a fraction of the full solve: ${Math.round(A.pickMs)} vs ${Math.round(A.fullMs)} ms`);

console.log('D. Undo of a pick still puts the screen back (UI-02 with RES-18)');
const D = await page.evaluate(async () => {
  const before = __view();
  const r = pickRows(schedSolve).find(r => !r.chosen && r.opts.length && !r.beam);
  history.record('Choose shore'); shoreChoices()[r.key] = r.opts[0].shoreId; persist(); repickSchedule([r.key]);
  const mid = __view();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  await new Promise(res => setTimeout(res, 300));
  return { changed: mid !== before, back: __view() === before };
});
ok(D.changed, 'the pick showed');
ok(D.back, 'Ctrl+Z took it back on screen');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// @rules MDL-08, SEQ-01, BLD-01  (see DECISIONS.md)
// Install / strip sequence: per-floor governing pattern across placements,
// local exceptions under a settable threshold, release after falsework, and
// the two Results fixes (cluster dropdown, effective width with no spare).
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';

const file = 'file://' + path.resolve(decodeURIComponent(new URL('.', import.meta.url).pathname), '..', 'reshore-calc.html');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(Math.abs(a - b) < 1e-6, `${m}: got ${a}, want ${b}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto(file);
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// ── fixture: 4 floors, 1 px = 1 ft, L1 on grade.
// Pour L3 loads L2 then L1; pour L2 loads L1. L1's east half is weaker, so
// the L3 pour needs a tighter pattern there than the L2 pour does anywhere.
const setup = (opts = {}) => page.evaluate((o) => {
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const T = [1, 0, 0, 1, 0, 0];
  const mk = (name, el, slab, cap, extra = {}) => ({ id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap, rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [], alignment: { transform: T, points: [] }, ...extra });
  state.project = { name: 'seq', shoreChoices: {}, solveStepFt: 5, minRegionSF: 0,
    // a combined schedule + a page count so the Results/Sequence gate is open
    loadingConditions: [{ mark: '1', sdl: 15, ll: 40, reducible: false, confirmed: true }, { mark: '2', sdl: 15, ll: 10, reducible: false, confirmed: true }] };
  state.pdf.pages = 1; state.pdf.current = 1;
  // L3 is a heavy 14" transfer slab, so the L3 placement puts MORE on L1
  // (205 - 60 = 145 arriving) than the L2 placement does (142.5) — that is
  // what makes a later placement govern L1's pattern.
  state.levels = [mk('L3', 30, o.topSlab || 14, 60), mk('L2', 20, 9, 60), mk('L1', 10, 9, 60), mk('SOG', 0, 5, 0, { onGrade: true })];
  // L1's weak strip must NOT overlap its main area — where loading areas
  // overlap the highest capacity governs by design, so an overlapping weak
  // strip would simply be ignored.
  const w = 100 * (o.weakFrac || 0);
  for (const lv of state.levels.slice(0, 3)) {
    const x1 = (lv.name === 'L1' && w) ? 100 - w : 100;
    lv.zones.push({ id: sid(), polygon: sq(0, 0, x1, 100), capacityPSF: 60, mark: '1', label: '', colorIdx: 0 });
  }
  if (w) state.levels[2].zones.push({ id: sid(), polygon: sq(100 - w, 0, 100, 100), capacityPSF: 30, mark: '2', label: '', colorIdx: 1 });
  state.activeLevelIdx = 0; state.results = null;
  renderSidebar(); persist();
}, opts);

// choose the first legal shore on every slab row so patterns exist
const chooseAll = () => page.evaluate(() => {
  runSchedule();
  for (const L of schedSolve.levels) {
    if (!L.solve.spatial) continue;
    for (const r of L.solve.regions) for (const st of r.steps) if (st.options && st.options.length && st.resultant > 0) shoreChoices()[st.choiceKey] = st.options[0].shoreId;
  }
  runSchedule(); runSequence();
});

console.log('A. one pattern per floor, tightest across placements');
await setup({ weakFrac: 0.1 });
await chooseAll();
let P = await page.evaluate(() => ({
  order: seqPlan.placements.map(p => p.pour.name),
  pending: seqPlan.pending,
  floors: seqPlan.floors.map(f => ({ name: f.name, general: f.general, totalSF: f.totalSF, generalSF: f.generalSF,
    exc: f.exceptions.map(e => ({ pat: e.pattern, sf: e.areaSF })), pours: f.pours,
    install: f.installBefore, release: f.releaseAfter, shores: f.allShores, mixed: f.mixedShores })),
  gridArea: Object.fromEntries(GRID_PATTERNS.map(g => [g.name, g.area])),
  rows: seqPlan.placements.map(p => ({ pour: p.pour.name, floors: p.floors.map(o => ({ f: o.level.name, own: o.sp, ownGeneral: o.own.general, first: o.firstInstall, tighter: o.tighterThanNeeded })), releases: p.releases })),
}));
P.gridSF = n => P.gridArea[n] ?? Infinity;
ok(JSON.stringify(P.order) === JSON.stringify(['L1', 'L2', 'L3']), 'placements in construction order, bottom-up: ' + P.order);
ok(P.pending === 0, 'no pending shore choices: ' + P.pending);
const fL1 = P.floors.find(f => f.name === 'L1'), fL2 = P.floors.find(f => f.name === 'L2');
ok(!!fL1 && !!fL2 && P.floors.length === 2, 'only L1 and L2 carry reshoring: ' + P.floors.map(f => f.name));
// L1 is loaded by both the L2 and the L3 placement
ok(JSON.stringify(fL1.pours) === JSON.stringify(['L2', 'L3']), 'L1 is loaded by the L2 and L3 placements: ' + JSON.stringify(fL1.pours));
ok(fL1.install === 'L2' && fL1.release === 'L3', 'L1 reshoring installs for L2, releases after L3: ' + JSON.stringify([fL1.install, fL1.release]));
ok(fL2.install === 'L3' && fL2.release === 'L3', 'L2 reshoring installs for and releases after L3');
// the L3 placement's own row must show L1 already installed, and the L2 row must show the tighter (governing) pattern
const rL2 = P.rows.find(r => r.pour === 'L2'), rL3 = P.rows.find(r => r.pour === 'L3');
ok(rL2.floors.length === 1 && rL2.floors[0].f === 'L1' && rL2.floors[0].first, 'the L2 placement installs L1 reshoring');
ok(rL3.floors.some(o => o.f === 'L1' && !o.first), 'the L3 placement leaves L1 reshoring in place');
ok(rL3.floors.some(o => o.f === 'L2' && o.first), 'the L3 placement installs L2 reshoring');
ok(rL2.floors[0].tighter, 'the L2 row is flagged: it alone needs a looser pattern than what goes in');
ok(P.gridSF(rL2.floors[0].ownGeneral) > P.gridSF(fL1.general), `the L2 placement alone would install ${rL2.floors[0].ownGeneral}, but the tighter ${fL1.general} goes in`);
ok(JSON.stringify(rL3.releases) === JSON.stringify(['L2', 'L1']) || JSON.stringify(rL3.releases.slice().sort()) === JSON.stringify(['L1', 'L2']), 'both floors strip after the L3 placement: ' + JSON.stringify(rL3.releases));
ok(rL2.releases.length === 0, 'nothing strips after the L2 placement');

console.log('B. local exceptions vs the general pattern (threshold)');
// the weak strip is 10% of the plate: a local exception at the default 15%,
// but at 0% the tightest pattern has to govern the whole floor.
let thr = await page.evaluate(() => {
  const read = () => { const f = seqPlan.floors.find(x => x.name === 'L1');
    return { general: f.general, gsf: f.general ? patternArea(f.general) : null, exc: f.exceptions.map(e => ({ pat: e.pattern, gsf: e.gridSF, sf: e.areaSF })), applied: f.generalAppliedSF, total: f.totalSF }; };
  const d = read();
  state.project.seqExceptionPct = 0; runSequence(); const z = read();
  state.project.seqExceptionPct = 50; runSequence(); const h = read();
  delete state.project.seqExceptionPct; runSequence();
  return { d, z, h };
});
ok(thr.d.exc.length === 1 && thr.d.exc[0].sf === 1000, 'at the default 15%: the 1,000 SF strip is a local exception: ' + JSON.stringify(thr.d));
eq(thr.d.applied + thr.d.exc[0].sf, 10000, 'general pattern plus the exception covers the floor');
ok(thr.d.exc[0].gsf < thr.d.gsf, 'the exception is a tighter grid than the general pattern: ' + JSON.stringify(thr.d));
ok(thr.z.exc.length === 0 && thr.z.general === thr.d.exc[0].pat && thr.z.applied === 10000, 'at 0%: the tightest pattern governs the whole floor: ' + JSON.stringify(thr.z));
ok(thr.h.gsf >= thr.d.gsf, 'at 50% the general pattern is no tighter than at 15%: ' + JSON.stringify(thr.h));
// no weak strip at all → one pattern, no exceptions
await setup({});
await chooseAll();
let flat = await page.evaluate(() => { const f = seqPlan.floors.find(x => x.name === 'L1'); return { general: f.general, exc: f.exceptions.length, total: f.totalSF, applied: f.generalAppliedSF }; });
ok(flat.exc === 0 && flat.applied === flat.total && flat.total === 10000, 'uniform floor: one pattern over the whole 10k SF: ' + JSON.stringify(flat));

console.log('C. pending choices and mixed shores are reported');
await setup({ weakFrac: 0.1 });
await page.evaluate(() => { runSchedule(); runSequence(); });
let pend = await page.evaluate(() => ({ pending: seqPlan.pending, general: seqPlan.floors.find(f => f.name === 'L1').general, pendSF: seqPlan.floors.find(f => f.name === 'L1').pendingSF }));
ok(pend.pending > 0 && pend.general === null && pend.pendSF > 0, 'with nothing chosen the floor has no pattern and the area is reported as pending: ' + JSON.stringify(pend));
await page.evaluate(() => setStep('sequence'));
ok(await page.$eval('#p-sequence', e => /need a shore chosen/.test(e.textContent)), 'panel warns about pending rows');
ok(/to choose/.test(await page.evaluate(() => stepStatus('sequence').text)), 'step status reports the outstanding choices');
// give the two placements different shores under L1
let mixed = await page.evaluate(() => {
  runSchedule();
  const byPour = {};
  for (const L of schedSolve.levels) { if (!L.solve.spatial) continue;
    for (const r of L.solve.regions) for (const st of r.steps) if (st.resultant > 0 && st.options.length) { (byPour[L.pour.name] = byPour[L.pour.name] || []).push(st); } }
  // L2 placement: first legal shore under L1; L3 placement: a different one
  for (const st of byPour['L2'] || []) shoreChoices()[st.choiceKey] = st.options[0].shoreId;
  for (const st of byPour['L3'] || []) shoreChoices()[st.choiceKey] = st.options[st.options.length - 1].shoreId;
  runSchedule(); runSequence();
  const f = seqPlan.floors.find(x => x.name === 'L1');
  return { mixed: seqPlan.mixed.map(m => m.floor), shores: f.allShores, general: f.general, genShores: f.generalShores };
});
ok(mixed.mixed.includes('L1') && mixed.shores.length > 1, 'mixed shores under L1 flagged: ' + JSON.stringify(mixed));
ok(mixed.general != null && mixed.genShores.length >= 1, 'a governing pattern and shore are still reported');
await page.evaluate(() => renderSequence());
ok(await page.$eval('#p-sequence', e => /different placements chose different shores/.test(e.textContent)), 'panel explains the mixed-shore decision');

console.log('D. the step, its table and its print');
await setup({ weakFrac: 0.1 });
await chooseAll();
await page.evaluate(() => setStep('sequence'));
// The rail lists the four GROUPS since the flow rework; Sequence is a tab
// inside Results, so that is where it has to be found.
ok(await page.$eval('.step[data-group="answer"]', e => /Results/.test(e.textContent)), 'the answer group is in the rail');
ok(await page.$eval('#groupTabs .gt[data-sec="sequence"]', e => /Sequence/.test(e.textContent)), 'Sequence is a tab inside it');
ok(await page.$eval('#groupTabs .gt[data-sec="sequence"]', e => e.classList.contains('on')), 'and it is the tab in focus');
ok(await page.$$eval('#p-sequence table.seq-table tbody tr', r => r.length === 3), 'one row per placement');
let txt = await page.$eval('#p-sequence', e => e.textContent.replace(/\s+/g, ' '));
ok(/install under L1/i.test(txt) && /leave under L1/i.test(txt), 'rows read install then leave: ' + txt.slice(0, 260));
ok(/stripped/i.test(txt) && /falsework/i.test(txt), 'the strip condition names falsework');
ok(await page.$eval('#p-sequence', e => /governs/.test(e.textContent)), 'the governing placement is named where the pattern is tighter than needed');
ok(await page.evaluate(() => stepStatus('sequence').done && /3 placements sequenced/.test(stepStatus('sequence').text)), 'step status: ' + await page.evaluate(() => stepStatus('sequence').text));
// threshold control lives on the step
await page.evaluate(() => { const i = document.getElementById('seqPct'); i.value = '25'; i.dispatchEvent(new Event('change')); });
ok(await page.evaluate(() => state.project.seqExceptionPct === 25 && seqPlan.thrPct === 25), 'threshold editable on the step');
await page.evaluate(() => history.undo());
ok(await page.evaluate(() => seqExceptionPct() === 15), 'undo restores the default threshold');
// v12 refuses to print output that no longer matches the inputs — the undo
// above changed them — so recalculate first, which is what the Recalculate
// button on the step does.
const prn = await page.evaluate(() => { runSchedule(); runSequence(); let html = ''; const w = { document: { write: s => { html += s; }, close() {} }, print() {} }; const o = window.open; window.open = () => w; try { printSequence(); } finally { window.open = o; } return html; });
ok(/install \/ strip sequence/i.test(prn) && /<b>INSTALL<\/b> under L1/.test(prn) && /LEAVE under L1/.test(prn), 'print has the sequence with install/leave: ' + prn.replace(/\s+/g, ' ').slice(0, 160));
ok(/falsework has been stripped/.test(prn) && /dates are not part of this calculation/.test(prn), 'print states the removal rule and that dates are not modelled');

// ── the strip line, and one line per floor (Adolfo, Sep 10, 2026) ───────
// "the can be stripped after section in sequence needs to give information
// as to when the reshoring can be stripped. the reshore can be stripped once
// there is no longer reshore needed at a given level after a level has had
// the falsework stripped after the pour."
console.log('D2. what comes out, and when');
ok(/what comes out after this placement/i.test(txt), 'the column says what comes out, not just when: ' + (txt.match(/WHAT COMES OUT[^A-Z]*/i) || [''])[0]);
const strips = await page.$$eval('#p-sequence .seq-strip', t => t.map(x => x.parentElement.textContent.replace(/\s+/g, ' ').trim()));
ok(strips.length >= 1, 'a strip line where reshoring is released: ' + JSON.stringify(strips));
ok(strips.every(t => /once the falsework for .+ is stripped/.test(t)), 'each names the falsework event: ' + JSON.stringify(strips));
ok(strips.some(t => /is the (only|last of \d+) placements? that loads?/.test(t)), 'and the other half of the rule — nothing above still needs it: ' + JSON.stringify(strips));
// the per-floor block: the whole life of one floor's reshoring on one line
const life = await page.$$eval('#p-sequence .slr', rows => rows.map(r => ({
  floor: r.querySelector('.slr-floor').textContent.trim(),
  when: r.querySelector('.slr-when').textContent.replace(/\s+/g, ' ').trim(),
  spec: r.querySelector('.slr-spec').textContent.replace(/\s+/g, ' ').trim() })));
ok(life.length === 2, 'one line per reshored floor: ' + JSON.stringify(life.map(x => x.floor)));
ok(life.every(x => /^under /.test(x.floor)), 'headed by the floor: ' + JSON.stringify(life.map(x => x.floor)));
ok(life.every(x => /in before .+ is poured/.test(x.when) && /carries/.test(x.when)
  && /out after the falsework for .+ is stripped/.test(x.when)),
  'in, carries, out on one line: ' + JSON.stringify(life.map(x => x.when)));
ok(life.every(x => /×/.test(x.spec)), 'with the pattern that goes in: ' + JSON.stringify(life.map(x => x.spec)));
ok(await page.$eval('#p-sequence', e => /the fresh slab is still sending its weight down through the stack/.test(e.textContent)),
  'and the reason the falsework strip is the trigger is stated');
// the print carries the same block
ok(/Each floor's reshoring, from in to out/.test(prn), 'the print has the per-floor table');
ok(/<th>Comes out after<\/th>/.test(prn) && /the falsework for .+ is stripped<\/td>/.test(prn),
  'with a comes-out-after column naming the falsework: ' + (prn.match(/the falsework for [^<]*/) || [''])[0]);
ok(/<th>Carries<\/th>/.test(prn) && /<th>Goes in before<\/th>/.test(prn), 'and the goes-in / carries columns');
ok(/<b>STRIP<\/b> reshoring under/.test(prn), 'the placement table names what strips: ' + (prn.match(/<b>STRIP<\/b>[^<]*/) || [''])[0]);

console.log('E. Results fixes: cluster dropdown, effective width with no spare');
await setup({ topSlab: 9 });
await page.evaluate(() => {
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  // A beam on L3. L2 is fully used up by the slab load arriving (no spare, so
  // no effective width can help); L1 has plenty spare (width matters there).
  state.levels[0].slabZones = [{ id: 'gb', polygon: sq(0, 40, 100, 50), kind: 'beam', widthIn: 24, depthIn: 36, offsetIn: null, label: 'GB-1' }];
  state.levels[2].defaultCapacity = 200;
  state.levels[2].zones.forEach(z => { z.capacityPSF = 200; });
  state.results = null; setStep('results'); runSchedule();
});
let bm = await page.evaluate(() => { const b = schedSolve.levels[0].solve.beams[0]; return { rows: b.rows.map(r => ({ lv: r.level.name, spare: r.sparePsf, net: r.beamNet, key: r.beamKey, opts: (r.options || []).length })) }; });
ok(bm.rows[0].spare === 0 && bm.rows[1].spare > 0, 'L2 has no spare under the beam, L1 does: ' + JSON.stringify(bm.rows));
ok(await page.$$eval('#schedBody input.sched-effw', i => i.length) === 1, 'exactly one effective-width box — only the row with spare: ' + await page.$$eval('#schedBody input.sched-effw', i => i.length));
ok(await page.$eval('#schedBody .sched-beam-table tbody', e => /0 spare\s*n\/a/.test(e.textContent.replace(/\s+/g, ' ')) || /n\/a/.test(e.textContent)), 'the no-spare row shows n/a instead of a width box');
// changing the cluster count must not clear the chosen shore
let clus = await page.evaluate(() => {
  const b = schedSolve.levels[0].solve.beams[0]; const row = b.rows.find(r => r.beamNet > 0 && r.options.length);
  shoreChoices()[row.beamKey] = row.options[0].shoreId;
  runSchedule();
  const before = shoreChoices()[row.beamKey];
  const sel = [...document.querySelectorAll('#schedBody select.sched-beam-n')].find(s => s.dataset.key === row.beamKey);
  sel.value = '3'; sel.dispatchEvent(new Event('change'));
  const b2 = schedSolve.levels[0].solve.beams[0]; const row2 = b2.rows.find(r => r.beamKey === row.beamKey);
  return { before, after: shoreChoices()[row.beamKey], n: shoreChoices()[row.beamKey + 'N'], stillChosen: !!(row2 && row2.beamChosen), per: row2 && row2.beamPerCluster };
});
ok(clus.after === clus.before && clus.stillChosen, 'the shore survives a cluster change: ' + JSON.stringify(clus));
ok(clus.n === '3' && clus.per === 3, 'the cluster count took effect: ' + JSON.stringify(clus));
// and the reverse: choosing a shore must not clear the cluster count
let rev = await page.evaluate(() => {
  const b = schedSolve.levels[0].solve.beams[0]; const row = b.rows.find(r => r.beamNet > 0 && r.options.length);
  const sel = [...document.querySelectorAll('#schedBody select.sched-shore')].find(s => s.dataset.key === row.beamKey);
  sel.value = row.options[row.options.length - 1].shoreId; sel.dispatchEvent(new Event('change'));
  return { n: shoreChoices()[row.beamKey + 'N'], shore: shoreChoices()[row.beamKey] };
});
ok(rev.n === '3' && rev.shore, 'the cluster count survives a shore change: ' + JSON.stringify(rev));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// @rules BEM-06  (see DECISIONS.md)
// IDENTICAL BEAMS SHARE A ROW (Sep 18 2026)
// Adolfo: beams should be grouped into one row when they are the same type of
// beam under the same shore-height and load-capacity conditions. Chose:
// group within 1 inch of shore height, the row shows the tallest, one shore
// pick / effective width / shores-per-cluster applies to every member, and a
// member broken out stays out until it is regrouped.
//  A. three 24x20 beams over the same slab and the same floors below: ONE row
//     with three members, the row's area is their sum
//  B. a fourth beam of another size, and a fifth over a different capacity
//     below, each get their own row
//  C. heights: members within 1" cluster, the row shows the tallest; a member
//     2" taller is another row
//  D. one pick on the group row is the pick for every member
//  E. break-out: the member gets its own row, the group shrinks, and it stays
//     out across a re-solve until regrouped
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

await page.evaluate(() => {
  window.SQ = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  // 1 px = 1 ft. L3 pours; L2 carries with little spare so every beam is shored
  // under L2 and L1. Beams run east-west across a 100x100 pour.
  window.build = (o) => {
    o = o || {};
    const T = [1, 0, 0, 1, 0, 0];
    const mk = (name, el, slab, cap) => ({ id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap, rangeFrom: null, rangeTo: null, pdfPage: 1, zones: [], slabZones: [], alignment: { transform: T, points: [] } });
    state.project = { name: 'bg', loadingConditions: [{ mark: '1', desc: 'TYP', sdl: 14, ll: 40, confirmed: true }], shoreChoices: {}, solveStepFt: 2, minRegionSF: 200, beamBreakout: o.keepBreakout ? (state.project && state.project.beamBreakout) || {} : {} };
    state.levels = [mk('L3', 30, 9, 54), mk('L2', 20, 9, 30), mk('L1', 10, 9, 400)];
    state.pdf.pages = 1; state.pdf.current = 1;
    const pour = state.levels[0], L2 = state.levels[1], L1 = state.levels[2];
    pour.zones.push({ id: sid(), polygon: SQ(0, 0, 100, 100), capacityPSF: 54, mark: '1', label: '', colorIdx: 0 });
    // three identical beams: 24" wide (2 ft), 20" deep, 60 ft long
    const ys = [15, 35, 55];
    ys.forEach((y, i) => pour.slabZones.push({ id: 'b' + i, kind: 'beam', polygon: SQ(20, y - 1, 80, y + 1), widthIn: 24, depthIn: 20, label: 'B' + (i + 1) }));
    if (o.other) pour.slabZones.push({ id: 'bx', kind: 'beam', polygon: SQ(20, 74, 80, 76), widthIn: 30, depthIn: 26, label: 'BX' });
    if (o.otherCap) {
      // a fifth 24x20 beam over a patch of L2 with more capacity
      pour.slabZones.push({ id: 'bc', kind: 'beam', polygon: SQ(20, 89, 80, 91), widthIn: 24, depthIn: 20, label: 'BC' });
      L2.zones.push({ id: sid(), polygon: SQ(0, 85, 100, 95), capacityPSF: 45, mark: '1', label: '', colorIdx: 1 });
    }
    // slab steps on L1 under one beam raise (or drop) its shore height
    // a SMALL slab step on L1 under one beam (120 SF, under the 200 SF minimum region, so it merges
    // into the region round it and only the shore height differs — RGN-02) raises or drops that beam's shore
    if (o.stepUnder != null) L1.slabZones.push({ id: 'st', kind: 'slab', polygon: SQ(40, ys[o.stepUnder] - 3, 60, ys[o.stepUnder] + 3), thicknessIn: 9, offsetIn: o.stepIn, label: 'step' });
    state.results = null; state.activeLevelIdx = 0;
    renderSidebar(); persist();
  };
  window.rows = () => {
    const S = solveAll({ step: 2 });
    const s = S.levels[0].solve;
    window.__S = S;
    return s.beams.map((b, i) => ({ name: beamLabel(b, i), group: !!b.group, count: b.count || 1, members: (b.members || []).map(m => m.label).sort(), label: b.label,
      brokenOut: !!b.brokenOut, canRegroup: !!b.canRegroup, sf: Math.round(b.areaSF), lf: b.lengthFt && Math.round(b.lengthFt), wd: b.widthIn + 'x' + b.depthIn,
      rows: b.rows.map(r => ({ under: r.level.name, h: r.shoreHeightFt, net: Math.round(r.beamNet), chosen: r.beamChosen || null, nOpt: r.options ? r.options.length : 0, key: r.beamKey || null })) }));
  };
});

console.log('A. three identical beams make one row');
let R = await page.evaluate(() => { build(); return rows(); });
console.log('   ' + JSON.stringify(R.map(r => [r.name, r.count, r.sf, r.lf])));
ok(R.length === 1, 'one beam row, not three: ' + R.length);
ok(R[0].group && R[0].count === 3, 'a group of three: ' + JSON.stringify([R[0].group, R[0].count]));
ok(JSON.stringify(R[0].members) === '["B1","B2","B3"]', 'naming all three members: ' + JSON.stringify(R[0].members));
ok(R[0].sf >= 350 && R[0].sf <= 370, 'its area is the members\' sum (3 x 60 ft x 2 ft = 360 SF): ' + R[0].sf);
ok(R[0].lf >= 175 && R[0].lf <= 185, 'and its length: ' + R[0].lf);
ok(R[0].rows.filter(r => r.net > 0).length >= 1, 'the row carries a stem load below the pour: ' + JSON.stringify(R[0].rows.map(r => [r.under, r.net])));

console.log('B. a different size, or a different capacity below, is its own row');
R = await page.evaluate(() => { build({ other: true, otherCap: true }); return rows(); });
console.log('   ' + JSON.stringify(R.map(r => [r.name, r.wd, r.count, r.members])));
ok(R.length === 3, 'three rows: the group, the 30x26, the 24x20 over 45 PSF: ' + R.length);
const grp = R.find(r => r.count === 3);
ok(grp && JSON.stringify(grp.members) === '["B1","B2","B3"]', 'the three identical beams still share their row: ' + JSON.stringify(grp && grp.members));
ok(R.find(r => r.wd === '30x26' && !r.group), 'the 30x26 stands alone');
const bc = R.find(r => r.label === 'BC');
ok(bc && !bc.group, 'the 24x20 over a different capacity stands alone too — same beam, different conditions: ' + JSON.stringify(bc && [bc.label, bc.group]));

console.log('C. heights cluster within an inch, the row shows the tallest');
// The step under the middle of B2 cuts B2 into two items (BEM-03): 20 ft
// standing 1" higher, 40 ft like the others. Same conditions, height 1" apart
// -> all FOUR items share the row, and the row shows the taller height.
R = await page.evaluate(() => { build({ stepUnder: 1, stepIn: -1 }); return rows(); });
console.log('   ' + JSON.stringify(R.map(r => [r.name, r.count, r.rows.map(x => [x.under, x.h && +x.h.toFixed(4)])])));
ok(R.length === 1 && R[0].count === 4, 'a 1" difference keeps the piece in the group (four items, one row): ' + JSON.stringify(R.map(r => r.count)));
const hA = await page.evaluate(() => { build(); const r = rows(); return r[0].rows.find(x => x.under === 'L2').h; });
const hC = R[0].rows.find(x => x.under === 'L2').h;
ok(Math.abs((hC - hA) - 1 / 12) < 1e-6, 'and the row shows the tallest member\'s height, 1" up: ' + JSON.stringify([hA, hC]));
// 2" is past the tolerance: that piece is another row
R = await page.evaluate(() => { build({ stepUnder: 1, stepIn: -2 }); return rows(); });
const lone = R.find(r => r.count === 1);
ok(R.length === 2 && R.find(r => r.count === 3) && lone && !lone.group, 'a 2" difference splits the piece off: a group of three and a single: ' + JSON.stringify(R.map(r => [r.count, r.members])));
ok(lone && Math.abs(lone.rows.find(x => x.under === 'L2').h - hA - 2 / 12) < 1e-6, 'the single is the 2"-taller piece: ' + JSON.stringify(lone && lone.rows[0]));
ok(R.find(r => r.count === 3).rows.find(x => x.under === 'L2').h === hA, 'and the group keeps its own height, not the tall one');

console.log('D. one pick on the group is the pick for every member');
R = await page.evaluate(() => { build(); return rows(); });
const D = await page.evaluate(() => {
  const S = __S, L = S.levels[0], g = L.solve.beams[0];
  const row = g.rows.find(r => r.beamKey && r.beamNet > 0 && r.options.length);
  const pick = row.options[0];
  shoreChoices()[row.beamKey] = pick.shoreId;
  regroupBeamsOf(L);
  const g2 = L.solve.beams[0];
  const r2 = g2.rows.find(r => r.level.name === row.level.name);
  // every member, read on its own, resolves to the same chosen shore
  const memberKeys = g2.members.map(m => beamRowKey(L.pour.name, m, r2.levelIdx));
  const groupKey = beamRowKey(L.pour.name, g2, r2.levelIdx);
  // effective width and shores-per-cluster ride on the same key
  shoreChoices()[groupKey + '|W'] = 4; shoreChoices()[groupKey + 'N'] = 2;
  regroupBeamsOf(L);
  const r3 = L.solve.beams[0].rows.find(r => r.level.name === row.level.name);
  return { under: row.level.name, chosen: r2.beamChosen && r2.beamChosen.shoreId, shore: pick.shoreId, groupKey, memberKeys,
           effW: r3.effW, dflt: r3.effWIsDefault, n: r3.beamPerCluster, sameKeyAsRow: row.beamKey === groupKey };
});
ok(D.chosen === D.shore, 'the group row shows the pick: ' + JSON.stringify([D.chosen, D.shore]));
ok(D.effW === 4 && !D.dflt && D.n === 2, 'one effective width and shores-per-cluster for the whole group: ' + JSON.stringify([D.effW, D.n]));
ok(D.sameKeyAsRow && D.groupKey.includes('grp:'), 'the pick is stored once, under the group\'s own key: ' + D.groupKey);
ok(new Set(D.memberKeys).size === 3 && D.memberKeys.every(k => k !== D.groupKey), 'the three members keep their own keys for when they are broken out');
// and a pick every member already had (an old job) is carried into the group
const D2 = await page.evaluate(() => {
  build();
  const S = solveAll({ step: 2 }); const L = S.levels[0]; const g = L.solve.beams[0];
  const row = g.rows.find(r => r.beamKey && r.beamNet > 0 && r.options.length);
  const pick = row.options[row.options.length - 1].shoreId;
  const ch = shoreChoices(); delete ch[row.beamKey];
  for (const m of g.members) ch[beamRowKey(L.pour.name, m, row.levelIdx)] = pick;
  const S2 = solveAll({ step: 2 }); const g2 = S2.levels[0].solve.beams[0];
  const c = g2.rows.find(r => r.levelIdx === row.levelIdx).beamChosen;
  return { chosen: c && c.shoreId, pick };
});
ok(D2.chosen === D2.pick, 'a pick all three members agreed on before grouping existed is adopted by the group: ' + JSON.stringify(D2));

console.log('E. break a member out, and it stays out');
const E = await page.evaluate(() => {
  build();
  const S = solveAll({ step: 2 }); const L = S.levels[0];
  const g = L.solve.beams[0];
  const m = g.members.find(x => x.label === 'B2');
  setBeamBreakout(L, m.memberId, true);
  const after = L.solve.beams.map(b => ({ label: b.label, count: b.count || 1, out: !!b.brokenOut, canRegroup: !!b.canRegroup, group: !!b.group }));
  // the break-out is saved with the job and survives a fresh solve
  const saved = JSON.parse(JSON.stringify(state.project.beamBreakout));
  const S2 = solveAll({ step: 2 });
  const again = S2.levels[0].solve.beams.map(b => ({ label: b.label, count: b.count || 1, out: !!b.brokenOut }));
  // regroup puts it back
  setBeamBreakout(S2.levels[0], m.memberId, false);
  const back = S2.levels[0].solve.beams.map(b => ({ label: b.label, count: b.count || 1, out: !!b.brokenOut }));
  return { after, saved, again, back, memberId: m.memberId };
});
console.log('   ' + JSON.stringify(E.after));
ok(E.after.length === 2, 'two rows after the break-out: ' + E.after.length);
ok(E.after.find(r => r.label === 'B2' && r.out && !r.group && r.canRegroup), 'B2 has its own row, marked broken out and offered a regroup: ' + JSON.stringify(E.after.find(r => r.label === 'B2')));
ok(E.after.find(r => r.count === 2 && r.group && /B1, B3/.test(r.label)), 'B1 and B3 stay together: ' + JSON.stringify(E.after.find(r => r.group)));
ok(E.saved[E.memberId] === true, 'the break-out is saved on the job by member id: ' + JSON.stringify(E.saved));
ok(E.again.length === 2 && E.again.find(r => r.label === 'B2' && r.out), 'a fresh solve keeps B2 out: ' + JSON.stringify(E.again));
ok(E.back.length === 1 && E.back[0].count === 3 && !E.back[0].out, 'regroup puts it back with the identical beams: ' + JSON.stringify(E.back));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

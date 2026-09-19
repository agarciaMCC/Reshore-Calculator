// @rules RES-04, RGN-07  (see DECISIONS.md)
// RESULTS BY ZONE + THE NAME IS THE LOAD PATH (Kinect, Sep 17 2026)
// Adolfo: "this type of view is not helpful. ideally the results would be
// split in north and south. its very confusing to try and understand the
// results. lets also change the naming of the slab pour to 'Slab Thickness' -
// Level below 'load capacity' - Level below that load capacity - and so on."
// Chose: level names in the name (13" Slab – L3 39 PSF – L2 54 PSF – 1B SOG;
// a purely numeric level reads as L3, one with letters — 1B — as it is),
// beams the same way with their size in front.
//
//  A. names: slab thickness, then each floor below with its capacity; SOG,
//     opening and no slab named as such; beams size-first
//  B. a pour drawn across North/South files its regions under a header per
//     zone, in sheet order, with no zone prefix on the names
//  C. the install summary answers per floor per zone
//  D. the plan labels only the regions on the sheet in front of you
//  E. clicking a row opens the sheet of that floor that actually holds it
//  F. a pour drawn on one sheet has no zone headers
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
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const KIN = path.resolve(here, '..', 'Kinect');
const pdf = fs.readFileSync(path.join(KIN, '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));
const jobFile = fs.existsSync(path.join(KIN, 'kinect4-new.json')) ? 'kinect4-new.json' : 'kinect4.json';
const job = JSON.parse(fs.readFileSync(path.join(KIN, jobFile), 'utf8'));
await page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); if (typeof resetPageTextCache === 'function') resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
  await warmSheetSizes(state.levels.flatMap(l => levelSheets(l).map(s => s.page)));
  setStep('results');
}, [pdf.toString('base64'), job]);
await page.waitForFunction(() => schedSolve && schedSolve.levels.length && schedSolve.levels.every(L => L.solve), null, { timeout: 120000 });

// pour Level 3: North (sheet 10) + South (sheet 11)
const P3 = await page.evaluate(() => {
  schedPourIdx = schedSolve.levels.findIndex(L => L.pour.name === '3');
  state.ui.highlight = null; renderSchedule();
  const L = schedSolve.levels[schedPourIdx], s = L.solve;
  const host = document.getElementById('schedBody');
  const walk = []; let zone = null;
  for (const el of host.children) {
    if (el.classList.contains('sched-zone-head')) { zone = el.querySelector('b').textContent; walk.push({ zone, head: el.textContent.replace(/\s+/g, ' ').trim() }); continue; }
    const cards = el.matches('.sched-region') ? [el] : [...el.querySelectorAll('.sched-region')];
    for (const c of cards) walk.push({ zone, ri: c.dataset.cardRi != null ? +c.dataset.cardRi : null, beam: c.classList.contains('sched-beam'), name: c.querySelector('b').textContent });
  }
  return {
    zoned: pourIsZoned(L), sheets: pourZoneSheets(L).map(z => [z.page, z.name]),
    names: s.regions.map((r, i) => regionLabel(r, i, L)),
    beams: (s.beams || []).map((b, i) => beamLabel(b, i)),
    zoneOf: s.regions.map(r => regionZonePage(r, L)),
    walk,
    heads: [...host.querySelectorAll('.sched-zone-head b')].map(b => b.textContent),
    install: [...document.querySelectorAll('#schedSummary .inst-row, .inst-row')].map(el => ({ key: el.dataset.fl || null, text: el.querySelector('.inst-fl') && el.querySelector('.inst-fl').textContent.replace(/\s+/g, ' ').trim() })),
    planFloors: (pourInstallPlan(L) || { floors: [] }).floors.map(f => [f.key, f.name, f.zone, f.needsShores]),
  };
});
console.log('   L3 regions: ' + JSON.stringify(P3.names));
console.log('   L3 beams:   ' + JSON.stringify(P3.beams));

console.log('A. the name is the load path');
ok(P3.names.length > 0 && P3.names.every(n => /^\d+(\.\d+)?" Slab – L2 (\d+(\.\d)? PSF|SOG|opening|no slab)/.test(n)),
  'every Level 3 region starts with its slab thickness, then L2 with its capacity (or SOG / opening / no slab): ' + JSON.stringify(P3.names));
ok(P3.names.some(n => / – 1B (\d+(\.\d)? PSF|SOG)/.test(n)), 'and goes on down to 1B where the load reaches it');
ok(!P3.names.some(n => /^(North|South) · /.test(n)), 'no zone prefix on the names any more');
ok(new Set(P3.names).size === P3.names.length, 'names stay unique within the placement');
ok(P3.beams.every(n => /^\d+(\.\d+)?"×\d+(\.\d+)?" Beam( – L2 (\d+(\.\d)? PSF|SOG|opening|no slab))?/.test(n)), 'beams are named size first, then the floors below the same way: ' + JSON.stringify(P3.beams));
ok(!P3.beams.some(n => /^B\d+ · /.test(n) || / over R\d+/.test(n)), 'the B1/B2 numbering and "over R3" are gone');

console.log('B. one block per zone');
ok(P3.zoned && P3.sheets.length === 2, 'Level 3 is drawn on two sheets: ' + JSON.stringify(P3.sheets));
ok(P3.heads.length === 2 && P3.heads[0] === 'North' && P3.heads[1] === 'South', 'a header per zone, in sheet order: ' + JSON.stringify(P3.heads));
const under = z => P3.walk.filter(w => w.zone === z && w.ri != null);
ok(under('North').length > 0 && under('South').length > 0, `regions under both headers: North ${under('North').length}, South ${under('South').length}`);
ok(P3.walk.filter(w => w.ri != null).every(w => P3.sheets.find(s => s[1] === w.zone)[0] === P3.zoneOf[w.ri]), 'every region card sits under the zone whose sheet holds it');
ok(P3.walk.filter(w => w.ri != null).length === P3.names.length, 'and every region is listed exactly once');

console.log('C. the install summary per floor per zone');
const keys = P3.planFloors.map(f => f[0]);
ok(keys.some(k => /^2\|/.test(k)) && P3.planFloors.filter(f => f[1] === '2').length === 2, 'Level 2 answers twice, once per zone: ' + JSON.stringify(P3.planFloors));
ok(P3.planFloors.filter(f => f[1] === '2').map(f => f[2]).sort().join() === 'North,South', 'named North and South');
ok(P3.install.some(r => /^2 ?North/.test(r.text)) && P3.install.some(r => /^2 ?South/.test(r.text)), 'the rows read "2 North" / "2 South": ' + JSON.stringify(P3.install.map(r => r.text)));

console.log('D. the plan labels only what is on the sheet in front of you');
const D = await page.evaluate(async () => {
  const L = schedSolve.levels[schedPourIdx];
  const li = state.levels.findIndex(l => l.name === '3');
  state.activeLevelIdx = li; state.ui.highlight = null;
  const labelsOn = async pg => {
    await goToPage(pg);
    const c = document.getElementById('drawCanvas').getContext('2d');
    const t = []; const t0 = c.fillText.bind(c);
    c.fillText = function (x) { t.push(String(x)); return t0.apply(c, arguments) };
    renderNow(); c.fillText = t0;
    // a name goes on the plan one step per line: keep the lines that belong to a region name
    const all = new Set(L.solve.regions.flatMap((r, i) => regionLabel(r, i, L).split(' – ')));
    return t.filter(x => all.has(x));
  };
  const n = await labelsOn(10), s = await labelsOn(11);
  const names = L.solve.regions.map((r, i) => regionLabel(r, i, L));
  const zp = L.solve.regions.map(r => regionZonePage(r, L));
  const linesOf = pg => new Set(names.filter((x, i) => zp[i] === pg).flatMap(x => x.split(' – ')));
  const onlyOf = pg => { const mine = linesOf(pg), other = linesOf(pg === 10 ? 11 : 10); return [...mine].filter(x => !other.has(x)) };
  return { n, s, northOnly: onlyOf(10), southOnly: onlyOf(11), northLines: [...linesOf(10)], southLines: [...linesOf(11)] };
});
ok(D.n.length > 0 && D.s.length > 0, `labels drawn on both sheets: North ${D.n.length} lines, South ${D.s.length} lines`);
ok(D.n.every(x => D.northLines.includes(x)) && D.s.every(x => D.southLines.includes(x)), 'and each sheet carries only lines of its own zone\'s names: ' + JSON.stringify({ n: D.n, s: D.s }));
ok(!D.n.some(x => D.southOnly.includes(x)) && !D.s.some(x => D.northOnly.includes(x)), 'nothing that belongs only to the other zone is written on a sheet');

console.log('E. a row opens the sheet of that floor that holds the region');
const E = await page.evaluate(async () => {
  const L = schedSolve.levels[schedPourIdx], s = L.solve;
  const north = s.regions.findIndex(r => regionZonePage(r, L) === 10);
  const south = s.regions.findIndex(r => regionZonePage(r, L) === 11);
  const li2 = state.levels.findIndex(l => l.name === '2');
  await showRegionOn(li2, s.regions[north], 'n'); const pn = state.pdf.current;
  await showRegionOn(li2, s.regions[south], 's'); const ps = state.pdf.current;
  const lv2 = state.levels[li2];
  return { pn, ps, l2: levelSheets(lv2).map(x => [x.page, sheetZoneName(lv2, x.page)]) };
});
ok(E.pn === 8 && E.ps === 9, `"under 2" on a North region opens Level 2 North (sheet 8), on a South region Level 2 South (sheet 9): ${E.pn}, ${E.ps} · L2 = ${JSON.stringify(E.l2)}`);

console.log('F. a pour on one sheet has no zone headers');
const F = await page.evaluate(() => {
  schedPourIdx = schedSolve.levels.findIndex(L => L.pour.name === '4');
  state.ui.highlight = null; renderSchedule();
  const L = schedSolve.levels[schedPourIdx];
  const host = document.getElementById('schedBody');
  return { zoned: pourIsZoned(L), heads: host.querySelectorAll('.sched-zone-head').length, cards: host.querySelectorAll('.sched-region[data-card-ri]').length, n: L.solve.regions.length,
    names: L.solve.regions.map((r, i) => regionLabel(r, i, L)).slice(0, 4),
    floors: (pourInstallPlan(L) || { floors: [] }).floors.map(f => [f.key, f.zone]) };
});
ok(!F.zoned && F.heads === 0 && F.cards === F.n, 'Level 4 (South sheet only) lists its regions with no zone header: ' + JSON.stringify(F));
ok(F.floors.every(f => !f[1] && !/\|/.test(f[0])), 'and its install rows are plain floors');
ok(F.names.every(n => /^\d+(\.\d+)?" Slab – L3 /.test(n)), 'named from Level 3 down: ' + JSON.stringify(F.names));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

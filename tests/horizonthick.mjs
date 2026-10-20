// @rules ARE-35, ARE-21, ARE-25, ARE-31, ARE-32, RES-19, RES-12, BEM-03  (see DECISIONS.md)
// Horizon House garage, "trust every default" re-run (Oct 19, 2026), the two
// worst problems left:
//  A. thickened areas came in with no thickness (21 of 23): B2's 19" flat
//     soffit and 28" band poured as the 12" typical, B1's 15" as 12". Now read
//     from the range note and the T/B tags (ARE-35), so B2 places 268 PSF on
//     the 19" and 380 PSF on the 28"; the review card names the thickness
//     (never "undefined″ × undefined″"); one with none holds Results.
//  B. beam rows repeated in Results — 11 beams on the B1 pour were 67 rows.
//     Now one row per beam per floor below (RES-19).
// Fixture: the job as the Oct 19 run saved it (tests/fixtures/horizon/horizon-trustall-1019.reshore.json).
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
const job = fs.readFileSync(path.resolve(here, 'fixtures', 'horizon', 'horizon-trustall-1019.reshore.json'), 'utf8');
await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.pageImages = {};
  document.getElementById('upload-prompt').style.display = 'none';
}, pdf.toString('base64'));
await page.evaluate((j) => { deserializeDoc(JSON.parse(j)); sortLevelsByElevation(); traceCache = new Map(); }, job);

console.log('A. thickened areas read their thickness (ARE-35)');
const A = await page.evaluate(async () => {
  const sf = (lv, pg, i) => { const T = (levelAlignmentFor(lv, pg) || {}).transform, f = T ? Math.hypot(T[0], T[2]) : 0; return Math.round(i.areaPx2 * f * f); };
  const read = {};
  // the scan as it runs on B2 (sheet 9), B1 (10) and B6 (5); B2 and B1 accept every shape offered
  for (const [pg, nm] of [[9, 'B2'], [10, 'B1'], [5, 'B6']]) {
    const li = state.levels.findIndex(l => l.name === nm), lv = state.levels[li];
    const arr = zonesOf(lv, 'slab');
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i].fromSheet && ['slab', 'beam'].includes(slabKind(arr[i]))) arr.splice(i, 1);
    const g = await detectGreyShapes(pg), sn = await detectSlabNotes(pg, lv);
    const c = clipItemsToEdge(g.items.concat(sn).map(i => ({ ...i, page: pg, levelIdx: li })), lv, pg);
    read[nm] = c.kept.filter(i => i.kind !== 'opening').map(i => ({ kind: i.kind, t: i.tIn, sf: sf(lv, pg, i),
      off: i.tosFt != null ? Math.round((i.tosFt - lv.elevation) * 12) : null, card: scanShapeName(i, null, '"') }));
    if (nm !== 'B6') { beamScan = { items: c.kept, levelIdx: li }; scanCommit(c.kept.filter(i => !i.failed && i.kind !== 'opening')); beamScan = null; }
  }
  const r = solveAll({});
  const B2 = r.levels.find(x => x.pour && x.pour.name === 'B2');
  const place = {};
  for (const x of B2.solve.regions) { const k = x.thicknessIn + ':' + Math.round(x.placementLoad); place[k] = (place[k] || 0) + Math.round(x.areaSF); }
  return { read, place,
    range: [slabNoteInches('16" MIN, 19" MAX SLAB WITH FLAT SOFFIT'), slabNoteInches('12" MIN/15" MAX SLAB W/FLAT SOFFIT'), slabNoteInches('10" SLAB')],
    typ: readSheetTypicalSlab([{ s: '16" MIN, 19" MAX SLAB WITH FLAT SOFFIT' }]) };
});
ok(A.range[0] === 19 && A.range[1] === 15 && A.range[2] === 10, 'a MIN/MAX note reads as the MAX: ' + A.range);
ok(A.typ == null, 'a MIN/MAX note is still never the floor\'s typical (BLD-23)');
const b2 = A.read.B2;
const band = b2.filter(i => i.t === 28);
ok(band.length === 5 && band.every(i => i.kind === 'slab' && i.off === 0), 'B2\'s band is five 28" thickened slab pieces, none a beam: ' + JSON.stringify(b2.map(i => i.kind + i.t)));
const soffit = b2.find(i => i.t === 19);
ok(soffit && soffit.sf > 6000 && soffit.sf < 8000 && soffit.off === -9, 'B2\'s 19" flat soffit is traced, ~6.8k SF, 9" down: ' + JSON.stringify(soffit));
ok(!b2.some(i => i.kind === 'beam'), 'no beams are offered on B2');
const b1 = A.read.B1.find(i => i.t === 15);
ok(b1 && b1.off === -9, 'B1\'s 15" area is read, 9" down: ' + JSON.stringify(b1));
ok(A.read.B6.filter(i => i.t === 20).length === 3, 'B6\'s 20" band (tags on leaders) is three thickened slab pieces: ' + JSON.stringify(A.read.B6.map(i => i.kind + i.t)));
ok(A.place['19:268'] > 6000 && A.place['28:380'] > 2000, 'B2 places 268 PSF on the 19" and 380 PSF on the 28": ' + JSON.stringify(A.place));
const cards = [...A.read.B2, ...A.read.B1].map(i => i.card);
ok(cards.every(c => !/undefined/.test(c)), 'no review card says "undefined": ' + cards.filter(c => /undefined/.test(c)).join(' | '));
ok(cards.includes('Thickened slab 19" thick') && cards.includes('Thickened slab 10" thick'), 'cards name the thickness: ' + [...new Set(cards)].join(' | '));

console.log('A2. a thickened slab with no thickness holds Results (ARE-35, ARE-25)');
const A2 = await page.evaluate(() => {
  const b3 = state.levels.find(l => l.name === 'B3'), b7 = state.levels.find(l => l.name === 'B7');
  const z = { id: sid(), kind: 'slab', fromSheet: true, polygon: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }] };
  const hand = { ...z, id: sid(), fromSheet: false };
  const n0 = slabsWithoutThickness();
  zonesOf(b3, 'slab').push(z, hand);
  const n1 = slabsWithoutThickness();
  const tag = adTagText(b3, z, 'slab');
  const gate = (stepBlockers('sequence') || []).map(b => b.label);
  zonesOf(b7, 'slab').push({ ...z, id: sid() });
  const n2 = slabsWithoutThickness();
  z.thicknessIn = 14;
  const n3 = slabsWithoutThickness();
  return { n0, n1, n2, n3, tag, gate };
});
ok(A2.n1 === A2.n0 + 1, 'a sheet-read slab with no thickness counts; one drawn by hand does not');
ok(A2.n2 === A2.n1, 'nor one on a floor on grade');
ok(A2.n3 === A2.n0, 'typing its thickness clears it');
ok(A2.gate.some(l => /thickness for \d+ thickened slab area/.test(l)), 'the Results gate names it: ' + JSON.stringify(A2.gate));
ok(A2.tag.warn && /thickness needed/.test(A2.tag.t), 'its tag says thickness needed: ' + JSON.stringify(A2.tag));

console.log('B. one row per beam per floor below (RES-19)');
const B = await page.evaluate(() => {
  const r = solveAll({});
  const L = r.levels.find(x => x.pour && x.pour.name === 'B1');
  const rows = [];
  // sized beams only: B1's 36.7" shape with no depth holds Results anyway
  // (ARE-25), and its two halves stand 16" apart over B2's 28" band (BEM-04)
  for (const b of L.solve.beams) for (const q of b.rows) if (q.beamKey && b.depthIn > 0) rows.push((b.group ? b.members.map(m => m.beamId).join('+') : b.beamId) + '@' + q.levelIdx);
  const ids = new Set(L.solve.rawBeams.filter(b => b.depthIn > 0).map(b => b.beamId));
  const floors = new Set(L.solve.beams.flatMap(b => b.rows.filter(q => q.beamKey).map(q => q.levelIdx)));
  const unsized = L.solve.rawBeams.filter(b => !(b.depthIn > 0)).length;
  const big = L.solve.rawBeams.find(b => b.widthIn === 24 && b.depthIn === 53);
  const dups = rows.filter((x, i) => rows.indexOf(x) !== i);
  return { dups, unsized, rows: rows.length, uniq: new Set(rows).size, beams: ids.size, floors: floors.size,
    bigFloors: big ? big.rows.filter(q => q.beamKey).map(q => q.level.name) : [] };
});
ok(B.rows === B.uniq, 'no beam is listed twice under one floor: ' + JSON.stringify(B.dups));
ok(B.rows <= B.beams * B.floors && B.rows >= 40, `B1 pour beam rows ≈ beams × floors: ${B.rows} rows, ${B.beams} beams, ${B.floors} floors (was 67)`);
ok(B.bigFloors.length === 5 && new Set(B.bigFloors).size === 5, 'the single 24×53 is one row under each of B2–B6: ' + JSON.stringify(B.bigFloors));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

// @rules BLD-15, BLD-16, RVT-12  (see DECISIONS.md)
// THE STRIP UNDER THE DRAWING TITLE (Sep 22 2026). Adolfo: "the calculator
// no longer reading floor data from the Kalae Revit plans PDF."
//
// It read the names and nothing else: 41 floors proposed, every elevation
// and thickness null. Two causes, both here.
//
//   BLD-15  readSheetElevations hunts for the T/SLAB - B/SLAB callout PAIRS
//           drawn on the slab. A rendered plan states the floor once, in a
//           strip under the drawing title — "T.O.S. 9'-3" · typical slab 5"
//           · SLAB ON GRADE" — which matched neither regex, so the sheet
//           said nothing. Read now as a separate channel that fills only
//           what the callouts left empty, and never feeds the
//           plan-vs-section test.
//   BLD-16  "LEVEL MECH ROOF FLOOR PLAN" read as "Roof" (the ROOF shortcut
//           fired before the title was parsed) and "LEVEL ELEV MECH RM
//           FLOOR PLAN" as "ELEV". Two floors collided on one name and the
//           42nd sheet was dropped by one-sheet-per-level.
//   RVT-12  and the exporter wrote 77'-11.5", which no drawing says and
//           DIM_RE does not parse. Fractions now.
//
//   node tests/titlestrip.mjs [reshore-calc.html] [rendered-plans.pdf]
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import fs from 'node:fs';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const root = path.resolve(here, '..');
const app = process.argv[2] || path.join(root, 'reshore-calc.html');
const pdfPath = process.argv[3] || path.join(root, 'Revit export', '1268_KALAE-revit-plans.pdf');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(app));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// A page of text items as pageTextCached hands them over.
const strip = (extra = []) => ([
  { s: 'LEVEL 1 FLOOR PLAN', x: 72, y: 3277, w: 500, h: 60 },
  { s: 'T.O.S. 9\'-3"', x: 72, y: 3341, w: 120, h: 26 },
  { s: 'typical slab 5"', x: 273, y: 3341, w: 130, h: 26 },
  { s: 'scale 1" = 20\'', x: 516, y: 3341, w: 120, h: 26 },
  { s: 'SLAB ON GRADE', x: 756, y: 3341, w: 150, h: 26 },
].concat(extra));

console.log('A. BLD-15: the strip states the floor');
{
  const r = await page.evaluate(i => readSheetTitleStrip(i), strip());
  ok(Math.abs(r.tosFt - 9.25) < 1e-6, `T.O.S. 9'-3" reads as 9.25 ft (${r.tosFt})`);
  ok(r.thickIn === 5, `typical slab 5" reads as 5 in (${r.thickIn})`);
  ok(r.onGrade === true, 'and SLAB ON GRADE is read');
}
{ // the exporter's own forms, fractional (RVT-12) and the decimal it used to write
  const frac = await page.evaluate(i => readSheetTitleStrip(i),
    [{ s: 'T.O.S. 77\'-11 1/2"', x: 72, y: 3341, w: 160, h: 26 },
     { s: 'typical slab 7 1/2"', x: 273, y: 3341, w: 150, h: 26 }]);
  ok(Math.abs(frac.tosFt - (77 + 11.5 / 12)) < 1e-6, `77'-11 1/2" reads (${frac.tosFt})`);
  ok(frac.thickIn === 7.5, `7 1/2" reads as 7.5 in (${frac.thickIn})`);
  const dec = await page.evaluate(i => readSheetTitleStrip(i),
    [{ s: 'T.O.S. 194\'-7.5"', x: 72, y: 3341, w: 160, h: 26 },
     { s: 'typical slab 11.75"', x: 273, y: 3341, w: 150, h: 26 }]);
  ok(Math.abs(dec.tosFt - 194.625) < 1e-6, `an older export's 194'-7.5" still reads (${dec.tosFt})`);
  ok(dec.thickIn === 11.75, `and 11.75" (${dec.thickIn})`);
}

console.log('B. BLD-15: the per-area offsets on the same sheet are not elevations');
{
  const r = await page.evaluate(i => readSheetTitleStrip(i), strip([
    { s: 'T.O.S. +9.5"', x: 3103, y: 328, w: 90, h: 14 },
    { s: 'T.O.S. -3"', x: 3071, y: 353, w: 70, h: 14 },
    { s: 'T.O.S. -53"', x: 1683, y: 2030, w: 80, h: 14 },
  ]));
  ok(Math.abs(r.tosFt - 9.25) < 1e-6, `a signed inch offset is not taken as the floor (${r.tosFt})`);
  ok(r.n === 1, `only the one absolute figure counted (${r.n})`);
}
{ // a set that calls an ABSOLUTE T.O.S. out per bay is the other channel's job
  const r = await page.evaluate(i => readSheetTitleStrip(i), [
    { s: 'T.O.S. 120\'-0"', x: 400, y: 900, w: 120, h: 14 },
    { s: 'T.O.S. 119\'-6"', x: 900, y: 1200, w: 120, h: 14 },
  ]);
  ok(r.tosFt === null, 'two different absolute figures and the strip channel stands down');
}

console.log('C. BLD-15: the callouts win where they spoke, and the plan test is untouched');
{
  const r = await page.evaluate(() => {
    const items = [
      { s: 'LEVEL 3 FLOOR PLAN', x: 72, y: 3277, w: 500, h: 60 },
      { s: 'T.O.S. 40\'-0"', x: 72, y: 3341, w: 120, h: 26 },
    ];
    // three agreeing T/SLAB - B/SLAB boxes: the real drawing convention
    for (let k = 0; k < 3; k++) {
      items.push({ s: 'T/SLAB: 29\'-11"', x: 400 + k * 300, y: 900, w: 120, h: 12 });
      items.push({ s: 'B/SLAB: 29\'-3 1/2"', x: 400 + k * 300, y: 915, w: 120, h: 12 });
    }
    const e = readSheetElevations(items), s = readSheetTitleStrip(items);
    return { tos: e.tos ? e.tos.value : null, n: e.tos ? e.tos.n : 0, thick: e.thickIn, stripTos: s.tosFt };
  });
  ok(Math.abs(r.tos - (29 + 11 / 12)) < 1e-4, `the callouts still read (${r.tos})`);
  ok(Math.abs(r.stripTos - 40) < 1e-6, 'the strip is read too, separately');
  ok(r.n === 3, 'and the plan-vs-section count is the callouts alone, not the strip');
}

console.log('D. BLD-16: a title that names its level names it in full');
{
  const got = await page.evaluate(() => [
    'LEVEL 1 FLOOR PLAN', 'LEVEL 4.5 FLOOR PLAN', 'LEVEL MECH ROOF FLOOR PLAN',
    'LEVEL ELEV MECH RM FLOOR PLAN', 'LEVEL 2 SOFFIT PLAN', 'ROOF PLAN',
    'LEVEL ROOF FLOOR PLAN', 'LEVEL 03 SLAB PLAN', 'LEVEL 5 SLAB ON GRADE PLAN',
    'LEVEL-1B S.O.G FLOOR PLAN - SOUTH', 'LEVEL-1B (FLOOR PLAN) - NORTH',
  ].map(t => [t, (levelNameFromTitle(t) || {}).name || null]));
  const want = { 'LEVEL 1 FLOOR PLAN': '1', 'LEVEL 4.5 FLOOR PLAN': '4.5',
    'LEVEL MECH ROOF FLOOR PLAN': 'MECH ROOF', 'LEVEL ELEV MECH RM FLOOR PLAN': 'ELEV MECH RM',
    'LEVEL 2 SOFFIT PLAN': '2', 'ROOF PLAN': 'Roof', 'LEVEL ROOF FLOOR PLAN': 'Roof',
    'LEVEL 03 SLAB PLAN': '3', 'LEVEL 5 SLAB ON GRADE PLAN': '5',
    // his own sets: S.O.G qualifies the plan, not the floor — 1B and
    // 1B S.O.G are one level at one elevation
    'LEVEL-1B S.O.G FLOOR PLAN - SOUTH': '1B', 'LEVEL-1B (FLOOR PLAN) - NORTH': '1B' };
  for (const [t, name] of got) ok(name === want[t], `${t} → ${name} (wanted ${want[t]})`);
}

console.log('E. the Kalae rendered set, cold: every floor comes back with its data');
if (!fs.existsSync(pdfPath)) { console.log('  (no rendered set at ' + pdfPath + ' — skipped)'); }
else {
  await page.setInputFiles('#fileInput', path.resolve(pdfPath));
  await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 240000 });
  ok(await page.evaluate(() => state.pdf.pages) === 42, 'the 42-page rendered set loads');
  await page.waitForTimeout(9000);
  const r = await page.evaluate(async () => {
    const list = await proposeLevelsFromDrawings();
    applyLevelDrawingProposals(list, null);
    const by = n => state.levels.find(l => String(l.name) === n);
    return { n: list.length,
      elev: list.filter(p => p.elev != null).length,
      thick: list.filter(p => p.thickIn != null).length,
      names: list.map(p => p.name),
      l1: by('1') ? { e: by('1').elevation, t: by('1').slabThickness, og: !!by('1').onGrade } : null,
      l19: by('19') ? { e: by('19').elevation, t: by('19').slabThickness } : null };
  });
  ok(r.n === 42, `all 42 sheets propose a floor (${r.n})`);
  ok(r.elev === r.n && r.thick === r.n, `every one with an elevation and a thickness (${r.elev}/${r.thick} of ${r.n})`);
  ok(new Set(r.names).size === r.n, 'and no two of them collide on a name');
  ok(r.names.includes('MECH ROOF') && r.names.includes('ELEV MECH RM'),
     'BLD-16: the two mechanical levels keep their own names: ' + r.names.slice(-3).join(' / '));
  // RVT-06: the project datum, which is what sheet 12 of his own set says
  ok(r.l1 && Math.abs(r.l1.e - 9.25) < 1e-4, `Level 1 reads 9'-3" (${r.l1 && r.l1.e})`);
  ok(r.l1 && r.l1.t === 5, `with its 5" slab (${r.l1 && r.l1.t})`);
  ok(r.l1 && r.l1.og === true, 'and flagged on grade from the strip');
  ok(r.l19 && Math.abs(r.l19.e - 194.625) < 1e-4, `Level 19 reads 194'-7 1/2" (${r.l19 && r.l19.e})`);
}

await browser.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

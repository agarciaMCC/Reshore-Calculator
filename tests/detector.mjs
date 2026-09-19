// THE FLOOR-EDGE DETECTOR ON A SPLIT SET (Kinect, Sep 17 2026)
// Adolfo: "the auto detect slab edge fails and will detect either the key
// plan slab edge or the slab edge ends up following wall lines."
//
//  A. a sheet carrying a KEY PLAN is searched inside its own plan's grid,
//     not across the whole sheet — so the thumbnail can no longer win
//  B. where the slab edge is drawn no heavier than the grid, the sheet is
//     re-inked at that weight rather than coming back with a detail
//  C. the top few outlines are offered, ranked, with the reason on each
//  D. the panel lets you pick one and only then write it
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';
import fs from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const KIN = path.resolve(here, '..', 'Kinect');
const pdf = fs.readFileSync(path.join(KIN, '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));
const job = JSON.parse(fs.readFileSync(path.join(KIN, 'kinect4.json'), 'utf8'));
await page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); if (typeof resetPageTextCache === 'function') resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
}, [pdf.toString('base64'), job]);

// the key plan lives in the right-hand strip of every plan sheet on this set
const KEYPLAN_X = 4600;
console.log('A/B/C. every plan sheet');
const R = {};
for (const n of [6, 7, 8, 9, 10, 11]) {
  R[n] = await page.evaluate(async (n) => {
    const r = await detectFloorEdge(n);
    const box = c => { const xs = c.polygon.map(p => p.x), ys = c.polygon.map(p => p.y);
      return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(Math.round); };
    return { ok: r.ok, keyPlans: r.keyPlans, tightened: r.tightened,
      bb: r.bubbleBox && [r.bubbleBox.minx, r.bubbleBox.maxx].map(Math.round),
      cands: (r.candidates || []).map(c => ({ frac: +c.frac.toFixed(3), why: c.why, n: c.polygon.length, box: box(c), notes: c.notes })) };
  }, n);
  const t = R[n].cands[0];
  console.log(`   ${n}: ${R[n].cands.length} offered · top ${Math.round(t.frac*100)}% "${t.why}" box ${JSON.stringify(t.box)}`);
}
for (const n of [6, 7, 8, 9, 10, 11]) {
  const r = R[n];
  ok(r.ok, `sheet ${n} read`);
  ok(r.keyPlans >= 1 && r.tightened, `sheet ${n} finds its key plan and narrows the search: ${JSON.stringify([r.keyPlans, r.tightened])}`);
  ok(r.bb[1] < KEYPLAN_X, `sheet ${n} searches its own plan, not out to the key plan: ${JSON.stringify(r.bb)}`);
  ok(r.cands.length >= 1 && r.cands.every(c => c.box[0] < KEYPLAN_X),
    `sheet ${n} offers nothing from the key-plan strip: ${JSON.stringify(r.cands.map(c => c.box))}`);
  ok(r.cands[0].frac >= 0.2, `sheet ${n}'s first offer is plan-sized, not a detail: ${r.cands[0].frac}`);
}
// sheet 9 is the one whose slab edge is drawn at the grid's own weight
ok(R[9].cands[0].why !== 'heavy lines' && R[9].cands[0].frac > 0.7,
  'sheet 9, whose slab edge is no heavier than the grid, is read from the thin lines: ' + JSON.stringify(R[9].cands[0]));
ok((R[9].cands[0].notes || []).some(t => /no heavier than the grid/.test(t)),
  'and says so: ' + JSON.stringify(R[9].cands[0].notes));
ok(R[6].cands[0].why === 'heavy lines',
  'a sheet whose edge IS heavy is still read the ordinary way: ' + R[6].cands[0].why);
ok([6,7,8,9,10,11].every(n => R[n].cands.length > 1), 'every sheet offers more than one outline to choose from');

// ── D. the panel ───────────────────────────────────────────────────────
console.log('D. picking one');
const P = await page.evaluate(async () => {
  const i = state.levels.findIndex(l => l.name === '3');
  state.activeLevelIdx = i; setStep('areas');
  await goToPage(9);
  await startDetectFloorEdge();
  const host = document.getElementById('edgePanel');
  const rows = [...host.querySelectorAll('.ec-row')];
  const first = { sel: edgeProposal.sel, poly: edgeProposal.polygon.length,
                  on: rows.filter(r => r.classList.contains('on')).length, rows: rows.length };
  rows[1].click();
  const second = { sel: edgeProposal.sel, poly: edgeProposal.polygon.length,
                   on: [...host.querySelectorAll('.ec-row.on')].map(r => +r.dataset.ec) };
  const before = zonesOf(state.levels[i], 'slab').filter(isEdgeZone).length;
  return { first, second, before, cands: edgeProposal.cands.length };
});
ok(P.first.rows > 1 && P.first.on === 1 && P.first.sel === 0, 'the panel lists the candidates with the first picked: ' + JSON.stringify(P.first));
ok(P.second.sel === 1 && JSON.stringify(P.second.on) === '[1]', 'clicking another selects it: ' + JSON.stringify(P.second));
ok(P.second.poly !== P.first.poly || P.cands > 1, 'and it is a different outline on the plan');
const W = await page.evaluate(() => {
  const i = state.activeLevelIdx, lv = state.levels[i];
  const before = zonesOf(lv, 'slab').filter(isEdgeZone).filter(z => zonePage(lv, z) === 9).length;
  const want = edgeProposal.polygon.length;
  acceptDetectFloorEdge();
  const edges = zonesOf(lv, 'slab').filter(isEdgeZone).filter(z => zonePage(lv, z) === 9);
  const got = edges.length === 1 && edges[0].polygon.length === want;
  history.undo();
  return { before, after: edges.length, got, closed: edgeProposal === null };
});
ok(W.after === 1 && W.got, 'accepting writes the SELECTED outline, one edge for that sheet: ' + JSON.stringify(W));
ok(W.closed, 'and closes the panel');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);

// @rules MDL-20  (see DECISIONS.md)
// INCLUDE OR OMIT A HIGHER-CAPACITY AREA. Adolfo, Sep 25 2026: "it would be
// nice in the calculator if there was a recommendation/option to omit or
// include a loading area in the results to either simplify the
// calculations/install because you dont gain much from including it or to
// include it because it would provide a real savings to install at a more
// spread out pattern." His answers: an area counts until omitted; the saving
// is a shore count per floor ("since its only installed once"); one choice
// per area. Only an area ABOVE the floor's typical can be left out, because
// the typical is then used there, which is conservative.
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
const bothell = path.resolve(here, '..', '1175_Bothell_Stem_4.reshore.json');
if (!fs.existsSync(bothell)) { console.log('(1175 job not in this checkout, skipped)\n\n0 passed, 0 failed'); process.exit(0); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setInputFiles('#fileInput', path.resolve(here, 'fixtures', 'test-set.pdf'));
await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 180000 });
await page.waitForTimeout(2000);
await page.evaluate(d => applyOpenedJob(d, 'omit'), JSON.parse(fs.readFileSync(bothell, 'utf8')));
await page.waitForTimeout(1500);
// The Bothell job is all typical (138 PSF, B2). Draw two loading areas on
// it: a 200 PSF one over the west part of L2 — above the typical — and a
// 50 PSF one on L3, below its typical.
await page.evaluate(() => {
  const add = (name, psf, from, to) => {
    const l = state.levels.find(x => x.name === name);
    const e = zonesOf(l, 'slab').find(z => isEdgeZone(z) && !z.page) || zonesOf(l, 'slab').find(isEdgeZone);
    const xs = e.polygon.map(p => p.x), ys = e.polygon.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const a = x0 + (x1 - x0) * from, b = x0 + (x1 - x0) * to, c = y0 + (y1 - y0) * 0.2, d = y0 + (y1 - y0) * 0.8;
    const z = { id: 'test-' + name + '-' + psf, polygon: [{ x: a, y: c }, { x: b, y: c }, { x: b, y: d }, { x: a, y: d }], capacityPSF: psf, label: psf + ' PSF test area' };
    if (e.page) z.page = e.page;
    zonesOf(l, 'loading').push(z);
  };
  add('2', 200, 0.05, 0.4);
  add('3', 50, 0.6, 0.7);
});
const typ = async psf => page.evaluate(async psf => {
  const l = state.levels.find(x => x.name === '2');
  const z = zonesOf(l, 'loading').find(q => q.id === 'test-2-200'); z.capacityPSF = psf;
  state.results = null; persist(); setStep('results'); runSchedule();
}, psf);
await typ(200);
await page.waitForFunction(() => schedSolve && schedSolve.levels.length, null, { timeout: 120000 });

console.log('A. which areas can be left out');
const A = await page.evaluate(() => ({
  hi: highAreas().map(H => [H.lv.name, H.z.capacityPSF, levelDefaultCapacity(H.lv)]),
  lower: state.levels.flatMap(l => zonesOf(l, 'loading').filter(z => z.capacityPSF < levelDefaultCapacity(l)).map(z => [l.name, z.capacityPSF])),
}));
ok(A.hi.length >= 1 && A.hi.every(h => h[0] === '2' && h[1] > h[2]), 'the 200 PSF area on L2 over its 138 PSF typical is offered: ' + JSON.stringify(A.hi));
ok(A.lower.length >= 1, 'there is an area BELOW its typical on this job: ' + JSON.stringify(A.lower));
const lowOffered = await page.evaluate(() => highAreas().some(H => H.z.capacityPSF < levelDefaultCapacity(H.lv)));
ok(!lowOffered, 'and an area below its typical is never offered: it always counts');

console.log('B. what each one saves, per floor');
const B = await page.evaluate(() => {
  const sv = highAreaSavings();
  return highAreas().map(H => ({ id: H.z.id, v: sv.get(H.z.id) }));
});
const big = B.find(b => b.v && b.v.pours.length && b.v.saved > 0);
ok(!!big, 'at least one L2 area saves shores by being included: ' + JSON.stringify(B.map(b => b.v && [b.v.pours, b.v.floors])));
if (big) ok(big.v.floors.every(f => f.without >= f.with) && big.v.floors.some(f => f.name === '2'), 'counted per floor, under 2, never more shores with it than without: ' + JSON.stringify(big.v.floors));

console.log('C. the Results card, and omitting one');
await page.evaluate(() => { const k = schedSolve.levels.findIndex(L => L.pour.name === 'Roof'); schedPourIdx = k; state.ui.resultsFloor = null; renderSchedule(); });
const C0 = await page.evaluate(() => ({ rows: [...document.querySelectorAll('.ha-card .ha-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()), key: calculationKey() }));
ok(C0.rows.length >= 1 && C0.rows.every(t => /Omit$/.test(t)), 'the card lists them, each with Omit (they count until omitted): ' + JSON.stringify(C0.rows));
ok(C0.rows.some(t => /including it saves \d+ shores? under L2/.test(t)), 'and says what including it saves: ' + JSON.stringify(C0.rows[0]));
if (big) {
  await page.evaluate(id => document.querySelector(`button[data-hz-toggle="${id}"]`).click(), String(big.id));
  await page.waitForFunction(() => schedSolve && resultsCurrent(), null, { timeout: 120000 });
  await page.evaluate(() => renderSchedule());
  const C1 = await page.evaluate(async id => {
    const H = highAreas().find(h => String(h.z.id) === id);
    const L = schedSolve.levels.find(x => x.pour.name === 'Roof');
    // a region over the omitted area now reads the typical at L2
    const e = levelZonesInBuilding(H.lv, 'loading').find(x => x.zone === H.z);
    const over = L.solve.regions.filter(r => r.mp && mpArea(mpInter(r.mp, mpOf(e.bPoly))) > 50);
    const caps = over.map(r => r.steps.find(st => st.level.name === '2' && !st.open)).filter(Boolean).map(st => st.capacity);
    let html = '';
    const open = window.open;
    window.open = () => ({ document: { write: h => { html += h; }, close() {} }, focus() {}, print() {} });
    try { printSchedule(); } finally { window.open = open; }
    setStep('areas'); state.activeLevelIdx = state.levels.indexOf(H.lv); await goToPage(H.lv.pdfPage); setLayer('loading'); renderSidebar(); renderZoneList();
    const listed = [...document.querySelectorAll('.sb-item')].some(el => /omitted from Results/.test(el.textContent));
    const row = document.querySelector(`.ha-row[data-hz="${id}"]`);
    return { omit: !!H.z.omit, caps, row: row ? row.textContent.replace(/\s+/g, ' ').trim() : '', printed: /Omitted from these results/.test(html) && /conservative/.test(html), listed, key: calculationKey() };
  }, String(big.id));
  ok(C1.omit, 'Omit marks the area');
  ok(C1.caps.length && C1.caps.every(c => c === 138), 'Results now read the 138 PSF typical over it at L2: ' + JSON.stringify(C1.caps));
  ok(/omitted — typical 138 PSF used here/.test(C1.row) && /Include$/.test(C1.row), 'its row says so and offers Include: ' + C1.row);
  ok(/putting it back would save \d+ shores? under L2/.test(C1.row), 'and still says what putting it back saves');
  ok(C1.printed, 'the print says which areas were left out, and that it is conservative');
  ok(C1.listed, 'the Areas list marks it "omitted from Results"');
  ok(C1.key !== C0.key, 'omitting is an input: the results key changes');
  await page.evaluate(() => setStep('results'));
  await page.evaluate(id => { const b = document.querySelector(`button[data-hz-toggle="${id}"]`); if (b) b.click(); }, String(big.id));
  await page.waitForFunction(() => schedSolve && resultsCurrent(), null, { timeout: 120000 });
  const back = await page.evaluate(id => !highAreas().find(h => String(h.z.id) === id).z.omit, String(big.id));
  ok(back, 'Include puts it back');
}

console.log('D. no change either way: the one call the calculator makes');
await typ(139);
await page.waitForFunction(() => schedSolve && resultsCurrent(), null, { timeout: 120000 });
const D = await page.evaluate(() => {
  const k = schedSolve.levels.findIndex(L => L.pour.name === 'Roof'); schedPourIdx = k; renderSchedule();
  const sv = highAreaSavings();
  return { rows: [...document.querySelectorAll('.ha-card .ha-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
           zero: highAreas().filter(H => { const v = sv.get(H.z.id); return v && v.pours.length && v.floors.every(f => f.saved === 0) && !(v.breaks || []).length; }).length };
});
ok(D.zero >= 1, 'a 139 PSF area over a 138 PSF typical changes nothing');
ok(D.rows.some(t => /no change either way — omitting it keeps the pattern simple/.test(t)), 'and the row recommends omitting: ' + JSON.stringify(D.rows[0]));
ok(D.rows.every(t => !/omitted —/.test(t)), 'but it is still counted until he omits it');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

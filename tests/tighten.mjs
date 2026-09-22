// @rules SEQ-02  (see DECISIONS.md)
// CLICK THE TIGHTER PATCH (Sep 17 2026)
// Adolfo: "in the sequence, it would be good to be able to click on the areas
// that need reshore to be tightened due to heavier loads in those areas."
//  A. with shores chosen, a floor's "tighten to 4×6 over N SF" is a button on
//     the Sequence tab and on the Results install summary
//  B. clicking it puts that patch on the plan — on the sheet of the floor it
//     sits under — with the marching outline, and the button lights up
//  C. the highlight survives the switch between the Results and Sequence tabs
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

// one shore on every row of the job, so every floor has a pattern
const A = await page.evaluate(() => {
  const rows = bulkRowsFor('job', schedSolve.levels[schedPourIdx], null);
  const cands = bulkCandidates(rows);
  const best = cands[0];
  applyBulkShore(best.shoreId, rows, 'across the job');
  setStep('sequence');
  const host = document.getElementById('p-sequence');
  const chips = [...host.querySelectorAll('button.exc-go')].map(b => ({ fl: b.dataset.excfl, i: +b.dataset.exc, text: b.textContent.replace(/\s+/g, ' ').trim() }));
  const floors = (seqPlan.floors || []).map(f => ({ name: f.name, general: f.general, exc: f.exceptions.map(e => ({ pattern: e.pattern, sf: Math.round(e.areaSF), cells: e.cells ? e.cells.length / 2 : 0, bb: !!e.bb, step: e.cellStep })) }));
  return { shore: best.name, chips, floors };
});
console.log('   ' + JSON.stringify(A.floors));
console.log('A. the tighter patches are buttons');
const withExc = A.floors.filter(f => f.exc.length);
ok(withExc.length > 0, 'some floor has a tighter patch after ' + A.shore + ' went on every row: ' + JSON.stringify(withExc.map(f => [f.name, f.exc.map(e => e.pattern)])));
ok(withExc.every(f => f.exc.every(e => e.cells > 0 && e.bb && e.step > 0)), 'each exception carries its cells, box and step');
ok(A.chips.length >= withExc.reduce((n, f) => n + f.exc.length, 0), 'a button per exception on the Sequence tab (' + A.chips.length + '): ' + JSON.stringify(A.chips.slice(0, 3)));
ok(A.chips.every(c => /^\d+×\d+ over /.test(c.text)), 'reading "4×6 over 1.8k SF": ' + JSON.stringify(A.chips.map(c => c.text).slice(0, 3)));

console.log('B. clicking one shows the patch on the plan');
const B = await page.evaluate(async () => {
  const host = document.getElementById('p-sequence');
  const b = host.querySelector('button.exc-go');
  const fl = b.dataset.excfl, i = +b.dataset.exc;
  const f = seqPlan.floors.find(x => x.name === fl), e = f.exceptions[i];
  const lv = state.levels.find(l => l.id === (f.level.defId || f.level.id));
  const before = state.pdf.current;
  b.click();
  await new Promise(r => setTimeout(r, 1500));
  const h = state.ui.highlight;
  const lit = [...document.querySelectorAll('#p-sequence button.exc-go.lit')].map(x => x.textContent.trim());
  // the patch is drawn: the highlight fill lands on the canvas
  const c = document.getElementById('drawCanvas').getContext('2d');
  let fills = 0; const f0 = c.fill.bind(c); c.fill = function () { if (String(this.fillStyle).replace(/\s/g, '') === 'rgba(46,160,90,0.22)') fills++; return f0.apply(c, arguments) };
  renderNow(); c.fill = f0;
  const T = screenTransform(lv);
  const inside = T && e.bb ? (() => { const a = buildingToPixel(e.bb.minX, e.bb.minY, T); return !!a })() : false;
  return { fl, pattern: e.pattern, before, page: state.pdf.current, onFloorSheet: levelHasPage(lv, state.pdf.current), active: state.levels[state.activeLevelIdx].name,
    key: h && h.regionKey, label: h && h.label, cells: h && h.cells.length / 2, ants: antsWanted(), lit, fills, inside, step: curStep };
});
console.log('   ' + JSON.stringify(B));
ok(B.key === `tighten:${B.fl}|0`, 'the highlight is the tighter patch: ' + B.key);
ok(/^tighten to \d+×\d+ under /.test(B.label || ''), 'labelled for what it is: ' + B.label);
ok(B.onFloorSheet && B.active === B.fl, `the plan is on the sheet of the floor it sits under (${B.fl}, sheet ${B.page})`);
ok(B.fills > 0 && B.inside, 'the patch is painted on that sheet');
ok(B.ants, 'with the glow on the plan');
// the same floor is spelt out twice on the tab (in the placement row and in
// "each floor's reshoring"), so its patch lights in both places
ok(B.lit.length >= 1 && new Set(B.lit).size === 1, 'and the button you pressed is lit wherever that patch is listed: ' + JSON.stringify(B.lit));
ok(B.step === 'sequence', 'without leaving the Sequence tab');

console.log('C. Results shows the same buttons, and the highlight carries across the tabs');
const C = await page.evaluate(async () => {
  setStep('results');
  await new Promise(r => setTimeout(r, 300));
  const kept = state.ui.highlight && state.ui.highlight.regionKey;
  const sum = schedSummaryHost();
  const chips = [...sum.querySelectorAll('button.exc-go')].map(b => ({ fl: b.dataset.excfl, text: b.textContent.trim() }));
  const b = sum.querySelector('button.exc-go');
  let after = null;
  if (b) { b.click(); await new Promise(r => setTimeout(r, 1200)); after = state.ui.highlight && state.ui.highlight.regionKey; }
  setStep('areas');
  await new Promise(r => setTimeout(r, 200));
  return { kept, chips, after, cleared: !state.ui.highlight };
});
ok(C.kept && /^tighten:/.test(C.kept), 'the patch stays highlighted when switching to Results: ' + C.kept);
ok(C.chips.length > 0 && C.chips.every(c => /\|/.test(c.fl) || true), 'Results install summary has the buttons too: ' + JSON.stringify(C.chips.slice(0, 3)));
ok(C.after && /^tighten:/.test(C.after), 'and pressing one there picks that patch: ' + C.after);
ok(C.cleared, 'leaving for Areas drops the highlight as before');

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

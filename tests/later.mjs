// @rules MDL-07, MDL-09  (see DECISIONS.md)
// TIGHTENED BY A LATER POUR (Kinect, Sep 18 2026)
// Adolfo: "we need something that tells us if the pattern needs to be
// tighter under a floor for another pour in the area." Chose: the floor
// above (a later placement), shown as a WARNING beside this placement's own
// answer in Results and in Sequence, silent until both have a shore chosen,
// and only later pours govern.
//  A. with one shore across the job, the L3 pour is told where the L4 pour
//     needs the reshoring under 2 tighter — chip, strip line, header count
//  B. the L4 pour (nothing later) has no such warning
//  C. silent when the later pour has no shore chosen
//  D. the floor tab legend carries it; Sequence's install note is amber with
//     a show-where button that puts the patch on the plan
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

console.log('A. the L3 pour is told where L4 needs it tighter');
const A = await page.evaluate(() => {
  // one shore on every row of the job
  const rows = bulkRowsFor('job', schedSolve.levels[0], null);
  const best = bulkCandidates(rows)[0];
  const ch = shoreChoices();
  for (const r of rows) if (r.options.some(o => String(o.shoreId) === String(best.shoreId))) ch[r.key] = best.shoreId;
  runSchedule();
  schedPourIdx = schedSolve.levels.findIndex(L => L.pour.name === '3');
  state.ui.highlight = null; state.ui.resultsFloor = null; renderSchedule();
  const L = schedSolve.levels[schedPourIdx];
  const items = laterItems(L);
  const it = items[0];
  let card = null, chip = null, line = null;
  if (it) {
    openCards.add(cardKey(L, it.r)); renderSchedule();
    card = document.querySelector(`#schedBody .sched-region[data-card="${cardKey(L, it.r)}"]`);
    chip = [...card.querySelectorAll('.pat-chip.later')].map(c => c.textContent.trim());
    line = (card.querySelector('.ra-later') || {}).textContent;
  }
  return { shore: best.name, n: items.length, later: laterPlacements(L).map(x => x.pour.name),
    it: it && { region: regionLabel(it.r, it.ri, L), floor: it.st.level.name, own: it.st.chosen.pattern, needs: it.g.pattern, pour: it.g.pour, sf: Math.round(it.g.sf), whole: it.g.whole,
      tighter: patternArea(it.g.pattern) < patternArea(it.st.chosen.pattern) },
    chip, line, count: (document.getElementById('rsLaterNext') || {}).textContent || null, showBtn: !!(card && card.querySelector('button[data-later]')) };
});
console.log('   ' + JSON.stringify({ shore: A.shore, n: A.n, later: A.later, it: A.it, count: A.count }));
ok(A.later.join() === '4', 'the only pour later than L3 is L4: ' + JSON.stringify(A.later));
ok(A.n > 0 && A.it && A.it.pour === '4' && A.it.tighter, 'somewhere under a floor L4 needs a tighter pattern than L3 does: ' + JSON.stringify(A.it));
ok(A.chip && A.chip.some(t => new RegExp('↑' + A.it.needs + ' L4').test(t)), 'the chip carries ↑<pattern> L4: ' + JSON.stringify(A.chip));
ok(A.line && new RegExp(A.it.needs + ' goes in here').test(A.line) && /L4 placement/.test(A.line), 'the strip says what goes in and why: ' + A.line);
ok(A.showBtn, 'with a show / show where button');
ok(A.count && /\d+ rows? tightened by a later pour/.test(A.count), 'the summary header counts them: ' + A.count);

console.log('B. nothing later than the L4 pour');
const B = await page.evaluate(() => {
  const L = schedSolve.levels.find(x => x.pour.name === '4');
  return { later: laterPlacements(L).length, items: laterItems(L).length };
});
ok(B.later === 0 && B.items === 0, 'the L4 pour has no later placement and no warning: ' + JSON.stringify(B));

console.log('C. silent until the later pour has shores');
const C = await page.evaluate(() => {
  const L4 = schedSolve.levels.find(x => x.pour.name === '4');
  const ch = shoreChoices();
  const keys = bulkRowsFor('pour', L4, null).map(r => r.key);
  const saved = {}; for (const k of keys) { saved[k] = ch[k]; delete ch[k]; }
  runSchedule();
  const L3 = schedSolve.levels.find(x => x.pour.name === '3');
  const n = laterItems(L3).length;
  const count = (document.getElementById('rsLaterNext') || {}).textContent || null;
  for (const k of keys) if (saved[k]) ch[k] = saved[k];
  runSchedule();
  return { n, count, back: laterItems(schedSolve.levels.find(x => x.pour.name === '3')).length };
});
ok(C.n === 0 && !C.count, 'with L4\'s shores cleared the L3 pour says nothing: ' + JSON.stringify(C));
ok(C.back > 0, 'and says it again once they are back');

console.log('D. floor tab legend, and the Sequence note');
const D = await page.evaluate(async () => {
  const L = schedSolve.levels.find(x => x.pour.name === '3'); schedPourIdx = schedSolve.levels.indexOf(L);
  const it = laterItems(L)[0];
  const f = resultsTabFloors(L).find(x => x.name === it.st.level.name && regionOnFloorTab(it.r, x, L));
  document.querySelector(`.rs-tab[data-rsf="${f.key}"]`).click();
  await new Promise(r => setTimeout(r, 1500));
  const lg = [...document.querySelectorAll('.rs-legend .lg-item')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
  document.querySelector('.rs-tab[data-rsf=""]').click();
  await new Promise(r => setTimeout(r, 400));
  setStep('sequence');
  await new Promise(r => setTimeout(r, 600));
  const host = document.getElementById('p-sequence');
  const notes = [...host.querySelectorAll('.seq-note.seq-later')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
  const btn = host.querySelector('button[data-seqlater]');
  let after = null;
  if (btn) { btn.click(); await new Promise(r => setTimeout(r, 1500)); after = { key: state.ui.highlight && state.ui.highlight.regionKey, label: state.ui.highlight && state.ui.highlight.label, ants: antsWanted(), step: curStep }; }
  return { lg, notes, after };
});
ok(D.lg.some(t => /tightened by a later pour/.test(t)), 'the floor tab legend lists the ground a later pour governs: ' + JSON.stringify(D.lg));
ok(D.notes.length > 0 && D.notes.some(t => /placement governs over/.test(t)), 'Sequence install notes say who governs and over how much: ' + JSON.stringify(D.notes.slice(0, 2)));
ok(D.after && /^later:/.test(D.after.key) && D.after.ants && D.after.step === 'sequence', 'show where puts the patch on the plan without leaving Sequence: ' + JSON.stringify(D.after));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

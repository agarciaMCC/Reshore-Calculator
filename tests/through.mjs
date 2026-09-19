// A SHORE THROUGH AN OPEN FLOOR (Kinect L4 pour, Sep 18 2026)
// Adolfo, on "11" Slab – L3 39 PSF – L2 opening – 1B SOG": "this incorrectly
// assumes that there is slab beneath L3 when there is an opening at L2
// directly beneath." Chose: keep the shore running through to the next slab
// but flag it — height, what it passes, what it stands on — and accept it
// per row; the acceptance is saved with the job.
//  A. the row under 3 is a through-shore: flagged, with its height and support
//  B. the chip and the summary count carry the flag; the floor tab outlines it
//  C. OK accepts it (row, chip, count), recheck brings it back; it is in the save
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';
import fs from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
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

console.log('A. the row under 3 over the L2 opening');
const A = await page.evaluate(() => {
  schedPourIdx = schedSolve.levels.findIndex(L => L.pour.name === '4');
  state.project.throughOk = {}; state.ui.highlight = null; renderSchedule();
  const L = schedSolve.levels[schedPourIdx];
  const items = throughItems(L);
  const it = items.find(x => !x.beam && x.st.level.name === '3' && x.r.steps.some(s => s.level.name === '2' && s.open && !s.noSlab));
  if (!it) return { items: items.length };
  const ck = cardKey(L, it.r); openCards.add(ck); renderSchedule();
  const card = document.querySelector(`#schedBody .sched-region[data-card="${ck}"]`);
  const row = [...card.querySelectorAll('.ra-row')].find(el => /under\s*3/.test(el.textContent));
  return { items: items.length, name: regionLabel(it.r, it.ri, L), key: it.key, h: feetToStr(it.st.shoreHeightFt), support: it.st.supportLevel.name, passed: throughPassed(it.r, it.st),
    rowFlag: row.classList.contains('thru'), thruText: (row.querySelector('.ra-thru') || {}).textContent, okBtn: !!row.querySelector('button[data-thru][data-thru-on="1"]'),
    chip: [...card.querySelectorAll('.pat-chip')].map(c => ({ text: c.textContent.trim(), thru: c.classList.contains('thru') })),
    count: (document.getElementById('rsThruNext') || {}).textContent || null, ck };
});
console.log('   ' + JSON.stringify({ name: A.name, h: A.h, support: A.support, passed: A.passed, count: A.count }));
ok(A.items > 0 && A.name, 'the L4 pour has a shore that passes through an open floor: ' + A.items + ' · ' + A.name);
ok(A.support === '1B' && A.passed.join() === '2', `it stands on 1B through Level 2: ${A.support} via ${A.passed}`);
ok(A.rowFlag && /through-shore/.test(A.thruText || '') && new RegExp(A.h.replace(/[-'"]/g, '.')).test(A.thruText) && /stands on 1B/.test(A.thruText), 'the row under 3 is flagged with its height, what it passes and what it stands on: ' + A.thruText);
ok(A.okBtn, 'and offers OK — shore through');

console.log('B. chip, count, plan');
ok(A.chip.some(c => c.thru && /↓1B/.test(c.text)), 'the card\'s chip for floor 3 carries the flag and ↓1B: ' + JSON.stringify(A.chip));
ok(A.count && /\d+ through-shores? to check/.test(A.count), 'the summary counts them: ' + A.count);
const Bp = await page.evaluate(async () => {
  const L = schedSolve.levels[schedPourIdx];
  const f = resultsTabFloors(L).find(x => x.name === '3');
  if (!f) return { tab: false };
  document.querySelector(`.rs-tab[data-rsf="${f.key}"]`).click();
  await new Promise(r => setTimeout(r, 1500));
  const c = document.getElementById('drawCanvas').getContext('2d');
  const strokes = []; const s0 = c.stroke.bind(c);
  c.stroke = function () { strokes.push(String(this.strokeStyle).replace(/\s/g, '')); return s0.apply(c, arguments) };
  renderNow(); c.stroke = s0;
  document.querySelector('.rs-tab[data-rsf=""]').click();
  await new Promise(r => setTimeout(r, 600));
  return { tab: true, red: strokes.filter(x => /207,10,44/.test(x)).length };
});
ok(!Bp.tab || Bp.red > 0, 'on the floor-3 tab the through-shore patch gets the red dashed outline: ' + JSON.stringify(Bp));

console.log('C. OK, recheck, saved');
const C = await page.evaluate(async () => {
  const L = schedSolve.levels[schedPourIdx];
  const ck = openCards.values().next().value;
  openCards.add(ck); renderSchedule();
  const it = throughItems(L).find(x => !x.accepted);
  const key = it.key;
  const btn = document.querySelector(`button[data-thru="${key}"][data-thru-on="1"]`);
  btn.click();
  await new Promise(r => setTimeout(r, 200));
  const after = throughItems(schedSolve.levels[schedPourIdx]).find(x => x.key === key);
  const card = document.querySelector(`#schedBody .sched-region[data-card="${cardKey(L, it.r)}"]`);
  const row = [...card.querySelectorAll('.ra-row')].find(el => /under\s*3/.test(el.textContent));
  const okRow = row && !row.classList.contains('thru') && /✓/.test((row.querySelector('.ra-thru') || {}).textContent || '');
  const chipOk = ![...card.querySelectorAll('.pat-chip')].some(c => c.classList.contains('thru')) && [...card.querySelectorAll('.pat-chip')].some(c => /↓1B/.test(c.textContent));
  const saved = !!JSON.parse(JSON.stringify(serializeDoc())).project.throughOk[key];
  const countBefore = (document.getElementById('rsThruNext') || {}).textContent || '';
  const undo = document.querySelector(`button[data-thru="${key}"][data-thru-on="0"]`);
  undo.click();
  await new Promise(r => setTimeout(r, 200));
  const back = throughItems(schedSolve.levels[schedPourIdx]).find(x => x.key === key);
  return { accepted: after && after.accepted, okRow, chipOk, saved, countBefore, back: back && !back.accepted, stillSaved: !!(state.project.throughOk || {})[key] };
});
ok(C.accepted && C.okRow, 'OK accepts it: the row goes quiet with a tick');
ok(C.chipOk, 'the chip drops the flag but keeps ↓1B so the through-shore is still legible');
ok(C.saved, 'the acceptance is saved with the job');
ok(C.back && !C.stillSaved, 'recheck takes it back');

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

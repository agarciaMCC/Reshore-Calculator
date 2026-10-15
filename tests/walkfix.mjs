// @rules UI-38, LOD-01, LOD-10, ARE-21, ARE-25, RES-02, RES-17, JOB-04, UI-18, ARE-13, RES-07, RES-11, PRT-01, MDL-04, BLD-04, UI-32, UI-02, UI-29, ARE-03, MDL-14, JOB-02, UI-24, UI-26, BLD-19, UI-35  (see DECISIONS.md)
// THE BOTHELL WALKTHROUGH (Oct 15 2026). An estimator's walk of the 1175
// Bothell Stem 4 job through all four steps found places where the app said
// one thing and showed another, or dropped work without a word. Each section
// opens the real job with its drawing set and checks one of them.
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
const job = fs.readFileSync(path.resolve(here, '..', '1175_Bothell_Stem_4.reshore.json'), 'utf8');
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'test-set.pdf')).toString('base64');
const wait = ms => new Promise(r => setTimeout(r, ms));

// a fresh page with the job and its drawing set open, as File → Open does it
async function openJob() {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
  await page.waitForFunction(() => typeof solveAll === 'function');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.evaluate(async ([j, p]) => {
    applyOpenedJob(JSON.parse(j), '1175_Bothell_Stem_4.reshore.json');
    const bin = atob(p); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    await loadFile(new File([u8], 'test-set.pdf', { type: 'application/pdf' }));
  }, [job, pdf]);
  await wait(1500);
  return page;
}
// the Roof beam the sheet labels 22X17 BM (the job now carries that size)
const sizeTheBeam = p => p.evaluate(() => { state.levels.find(l => l.name === 'Roof').slabZones.find(z => z.id === 'n8szuvzj').depthIn = 17; });
const toResults = async p => { await p.evaluate(() => { setStep('loads'); setStep('results'); }); await wait(2500); };

console.log('A. Loads shows the marks the job holds (UI-38, LOD-01)');
{
  const page = await openJob();
  const A = await page.evaluate(async () => {
    setStep('loads'); await new Promise(r => setTimeout(r, 400));
    const vis = sel => { const e = document.querySelector(sel); return !!e && e.offsetParent !== null; };
    return {
      shape: scheduleShape(),
      llRows: document.querySelectorAll('#lmSplit [data-li]').length,
      sdlRows: document.querySelectorAll('#lmSplit [data-si]').length,
      combinedShown: vis('#lmCombined'),
      noteCombined: vis('#lmNoteCombined'), noteSplit: vis('#lmNoteSplit'),
      switchOffered: !!document.getElementById('lsCombined') || !!document.getElementById('lsSplit'),
      text: document.getElementById('p-loads').innerText,
    };
  });
  ok(A.shape === 'split', 'the job holds split schedules: ' + A.shape);
  ok(A.llRows === 7 && A.sdlRows === 5, 'all 7 live-load and 5 dead-load marks are rows on arrival: ' + [A.llRows, A.sdlRows]);
  ok(!A.combinedShown, 'no empty combined-chart head over nothing');
  ok(A.noteSplit && !A.noteCombined, 'only the split chart\'s note shows');
  ok(!A.switchOffered && !/Switching is possible while the chart is empty/.test(A.text), 'a chart in use is not offered a shape switch');
  await page.close();
}

console.log('B. a beam with no depth is a check and holds Results (ARE-21, ARE-25)');
{
  const page = await openJob();
  const B = await page.evaluate(async () => {
    const roof = state.levels.find(l => l.name === 'Roof');
    // as the walkthrough found it: traced 23.3" wide, no depth read
    const z = roof.slabZones.find(z => z.id === 'n8szuvzj'); z.widthIn = 23.3; delete z.depthIn;
    setStep('areas'); state.activeLevelIdx = state.levels.indexOf(roof); goToPage(6); setLayer('slab'); renderSidebar();
    await new Promise(r => setTimeout(r, 600)); renderSidebar();
    return { checks: adChecks(roof).map(c => c.text), ready: [...document.querySelectorAll('.ad-ready')].map(e => e.innerText).join(' '),
             gate: stepBlockers('results').map(b => b.label), undef: document.getElementById('sidebar') ? /×undefined/.test(document.body.innerText) : false };
  });
  ok(B.checks.some(t => /no depth read/.test(t)), 'the checks name the beam with no depth: ' + JSON.stringify(B.checks));
  ok(!/nothing left to verify/.test(B.ready), 'and do not say "nothing left to verify": ' + B.ready);
  ok(!B.undef, 'nothing on screen reads "×undefined"');
  ok(B.gate.some(l => /size for 1 beam/.test(l)), 'Results is held until it has a size: ' + JSON.stringify(B.gate));
  await sizeTheBeam(page);
  ok(!(await page.evaluate(() => stepBlockers('results').map(b => b.label))).some(l => /beam/.test(l)), 'a size clears the hold');
  await page.close();
}

console.log('C. a floor with no capacity holds Results; the warning names a real step (LOD-10)');
{
  const page = await openJob();
  await sizeTheBeam(page);
  const C = await page.evaluate(() => {
    const l2 = state.levels.find(l => l.name === '2');
    l2.defLL = null; l2.defSDL = null; l2.defMark = null; l2.defaultCapacity = 0;
    return stepBlockers('results').map(b => b.step + ':' + b.label);
  });
  ok(C.some(l => /^loads:.*capacity on 2/.test(l)), 'Results waits for floor 2\'s capacity, on Loads: ' + JSON.stringify(C));
  const src = fs.readFileSync(path.resolve(here, '..', 'reshore-calc.html'), 'utf8');
  ok(!/in step 5/.test(src), 'no warning sends the estimator to a fifth step');
  await page.close();
}

console.log('D. picks follow their rows and are never dropped without a word (RES-17, JOB-04)');
{
  const page = await openJob();
  await sizeTheBeam(page);
  await toResults(page);
  const D = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const head = () => document.getElementById('schedHead').innerText;
    const a = { todo: outstandingPickTotal(), loss: !!pickLoss, head: head() };
    const l2 = state.levels.find(l => l.name === '2'); const old = l2.defLL;
    l2.defLL = 'C'; invalidateCalculatedResults('test'); setStep('loads'); setStep('results'); await wait(2500);
    // the notice survives leaving and coming back
    setStep('loads'); setStep('results'); await wait(1500);
    const b = { todo: outstandingPickTotal(), n: pickLoss && pickLoss.n, head: head() };
    l2.defLL = old; invalidateCalculatedResults('test'); setStep('loads'); setStep('results'); await wait(2500);
    const c = { todo: outstandingPickTotal(), loss: !!pickLoss };
    return { a, b, c };
  });
  ok(!D.a.loss && !/no longer match/.test(D.a.head), 'the opened job keeps its picks: no loss to report');
  ok(D.b.todo > D.a.todo && D.b.n > 0, 'changing floor 2\'s typical mark puts rows back to choose: ' + [D.a.todo, D.b.todo]);
  ok(/shore picks? made earlier no longer match/.test(D.b.head), 'and Results says so, in its head: ' + D.b.head.slice(0, 300));
  ok(D.c.todo === D.a.todo && !D.c.loss, 'putting the mark back brings the picks back and clears the note');

  // a pick saved under a row's older, shorter name follows the row
  const E = await page.evaluate(async () => {
    const ch = shoreChoices();
    const row = pickRows(schedSolve).find(r => r.chosen && !r.beam && /\|grade\|1$/.test(r.key));
    const v = ch[row.key]; delete ch[row.key];
    const oldKey = row.key.replace('|grade|1', '|1'); ch[oldKey] = v;
    invalidateCalculatedResults('test'); setStep('loads'); setStep('results'); await new Promise(r => setTimeout(r, 2500));
    return { back: shoreChoices()[row.key] === v, loss: !!pickLoss };
  });
  ok(E.back && !E.loss, 'a pick saved before the key grew is re-attached to its row');
  await page.close();
}

console.log('E. Next pick stays the way forward across placements (RES-02, UI-18)');
{
  const page = await openJob();
  await sizeTheBeam(page);
  await toResults(page);
  const F = await page.evaluate(async () => {
    // answer every row on the Roof placement, leave the others
    const roofIdx = schedSolve.levels.findIndex(L => L.pour.name === 'Roof');
    const ch = shoreChoices();
    for (const it of outstandingItems(schedSolve.levels[roofIdx])) {
      const row = pickRows(schedSolve).find(r => r.key === it.key); ch[it.key] = row.opts[0].shoreId;
    }
    invalidateCalculatedResults('test'); setStep('loads'); setStep('results'); await new Promise(r => setTimeout(r, 2500));
    schedPourIdx = schedSolve.levels.findIndex(L => L.pour.name === 'Roof'); renderSchedule();
    const btn = document.getElementById('rsNextPour');
    const r = { here: outstandingItems(schedSolve.levels[schedPourIdx]).length, total: outstandingPickTotal(), btn: btn && btn.textContent };
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 300));
    r.after = schedSolve.levels[schedPourIdx].pour.name;
    return r;
  });
  ok(F.here === 0 && F.total > 0, 'the Roof placement is done, others are not: ' + [F.here, F.total]);
  ok(F.btn && /Next pick: L?\w+ placement/.test(F.btn), 'Next pick still shows, naming where the next pick is: ' + F.btn);
  ok(F.after !== 'Roof', 'and goes there: ' + F.after);

  const G = await page.evaluate(() => {
    let msg = ''; const t = window.toast; window.toast = m => { msg = m; };
    const L = schedSolve.levels[schedPourIdx];
    const rows = bulkRowsFor('job', L);
    const c = bulkCandidates(rows).find(c => c.fits < rows.length);
    applyBulkShore(c.shoreId, rows, 'on every placement');
    window.toast = t;
    return { msg, todo: outstandingPickTotal() };
  });
  ok(!/left alone/.test(G.msg) && /it does not reach/.test(G.msg), 'bulk apply says what it did not reach: ' + G.msg);
  const m = G.msg.match(/(\d+) still to choose/);
  ok(m ? +m[1] === G.todo : G.todo === 0, 'and its "still to choose" agrees with the count: ' + G.msg + ' / ' + G.todo);
  await page.close();
}

console.log('F. Results says what it means (ARE-13, RES-07, RES-11, MDL-04)');
{
  const page = await openJob();
  await toResults(page);
  const F = await page.evaluate(async () => {
    const at = name => { schedPourIdx = schedSolve.levels.findIndex(L => L.pour.name === name); state.ui.resultsFloor = null; renderSchedule(); };
    at('Roof');
    const pane = () => document.getElementById('schedHead').parentElement.innerText;
    const roof = { head: document.getElementById('schedHead').innerText, body: pane(),
      tabs: [...document.querySelectorAll('.rs-tab')].map(t => t.textContent.replace(/\s+/g, ' ').trim()) };
    at('3');
    const l3 = { head: document.getElementById('schedHead').innerText };
    return { roof, l3, src: document.body.innerText };
  });
  ok(/partly on grade/.test(F.roof.body), 'floor 1 reads partly on grade, not on grade whole');
  ok(/over openings on every floor down to L1, on grade: no reshores there/.test(F.roof.head), 'roof slab over openings down to grade is named: ' + F.roof.head.slice(0, 400));
  ok(F.roof.tabs.slice(1).every(t => /^Under \d+/.test(t)) && F.roof.tabs.some(t => /\d+ to pick$/.test(t)), 'tab badges read "N to pick": ' + JSON.stringify(F.roof.tabs));
  ok(!/add the floors below/.test(F.l3.head) && /down to grade, so nothing below can take its load/.test(F.l3.head), 'a stack already on grade is not told to add floors: ' + F.l3.head.slice(0, 300));
  ok(!/t\.b\.c\.|legal\) —|spacing waits on a shore/.test(F.src), 'no "t.b.c.", "legal" or "waits on a shore" on screen');
  await page.close();
}

console.log('G. print the whole job, under its name (PRT-01)');
{
  const page = await openJob();
  await toResults(page);
  const G = await page.evaluate(() => {
    const grab = all => {
      let html = '';
      const w = { document: { write: s => { html += s; }, close() {}, querySelector: () => null, querySelectorAll: () => [] }, print() {} };
      const real = window.openPrintWindow; window.openPrintWindow = () => w;
      try { printSchedule(all); } finally { window.openPrintWindow = real; }
      return html;
    };
    const html = grab(true), one = grab();
    return { name: state.project.name, field: document.getElementById('projectName').value,
             sections: (html.match(/class="pour-sec/g) || []).length, pours: schedSolve.levels.length,
             head: /all placements/.test(html), named: html.includes(state.project.name),
             oneSections: (one.match(/class="pour-sec/g) || []).length, btn: !!document.getElementById('schedPrintAll') };
  });
  ok(G.name === '1175 Bothell Stem 4' && G.field === G.name, 'a job saved without a name takes its file\'s: ' + G.name);
  ok(G.btn && G.sections === G.pours && G.head && G.named, 'Print all puts every placement in one document under the job name: ' + [G.sections, G.pours]);
  ok(G.oneSections === 0, 'Print still prints the one on screen');
  await page.close();
}

console.log('H. Building and Areas say where you are and do not ask twice (BLD-04, UI-32, UI-02, UI-29, ARE-03, MDL-14, JOB-02)');
{
  const page = await openJob();
  const H = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); const o = {};
    await w(800);
    o.skipped = skippedPages().slice();
    // an unread sheet: no floor pre-picked, "Not a floor plan" is the obvious button
    setSheetLevel(7, ''); goToPage(7); await w(400);
    o.picker = document.getElementById('pageLevel').selectedOptions[0].text;
    o.barPrimary = (document.querySelector('#pageBar .btn-primary') || {}).textContent;
    o.barSel = document.getElementById('pageBarSel') && document.getElementById('pageBarSel').value;
    setStep('sheets'); await w(200);
    o.markBtn = !!document.getElementById('stSkipOpen');
    document.getElementById('stSkipOpen').click(); await w(200);
    o.picker2 = document.getElementById('pageLevel').selectedOptions[0].text;
    const nb = document.querySelector('.step-panel[data-step="sheets"] .sec-next .sn-btn');
    o.sheetsNext = nb && nb.textContent;
    // arriving on Floor edge and Areas from a non-plan sheet opens a plan
    goToPage(1); await w(300); setStep('edge'); await w(900); o.edgePage = state.pdf.current;
    goToPage(1); await w(300); setStep('areas'); await w(900); o.areasPage = state.pdf.current;
    o.floorHead = (document.querySelector('.sb-floor-head') || {}).innerText;
    // the Roof (top floor) on the Loading tab
    state.activeLevelIdx = 0; goToPage(6); await w(400); setLayer('loading'); renderSidebar(); renderAreasPrimary(); await w(200);
    o.roofTyp = (document.querySelector('.typ-row') || {}).innerText;
    o.roofCard = (document.getElementById('areasPrimary') || {}).innerText;
    // Levels: in part, order kept, Ctrl+Z from a clean field
    setStep('levels'); await w(300);
    o.inPart = /slab on grade in part/.test(document.getElementById('p-levels').innerText);
    const two = state.levels.find(l => l.name === '2'); const before = state.levels.map(l => l.name).join();
    history.record('Clear elevation'); two.elevation = null; sortLevelsByElevation(); renderLevelList();
    o.order = [before, state.levels.map(l => l.name).join()];
    const inp = document.querySelector('#p-levels input'); inp.focus();
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await w(200);
    o.undone = state.levels.find(l => l.name === '2').elevation != null;
    o.scale = (document.querySelector('.mp-name') || {}).innerText || '';
    o.pillShrink = (() => { const p = document.querySelector('.step-foot .sf-now .pill'); return p ? getComputedStyle(p).flexShrink : '0'; })();
    o.toasts = [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ');
    return o;
  });
  ok([10, 11].every(p => H.skipped.includes(p)), 'sheets titled as elevations and sections are marked not a floor plan on opening: ' + H.skipped);
  ok(H.picker === '— not assigned —', 'the picker under the plan says "not assigned", as the table does: ' + H.picker);
  ok(H.barPrimary === 'Not a floor plan' && H.barSel === '', 'an unread sheet gets no floor pre-picked; "Not a floor plan" is the primary: ' + H.barPrimary);
  ok(H.markBtn && H.picker2 === 'not a floor plan', 'one click marks the unplaced sheets, and the picker follows: ' + H.picker2);
  ok(/Next: Loads/.test(H.sheetsNext || ''), 'with Floor edge and Match floors done, Sheets leads straight to Loads: ' + H.sheetsNext);
  ok(H.edgePage !== 1 && H.areasPage !== 1, 'Floor edge and Areas open a plan sheet, not the load map: ' + [H.edgePage, H.areasPage]);
  ok(/^Floor \S+ · sheet \d+/.test(H.floorHead || ''), 'the Areas list names its floor and sheet: ' + H.floorHead);
  ok(/not needed/.test(H.roofTyp || '') && !/not set/.test(H.roofTyp || ''), 'the top floor\'s typical capacity reads "not needed": ' + H.roofTyp);
  ok(/top floor/.test(H.roofCard || '') && /anyway/.test(H.roofCard || ''), 'and its load map is not pressed as a job to review: ' + H.roofCard);
  ok(H.inPart, 'floor 1, with an on-grade area drawn, reads "in part" on Levels');
  ok(H.order[0] === H.order[1], 'clearing an elevation keeps the row in place: ' + H.order.join(' / '));
  ok(H.undone, 'Ctrl+Z in a field with nothing typed undoes the clear');
  ok(!/1" = 10' 1" = 10'/.test(H.scale), 'the plan scale is said once: ' + H.scale);
  ok(H.pillShrink === '0', 'the status pill in the foot is never squeezed');
  ok(!/Snap geometry ready/.test(H.toasts), 'no technical pop-ups');
  await page.close();
}
{
  const src = fs.readFileSync(path.resolve(here, '..', 'reshore-calc.html'), 'utf8');
  ok(/now open its drawing set/.test(src) && /state\.project\.drawingSet=file\.name/.test(src), 'opening a job names the drawing set it was built on (JOB-02)');
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

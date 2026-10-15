// @rules UI-38, LOD-01, LOD-10, ARE-21, ARE-25, RES-02, RES-17, JOB-04, UI-18  (see DECISIONS.md)
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

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

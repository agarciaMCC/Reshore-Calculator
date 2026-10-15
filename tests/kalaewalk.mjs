// @rules UI-02, UI-18, RES-01, RES-17, RES-18, JOB-04  (see DECISIONS.md)
// THE KALAE WALKTHROUGH (Oct 15 2026). An estimator's walk of the 1268 Kalae
// job (42 levels, 27 marks, 41 placements) through all four steps found the
// places where the app and the saved job disagreed, where a key did more than
// it said, and where the same count read three ways. Each section opens the
// real job with its 42-page set and checks one of them.
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
const job = fs.readFileSync(path.resolve(here, '..', 'Revit export', '1268_KALAE.reshore.json'), 'utf8');
const pdf = fs.readFileSync(path.resolve(here, '..', 'Revit export', '1268_KALAE-revit-plans.pdf')).toString('base64');
const wait = ms => new Promise(r => setTimeout(r, ms));

// a fresh page with the job and its drawing set open, as File → Open does it.
// `dlg` records every confirm() the app raises; set dlg.dismiss to answer No.
async function openJob(dlg = {}) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
  page.on('dialog', d => { dlg.last = d.message(); dlg.all = (dlg.all || []).concat(d.message()); dlg.dismiss ? d.dismiss() : d.accept(); });
  await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
  await page.waitForFunction(() => typeof solveAll === 'function');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.evaluate(async ([j, p]) => {
    window.__solves = 0; const real = solveAll; window.solveAll = o => { window.__solves++; return real(o); };
    applyOpenedJob(JSON.parse(j), '1268_KALAE.reshore.json');
    const bin = atob(p); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    await loadFile(new File([u8], '1268_KALAE-revit-plans.pdf', { type: 'application/pdf' }));
  }, [job, pdf]);
  await wait(1500);
  return page;
}
const toResults = async p => { await p.evaluate(() => { setStep('loads'); setStep('results'); }); await wait(600); };
// the three places the "still to choose" count is written
const counts = p => p.evaluate(() => {
  const txt = el => (el ? el.innerText : '');
  const rail = txt(document.getElementById('stepRail')).match(/(\d+) shores? to choose/);
  const head = txt(document.getElementById('schedSummary')).match(/(\d+) shore picks? outstanding/);
  const strip = txt(document.getElementById('schedSummary')).match(/(\d+) shore picks? to make/);
  const tabs = [...document.querySelectorAll('.rs-tab-pend')].map(e => +e.innerText.match(/\d+/)[0]).reduce((a, b) => a + b, 0);
  const noReach = [...document.querySelectorAll('.rs-tab-warn')].map(e => e.innerText);
  const L = schedSolve.levels[schedPourIdx];
  return { rail: rail ? +rail[1] : 0, head: head ? +head[1] : 0, strip: strip ? +strip[1] : 0, tabs, noReach,
           items: outstandingItems(L).length, total: outstandingPickTotal(), pour: L.pour.name,
           beamNoReach: (L.solve.beams || []).reduce((n, b) => n + b.rows.filter(r => r.beamKey && r.beamNet > 0 && !r.beamChosen && !(r.options && r.options.length)).length, 0) };
});

console.log('A. Undoing "Open job" asks first (UI-02)');
{
  const dlg = { dismiss: true };
  const page = await openJob(dlg);
  await page.evaluate(() => setStep('sheets'));
  await page.keyboard.press('Control+z');
  await wait(300);
  const A = await page.evaluate(() => ({ n: state.levels.length, name: state.project.name, canUndo: history.canUndo() }));
  ok(/Undo "Open job"/.test(dlg.last || ''), 'Ctrl+Z on a freshly opened job asks before taking it away: ' + (dlg.last || '').slice(0, 80));
  ok(/42 levels/.test(dlg.last || '') && /1268 KALAE/.test(dlg.last || ''), 'the question names the job and its 42 levels');
  ok(A.n === 42 && A.name === '1268 KALAE' && A.canUndo, 'answering No keeps the job on screen with its undo step: ' + [A.n, A.name]);
  dlg.dismiss = false;
  await page.keyboard.press('Control+z');
  await wait(300);
  const A2 = await page.evaluate(() => state.levels.length);
  ok(A2 === 0, 'answering Yes undoes the open: ' + A2 + ' levels');
  await page.keyboard.press('Control+y');
  await wait(300);
  ok(await page.evaluate(() => state.levels.length) === 42, 'Redo brings the job back');
  await page.close();
}

console.log('B. Results follows an undone pick (UI-02, UI-18)');
{
  const page = await openJob();
  await toResults(page);
  const before = await counts(page);
  ok(before.items > 0, `the ${before.pour} placement has picks to make: ` + before.items);
  // bulk-apply the shore that fits most rows on this placement
  const B = await page.evaluate(() => {
    const sel = document.getElementById('rsBulkShore'); sel.value = sel.options[1].value;
    document.getElementById('rsBulkScope').value = 'pour';
    document.getElementById('rsBulkGo').click();
    return { label: sel.options[1].text };
  });
  await wait(600);
  const applied = await counts(page);
  ok(applied.items < before.items, 'the bulk apply answered rows: ' + before.items + ' → ' + applied.items);
  const toasts = [];
  await page.exposeFunction('__t', m => toasts.push(m));
  await page.evaluate(() => { const h = document.getElementById('toastHost'); new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__t(n.textContent)))).observe(h, { childList: true }); });
  await page.keyboard.press('Control+z');
  await wait(800);
  const undone = await counts(page);
  const file = await page.evaluate(() => Object.keys(shoreChoices()).filter(k => !/(\|W|N)$/.test(k)).length);
  ok(undone.items === before.items, 'after Ctrl+Z the rows ask again on screen: ' + undone.items + ' (was ' + before.items + ')');
  ok(undone.rail === before.rail && undone.strip === before.strip, 'the rail and the strip went back with them: ' + [undone.rail, undone.strip]);
  ok(toasts.some(t => /^Undo: Apply shore on /.test(t)), 'the undo toast reads "Undo: Apply shore on <pour>": ' + toasts.join(' | '));
  await page.keyboard.press('Control+y');
  await wait(800);
  const redone = await counts(page);
  ok(redone.items === applied.items, 'Redo puts the picks back on screen: ' + redone.items);
  await page.close();
}

console.log('C. A current solve is shown, not run again (RES-18)');
{
  const page = await openJob();
  await toResults(page);
  const n1 = await page.evaluate(() => window.__solves);
  await page.evaluate(() => { setStep('sequence'); });
  await wait(300);
  await page.evaluate(() => { setStep('results'); });
  await wait(300);
  await page.evaluate(() => { setStep('areas'); });
  await wait(300);
  await page.evaluate(() => { setStep('results'); });
  await wait(300);
  const n2 = await page.evaluate(() => window.__solves);
  ok(n1 >= 1 && n2 === n1, 'leaving and returning with nothing changed solves nothing again: ' + [n1, n2]);
  const shown = await page.evaluate(() => !!document.querySelector('#schedSummary .inst-list'));
  ok(shown, 'the schedule is on screen on return');
  // an input change still clears it and asks for a recalculation
  await page.evaluate(() => { state.levels[3].slabThickness += 1; persist(); });
  await page.evaluate(() => { setStep('loads'); setStep('results'); });
  await wait(300);
  const n3 = await page.evaluate(() => window.__solves);
  ok(n3 === n2 + 1, 'a changed input solves again on return: ' + [n2, n3]);
  await page.close();
}

console.log('D. One count everywhere (UI-18)');
{
  const page = await openJob();
  await toResults(page);
  // the ELEV MECH RM placement has beam rows nothing in the catalog reaches
  const D = await page.evaluate(() => {
    const i = schedSolve.levels.findIndex(L => /ELEV MECH/i.test(L.pour.name));
    if (i >= 0) { schedPourIdx = i; renderSchedule(); }
    return i;
  });
  await wait(300);
  const c = await counts(page);
  ok(D >= 0, 'the ELEV MECH RM placement is in the job: ' + D);
  ok(c.beamNoReach > 0, 'it has beam rows nothing reaches: ' + c.beamNoReach);
  ok(c.strip === c.items && c.head === c.items && c.tabs === c.items, `head (${c.head}), strip (${c.strip}) and tabs (${c.tabs}) all say ${c.items}`);
  ok(c.rail === c.total, `the rail says the job total (${c.rail} = ${c.total})`);
  ok(c.noReach.every(t => /nothing reaches/.test(t)), 'the tab marks a row nothing reaches in words: ' + c.noReach.join(' | '));
  await page.close();
}

console.log('E. "On every placement" asks first (UI-18, RES-01)');
{
  const dlg = { dismiss: true };
  const page = await openJob(dlg);
  await toResults(page);
  const before = await page.evaluate(() => outstandingPickTotal());
  await page.evaluate(() => {
    const sel = document.getElementById('rsBulkShore'); sel.value = sel.options[1].value;
    document.getElementById('rsBulkScope').value = 'job';
    document.getElementById('rsBulkGo').click();
  });
  await wait(400);
  ok(/every row it fits across all 41 placements/.test(dlg.last || ''), 'applying across the job asks, naming the placements: ' + (dlg.last || '').slice(0, 90));
  ok(/Ctrl\+Z puts them all back/.test(dlg.last || ''), 'the question says undo puts it back');
  ok(await page.evaluate(() => outstandingPickTotal()) === before, 'answering No sets nothing: ' + before);
  await page.close();
}

console.log('F. A pick that no longer matches is named (RES-17, JOB-04)');
{
  const page = await openJob();
  await toResults(page);
  const F = await page.evaluate(() => {
    const el = document.querySelector('#schedHead .lm-warn, #schedSummary .lm-warn');
    return { loss: pickLoss, text: el ? el.innerText : '', head: document.getElementById('schedHead').innerText };
  });
  if (F.loss) {
    ok(/under .+ on the .+ placement/.test(F.text), 'the lost pick names its floor and placement: ' + F.text.slice(0, 160));
  } else {
    // make one: a pick on a row, then a change that moves the row's key
    const F2 = await page.evaluate(() => {
      const L = schedSolve.levels[schedPourIdx], it = outstandingItems(L)[0];
      shoreChoices()[it.key] = it.kind === 'slab' ? it.region.steps[it.si].options[0].shoreId : it.beam.rows[it.si].options[0].shoreId;
      const lv = state.levels.find(l => l.name === it.level.name);
      lv.slabThickness += 2; persist(); runSchedule();
      const el = document.querySelector('#schedHead .lm-warn, #schedSummary .lm-warn');
      return { loss: pickLoss, text: el ? el.innerText : '' };
    });
    ok(!F2.loss || /under .+ on the .+ placement/.test(F2.text), 'a lost pick names its floor and placement: ' + F2.text.slice(0, 160));
  }
  await page.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// @rules JOB-02, MDL-04, MDL-10  (see DECISIONS.md)
// THE KALAE RE-WALK, Oct 16 2026 (N1, N2):
// N1. Opening a set that cannot be the job's (the 12-page "Kalae PDF Set.pdf"
//     on the 42-sheet job) must not make it the job's remembered set.
// N2. MECH ROOF over the elevator shaft must say "shaft", never "add the
//     floors below", on a stack that ends on grade.
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
const right = fs.readFileSync(path.resolve(here, '..', 'Revit export', '1268_KALAE-revit-plans.pdf')).toString('base64');
const wrongPath = path.resolve(here, '..', 'Kalae PDF Set.pdf');
const wrong = fs.existsSync(wrongPath) ? fs.readFileSync(wrongPath).toString('base64') : null;
const wait = ms => new Promise(r => setTimeout(r, ms));
const RIGHT = '1268_KALAE-revit-plans.pdf', WRONG = 'Kalae PDF Set.pdf';

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
  await page.waitForFunction(() => typeof solveAll === 'function');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.evaluate(() => { window.__toasts = []; const t = window.toast; window.toast = (m, ms) => { window.__toasts.push(String(m)); return t(m, ms); }; });
  return page;
}
// open the job (optionally remembering its set), then a PDF
async function openWith(page, remember, b64, name) {
  await page.evaluate(async ([j, remember, p, name]) => {
    const d = JSON.parse(j);
    if (remember) { d.project = d.project || {}; d.project.drawingSet = remember; d.project.drawingSetPages = 42; }
    applyOpenedJob(d, '1268_KALAE.reshore.json');
    const bin = atob(p); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    await loadFile(new File([u8], name, { type: 'application/pdf' }));
  }, [job, remember, b64, name]);
  await wait(1200);
}
async function loadPdf(page, b64, name) {
  await page.evaluate(async ([p, name]) => {
    const bin = atob(p); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    await loadFile(new File([u8], name, { type: 'application/pdf' }));
  }, [b64, name]);
  await wait(1200);
}

if (wrong) {
  console.log('N1. A wrong set never becomes the job\'s remembered set (JOB-02)');
  {
    const page = await newPage();
    await openWith(page, RIGHT, wrong, WRONG);
    const A = await page.evaluate(() => ({ set: state.project.drawingSet, pages: state.project.drawingSetPages,
      toasts: window.__toasts.join(' | '), step: stepStatus('drawings'), saved: serializeDoc().project.drawingSet }));
    ok(A.set === '1268_KALAE-revit-plans.pdf', 'the job still remembers its own set: ' + A.set);
    ok(A.saved === '1268_KALAE-revit-plans.pdf', 'saving keeps the right set name: ' + A.saved);
    ok(A.pages === 42, 'the remembered page count stays 42: ' + A.pages);
    ok(/1268_KALAE-revit-plans\.pdf/.test(A.toasts) && !/Kalae PDF Set\.pdf\)/.test(A.toasts), 'the warning names the job\'s set, not the one just opened: ' + A.toasts.slice(0, 300));
    ok(!A.step.done, 'Drawings is not done: ' + A.step.text);
    // the right set then loads and is (still) the remembered one
    await loadPdf(page, right, RIGHT);
    const B = await page.evaluate(() => ({ set: state.project.drawingSet, pages: state.project.drawingSetPages, step: stepStatus('drawings') }));
    ok(B.set === '1268_KALAE-revit-plans.pdf' && B.pages === 42, 'the right set is remembered: ' + B.set + ' ' + B.pages);
    await page.close();
  }
  {
    // the shipped sample job remembers no set: the wrong one is not adopted either
    const page = await newPage();
    await openWith(page, null, wrong, WRONG);
    const C = await page.evaluate(() => ({ set: state.project.drawingSet || '', toasts: window.__toasts.join(' | ') }));
    ok(C.set === '', 'a job with no remembered set does not take on the wrong one: ' + C.set);
    ok(!/built on \(Kalae PDF Set\.pdf\)/.test(C.toasts), 'the warning never calls the wrong file the job\'s set: ' + C.toasts.slice(0, 300));
    await loadPdf(page, right, RIGHT);
    const D = await page.evaluate(() => state.project.drawingSet);
    ok(D === '1268_KALAE-revit-plans.pdf', 'the right set is taken on once it fits: ' + D);
    await page.close();
  }
} else console.log('  (skipped N1: Kalae PDF Set.pdf not present)');
{
  // a set already open when a job is opened is not taken on as its set
  const page = await newPage();
  await loadPdf(page, right, RIGHT);
  const F = await page.evaluate(j => { applyOpenedJob(JSON.parse(j), '1268_KALAE.reshore.json'); refreshFlow(); return state.project.drawingSet || ''; }, job);
  ok(F === '', 'opening a job does not take on the set already open: ' + F);
  await page.close();
}

console.log('N2. A placement over a shaft says shaft, not "add the floors below" (MDL-04, MDL-10)');
{
  const page = await newPage();
  await openWith(page, RIGHT, right, RIGHT);
  await page.evaluate(() => { setStep('loads'); setStep('results'); });
  await page.waitForFunction(() => schedSolve && schedSolve.levels.length, null, { timeout: 120000 });
  const E = await page.evaluate(() => {
    const out = [];
    schedSolve.levels.forEach((L, i) => {
      schedPourIdx = i; renderSchedule();
      const t = document.getElementById('schedHead').textContent + ' ' + document.getElementById('schedBody').textContent;
      out.push({ name: L.pour.name, add: /add the floors below/.test(t), shaft: /over a shaft/.test(t) });
    });
    const last = state.levels[state.levels.length - 1];
    return { onGrade: levelOnGrade(last), out };
  });
  ok(E.onGrade, 'the Kalae stack ends on grade');
  const roof = E.out.find(o => o.name === 'MECH ROOF');
  ok(roof && roof.shaft, 'MECH ROOF names the shaft');
  const adds = E.out.filter(o => o.add).map(o => o.name);
  ok(!adds.length, 'no placement says "add the floors below": ' + adds.join(', '));
  await page.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

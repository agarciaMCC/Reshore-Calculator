// @rules LOD-09, UI-38, UI-26, UI-23, ARE-28, ARE-14, MDL-10, RES-11, PRT-01, UI-32, SEQ-02  (see DECISIONS.md)
// THE KALAE WALKTHROUGH, PART 2 (Oct 15 2026): the Loads, Areas, Results and Sequence steps. An estimator's walk of the 1268 Kalae
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
const wrongSet = fs.readFileSync(path.resolve(here, '..', 'Kalae PDF Set.pdf')).toString('base64');
const wait = ms => new Promise(r => setTimeout(r, ms));

// a fresh page with the job and its drawing set open, as File → Open does it.
// `dlg` records every confirm() the app raises; set dlg.dismiss to answer No.
async function openJob(dlg = {}, set = pdf) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
  page.on('dialog', d => { dlg.last = d.message(); dlg.all = (dlg.all || []).concat(d.message()); dlg.dismiss ? d.dismiss() : d.accept(); });
  await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
  await page.waitForFunction(() => typeof solveAll === 'function');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.evaluate(async ([j, p]) => {
    if (p === null) { applyOpenedJob(JSON.parse(j), '1268_KALAE.reshore.json'); return; }
    window.__solves = 0; const real = solveAll; window.solveAll = o => { window.__solves++; return real(o); };
    applyOpenedJob(JSON.parse(j), '1268_KALAE.reshore.json');
    const bin = atob(p); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    await loadFile(new File([u8], '1268_KALAE-revit-plans.pdf', { type: 'application/pdf' }));
  }, [job, set]);
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

console.log('N. A mark with its value cleared is asked again (LOD-09)');
{
  const page = await openJob();
  await page.evaluate(() => setStep('loads'));
  await wait(400);
  const N = await page.evaluate(() => {
    const before = stepStatus('loads');
    const inp = document.querySelector('#lmBody tr[data-ci="0"] input.lm-num[data-f="sdl"]') || document.querySelector('#lmBody input.lm-num');
    const ci = +inp.closest('tr').dataset.ci, was = inp.value;
    inp.value = ''; inp.dispatchEvent(new Event('change', { bubbles: true }));
    const after = stepStatus('loads'), row = getConditions()[ci], conf = row.confirmed;
    const inp2 = document.querySelector(`#lmBody tr[data-ci="${ci}"] input.lm-num[data-f="${inp.dataset.f}"]`);
    inp2.value = was; inp2.dispatchEvent(new Event('change', { bubbles: true }));
    return { before, after, confirmed: conf, back: stepStatus('loads') };
  });
  ok(N.before.done, 'Loads starts done: ' + N.before.text);
  ok(!N.after.done && /1 mark without a value/.test(N.after.text), 'blanking a dead load takes Done away and says which: ' + N.after.text);
  ok(N.confirmed === false, 'the blanked row is no longer confirmed');
  ok(N.back.done, 'typing the value back makes it done again: ' + N.back.text);
  await page.close();
}

console.log('O. The import badge is one word (UI-38)');
{
  const page = await openJob();
  await page.evaluate(() => setStep('loads'));
  await wait(400);
  const O = await page.evaluate(() => [...document.querySelectorAll('#lmBody .lm-hand')].map(e => ({ t: e.textContent.trim(), title: e.title })));
  ok(O.length > 0 && O.every(b => b.t === 'Imported'), 'every imported row carries just "Imported": ' + JSON.stringify(O.slice(0, 2)));
  ok(O.every(b => /Kalae Load Chart/i.test(b.title)), 'the file name is in the tooltip');
  await page.close();
}

console.log('P. A step is arrived at from its top (UI-26)');
{
  const page = await openJob();
  const P = await page.evaluate(() => {
    setStep('loads');
    const sp = document.getElementById('stepPanels');
    sp.scrollTop = 400; const scrolled = sp.scrollTop;
    setStep('results');
    return { scrolled, top: document.getElementById('stepPanels').scrollTop };
  });
  ok(P.scrolled > 0 && P.top === 0, 'Results opens at the top after Loads was scrolled: ' + [P.scrolled, P.top]);
  await page.close();
}

console.log('Q. The arrival scan shows progress, keeps its plumbing on the card, and the review is the step\'s state (UI-23, UI-26, ARE-28)');
{
  const page = await openJob();
  const toasts = [];
  await page.exposeFunction('__t', m => toasts.push(m));
  await page.evaluate(() => { const h = document.getElementById('toastHost'); new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__t(n.textContent)))).observe(h, { childList: true }); });
  await page.evaluate(() => setStep('areas'));
  await wait(1200);
  const mid = await page.evaluate(() => ({ scan: !!beamScan, progress: beamScan && beamScan.progress, panel: document.getElementById('p-areas') ? document.getElementById('p-areas').innerText : document.body.innerText }));
  ok(mid.scan && mid.progress && mid.progress.total > 1, 'the scan is under way with a sheet count: ' + JSON.stringify(mid.progress));
  ok(/reading sheet \d+ of \d+/.test(mid.panel), 'the pill says which sheet it is on');
  await page.waitForFunction(() => !beamScan || !beamScan.progress, null, { timeout: 60000 });
  await wait(300);
  const Q = await page.evaluate(() => ({ left: scanLeft(), st: stepStatus('areas'), foot: document.getElementById('stepFoot') ? document.getElementById('stepFoot').innerText : '', notes: beamScan && beamScan.notesText, card: (document.querySelector('.sq-notes') || {}).innerText || '' }));
  ok(!toasts.some(t => /already drawn|crossings of dimension/.test(t)), 'no pop-up about what the read left out: ' + toasts.filter(t => /drawn|crossing/.test(t)).join(' | '));
  ok(Q.notes && Q.card && /already drawn|crossing|outside the floor edge/.test(Q.card), 'the left-out counts sit dim on the card: ' + Q.card.slice(0, 100));
  ok(Q.left.n > 0 && !Q.st.done && new RegExp(`Reviewing: ${Q.left.n} shapes? on ${Q.left.floors} floors?`).test(Q.st.text), 'the step says how much review is left, over every floor: ' + Q.st.text);
  await page.evaluate(() => cancelBeamScan());
  const Q2 = await page.evaluate(() => ({ st: stepStatus('areas'), stopped: state.ui.scanStopped, head: document.getElementById('p-areas') ? document.getElementById('p-areas').innerText : '' }));
  ok(Q2.st.done && Q2.stopped && new RegExp(`${Q2.stopped.n} shapes? on ${Q2.stopped.floors} floors? not reviewed`).test(Q2.st.text), 'Stop here leaves the count of what was not reviewed on the step: ' + Q2.st.text);
  ok(/not reviewed when the review was stopped/.test(Q2.head), 'the Areas head says so too');
  await page.close();
}

console.log('R. A slab the same as the typical says it changes nothing (ARE-14)');
{
  const page = await openJob();
  const R = await page.evaluate(() => {
    const li = state.levels.findIndex(l => l.name === '3'), lv = state.levels[li];
    state.activeLevelIdx = li;
    const pg = levelSheets(lv)[0].page;
    window.__flash = null; window.adFlash = (m, w) => { window.__flash = { m, w }; };
    const u = adUI(); u.drawVals.slab = { t: lv.slabThickness, off: 0 }; u.clipEdge = false;
    const z = { id: 'tst', polygon: [{ x: 1000, y: 1000 }, { x: 1200, y: 1000 }, { x: 1200, y: 1200 }, { x: 1000, y: 1200 }], page: pg, thicknessIn: lv.slabThickness };
    zonesOf(lv, 'slab').push(z);
    adAfterDraw(lv, z, 'slab');
    zonesOf(lv, 'slab').pop();
    return { flash: window.__flash, t: lv.slabThickness, kind: slabKind(z) };
  });
  ok(R.kind === 'slab' && R.flash && /changes nothing/.test(R.flash.m) && R.flash.w, 'the drawing bar says it changes nothing and how to remove it: ' + (R.flash && R.flash.m));
  await page.close();
}

console.log('S. A shaft is not a 391-foot shore (MDL-10)');
{
  const page = await openJob();
  await toResults(page);
  const S = await page.evaluate(() => {
    const L = schedSolve.levels.find(L => L.pour.name === 'MECH ROOF');
    const st = L.solve.regions.flatMap(r => r.steps).find(x => x.shaft);
    const tall = schedSolve.levels.flatMap(L => L.solve.spatial ? L.solve.regions.flatMap(r => r.steps) : []).filter(x => x.shoreHeightFt != null && x.shoreHeightFt > 60).length;
    const i = schedSolve.levels.indexOf(L); schedPourIdx = i; renderSchedule();
    const heights = [...document.querySelectorAll('#schedSummary .inst-row .rs-dim')].map(e => e.innerText).filter(t => /\d+'-/.test(t));
    const chips = [...document.querySelectorAll('#schedBody .warn')].map(e => e.innerText);
    return { st: st && { level: st.level.name, shaft: st.shaft, h: st.shoreHeightFt, sup: st.supportLevel && st.supportLevel.name, noOptions: st.noOptions, opts: st.options.length }, tall, heights, chips: chips.filter(c => /shaft/.test(c)) };
  });
  ok(S.st && S.st.level === 'ELEV MECH RM' && S.st.shaft > 2, 'the row over the elevator shaft is marked as a shaft: ' + JSON.stringify(S.st));
  ok(S.st && S.st.h == null && !S.st.sup && S.st.noOptions && S.st.opts === 0, 'it has no height, no support and no options');
  ok(S.tall === 0, 'no row anywhere in the job has a shore over 60 ft: ' + S.tall);
  ok(!S.heights.some(h => /\b[1-9]\d\d'-/.test(h)), 'the install summary shows no three-digit clear height: ' + S.heights.join(' | '));
  ok(S.chips.length > 0 && S.chips.some(c => /shaft below/.test(c)), 'its chip says "shaft below": ' + S.chips.slice(0, 2).join(' | '));
  await page.close();
}

console.log('T. Floors with nothing to install are one row, and a beams-only floor is never "0 SF" (RES-11, PRT-01)');
{
  const page = await openJob();
  await toResults(page);
  const T = await page.evaluate(() => {
    const i = schedSolve.levels.findIndex(L => /ELEV MECH/i.test(L.pour.name)); schedPourIdx = i; renderSchedule();
    const L = schedSolve.levels[i], plan = pourInstallPlan(L);
    const rest = plan.floors.filter(f => !f.needsShores).length;
    const none = [...document.querySelectorAll('#schedSummary .inst-row.none')].map(e => e.innerText.replace(/\s+/g, ' '));
    const specs = [...document.querySelectorAll('#schedSummary .inst-row:not(.none) .inst-spec')].map(e => e.innerText.replace(/\s+/g, ' '));
    const print = printPourHtml(L, null);
    const printRows = (print.match(/<tr><td>[^<]*(?: to [^<]*)?(?:<i>\(\d+ floors\)<\/i>)?<\/td><td colspan="5">/g) || []).length;
    return { rest, none, specs, printGrouped: /\(\d+ floors\)<\/i><\/td><td colspan="5">/.test(print), printRows, zeroSF: /(^|[^\d,.])0 SF/.test(print.replace(/<[^>]+>/g, ' ')) || specs.some(t => /(^|[^\d,.])0 SF/.test(t)) };
  });
  ok(T.rest > 10 && T.none.length <= 4, `${T.rest} floors with nothing to install read as ${T.none.length} row(s): ` + T.none.join(' || ').slice(0, 200));
  ok(T.none.some(t => /to .+\d+ floors/.test(t)), 'a run reads "ROOF to 2 · N floors": ' + T.none[0]);
  ok(T.printGrouped && T.printRows <= 4, 'the print groups them the same way: ' + T.printRows + ' rows');
  ok(!T.zeroSF, 'no row reads "0 SF" on screen or in print');
  ok(T.specs.every(t => !/^\s*$/.test(t)), 'every floor row says something: ' + T.specs.slice(0, 3).join(' | '));
  await page.close();
}

console.log('U. Next: Sequence opens as soon as there is a solve (UI-32)');
{
  const page = await openJob();
  await toResults(page);
  const U = await page.evaluate(() => {
    const foot = document.querySelector('.step-panel[data-step="results"] .sec-next');
    const b = foot && foot.querySelector('.sn-btn');
    return { pending: outstandingPickTotal(), btn: b && b.textContent, disabled: b && b.disabled, pill: foot && foot.querySelector('.pill, .sn-status').innerText };
  });
  ok(U.pending > 0, 'picks are still to make: ' + U.pending);
  ok(/Next: Sequence/.test(U.btn || '') && U.disabled === false, 'the Next: Sequence button is enabled: ' + U.btn);
  ok(/To do/.test(U.pill || '') && /to choose/.test(U.pill || ''), 'the row still says what is left: ' + (U.pill || '').replace(/\n/g, ' '));
  await page.close();
}

console.log('V. The plan follows the Sequence table (SEQ-02)');
{
  const page = await openJob();
  await toResults(page);
  await page.evaluate(() => setStep('sequence'));
  await wait(800);
  const V = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll('tr[data-seqrow]')];
    const tbl = document.querySelector('.seq-table'), wrap = document.querySelector('.seq-wrap');
    const fits = tbl && wrap && tbl.getBoundingClientRect().width <= wrap.getBoundingClientRect().width + 1;
    const target = rows.find(r => r.dataset.seqrow === '20');
    target.click();
    await new Promise(r => setTimeout(r, 900));
    const lv = state.levels.find(l => l.name === '20');
    return { n: rows.length, fits, pour: schedSolve.levels[schedPourIdx].pour.name, page: state.pdf.current, want: levelSheets(lv).map(s => s.page), lit: target.classList.contains('lit') };
  });
  ok(V.n === 41, 'every placement is a row: ' + V.n);
  ok(V.fits, 'the table fits its pane, nothing cut off at the right');
  ok(V.pour === '20' && V.want.includes(V.page) && V.lit, 'clicking placement 20 opens its sheet and lights the row: ' + [V.pour, V.page, V.want]);
  await page.close();
}

console.log('W. Notes & assumptions carry no empty items (RES-11)');
{
  const page = await openJob();
  await toResults(page);
  const W = await page.evaluate(() => schedSolve.levels.flatMap(L => assumptionItems(L)).map(a => assumptionText(a)).filter(t => /\b0 SF\b/.test(t)));
  ok(W.length === 0, 'no assumption reads "· 0 SF": ' + W.slice(0, 2).join(' | '));
  await page.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

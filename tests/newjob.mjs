// New job: back to the upload screen, with a confirm that names what goes,
// and the settings and hand-added shores carried across.
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
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'test-set.pdf'));
const job = JSON.parse(fs.readFileSync(path.resolve(here, 'fixtures', 'test-job.reshore.json'), 'utf8'));
const load = () => page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
  document.getElementById('pageNav').style.display = 'flex';
  // his own settings, and a shore he added by hand
  state.project.constructionDL = 35; state.project.edgeTolFt = 3; state.project.minRegionSF = 150;
  state.project.solveStepFt = 3; state.project.seqExceptionPct = 20;
  state.shores.push({ id: sid(), name: 'McClone special', minH: 4, maxH: 14, capacity: 9000 });
  state.project.name = 'Bothell STEM 4';
  setStep('areas'); renderSidebar(); renderCanvas(); persist();
}, [pdf.toString('base64'), job]);
await load();

console.log('A. the button is there, beside Save and Open');
const order = await page.evaluate(() => [...document.querySelectorAll('.toolbar-right .btn')].map(b => b.id).filter(Boolean));
ok(order.includes('btnNewProj'), 'New job exists: ' + order.join(','));
ok(order.indexOf('btnNewProj') < order.indexOf('btnSaveProj'), 'and sits before Save job: ' + order.join(','));

console.log('B. it asks first, and names what is about to go');
await page.click('#btnNewProj');
await page.waitForSelector('#newJobModal.open');
const body = await page.evaluate(() => document.getElementById('njBody').textContent);
ok(/11 sheets/.test(body), 'the sheets: ' + /\d+ sheets/.exec(body));
ok(/5 levels/.test(body), 'the levels');
ok(/drawn area/.test(body), 'the drawn areas');
ok(/matched floor/.test(body), 'the matched floors');
ok(/not\b[\s\S]{0,20}the drawings/.test(body) || /not<\/b> the drawings/.test(body) || /not the drawings/.test(body),
   'and warns that undo will not bring the drawings back');
ok(await page.isVisible('#njSave'), 'with a Save job button in the dialog');

console.log('C. Cancel changes nothing');
await page.click('#njCancel');
const afterCancel = await page.evaluate(() => ({ levels: state.levels.length, pages: state.pdf.pages, open: document.getElementById('newJobModal').classList.contains('open') }));
ok(!afterCancel.open && afterCancel.levels === 5 && afterCancel.pages === 11, 'still there: ' + JSON.stringify(afterCancel));

console.log('D. Escape answers the dialog before anything else');
await page.click('#btnNewProj');
await page.waitForSelector('#newJobModal.open');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
const esc = await page.evaluate(() => ({ open: document.getElementById('newJobModal').classList.contains('open'), levels: state.levels.length }));
ok(!esc.open && esc.levels === 5, 'closed, nothing cleared: ' + JSON.stringify(esc));

console.log('E. starting a new job clears the lot and goes back to the upload screen');
await page.click('#btnNewProj');
await page.waitForSelector('#newJobModal.open');
await page.click('#njGo');
await page.waitForTimeout(400);
const now = await page.evaluate(() => ({
  levels: state.levels.length, pages: state.pdf.pages, doc: !!state.pdf.doc,
  name: state.project.name, grid: (state.project.grid.x || []).length + (state.project.grid.y || []).length,
  marks: (state.project.loadingConditions || []).length + (state.project.llSchedule || []).length,
  skipped: (state.project.skippedPages || []).length,
  step: curStep, tool: state.tool, results: state.results,
  upload: getComputedStyle(document.getElementById('upload-prompt')).display !== 'none',
  nav: document.getElementById('pageNav').style.display,
  active: state.activeLevelIdx, zone: state.activeZoneIdx, highlight: state.ui.highlight,
  modal: document.getElementById('newJobModal').classList.contains('open')
}));
ok(now.levels === 0 && now.pages === 0 && !now.doc, 'levels and the drawing set are gone: ' + JSON.stringify(now));
ok(now.name === 'New Project' && now.grid === 0 && now.marks === 0 && now.skipped === 0,
   'so are the name, the grid, the load marks and the sheet assignments: ' + JSON.stringify(now));
ok(now.upload && now.nav === 'none', 'the upload screen is back');
ok(now.step === 'drawings' && now.tool === 'select', 'and the stepper is at the start: ' + now.step);
ok(now.active === null && now.zone === null && !now.highlight && !now.results, 'nothing is left selected');
ok(!now.modal, 'the dialog closed itself');

console.log('F. the settings and the shore he added carry over');
const carried = await page.evaluate(() => ({
  dl: state.project.constructionDL, tol: state.project.edgeTolFt, minSF: state.project.minRegionSF,
  step: state.project.solveStepFt, seq: state.project.seqExceptionPct, timber: state.project.timberMaxH,
  mine: state.shores.some(s => s.name === 'McClone special'),
  builtins: state.shores.filter(s => DEFAULT_SHORES.some(d => d.name === s.name)).length,
  allBuiltins: DEFAULT_SHORES.length
}));
ok(carried.dl === 35 && carried.tol === 3 && carried.minSF === 150 && carried.step === 3 && carried.seq === 20,
   'every project setting survived: ' + JSON.stringify(carried));
ok(carried.mine, 'and the shore he added is still in the catalog');
ok(carried.builtins === carried.allBuiltins, 'with the built-in tables all present: ' + carried.builtins + '/' + carried.allBuiltins);

console.log('G. one undo brings the job back (the drawings excepted)');
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
const undone = await page.evaluate(() => ({ levels: state.levels.length, name: state.project.name,
  marks: (state.project.loadingConditions || []).length + (state.project.llSchedule || []).length }));
ok(undone.levels === 5 && undone.name === 'Bothell STEM 4' && undone.marks > 0,
   'levels, name and loads are back: ' + JSON.stringify(undone));

console.log('H. on an empty session it just starts, no dialog to answer');
await page.evaluate(() => { while (history.canUndo()) history.undo(); state.levels = []; state.pdf.pages = 0; state.pdf.doc = null;
  state.project.loadingConditions = []; state.project.llSchedule = []; renderSidebar(); });
const empty = await page.evaluate(() => jobIsEmpty());
ok(empty, 'a blank session reads as empty');
await page.click('#btnNewProj');
await page.waitForTimeout(250);
ok(!(await page.evaluate(() => document.getElementById('newJobModal').classList.contains('open'))),
   'no dialog when there is nothing to lose');

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

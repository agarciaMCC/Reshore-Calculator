// @rules JOB-03  (see DECISIONS.md)
// The shared build: inside a sandboxed frame a download and a second window
// are inert, so Save job hands you the job as text and Print uses an in-page
// preview. Opened from disk, neither route changes.
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
const appPath = path.resolve(here, '..', 'reshore-calc.html');

const browser = await chromium.launch();

console.log('A. opened from disk it behaves exactly as before');
{
  const page = await browser.newPage();
  page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
  await page.goto('file://' + appPath);
  await page.waitForFunction(() => typeof solveAll === 'function');
  ok(await page.evaluate(() => appIsEmbedded()) === false, 'not embedded');
  const dl = await page.evaluate(async () => {
    let clicked = null;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicked = this.download; };
    state.project.name = 'Bothell STEM 4';
    await saveProjectFile();
    HTMLAnchorElement.prototype.click = orig;
    return { clicked, modal: document.getElementById('jobTextModal').classList.contains('open') };
  });
  ok(dl.clicked === 'Bothell_STEM_4.reshore.json', 'Save job still downloads a file: ' + dl.clicked);
  ok(!dl.modal, 'and no text box appears');
  const pw = await page.evaluate(() => { let opened = false;
    const o = window.open; window.open = () => { opened = true; return null };
    const w = openPrintWindow(); window.open = o;
    return { opened, overlay: !!document.getElementById('printOverlay') } });
  ok(pw.opened && !pw.overlay, 'Print still uses a second window: ' + JSON.stringify(pw));
  await page.close();
}

console.log('B. inside a frame, Save job hands you the job as text');
{
  const page = await browser.newPage();
  page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
  const html = fs.readFileSync(appPath, 'utf8');
  await page.setContent(`<iframe id="f" style="width:1200px;height:800px;border:0"></iframe>`);
  await page.evaluate(h => { document.getElementById('f').srcdoc = h; },
    html.replace(/^<!doctype html>\n<meta charset="utf-8">\n/, ''));
  await page.waitForFunction(() => { const w = document.getElementById('f').contentWindow;
    return w && typeof w.solveAll === 'function' }, { timeout: 60000 });
  const f = page.frames().find(x => x !== page.mainFrame());
  if (!f) { console.log('  FAIL no frame'); process.exit(1) }
  ok(await f.evaluate(() => appIsEmbedded()) === true, 'it knows it is embedded');

  const saved = await f.evaluate(async () => {
    state.project.name = 'Shared Test';
    state.levels = [{ id: sid(), name: '2', elevation: 20, slabThickness: 9, defaultCapacity: 100, zones: [], slabZones: [] }];
    await saveProjectFile();
    const m = document.getElementById('jobTextModal');
    return { open: m.classList.contains('open'), head: document.getElementById('jtHead').textContent,
             text: document.getElementById('jtText').value,
             copyShown: document.getElementById('jtCopy').style.display !== 'none',
             loadShown: document.getElementById('jtLoad').style.display !== 'none' };
  });
  ok(saved.open, 'the job text box opens instead of a silent no-op');
  ok(/Shared_Test\.reshore\.json/.test(saved.head), 'named like the file it stands in for: ' + saved.head.slice(0, 60));
  ok(saved.copyShown && !saved.loadShown, 'with Copy, not Open');
  const parsed = JSON.parse(saved.text);
  ok(parsed._app === 'reshore-calc' && parsed.levels.length === 1,
     'and it is the real job format, byte for byte what the file would hold');

  console.log('C. and takes it back');
  const back = await f.evaluate(t => {
    closeJobTextModal();
    state.levels = [];
    openJobTextModal('open', '');
    const m = document.getElementById('jobTextModal');
    const before = { open: m.classList.contains('open'),
                     loadShown: document.getElementById('jtLoad').style.display !== 'none',
                     copyShown: document.getElementById('jtCopy').style.display !== 'none' };
    document.getElementById('jtText').value = t;
    loadJobText();
    return { before, levels: state.levels.length, name: state.project.name,
             closed: !m.classList.contains('open') };
  }, saved.text);
  ok(back.before.open && back.before.loadShown && !back.before.copyShown, 'the paste box offers Open, not Copy');
  ok(back.levels === 1 && back.name === 'Shared Test', 'the pasted job loads: ' + JSON.stringify(back));
  ok(back.closed, 'and the box closes itself');

  const bad = await f.evaluate(() => {
    openJobTextModal('open', '');
    document.getElementById('jtText').value = 'not json at all';
    loadJobText();
    const t = document.querySelectorAll('.toast');
    return { open: document.getElementById('jobTextModal').classList.contains('open'),
             toast: t.length ? t[t.length - 1].textContent : '' };
  });
  ok(bad.open && /not valid JSON/.test(bad.toast), 'rubbish is refused and the box stays: ' + JSON.stringify(bad.toast));
  await f.evaluate(() => closeJobTextModal());

  console.log('D. Open job reaches the paste box, and a real file still works');
  const routes = await f.evaluate(() => {
    document.getElementById('btnOpenProj').click();
    const viaButton = document.getElementById('jobTextModal').classList.contains('open');
    closeJobTextModal();
    return { viaButton, picker: !!document.getElementById('btnOpenProjFile') };
  });
  ok(routes.viaButton, 'Open job opens the paste box in the shared build');
  ok(routes.picker, 'and a file picker is still offered beside it');

  console.log('D2. and when the viewer\'s app can save a real file, it does');
  const dlTest = await f.evaluate(async () => {
    let asked = null;
    window.claude = { use: n => n === 'downloads'
      ? Promise.resolve({ save: r => { asked = r; return Promise.resolve({ status: 'saved' }) } })
      : Promise.resolve(null) };
    _dlCap = null;
    state.project.name = 'Shared Test';
    await saveProjectFile();
    const viaText = document.getElementById('jobTextModal').classList.contains('open');
    const t = document.querySelectorAll('.toast');
    return { name: asked && asked.filename, len: asked && asked.data.length, viaText,
             toast: t.length ? t[t.length - 1].textContent : '' };
  });
  ok(dlTest.name === 'Shared_Test.reshore.json', 'it offers the real file: ' + dlTest.name);
  ok(dlTest.len > 100 && !dlTest.viaText, 'and skips the text box entirely: ' + JSON.stringify({ len: dlTest.len, viaText: dlTest.viaText }));
  ok(/Job saved/.test(dlTest.toast), 'saying so: ' + JSON.stringify(dlTest.toast));

  const declined = await f.evaluate(async () => {
    window.claude = { use: () => Promise.resolve({ save: () => Promise.reject({ code: 'declined' }) }) };
    _dlCap = null;
    await saveProjectFile();
    return document.getElementById('jobTextModal').classList.contains('open');
  });
  ok(!declined, 'a viewer who declines is not then shown a wall of JSON');

  const noCap = await f.evaluate(async () => {
    window.claude = { use: () => Promise.resolve(null) };
    _dlCap = null;
    await saveProjectFile();
    const open = document.getElementById('jobTextModal').classList.contains('open');
    closeJobTextModal(); delete window.claude; _dlCap = null;
    return open;
  });
  ok(noCap, 'and where the capability is not offered, the text box is still there');

  console.log('E. Print becomes an in-page preview');
  const pv = await f.evaluate(() => {
    const w = openPrintWindow();
    const ov = document.getElementById('printOverlay');
    const had = !!ov;
    let wrote = false;
    try { w.document.write('<p>hello</p>'); w.document.close(); wrote = true } catch (e) {}
    const bar = ov && ov.querySelector('.print-bar').textContent;
    const btns = ov ? [...ov.querySelectorAll('button')].map(b => b.textContent) : [];
    // the callers finish with print(); from a frame that must not fire on its own
    let threw = false; try { w.print() } catch (e) { threw = true }
    ov && ov.remove();
    return { had, wrote, bar, btns, threw };
  });
  ok(pv.had, 'an overlay is used instead of a second window');
  ok(pv.wrote, 'and the same document is written into it');
  ok(pv.btns.join(',') === 'Print,Close', 'with Print and Close: ' + pv.btns.join(','));
  ok(!pv.threw, 'the automatic print is neutered, so nothing fires unasked');
  ok(/Save as PDF/.test(pv.bar), 'and it says what Print does: ' + JSON.stringify(pv.bar));
  await page.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

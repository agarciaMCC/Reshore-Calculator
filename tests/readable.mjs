// @rules UI-13  (see DECISIONS.md)
// TWO THINGS YOU COULD NOT DO (Sep 17 2026)
// Adolfo: "I cant read any of the text in the dropdown menus or the fields
// where you're expected to type. we need more contrast. also, In match floors,
// we need to be able to click the sheets to review the grid matches"
//
//  A. every dropdown and text field carries its own surface and text colour,
//     in both themes — the rule used to set the colour and leave the
//     background to the browser, which paints it white
//  B. a sheet in Match floors is clickable: it opens that sheet, draws the
//     fit that was made for it and the crossings it was made from, says what
//     the fit is, and Escape peels it
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
const APP = 'file://' + path.resolve(here, '..', 'reshore-calc.html');
const KIN = path.resolve(here, '..', 'Kinect');
const pdf = fs.readFileSync(path.join(KIN, '2026.06.17 - 1326 - Reshore - Plans - AI.pdf')).toString('base64');
const job = JSON.parse(fs.readFileSync(path.join(KIN, 'kinect4.json'), 'utf8'));

const browser = await chromium.launch();
const open = async (scheme) => {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, colorScheme: scheme });
  page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
  await page.goto(APP);
  await page.waitForFunction(() => typeof solveAll === 'function');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.evaluate(async ([b64, d]) => {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
    resetGeometry(); resetPageTextCache();
    state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
    deserializeDoc(d); sortLevelsByElevation();
    document.getElementById('upload-prompt').style.display = 'none';
    // 'drawings' is a SECTION of the Building step since Sep 15 (BLD-01), and
    // setting it as a step leaves almost nothing on screen to check.
    setStep('building'); await readSheetTitles(true);
    // the Building step's sections open once the levels are confirmed (JOB-01)
    if (typeof confirmLevels === 'function') confirmLevels();
    renderSidebar();
  }, [b64f, d0]);
  return page;
};
// (bound below — playwright needs them in scope of the evaluate)
const b64f = pdf, d0 = job;

// ── A. contrast ────────────────────────────────────────────────────────
console.log('A. every field is readable, in both themes');
const CONTRAST = `(() => {
  const lum = c => { const m=c.match(/[\\d.]+/g).map(Number);
    const f = v => { v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4) };
    return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2]) };
  const ratio = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05) };
  const out=[];
  for (const el of document.querySelectorAll('select, input[type="text"], input[type="number"], input:not([type]), textarea')) {
    if (!el.offsetParent && el.type !== 'hidden') continue;
    const cs = getComputedStyle(el);
    // a field may sit transparent on a panel that already carries the colour,
    // so take the first real background up the tree
    let bg = cs.backgroundColor, n = el;
    while (bg === 'rgba(0, 0, 0, 0)' && n.parentElement) { n = n.parentElement; bg = getComputedStyle(n).backgroundColor; }
    if (bg === 'rgba(0, 0, 0, 0)') bg = getComputedStyle(document.body).backgroundColor;
    out.push({ id: el.id || el.className || el.tagName, r: +ratio(cs.color, bg).toFixed(2) });
  }
  return { scheme: getComputedStyle(document.documentElement).colorScheme, fields: out };
})()`;
for (const scheme of ['dark', 'light']) {
  const page = await open(scheme);
  const R = await page.evaluate(CONTRAST);
  const worst = R.fields.reduce((m, f) => f.r < m.r ? f : m, { r: 99, id: '—' });
  console.log(`   ${scheme}: ${R.fields.length} fields on screen, worst ${worst.r}:1 (${worst.id})`);
  ok(R.scheme === scheme, `the page declares its colour scheme so the browser draws its own widgets to match: ${R.scheme}`);
  ok(R.fields.length >= 8, `there are fields to check: ${R.fields.length}`);
  ok(R.fields.every(f => f.r >= 7), `every one clears AAA (7:1) in ${scheme}: ` + JSON.stringify(R.fields.filter(f => f.r < 7)));
  if (scheme === 'dark') {
    // the option list too — a dark dropdown with default options is white-on-white
    ok(await page.evaluate(() => {
      const o = document.querySelector('#sheetTable select option');
      const cs = getComputedStyle(o);
      return cs.color !== '' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
    }), 'the dropdown list itself is coloured, not left to the browser');
  }
  await page.close();
}

// ── B. clicking a sheet reviews its grid ───────────────────────────────
console.log('B. click a sheet in Match floors to see its grid');
const page = await open('dark');
await page.evaluate(() => { setStep('match'); renderMatchPanel(); });
const rows = await page.evaluate(() => [...document.querySelectorAll('#matchList .match-row[data-reviewpage]')]
  .map(r => ({ page: +r.dataset.reviewpage, level: +r.dataset.reviewlevel, btn: !!r.querySelector('button[data-reviewbtn]') })));
console.log('   ' + JSON.stringify(rows));
const bound = await page.evaluate(() => state.levels.reduce((n, l) => n + levelSheets(l).length, 0));
ok(rows.length === bound, `every sheet of every floor is a clickable row: ${rows.length} of ${bound}`);
ok(rows.every(r => r.btn), 'each with a Show grid button');
const R = await page.evaluate(async () => {
  const want = 10;                                   // Level 3 South
  const el = document.querySelector(`#matchList .match-row[data-reviewpage="${want}"]`);
  el.click();
  await new Promise(r => setTimeout(r, 600));
  const c = document.getElementById('drawCanvas').getContext('2d');
  let strokes = 0, texts = [];
  const s0 = c.stroke.bind(c), t0 = c.fillText.bind(c);
  c.stroke = function () { strokes++; return s0.apply(c, arguments) };
  c.fillText = function (t) { texts.push(String(t)); return t0.apply(c, arguments) };
  renderNow();
  c.stroke = s0; c.fillText = t0;
  const lv = state.levels[state.activeLevelIdx];
  return { page: state.pdf.current, level: lv && lv.name, review: state.ui.gridReview,
           strokes, texts: texts.slice(0, 40),
           marked: !!document.querySelector('#matchList .match-row.reviewing'),
           btn: (document.querySelector('button[data-reviewbtn="10"]') || {}).textContent,
           dom: (document.getElementById('matchList') || {}).innerText || '' };
});
ok(R.page === 10 && R.level === '3', 'clicking the row opens that sheet on that floor: ' + JSON.stringify([R.page, R.level]));
ok(R.review && R.review.page === 10, 'and marks it as the one being reviewed: ' + JSON.stringify(R.review));
ok(R.marked && /Showing/.test(R.btn || ''), 'the row says so: ' + R.btn);
ok(R.strokes > 20, 'the grid and its crossings are drawn: ' + R.strokes);
// the fit may be written on the canvas or stated on the row beside it
const fitShown = R.texts.some(t => /1" = 10\./.test(t)) || /1" = 10\./.test(R.dom);
const whichShown = R.texts.some(t => /^3\b/.test(t) || /South/.test(t)) || /South|\b3\b/.test(R.dom);
ok(fitShown && whichShown,
  'with the fit stated on the sheet or its row: ' + JSON.stringify(R.texts.filter(t => /=|South/.test(t))) + ' | ' + (R.dom.match(/1" = [\d.]+'?/) || ['(not in the panel either)'])[0]);
ok(R.texts.some(t => /,/.test(t)), 'and each crossing labelled: ' + JSON.stringify(R.texts.filter(t => /,/.test(t)).slice(0, 4)));
// Escape peels it; leaving the step drops it
ok(await page.evaluate(() => { escapeOnce({}); return !state.ui.gridReview; }), 'Escape peels the review');
ok(await page.evaluate(() => { reviewSheetMatch(state.levels.findIndex(l => l.name === '2'), 7); setStep('loads'); return !state.ui.gridReview; }),
  'and leaving the Building step drops it');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);

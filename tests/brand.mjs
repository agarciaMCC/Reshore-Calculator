// @rules BRD-01  (see DECISIONS.md)
// THE McCLONE BRAND & DOCUMENT STYLE GUIDE, v1.3.
// Two brand colors — MCC Red #CF0A2C and MCC Grey #8A8A8D — plus black, white
// and the working tints #F2F2F2 / #D9D9D9; Calibri for everything a team
// member makes; the logo never recreated, only the supplied art.
//
// Red is the signature accent, "used deliberately — never as a default or
// background fill", at roughly 10% of the ink. So what is pinned here is not
// only that the values are right but that red is SPENT in the right places:
// the primary action, the active step, links, focus and the Heading 1 rule —
// and not on plain UI state, and not on the colors that carry meaning on the
// drawing, which the guide's own two colors could never keep apart.
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const RED = '#CF0A2C', GREY = '#8A8A8D';
const rgb = h => `rgb(${parseInt(h.slice(1,3),16)}, ${parseInt(h.slice(3,5),16)}, ${parseInt(h.slice(5,7),16)})`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

console.log('A. the palette is the guide\'s');
let r = await page.evaluate(() => {
  const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return { red: v('--mcc-red'), grey: v('--mcc-grey'), accent: v('--accent'),
    ground: v('--ground'), surface: v('--surface'), border: v('--border'),
    text: v('--text'), sec: v('--text-secondary'), ter: v('--text-tertiary'),
    accentText: v('--accent-text') };
});
ok(r.red.toUpperCase() === RED, 'MCC Red is on the root: ' + r.red);
ok(r.grey.toUpperCase() === GREY, 'MCC Grey is on the root: ' + r.grey);
ok(r.accent.toUpperCase() === RED, 'and red is the accent: ' + r.accent);
ok(r.ground.toUpperCase() === '#F2F2F2', 'ground is the guide\'s light fill: ' + r.ground);
ok(r.surface.toUpperCase() === '#FFFFFF', 'surfaces are white: ' + r.surface);
ok(r.border.toUpperCase() === '#D9D9D9', 'rules are the guide\'s border tint: ' + r.border);
ok(r.text === '#000000', 'body copy is black, per the guide: ' + r.text);
ok(r.accentText.toUpperCase() === '#FFFFFF', 'white on red, never red on red: ' + r.accentText);

console.log('B. grey is not used where the guide says it fails');
// "MCC Grey on white falls just below the WCAG AA minimum for small text.
// Use grey only for large or secondary text — use black for anything small."
const lum = h => { const c = [1,3,5].map(i => { const s = parseInt(h.slice(i,i+2),16)/255;
  return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4); });
  return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]; };
const ratio = (a,b) => { const [x,y] = [lum(a), lum(b)].sort((p,q) => q-p); return (x+0.05)/(y+0.05); };
ok(ratio(GREY, '#FFFFFF') < 4.5, 'the guide is right — MCC Grey on white is '
   + ratio(GREY,'#FFFFFF').toFixed(2) + ':1, under AA');
ok(ratio(r.sec, '#FFFFFF') >= 4.5, 'so the small secondary text clears AA: '
   + r.sec + ' at ' + ratio(r.sec,'#FFFFFF').toFixed(2) + ':1');
ok(r.ter.toUpperCase() === GREY, 'and MCC Grey itself is kept for large / secondary only: ' + r.ter);
ok(ratio(RED, '#FFFFFF') >= 4.5, 'white on MCC Red clears AA for button labels: '
   + ratio(RED,'#FFFFFF').toFixed(2) + ':1');

console.log('C. red is spent where the guide spends it');
r = await page.evaluate(() => {
  setStep('areas'); renderSidebar();
  const cs = el => el ? getComputedStyle(el) : null;
  const btn = document.querySelector('.btn-primary');
  const h2 = document.querySelector('.step-panel.active h2');
  const step = document.querySelector('.step.current .step-n');
  const tool = document.querySelector('.tool-btn.active');
  const layer = document.querySelector('.layer-btn.active');
  return {
    primaryBg: cs(btn) && cs(btn).backgroundColor,
    h1Rule: cs(h2) && cs(h2).borderBottomColor,
    stepColor: cs(step) && cs(step).color,
    toolBg: cs(tool) && cs(tool).backgroundColor,
    layerBg: cs(layer) && cs(layer).backgroundColor,
    brand: cs(document.querySelector('.app-brand')).color };
});
ok(r.primaryBg === rgb(RED), 'the primary action is MCC Red: ' + r.primaryBg);
ok(r.h1Rule === rgb(RED), 'Heading 1 carries the guide\'s red rule: ' + r.h1Rule);
ok(r.stepColor === rgb(RED), 'the active step is red: ' + r.stepColor);
ok(r.brand === rgb(RED), 'and the app name is the one other spark: ' + r.brand);
ok(r.toolBg === 'rgb(0, 0, 0)', 'but the armed tool is black, not red — it is state, not a call to action: ' + r.toolBg);
ok(r.layerBg === 'rgb(0, 0, 0)', 'and so is the active layer: ' + r.layerBg);

console.log('D. the drawing keeps the colors that carry meaning');
// Two brand colors cannot tell thirteen load marks or ten regions apart, and
// the guide's own accessibility note is the reason not to try.
r = await page.evaluate(() => {
  const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const marks = [0,1,2,3,4,5].map(i => zoneColor(i, 1));
  const regions = [0,1,2,3,4].map(i => regionColorCss(i, 1));
  return { snap: v('--snap-color'), stroke: v('--zone-stroke'), sel: v('--zone-selected'),
    safe: v('--safe'), warn: v('--warn'),
    marks: new Set(marks).size, regions: new Set(regions).size };
});
ok(r.snap.toUpperCase() === '#E85D26', 'the snap marker is untouched: ' + r.snap);
ok(/43,\s*87,\s*151/.test(r.stroke), 'the default area outline is untouched: ' + r.stroke);
ok(r.safe.toUpperCase() === '#2E7D52' && r.warn.toUpperCase() === '#C4582E',
   'and so are the status colours: ' + r.safe + ' / ' + r.warn);
ok(r.marks === 6, 'the per-mark palette still tells marks apart: ' + r.marks + ' distinct');
ok(r.regions === 5, 'and the region palette still tells regions apart: ' + r.regions + ' distinct');

console.log('E. type is Calibri, with a mono kept for figures');
r = await page.evaluate(() => {
  const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const h = getComputedStyle(document.querySelector('.step-panel.active h2'));
  return { body: v('--font-body'), display: v('--font-display'), mono: v('--font-mono'),
    weight: h.fontWeight, tracking: h.letterSpacing,
    bodyFace: getComputedStyle(document.body).fontFamily };
});
ok(/^Calibri/.test(r.body) && /^Calibri/.test(r.display),
   'Calibri for text and headings: ' + r.body);
ok(!/Barlow/.test(r.body + r.display), 'Barlow is gone');
ok(/Consolas/.test(r.mono) && !/JetBrains/.test(r.mono),
   'a mono stays for columns of figures, from a face that ships with Windows: ' + r.mono);
ok(r.weight === '700', 'headings are Calibri Bold, per the document styles: ' + r.weight);
ok(r.tracking === 'normal', 'and are not letter-spaced, which the guide asks against: ' + r.tracking);

console.log('F. nothing is fetched from the network any more');
r = await page.evaluate(() => ({
  links: [...document.querySelectorAll('link[href]')].map(l => l.href),
  scripts: [...document.querySelectorAll('script[src]')].map(s => s.src) }));
ok(r.links.length === 0, 'no remote stylesheet: ' + JSON.stringify(r.links));
ok(r.scripts.length === 0, 'no remote script: ' + JSON.stringify(r.scripts));

console.log('G. the dark theme is the same brand, at values that work on black');
r = await page.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'dark');
  const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const out = { red: v('--mcc-red'), accent: v('--accent'), ground: v('--ground'),
    text: v('--text'), sec: v('--text-secondary') };
  document.documentElement.setAttribute('data-theme', 'light');
  return out;
});
ok(r.red.toUpperCase() === RED, 'MCC Red is still the brand value in dark: ' + r.red);
ok(ratio(r.accent, r.ground) >= 4.5, 'the accent is lifted to clear AA on the dark ground: '
   + r.accent + ' at ' + ratio(r.accent, r.ground).toFixed(2) + ':1');
ok(ratio(r.text, r.ground) >= 12, 'body copy stays high contrast: '
   + ratio(r.text, r.ground).toFixed(1) + ':1');
ok(ratio(r.sec, r.ground) >= 4.5, 'and secondary text clears AA too: '
   + ratio(r.sec, r.ground).toFixed(2) + ':1');

console.log('H. the printed sheet follows the document styles');
// Build a small job and capture what printSchedule would write.
const printed = await page.evaluate(() => {
  // A stand-in sheet: no PDF is loaded, but the step gates want a drawing set,
  // a sheet per floor and a schedule before Results will solve at all.
  state.pdf.doc = null; state.pdf.pages = 1; state.pdf.current = 1;
  const sq = (x0,y0,x1,y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  const lv = (name, elev, cap) => ({ id: sid(), name, elevation: elev, slabThickness: 9,
    defaultCapacity: cap, zones: [], slabZones: [],
    alignment: { transform: [1,0,0,1,0,0], ftPerInch: 12, nPoints: 2 } });
  state.levels = [lv('3',30,0), lv('2',20,60), lv('1',10,60), lv('0',0,0)];
  state.levels[3].onGrade = true;
  state.levels.forEach(l => { l.pdfPage = 1; });
  state.project.name = '1268 Kalae';
  state.project.loadingConditions = [{ mark: '1', desc: 'TYP', sdl: 14, ll: 40, confirmed: true }];
  state.levels[0].slabZones.push({ id: sid(), kind: 'edge', polygon: sq(0,0,100,60) });
  state.project.solveStepFt = 2;
  // v12 refuses to print output that does not match the current inputs, and
  // a hand-assigned schedSolve never matches — run the schedule the way the
  // app does instead
  schedPourIdx = 0; runSchedule();
  if (!schedSolve) schedSolve = solveAll({ step: 2 });
  // capture instead of opening a window
  let html = '';
  const real = window.openPrintWindow;
  window.openPrintWindow = () => ({ document: { write: s => { html = s; }, close(){} }, print(){} });
  try { printSchedule(); } finally { window.openPrintWindow = real; }
  return html;
});
ok(printed.length > 500, 'the print view builds: ' + printed.length + ' chars');
ok(/font:11pt\/1\.15 Calibri/.test(printed), 'body is Calibri 11 pt at 1.15 line spacing');
ok(/h1\{font:700 18pt\/1\.15 Calibri/.test(printed), 'Heading 1 is Calibri Bold 18 pt');
ok(new RegExp('mcc-head\\{border-bottom:1pt solid ' + RED).test(printed),
   'with the guide\'s red 1 pt rule beneath it');
ok(/h3\{font:700 14pt/.test(printed), 'Heading 2 is Calibri Bold 14 pt');
ok(new RegExp('th\\{background:#F2F2F2[\\s\\S]{0,200}color:' + GREY).test(printed),
   'minor headings are bold caps in MCC Grey on the light fill');
ok(/\.note\{font:italic 9pt/.test(printed) && printed.includes('.note{font:italic 9pt/1.4 Calibri'),
   'captions and legal are 9 pt grey italic');
ok(!/-apple-system|Roboto/.test(printed.split('</style>')[0]),
   'and no system-font stack is left in the print CSS');
ok(new RegExp('border:1px solid #D9D9D9').test(printed), 'table rules are the guide\'s #D9D9D9');

console.log('I. the logo is a slot for the supplied art, never a redrawing');
r = await page.evaluate(() => {
  const head = mccPrintHead('Title', 'Subtitle');
  return { logo: typeof MCC_LOGO, empty: MCC_LOGO === '', head,
    withArt: (() => { const k = 'data:image/png;base64,AAAA';
      return mccPrintHead('T','S').replace('<h1>', '') && k; })() };
});
ok(r.logo === 'string', 'there is a logo slot');
ok(r.empty, 'empty until the approved art is dropped in');
ok(!/<img/.test(r.head), 'and an empty slot prints the title alone — no stand-in wordmark');
ok(/<h1>Title<\/h1>/.test(r.head) && /class="mcc-head"/.test(r.head),
   'the header is still the guide\'s Heading 1 block: ' + r.head.slice(0, 60));
r = await page.evaluate(() => {
  // the same header once art is present
  const html = `<div class="mcc-head"><img class="mcc-logo" src="X" alt="McClone Construction"><h1>T</h1></div>`;
  const d = document.createElement('div');
  d.innerHTML = `<style>${mccPrintCss()}</style>${html}`;
  document.body.appendChild(d);
  const im = getComputedStyle(d.querySelector('.mcc-logo'));
  const out = { pad: im.paddingTop, h: im.height };
  d.remove();
  return out;
});
ok(r.pad === '14px' && r.h === '42px',
   'and it reserves the guide\'s 1/3 X clear space on every side: '
   + r.pad + ' around a ' + r.h + ' logo');

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

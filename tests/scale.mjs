// THE PLAN'S SCALE, NOT THE DETAILS' (Sep 17 2026)
// Adolfo: "the scales are pretty off. take a look at kinect4 file. the scale
// is 3/32" = 1'-0" on all the plan views. what's happening here?" The scale
// reader took the most common note on the sheet — the 3/8" under every
// detail — so the first hand match defined the grid at a quarter of its
// size and every later fit agreed with it perfectly. The plan's note is the
// one under the plan's own title; a grid found at the wrong scale is
// reported and rescaled in one click.
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
page.on('dialog', d => d.accept());
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
const KIN = path.resolve(here, '..', 'Kinect');
const pdf = fs.readFileSync(path.join(KIN, '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));
const job = fs.readFileSync(path.join(KIN, 'kinect4.json'), 'utf8');
await page.evaluate(async ([b64]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await loadFile(new File([u8], 'kinect.pdf', { type: 'application/pdf' }));
}, [pdf.toString('base64')]);
await page.waitForFunction(() => state.levels.length > 0 && sheetRead && sheetRead.size > 0 && scheduleShape() !== 'none', null, { timeout: 120000 });
await page.waitForTimeout(1000);

console.log('A. every plan sheet reads 3/32" = 1\'-0" from the note under its title');
const A = await page.evaluate(async () => {
  const out = [];
  for (const n of [6, 7, 8, 9, 10, 11, 12]) {
    const items = await pageTextCached(n);
    const pn = planScaleNote(items);
    out.push({ n, f: pn && +pn.ftPerInch.toFixed(3), how: pn && pn.how, all: sheetScaleNotes(items).length, click: +parseSheetScale(items, 2000, 2000).toFixed(3), old: null });
  }
  return out;
});
ok(A.every(a => a.f === 10.667), 'all seven plans: 1" = 10.667\' — ' + A.map(a => `${a.n}:${a.f}`).join(' '));
ok(A.every(a => a.how === 'under the plan title'), 'each read from the note under the plan title');
ok(A.every(a => a.all >= 3), 'even though every sheet carries several scale notes: ' + A.map(a => a.all).join(','));
ok(A.every(a => a.click === 10.667), 'and a grid crossing clicked in the plan gets the plan\'s scale, not the nearest detail\'s');
ok(await page.evaluate(() => looksLikeDetailScale(2.667) && looksLikeDetailScale(1) && !looksLikeDetailScale(10.667) && !looksLikeDetailScale(8)),
  '3/8" and 1" = 1\'-0" are detail scales; 3/32" and 1/8" are plan scales');

console.log('B. a cold start defines the grid at the plan\'s scale');
const B = await page.evaluate(async () => {
  confirmLevels(); autoAssignSheets();
  await proposeMatchAll();
  const def = matchProposal.rows.find(r => r.definesGrid);
  matchProposal.rows.forEach(r => { if (r.fit) r.pick = true; }); applyMatchAll();
  const gx = state.project.grid.x;
  return { def: def && { page: def.page, fpi: +def.fit.ftPerInch.toFixed(3), from: def.scaleFrom, check: def.scaleCheck, v: def.verdict },
    span: gx.length ? +(gx[gx.length - 1].pos - gx[0].pos).toFixed(1) : null, first: gx[0] && gx[0].label, last: gx.length && gx[gx.length - 1].label };
});
ok(B.def && B.def.fpi === 10.667 && /under the plan title/.test(B.def.from), 'the grid-defining sheet takes the plan note: ' + JSON.stringify(B.def));
ok(!B.def.check, 'a nonsense dimension-chain reading (1" = 0.5\') is not raised against it: ' + B.def.check);
ok(B.span > 240 && B.span < 270, `grid 1 to 11 spans about 256 ft, not 64: ${B.first}→${B.last} = ${B.span} ft`);

console.log('C. kinect4, matched at a quarter scale: the grid is reported 4× off and rescaled in one click');
const C2 = await page.evaluate(async ([job]) => {
  applyOpenedJob(JSON.parse(job), 'kinect4');
  setStep('match'); renderMatchPanel();
  for (let i = 0; i < 300 && !(gridScaleCheck && gridScaleCheck.ready); i++) await new Promise(r => setTimeout(r, 100));
  const gx = () => state.project.grid.x, span = () => +(gx()[gx().length - 1].pos - gx()[0].pos).toFixed(1);
  const li = state.levels.findIndex(l => l.name === '4'), a12 = sheetAlignmentFor(li, 12);
  const before = { k: gridScaleCheck.k, n: gridScaleCheck.sheets.length, banner: (document.querySelector('.gs-banner') || {}).textContent || '', status: stepStatus('match').text, span: span(), fpi: a12.ftPerInch };
  const p0 = pixelToBuilding(2000, 2000, a12.transform);
  document.getElementById('btnGridRescale').click();
  for (let i = 0; i < 300 && !(gridScaleCheck && gridScaleCheck.ready); i++) await new Promise(r => setTimeout(r, 100));
  const p1 = pixelToBuilding(2000, 2000, a12.transform);
  const after = { k: gridScaleCheck.k, span: span(), fpi: a12.ftPerInch, ratio: +(p1.bx / p0.bx).toFixed(3), status: stepStatus('match').text, banner: !!document.getElementById('btnGridRescale'),
    matched: matchSheetRows().filter(r => r.matched).length, zonesKept: state.levels.reduce((n, l) => n + l.slabZones.length, 0) };
  await proposeMatchAll();
  const refit = matchProposal.rows.map(r => ({ page: r.page, fpi: r.fit && +r.fit.ftPerInch.toFixed(2), drift: r.drift, v: r.verdict }));
  history.undo();
  return { before, after, refit, undone: span() };
}, [job]);
ok(Math.abs(C2.before.k - 4) < 0.02 && C2.before.n === 7, 'all seven matched sheets disagree with their plan notes by the same 4×: ' + C2.before.k);
ok(/4× too small/.test(C2.before.banner) && /Rescale ×4/.test(C2.before.banner), 'the Match step says so and offers the fix: ' + C2.before.banner.slice(0, 80));
ok(/4.00× off/.test(C2.before.status), 'and the step is held open until it is fixed: ' + C2.before.status);
ok(C2.before.span < 70 && C2.after.span > 240 && C2.after.span < 270, `one click: grid 1→11 ${C2.before.span} ft → ${C2.after.span} ft`);
ok(Math.abs(C2.after.fpi - 10.667) < 0.01 && Math.abs(C2.after.ratio - C2.before.k) < 0.01, 'every match now reads 1" = 10.67\' and places the same pixel 4× further out: ' + JSON.stringify([C2.after.fpi, C2.after.ratio]));
ok(C2.after.matched === 7 && !C2.after.banner && C2.after.k == null, 'the seven matches are kept, and the warning is gone: ' + C2.after.status);
ok(C2.refit.every(r => r.fpi && Math.abs(r.fpi - 10.67) < 0.02 && r.drift != null && r.drift < 0.15), 'a fresh read of every sheet lands within 2" of the rescaled fits: ' + C2.refit.map(r => `${r.page}:${r.fpi}/${r.drift && r.drift.toFixed(3)}`).join(' '));
ok(C2.undone < 70, 'and Ctrl+Z puts the grid back: ' + C2.undone);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

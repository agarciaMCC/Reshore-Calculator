// THE WHOLE GRID, NOT JUST THE CROSSINGS YOU CLICKED (Sep 17 2026)
// Adolfo: "why is the floor grid matching so far off? I think that it has to
// do with the north and south nature of the drawings."
//
// It did not. On the Kinect set every sheet's bubbles land within half a foot
// of the project grid and North and South agree — the fits were fine. The
// project grid held 4 columns and 6 rows on a building with 11 and 19, because
// a hand match only recorded the crossings that were clicked, so the overlay
// drew a handful of lines belonging elsewhere.
//
//  A. the set as saved: the fits agree, the grid is nearly empty
//  B. a matched sheet gives up the rest of its grid, and only its OWN plan's
//     (a key plan's bubbles would put every line in the wrong place)
//  C. where the grid already has a line, the grid wins and the difference is
//     reported on that sheet, and shows up in the stacking check
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

const KIN = path.resolve(here, '..', 'Kinect');
const pdf = fs.readFileSync(path.join(KIN, '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));
const job = JSON.parse(fs.readFileSync(path.join(KIN, 'kinect4.json'), 'utf8'));
await page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
}, [pdf.toString('base64'), job]);

const grid = () => page.evaluate(() => {
  const g = state.project.grid || { x: [], y: [] };
  return { x: (g.x || []).map(e => e.label), y: (g.y || []).map(e => e.label),
           pos: Object.fromEntries([...(g.x||[]).map(e => ['x' + e.label, +e.pos.toFixed(1)]),
                                    ...(g.y||[]).map(e => ['y' + e.label, +e.pos.toFixed(1)])]) };
});

// ── A. the set as saved ────────────────────────────────────────────────
console.log('A. the fits agree; the grid is nearly empty');
const G0 = await grid();
console.log('   grid was ' + G0.x.length + ' columns, ' + G0.y.length + ' rows');
ok(G0.x.length === 4 && G0.y.length === 6, 'the saved grid is only the clicked crossings: ' + JSON.stringify([G0.x, G0.y]));
// every sheet puts the labels it shares in the same place
const agree = await page.evaluate(async () => {
  const out = [];
  for (const lv of state.levels) for (const sh of levelSheets(lv)) {
    const T = sh.alignment && sh.alignment.transform; if (!T) continue;
    const r = await harvestGridFromSheet(sh.page, T);   // reads, and reports drift
    out.push({ level: lv.name, zone: sheetZoneName(lv, sh.page), page: sh.page,
               read: r.read, added: r.added, drift: r.drift });
  }
  return out;
});
console.log('   ' + agree.map(a => `${a.level}${a.zone ? ' ' + a.zone : ''}: read ${a.read}, +${a.added.length}, drift ${a.drift.length}`).join('  '));
ok(agree.every(a => a.drift.length === 0),
  'no sheet disagrees with the project grid — North and South line up: ' + JSON.stringify(agree.filter(a => a.drift.length)));
ok(agree.every(a => a.read >= 15), 'every sheet carries a full grid of its own: ' + JSON.stringify(agree.map(a => a.read)));

// ── B. what it adds ────────────────────────────────────────────────────
console.log('B. the rest of the grid');
const G1 = await grid();
ok(G1.x.length === 11 && G1.y.length >= 18,
  'the grid fills out to the whole building: ' + G1.x.length + ' columns, ' + G1.y.length + ' rows');
ok(['5','6','7','8','9','10','11'].every(l => G1.x.includes(l)), 'every column: ' + JSON.stringify(G1.x));
ok(['C','E','F','I','J','K','L','M','N'].every(l => G1.y.includes(l)), 'every row: ' + JSON.stringify(G1.y));
ok(G0.x.every(l => G1.pos['x' + l] === G0.pos['x' + l]) && G0.y.every(l => G1.pos['y' + l] === G0.pos['y' + l]),
  'and not one line that was already there has moved');
// the rows he was looking at, at the spacing the drawing dimensions state
const sp = (a, b) => Math.round((G1.pos['y' + b] - G1.pos['y' + a]) * 10) / 10;
ok(Math.abs(sp('H', 'I') - 31.2) < 1 && Math.abs(sp('I', 'J') - 31) < 1,
  'H→I and I→J come out at the 31 ft the sheet dimensions: ' + JSON.stringify([sp('H','I'), sp('I','J')]));
// the key plan's bubbles must NOT get in: they would land nowhere near
const sane = await page.evaluate(() => {
  const g = state.project.grid;
  const gaps = a => a.slice(1).map((e, i) => e.pos - a[i].pos);
  return { x: gaps(g.x), y: gaps(g.y) };
});
ok(sane.x.every(d => d > 0 && d < 60) && sane.y.every(d => d >= 0 && d < 60),
  'every line sits a sane bay apart — nothing was read off the key plan: ' + JSON.stringify(sane));

// ── C. a sheet that disagrees ──────────────────────────────────────────
console.log('C. a sheet that disagrees is reported, and the grid stands');
const D = await page.evaluate(async () => {
  const lv = state.levels.find(l => l.name === '2');
  const sh = levelSheets(lv).find(s => s.page === 8);
  const keep = JSON.parse(JSON.stringify(sh.alignment));
  // shove this sheet's fit 6 ft north
  const T = sh.alignment.transform.slice(); T[5] += 6;
  sh.alignment.transform = T;
  const before = JSON.parse(JSON.stringify(state.project.grid));
  const r = await harvestGridFromSheet(8, T);
  const moved = JSON.stringify(state.project.grid) !== JSON.stringify(before);
  // and the way the app records it
  sh.alignment.gridDrift = r.drift.length ? { n: r.drift.length,
    worst: r.drift.reduce((m, d) => Math.abs(d.ft) > Math.abs(m.ft) ? d : m, r.drift[0]),
    labels: r.drift.slice(0, 6).map(d => d.label + ' ' + (d.ft > 0 ? '+' : '') + d.ft + ' ft') } : null;
  const issues = sheetStackRows().filter(x => x.level === '2' && x.page === 8).flatMap(x => x.issues);
  sh.alignment = keep;
  return { n: r.drift.length, added: r.added.length, worst: r.drift.map(d => d.ft), moved, issues };
});
ok(D.n > 0, 'the disagreement is caught: ' + D.n + ' lines');
ok(D.worst.every(f => Math.abs(Math.abs(f) - 6) < 0.6), 'and measured in feet: ' + JSON.stringify(D.worst));
ok(!D.moved, 'the project grid does NOT move to meet it');
ok(D.added === 0, 'and nothing new is written from a sheet that disagrees');
ok(D.issues.some(t => /disagree with the project grid/.test(t)),
  'the stacking check says which sheet and by how much: ' + JSON.stringify(D.issues));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);

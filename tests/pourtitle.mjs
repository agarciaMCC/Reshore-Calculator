// @rules RES-15  (see DECISIONS.md)
// THE POUR LEADS EVERY TITLE. Adolfo, Sep 25 2026: "in the results page, it
// would be good if it was more obvious what level was pouring. Right now its
// just a small dropdown option at the top that then disappears as you scroll.
// Maybe if in the title of the items it had the level before the slab/beam
// details it would be easier to tell." So every region and beam card, the
// no-shore alert and the print headings read "Roof · 9" Slab – L3 …", while
// the plain names (plan labels, keys) stay as they were.
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'test-set.pdf'));
const job = JSON.parse(fs.readFileSync(path.resolve(here, 'fixtures', 'test-job.reshore.json'), 'utf8'));
await page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
  document.getElementById('pageNav').style.display = 'flex';
  renderSidebar(); setStep('results');
}, [pdf.toString('base64'), job]);
await page.waitForFunction(() => schedSolve && schedSolve.levels.some(L => L.solve && L.solve.spatial));
await page.waitForTimeout(300);

console.log('A. the cards lead with the pour');
const cards = await page.evaluate(() => {
  const out = [];
  for (let k = 0; k < schedSolve.levels.length; k++) {
    const L = schedSolve.levels[k];
    if (!L.solve || !L.solve.spatial || !L.solve.regions.length) continue;
    schedPourIdx = k; renderSchedule();
    const heads = [...document.querySelectorAll('.sched-region .card-name')].map(e => e.textContent.trim());
    const pills = [...document.querySelectorAll('.sched-region .card-name .card-pour')].map(e => e.textContent.trim());
    out.push({ pour: L.pour.name, tag: levelTagName(L.pour.name), heads, pills,
               plain: L.solve.regions.map((r, i) => regionLabel(r, i, L)) });
  }
  return out;
});
ok(cards.length >= 1, 'there is at least one pour with regions: ' + cards.map(c => c.pour).join(', '));
for (const c of cards) {
  ok(c.heads.length && c.heads.every(h => h.startsWith(c.tag + ' · ')), `${c.pour}: every card title starts "${c.tag} · ": ` + JSON.stringify(c.heads.slice(0, 2)));
  ok(c.pills.length === c.heads.length && c.pills.every(p => p === c.tag), `${c.pour}: the pour sits in its own pill on every card`);
  ok(c.plain.every(n => !n.startsWith(c.tag + ' · ')), `${c.pour}: the plain region name (plan labels, keys) is unchanged`);
}
const numeric = cards.find(c => /^\d+$/.test(c.pour));
if (numeric) ok(numeric.tag === 'L' + numeric.pour, 'a floor named 3 reads "L3", as in the path names');

console.log('B. the no-shore list and the print say it too');
const other = await page.evaluate(() => {
  const k = schedSolve.levels.findIndex(L => L.solve && L.solve.spatial && L.solve.regions.length);
  const L = schedSolve.levels[k]; schedPourIdx = k;
  const tag = levelTagName(L.pour.name);
  const ns = noShoreItems(L).map(x => x.label);
  let html = '';
  const open = window.open;
  window.open = () => ({ document: { write: h => { html += h; }, close() {} }, focus() {}, print() {} });
  try { printSchedule(); } finally { window.open = open; }
  const legendRows = (html.split('Regions on this placement')[1] || '').split('</table>')[0];
  const cells = [...legendRows.matchAll(/<td>([^<]*)<\/td><td>[\d,.]+ SF/g)].map(m => m[1]);
  const heads = [...html.matchAll(/<h3><span class="sw"[^>]*><\/span>(.*?) &mdash;/g)].map(m => m[1].trim());
  return { tag, ns, cells, heads };
});
ok(other.ns.every(n => n.startsWith(other.tag + ' · ')), 'no-shore alert lines lead with the pour: ' + JSON.stringify(other.ns.slice(0, 1)));
ok(other.cells.length && other.cells.every(n => n.startsWith(other.tag + ' · ')), 'print legend names lead with the pour: ' + JSON.stringify(other.cells.slice(0, 1)));
ok(other.heads.length && other.heads.every(n => n.startsWith(other.tag + ' · ')), 'print region headings lead with the pour: ' + JSON.stringify(other.heads.slice(0, 1)));

console.log('C. beams too, on the 1175 Bothell job');
const bothell = path.resolve(here, '..', '1175_Bothell_Stem_4.reshore.json');
if (fs.existsSync(bothell)) {
  const p2 = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  p2.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
  await p2.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
  await p2.waitForFunction(() => typeof solveAll === 'function');
  await p2.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await p2.setInputFiles('#fileInput', path.resolve(here, 'fixtures', 'test-set.pdf'));
  await p2.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 180000 });
  await p2.waitForTimeout(2000);
  await p2.evaluate(d => applyOpenedJob(d, 'pourtitle'), JSON.parse(fs.readFileSync(bothell, 'utf8')));
  await p2.waitForTimeout(1500);
  await p2.evaluate(() => setStep('results'));
  await p2.waitForFunction(() => schedSolve && schedSolve.levels.length, null, { timeout: 120000 });
  const b = await p2.evaluate(() => {
    for (let k = 0; k < schedSolve.levels.length; k++) {
      const L = schedSolve.levels[k];
      if (!L.solve || !(L.solve.beams || []).length) continue;
      schedPourIdx = k; renderSchedule();
      return { tag: levelTagName(L.pour.name), heads: [...document.querySelectorAll('.sched-beam .card-name')].map(e => e.textContent.trim()) };
    }
    return null;
  });
  ok(b && b.heads.length && b.heads.every(h => h.startsWith(b.tag + ' · ')), 'beam card titles lead with the pour: ' + JSON.stringify(b && b.heads.slice(0, 1)));
  // "remove the grid range in the pour titles" (Sep 25): patches of one
  // condition are told apart by the shore height where it differs
  const r = await p2.evaluate(() => {
    const k = schedSolve.levels.findIndex(L => L.pour.name === 'Roof');
    schedPourIdx = k; renderSchedule();
    return [...document.querySelectorAll('.sched-region:not(.sched-beam) .card-name')].map(e => e.textContent.trim());
  });
  ok(r.length && r.every(h => !/ · \d+-\d+ \/ [A-Z]-[A-Z]/.test(h)), 'no card title carries a grid range: ' + JSON.stringify(r.slice(0, 3)));
  ok(r.some(h => /\(B2\) · 13'-1" under L3$/.test(h)) && r.some(h => /\(B2\) · 13'-9" under L3/.test(h)), 'the B2 patches at different heights are named by the height: ' + JSON.stringify(r.slice(0, 3)));
  await p2.close();
} else console.log('  (1175 job not in this checkout, skipped)');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

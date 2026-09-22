// @rules none
// Screenshots of every step with the 1175 Bothell job loaded on its drawing
// set. Not a test: a way to look at the app.
//   node tests/shots.mjs out-dir [step ...]
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import fs from 'node:fs';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const out = process.argv[2] || path.join(here, '..', 'shots');
fs.mkdirSync(out, { recursive: true });
const steps = process.argv.slice(3);
const want = s => !steps.length || steps.includes(s);

const job = JSON.parse(fs.readFileSync(path.resolve(here, '..', '1175_Bothell_Stem_4.reshore.json'), 'utf8'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setInputFiles('#fileInput', path.resolve(here, 'fixtures', 'test-set.pdf'));
await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 180000 });
await page.waitForTimeout(3000);
await page.evaluate(d => applyOpenedJob(d, 'shots'), job);
await page.waitForTimeout(2500);

const shot = async (name) => {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, name + '.png') });
  console.log('  ' + name + '.png');
};
for (const s of ['drawings', 'levels', 'sheets', 'edge', 'match', 'loads', 'areas', 'results', 'sequence']) {
  if (!want(s)) continue;
  await page.evaluate(id => setStep(id), s);
  if (s === 'results') await page.waitForFunction(() => schedSolve && schedSolve.levels.length, null, { timeout: 120000 }).catch(() => {});
  await shot(s);
  if (s === 'results') {
    // click the first region card to see the highlight
    const clicked = await page.evaluate(() => { const c = document.querySelector('#schedBody .sched-region .sched-go'); if (c) { c.click(); return c.className } return null });
    if (clicked) { await page.waitForTimeout(2500); await shot('results-selected'); }
  }
}
await browser.close();

// @rules none
// Visual regression: screenshots of every step, compared against baselines.
// First run generates baselines; subsequent runs compare with a tolerance.
// In CI a missing baseline is a failure, never created on the spot: CI baselines
// come from the "Visual baselines" workflow and are reviewed before being committed.
//
//   node tests/visual.mjs                 compare (or generate baselines)
//   node tests/visual.mjs --update        regenerate all baselines
//   node tests/visual.mjs results         only that step
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = path.resolve(here, '..');
// Fonts render differently per operating system, so each keeps its own baselines.
const BASELINES = path.join(here, 'baselines', process.platform);
const ACTUALS = path.join(BASELINES, 'actual');
const argv = process.argv.slice(2);
const update = argv.includes('--update');
if (process.env.CI && !update && !fs.existsSync(BASELINES)) {
  console.log(`skip: no ${process.platform} baselines (make them with --update, or the Visual baselines workflow)`);
  console.log('\n0 passed, 0 failed');  // the summary run.mjs reads; without it the skip counts as a crash
  process.exit(0);
}
fs.mkdirSync(BASELINES, { recursive: true });

const names = argv.filter(a => !a.startsWith('--'));
const want = s => !names.length || names.includes(s);

const STEPS = ['drawings', 'levels', 'sheets', 'edge', 'match', 'loads', 'areas', 'results', 'sequence'];
const THRESHOLD = 0.002; // allow 0.2% pixel difference (font rendering, anti-aliasing)

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const jobPath = path.resolve(root, '1175_Bothell_Stem_4.reshore.json');
if (!fs.existsSync(jobPath)) {
  console.log('skip: no test job (1175_Bothell_Stem_4.reshore.json)');
  process.exit(0);
}
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));

const pdfPath = path.resolve(here, 'fixtures', 'test-set.pdf');
if (!fs.existsSync(pdfPath)) {
  console.log('skip: no test PDF (tests/fixtures/test-set.pdf)');
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('file://' + path.resolve(root, 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setInputFiles('#fileInput', pdfPath);
await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 180000 });
await page.waitForTimeout(3000);
await page.evaluate(d => applyOpenedJob(d, 'visual'), job);
await page.waitForTimeout(2500);

for (const s of STEPS) {
  if (!want(s)) continue;
  await page.evaluate(id => setStep(id), s);
  if (s === 'results')
    await page.waitForFunction(() => schedSolve && schedSolve.levels.length, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const actual = await page.screenshot();
  const baseline = path.join(BASELINES, s + '.png');

  if (!update && !fs.existsSync(baseline) && process.env.CI) {
    ok(false, `${s}: no baseline at tests/baselines/${process.platform}/${s}.png`);
    continue;
  }
  if (update || !fs.existsSync(baseline)) {
    fs.writeFileSync(baseline, actual);
    console.log(`  ${update ? 'updated' : 'created'} baseline: ${s}.png`);
    pass++;
    continue;
  }

  const expected = fs.readFileSync(baseline);

  if (Buffer.compare(actual, expected) === 0) {
    ok(true, s);
    continue;
  }

  // pixel-level comparison in the browser (no extra dependencies)
  const diff = await page.evaluate(async ({ actualB64, expectedB64 }) => {
    const load = (b64) => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = 'data:image/png;base64,' + b64;
    });
    const [imgA, imgE] = await Promise.all([load(actualB64), load(expectedB64)]);
    if (imgA.width !== imgE.width || imgA.height !== imgE.height)
      return { mismatch: 1, reason: 'size differs' };

    const c = document.createElement('canvas');
    c.width = imgA.width; c.height = imgA.height;
    const ctx = c.getContext('2d');

    ctx.drawImage(imgA, 0, 0);
    const dA = ctx.getImageData(0, 0, c.width, c.height).data;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(imgE, 0, 0);
    const dE = ctx.getImageData(0, 0, c.width, c.height).data;

    let diffPx = 0;
    const total = c.width * c.height;
    for (let i = 0; i < dA.length; i += 4) {
      const dr = Math.abs(dA[i] - dE[i]);
      const dg = Math.abs(dA[i+1] - dE[i+1]);
      const db = Math.abs(dA[i+2] - dE[i+2]);
      if (dr > 3 || dg > 3 || db > 3) diffPx++;
    }
    return { mismatch: diffPx / total, diffPx, total };
  }, {
    actualB64: actual.toString('base64'),
    expectedB64: expected.toString('base64'),
  });

  if (diff.mismatch <= THRESHOLD) {
    ok(true, s);
  } else {
    fs.mkdirSync(ACTUALS, { recursive: true });
    fs.writeFileSync(path.join(ACTUALS, s + '.png'), actual);
    ok(false, `${s}: ${(diff.mismatch * 100).toFixed(2)}% pixels differ (${diff.diffPx} of ${diff.total}). Actual saved to tests/baselines/${process.platform}/actual/${s}.png`);
  }
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Load the exporter's PDF + job into reshore-calc.html headlessly and check the
// Building step is complete, then solve a pour with a test capacity.
//   node tests/load-in-calc.mjs <reshore-calc.html> <plans.pdf> <job.reshore.json>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
import fs from 'node:fs';
import path from 'node:path';

const [html, pdf, jobPath] = process.argv.slice(2);
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('file://' + path.resolve(html));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// 1. the drawing set first (as the user would), then the job
await page.setInputFiles('#fileInput', path.resolve(pdf));
await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 120000 });
const pages = await page.evaluate(() => state.pdf.pages);
ok(pages === job.levels.length, `PDF loaded with ${pages} pages (job has ${job.levels.length} levels)`);
// let the automatic sheet reading settle
await page.waitForTimeout(8000);
const autoLevels = await page.evaluate(() => state.levels.map(l => [l.name, l.elevation, l.slabThickness, l.pdfPage]));
console.log('  levels the app read from the generated sheets on its own:', JSON.stringify(autoLevels.slice(0, 6)), autoLevels.length > 6 ? `… (${autoLevels.length})` : '');

const opened = await page.evaluate((d) => applyOpenedJob(d, 'revit export'), job);
ok(opened, 'job file accepted by validateJob/applyOpenedJob');
await page.waitForTimeout(3000);

const status = await page.evaluate(() => {
  const ids = ['drawings', 'levels', 'sheets', 'edge', 'match', 'loads', 'areas'];
  const out = {}; for (const id of ids) { try { out[id] = stepStatus(id); } catch (e) { out[id] = { error: e.message }; } }
  return out;
});
for (const [k, v] of Object.entries(status)) console.log(`  step ${k.padEnd(9)} → ${JSON.stringify(v)}`);
ok(status.drawings.done, 'Drawings step done');
ok(status.levels.done, 'Levels step done (confirmed)');
ok(status.sheets.done, 'Sheets step done (every page placed)');
ok(status.edge.done, 'Floor-edge step done (every edge confirmed)');
ok(status.match.done, 'Match step done (every sheet matched + confirmed)');

// 2. geometry sanity in building feet: L7 edge area, openings, beams
const geo = await page.evaluate(() => {
  const out = {};
  for (const name of ['2', '4.5', '5', '7', '8']) {
    const lv = state.levels.find(l => l.name === name); if (!lv) continue;
    const T = lv.alignment.transform;
    const edge = lv.slabZones.find(z => z.kind === 'edge');
    const area = p => Math.abs(polyAreaFt(transformPolyToBuilding(p, T)));
    out[name] = { edgeSF: Math.round(area(edge.polygon)),
      openings: lv.slabZones.filter(z => z.kind === 'opening').map(z => Math.round(area(z.polygon))),
      beams: lv.slabZones.filter(z => z.kind === 'beam').map(z => `${z.label}${z.offsetIn != null ? ' @' + z.offsetIn + '"' : ''}`).slice(0, 8),
      slabs: lv.slabZones.filter(z => z.kind === 'slab' || z.kind === 'grade').map(z => `${z.kind} ${z.thicknessIn}" ${z.offsetIn ? z.offsetIn + '"' : ''} ${Math.round(area(z.polygon))}SF`).slice(0, 8) };
  }
  return out;
});
console.log('  geometry as the app reads it:', JSON.stringify(geo, null, 1));
ok(geo['7'] && Math.abs(geo['7'].edgeSF - 14690) < 60, `L7 edge area ≈ 14,690 SF (got ${geo['7'] && geo['7'].edgeSF})`);

// 3. solve the L8 pour with a flat 54 psf test capacity (mark 5 on the Kalae chart)
const solved = await page.evaluate(() => {
  state.levels.forEach(l => { l.defaultCapacity = 54; });
  const t0 = performance.now();
  const all = solveAll({ step: 2 });
  const L = all.levels.find(x => x.pour.name === '8');
  if (!L) return { error: 'no L8 pour' };
  const S = L.solve;
  const rows = S.regions.map((r, i) => ({ label: regionLabel(r, i), area: Math.round(r.areaSF),
    steps: r.steps.map(s => ({ lv: s.level.name, res: s.resultant == null ? null : +s.resultant.toFixed(1), h: s.shoreHeightFt == null ? null : +s.shoreHeightFt.toFixed(3), grade: !!s.grade, open: !!s.open, noSlab: !!s.noSlab, nOpt: s.options ? s.options.length : null, opts: s.options ? s.options.map(o => (o.shore || o).name).slice(0, 4) : null })) }));
  return { total: Math.round(S.areaSF), spatial: S.spatial, unresolved: S.anyUnresolved, rows: rows.slice(0, 6), n: rows.length, ms: Math.round(performance.now() - t0) };
});
console.log('  L8 pour:', JSON.stringify(solved, null, 1));
const big = solved.rows && solved.rows.sort((a, b) => b.area - a.area)[0];
ok(big && big.steps[0].lv === '7' && Math.abs(big.steps[0].res - 70) < 0.6, `largest L8 region: L7 carries ${big && big.steps[0].res} psf (workbook: 124-54 = 70)`);
ok(big && Math.abs(big.steps[0].h - 9.0833) < 0.02, `shore on L7 is ${big && big.steps[0].h} ft (workbook: 9'-1")`);
ok(big && big.steps[1] && big.steps[1].lv === '6' && Math.abs(big.steps[1].res - 16) < 0.6, `L6 carries ${big && big.steps[1] && big.steps[1].res} psf (workbook: 16)`);
ok(big && big.steps[1] && Math.abs(big.steps[1].h - (159 - 7.5 / 12 - 143.8333)) < 0.02, `shore under L6 stands on the L5 slab top (143'-10") and is ${big && big.steps[1] && big.steps[1].h} ft (workbook L7 tab: 14'-6½")`);

// 3b. the shore catalog must come through whole, with load tables (a short list wipes the HV shores)
const cat = await page.evaluate(() => state.shores.map(s => [s.name, Array.isArray(s.loadTable) && s.loadTable.length > 0]));
ok(cat.length === 10 && cat.every(c => c[1]), `shore catalog: ${cat.length} shores, all with load tables: ${cat.map(c => c[0]).join(', ')}`);
ok(cat.some(c => c[0] === '#5 HV') && cat.some(c => c[0] === 'XL 625'), 'HV #5 and XL 625 are in the catalog');
ok(big && big.steps[1] && big.steps[1].nOpt > 0 && (big.steps[1].opts || []).some(n => /HV|625/.test(n)), `the 14'-6½" shore under L6 has options and an HV/625 among them: ${big && big.steps[1] && JSON.stringify(big.steps[1].opts)}`);

// 4. screenshot of L4.5 with the plan on screen
await page.evaluate(async () => { const li = state.levels.findIndex(l => l.name === '4.5'); state.activeLevelIdx = li; await goToPage(state.levels[li].pdfPage); if (typeof gotoGroup === 'function') try { gotoGroup('areas'); } catch (e) {} renderSidebar(); renderCanvas(); });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(path.dirname(jobPath), 'calc-L45.png') });
await page.evaluate(async () => { const li = state.levels.findIndex(l => l.name === '2'); state.activeLevelIdx = li; await goToPage(state.levels[li].pdfPage); renderSidebar(); renderCanvas(); });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(path.dirname(jobPath), 'calc-L2.png') });

if (errors.length) console.log('  page errors:', errors.slice(0, 5));
ok(errors.filter(e => !/favicon|net::ERR/.test(e)).length === 0, 'no page errors');
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

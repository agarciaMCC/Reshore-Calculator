// Score a calculator job against a Revit model's answer key (RVT-15).
//   node tests/tools/model-score.mjs <job.reshore.json> [--key tests/fixtures/bothell-model.json] [--json]
// The job is read in the page as saved; no drawing set is needed — its zones
// carry their own sheet match.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const root = path.resolve(here, '..', '..');

export async function scoreJob(page, job, raw) {
  await page.addScriptTag({ path: path.join(here, 'model-score.js') });
  return page.evaluate(([d, raw]) => {
    deserializeDoc(d); sortLevelsByElevation();
    const key = modelAnswerKey(raw);
    if (key.error) return { error: key.error };
    return { key: { fit: key.fit, levels: key.levels.map(l => ({ name: l.name, typ: l.typ, onGrade: l.onGrade, edgeSF: Math.round(l.edgeSF), gradeSF: Math.round(l.gradeSF), openings: l.openings.length, zones: l.zones.map(z => [z.type, Math.round(z.sf), z.offIn]), beams: l.beams.length })) }, score: modelScore(key) };
  }, [job, raw]);
}

export async function openApp() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('file://' + path.join(root, 'reshore-calc.html'));
  await page.waitForFunction(() => typeof solveAll === 'function');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  return { browser, page };
}

// one line per level per thing, and the job-wide totals
export function report(r, title) {
  const L = [];
  L.push(`== ${title}`);
  if (r.error) { L.push('  ' + r.error); return L.join('\n'); }
  L.push(`  grid fit: worst ${r.score.fit.worstFt.toFixed(3)} ft over ${r.score.fit.nx}+${r.score.fit.ny} gridlines`);
  let zr = 0, zk = 0, oF = 0, oK = 0, bF = 0, bS = 0, bT = 0;
  for (const s of r.score.levels) {
    if (s.missing) { L.push(`  ${s.name}: no level at this elevation in the job`); continue; }
    L.push(`  ${s.name} (job ${s.job})`);
    L.push(`    floor edge   model ${s.edge.keySF} SF · job ${s.edge.jobSF} SF · overlap ${(s.edge.iou * 100).toFixed(1)}%`);
    if (s.grade) L.push(`    on grade     model ${s.grade.key != null ? s.grade.key : s.grade.keySF} · job ${s.grade.job != null ? s.grade.job : s.grade.jobSF}${s.grade.iou != null ? ` · overlap ${(s.grade.iou * 100).toFixed(1)}%` : (s.grade.ok ? ' · agree' : ' · DISAGREE')}`);
    L.push(`    openings     ${s.openings.found} of ${s.openings.key} found (${s.openings.recallSF}% of the area) · ${s.openings.extra} extra${s.openings.missedSF.length ? ` · missed ${s.openings.missedSF.join(', ')} SF` : ''}`);
    oF += s.openings.found; oK += s.openings.key;
    if (s.zones.key || s.zones.extra.length) {
      L.push(`    slab zones   ${s.zones.right} of ${s.zones.key} right (${s.zones.rightSF} of ${s.zones.keySF} SF)${s.zones.extra.length ? ` · ${s.zones.extra.length} not in the model: ${s.zones.extra.map(x => x.tIn + '" ' + x.sf + ' SF').join(', ')}` : ''}`);
      for (const z of s.zones.list) L.push(`      ${z.right ? 'ok  ' : 'MISS'} ${z.type} ${z.sf} SF${z.offIn ? ` at ${z.offIn > 0 ? '+' : ''}${z.offIn}"` : ''} · covered ${Math.round(z.covered * 100)}%${z.jobT != null ? ` · job says ${z.jobT}"${z.jobOff ? ` at ${z.jobOff}"` : ''}` : ''}`);
      zr += s.zones.rightSF; zk += s.zones.keySF;
    }
    L.push(`    beams        ${s.beams.foundLen}% of length found · ${s.beams.sizedLen}% sized right · model ${s.beams.key}, job ${s.beams.job}${s.beams.extra ? `, ${s.beams.extra} not in the model` : ''}`);
    for (const b of s.beams.list.filter(b => !b.sized)) L.push(`      ${b.found ? 'size' : 'MISS'} ${b.type} ${b.len} ft · covered ${Math.round(b.covered * 100)}%${b.job ? ` · job ${b.job}` : ''}`);
    for (const b of s.beams.list) { bT += b.len; if (b.found) bF += b.len; if (b.sized) bS += b.len; }
  }
  L.push(`  TOTAL openings ${oF}/${oK} · slab zones ${zr}/${zk} SF right · beams ${bT ? Math.round(100 * bF / bT) : '-'}% found, ${bT ? Math.round(100 * bS / bT) : '-'}% sized right (by length)`);
  return L.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const ki = args.indexOf('--key');
  const keyPath = ki >= 0 ? args[ki + 1] : path.join(root, 'tests', 'fixtures', 'bothell-model.json');
  const jobs = args.filter((a, i) => !a.startsWith('--') && (ki < 0 || i !== ki + 1));
  const raw = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const { browser, page } = await openApp();
  for (const j of jobs) {
    await page.reload(); await page.waitForFunction(() => typeof solveAll === 'function');
    const r = await scoreJob(page, JSON.parse(fs.readFileSync(j, 'utf8')), raw);
    console.log(args.includes('--json') ? JSON.stringify(r, null, 1) : report(r, path.basename(j)));
  }
  await browser.close();
}

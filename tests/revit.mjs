// @rules RVT-01, RVT-02, RVT-03, RVT-04, RVT-05  (see DECISIONS.md)
// REVIT -> CALCULATOR (Sep 18 2026). McClone's own scope model, exported as
// IFC, is turned into a calculator job by "Revit export/ifc2reshore.py".
// Adolfo chose: Revit supplies GEOMETRY ONLY and the loading marks are drawn
// in the calculator (RVT-01); FILL / PAD / CURB / PEDESTAL / Plinth / TOS
// SLOPE are never slab and anything named BM or BEAM is a beam whatever its
// category (RVT-02); rotation to project north is an option (RVT-03); the
// drawing set is a rendered plan sheet per level for now (RVT-04); gridline
// tags with an apostrophe or a lowercase letter are not drawn and bubbles
// sit outside the building extents (RVT-05).
// The IFC and its Python stack are not needed here: the classifiers are pure
// functions of a type name, and the Kalae export sitting in Revit export/ is
// the artifact the rules describe.
//  A. the classifiers, straight from the Python
//  B. the exporter's options: rotation is opt-in
//  C. the Kalae job: 42 levels, 42 sheets, geometry only, no excluded kinds
//  D. the Kalae sheets: one plan per level, clean tags only, bubbles outside
//     the building
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const root = path.resolve(here, '..');
const rvt = path.join(root, 'Revit export');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const py = (code) => {
  for (const exe of ['python3', 'python']) {
    const r = spawnSync(exe, ['-c', code], { cwd: rvt, encoding: 'utf8' });
    if (!r.error) return r;
  }
  return null;
};

console.log('A. the classifiers');
const A = py(`
import sys, json; sys.path.insert(0, '.')
import ifc2reshore as m
rec = lambda t: {'type': t}
out = {
  'slab':   [m.is_floor_slab(rec(t)) for t in ['Floor:7 1/2" PT SLAB', 'Floor:9" MS SLAB', 'Floor:5" SOG', 'Floors:Thickened Slab at Jump Ramp']],
  'never':  [m.is_floor_slab(rec(t)) for t in ['Floor:FILL', 'Floor:2" PAD', 'Floor:CURB', 'Floor:PEDESTAL', 'Floor:Plinth', 'Floor:TOS SLOPE', 'Floor:RAMP TRANSITION']],
  'pad_in_word': m.is_floor_slab(rec('Floor:PADDED SLAB')),
  'fnd':    [m.is_floor_slab(rec(t)) for t in ['Pile Cap:36x36', 'Foundation Slab:24"']],
  'bm_floor': [m.is_floor_beam(rec(t)) for t in ['Floor:90x12 3/4 BM', 'Floor:48x24 BEAM', 'Floor:90x18 PT BM']],
  'bm_not_slab': m.is_floor_slab(rec('Floor:90x12 3/4 BM')),
  'bm_word': [bool(m.BEAM_NAME.search(t)) for t in ['24x24 BM', 'Concrete-Rectangular Beam', 'BEAMS', 'CLIMBING', 'BMX RAMP', 'A BM B']],
  'struct': [m.is_structural_beam(rec(t)) for t in ['Concrete-Rectangular Beam:24x24', 'W Shapes:W12x26', 'HSS:6x6', 'L-Angles:L4x4', 'Grade Beam:24x36', 'Beam:GB-1']],
  'size':   [m.size_from_name(t) for t in ['Floor:90x12 3/4 BM', 'Floor:48x24 BEAM', 'Floor:7 1/2" PT SLAB']],
  'thk':    [m.thickness_from_name(t) for t in ['Floor:7 1/2" PT SLAB', 'Floor:10" PT SLAB', 'Floor:90x18 PT BM']],
  'tags':   {t: m.clean_tag(t) for t in ['1', '8', 'AA', 'A2.2', 'F.2', 'G.7', "1'", "9''", '6w', 'L5-8a', 'bbw', '9a', 'M559', 'M12', '']},
  'sog':    [bool(m.SOG.search(t)) for t in ['5" SOG', 'SLAB ON GRADE', '5" SLAB']],
}
print(json.dumps(out))
`);
ok(A && A.status === 0, 'ifc2reshore.py imports without its IFC stack: ' + (A ? (A.stderr || '').trim().slice(-200) : 'no python'));
if (A && A.status === 0) {
  const a = JSON.parse(A.stdout);
  ok(a.slab.every(Boolean), 'PT / MS / SOG / thickened floors are slab: ' + JSON.stringify(a.slab));
  ok(a.never.every(v => v === false), 'FILL, PAD, CURB, PEDESTAL, Plinth, TOS SLOPE (and ramp transitions) are never slab: ' + JSON.stringify(a.never));
  ok(a.pad_in_word === true, '"PAD" is a whole word — a PADDED SLAB is still slab');
  ok(a.fnd.every(v => v === false), 'piles, pile caps and foundation slabs are ignored');
  ok(a.bm_floor.every(Boolean) && a.bm_not_slab === false, 'a Floor named BM or BEAM is a beam, not slab — whatever its Revit category: ' + JSON.stringify(a.bm_floor));
  ok(JSON.stringify(a.bm_word) === JSON.stringify([true, true, false, false, false, true]), 'BM / BEAM as whole words only (BEAMS and BMX are not): ' + JSON.stringify(a.bm_word));
  ok(JSON.stringify(a.struct) === JSON.stringify([true, false, false, false, false, false]), 'concrete framing counts; steel shapes and grade beams do not: ' + JSON.stringify(a.struct));
  ok(a.size[0][0] === 90 && Math.abs(a.size[0][1] - 12.75) < 1e-9 && a.size[1][0] === 48 && a.size[1][1] === 24 && a.size[2][0] === null, 'W x D read off the type name, fractions included: ' + JSON.stringify(a.size));
  ok(a.thk[0] === 7.5 && a.thk[1] === 10 && a.thk[2] === null, 'slab thickness read off the type name: ' + JSON.stringify(a.thk));
  const t = a.tags;
  ok(['1', '8', 'AA', 'A2.2', 'F.2', 'G.7', 'M12'].every(k => t[k] === true), 'uppercase letters, digits and dots are clean tags');
  ok(["1'", "9''", '6w', 'L5-8a', 'bbw', '9a', 'M559', ''].every(k => t[k] === false), 'an apostrophe, a lowercase letter or an M### mechanical line is not: ' + JSON.stringify(t));
  ok(JSON.stringify(a.sog) === JSON.stringify([true, true, false]), 'SOG / SLAB ON GRADE is grade');
}

console.log('B. rotation is an option');
const B = py(`import subprocess,sys; print(subprocess.run([sys.executable,'ifc2reshore.py','--help'],capture_output=True,text=True).stdout)`);
const help = B ? B.stdout : '';
ok(/--rotate ROTATE/.test(help) && /default none/i.test(help), '--rotate exists and defaults to none: ' + (help.match(/--rotate[^\n]*\n[^\n]*/) || [''])[0].replace(/\s+/g, ' '));
ok(/auto/.test(help) && /degrees/.test(help), 'it takes "auto" (number gridlines vertical) or degrees');
const src = fs.readFileSync(path.join(rvt, 'ifc2reshore.py'), 'utf8');
ok(/Rotation to project north is an option, not automatic/.test(src), 'and the docstring states the decision');

console.log('C. the Kalae job is geometry only');
const job = JSON.parse(fs.readFileSync(path.join(rvt, '1268_KALAE-revit.reshore.json'), 'utf8'));
const log = fs.readFileSync(path.join(rvt, '1268_KALAE-revit-export-log.txt'), 'utf8');
const levels = job.levels;
ok(levels.length === 42, '42 levels: ' + levels.length);
ok(levels.every(l => l.zones.length === 0), 'RVT-01: no loading areas on any level — the marks are drawn in the calculator');
ok(/Loading marks are \*\*not\*\* exported/.test(fs.readFileSync(path.join(rvt, 'README.md'), 'utf8')), 'the README says so');
ok(/'loadingConditions': \[\], 'llSchedule': \[\], 'sdlSchedule': \[\]/.test(src), 'and the exporter writes an empty load schedule');
const kinds = {};
for (const l of levels) for (const z of l.slabZones) kinds[z.kind] = (kinds[z.kind] || 0) + 1;
ok(kinds.edge === 42 && kinds.beam > 150 && kinds.opening > 150 && kinds.slab > 20 && kinds.grade >= 1, 'edges, beams, openings, slab steps and grade came through: ' + JSON.stringify(kinds));
const never = /FILL|PAD\b|CURB|PEDESTAL|PLINTH|TOS SLOPE/i;
ok(levels.every(l => l.slabZones.every(z => !never.test(z.label || ''))), 'RVT-02: nothing labelled FILL / PAD / CURB / PEDESTAL / Plinth / TOS SLOPE is in the job');
const beams = levels.flatMap(l => l.slabZones.filter(z => z.kind === 'beam'));
// Floors that are beams carry the BM in their name; Structural Framing members
// (the 36x14 TRANSITION beams) are beams by category and need not
const named = beams.filter(b => /\bBM\b|\bBEAM\b/i.test(b.label || ''));
ok(named.length > 150 && beams.every(b => /\bBM\b|\bBEAM\b|\d+x\d+/i.test(b.label || '')), 'beams came in as beams — ' + named.length + ' of ' + beams.length + ' named BM, the rest framing members with a W x D: ' + JSON.stringify([...new Set(beams.map(b => b.label))].slice(0, 6)));
ok(beams.every(b => b.widthIn > 0 && b.depthIn > 0), 'and a width and depth');
ok(levels.every(l => l.slabZones.filter(z => z.kind === 'edge').length === 1 && l.slabZones.find(z => z.kind === 'edge').confirmed), 'one confirmed floor edge per level');
ok(levels.every(l => l.alignment && l.alignment.confirmed && /^revit/.test(l.alignment.source || '')), 'every sheet matched and confirmed from the model');
ok(job.project.revit && typeof job.project.revit.rotationDeg === 'number' && /rotate auto: .* rotating 51\.87/.test(log), 'RVT-03: Kalae was rotated because it was ASKED for (--rotate auto), and the job records the angle: ' + job.project.revit.rotationDeg);
const grid = job.project.grid;
const clean = /^[A-Z0-9.]+$/;
ok(grid.x.length && grid.y.length && [...grid.x, ...grid.y].every(g => clean.test(g.label)), 'RVT-05: the project grid holds clean tags only: ' + [...grid.x, ...grid.y].map(g => g.label).join(' '));

console.log('D. the sheets: one rendered plan per level, clean bubbles outside the building');
const pages = new Set(levels.map(l => l.pdfPage));
ok(pages.size === 42 && Math.min(...pages) === 1 && Math.max(...pages) === 42, 'RVT-04: every level has its own page, 1..42');
ok(/wrote .*revit-plans\.pdf \(42 pages\)/.test(log), 'the log says 42 pages');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(root, 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
const pdf = fs.readFileSync(path.join(rvt, '1268_KALAE-revit-plans.pdf'));
// the building extents in page px: the union of every level's floor edge
const ext = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity };
for (const l of levels) for (const z of l.slabZones) if (z.kind === 'edge') for (const p of z.polygon) {
  ext.minx = Math.min(ext.minx, p.x); ext.maxx = Math.max(ext.maxx, p.x); ext.miny = Math.min(ext.miny, p.y); ext.maxy = Math.max(ext.maxy, p.y);
}
const sample = [1, 2, 5, 12, 27, 40, 42];
const D = await page.evaluate(async ({ b64, sample, ext }) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  const out = { pages: doc.numPages, sheets: [] };
  for (const n of sample) {
    const items = (await pageTextCached(n)).map(i => ({ s: String(i.s || '').trim(), x: i.x + (i.w || 0) / 2, y: i.y - (i.h || 0) / 2 })).filter(i => i.s);
    // a gridline bubble tag: short, no size (24x12), no inch marks, not a word of the title strip
    const tags = items.filter(i => i.s.length <= 6 && !/\dx\d/i.test(i.s) && !/["·]/.test(i.s) && !/^(of|sheet|scale|typ)/i.test(i.s) && /^[A-Za-z0-9.'-]+$/.test(i.s));
    const inside = tags.filter(t => t.x > ext.minx && t.x < ext.maxx && t.y > ext.miny && t.y < ext.maxy);
    out.sheets.push({ n, title: items.find(i => /FLOOR PLAN$/.test(i.s)) && items.find(i => /FLOOR PLAN$/.test(i.s)).s,
      footer: items.some(i => /geometry only; loading marks are drawn in the calculator/.test(i.s)),
      tags: tags.map(t => t.s), dirty: tags.filter(t => /['a-z]/.test(t.s)).map(t => t.s), inside: inside.map(t => t.s) });
  }
  return out;
}, { b64: pdf.toString('base64'), sample, ext });
ok(D.pages === 42, 'the PDF has 42 pages: ' + D.pages);
for (const s of D.sheets) {
  const lv = levels.find(l => l.pdfPage === s.n);
  ok(s.title && s.title.toUpperCase().includes(String(lv.name).toUpperCase()), `sheet ${s.n} is titled for ${lv.name}: ${s.title}`);
  ok(s.footer, `sheet ${s.n} says geometry only, marks drawn in the calculator`);
  ok(s.tags.length >= 4, `sheet ${s.n} has gridline bubbles: ${s.tags.length}`);
  ok(s.dirty.length === 0, `sheet ${s.n}: no tag with an apostrophe or a lowercase letter is drawn: ${JSON.stringify(s.dirty)}`);
  ok(s.inside.length === 0, `sheet ${s.n}: every bubble sits outside the building extents: ${JSON.stringify(s.inside)}`);
}
ok(D.sheets.every(s => s.tags.some(t => /^\d+$/.test(t)) && s.tags.some(t => /^[A-Z]{2}$/.test(t))), 'numbers and double letters both drawn: ' + JSON.stringify(D.sheets[0].tags));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

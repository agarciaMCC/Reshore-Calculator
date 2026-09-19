// A set that states its loads as LOADING DIAGRAMS instead of a schedule
// table: one key plan per level per load type, with the value written inside
// each area. Run against Reshore Calculator Test 3 (Perkins&Will, WWU
// Interdisciplinary Science Building), fixtures/test3.pdf.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';
import fs from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'test3.pdf'));
const load = () => page.evaluate(async b64 => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  state.project.llSchedule = []; state.project.sdlSchedule = []; state.project.loadingConditions = [];
  delete state.project.loadsFromDiagrams;
  document.getElementById('upload-prompt').style.display = 'none';
  document.getElementById('pageNav').style.display = 'flex';
}, pdf.toString('base64'));
await load();

console.log('A. every callout on both sheets is read');
const raw = await page.evaluate(async () => {
  const out = [];
  for (const n of [1, 2]) {
    const items = await pageTextItems(n);
    const hits = items.filter(i => DIAG_VALUE_RE.test(String(i.s || '').trim().replace(/\s+/g, ' ')));
    const got = parseLoadingDiagrams(items, n);
    out.push({ page: n, raw: hits.length, got: got.length,
      titles: items.filter(i => DIAG_TITLE_RE.test(String(i.s || '').trim().replace(/\s+/g, ' '))).length,
      levels: [...new Set(got.map(g => g.level))], kinds: got.map(g => g.kind) });
  }
  return out;
});
ok(raw[0].titles === 6 && raw[1].titles === 6, 'six plans titled on each sheet: ' + JSON.stringify(raw.map(r => r.titles)));
ok(raw.every(r => r.got === r.raw), 'no callout is dropped: ' + JSON.stringify(raw.map(r => [r.raw, r.got])));
ok(raw[0].raw === 20 && raw[1].raw === 13, '20 callouts on sheet 1 and 13 on sheet 2: ' + JSON.stringify(raw.map(r => r.raw)));
ok(JSON.stringify(raw[0].levels) === JSON.stringify(['LEVEL 1', 'LEVEL 2', 'LEVEL 3']), 'sheet 1 covers levels 1-3: ' + JSON.stringify(raw[0].levels));
ok(JSON.stringify(raw[1].levels) === JSON.stringify(['LEVEL 4', 'PENTHOUSE', 'ROOF']), 'sheet 2 covers 4, penthouse, roof: ' + JSON.stringify(raw[1].levels));
// a callout near the right edge of a left-hand plan must not be claimed by
// the next column's title, which is nearer to it
const edge = await page.evaluate(async () => {
  const items = await pageTextItems(1);
  const got = parseLoadingDiagrams(items, 1);
  const g = got.find(c => Math.round(c.x) === 2297);
  return g ? { kind: g.kind, level: g.level, load: g.load } : null;
});
ok(edge && edge.kind === 'sdl' && edge.level === 'LEVEL 2' && edge.load === 50,
   'the SDL callout at the right edge of the Level 2 dead-load plan stays there: ' + JSON.stringify(edge));

console.log('B. the values, their qualifiers and their notes');
const scan = await page.evaluate(async () => {
  const s = await scanLoadMap();
  return { shape: s.shape, fromDiagrams: !!s.fromDiagrams, pages: s.pagesWith, calls: (s.diagramCalls || []).length,
           ll: s.ll.map(r => ({ mark: r.mark, load: r.load, red: !!r.reducibleFromDrawing, desc: r.desc, c: r.comments })),
           sdl: s.sdl.map(r => ({ mark: r.mark, load: r.load, desc: r.desc, c: r.comments })) };
});
ok(scan.shape === 'split' && scan.fromDiagrams, 'read as a split schedule off the diagrams');
ok(JSON.stringify(scan.pages) === '[1,2]', 'both sheets contributed');
ok(scan.calls === 33, 'all 33 callouts: ' + scan.calls);
ok(scan.sdl.map(r => r.load).join(',') === '10,20,25,30,50,65', 'dead loads, ascending: ' + scan.sdl.map(r => r.load).join(','));
ok(scan.sdl.map(r => r.mark).join(',') === '1,2,3,4,5,6', 'dead-load marks minted 1..6');
ok(scan.ll.map(r => r.load).join(',') === '28,40,80,100,100,100,125', 'live loads, ascending: ' + scan.ll.map(r => r.load).join(','));
ok(scan.ll.map(r => r.mark).join(',') === 'A,B,C,D,E,F,G', 'live-load marks minted A..G');
// the three flavours of reducible, his rule: only a plain "(REDUCIBLE)" counts
const byLoad = q => scan.ll.filter(r => r.load === 100);
ok(byLoad().length === 3, 'the three 100 PSF live loads stay separate conditions');
ok(byLoad().find(r => /non-reducible/.test(r.c)) && !byLoad().find(r => /non-reducible/.test(r.c)).red, 'non-reducible is not reduced');
ok(byLoad().find(r => /at columns/.test(r.c)) && !byLoad().find(r => /at columns/.test(r.c)).red, 'reducible AT COLUMNS is not reduced for the slab');
const plain = byLoad().find(r => /reducible/i.test(r.c) && !/non-reducible|at columns/i.test(r.c));
ok(plain && plain.red, 'a plain reducible IS reduced: ' + JSON.stringify(plain));
ok(scan.ll.find(r => r.load === 28).desc === 'Snow' && !scan.ll.find(r => r.load === 28).red, 'snow load comes in as a live load, not reduced');
ok(scan.ll.find(r => r.load === 125).desc === 'CHEMICAL STORAGE', 'the room name becomes the description');
ok(scan.ll.find(r => r.load === 40).c.includes('LEVEL 1') && scan.ll.find(r => r.load === 40).c.includes('PENTHOUSE'),
   'a value used on two levels lists both: ' + scan.ll.find(r => r.load === 40).c);
// parentheticals that run onto the next lines
const note30 = scan.sdl.find(r => r.load === 30).c, note65 = scan.sdl.find(r => r.load === 65).c;
ok(/INCLUDES 10 PSF MEP ALLOWANCE \+5 PSF PV ALLOWANCE/.test(note30), 'the roof note is joined across its three lines: ' + note30);
ok(/50 PSF SATURATED SOIL WEIGHT \+ 10 PSF MEP BELOW/.test(note65), 'so is the saturated-soil note: ' + note65);

console.log('C. it lands in the Loads step and computes');
await load();
await page.evaluate(async () => { setStep('loads'); await openLoadMapModal(true); });
await page.waitForFunction(() => document.querySelectorAll('#lmSplit tbody tr').length > 0, null, { timeout: 30000 });
ok(await page.$$eval('#lmSplit tbody tr', r => r.length) === 13, 'thirteen rows in the review tables');
ok(await page.$eval('#lmSplit', e => /loading diagrams/.test(e.textContent)), 'the panel says where the numbers came from');
ok(await page.$eval('#lmSplit', e => /reducible at columns.*is taken as NOT reduced/i.test(e.textContent.replace(/\s+/g, ' '))), 'and states the reduction call');
ok(await page.$eval('#lmStatus', e => /7 live-load and 6 superimposed dead-load marks/.test(e.textContent)), 'the status line counts them: ' + await page.$eval('#lmStatus', e => e.textContent.trim()));
const caps = await page.evaluate(() => ({
  G1: pairCapacity('G', '1'), D5: pairCapacity('D', '5'), F5: pairCapacity('F', '5'), A6: pairCapacity('A', '6'),
  shape: scheduleShape(),
}));
// 125 non-reduced over 10 SDL: 10 + 1.6/1.3 x 125 = 163.8 -> 163
ok(caps.G1 === 163, 'G1 = 10 SDL + full 125 LL = 163 PSF: ' + caps.G1);
// 100 non-reduced over 50: 50 + 123.07 = 173
ok(caps.D5 === 173, 'D5 = 50 + full 100 = 173 PSF: ' + caps.D5);
// 100 REDUCED over 50: 50 + 1.6/1.3 x 0.6 x 100 = 123.8 -> 123
ok(caps.F5 === 123, 'F5 = 50 + reduced 100 = 123 PSF: ' + caps.F5);
ok(caps.shape === 'split', 'the project reads as a split schedule');
// and it survives a save/reload
const round = await page.evaluate(() => {
  const doc = serializeDoc();
  const d = typeof doc === 'string' ? JSON.parse(doc) : doc;
  return { ll: (d.project.llSchedule || []).length, sdl: (d.project.sdlSchedule || []).length, flag: !!d.project.loadsFromDiagrams };
});
ok(round.ll === 7 && round.sdl === 6 && round.flag, 'the schedules save with the job: ' + JSON.stringify(round));

console.log('D. a set that HAS a schedule table is untouched');
const other = fs.readFileSync(path.resolve(here, 'fixtures', 'test-set.pdf'));
const kalae = await page.evaluate(async b64 => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  state.project.llSchedule = []; state.project.sdlSchedule = []; state.project.loadingConditions = [];
  const s = await scanLoadMap();
  return { shape: s.shape, fromDiagrams: !!s.fromDiagrams, ll: s.ll.length, sdl: s.sdl.length, marks: s.marks.length,
           flag: !!state.project.loadsFromDiagrams };
}, other.toString('base64'));
ok(!kalae.fromDiagrams && !kalae.flag, 'the diagram reader does not fire on a set with a real schedule');
ok(kalae.shape === 'split' && kalae.ll > 0, 'that set still reads its own schedule: ' + JSON.stringify(kalae));

console.log('E. levels read from this set too, in its own callout style');
await load();
const lv3 = await page.evaluate(async () => {
  state.levels = [];
  const list = await proposeLevelsFromDrawings();
  const r = applyLevelDrawingProposals(list, null);
  return { list: list.map(p => ({ name: p.name, page: p.page, elev: p.elev, n: p.elevN, thick: p.thickIn, thickN: p.thickN, og: p.onGrade })),
           r, levels: state.levels.map(l => ({ name: l.name, elev: l.elevation, thick: l.slabThickness, page: l.pdfPage, og: !!l.onGrade })) };
});
ok(lv3.list.length === 5, 'five floor plans on this set: ' + JSON.stringify(lv3.list.map(p => p.name)));
ok(lv3.list.map(p => p.name).join(',') === '5,4,3,2,1', 'named and ordered from the sheet titles: ' + lv3.list.map(p => p.name).join(','));
ok(lv3.list.map(p => p.page).join(',') === '7,6,5,4,3', 'bound to the right sheets');
// this set writes "T: 329'-0"" / "B: 328'-2"", not T/SLAB
const l2 = lv3.list.find(p => p.name === '2');
ok(l2 && Math.abs(l2.elev - 329) < 1e-6 && l2.n === 9, 'the short T: form is read: Level 2 at 329\'-0" from 9 callouts: ' + JSON.stringify(l2));
ok(lv3.list.find(p => p.name === '5').elev > 376 && lv3.list.find(p => p.name === '3').elev === 347.5, 'and so are the rest');
// the thick zones on the Level-3 sheet must not outvote the typical bay
const l3 = lv3.list.find(p => p.name === '3');
ok(l3.thick === 10, 'Level 3 reads a 10" slab, not the 24" of its thick zones: ' + l3.thick);
// the slab-on-grade sheet has no elevation callouts at all
const l1 = lv3.list.find(p => p.name === '1');
ok(l1 && l1.elev == null && l1.og, 'the slab-on-grade level comes through with no elevation, flagged on grade: ' + JSON.stringify(l1));
ok(lv3.r.created === 5, 'all five created from nothing: ' + JSON.stringify(lv3.r));
ok(lv3.levels.find(l => l.name === '1').elev === null, 'and its elevation is left for him to type');
ok(lv3.levels.filter(l => l.elev != null).length === 4, 'the other four carry theirs');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

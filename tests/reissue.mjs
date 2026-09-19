// @rules BLD-09  (see DECISIONS.md)
// THE DRAWING SET, RE-ISSUED (Sep 17 2026)
// Adolfo: "what happens if I update the PDF and a new sheet is added somewhere
// within the existing set? Like if I forgot to add a level or zone?"
//
// Every binding in a job is a page number, so a sheet inserted mid-set used to
// shift every page after it while the job kept the old numbers — silently
// pointing each floor at its neighbour's plan.
//
//  A. a sheet inserted mid-set: every later sheet is recognised by its own
//     title block and re-numbered, areas travel with it, matches carry over
//     flagged, one undo puts it all back
//  B. the genuinely new page is named; the dozens of sheets the job never
//     binds are not called "new"
//  C. a bound sheet REMOVED from the set is reported, not guessed at
//  D. the same set loaded again moves nothing
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

const KIN = path.resolve(here, '..', 'Kinect');
const FIX = path.resolve(here, 'fixtures');
// kinect-insert.pdf is the Kinect set with one sheet inserted at page 7;
// kinect-drop.pdf is the same set with Level 2 South (page 8) taken out. Both
// are derived from the set beside them and can be rebuilt with pypdf.
const need = [path.join(KIN, '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'),
              path.join(FIX, 'kinect-insert.pdf'), path.join(FIX, 'kinect-drop.pdf')];
const miss = need.filter(f => !fs.existsSync(f));
if (miss.length) { console.log('SKIPPED — missing ' + miss.map(f => path.basename(f)).join(', ')); process.exit(0); }
const base = fs.readFileSync(need[0]).toString('base64');
const ins  = fs.readFileSync(need[1]).toString('base64');
const drop = fs.readFileSync(need[2]).toString('base64');
const job = JSON.parse(fs.readFileSync(path.join(KIN, 'kinect4.json'), 'utf8'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const openBase = async () => page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(JSON.parse(JSON.stringify(d))); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
}, [base, job]);
// the swap loadFile does, with the comparison around it
const reissue = async (b64) => page.evaluate(async ([b64]) => {
  const oldMap = await sheetTitleMap();
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  const newMap = await sheetTitleMap();
  setRemap = buildSetRemap(oldMap, newMap); renderRemapPanel();
  return { moved: setRemap.moved, same: setRemap.same, missing: setRemap.missing,
           newSheets: setRemap.newSheets.map(x => x.page),
           rows: setRemap.rows.map(r => ({ level: r.level, zone: r.zone, from: r.from, to: r.to, how: r.how, areas: r.areas })) };
}, [b64]);
const sheetsNow = () => page.evaluate(() => state.levels.map(l => l.name + ':' + levelSheets(l).map(s => s.page).join(',')).join(' '));
const areaPages = () => page.evaluate(() => Object.fromEntries(state.levels.map(l =>
  [l.name, [...new Set(['loading','slab'].flatMap(L => zonesOf(l,L).map(z => zonePage(l,z))))].sort((a,b)=>a-b)])));

// ── A. a sheet inserted in the middle ──────────────────────────────────
console.log('A. a sheet inserted at page 7');
await openBase();
const before = await sheetsNow(), aBefore = await areaPages();
// The job's binding is read from the job, not pinned: kinect4.json has been
// re-matched since this was written (1B is drawn North/South now too).
const shiftFrom = (s, at) => s.split(' ').map(t => { const [n, ps] = t.split(':');
  return n + ':' + ps.split(',').map(x => +x >= at ? +x + 1 : +x).join(','); }).join(' ');
const boundPages = before.split(' ').flatMap(t => t.split(':')[1].split(',').map(Number));
const movedN = boundPages.filter(x => x >= 7).length, sameN = boundPages.length - movedN;
console.log('   bound as ' + before + ` (${boundPages.length} sheets, ${movedN} of them at or past page 7)`);
ok(/^4:\d+ 3:[\d,]+ 2:[\d,]+ 1B:[\d,]+$/.test(before) && boundPages.length >= 6, 'the job starts bound to the set as issued: ' + before);
const R = await reissue(ins);
console.log('   ' + R.rows.map(r => `${r.level}${r.zone ? ' ' + r.zone : ''} ${r.from}→${r.to}`).join('  '));
ok(R.moved === movedN && R.same === sameN && R.missing === 0, `the sheets at or past the insert move, the rest do not, none lost: ${JSON.stringify([R.moved, R.same, R.missing])} want ${JSON.stringify([movedN, sameN, 0])}`);
ok(R.rows.every(r => r.to != null && r.how === 'its title block'), 'each one recognised by its own title block');
ok(R.rows.every(r => r.to === (r.from >= 7 ? r.from + 1 : r.from)), 'everything after the insert shifts by one: ' + JSON.stringify(R.rows.map(r => [r.from, r.to])));
ok(await page.$$eval('#remapPanel .rm-row', r => r.length) === boundPages.length, 'the panel shows a row per bound sheet');
ok(new RegExp('Re-number ' + movedN + ' sheets?').test(await page.$eval('#rmApply', b => b.textContent)), 'and offers to re-number the ones that moved: ' + await page.$eval('#rmApply', b => b.textContent));
ok(await page.$$eval('#remapPanel .rm-row.move', r => r.length) === movedN, 'with the movers marked');
// nothing is written until applied
ok(await sheetsNow() === before, 'nothing has changed yet: ' + await sheetsNow());
await page.evaluate(() => applySetRemap());
ok(await sheetsNow() === shiftFrom(before, 7), `applying re-numbers them: ${await sheetsNow()} want ${shiftFrom(before, 7)}`);
const aAfter = await areaPages();
const shiftArr = a => a.map(x => x >= 7 ? x + 1 : x);
ok(Object.keys(aBefore).every(k => JSON.stringify(aAfter[k]) === JSON.stringify(shiftArr(aBefore[k]))),
  'and every area travels with its sheet: ' + JSON.stringify(aAfter) + ' was ' + JSON.stringify(aBefore));
const rc = await page.evaluate(() => state.levels.flatMap(l => levelSheets(l).map(s =>
  [l.name + '/' + s.page, !!(s.alignment && s.alignment.transform), !!(s.alignment && s.alignment.recheck)])));
ok(rc.every(x => x[1]), 'every match survives the move: ' + JSON.stringify(rc));
ok(rc.filter(x => x[2]).length === movedN && !rc.find(x => x[0] === '1B/6')[2],
  'the ones that moved are flagged for a look, the one that did not is not: ' + JSON.stringify(rc));
ok((await page.evaluate(() => sheetStackRows().flatMap(r => r.issues))).some(t => /carried over when the drawing set was re-issued/.test(t)),
  'and the stacking check says so');
ok(await page.evaluate(() => { history.undo(); return state.levels.map(l => l.name + ':' + levelSheets(l).map(s => s.page).join(',')).join(' '); }) === before,
  'one undo puts the whole re-map back');

// ── B. what counts as new ──────────────────────────────────────────────
console.log('B. the new page, and only it');
ok(R.newSheets.length === 1, 'one sheet is called new, not the dozens the job never binds: ' + JSON.stringify(R.newSheets));

// ── C. a bound sheet taken OUT of the set ──────────────────────────────
console.log('C. a bound sheet removed from the set');
await openBase();
const D = await reissue(drop);
console.log('   ' + D.rows.map(r => `${r.level}${r.zone ? ' ' + r.zone : ''} ${r.from}→${r.to}`).join('  '));
const gone = D.rows.find(r => r.to == null);
ok(D.missing === 1 && gone && gone.level === '2' && gone.zone === 'South',
  'the sheet that is no longer in the set is named: ' + JSON.stringify(D.rows.filter(r => r.to == null)));
ok(gone.areas > 0, 'along with how many areas are on it: ' + gone.areas);
ok(await page.$$eval('#remapPanel .rm-row.bad', r => r.length) === 1, 'and its row is marked');
const kept = await page.evaluate(() => {
  const lv = state.levels.find(l => l.name === '2');
  const n = zonesOf(lv, 'slab').filter(z => zonePage(lv, z) === 8).length;
  applySetRemap();
  return { n, after: zonesOf(lv, 'slab').filter(z => zonePage(lv, z) === 8).length,
           sheets: levelSheets(lv).map(s => s.page) };
});
ok(kept.after === kept.n, 'applying leaves that sheet and its areas alone rather than guessing: ' + JSON.stringify(kept));

// ── D. the same set again ──────────────────────────────────────────────
console.log('D. the same set loaded again');
await openBase();
const S = await reissue(base);
ok(S.moved === 0 && S.missing === 0 && S.same === boundPages.length, 'nothing moves: ' + JSON.stringify([S.moved, S.same, S.missing]));
ok(S.newSheets.length === 0, 'and nothing is called new: ' + JSON.stringify(S.newSheets));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);

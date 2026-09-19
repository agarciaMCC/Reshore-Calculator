// @rules EDG-08  (see DECISIONS.md)
// EDGE EDITS AFTER THE BUILDING STEP CONFIRM THEMSELVES (Sep 18 2026)
// Adolfo: "the floor edge asks for confirmation all the way back in step one
// if you make a change to slab edge later on. this is not necessary. assume
// that the changes to slab edge after the building step are an assumed
// confirmation."
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
const R = await page.evaluate(() => {
  const SQ = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const T = [1, 0, 0, 1, 0, 0];
  const mk = (name, el) => ({ id: sid(), name, elevation: el, floorToFloor: null, slabThickness: 9, defaultCapacity: 54, rangeFrom: null, rangeTo: null, pdfPage: 1, zones: [], slabZones: [], alignment: { transform: T, points: [] } });
  state.project = { name: 'ec', loadingConditions: [], shoreChoices: {} };
  state.levels = [mk('L2', 20), mk('L1', 10)];
  state.pdf.pages = 1; state.pdf.current = 1; state.activeLevelIdx = 0;
  const lv = state.levels[0];
  const edge = { id: sid(), polygon: SQ(0, 0, 100, 100), kind: 'edge', label: '', confirmed: true };
  lv.slabZones.push(edge);
  const out = {};
  // an edit on the Building step reopens it
  curStep = 'edge';
  edgeEdited(edge); out.onBuilding = !!edge.confirmed;
  // an edit on Areas confirms it again
  curStep = 'areas';
  edgeEdited(edge); out.onAreas = !!edge.confirmed;
  // an unconfirmed edge edited on Areas becomes confirmed
  delete edge.confirmed; edgeEdited(edge); out.unconfirmedOnAreas = !!edge.confirmed;
  // and edited on Building stays unconfirmed
  delete edge.confirmed; curStep = 'edge'; edgeEdited(edge); out.stillOpenOnBuilding = !edge.confirmed;
  out.groups = [curGroup && curGroup().id, (curStep = 'areas', curGroup().id)];
  return out;
});
ok(!R.onBuilding, 'an edit on the Building step reopens a confirmed edge');
ok(R.onAreas, 'an edit on the Areas step leaves it confirmed');
ok(R.unconfirmedOnAreas, 'an unconfirmed edge edited on Areas is taken as confirmed');
ok(R.stillOpenOnBuilding, 'an unconfirmed edge edited on Building stays open for review');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

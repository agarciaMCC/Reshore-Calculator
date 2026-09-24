// @rules ARE-13, MDL-03  (see DECISIONS.md)
// The SOG area is drawn from the floor edge (Sep 24 2026): a floor ticked SOG
// on Levels gets an on-grade area matching its confirmed floor edge; adjusting
// that area makes the floor partly on grade; unticking takes an untouched one
// away; a hand-drawn one is left alone.
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(a === b, m + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

const SQ = [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 700 }, { x: 100, y: 700 }];
const setup = () => page.evaluate(SQ => {
  const mk = (name, elevation, pg) => ({ id: sid(), name, elevation, floorToFloor: null, slabThickness: 8, defaultCapacity: 0, rangeFrom: null, rangeTo: null,
    pdfPage: pg, zones: [], slabZones: [], alignment: { transform: [1, 0, 0, 1, 0, 0], points: [] } });
  state.project = { name: 'sog', loadingConditions: [], shoreChoices: {} };
  state.pdf.pages = 3; state.pdf.current = 1;
  state.levels = [mk('2', 20, 3), mk('1', 10, 2), mk('0', 0, 1)];
  // a drawn, unconfirmed floor edge on the bottom floor's sheet
  state.levels[2].slabZones.push({ id: sid(), polygon: SQ.map(p => ({ ...p })), kind: 'edge', thicknessIn: null, offsetIn: 0, label: '', page: 1 });
  state.activeLevelIdx = 2; state.activeZoneIdx = null; state.results = null;
  setStep('levels'); renderSidebar(); renderNow();
}, SQ);
const grade = () => page.evaluate(() => state.levels[2].slabZones.filter(z => isGradeZone(z)).map(z => ({ n: z.polygon.length, fromEdge: !!z.fromEdge, edited: !!z.edited, page: z.page, label: z.label, first: z.polygon[0] })));
const lvl = () => page.evaluate(() => { const l = state.levels[2]; return { flag: levelGradeFlag(l), whole: levelOnGrade(l), partial: levelGradePartial(l) }; });

console.log('A. tick SOG, then confirm the edge: the area appears, matching the edge');
await setup();
{
  await page.click('#levelList .lvl-sog[data-soglevel="2"]');
  await page.waitForTimeout(100);
  eq((await grade()).length, 0, 'ticking SOG with the edge still unconfirmed draws nothing yet');
  await page.evaluate(() => { edgeConfirm(2, 1); });
  const g = await grade();
  ok(g.length === 1 && g[0].fromEdge && !g[0].edited && g[0].n === 4 && g[0].page === 1 && g[0].first.x === 100, 'confirming the edge draws one on-grade area on its outline: ' + JSON.stringify(g));
  eq(g[0].label, 'Slab on grade', 'named for what it is');
  const l = await lvl();
  ok(l.flag && l.whole && !l.partial, 'the floor is still whole-level slab on grade: ' + JSON.stringify(l));
  ok(await page.evaluate(() => { setStep('areas'); setLayer('slab'); renderSidebar(); return /Slab on grade/.test(document.getElementById('zoneList').textContent); }), 'and it is on the Areas Slab tab to be adjusted');
}

console.log('B. adjusting the area makes the floor partly on grade');
{
  await page.evaluate(() => {
    const lv = state.levels[2]; const arr = zonesOf(lv, 'slab');
    state.activeZoneIdx = arr.findIndex(z => isGradeZone(z)); state.ui.vertexIdx = null;
    const z = arr[state.activeZoneIdx];
    // the podium edge: the east half is elevated
    z.polygon[1].x = 500; z.polygon[2].x = 500; edgeEdited(z);
    renderSidebar();
  });
  const g = await grade(); const l = await lvl();
  ok(g[0].edited && l.flag && !l.whole && l.partial, 'an adjusted SOG area: the level keeps its tick but is no longer whole-level on grade: ' + JSON.stringify([g[0], l]));
  const meta = await page.evaluate(() => { setStep('levels'); renderLevelList(); return { box: document.querySelector('#levelList .sb-item[data-level="2"] .lvl-sog').checked, meta: document.querySelector('#levelList .sb-item[data-level="2"] .lvl-meta').textContent }; });
  ok(meta.box && /in part/.test(meta.meta), 'the Levels row keeps the box ticked and says "in part": ' + meta.meta);
  // re-confirming the edge leaves the adjusted area alone
  await page.evaluate(() => { const e = edgeOf(state.levels[2], 1); delete e.confirmed; edgeConfirm(2, 1); });
  const g2 = await grade();
  ok(g2.length === 1 && g2[0].n === 4 && g2[0].edited, 'a re-confirmed edge does not overwrite an adjusted area: ' + JSON.stringify(g2));
  // the solver: inside the area on grade, outside suspended
  const at = await page.evaluate(() => { const lv = state.levels[2]; return { inside: slabAt(lv, zonesOf(lv, 'slab').find(isGradeZone)).grade, level: levelOnGrade(lv) }; });
  ok(at.inside === true && at.level === false, 'inside the area the slab is on grade; the level as a whole is not: ' + JSON.stringify(at));
}

console.log('C. untick SOG: an untouched area goes, an adjusted one stays; re-tick draws it again');
await setup();
{
  await page.evaluate(() => { edgeConfirm(2, 1); });
  await page.click('#levelList .lvl-sog[data-soglevel="2"]');
  await page.waitForTimeout(100);
  eq((await grade()).length, 1, 'ticking SOG with the edge already confirmed draws the area at once');
  await page.click('#levelList .lvl-sog[data-soglevel="2"]');
  await page.waitForTimeout(100);
  eq((await grade()).length, 0, 'unticking takes the untouched area away');
  await page.click('#levelList .lvl-sog[data-soglevel="2"]');
  await page.waitForTimeout(100);
  await page.evaluate(() => { const z = state.levels[2].slabZones.find(isGradeZone); z.polygon[1].x = 500; z.polygon[2].x = 500; edgeEdited(z); });
  await page.click('#levelList .lvl-sog[data-soglevel="2"]');
  await page.waitForTimeout(100);
  const g = await grade(); const l = await lvl();
  ok(g.length === 1 && g[0].edited && !l.flag, 'unticking leaves an adjusted area where it is (it is his drawing now): ' + JSON.stringify([g, l]));
  await page.evaluate(() => history.undo());
  ok((await lvl()).flag, 'one undo puts the tick back');
}

console.log('D. a hand-drawn on-grade area is respected; the confirm queue draws it too');
await setup();
{
  await page.evaluate(() => {
    const lv = state.levels[2];
    lv.slabZones.push({ id: sid(), polygon: [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 400 }, { x: 200, y: 400 }], kind: 'grade', thicknessIn: 8, offsetIn: 0, label: 'pad', page: 1 });
    lv.onGrade = true; edgeConfirm(2, 1);
  });
  const g = await grade();
  ok(g.length === 1 && !g[0].fromEdge && g[0].label === 'pad', 'with an on-grade area already drawn on the sheet, none is added: ' + JSON.stringify(g));
  // an edge confirmed through Confirm all on the Floor edge step
  await page.evaluate(() => { const lv = state.levels[2]; lv.slabZones = lv.slabZones.filter(z => !isGradeZone(z)); const e = edgeOf(lv, 1); delete e.confirmed; setStep('edge'); edgeConfirmAll(); });
  const g2 = await grade();
  ok(g2.length === 1 && g2[0].fromEdge, 'Confirm all draws it as well: ' + JSON.stringify(g2));
}

await browser.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// @rules UI-28, UI-29, UI-30, UI-31, UI-32  (see DECISIONS.md)
// The Sep 23 2026 foundations: feet-and-inches in every elevation and height
// field with the offset and its elevation working off each other (UI-28);
// fields that commit in place so one click lands and Tab walks the pane
// (UI-29); corner removal scoped to the selected shape (UI-30); no hand tool
// folded behind a disclosure (UI-31); Next at the end of every section with
// the foot bar as a status line (UI-32).
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

const mk = (name, elevation, slab) => ({ id: Math.random().toString(36).slice(2), name, elevation, floorToFloor: null, slabThickness: slab,
  defaultCapacity: 0, rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [] });
const setup = () => page.evaluate(levels => {
  state.project = { name: 'fields', loadingConditions: [], shoreChoices: {} };
  // a stand-in sheet so the Areas step opens (its gates want a set and a sheet per floor)
  state.pdf.pages = 1; state.pdf.current = 1;
  levels.forEach(l => { l.pdfPage = 1; l.alignment = { transform: [1, 0, 0, 1, 0, 0], points: [] }; });
  state.levels = levels; state.activeLevelIdx = 0; state.activeZoneIdx = null; state.results = null;
  setTool('select'); setStep('levels'); renderSidebar(); renderNow();
}, [mk('3', 30, 8), mk('2', 20, 8), mk('1', 10, 8)]);
const active = () => page.evaluate(() => { const e = document.activeElement; if (!e) return null; const d = e.dataset || {};
  return d.f ? d.li + ':' + d.f : d.soglevel ? d.soglevel + ':sog' : d.morelevel ? d.morelevel + ':typ' : e.tagName + '#' + e.id; });

console.log('A. feet and inches read every way the plans write them (UI-28)');
{
  const cases = { '25-4 3/8': 25 + 4.375 / 12, "25'-4 3/8\"": 25 + 4.375 / 12, "25'-4 3/8": 25 + 4.375 / 12, '25-4 3/8"': 25 + 4.375 / 12,
    '25.36': 25.36, '304.5"': 25.375, '-4-6': -4.5, '25': 25, '25-4': 25 + 4 / 12, "25'": 25, "25'-4½\"": 25.375, '25′-4⅜″': 25 + 4.375 / 12,
    '4 1/2"': 0.375, '25 4 3/8': 25 + 4.375 / 12, "112'-6\"": 112.5, '0': 0 };
  const r = await page.evaluate(c => Object.fromEntries(Object.keys(c).map(k => [k, parseFeet(k)])), cases);
  for (const [k, v] of Object.entries(cases)) ok(r[k] != null && Math.abs(r[k] - v) < 1e-9, `parseFeet(${JSON.stringify(k)}) = ${r[k]}, wanted ${v}`);
  eq(await page.evaluate(() => parseFeet('abc')), null, 'nonsense is null');
  eq(await page.evaluate(() => ftInStr(parseFeet(ftInStr(25.3645833)))), "25'-4⅜\"", 'the printed form reads back to itself');
}

console.log('B. the Levels list shows and takes feet and inches');
await setup();
{
  const v = await page.$$eval('#levelList .lvl-edit[data-f="elevation"]', els => els.map(e => e.value));
  eq(v.join('|'), `30'-0"|20'-0"|10'-0"`, 'elevations are shown as feet and inches');
  const hd = await page.$eval('#levelList .tbl-head [data-col="elevation"]', e => e.textContent.trim());
  eq(hd, 'TOS Elev', 'and the column says so');
  await page.click('#levelList .sb-item[data-level="0"] .lvl-edit[data-f="elevation"]');
  await page.keyboard.press('Control+A'); await page.keyboard.type('31-6'); await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  eq(await page.evaluate(() => state.levels[0].elevation), 31.5, "typing 31-6 stores 31.5 ft");
  eq(await page.$eval('#levelList .sb-item[data-level="0"] .lvl-edit[data-f="elevation"]', e => e.value), `31'-6"`, 'and reads back as 31\'-6"');
  ok(await page.$eval('#levelList .sb-item[data-level="0"] .lvl-meta', e => /F2F 11'-6"/.test(e.textContent)), 'floor-to-floor follows in feet and inches');
}

console.log('C. one click lands in the next field; Tab walks the row then the next row; Escape cancels and returns to the plan (UI-29)');
await setup();
{
  await page.click('#levelList .sb-item[data-level="0"] .lvl-edit[data-f="elevation"]');
  await page.keyboard.press('Control+A'); await page.keyboard.type('32');
  // one click, while the first field still holds an uncommitted edit
  await page.click('#levelList .sb-item[data-level="1"] .lvl-edit[data-f="slab"]');
  eq(await active(), '1:slab', 'a single click lands in the field that was clicked');
  eq(await page.evaluate(() => state.levels[0].elevation), 32, 'and the field left behind committed');
  await page.keyboard.press('Control+A'); await page.keyboard.type('9');
  await page.keyboard.press('Tab');
  eq(await active(), '1:sog', 'Tab from the slab goes on to the SOG box in the same row');
  eq(await page.evaluate(() => state.levels[1].slabThickness), 9, 'committing on the way');
  await page.keyboard.press('Tab');
  eq(await active(), '1:typ', 'then the Typical Floor? box');
  await page.keyboard.press('Tab');
  eq(await active(), '2:name', 'then the first field of the next row (the Show and × buttons are not stops)');
  await page.keyboard.press('Tab');
  eq(await active(), '2:elevation', 'and on across that row');
  await page.keyboard.press('Shift+Tab');
  eq(await active(), '2:name', 'Shift+Tab walks back');
  await page.keyboard.press('Shift+Tab');
  eq(await active(), '1:typ', 'and back up into the row above');
  await page.keyboard.press('Tab');
  const before = await page.evaluate(() => state.levels[2].name);
  await page.keyboard.press('Control+A'); await page.keyboard.type('junk');
  await page.keyboard.press('Escape');
  eq(await active(), 'CANVAS#drawCanvas', 'Escape hands focus back to the plan');
  eq(await page.evaluate(() => state.levels[2].name), before, 'and drops the edit in progress');
  const tabs = await page.$$eval('#levelList .sb-item[data-level="0"] button', bs => bs.map(b => b.tabIndex));
  ok(tabs.length && tabs.every(t => t === -1), 'the row\'s icon buttons are not Tab stops: ' + tabs.join(','));
}

console.log('D. a field keeps focus while the pane re-renders under it');
await setup();
{
  await page.click('#levelList .sb-item[data-level="1"] .lvl-edit[data-f="name"]');
  await page.evaluate(() => { const a = document.activeElement; a.setSelectionRange(1, 1); renderLevelList(); renderSidebar(); });
  const r = await page.evaluate(() => { const a = document.activeElement; return { k: a.dataset && a.dataset.li + ':' + a.dataset.f, caret: a.selectionStart } });
  eq(r.k, '1:name', 'a full re-render puts focus back on the same field');
  eq(r.caret, 1, 'with the caret where it was');
}

console.log('E. the offset and its elevation work off each other (UI-28)');
await setup();
{
  await page.evaluate(() => {
    const lv = state.levels[0];
    lv.slabZones.push({ id: sid(), polygon: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }], kind: 'slab', thicknessIn: 10, offsetIn: 0, label: '' });
    lv.slabZones.push({ id: sid(), polygon: [{ x: 120, y: 120 }, { x: 280, y: 120 }, { x: 280, y: 160 }, { x: 120, y: 160 }], kind: 'beam', widthIn: 16, depthIn: 30, offsetIn: null, label: '' });
    setStep('areas'); setLayer('slab'); state.activeZoneIdx = 0; renderSidebar();
  });
  const f = await page.evaluate(() => ({ off: document.getElementById('propOff').value, el: document.getElementById('propOffEl').value, ph: document.getElementById('propOffEl').placeholder }));
  eq(f.off, '', 'a slab area at the level baseline shows a blank offset');
  eq(f.ph, `30'-0"`, 'and the level elevation as the elevation\'s placeholder');
  await page.fill('#propOffEl', '29-6'); await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  eq(await page.evaluate(() => state.levels[0].slabZones[0].offsetIn), -6, "typing the elevation 29'-6\" sets the offset to -6 in");
  eq(await page.$eval('#propOff', e => e.value), '-6', 'and the offset field shows it');
  await page.fill('#propOff', '3'); await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  eq(await page.$eval('#propOffEl', e => e.value), `30'-3"`, 'typing the offset 3 shows the elevation 30\'-3"');
  // a beam left blank inherits the slab area it sits in
  await page.evaluate(() => { state.activeZoneIdx = 1; renderProperties(); });
  const b = await page.evaluate(() => ({ off: document.getElementById('propOff').value, ph: document.getElementById('propOff').placeholder, el: document.getElementById('propOffEl').value, elph: document.getElementById('propOffEl').placeholder }));
  eq(b.off + '|' + b.ph, '|inherit', 'a beam with no offset of its own says inherit');
  eq(b.elph, `30'-3"`, 'and shows the elevation of the slab area it sits in');
  await page.fill('#propOffEl', '30'); await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  eq(await page.evaluate(() => state.levels[0].slabZones[1].offsetIn), 0, 'typing the beam\'s elevation gives it its own offset from the level');
  // no elevation on the level: the elevation field is read-only
  await page.evaluate(() => { state.levels[0].elevation = null; renderProperties(); });
  ok(await page.$eval('#propOffEl', e => e.readOnly && /no elevation/.test(e.placeholder)), 'with no level elevation the field says so and cannot be typed into');
}

console.log('E2. a commit inside an inline properties panel keeps the panel where it is (UI-29)');
await setup();
{
  await page.evaluate(() => {
    const lv = state.levels[0];
    lv.slabZones.push({ id: sid(), polygon: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }], kind: 'slab', thicknessIn: 10, offsetIn: 0, label: '' });
    setStep('areas'); setLayer('slab'); state.activeZoneIdx = 0; renderSidebar();
  });
  const where = () => page.evaluate(() => { const p = document.getElementById('propsContent'); const row = p.closest('#zoneList') ? 'row' : p.closest('#beamPanel') ? 'card' : 'home'; return { where: row, active: document.activeElement.id }; });
  const w0 = await where();
  eq(w0.where, 'row', 'the properties open inline under the area\'s row');
  await page.focus('#propThick'); await page.keyboard.press('Control+A'); await page.keyboard.type('11'); await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const w1 = await where();
  ok(w1.where === 'row' && w1.active === 'propOff', 'Enter commits, the panel stays under the row and focus moves to the next field: ' + JSON.stringify(w1));
  await page.keyboard.type('2'); await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  const w2 = await where();
  ok(w2.where === 'row' && w2.active === 'propOffEl', 'Tab commits and walks on, the panel still under the row: ' + JSON.stringify(w2));
  eq(await page.evaluate(() => [state.levels[0].slabZones[0].thicknessIn, state.levels[0].slabZones[0].offsetIn].join(',')), '11,2', 'both values landed');
}

console.log('F. corners come off the selected shape only (UI-30)');
await setup();
{
  await page.evaluate(() => {
    const lv = state.levels[0];
    const sq = (x, y) => [{ x, y }, { x: x + 100, y }, { x: x + 100, y: y + 60 }, { x: x + 50, y: y + 60 }, { x, y: y + 60 }];
    lv.zones.push({ id: sid(), polygon: sq(100, 100), capacityPSF: 100, mark: 'A', label: '' });
    lv.zones.push({ id: sid(), polygon: sq(300, 100), capacityPSF: 100, mark: 'A', label: '' });
    setStep('areas'); setLayer('loading'); setTool('select'); state.activeZoneIdx = 0; state.ui.vertexIdx = null;
    state.drawing.zoom = 1; state.drawing.panX = 0; state.drawing.panY = 0; renderSidebar(); renderNow();
  });
  const counts = () => page.evaluate(() => state.levels[0].zones.map(z => z.polygon.length));
  eq((await counts()).join(','), '5,5', 'two shapes, five corners each');
  // a sweep across the unselected shape's spare corner
  const s1 = await page.evaluate(() => { const s = canvasToScreen(350, 160); return cornersNearSegment({ x: s.x - 20, y: s.y }, { x: s.x + 20, y: s.y }, 8).length; });
  eq(s1, 0, 'the eraser sweep does not see the unselected shape\'s corners');
  const s2 = await page.evaluate(() => { const s = canvasToScreen(150, 160); return cornersNearSegment({ x: s.x - 20, y: s.y }, { x: s.x + 20, y: s.y }, 8).length; });
  eq(s2, 1, 'but sees the selected shape\'s');
  const bx = await page.evaluate(() => { const a = canvasToScreen(90, 90), b = canvasToScreen(410, 170); return cornersInBox(a, b).map(h => h.zi); });
  ok(bx.length === 5 && bx.every(z => z === 0), 'a box over both shapes collects only the selected one\'s corners: ' + JSON.stringify(bx));
  const h = await page.evaluate(() => { const s = canvasToScreen(350, 160); const h = hitTest(s.x, s.y, { anyVertex: true }); return h && h.kind + ':' + h.zi; });
  ok(h !== 'vertex:1', 'Shift+click aimed at the other shape finds no corner to remove: ' + h);
  await page.evaluate(() => { const s = canvasToScreen(350, 160); handleClick({ button: 0, clientX: s.x, clientY: s.y, shiftKey: true, altKey: false }, s); });
  eq((await counts()).join(','), '5,5', 'and removes nothing');
  await page.evaluate(() => { state.activeZoneIdx = 0; renderSidebar(); const s = canvasToScreen(150, 160); handleClick({ button: 0, clientX: s.x, clientY: s.y, shiftKey: true, altKey: false }, s); });
  eq((await counts()).join(','), '4,5', 'Shift+click on the selected shape removes its corner');
  await page.evaluate(() => { state.activeZoneIdx = null; renderSidebar(); });
  const none = await page.evaluate(() => { const s = canvasToScreen(350, 160); return cornersNearSegment({ x: s.x - 20, y: s.y }, { x: s.x + 20, y: s.y }, 8).length + cornersInBox({ x: 0, y: 0 }, { x: 2000, y: 2000 }).length; });
  eq(none, 0, 'with nothing selected no corner is in reach');
}

console.log('G. nothing is folded behind a disclosure (UI-31)');
await setup();
{
  const r = await page.evaluate(() => {
    const out = {};
    for (const s of ['levels', 'sheets', 'edge', 'match', 'loads', 'areas']) { setStep(s); const d = document.querySelector(`#byhand-${s}, [data-byhand="${s}"]`); out[s] = d ? d.tagName + ':' + !!d.querySelector('.bh-label') : 'none'; }
    setStep('levels');
    return { out, details: document.querySelectorAll('details.by-hand, details[data-byhand]').length };
  });
  ok(Object.values(r.out).every(v => v === 'DIV:true'), 'every step\'s hand tools are a plain captioned row: ' + JSON.stringify(r.out));
  eq(r.details, 0, 'no <details> disclosure is left anywhere');
}

console.log('H. Next lives at the end of every section; the foot bar is a status line (UI-32)');
await setup();
{
  const r = await page.evaluate(() => {
    const out = {};
    for (const s of ['drawings', 'levels', 'sheets', 'edge', 'match', 'loads', 'areas', 'results', 'sequence']) {
      const p = document.querySelector(`.step-panel[data-step="${s}"]`);
      const f = p && p.querySelector(':scope > .sec-next');
      out[s] = f ? { last: p.lastElementChild === f, btn: f.querySelector('.sn-btn').textContent.trim(), disabled: f.querySelector('.sn-btn').disabled } : null;
    }
    const foot = document.getElementById('stepFoot');
    return { out, footBtn: !!foot.querySelector('.btn-primary, #stepNext'), footNow: !!foot.querySelector('.sf-now') };
  });
  const want = { drawings: 'Next: Levels →', levels: 'Next: Sheets →', sheets: 'Next: Floor edge →', edge: 'Next: Match floors →', match: 'Next: Loads →', loads: 'Next: Areas →', areas: 'Next: Results →', results: 'Next: Sequence →' };
  for (const [s, t] of Object.entries(want)) ok(r.out[s] && r.out[s].last && r.out[s].btn === t, `${s} ends with "${t}": ` + JSON.stringify(r.out[s]));
  eq(r.out.sequence, null, 'the last tab has nowhere further to go');
  ok(r.out.levels.disabled, 'a section\'s Next waits until the section is done');
  ok(!r.footBtn && r.footNow, 'the foot bar has the status line and no button');
}

await browser.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

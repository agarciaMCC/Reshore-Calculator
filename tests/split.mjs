// A FLOOR DRAWN ACROSS SEVERAL SHEETS (Kinect, Sep 16 2026).
// Adolfo: "if you have 2 sheets for a level and want them as north and south,
// one sheet will get assigned a floor and when you try to assign the other
// sheet the same floor, the markups will disappear. also, all the area markups
// will show up for both sheets and the auto detect markups get put onto the
// first sheet."
//
//  A. binding a second sheet ADDS it — the first sheet, its match and its
//     areas all survive, on every route that assigns a sheet
//  B. each area stays on its own sheet: drawn, hit-tested and listed there
//  C. the beam/opening scan stamps the sheet it read each shape off
//  D. a load-map area lands on the sheet it actually falls on, not the first
//  E. the Areas list splits by sheet zone, the one on screen first
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/x.js')('playwright');
import path from 'node:path';
import fs from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// the real split-sheet job: Kinect, 1326 — levels 2 and 3 are each drawn
// North/South across two plan sheets
const KIN = path.resolve(here, '..', 'Kinect');
const pdf = fs.readFileSync(path.join(KIN, '2026.06.17 - 1326 - Reshore - Plans - AI.pdf'));
const job = JSON.parse(fs.readFileSync(path.join(KIN, 'Kinect Calcs.json'), 'utf8'));
await page.evaluate(async ([b64, d]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); if (typeof resetPageTextCache === 'function') resetPageTextCache();
  state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 1; state.pdf.pageImages = {};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display = 'none';
}, [pdf.toString('base64'), job]);

const L = await page.evaluate(() => state.levels.map((l, i) => ({ i, name: l.name, pages: levelSheets(l).map(s => s.page) })));
console.log('   ' + JSON.stringify(L));
const li2 = L.find(l => l.name === '2').i;   // North sheet 7 / South sheet 8
const li3 = L.find(l => l.name === '3').i;   // North sheet 9 / South sheet 10

// ── A. a second sheet is ADDED, never a swap ───────────────────────────
console.log('A. a second sheet never replaces the first');
const A = await page.evaluate((li) => {
  const lv = state.levels[li];
  // a fresh floor with one matched sheet and one area on it
  const fresh = { id: 'fresh', name: 'TESTLV', elevation: 400, slabThickness: 8, defaultCapacity: 0,
    pdfPage: null, alignment: null, sheets: [], zones: [], slabZones: [] };
  state.levels.push(fresh);
  const fi = state.levels.length - 1;
  const bound1 = bindPrimarySheet(fresh, 90);
  fresh.alignment = { transform: [1, 0, 0, 1, 0, 0], points: [{ px: 0, py: 0, gx: '1', gy: 'A' }] };
  // NOTHING drawn yet — the old code wiped the floor here
  const bound2 = bindPrimarySheet(fresh, 91);
  if (!bound2) addLevelSheet(fresh, 91);
  const afterEmpty = { pages: levelSheets(fresh).map(s => s.page), match: !!(fresh.alignment && fresh.alignment.transform) };
  // and again with an area on the first sheet
  fresh.slabZones.push({ id: 'keepme', kind: 'slab', page: 90, polygon: [{x:0,y:0},{x:9,y:0},{x:9,y:9}] });
  if (!bindPrimarySheet(fresh, 92)) addLevelSheet(fresh, 92);
  const afterDrawn = { pages: levelSheets(fresh).map(s => s.page), kept: fresh.slabZones.some(z => z.id === 'keepme') };
  state.levels.splice(fi, 1);
  return { bound1, bound2, afterEmpty, afterDrawn };
}, li2);
ok(A.bound1 === true, 'the first sheet binds as the primary');
ok(A.bound2 === false, 'the second does NOT take the primary slot: ' + A.bound2);
ok(JSON.stringify(A.afterEmpty.pages) === '[90,91]', 'an empty floor keeps both sheets: ' + JSON.stringify(A.afterEmpty.pages));
ok(A.afterEmpty.match, 'and keeps the first sheet\'s match');
ok(JSON.stringify(A.afterDrawn.pages) === '[90,91,92]' && A.afterDrawn.kept,
  'a third sheet joins, the drawn area survives: ' + JSON.stringify(A.afterDrawn));

// the level reader: two plan sheets naming the same floor keep both
const A2 = await page.evaluate(() => {
  const lv = { id: 'rd', name: 'RDTEST', elevation: null, slabThickness: 8, defaultCapacity: 0,
    pdfPage: null, alignment: null, sheets: [], zones: [], slabZones: [] };
  state.levels.push(lv);
  const idx = state.levels.indexOf(lv);
  const list = [{ name: 'RDTEST', page: 95, levelIdx: idx, elev: 400, thickIn: 8, thickN: 5 },
                { name: 'RDTEST', page: 96, levelIdx: idx, elev: 400, thickIn: 8, thickN: 5 }];
  applyLevelDrawingProposals(list, null);
  const got = levelSheets(state.levels.find(l => l.id === 'rd')).map(s => s.page);
  state.levels.splice(state.levels.findIndex(l => l.id === 'rd'), 1);
  return got;
});
ok(JSON.stringify(A2) === '[95,96]', '"Read levels from drawings" keeps both plan sheets of one floor: ' + JSON.stringify(A2));

// the sheet-assignment review, two rows for the same floor
const A3 = await page.evaluate(() => {
  const lv = { id: 'sa', name: 'SATEST', elevation: 401, slabThickness: 8, defaultCapacity: 0,
    pdfPage: null, alignment: null, sheets: [], zones: [], slabZones: [] };
  state.levels.push(lv);
  const idx = state.levels.indexOf(lv);
  const list = [{ page: 97, levelIdx: idx, action: 'assign' }, { page: 98, levelIdx: idx, action: 'assign' }];
  applySheetAssignments(list, new Set([97, 98]));
  const got = levelSheets(state.levels.find(l => l.id === 'sa')).map(s => s.page);
  state.levels.splice(state.levels.findIndex(l => l.id === 'sa'), 1);
  return got;
});
ok(JSON.stringify(A3) === '[97,98]', 'the sheet-assignment review keeps both: ' + JSON.stringify(A3));

// ── B. an area belongs to ONE sheet ────────────────────────────────────
console.log('B. each area stays on its own sheet');
const B = await page.evaluate((li) => {
  const lv = state.levels[li];
  const arr = zonesOf(lv, 'slab');
  const byPage = {};
  for (const z of arr) { const p = zonePage(lv, z); byPage[p] = (byPage[p] || 0) + 1; }
  const vis = pg => { state.pdf.current = pg; return arr.filter(z => zoneOnSheet(lv, z)).length; };
  return { byPage, on7: vis(7), on8: vis(8), total: arr.length };
}, li2);
ok(B.on7 + B.on8 === B.total, 'every area of the split floor shows on exactly one of its sheets: ' + JSON.stringify(B));
ok(B.on7 > 0 && B.on8 > 0, 'and both sheets have some: ' + JSON.stringify(B));
// the unstamped scan output is healed from the sheet it was read off
ok(await page.evaluate((li) => {
  const lv = state.levels[li];
  const z = { id: 'x', kind: 'beam', srcPage: 8, polygon: [] };
  return zonePage(lv, z) === 8;
}, li2), 'an area with no page falls to the sheet it was READ off, not the first sheet');

// ── C. the beam/opening scan stamps the sheet ──────────────────────────
console.log('C. the beam scan stamps each shape with its own sheet');
const C = await page.evaluate((li) => {
  const lv = state.levels[li];
  const before = zonesOf(lv, 'slab').length;
  beamScan = { what: 'beams', multi: true, levelIdx: li, page: 7, sel: -1, items: [
    { kind: 'beam', page: 7, levelIdx: li, pick: true, sized: true, widthIn: 12, depthIn: 24,
      polygon: [{x:10,y:10},{x:80,y:10},{x:80,y:20},{x:10,y:20}] },
    { kind: 'beam', page: 8, levelIdx: li, pick: true, sized: true, widthIn: 12, depthIn: 24,
      polygon: [{x:10,y:40},{x:80,y:40},{x:80,y:50},{x:10,y:50}] },
    { kind: 'opening', page: 8, levelIdx: li, pick: true,
      polygon: [{x:200,y:200},{x:240,y:200},{x:240,y:240},{x:200,y:240}] },
  ] };
  acceptBeamScan();
  const added = zonesOf(lv, 'slab').slice(before);
  const got = added.map(z => z.page);
  history.undo();
  return got;
}, li2);
ok(JSON.stringify(C) === '[7,8,8]', 'each accepted shape carries the sheet it was found on: ' + JSON.stringify(C));

// ── D. a load-map area lands on the sheet it falls on ──────────────────
console.log('D. a pending load-map area picks its own sheet');
const D = await page.evaluate((li) => {
  const lv = state.levels[li];
  // where each sheet's match crossings actually sit, in building feet
  const box = pg => {
    const a = levelAlignmentFor(lv, pg);
    const pts = a.points.map(q => pixelToBuilding(q.px, q.py, a.transform));
    return { x: pts.reduce((s, p) => s + p.bx, 0) / pts.length, y: pts.reduce((s, p) => s + p.by, 0) / pts.length };
  };
  const c7 = box(7), c8 = box(8);
  const near = c => [{x:c.x-1,y:c.y-1},{x:c.x+1,y:c.y-1},{x:c.x+1,y:c.y+1},{x:c.x-1,y:c.y+1}];
  const arr = zonesOf(lv, 'loading');
  const n0 = arr.length;
  arr.push({ id: 'pend7', bPoly: near(c7), polygon: [], capacityPSF: 100, fromLoadMap: true });
  arr.push({ id: 'pend8', bPoly: near(c8), polygon: [], capacityPSF: 100, fromLoadMap: true });
  // the first sheet is the one "just matched" — the old code gave it both
  materializeLevelZones(lv, 7);
  const got = { p7: arr.find(z => z.id === 'pend7').page, p8: arr.find(z => z.id === 'pend8').page,
                apart: Math.round(Math.hypot(c7.x - c8.x, c7.y - c8.y)) };
  arr.length = n0;
  return got;
}, li2);
ok(D.apart > 20, 'the two sheets really do cover different ground: ' + D.apart + ' ft apart');
ok(D.p7 === 7 && D.p8 === 8, 'each pending area materialises onto the sheet it falls on: ' + JSON.stringify(D));

// ── E. the Areas list is exactly the sheet on screen ───────────────────
console.log('E. the Areas list shows only the sheet on screen');
await page.evaluate((li) => {
  setStep('areas'); state.activeLevelIdx = li; setLayer('slab');
  setSheetZone(state.levels[li], 7, 'North'); setSheetZone(state.levels[li], 8, 'South');
}, li2);
const onSheet = async (pg) => page.evaluate((pg) => {
  state.pdf.current = pg; state.activeZoneIdx = null; renderSidebar();
  const lv = getActiveLevel();
  const rows = [...document.querySelectorAll('#zoneList .sb-item')].length;
  const here = zonesOf(lv, 'slab').filter(z => zonePage(lv, z) === pg).length;
  const el = document.querySelector('#zoneList .sb-elsewhere');
  return { rows, here, total: zonesOf(lv, 'slab').length, note: el ? el.textContent.trim() : null,
           jump: el ? [...el.querySelectorAll('button[data-gosheet]')].map(b => +b.dataset.gosheet) : [] };
}, pg);
const E7 = await onSheet(7), E8 = await onSheet(8);
ok(E7.rows === E7.here && E8.rows === E8.here,
  'only this sheet\'s areas are listed: ' + JSON.stringify([E7.rows, E7.here, E8.rows, E8.here]));
ok(E7.rows + E8.rows === E7.total, 'and between them they account for the floor: ' + JSON.stringify([E7.rows, E8.rows, E7.total]));
ok(/South/.test(E7.note || '') && /\b\d+ more area/.test(E7.note || ''), 'sheet 7 says what is waiting on South: ' + E7.note);
ok(/North/.test(E8.note || ''), 'sheet 8 says what is waiting on North: ' + E8.note);
ok(JSON.stringify(E7.jump) === '[8]' && JSON.stringify(E8.jump) === '[7]', 'with a button onto that sheet: ' + JSON.stringify([E7.jump, E8.jump]));
// a single-sheet floor says nothing extra
const E1 = await page.evaluate(() => {
  const i = state.levels.findIndex(l => l.name === '1B');
  state.activeLevelIdx = i; state.pdf.current = 6; state.activeZoneIdx = null; renderSidebar();
  return { note: !!document.querySelector('#zoneList .sb-elsewhere'),
           rows: [...document.querySelectorAll('#zoneList .sb-item')].length };
});
ok(!E1.note && E1.rows > 0, 'a floor on one sheet gets no "elsewhere" line: ' + JSON.stringify(E1));

// ── F. the properties open under the row that was clicked ──────────────
console.log('F. the properties open under the row, not at the foot');
const F = await page.evaluate(() => {
  const i = state.levels.findIndex(l => l.name === '1B');
  state.activeLevelIdx = i; state.pdf.current = 6; setLayer('slab');
  state.activeZoneIdx = null; renderSidebar();
  const home = document.getElementById('p-areas');
  const body = document.getElementById('propsContent'), head = document.getElementById('propsHead');
  const parked = body.parentElement === home && head.parentElement === home;
  const rows = [...document.querySelectorAll('#zoneList .sb-item')];
  const pick = rows[Math.min(1, rows.length - 1)];
  const zi = +pick.dataset.zone;
  pick.click();
  const row = document.querySelector('#zoneList .sb-item[data-zone="' + zi + '"]');
  return { parked, zi,
    headAfterRow: row && row.nextElementSibling === head,
    bodyAfterHead: head.nextElementSibling === body,
    inList: !!document.querySelector('#zoneList #propsContent'),
    inline: body.classList.contains('inline'),
    fields: document.querySelectorAll('#propsContent input, #propsContent select').length };
});
ok(F.parked, 'with nothing selected the panel sits at the foot of the step');
ok(F.headAfterRow && F.bodyAfterHead && F.inList, 'clicking a row opens it directly under that row: ' + JSON.stringify(F));
ok(F.inline, 'and it is styled as the row\'s own drawer');
ok(F.fields > 0, 'with its fields intact after the move: ' + F.fields);
const F2 = await page.evaluate(() => {
  state.activeZoneIdx = null; renderSidebar();
  const home = document.getElementById('p-areas');
  const body = document.getElementById('propsContent');
  return { back: body.parentElement === home, inline: body.classList.contains('inline'),
           rows: [...document.querySelectorAll('#zoneList .sb-item')].length };
});
ok(F2.back && !F2.inline, 'deselecting parks it at the foot again: ' + JSON.stringify(F2));
ok(F2.rows > 0, 'and the list survives the move: ' + F2.rows);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);

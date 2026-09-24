// @rules BEM-07, BEM-08  (see DECISIONS.md)
// AUTO-DETECTED BEAMS ARE PROPOSED, NOT WRITTEN (Sep 15 2026)
// Adolfo: on his structural sets beams are a solid light-gray hatch, and the
// size sits in a nearby "BM" label. Chose: propose all of them with NONE
// ticked, read the size from the BM label, flag uncertain matches, ignore
// columns. And (BEM-07) anything named BM or BEAM is a beam whatever else the
// label says; a COL / FOOTING / third dimension is not.
// Run against the 1175 Bothell Stem 4 set (tests/fixtures/test-set.pdf).
//  A. the size label parser: BM / BEAM / bare size are beams; COL, FOOTING,
//     a third dimension are not
//  B. sheet 4: every gray beam is found, sized off its label, and NOT ticked
//  C. sheet 3: a footing is not offered as a beam; an unlabelled gray run is
//     offered with its size blank and the reason stated
//  D. the review panel: nothing written until Apply; Apply adds only the
//     ticked shapes, blank depths counted
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

console.log('A. what counts as a beam size label');
const A = await page.evaluate(() => {
  const p = t => { const r = parseSizeLabel(t); return r && { w: r.wIn, d: r.dIn, beam: r.isBeam, other: r.isOther }; };
  return { bm: p('22X17 BM'), beam: p('24 x 20 BEAM'), bare: p('45X17'), frac: p('31 3/4 x 24 BM'), quote: p('22" x 17" BM'),
           col: p('24X24 COL'), column: p('24X24 COLUMN'), ftg: p('12 X 12 X 33 FOOTING'), third: p('24X24X48'), pad: p('36X36 PAD'), none: p('LEVEL 3 SOFFIT PLAN') };
});
ok(A.bm && A.bm.beam && A.bm.w === 22 && A.bm.d === 17, '"22X17 BM" is a 22x17 beam: ' + JSON.stringify(A.bm));
ok(A.beam && A.beam.beam && A.beam.w === 24 && A.beam.d === 20, '"24 x 20 BEAM" too: ' + JSON.stringify(A.beam));
ok(A.bare && A.bare.beam, 'a bare WxD with no word is taken as a beam size: ' + JSON.stringify(A.bare));
ok(A.frac && A.frac.beam && Math.abs(A.frac.w - 31.75) < 1e-9, 'a fractional width reads: ' + JSON.stringify(A.frac));
ok(A.quote && A.quote.beam && A.quote.w === 22, 'inch marks are fine: ' + JSON.stringify(A.quote));
ok(A.col && !A.col.beam && A.col.other, 'COL is not a beam: ' + JSON.stringify(A.col));
ok(A.column && !A.column.beam && A.column.other, 'nor COLUMN');
ok(A.ftg && !A.ftg.beam && A.ftg.other, 'nor a FOOTING: ' + JSON.stringify(A.ftg));
ok(A.third && !A.third.beam && A.third.other, 'nor anything with a third dimension: ' + JSON.stringify(A.third));
ok(A.pad && !A.pad.beam, 'nor a PAD');
ok(A.none === null, 'a plan title is no size at all');

// ---- the 1175 set ----
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'test-set.pdf'));
await page.evaluate(async b64 => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = 4; state.pdf.pageImages = {};
  document.getElementById('upload-prompt').style.display = 'none';
  document.getElementById('pageNav').style.display = 'flex';
  const T = [1, 0, 0, 1, 0, 0];
  const mk = (name, el, pg) => ({ id: sid(), name, elevation: el, floorToFloor: null, slabThickness: 9, defaultCapacity: 54, rangeFrom: null, rangeTo: null, pdfPage: pg, zones: [], slabZones: [], alignment: { transform: T, points: [], ftPerInch: 1 } });
  state.levels = [mk('L4', 40, 4), mk('L3', 30, 3), mk('L2', 20, 2)];
  state.project = { name: 'scan', loadingConditions: [], shoreChoices: {} };
  state.activeLevelIdx = 0; renderSidebar();
}, pdf.toString('base64'));

console.log('B. sheet 4: every gray beam, sized, none ticked');
const B = await page.evaluate(async () => {
  const r = await detectGreyShapes(4);
  return { labels: r.labels, items: r.items.map(i => ({ kind: i.kind, w: i.widthIn, d: i.depthIn, label: i.label, why: i.why, sized: i.sized, pick: i.pick, aspect: i.aspect })) };
});
console.log('   ' + JSON.stringify(B.items.map(i => [i.kind, i.w, i.d, i.why])));
ok(B.items.length === 7, 'seven gray shapes on sheet 4: ' + B.items.length);
ok(B.items.every(i => i.kind === 'beam'), 'all of them beams');
ok(B.items.every(i => i.sized && i.w > 0 && i.d > 0 && /BM$/.test(i.label)), 'every one sized off a BM label: ' + JSON.stringify(B.items.map(i => i.label)));
ok(B.items.every(i => i.why === 'from label'), 'and says so');
ok(B.items.every(i => i.pick === false), 'BEM-08: NONE is ticked to begin with');
ok(B.items.filter(i => i.w === 45 && i.d === 17).length >= 1 && B.items.filter(i => i.w === 24 && i.d === 17).length >= 2 && B.items.filter(i => i.w === 22 && i.d === 17).length >= 1,
   'the 45x17, the 24x17s and the 22x17 are all there: ' + JSON.stringify(B.items.map(i => i.w + 'x' + i.d)));
ok(B.items.every(i => i.aspect >= 3), 'each is long and thin, as a beam is: ' + JSON.stringify(B.items.map(i => i.aspect)));

console.log('C. sheet 3: footings are not beams; an unlabelled run is offered blank');
const C = await page.evaluate(async () => {
  const r = await detectGreyShapes(3);
  return r.items.map(i => ({ kind: i.kind, w: i.widthIn, d: i.depthIn, label: i.label, why: i.why, sized: i.sized, pick: i.pick }));
});
console.log('   ' + JSON.stringify(C.map(i => [i.kind, i.w, i.d, i.label, i.why])));
ok(C.length >= 8, 'a sheet full of gray: ' + C.length);
ok(C.every(i => i.pick === false), 'none ticked here either');
const ftg = C.filter(i => /FOOTING/.test(i.label || ''));
ok(ftg.length >= 1 && ftg.every(i => i.kind !== 'beam' && !i.sized && /not a beam size/.test(i.why)), 'the shape by the "12 X 12 X 33 FOOTING" label is not offered as a beam, and the reason names the label: ' + JSON.stringify(ftg));
const blank = C.filter(i => i.kind === 'beam' && !i.sized);
ok(blank.length >= 1 && blank.every(i => i.w === null && i.d === null && /no size label|two labels compete/.test(i.why)), 'a gray run with no BM label along it is offered with its size blank and the reason stated: ' + JSON.stringify(blank.map(i => i.why)));
ok(C.filter(i => i.sized).every(i => /BM$/.test(i.label)), 'everything sized was sized off a BM label');

console.log('D. the review panel writes nothing until Apply, then only what is ticked');
const D = await page.evaluate(async () => {
  state.pdf.current = 4; state.activeLevelIdx = 0;
  const lv = state.levels[0];
  const before = zonesOf(lv, 'slab').length;
  await startBeamScan();
  const panel = document.getElementById('beamPanel');
  // ARE-10: the proposal opens as a one-at-a-time queue; the tick list is one click away
  const queueFirst = !!panel.querySelector('#bsAccept') && !panel.querySelector('input[data-bpick]');
  panel.querySelector('#bsList').click();
  const boxes = [...panel.querySelectorAll('input[data-bpick]')];
  const checked0 = boxes.filter(b => b.checked).length;
  const text = panel.textContent.replace(/\s+/g, ' ');
  const applyDisabled = panel.querySelector('#bsApply').disabled;
  const stillNone = zonesOf(lv, 'slab').length;
  // tick two, apply (the panel re-renders on every tick, so re-find the box)
  panel.querySelector('input[data-bpick="0"]').click();
  panel.querySelector('input[data-bpick="1"]').click();
  const applyAfterTick = panel.querySelector('#bsApply').disabled;
  const btnText = panel.querySelector('#bsApply').textContent.trim();
  acceptBeamScan();
  const after = zonesOf(lv, 'slab');
  return { before, queueFirst, n: boxes.length, checked: checked0, text, applyDisabled, stillNone, applyAfterTick, btnText,
           added: after.length - before, kinds: after.map(z => [z.kind, z.widthIn, z.depthIn, !!z.fromSheet, z.srcPage]), panelGone: !beamScan };
});
ok(D.queueFirst, 'the proposal opens one candidate at a time, with Accept (ARE-10)');
ok(D.n === 7 && D.checked === 0, 'seven rows in the list, none ticked: ' + JSON.stringify([D.n, D.checked]));
ok(/Nothing is ticked to begin with/.test(D.text) && /nothing is written until you apply/i.test(D.text), 'the panel says so in words');
ok(/size comes from a BM label/.test(D.text), 'and where the size comes from');
ok(D.applyDisabled && D.stillNone === D.before, 'Apply is disabled and nothing has been written');
ok(!D.applyAfterTick && /Add 2 shapes/.test(D.btnText), 'ticking two arms Apply for exactly those two: ' + D.btnText);
ok(D.added === 2, 'Apply adds two shapes, not seven: ' + D.added);
ok(D.kinds.slice(-2).every(k => k[0] === 'beam' && k[1] > 0 && k[2] > 0 && k[3] === true && k[4] === 4), 'both are sized beams stamped with the sheet they came from: ' + JSON.stringify(D.kinds.slice(-2)));
ok(D.panelGone, 'and the panel closes');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

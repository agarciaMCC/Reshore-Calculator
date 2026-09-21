// @rules UI-20, UI-21  (see DECISIONS.md)
// THE APP IS WAITING FOR YOU, ON THE SHEET (Sep 21 2026). Adolfo: "when we
// pick floor edge from sheet, the selection menu should show up inline in
// the viewing window, right now its not obvious that the menu is waiting for
// a selection below because it doesnt automatically make it obvious that you
// need to pick from the left pane."
//  A. nothing pending: no ring, no bar
//  B. the candidates are on the sheet — hit-testing, hover, pick, accept
//  C. one bar, in one place: the drawing tools arm it, alignment keeps its
//     own and never shows two
//  D. keyboard: arrows cycle, Enter accepts, Escape backs out
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// a job with one floor and a two-candidate read: the outer outline and a
// smaller one nested inside it, the shape the detector's doubtful reads take
const setup = () => page.evaluate(() => {
  state.levels = [{ name: 'L2', zones: [], slabZones: [], pdfPage: null }];
  state.activeLevelIdx = 0; state.activeZoneIdx = null;
  setTool('select');
  const sq = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  edgeProposal = {
    levelIdx: 0, page: null, sel: 0, hover: null, ms: 12, existing: 0,
    cands: [{ polygon: sq(100, 100, 400, 300), notes: [], frac: .5, why: 'heavy lines', areaSF: 1200 },
            { polygon: sq(150, 150, 100, 100), notes: ['smaller than the plan'], frac: .1, why: 'inner', areaSF: 300 }],
    polygon: sq(100, 100, 400, 300), areaSF: 1200, notes: []
  };
  renderEdgePanel(); renderCanvas();
});

console.log('A. nothing pending — the canvas is quiet');
{
  const q = await page.evaluate(() => ({
    act: pendingAction(),
    armed: document.getElementById('canvas-wrap').classList.contains('armed'),
    bar: document.getElementById('pendingBar').classList.contains('visible')
  }));
  ok(q.act === null && !q.armed && !q.bar, 'no ring and no bar with nothing pending: ' + JSON.stringify(q));
}

console.log('B. the candidates are on the sheet');
await setup();
{
  const b = await page.evaluate(() => ({
    armed: document.getElementById('canvas-wrap').classList.contains('armed'),
    bar: document.getElementById('pendingBar').classList.contains('visible'),
    text: document.getElementById('pendingBar').textContent.replace(/\s+/g, ' '),
    // the line beats the inside of a shape, and the smallest wins, so the
    // nested candidate is reachable
    onLine: edgeCandAt({ x: 100, y: 250 }),
    inInner: edgeCandAt({ x: 200, y: 200 }),
    inOuter: edgeCandAt({ x: 450, y: 350 }),
    offSheet: edgeCandAt({ x: 900, y: 900 }),
    rows: document.querySelectorAll('#edgePanel .ec-row').length
  }));
  ok(b.armed, 'the canvas wears the ring');
  ok(b.bar && /Pick the slab edge for L2/.test(b.text), 'the bar names what is being asked: ' + b.text.slice(0, 60));
  ok(/1 of 2/.test(b.text), 'and which outline you are on');
  ok(b.onLine === 0 && b.inInner === 1 && b.inOuter === 0 && b.offSheet === -1,
    'the outline under the cursor, smallest first: ' + JSON.stringify(b));
  ok(b.rows === 2, 'the pane still lists both, with the reasons');

  // hovering the row lights the outline, and a click on the plan picks it
  const h = await page.evaluate(() => {
    document.querySelectorAll('#edgePanel .ec-row')[1].dispatchEvent(new MouseEvent('mouseenter'));
    const hov = edgeProposal.hover;
    const s = canvasToScreen(200, 200);
    handleClick({ button: 0 }, { x: s.x, y: s.y });
    return { hov, sel: edgeProposal.sel, written: zonesOf(state.levels[0], 'slab').length };
  });
  ok(h.hov === 1, 'hovering a row lights its outline on the plan');
  ok(h.sel === 1 && h.written === 0, 'a click on the plan picks that outline and writes nothing yet: ' + JSON.stringify(h));

  // a click on bare sheet is not an answer
  const m = await page.evaluate(() => {
    const s = canvasToScreen(900, 900);
    handleClick({ button: 0 }, { x: s.x, y: s.y });
    return { sel: edgeProposal && edgeProposal.sel, still: !!edgeProposal, written: zonesOf(state.levels[0], 'slab').length };
  });
  ok(m.still && m.sel === 1 && m.written === 0, 'a click on bare sheet changes nothing: ' + JSON.stringify(m));

  // the second click on the picked outline accepts it
  const a = await page.evaluate(() => {
    const s = canvasToScreen(200, 200);
    handleClick({ button: 0 }, { x: s.x, y: s.y });
    const z = zonesOf(state.levels[0], 'slab');
    return { gone: !edgeProposal, n: z.length, kind: z[0] && z[0].kind, corners: z[0] && z[0].polygon.length,
      armed: document.getElementById('canvas-wrap').classList.contains('armed'),
      bar: document.getElementById('pendingBar').classList.contains('visible') };
  });
  ok(a.gone && a.n === 1 && a.kind === 'edge' && a.corners === 4, 'clicking the picked outline again uses it: ' + JSON.stringify(a));
  ok(!a.armed && !a.bar, 'and the ring and the bar go with it');
  await page.evaluate(() => history.undo());
}

console.log('C. one bar, in one place');
{
  const d = await page.evaluate(() => {
    setTool('polygon'); renderNow();
    const bar = document.getElementById('pendingBar');
    const t = bar.textContent;
    const armed = document.getElementById('canvas-wrap').classList.contains('armed');
    setTool('fill'); renderNow();
    const f = document.getElementById('pendingBar').textContent;
    setTool('select'); renderNow();
    return { t, armed, f, off: document.getElementById('pendingBar').classList.contains('visible') };
  });
  ok(d.armed && /Click the corners on the plan/.test(d.t), 'an armed drawing tool says so over the drawing: ' + d.t.slice(0, 40));
  ok(/Click inside an area/.test(d.f), 'so does the fill tool: ' + d.f.slice(0, 40));
  ok(!d.off, 'and the bar clears when the tool goes back to select');

  const al = await page.evaluate(() => {
    state.align = { active: true, levelIdx: 0, points: [], pendingPx: null, sheetScale: null };
    updateAlignStatus(); renderPendingBar(true);
    const r = { act: pendingAction().id, own: !!pendingAction().own,
      armed: document.getElementById('canvas-wrap').classList.contains('armed'),
      pending: document.getElementById('pendingBar').classList.contains('visible'),
      align: document.getElementById('alignStatusBar').classList.contains('visible') };
    state.align = { active: false, levelIdx: null, points: [], pendingPx: null };
    updateAlignStatus(); renderPendingBar(true);
    return r;
  });
  ok(al.act === 'align' && al.own, 'matching a floor is a pending action too');
  ok(al.armed && al.align && !al.pending, 'it keeps its own bar and the second one stays away: ' + JSON.stringify(al));
}

console.log('D. the whole pick from the keyboard');
await setup();
{
  const k = await page.evaluate(() => {
    const key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    key('ArrowRight'); const one = edgeProposal.sel;
    key('ArrowRight'); const back = edgeProposal.sel;
    key('ArrowLeft'); const left = edgeProposal.sel;
    key('Enter');
    return { one, back, left, written: zonesOf(state.levels[0], 'slab').length, gone: !edgeProposal };
  });
  ok(k.one === 1 && k.back === 0 && k.left === 1, 'the arrows cycle the outlines: ' + JSON.stringify(k));
  ok(k.gone && k.written === 1, 'Enter uses the one on screen');
  await page.evaluate(() => history.undo());

  await setup();
  const e = await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { gone: !edgeProposal, written: zonesOf(state.levels[0], 'slab').length,
      armed: document.getElementById('canvas-wrap').classList.contains('armed'),
      bar: document.getElementById('pendingBar').classList.contains('visible') };
  });
  ok(e.gone && e.written === 0 && !e.armed && !e.bar, 'Escape backs the whole thing out: ' + JSON.stringify(e));
}

await browser.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

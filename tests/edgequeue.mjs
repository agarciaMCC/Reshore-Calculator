// @rules UI-35, UI-16, EDG-01  (see DECISIONS.md)
// The floor edge as a queue (Sep 23 2026): the sheets walked from the bottom
// floor up in the bar over the plan — Confirm · Adjust · Try the next outline
// · Draw by hand · Skip — with the keyboard and the outline itself doing the
// same; the corner tools on the row under Adjust; Detect again on this sheet;
// no on-grade column on the rows.
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
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} state.levels = []; state.project = { name: 'edgequeue', loadingConditions: [], shoreChoices: {} }; });
await page.setInputFiles('#fileInput', path.resolve(here, 'fixtures', 'test-set.pdf'));
await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 120000 });
await page.waitForTimeout(3000);
await page.evaluate(() => { confirmLevels(); sheetUnsure().length = 0; setStep('edge'); });
await page.waitForFunction(() => typeof edgeQueueActive === 'function' && edgeQueueActive() && edgeProposal && edgeProposal.queue, null, { timeout: 300000, polling: 1000 });
await page.waitForTimeout(500);
const bar = () => page.evaluate(() => document.getElementById('pendingBar').innerText.replace(/\s+/g, ' '));
const st = () => page.evaluate(() => ({ i: edgeQueue && edgeQueue.i, mode: edgeQueue && edgeQueue.mode, n: edgeQueue && edgeQueue.rows.length, page: state.pdf.current,
  conf: planSheetRows().filter(r => r.confirmed).length, drawn: planSheetRows().filter(r => r.edge).length }));

console.log('A. the walk starts at the bottom floor, fitted, in cyan');
{
  const r = await page.evaluate(() => {
    const rows = edgeQueue.rows, els = rows.map(x => state.levels[x.levelIdx].elevation);
    // count the cyan strokes the overlay lays down
    const calls = []; const p = drawCtx.stroke; drawCtx.stroke = function () { calls.push(String(drawCtx.strokeStyle)); return p.apply(this, arguments) };
    renderNow(); drawCtx.stroke = p;
    return { els, first: rows[0].name, page: state.pdf.current, want: rows[0].page, zoom: state.drawing.zoom,
      cyan: calls.filter(c => /rgba\(0, ?200, ?230/.test(c)).length, orange: calls.filter(c => /230, ?90, ?0/.test(c)).length,
      grade: document.querySelectorAll('#edgeRows .ed-grade, #edgeRows input[data-edgrade]').length,
      head: [...document.querySelectorAll('#edgeRows .tbl-head span')].map(s => s.textContent.trim()) };
  });
  ok(r.els.every((e, i) => i === 0 || e >= r.els[i - 1]), 'bottom floor first: ' + JSON.stringify(r.els));
  eq(r.first, '0', 'which on this set is level 0');
  ok(r.page === r.want && r.zoom < 0.5, 'its sheet is on screen, fitted: ' + JSON.stringify([r.page, r.zoom]));
  ok(r.cyan >= 1 && r.orange === 0, 'the proposal is drawn in cyan, and nothing in the old orange: ' + JSON.stringify([r.cyan, r.orange]));
  eq(r.grade, 0, 'no on-grade column on the rows — the SOG box on Levels has it');
  eq(r.head.join('|'), 'Level · sheet|Floor edge|', 'the rows sit on the table system');
}

console.log('B. Try the next outline cycles what the detector found; a click on the outline confirms');
{
  const c0 = await page.evaluate(() => ({ n: edgeProposal.cands.length, sel: edgeProposal.sel, poly: edgeProposal.polygon.length }));
  ok(c0.n > 1 && /Try the next outline \(1 of \d+\)/.test(await bar()), 'the bar offers the next outline, counted: ' + c0.n);
  await page.click('#pendingBar button[data-pb="qnext"]');
  const c1 = await page.evaluate(() => ({ sel: edgeProposal.sel, poly: edgeProposal.polygon.length, rowIdx: edgeQueueRow().candIdx }));
  ok(c1.sel === 1 && c1.rowIdx === 1, 'it moves to the runner-up: ' + JSON.stringify(c1));
  await page.keyboard.press('t');
  eq(await page.evaluate(() => edgeProposal.sel), 2, 'T on the keyboard does the same');
  // back to the first, then click the outline itself
  await page.evaluate(() => { while (edgeQueueRow().candIdx !== 0) edgeQueueTryNext(); });
  const s0 = await st();
  await page.evaluate(() => { const p = edgeProposal.polygon[0]; const q = edgeProposal.polygon[1]; const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; const s = canvasToScreen(m.x, m.y); handleClick({ button: 0, clientX: s.x, clientY: s.y, shiftKey: false, altKey: false }, s); });
  await page.waitForTimeout(400);
  const s1 = await st();
  ok(s1.conf === s0.conf + 1 && s1.i === s0.i + 1, 'clicking the cyan outline confirms it and walks on: ' + JSON.stringify([s0, s1]));
}

console.log('C. Draw by hand inside the walk lands in Adjust; Done confirms; Skip leaves a sheet alone');
{
  await page.click('#pendingBar button[data-pb="qhand"]');
  await page.waitForTimeout(200);
  const d = await page.evaluate(() => ({ mode: edgeQueue.mode, tool: state.tool, draw: !!edgeDraw, bar: document.getElementById('pendingBar').innerText.replace(/\s+/g, ' ') }));
  ok(d.mode === 'draw' && d.tool === 'polygon' && d.draw && /Draw the floor edge/.test(d.bar), 'Draw by hand arms the tool and the bar says so: ' + d.bar.slice(0, 60));
  await page.evaluate(() => { state.drawing.points = [{ x: 200, y: 200 }, { x: 1800, y: 200 }, { x: 1800, y: 1200 }, { x: 200, y: 1200 }]; finishPolygon(); });
  await page.waitForTimeout(200);
  const e = await page.evaluate(() => ({ mode: edgeQueue.mode, edge: !!planSheetRows().find(r => r.page === state.pdf.current).edge, tools: !!document.querySelector('#edgeRows .ed-adjust #propSimplify'), bar: document.getElementById('pendingBar').innerText.replace(/\s+/g, ' ') }));
  ok(e.mode === 'adjust' && e.edge && /Done — confirm it/.test(e.bar), 'closing the shape lands in Adjust with Done on the bar');
  ok(e.tools, 'and the corner tools open on the row');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const s2 = await st();
  ok(s2.mode === 'pick' && s2.i === 2, 'Enter is Done: confirmed, on to the next: ' + JSON.stringify(s2));
  await page.keyboard.press('n');
  await page.waitForTimeout(300);
  const s3 = await st();
  ok(s3.i === 3 && s3.drawn === s2.drawn, 'N skips the sheet without writing anything: ' + JSON.stringify(s3));
  await page.keyboard.press('a');
  await page.waitForTimeout(300);
  const s4 = await st();
  ok(s4.mode === 'adjust' && s4.drawn === s3.drawn + 1 && s4.conf === s3.conf, 'A adjusts: written, not yet confirmed: ' + JSON.stringify(s4));
  await page.click('#pendingBar button[data-pb="qdone"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const s5 = await st();
  ok(s5.i == null && s5.conf === s4.conf + 2, 'Done then Confirm on the last sheet closes the walk: ' + JSON.stringify(s5));
  ok(await page.evaluate(() => !edgeQueue && !edgeProposal && !document.getElementById('pendingBar').classList.contains('visible')), 'and the bar is gone');
}

console.log('D. the skipped sheet keeps its read on the row; Redo and Detect again on this sheet re-walk one sheet');
{
  const r = await page.evaluate(() => {
    const row = [...document.querySelectorAll('#edgeRows .ed-row')].find(el => /read from the sheet/.test(el.textContent));
    return row ? { txt: row.textContent.replace(/\s+/g, ' ').slice(0, 80), review: !!row.querySelector('button[data-esreview]'), key: row.dataset.edgo } : null;
  });
  ok(r && r.review, 'the skipped sheet still shows its read with Review: ' + JSON.stringify(r));
  await page.click(`#edgeRows button[data-esreview="${r.key}"]`);
  await page.waitForFunction(() => edgeQueueActive() && edgeProposal && edgeProposal.queue, null, { timeout: 20000 });
  const q = await page.evaluate(() => ({ n: edgeQueue.rows.length, i: edgeQueue.i, page: state.pdf.current, at: edgeQueueRow().levelIdx + ':' + edgeQueueRow().page }));
  ok(q.at === r.key && String(q.page) === r.key.split(':')[1], 'Review opens the walk on that sheet: ' + JSON.stringify(q));
  await page.evaluate(() => edgeQueueConfirm());
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => planSheetRows().every(x => x.confirmed) && !edgeQueue), 'every sheet is confirmed and the walk is over');
  // Detect again on this sheet re-reads the sheet on screen and opens the bar for it alone
  await page.evaluate(() => { const rw = planSheetRows()[1]; state.activeLevelIdx = rw.levelIdx; return goToPage(rw.page); });
  await page.evaluate(() => renderEdgeSection());
  ok(await page.$eval('#edgeDetectThis', b => !b.disabled), 'Detect again on this sheet is live with a plan sheet on screen');
  await page.click('#edgeDetectThis');
  await page.waitForFunction(() => edgeQueueActive() && edgeProposal && edgeProposal.queue, null, { timeout: 60000 });
  const d = await page.evaluate(() => ({ n: edgeQueue.rows.length, had: edgeQueueRow().had, bar: document.getElementById('pendingBar').innerText.replace(/\s+/g, ' ') }));
  ok(d.n === 1 && d.had && /Use this one/.test(d.bar) && /Keep current/.test(d.bar), 'a re-read of a confirmed sheet offers Use this one / Keep current: ' + d.bar.slice(0, 120));
  await page.click('#pendingBar button[data-pb="qskip"]');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => !edgeQueue && planSheetRows().every(x => x.confirmed)), 'Keep current leaves it as it was');
}

await browser.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

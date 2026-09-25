// @rules ARE-15, ARE-18, ARE-19, ARE-29  (see DECISIONS.md)
// Adolfo, Sep 25 2026: "the drawing areas is kind of buggy when drawing
// slabs/beams. the toolbar reverts back to a positive number for offset when
// you try to input a negative number. also, I thought auto detect properties
// was supposed to happen when drawing a shape. it doesnt seem to work."
// Two causes: the bar's Offset went through parseInches, which drops the
// sign; and the sheet was read only for a slab's "7" PT SLAB" / T/SLAB notes
// and a CENTERLINE beam's label — a rectangle or polygon beam never looked
// for its BM label, T/BM was never read, and a slab tagged only
// "T/SLAB:91'-0\" B/SLAB:90'-7\"" (Bothell's 5" slabs) got no thickness.
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import fs from 'node:fs';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const root = path.resolve(here, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const jobPath = path.join(root, '1175_Bothell_Stem_4.reshore.json');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.join(root, 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

console.log('A. an offset keeps its sign');
const A = await page.evaluate(() => ['-6', '−6"', '-0\'-6"', '+3', '3', '-1\'-2 1/2"', '-1/2', '-4 1/2"', '0'].map(v => [v, parseOffsetIn(v)]));
const want = { '-6': -6, '−6"': -6, '-0\'-6"': -6, '+3': 3, '3': 3, '-1\'-2 1/2"': -14.5, '-1/2': -0.5, '-4 1/2"': -4.5, '0': 0 };
ok(A.every(([v, n]) => Math.abs(n - want[v]) < 1e-9), 'parseOffsetIn: ' + JSON.stringify(A));

if (!fs.existsSync(jobPath)) { console.log('(1175 job not in this checkout: the drawing checks skipped)'); await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
await page.setInputFiles('#fileInput', path.join(root, 'tests/fixtures/test-set.pdf'));
await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 180000 });
await page.waitForTimeout(2500);
await page.evaluate(d => applyOpenedJob(d, 'drawreads'), JSON.parse(fs.readFileSync(jobPath, 'utf8')));
await page.waitForTimeout(2000);
// Level 1, sheet 3
await page.evaluate(async () => { setStep('areas'); state.activeLevelIdx = state.levels.findIndex(l => l.name === '1'); await goToPage(3); setLayer('slab'); renderSidebar(); await pageTextCached(3); });
await page.waitForTimeout(2000);
const S = (x, y) => page.evaluate(([x, y]) => { const s = canvasToScreen(x, y); const r = drawCvs.getBoundingClientRect(); return { x: s.x + r.left, y: s.y + r.top }; }, [x, y]);
const view = c => page.evaluate(c => { state.drawing.zoom = 0.5; const r = drawCvs.getBoundingClientRect(); state.drawing.panX = r.width / 2 - c.x * 0.5; state.drawing.panY = r.height / 2 - c.y * 0.5; renderCanvas(); }, c);
const click = async (x, y) => { const q = await S(x, y); await page.mouse.move(q.x, q.y); await page.mouse.click(q.x, q.y); await page.waitForTimeout(120); };
const last = () => page.evaluate(() => JSON.parse(JSON.stringify(getActiveLevel().slabZones.at(-1))));
const setField = async (id, v) => { await page.evaluate(([id, v]) => { const f = document.getElementById(id); f.value = v; f.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]); await page.waitForTimeout(100); };

console.log('B. the drawing bar: a negative offset stays negative');
await page.evaluate(() => adArm('slab'));
await page.click('#adTypes [data-adk="slab"]');
await setField('adOff', '-6');
const B1 = await page.evaluate(() => ({ off: adUI().drawVals.slab.off, shown: document.getElementById('adOff').value, elev: document.getElementById('adElev').value }));
ok(B1.off === -6, 'typing -6 sets the offset to -6: ' + B1.off);
ok(/^−6"$/.test(B1.shown) && B1.elev === "90'-6\"", 'the bar shows −6" and T.O.S. 90\'-6": ' + JSON.stringify(B1));
await setField('adOff', B1.shown);
ok(await page.evaluate(() => adUI().drawVals.slab.off) === -6, 'committing what it shows (−6") keeps it negative');
await setField('adOff', "-0'-9\"");
ok(await page.evaluate(() => adUI().drawVals.slab.off) === -9, "and -0'-9\" reads as -9");
await setField('adOff', '0');

console.log('C. a slab drawn round "T/SLAB:91\'-0\\" B/SLAB:90\'-7\\"" is 5" thick');
const tb = await page.evaluate(() => { const n = adLines(3).find(l => /^T\/SLAB:\s*91'-0"/.test(l.text) && Math.abs(l.x - 1068) < 5 && l.y < 600); return n && { x: n.x + n.w / 2, y: n.y }; });
ok(!!tb, 'the sheet has the note');
if (tb) {
  await view(tb);
  await page.click('#adModes [data-adm="rect"]');
  const live = await (async () => { await click(tb.x - 120, tb.y - 60); const q = await S(tb.x + 120, tb.y + 60); await page.mouse.move(q.x, q.y); await page.waitForTimeout(150); return page.$eval('#adRead', e => e.textContent); })();
  ok(/5" \(T\/SLAB − B\/SLAB\)/.test(live), 'the readout says what it will use before the click: ' + live);
  await click(tb.x + 120, tb.y + 60);
  const z = await last();
  ok(z.kind === 'slab' && z.thicknessIn === 5 && (z.offsetIn || 0) === 0, 'the slab is 5", at the typical top: ' + JSON.stringify([z.kind, z.thicknessIn, z.offsetIn]));
  const foot = await page.$eval('#adFoot', e => e.textContent);
  ok(/5" from the sheet's T\/SLAB − B\/SLAB/.test(foot), 'and the bar says where it came from: ' + foot);
}

console.log('D. a beam drawn as a RECTANGLE reads its label and its T/BM');
const bm = await page.evaluate(() => { const n = adLines(3).find(l => /^22X17 BM$/.test(l.text) && Math.abs(l.x - 2783) < 5); return n && { x: n.x + n.w / 2, y: n.y }; });
ok(!!bm, 'the sheet has the 22X17 BM label');
if (bm) {
  await view(bm);
  await page.click('#adTypes [data-adk="beam"]');
  await page.click('#adModes [data-adm="rect"]');
  // a strip beside the label, the way a beam lies next to its tag
  await click(bm.x - 150, bm.y + 30);
  const q = await S(bm.x + 150, bm.y + 60); await page.mouse.move(q.x, q.y); await page.waitForTimeout(150);
  const live = await page.$eval('#adRead', e => e.textContent);
  ok(/22×17 from “22X17 BM”/.test(live) && /T\/BM 91'-0"/.test(live), 'the readout names the label and the T/BM: ' + live);
  await click(bm.x + 150, bm.y + 60);
  const z = await last();
  ok(z.kind === 'beam' && z.widthIn === 22 && z.depthIn === 17 && z.adSizeSrc === 'label', 'the beam is 22×17 from its label: ' + JSON.stringify([z.kind, z.widthIn, z.depthIn, z.adSizeSrc]));
  ok(z.offsetIn == null, 'T/BM 91\'-0" is the slab top it would inherit, so it still inherits');
  const foot = await page.$eval('#adFoot', e => e.textContent);
  ok(/22×17 from “22X17 BM”/.test(foot), 'the bar says so: ' + foot);
}

console.log('E. a T/BM below the slab sets the beam\'s top');
const E = await page.evaluate(() => {
  const lv = getActiveLevel();
  const ln = adLines(3).find(l => /^22X17 BM$/.test(l.text) && Math.abs(l.x - 2783) < 5);
  const tbm = adLines(3).find(l => /^T\/BM/.test(l.text) && Math.abs(l.x - 2778) < 5);
  const saved = tbm.text; tbm.text = "T/BM: 90'-6\"";
  const z = { id: sid(), kind: 'beam', polygon: [{ x: ln.x - 100, y: ln.y + 30 }, { x: ln.x + 200, y: ln.y + 30 }, { x: ln.x + 200, y: ln.y + 60 }, { x: ln.x - 100, y: ln.y + 60 }] };
  zonesOf(lv, 'slab').push(z);
  adUI().drawVals.beam.inherit = true;
  const r = adAfterDraw(lv, z, 'slab');
  tbm.text = saved;
  return { off: z.offsetIn, depth: z.depthIn, msg: AD.msg && AD.msg.t };
});
ok(E.off === -6, "T/BM 90'-6\" under a 91'-0\" floor gives a -6\" top: " + JSON.stringify(E));
ok(/T\.O\.B\. 90'-6" from the sheet/.test(E.msg || ''), 'and says so: ' + E.msg);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

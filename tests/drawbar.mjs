// @rules ARE-14, ARE-15, ARE-16, ARE-17, ARE-18, ARE-19, ARE-20, ARE-21, ARE-22, ARE-23, ARE-24, ARE-25, ARE-26  (see DECISIONS.md)
// The Areas drawing flow of Sep 24 2026 (claude/reshore-draw-flow-mockup.md):
// the drawing bar, rectangles and centerline beams, clip + clean-up under 3",
// the sheet's T/SLAB and thickness notes, color by properties, tags, the
// click that cycles, many at once, copy/paste, the checks, dark mode.
// Runs on the 1175 job, Level 3 on sheet 5 of the test set.
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import fs from 'node:fs';
import path from 'node:path';

const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const root = path.resolve(here, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.join(root, 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setInputFiles('#fileInput', path.join(root, 'tests/fixtures/test-set.pdf'));
await page.waitForFunction(() => state.pdf.pages > 0, null, { timeout: 180000 });
await page.waitForTimeout(2500);
const job = JSON.parse(fs.readFileSync(path.join(root, '1175_Bothell_Stem_4.reshore.json'), 'utf8'));
await page.evaluate(d => applyOpenedJob(d, 'drawbar'), job);
await page.waitForTimeout(2000);
await page.evaluate(() => { setStep('areas'); state.activeLevelIdx = state.levels.findIndex(l => l.name === '3'); goToPage(5); setLayer('slab'); renderSidebar(); });
await page.waitForTimeout(2500);
await page.evaluate(() => pageTextCached(5));

// work around the 7" PT SLAB note on the sheet (T/SLAB 119'-10")
const note = await page.evaluate(() => { const n = adLines(5).find(l => /^7"\s*PT SLAB/.test(l.text)); return n && { x: n.x + n.w / 2, y: n.y }; });
ok(!!note, 'the sheet has its 7" PT SLAB note');
const c = note;
await page.evaluate(c => { state.drawing.zoom = 0.35; const r = drawCvs.getBoundingClientRect(); state.drawing.panX = r.width / 2 - c.x * 0.35; state.drawing.panY = r.height / 2 - c.y * 0.35; renderCanvas(); }, c);
const S = (x, y) => page.evaluate(([x, y]) => { const s = canvasToScreen(x, y); const r = drawCvs.getBoundingClientRect(); return { x: s.x + r.left, y: s.y + r.top }; }, [x, y]);
const at = async (x, y) => { const q = await S(x, y); await page.mouse.click(q.x, q.y); };
const last = () => page.evaluate(() => { const z = getActiveLevel().slabZones.at(-1); return JSON.parse(JSON.stringify(z)); });
const foot = () => page.$eval('#adFoot', e => e.textContent);

console.log('1. The drawing bar (ARE-14)');
await page.click('#btnDrawSlab');
ok(await page.$eval('#adBar', e => e.classList.contains('visible')), 'Draw slab areas opens the bar');
ok(await page.evaluate(() => !document.getElementById('drawSlabPop')), 'no kind menu');
const sizes = [];
for (const k of ['slab', 'grade', 'opening', 'beam', 'edge']) {
  await page.click(`#adTypes [data-adk="${k}"]`);
  sizes.push(await page.$eval('#adBar', e => Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
}
ok(new Set(sizes).size === 1, 'the bar keeps one size through every type: ' + sizes.join(' '));
await page.click('#adTypes [data-adk="slab"]');
{const rows = await page.$$eval('#adBar .ad-row', r => r.map(x => x.querySelector('.ad-lbl').textContent)); ok(rows.join(',') === 'Type,Mode,Slab,Snap', 'rows: Type, Mode, the values, Snap: ' + rows);}
ok(await page.$eval('#adProps', e => /T\.O\.S\./.test(e.textContent) && /Offset/.test(e.textContent) && /typical/.test(e.textContent)), 'Thick · T.O.S. · Offset with the typical');
ok(await page.evaluate(() => { const b = document.querySelector('#adBar .ad-done').getBoundingClientRect(), r = document.getElementById('adBar').getBoundingClientRect(); return b.right > r.right - 20 && b.top < r.top + 20; }), 'Done / Esc top right');
await page.keyboard.press('b');
ok(await page.evaluate(() => newSlabKind() === 'beam' && adMode() === 'center'), 'B picks a beam; it starts as a centerline');
await page.keyboard.press('s');
ok(await page.evaluate(() => newSlabKind() === 'slab' && adMode() === 'rect'), 'S back to a slab, which starts as a rectangle');
await page.keyboard.press('p');
ok(await page.evaluate(() => adMode() === 'poly'), 'P: polygon');
await page.keyboard.press('r');
ok(await page.evaluate(() => { setOrtho(false); const a = orthoOn({ shiftKey: true }) && !orthoOn({ shiftKey: false }); setOrtho(true); const b = !orthoOn({ shiftKey: true }) && orthoOn({ shiftKey: false }); setOrtho(false); return a && b; }), 'Shift flips Ortho');
ok(await page.evaluate(() => { const r = document.querySelector('#adBar [data-ad="ortho"]'); r.click(); const on = state.ortho && document.querySelector('#adBar [data-ad="ortho"]').classList.contains('on'); document.querySelector('#adBar [data-ad="ortho"]').click(); return on && !state.ortho; }), 'the bar\'s Ortho chip is the one setting');
// ⊥: from a point off a vertical line, the snap offers the foot of the perpendicular
ok(await page.evaluate(() => { const lv = getActiveLevel(); const z = { id: 'perpT', kind: 'opening', polygon: [{ x: 100, y: 100 }, { x: 100, y: 400 }, { x: 60, y: 400 }, { x: 60, y: 100 }], page: 5 }; lv.slabZones.push(z); const was = [state.snap, state.drawing.zoom, state.drawing.panX, state.drawing.panY]; state.snap = true; state.drawing.zoom = 1; state.drawing.panX = 0; state.drawing.panY = 0; state.drawing.points = [{ x: 300, y: 250 }]; const sp = canvasToScreen(103, 254); const f = findSnap(sp.x, sp.y); state.drawing.points = []; lv.slabZones.splice(lv.slabZones.indexOf(z), 1); [state.snap, state.drawing.zoom, state.drawing.panX, state.drawing.panY] = was; return f && f.type === 'perpfoot' && Math.abs(f.x - 100) < 1e-6 && Math.abs(f.y - 250) < 1e-6; }), '⊥ snaps to the foot of the perpendicular');
await page.evaluate(() => { state.snap = false; renderCanvas(); });

console.log('2. Rectangle, sheet notes, clip (ARE-15, ARE-16, ARE-19)');
await at(c.x - 120, c.y - 60); await at(c.x + 120, c.y + 80);
let z = await last();
ok(z.kind === 'slab' && z.polygon.length >= 4, 'two clicks make a rectangle');
ok(z.thicknessIn === 7 && z.offsetIn === -2, 'the note inside it set 7" and T/SLAB 119\'-10" (offset -2"): ' + JSON.stringify([z.thicknessIn, z.offsetIn]));
ok(/from the sheet/.test(await foot()), 'and the bar says so');
ok(await page.evaluate(() => state.tool === 'polygon'), 'still armed for the next one');

console.log('3. Clean-up under 3" (ARE-17)');
const px2 = await page.evaluate(() => adPxIn(getActiveLevel(), 2));
await page.evaluate(() => { const u = adUI(); u.drawVals.slab.t = 10; u.drawVals.slab.off = 0; adRenderBar(true); });
await at(c.x + 120 + px2, c.y - 60); await at(c.x + 320, c.y + 80);
let g = await page.evaluate(() => { const a = getActiveLevel().slabZones.at(-2), b = getActiveLevel().slabZones.at(-1); return { a: Math.max(...a.polygon.map(q => q.x)), b: Math.min(...b.polygon.map(q => q.x)), t: b.thicknessIn }; });
ok(Math.abs(g.a - g.b) < 0.01 && g.t === 10, 'a 2" gap to the neighbor is closed: ' + JSON.stringify(g));
ok(/Ctrl\+Z/.test(await foot()), 'the note offers Ctrl+Z');
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
await page.keyboard.press('Control+z');
g = await page.evaluate(() => { const b = getActiveLevel().slabZones.at(-1); return { b: Math.min(...b.polygon.map(q => q.x)), t: b.thicknessIn }; });
ok(g.t === 10 && g.b > g.b - 1 && Math.abs(g.b - (c.x + 120 + px2)) < 0.01, 'Ctrl+Z undoes the clean-up only: ' + JSON.stringify(g));
await page.keyboard.press('Control+y');
const px5 = await page.evaluate(() => adPxIn(getActiveLevel(), 5));
await page.evaluate(() => adArm('slab'));
await at(c.x - 120, c.y + 80 + px5); await at(c.x + 60, c.y + 200);
g = await page.evaluate(() => Math.min(...getActiveLevel().slabZones.at(-1).polygon.map(q => q.y)));
ok(Math.abs(g - (c.y + 80 + px5)) < 0.01, 'a 5" gap is left alone');

console.log('4. Beams: centerline, size, top (ARE-15, ARE-18)');
await page.keyboard.press('b');
await at(c.x - 80, c.y - 150); await at(c.x + 60, c.y - 150); await at(c.x + 60, c.y - 250); await page.keyboard.press('Enter');
z = await last();
ok(z.kind === 'beam' && z.polygon.length >= 6 && z.adCenter && z.adCenter.length === 3, 'a centerline with a bend makes one beam: ' + z.polygon.length);
ok(z.offsetIn === null, 'its top inherits');
// a beam across the 7" (-2") and 10" (typical) slabs
await at(c.x + 60, c.y + 10); await at(c.x + 200, c.y + 10); await page.keyboard.press('Enter');
z = await last();
const top = await page.evaluate(() => { const lv = getActiveLevel(); return adBeamTop(lv, lv.slabZones.at(-1)); });
ok(top.state === 'conflict' && top.parts.length === 2, 'across two elevations it asks to verify its top: ' + JSON.stringify(top.parts && top.parts.map(p => p.off)));
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
let checks = await page.evaluate(() => adChecks(getActiveLevel()).map(c => c.type));
ok(checks.includes('verify'), 'the checks list the beam to verify');
await page.evaluate(() => renderSidebar());
await page.click('#zoneList [data-adverify]');
ok(await page.evaluate(() => { const z = getActiveLevel().slabZones.at(-1); return z.offsetIn != null && z.adVerified; }), 'picking an elevation in the check sets the top');

console.log('5. Colors, hatches, tags (ARE-20, ARE-21)');
const st = await page.evaluate(() => { const lv = getActiveLevel(), a = lv.slabZones.find(z => z.thicknessIn === 7), b = lv.slabZones.find(z => z.thicknessIn === 10); return { a: adStyleOf(lv, a), b: adStyleOf(lv, b) }; });
ok(st.a.c !== st.b.c, 'different thicknesses, different shades');
ok(st.a.h !== 'none' && st.b.h === 'none', 'below typical is hatched, typical is not');
ok(await page.evaluate(() => { const k1 = calculationKey(); const lv = getActiveLevel(); adSty(lv).grpColor['slab|99'] = '#000000'; const k2 = calculationKey(); delete adSty(lv).grpColor['slab|99']; return k1 === k2; }), 'style is not a calculation input');
const tags = await page.evaluate(() => { const lv = getActiveLevel(); return adTagLayout(lv, 'slab').map(t => ({ t: t.p.t, inside: isBeam(t.z) || adRingInside(t.p.r, adP(t.z.polygon)), h: t.p.h })); });
ok(tags.some(t => /7" Slab · T\.O\.S\. 119'-10"/.test(t.t)), 'a slab tag reads its thickness and T.O.S.');
ok(tags.some(t => /T\.O\.B\./.test(t.t)), 'a beam tag reads its size and T.O.B.');
ok(tags.every(t => t.inside), 'every slab tag sits inside its outline');
ok(await page.evaluate(() => Math.abs(adTagLayout(getActiveLevel(), 'slab')[0].p.h - adTextH(5)) < adTextH(5) * 0.41), 'tags are the height of the sheet\'s text');

console.log('6. Covered areas, many at once (ARE-22, ARE-23)');
await page.evaluate(() => { adArm('slab'); });
ok(await page.evaluate(() => newSlabKind() === 'beam'), 'the bar opens on the type last used');
await page.keyboard.press('s');
await page.evaluate(() => { const u = adUI(); u.drawVals.slab.t = 12; adRenderBar(true); });
await at(c.x + 180, c.y + 30); await at(c.x + 260, c.y + 75);
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
await at(c.x + 220, c.y + 52);
const a1 = await page.evaluate(() => getActiveZone().thicknessIn);
await page.waitForTimeout(450);
await at(c.x + 220, c.y + 52);
const a2 = await page.evaluate(() => [getActiveZone().thicknessIn, AD.chip && AD.chip.t]);
ok(a1 === 12 && a2[0] === 10 && /2 of 2/.test(a2[1]), 'the smallest first; clicking again gives the one behind: ' + JSON.stringify([a1, a2]));
await page.keyboard.press('Escape');
await at(c.x, c.y + 60);
await page.keyboard.down('Shift'); await at(c.x + 300, c.y + 60); await page.keyboard.up('Shift');
ok(await page.evaluate(() => adSelZones().length === 2), 'Shift+click adds to the selection');
ok(await page.$eval('#propsContent', e => /2 selected/.test(e.textContent)), 'the panel edits them together');
await page.keyboard.press('m');
ok(await page.evaluate(() => adSelZones().length === 2), 'different values: M does not merge');
await page.fill('#adBThick', '8'); await page.press('#adBThick', 'Enter'); await page.evaluate(() => drawFocusPlan());
ok(await page.evaluate(() => adSelZones().every(z => z.thicknessIn === 8)), 'one thickness set on both');
const n0 = await page.evaluate(() => getActiveLevel().slabZones.length);
await page.evaluate(() => { const lv = getActiveLevel(); adSelZones().forEach(z => { z.offsetIn = 0; delete z.adSheet; }); renderSidebar(); });
await page.evaluate(() => drawFocusPlan());
await page.keyboard.press('m');
ok(await page.evaluate(n => getActiveLevel().slabZones.length === n - 1, n0), 'same values and touching: M merges them: ' + await page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ') + JSON.stringify(adSelZones().map(z => [adPropKey(getActiveLevel(), z), z.polygon.length]))));
await page.keyboard.press('k'); await at(c.x + 100, c.y - 120); await at(c.x + 100, c.y + 140);
ok(await page.evaluate(n => getActiveLevel().slabZones.length === n && adSel().length === 2, n0), 'K splits along a line: two pieces, same values');
await page.keyboard.press('Escape');
const b1 = await S(c.x - 160, c.y - 130), b2 = await S(c.x + 360, c.y + 220);
await page.keyboard.down('Control'); await page.mouse.move(b1.x, b1.y); await page.mouse.down(); await page.mouse.move(b2.x, b2.y, { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Control');
ok(await page.evaluate(() => adSel().length >= 4), 'Ctrl+drag boxes a selection: ' + await page.evaluate(() => adSel().length));

console.log('7. Copy / paste (ARE-24)');
await page.keyboard.press('Escape');
await at(c.x + 220, c.y + 52);
const n1 = await page.evaluate(() => getActiveLevel().slabZones.length);
await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
ok(await page.evaluate(() => AD.paste && AD.clip.shapes.length === 1), 'Ctrl+V holds a ghost');
const q = await S(c.x + 500, c.y + 260); await page.mouse.move(q.x, q.y);
const base = await page.evaluate(() => { const c = AD.clip; return c.corners[c.bi]; });
await page.keyboard.press('Tab');
ok(await page.evaluate(b => { const c = AD.clip; return c.corners[c.bi][0] !== b[0] || c.corners[c.bi][1] !== b[1]; }, base), 'Tab picks another base corner');
await page.keyboard.press('Shift+Tab');
await page.mouse.click(q.x, q.y);
const q2 = await S(c.x + 700, c.y + 260); await page.mouse.move(q2.x, q2.y); await page.mouse.click(q2.x, q2.y);
await page.keyboard.press('Escape');
ok(await page.evaluate(n => getActiveLevel().slabZones.length === n + 2, n1), 'each click places one');
ok(await page.evaluate(() => { const lv = getActiveLevel(), z = lv.slabZones.at(-1); return z.thicknessIn === 12 && Math.min(...z.polygon.map(p => p.x)) > 0; }), 'values kept');

console.log('8. Loading checks (ARE-25)');
await page.evaluate(() => { setLayer('loading'); renderSidebar(); });
const lc = await page.evaluate(() => { const lv = getActiveLevel(); const had = levelDefaultCapacity(lv) > 0; const r1 = adChecks(lv).filter(c => c.type === 'gap').length; const s = { m: lv.defMark, l: lv.defLL, sd: lv.defSDL, c: lv.defaultCapacity }; lv.defMark = null; lv.defLL = null; lv.defSDL = null; lv.defaultCapacity = 0; _adChk.sig = null; const r2 = adChecks(lv).filter(c => c.type === 'gap').length; lv.defMark = s.m; lv.defLL = s.l; lv.defSDL = s.sd; lv.defaultCapacity = s.c; _adChk.sig = null; return { had, r1, r2, cap0: levelDefaultCapacity(lv) }; });
ok(lc.had && lc.r1 === 0, 'a floor with a typical capacity has no loading gaps to look at');
ok(lc.r2 >= 1, 'without a typical, the uncovered floor is a check: ' + JSON.stringify(lc));
await page.evaluate(() => { setLayer('slab'); renderSidebar(); });

console.log('9. Dark mode, spelling (ARE-26)');
const pal = await page.evaluate(() => { invalidateCssCache(); const a = [cssVar('--zone-stroke'), cssVar('--zone-selected')]; adSetTheme('dark'); invalidateCssCache(); const b = [cssVar('--zone-stroke'), cssVar('--zone-selected')]; const bg = getComputedStyle(document.body).backgroundColor; adSetTheme('light'); invalidateCssCache(); return { a, b, bg }; });
ok(JSON.stringify(pal.a) === JSON.stringify(pal.b), 'the plan\'s colors are the same in dark mode');
ok(pal.bg !== 'rgb(255, 255, 255)', 'and the chrome does go dark: ' + pal.bg);
ok(await page.$('#btnTheme') !== null, 'a toggle in the toolbar');
const brit = await page.evaluate(() => { const src = document.documentElement.innerText + ' ' + [...document.querySelectorAll('[title],[placeholder]')].map(e => (e.title || '') + ' ' + (e.placeholder || '')).join(' '); return (src.match(/\b(colour|centre|labelled|recognised|modelled|cancelled|neighbour|behaviour|grey)\w*/gi) || []); });
ok(!brit.length, 'American spelling on screen: ' + brit.slice(0, 5).join(', '));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

// @rules UI-02  (see DECISIONS.md)
// RIGHT-CLICK TAKES BACK A POINT (Sep 17 2026).
// Adolfo: "add a function to right click to undo drawing a point when
// drawing a shape."
//
//  - a stationary right-click pops the last corner placed, and keeps
//    walking back; on an empty outline it does nothing and does not drop
//    the tool
//  - a right-DRAG still pans, and keeps every corner
//  - the browser's own context menu never opens over the plan
//  - Backspace and Ctrl+Z do the same thing (Ctrl+Z from Sep 24), and still falls through to
//    delete when nothing is being drawn
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path'; import fs from 'node:fs';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
let pass=0,fail=0; const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('  FAIL',m)}};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch(e){} });
const pdf = fs.readFileSync(path.resolve(here,'fixtures','test-set.pdf'));
const job = JSON.parse(fs.readFileSync(path.resolve(here,'fixtures','test-job.reshore.json'),'utf8'));
await page.evaluate(async ([b64,d]) => {
  const bin=atob(b64); const u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
  const doc=await pdfjsLib.getDocument({data:u8}).promise;
  resetGeometry(); if(typeof resetPageTextCache==='function')resetPageTextCache();
  state.pdf.doc=doc; state.pdf.pages=doc.numPages; state.pdf.pageImages={};
  deserializeDoc(d); sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display='none';
  setStep('areas'); state.activeLevelIdx=1;
  const lv=getActiveLevel(); state.pdf.current=levelSheets(lv)[0].page;
  setLayer('slab'); setTool('polygon'); state.snap=false;
}, [pdf.toString('base64'), job]);

const box = await page.$eval('#drawCanvas', el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; });
const at = (dx,dy)=>({x:Math.round(box.x+dx), y:Math.round(box.y+dy)});
const N = () => page.evaluate(()=>state.drawing.points.length);

for (const [dx,dy] of [[200,200],[300,200],[300,300]]) { const p=at(dx,dy);
  await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.mouse.up(); }
ok(await N() === 3, 'three corners placed: ' + await N());

// a stationary right-click takes one back
const p = at(350,350);
await page.mouse.move(p.x,p.y);
await page.mouse.down({button:'right'}); await page.mouse.up({button:'right'});
ok(await N() === 2, 'right-click pops the last corner: ' + await N());
await page.mouse.down({button:'right'}); await page.mouse.up({button:'right'});
await page.mouse.down({button:'right'}); await page.mouse.up({button:'right'});
ok(await N() === 0, 'and keeps walking back to nothing: ' + await N());
await page.mouse.down({button:'right'}); await page.mouse.up({button:'right'});
ok(await N() === 0, 'an extra right-click on an empty outline does nothing');
ok(await page.evaluate(()=>state.tool)==='polygon', 'and does not drop the tool');

// right-DRAG still pans
await page.evaluate(()=>{ setTool('polygon'); state.drawing.points=[{x:100,y:100},{x:200,y:100}]; });
const b=at(300,200);
const before = await page.evaluate(()=>({x:state.drawing.panX,y:state.drawing.panY,n:state.drawing.points.length}));
await page.mouse.move(b.x,b.y);
await page.mouse.down({button:'right'});
await page.mouse.move(b.x+120,b.y+80,{steps:10});
await page.mouse.up({button:'right'});
const after = await page.evaluate(()=>({x:state.drawing.panX,y:state.drawing.panY,n:state.drawing.points.length}));
ok(after.n === before.n, 'a right-DRAG keeps every corner: ' + JSON.stringify([before.n,after.n]));
ok(Math.hypot(after.x-before.x, after.y-before.y) > 20, 'and still pans the sheet: ' + JSON.stringify([before,after]));

// no browser context menu on the plan
ok(await page.evaluate(()=>{ let def=true;
  const ev=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});
  document.getElementById('drawCanvas').dispatchEvent(ev);
  return ev.defaultPrevented; }), 'the browser context menu stays shut on the plan');

// Backspace still does it too
await page.evaluate(()=>{ setTool('polygon'); state.drawing.points=[{x:1,y:1},{x:2,y:2}]; });
await page.keyboard.press('Backspace');
ok(await N() === 1, 'Backspace still walks a point back: ' + await N());
// and Backspace outside a draw still reaches deletion
ok(await page.evaluate(()=>{ state.drawing.points=[]; setTool('select'); return undoLastDrawnPoint()===false }),
  'with nothing being drawn it declines, so Backspace falls through to delete');

// Ctrl+Z takes back a corner too (Sep 24 2026: "if the user accidentally
// draws a point incorrectly, allow the user to either right click or ctrl-z")
await page.evaluate(()=>{ setTool('polygon'); state.drawing.points=[{x:1,y:1},{x:2,y:2},{x:3,y:3}]; });
const hist0 = await page.evaluate(()=>JSON.stringify(state.levels.map(l=>(l.slabZones||[]).length+(l.zones||[]).length)));
await page.keyboard.press('Control+z');
ok(await N() === 2, 'Ctrl+Z walks a point back: ' + await N());
await page.keyboard.press('Control+z');
ok(await N() === 1, 'and keeps walking back: ' + await N());
ok(await page.evaluate(()=>state.tool)==='polygon', 'without dropping the tool');
ok(await page.evaluate(()=>JSON.stringify(state.levels.map(l=>(l.slabZones||[]).length+(l.zones||[]).length)))===hist0,
  'and without undoing any drawn shape');
// with nothing being drawn, Ctrl+Z is the ordinary undo
const undone = await page.evaluate(()=>{ state.drawing.points=[]; setTool('select');
  let called=false; const u=history.undo; history.undo=function(){called=true;return u.apply(this,arguments)};
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));
  history.undo=u; return called; });
ok(undone, 'with nothing being drawn Ctrl+Z reaches the ordinary undo');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);

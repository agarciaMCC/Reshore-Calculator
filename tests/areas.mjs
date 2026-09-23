// @rules ARE-01, ARE-02, ARE-04, ARE-05, ARE-06, ARE-07, UI-08, UI-10, ARE-12, UI-15  (see DECISIONS.md)
// The Areas panel: per-layer Draw buttons that arm the tool themselves, the
// slab kind menu, derived shape names, grouping by type, and the help behind
// the ? on the title.
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path'; import fs from 'node:fs';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
let pass=0,fail=0; const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('  FAIL',m)}};
const browser=await chromium.launch(); const page=await browser.newPage({viewport:{width:1500,height:950}});
page.on('pageerror',e=>{fail++;console.log('  PAGEERROR',e.message)});
await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
await page.waitForFunction(()=>typeof solveAll==='function');
await page.evaluate(()=>{try{localStorage.clear()}catch(e){}});
const pdf=fs.readFileSync(path.resolve(here,'fixtures','test-set.pdf'));
const job=JSON.parse(fs.readFileSync(path.resolve(here,'fixtures','test-job.reshore.json'),'utf8'));
await page.evaluate(async ([b64,d])=>{
  const bin=atob(b64);const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
  const doc=await pdfjsLib.getDocument({data:u8}).promise;
  resetGeometry();state.pdf.doc=doc;state.pdf.pages=doc.numPages;state.pdf.current=1;state.pdf.pageImages={};
  deserializeDoc(d);sortLevelsByElevation();
  document.getElementById('upload-prompt').style.display='none';document.getElementById('pageNav').style.display='flex';
  state.activeLevelIdx=1;setStep('areas');setLayer('loading');await goToPage(5);
},[pdf.toString('base64'),job]);
// help
ok(await page.$('#areasHelpBtn')!==null,'help button exists');
ok(await page.$eval('#areasHelp',e=>e.hidden),'help starts hidden');
await page.click('#areasHelpBtn');
ok(!await page.$eval('#areasHelp',e=>e.hidden),'clicking ? shows it');
ok(await page.$eval('#areasHelp',e=>/smaller area cuts out/.test(e.textContent)&&!/higher capacity governs/.test(e.textContent)),'help text updated for the cutout rule');
await page.keyboard.press('Escape');
ok(await page.$eval('#areasHelp',e=>e.hidden),'Escape closes it');
// loading layer buttons — in the hand-tools row under the primary action, always in view (UI-31, Sep 23 2026)
ok(await page.$eval('#byhand-areas',d=>d.tagName!=='DETAILS'&&d.offsetParent!==null&&d.contains(document.getElementById('btnDrawLoading'))&&d.contains(document.getElementById('btnCopyFrom'))&&d.contains(document.getElementById('btnAutoDetect'))),'Draw, Copy and Detect again sit in the hand-tools row, not folded away');
ok(await page.$eval('#beamPanel',e=>[...e.parentNode.children].indexOf(e)<[...e.parentNode.children].indexOf(document.getElementById('zoneList'))),'the proposal panel sits above the list');
ok(await page.$eval('#btnDrawLoading',e=>e.offsetParent!==null),'and they are visible without opening anything');
ok(await page.$eval('#btnDrawLoading',e=>e.offsetParent!==null&&e.textContent==='Draw loading area'),'Draw loading area shown on the loading layer');
ok(await page.$eval('#drawSlabWrap',e=>e.style.display==='none'),'the slab draw button is hidden');
ok(await page.$eval('#btnCopyFrom',e=>/Copy loading areas/.test(e.textContent)),'copy button names the layer');
// ARE-12 (Sep 21 2026): the trace is back on the Loading tab — the floor's
// own load map as the primary card up top, the all-floors pass behind "or do
// it by hand" beside Draw and Copy; nothing about it on Loads.
ok(await page.evaluate(()=>{const a=document.getElementById('btnDrawLoading'),b=document.getElementById('btnAutoTrace');
  return !!a&&!!b&&b.closest('.step-panel').dataset.step==='areas'&&!!b.closest('[data-byhand="areas"], #byhand-areas')
    &&!document.getElementById('p-loads').querySelector('#btnAutoTrace')}),'the all-floors trace lives in the hand-tools row on the Loading tab, nothing on Loads');
await page.click('#btnDrawLoading');
ok(await page.evaluate(()=>state.tool==='polygon'),'clicking it arms the polygon tool');
await page.keyboard.press('Escape');
ok(await page.evaluate(()=>state.tool==='select'),'Escape disarms');
// slab layer
await page.evaluate(()=>setLayer('slab'));
ok(await page.$eval('#btnDrawSlab',e=>e.offsetParent!==null),'Draw new slab area shown');
ok(await page.$eval('#btnDrawLoading',e=>e.style.display==='none'),'loading draw hidden');
ok(await page.$eval('#btnCopyFrom',e=>/Copy slab conditions/.test(e.textContent)),'copy wording follows');
ok(await page.$('#slabKindSwitch')===null,'the old New: row is gone');
await page.click('#btnDrawSlab');
const opts=await page.$$eval('#drawSlabPop button[data-newkind]',b=>b.map(x=>x.dataset.newkind));
ok(JSON.stringify(opts)===JSON.stringify(['slab','opening','beam','edge']),'four choices, no grade: '+JSON.stringify(opts));
await page.click('#drawSlabPop button[data-newkind="beam"]');
ok(await page.evaluate(()=>state.ui.slabKind==='beam'&&state.tool==='polygon'),'picking a kind arms the tool');
ok(await page.$eval('#drawSlabPop',e=>!e.classList.contains('open')),'menu closes on pick');
// grade still reachable as a Type
ok(await page.evaluate(()=>{
  state.activeZoneIdx=zonesOf(getActiveLevel(),'slab').findIndex(z=>slabKind(z)==='slab');
  renderProperties();
  const s=document.getElementById('propKind');
  return s&&[...s.options].some(o=>o.value==='grade');
}),'On grade is still a Type option on a slab area');
// give this floor one of every kind so the names and groups can be checked
await page.evaluate(()=>{
  const lv=getActiveLevel();
  const sq=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  zonesOf(lv,'slab').push({id:sid(),polygon:sq(400,400,600,460),kind:'beam',widthIn:24,depthIn:17,offsetIn:null,label:''});
  zonesOf(lv,'slab').push({id:sid(),polygon:sq(200,200,3000,1800),kind:'edge',thicknessIn:null,offsetIn:0,label:''});
  state.activeZoneIdx=null;renderSidebar();
});
// derived names
const names=await page.evaluate(()=>{
  const lv=getActiveLevel();
  const out=zonesOf(lv,'slab').map(z=>({kind:slabKind(z),name:zoneName(lv,z,0)}));
  const b=zonesOf(lv,'slab').find(z=>slabKind(z)==='beam');
  let live=null;
  if(b){const was=b.depthIn;b.depthIn=20;live=zoneName(lv,b,0);b.depthIn=was}
  const s0=zonesOf(lv,'slab').find(z=>slabKind(z)==='slab');
  let custom=null;
  if(s0){s0.label='Drop panel';custom=zoneName(lv,s0,0);s0.label=''}
  return {out,live,custom};
});
ok(names.out.some(n=>n.kind==='beam'&&/^\d+×\d+ Beam$/.test(n.name)),'beam reads width×depth Beam: '+JSON.stringify(names.out.filter(n=>n.kind==='beam')));
ok(names.out.some(n=>n.kind==='slab'&&/Slab$/.test(n.name)&&/"/.test(n.name)),'slab reads thickness Slab: '+JSON.stringify(names.out.filter(n=>n.kind==='slab')));
ok(names.out.some(n=>n.kind==='edge'&&n.name==='Floor edge'),'floor edge named');
ok(/×20 Beam$/.test(names.live||''),'the name follows a size change: '+names.live);
ok(names.custom==='Drop panel','a typed label overrides');
// the tool stays armed for the next shape, and keeps the same kind
const armed=await page.evaluate(()=>{
  const lv=getActiveLevel();
  state.ui.slabKind='opening';setTool('polygon');
  const n0=zonesOf(lv,'slab').length;
  state.drawing.points=[{x:1000,y:1000},{x:1100,y:1000},{x:1100,y:1100},{x:1000,y:1100}];
  finishPolygon();
  const afterOne={tool:state.tool,kind:newSlabKind(),n:zonesOf(lv,'slab').length-n0};
  state.drawing.points=[{x:1300,y:1000},{x:1400,y:1000},{x:1400,y:1100},{x:1300,y:1100}];
  finishPolygon();
  const afterTwo={n:zonesOf(lv,'slab').length-n0,kinds:zonesOf(lv,'slab').slice(-2).map(z=>slabKind(z))};
  // clean up
  zonesOf(lv,'slab').splice(-2,2);state.activeZoneIdx=null;
  const esc=escapeOnce({});
  return {afterOne,afterTwo,esc,tool:state.tool};
});
ok(armed.afterOne.tool==='polygon'&&armed.afterOne.kind==='opening','the tool stays armed on the same kind after a shape: '+JSON.stringify(armed.afterOne));
ok(armed.afterTwo.n===2&&armed.afterTwo.kinds.every(k=>k==='opening'),'a second shape draws straight away: '+JSON.stringify(armed.afterTwo));
ok(armed.tool==='select','Escape puts the tool away: '+armed.esc);
await page.evaluate(()=>{state.activeZoneIdx=null;renderSidebar()});

// grouping
await page.evaluate(()=>{state.activeZoneIdx=null;renderSidebar()});
const groups=await page.$$eval('#zoneList .sb-group',g=>g.map(x=>x.textContent));
ok(groups.length>=3,'the slab list is grouped: '+JSON.stringify(groups));
ok(/Slab areas/.test(groups[0]||''),'Slab areas leads the list: '+JSON.stringify(groups));
ok(!groups.some(g=>/^Floor edge/.test(g)),'the floor edge has no group of its own');
const firstRow=await page.$eval('#zoneList .sb-item',e=>e.textContent.replace(/\s+/g,' ').trim());
ok(/Floor edge/.test(firstRow),'it is the first row under Slab areas: '+firstRow);
ok(/slab inside this outline/.test(firstRow),'and its note says what the slab is: '+firstRow);
const order=await page.$$eval('#zoneList > *',n=>n.map(x=>x.className.split(' ')[0]));
ok(order[0]==='sb-group','the list starts with a group header');
ok(await page.evaluate(()=>{setLayer('loading');return document.querySelectorAll('#zoneList .sb-group').length===0}),'the loading list stays flat');
// copy dialog defaults to the layer
ok(await page.evaluate(()=>{setLayer('slab');openCopyFrom();const r={l:document.getElementById('cpLoading').checked,s:document.getElementById('cpSlab').checked};document.getElementById('cpCancel').click();return !r.l&&r.s}),'copy dialog ticks the slab layer when you are on it');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close(); process.exit(fail?1:0);

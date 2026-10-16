// reshore-solver.js — the calculation engine of the reshore calculator.
//
// Loaded by reshore-calc.html as a plain <script> just before the app
// script, so every function here is a global, exactly as when it was
// inline. It reads the app's globals (state, expandLevels, levelSheets …)
// only when called, never at load. No build step: it runs from file://.

// ════════════════════════════════════════════════════════════
//  CALCULATION ENGINE
// ════════════════════════════════════════════════════════════
function placementLoad(slabIn,dl){return(slabIn/12)*150+dl}
// Construction dead load is one number for the job (formwork, workers,
// equipment on the fresh slab), not a per-level question.
// ── OVERHANGS PAST THE FLOOR BELOW ──
// Adolfo, Sep 18 2026: "I feel like the slab edge tolerance really messes
// with the results … if there is an overhanging slab, it gets flagged and the
// user can choose." The tolerance is no longer a setting anyone can turn. The
// rule is his: an overhang of 3 ft or less past the floor below's edge bears
// on that floor — "usually overhangs will have falsework supporting it that
// bring the loads back inside to the edge of slab below", and hairlines are
// areas not drawn exactly. Anything wider is no slab: the reshore above
// spans through to the next slab and is FLAGGED for his OK (the through-shore
// machinery), never taken as bearing. `project.edgeTolFt` in old saves is
// ignored.
const OVERHANG_BEAR_FT=3;
function edgeToleranceFt(){return OVERHANG_BEAR_FT}
// The pour's OWN edge is different: a loading area lapping past the floor
// edge of the slab being placed is not concrete, it is a line drawn a little
// long. Only drafting slop (half a foot) is counted as poured there; the
// rest is reported as "outside the floor edge", as before.
const POUR_LAP_FT=0.5;
function projectDL(){
  const v=state.project&&state.project.constructionDL;
  return (v==null||isNaN(v))?30:+v;
}

// Elevations are TOP OF SLAB (T.O.S.), per structural drawings.
function hasElev(l){return l&&l.elevation!=null&&!isNaN(l.elevation)}

// SOFFIT CONVENTION (Adolfo, Sep 2026): everything about level X is looked
// at from underneath X. "L6 reshore" is the shore standing on L5 T.O.S. and
// reaching the L6 soffit. So:
//    F2F(X)          = TOS(X) - TOS(floor below X)
//    shore height(X) = TOS(X) - slab(X)/12 - TOS(floor below X)
function floorToFloorBelow(idx){
  const l=state.levels[idx],b=state.levels[idx+1];   // levels run top -> bottom
  if(hasElev(l)&&hasElev(b))return l.elevation-b.elevation;
  return l?l.floorToFloor:null;
}
function floorToFloorAbove(idx){return floorToFloorBelow(idx-1)}  // legacy name
// Shore under X's soffit, standing on `below`. Local T.O.S. offsets (slab
// steps, in inches) can be passed for both ends.
function shoreHeightUnder(lv,below,lvSlabIn,lvOffIn,belowOffIn){
  if(!lv||!below)return null;
  const t=lvSlabIn!=null?lvSlabIn:lv.slabThickness;
  if(hasElev(lv)&&hasElev(below)){
    return (lv.elevation+(lvOffIn||0)/12-t/12)-(below.elevation+(belowOffIn||0)/12);
  }
  const f2f=lv.floorToFloor;
  return f2f==null||isNaN(f2f)?null:f2f-t/12;
}

// Clear height a shore actually spans: it bears on `support`'s top of slab and
// reaches the UNDERSIDE of the slab above.
//    height = elev(above) - slabThickness(above) - elev(support)
// `aboveSlabIn` is passed separately so a pour-level thickness override is honored.
function shoreHeightBetween(support,above,aboveSlabIn){
  if(hasElev(support)&&hasElev(above)){
    return (above.elevation-aboveSlabIn/12)-support.elevation;
  }
  // fallback: typed floor-to-floor on the SUPPORTING level (span support -> above)
  const f2f=support?support.floorToFloor:null;
  return f2f==null||isNaN(f2f)?null:f2f-aboveSlabIn/12;
}
function shoreHeight(f2f,slabAboveIn){return f2f-slabAboveIn/12} // legacy
// Timber (Ellis) shores are cataloged up to 15 ft, but practice stops
// using them above a set clear height — a project setting, default 12 ft.
function isTimberShore(s){return s&&(s.timber===true||(s.timber===undefined&&/ellis/i.test(s.name||'')))}
function timberMaxH(){
  const v=state.project&&state.project.timberMaxH;
  return (v==null||isNaN(v))?12:v;
}
function eligibleShores(heightFt,shores){
  if(heightFt==null||isNaN(heightFt))return[];
  const cap=timberMaxH();
  return shores.filter(s=>{
    if(heightFt<s.minH||heightFt>s.maxH)return false;
    if(isTimberShore(s)&&heightFt>cap)return false;
    return true;
  });
}
function interpCapacity(shore,heightFt){
  const t=shore.loadTable;
  if(!t||t.length===0)return shore.capacity||0;
  if(heightFt<=t[0].h)return t[0].cap;
  if(heightFt>=t[t.length-1].h)return t[t.length-1].cap;
  for(let i=0;i<t.length-1;i++){
    if(heightFt>=t[i].h&&heightFt<=t[i+1].h){
      const frac=(heightFt-t[i].h)/(t[i+1].h-t[i].h);
      return Math.round(t[i].cap+frac*(t[i+1].cap-t[i].cap));
    }
  }
  return t[t.length-1].cap;
}
function sfPerShore(cap,resultant){return resultant>0?cap/resultant:Infinity}
function bestPattern(sf){
  if(sf<=0||!isFinite(sf)||sf>9999)return'Not Needed';
  for(let i=GRID_PATTERNS.length-1;i>=0;i--){if(GRID_PATTERNS[i].area<=sf)return GRID_PATTERNS[i].name}
  return'<4×4';
}

function runCalculation(){
  const results=[];
  const shores=state.shores;
  // definitions expand into the real floor stack, so a typical range
  // reshores onto its own floors below
  const levels=expandLevels();
  if(levels.length<2)return results;
  // For each level that can be poured (all except the bottom/SOG)
  for(let i=0;i<levels.length-1;i++){
    const pour=levels[i];
    const dl=projectDL();
    // Group zones by slab thickness for distinct placement loads
    const thicknesses=new Map();
    if(pour.zones.length===0){
      thicknesses.set(pour.slabThickness,[{slabThickness:pour.slabThickness,capacityPSF:levelDefaultCapacity(pour),label:'Default'}]);
    } else {
      pour.zones.forEach(z=>{
        const t=z.slabThicknessOverride||pour.slabThickness;
        if(!thicknesses.has(t))thicknesses.set(t,[]);
        thicknesses.get(t).push(z);
      });
    }
    thicknesses.forEach((zones,thick)=>{
      const pLoad=placementLoad(thick,dl);
      const cascade=[];
      let remaining=pLoad;
      for(let j=i+1;j<levels.length&&remaining>0;j++){
        const below=levels[j];
        const prevLevel=levels[j-1];
        const prevSlabThick=j===i+1?thick:prevLevel.slabThickness;
        // Shores at reshore level `below` bear on below's slab and support
        // prevLevel's slab, so the span is below -> prevLevel. The old code
        // read prevLevel.floorToFloor, which is the span one level higher.
        const hFt=shoreHeightUnder(below,levels[j+1],below.slabThickness);
        // Check if spatial matching is available
        const pourAligned=pour.alignment&&pour.alignment.transform;
        const belowAligned=below.alignment&&below.alignment.transform;
        const useSpatial=pourAligned&&belowAligned&&pour.zones.length>0&&below.zones.length>0;
        let cap=levelDefaultCapacity(below);
        let regions=null;
        if(useSpatial){
          // Use spatial overlap to find per-region matches
          regions=findOverlapRegions(pour.zones,below.zones,pour.alignment.transform,below.alignment.transform,1);
          // Overall capacity: use the minimum capacity among all matched cap zones (conservative)
          if(regions.length>0){
            cap=Math.min(...regions.map(r=>r.capZone.capacityPSF));
          }
        } else {
          if(below.zones.length>0){cap=Math.min(...below.zones.map(z=>z.capacityPSF))}
        }
        if(levelOnGrade(below)||(j===levels.length-1&&below.name.toLowerCase().includes('sog'))){cap=99999}
        const resultant=remaining-cap;
        const eligible=eligibleShores(hFt,shores);
        const cascadeEntry={
          level:below,levelIdx:j,
          capacity:cap,resultant,remaining,
          shoreHeightFt:hFt,
          shoreOptions:eligible.map(s=>{
            const capAtH=interpCapacity(s,hFt);
            return{shore:s,capacityAtHeight:capAtH,
              sfPerShore:sfPerShore(capAtH,resultant>0?resultant:0),
              pattern:bestPattern(sfPerShore(capAtH,resultant>0?resultant:0))};
          }),
          needed:resultant>0,
          useSpatial:!!useSpatial
        };
        // Add per-region details if spatial
        if(useSpatial&&regions&&regions.length>0){
          cascadeEntry.regions=regions.map(r=>{
            const regionCap=r.capZone.capacityPSF;
            const regionResultant=remaining-regionCap;
            return {
              pourZone:r.pourZone,
              capZone:r.capZone,
              sampleCount:r.sampleCount,
              capacity:regionCap,
              resultant:regionResultant,
              needed:regionResultant>0,
              shoreOptions:eligible.map(s=>{
                const capAtH=interpCapacity(s,hFt);
                return{shore:s,capacityAtHeight:capAtH,
                  sfPerShore:sfPerShore(capAtH,regionResultant>0?regionResultant:0),
                  pattern:bestPattern(sfPerShore(capAtH,regionResultant>0?regionResultant:0))};
              })
            };
          });
        }
        cascade.push(cascadeEntry);
        remaining=resultant>0?resultant:0;
      }
      results.push({pourLevel:pour,pourIdx:i,slabThickness:thick,placementLoad:pLoad,zones,cascade});
    });
  }
  return results;
}

// ════════════════════════════════════════════════════════════
//  FLOOR CAPACITY FROM A LOADING CONDITION
//  (formula and its source are documented at the LOADING MAP PARSER in
//  reshore-calc.html)
// ════════════════════════════════════════════════════════════
const LL_FACTOR=1.6/1.3, LL_REDUCTION=0.6;

function markCapacity(sdl,ll,reducible){
  if(sdl==null||ll==null||isNaN(sdl)||isNaN(ll))return null;
  const live=LL_FACTOR*ll;
  return Math.floor(sdl+(reducible?LL_REDUCTION*live:live));
}

// ════════════════════════════════════════════════════════════
//  SPATIAL OVERLAP
// ════════════════════════════════════════════════════════════
function transformPolyToBuilding(poly,transform){
  return poly.map(pt=>{
    const b=pixelToBuilding(pt.x,pt.y,transform);
    return {x:b.bx,y:b.by};
  });
}

function polyBBox(polys){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const poly of polys){
    for(const pt of poly){
      if(pt.x<minX)minX=pt.x;if(pt.y<minY)minY=pt.y;
      if(pt.x>maxX)maxX=pt.x;if(pt.y>maxY)maxY=pt.y;
    }
  }
  return {minX,minY,maxX,maxY};
}

function findOverlapRegions(pourZones,capZones,pourTransform,capTransform,sampleStep){
  sampleStep=sampleStep||1;
  // Transform all zone polygons to building coordinates
  const pourBuilding=pourZones.map(z=>({zone:z,bPoly:transformPolyToBuilding(z.polygon,pourTransform)}));
  const capBuilding=capZones.map(z=>({zone:z,bPoly:transformPolyToBuilding(z.polygon,capTransform)}));
  // Find bounding box of pour zones in building space
  const bbox=polyBBox(pourBuilding.map(p=>p.bPoly));
  // Add a small margin
  bbox.minX=Math.floor(bbox.minX)-1;
  bbox.minY=Math.floor(bbox.minY)-1;
  bbox.maxX=Math.ceil(bbox.maxX)+1;
  bbox.maxY=Math.ceil(bbox.maxY)+1;
  // Sample grid across bounding box
  const regions=new Map(); // key: "pourIdx|capIdx" -> {pourZone, capZone, sampleCount}
  for(let bx=bbox.minX;bx<=bbox.maxX;bx+=sampleStep){
    for(let by=bbox.minY;by<=bbox.maxY;by+=sampleStep){
      const bpt={x:bx,y:by};
      // Which pour zone does this point fall in?
      let pourIdx=-1;
      for(let pi=0;pi<pourBuilding.length;pi++){
        if(pointInPoly(bpt,pourBuilding[pi].bPoly)){pourIdx=pi;break}
      }
      if(pourIdx<0)continue;
      // Which cap zone?
      let capIdx=-1;
      for(let ci=0;ci<capBuilding.length;ci++){
        if(pointInPoly(bpt,capBuilding[ci].bPoly)){capIdx=ci;break}
      }
      if(capIdx<0)continue;
      const key=pourIdx+'|'+capIdx;
      if(!regions.has(key))regions.set(key,{pourZone:pourBuilding[pourIdx].zone,capZone:capBuilding[capIdx].zone,sampleCount:0});
      regions.get(key).sampleCount++;
    }
  }
  return Array.from(regions.values()).filter(r=>r.sampleCount>0);
}

// ════════════════════════════════════════════════════════════
//  PER-REGION CASCADE SOLVER  (Phase 4)
//
//  Loads accumulate straight down, so the honest unit of analysis is a
//  POINT on the plan, not a level. For each sample point we resolve the
//  slab thickness being placed and the capacity of every floor beneath
//  it, then run the cascade at that point until the load is absorbed.
//
//  Points sharing the same thickness + capacity sequence are one region.
//  Each region reports its own minimum number of reshore levels, the
//  shore that gives the widest legal spacing, and its area.
//
//  Everything happens in BUILDING coordinates (feet), which is why each
//  level needs an alignment: it is what makes floors stack.
// ════════════════════════════════════════════════════════════
const SOLVE_STEP_FT=2;        // sampling pitch
const SOLVE_MAX_SAMPLES=90000;
const SOLVE_MAX_DEPTH=12;     // reshore levels to try before giving up

function polyBBoxFt(poly){
  let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;
  for(const p of poly){
    if(p.x<a)a=p.x; if(p.y<b)b=p.y;
    if(p.x>c)c=p.x; if(p.y>d)d=p.y;
  }
  return{minX:a,minY:b,maxX:c,maxY:d};
}
function bboxHit(bb,x,y){return x>=bb.minX&&x<=bb.maxX&&y>=bb.minY&&y<=bb.maxY}

// Zones of one level, pre-transformed into building feet with bboxes.
// Each area goes to feet through ITS OWN sheet's match, so a floor split
// across sheets comes back as one set of shapes in one frame.
function levelZonesInBuilding(lv,layer){
  if(!lv)return null;
  if(!levelAnyMatch(lv))return null;
  const out=[];
  for(const z of zonesOf(lv,layer)){
    if(!z.polygon||z.polygon.length<3)continue;
    const a=zoneAlignment(lv,z);
    if(!a||!a.transform)continue;              // its sheet is not matched yet
    const bPoly=transformPolyToBuilding(z.polygon,a.transform);
    out.push({zone:z,bPoly,bb:polyBBoxFt(bPoly),areaFt:Math.abs(polyAreaFt(bPoly))});
  }
  return out;
}
// Loading areas: an overlap reads as a CUTOUT — the smaller area is an
// exception drawn inside the larger one and governs its own space, and the
// larger area governs everywhere else. So the smallest area covering a point
// wins, whatever order they were drawn in (ties → last drawn, matching the
// canvas). Slab conditions keep plain draw order (see zoneAt).
function distToPolyEdge(p,poly){
  let best=Infinity;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const q=nearestOnSegment(p,a,b);
    const d=Math.hypot(q.x-p.x,q.y-p.y);
    if(d<best)best=d;
  }
  return best;
}
// The area whose edge is nearest to (x,y), if within tol ft.
function capZoneNear(list,x,y,tol){
  if(!list||!(tol>0))return null;
  let best=null,bd=tol;
  const p={x,y};
  for(const e of list){
    if(!e.bPoly||e.bPoly.length<3)continue;
    if(x<e.bb.minX-tol||x>e.bb.maxX+tol||y<e.bb.minY-tol||y>e.bb.maxY+tol)continue;
    const d=distToPolyEdge(p,e.bPoly);
    if(d<=bd){bd=d;best=e}
  }
  return best;
}
function capZoneAt(list,x,y){
  if(!list)return null;
  let best=null;
  for(let i=list.length-1;i>=0;i--){
    const e=list[i];
    if(!bboxHit(e.bb,x,y)||!pointInPoly({x,y},e.bPoly))continue;
    const a=e.areaFt!=null?e.areaFt:Math.abs(polyAreaFt(e.bPoly));
    if(!best||a<(best.areaFt!=null?best.areaFt:Math.abs(polyAreaFt(best.bPoly))))best=e;
  }
  return best;
}
function zoneAt(list,x,y){
  if(!list)return null;
  // last drawn wins, matching how the canvas paints them
  for(let i=list.length-1;i>=0;i--){
    const e=list[i];
    if(bboxHit(e.bb,x,y)&&pointInPoly({x,y},e.bPoly))return e;
  }
  return null;
}

// Deliberately does NOT choose. Several shores are usually legal and the
// pick is an equipment call, so the app lists them and the schedule asks.
// MDL-19: the forced second level carries nothing the math asks for, so it
// goes in at the loosest pattern the catalog allows (Adolfo, Sep 25: "loosest
// pattern"), with any shore that reaches the height.
function shoreOptionsForMin(heightFt,shores){
  const loose=GRID_PATTERNS[GRID_PATTERNS.length-1];
  return eligibleShores(heightFt,shores).map(s=>({shoreId:s.id,shore:s,capacityAtHeight:interpCapacity(s,heightFt),
    sfPerShore:loose.area,pattern:loose.name,spacing:patternSpacingFt(loose.name),timber:isTimberShore(s),minLevel:true}));
}
// Does this row put shores in? A load the floor cannot take, or the second
// level MDL-19 adds where one level would do.
function stNeeds(st){return !!(st&&!st.open&&!st.grade&&(st.resultant>0||st.minLevel))}
function shoreOptionsFor(heightFt,resultantPsf,shores){
  const eligible=eligibleShores(heightFt,shores);
  const r=resultantPsf>0?resultantPsf:0;
  return eligible.map(s=>{
    const capAtH=interpCapacity(s,heightFt);
    const sf=sfPerShore(capAtH,r);
    const pattern=bestPattern(sf);
    return{shoreId:s.id,shore:s,capacityAtHeight:capAtH,sfPerShore:sf,pattern,
           spacing:patternSpacingFt(pattern),timber:isTimberShore(s)};
  });   // catalog order, deliberately: sorting by widest spacing would nudge
        // the choice toward the heaviest shore, and the pick is the user's
}

// The user's saved pick for one schedule row, if any.
function shoreChoices(){
  if(!state.project.shoreChoices)state.project.shoreChoices={};
  return state.project.shoreChoices;
}
// ── A SHORE THAT PASSES THROUGH AN OPEN FLOOR ──
// Adolfo, Sep 18 2026, on a region reading "L3 39 PSF – L2 opening – 1B SOG":
// "this incorrectly assumes that there is slab beneath L3 when there is an
// opening at L2 directly beneath." The floor under L3 is open there, so the
// reshore under L3 has nothing to stand on at L2 and the solver runs it
// down to the next slab (1B, 19'-5"). He chose to keep that through-shore
// but never as a silent default: each one is flagged on its row, on its
// chip and on the plan until he has looked at it and pressed OK, and the
// acceptance is saved with the job by the row's own key.
function throughOk(){
  if(!state.project.throughOk)state.project.throughOk={};
  return state.project.throughOk;
}
// MDL-10: a shore runs on past an open floor to the next slab — but an
// opening that continues more than this many floors down is a shaft, and a
// shore does not stand 391 ft down an elevator shaft (Kalae, Oct 15 2026).
// Such a row has nothing below to stand on: no height, no options, flagged.
const SHAFT_OPEN_FLOORS=2;
function isThrough(st){return !!(st&&!st.open&&!st.grade&&stNeeds(st)&&st.spansOpen>0&&st.supportLevel)}
function throughAccepted(key){return !!throughOk()[key]}
// the open floors a through-shore passes: the steps between this one and its support
function throughPassed(r,st){
  const i=r.steps.indexOf(st);if(i<0)return [];
  return r.steps.slice(i+1).filter(x=>x.open&&x.levelIdx<st.supportIdx).map(x=>x.level.name);
}
function throughText(r,st){
  const names=throughPassed(r,st);
  return `through ${names.length?names.map(n=>`${n} (${r.steps.find(x=>x.level.name===n&&x.noSlab)?`no slab — past its floor edge by more than ${OVERHANG_BEAR_FT} ft`:'opening'})`).join(' and '):'an open floor'} → stands on ${st.supportLevel.name}`;
}
function throughItems(L){
  const s=L&&L.solve;if(!s||!s.spatial)return [];
  const out=[];
  s.regions.forEach((r,ri)=>r.steps.forEach(st=>{if(isThrough(st))out.push({r,ri,st,key:st.choiceKey,accepted:throughAccepted(st.choiceKey)})}));
  (s.beams||[]).forEach((b,bi)=>(b.rows||[]).forEach(row=>{
    if(row.open||row.grade||!(row.beamNet>0)||!(row.spansOpen>0)||!row.supportLevel)return;
    out.push({b,bi,row,key:row.beamKey,accepted:throughAccepted(row.beamKey),beam:true});
  }));
  return out;
}
function setThroughOk(key,on){
  history.record(on?'Accept through-shore':'Recheck through-shore');
  if(on)throughOk()[key]=true;else delete throughOk()[key];
  persist();
}
// ── A STIFF SHORE STANDING ON SLAB ON GRADE (MDL-18) ──
// Adolfo, Sep 22 2026: the load-sharing this calculator relies on — each slab
// in the stack taking its share, the shore load shrinking on the way down —
// only happens if the slabs can deflect against each other. Wood (Ellis)
// shores give that compliance through end-grain crush and axial shortening.
// A steel or aluminum post is stiff enough that a chain of them from the
// pour down to slab on grade acts as one rigid column: the slabs are held
// flat and take almost nothing, and the bottom shores carry close to the
// full accumulated load straight to the SOG — far more than this schedule
// shows. The field mitigation is a wood pad under each base to let it
// crush. So: a non-timber shore whose base sits on grade carries a required
// pad note on its row, on the install summary and on the printed sheet. It
// is a field condition, not an OK to press away — the note stays.
const PAD_SPEC='two layers of 3/4" plywood (1-1/2" min), 12"×12" or larger';
function needsPad(st){return !!(st&&!st.open&&!st.grade&&stNeeds(st)&&st.onGrade&&st.chosen&&!st.chosen.timber)}
function beamNeedsPad(row){return !!(row&&!row.open&&!row.grade&&row.beamNet>0&&row.onGrade&&row.beamChosen&&!row.beamChosen.timber)}
function padText(shoreName,onName){return `${shoreName} is a stiff shore standing on slab on grade${onName?` (${onName})`:''}: set every base on a wood pad — ${PAD_SPEC} — so the slabs above can deflect and share the load. Without the pad the slabs are held flat and the shores carry the full stack to grade.`}
function padItems(L){
  const s=L&&L.solve;if(!s||!s.spatial)return [];
  const out=[];
  s.regions.forEach((r,ri)=>r.steps.forEach(st=>{if(needsPad(st))out.push({r,ri,st,key:st.choiceKey})}));
  (s.beams||[]).forEach((b,bi)=>(b.rows||[]).forEach(row=>{if(beamNeedsPad(row))out.push({b,bi,row,key:row.beamKey,beam:true})}));
  return out;
}
function choiceKey(pourName,regionKey,levelIdx){return `${pourName}|${regionKey}|${levelIdx}`}
function chosenOption(options,key){
  const id=shoreChoices()[key];
  if(!id)return null;
  return options.find(o=>o.shoreId===id)||null;
}
// MDL-17: how a ramp's shore height reads, and whether the shore picked for
// its tall end still fits at the short one. A shore cannot close shorter than
// its own minimum height, so a pattern chosen at 13'-4" is no use at the low
// end of the ramp if that shore only closes to 9'-0".
function shoreHeightText(st){
  if(!st||st.shoreHeightFt==null)return '\u2014';
  const hi=feetToStr(st.shoreHeightFt);
  if(st.shoreHeightMinFt==null)return hi;
  return `${feetToStr(st.shoreHeightMinFt)}\u2013${hi}`;
}
function slopeShortEndFail(st){
  if(!st||st.shoreHeightMinFt==null||!st.chosen||!st.chosen.shore)return null;
  const minH=+st.chosen.shore.minH;
  if(isNaN(minH)||st.shoreHeightMinFt>=minH-1e-6)return null;
  return{minH,at:st.shoreHeightMinFt,name:st.chosen.shore.name};
}
function patternSpacingFt(pattern){
  const m=String(pattern||'').match(/(\d+)/);
  return m?parseInt(m[1],10):0;
}

// Cascade at a single point. Returns the per-level detail and how many
// reshore levels it actually takes.
//
// Soffit convention: the row for floor X is the shore UNDER X's slab. It
// carries X's resultant and stands on the next floor below X that has slab
// at this point — an opening on the floor in between is skipped (no
// capacity there, nothing to stand on) and the shore simply gets taller.
// Each floor's `_capAt` and `_slabAt` ({open,thick,off,grade}) are resolved
// by the caller for this point. Beam stems are handled separately
// (beamProfileAt / beamChain) — a beam on the pour does not change the slab
// cascade around it.
function cascadeAtPoint(stack,pourIdx,thickIn,dl,shores){
  const pLoad=placementLoad(thickIn,dl);
  const steps=[];
  let remaining=pLoad;
  let reshore=0;
  for(let j=pourIdx+1;j<stack.length&&reshore<SOLVE_MAX_DEPTH;j++){
    const lv=stack[j];
    const sl=lv._slabAt||{open:false,thick:lv.slabThickness,off:0,soffitIn:lv.slabThickness};
    if(sl.open){
      steps.push({levelIdx:j,level:lv,open:true,noSlab:!!sl.noSlab,capacity:0,remaining,resultant:remaining,options:[]});
      continue;
    }
    // ON GRADE: the soil takes whatever arrives; nothing below to shore from.
    if(sl.grade){
      steps.push({levelIdx:j,level:lv,grade:true,capacity:null,remaining,resultant:-remaining,options:[]});
      remaining=0;
      break;
    }
    const cap=lv._capAt;
    const resultant=remaining-cap;
    // the floor this shore stands on: next one down with slab here
    let sj=-1;
    for(let m=j+1;m<stack.length;m++){const t=stack[m]._slabAt;if(!t||!t.open){sj=m;break}}
    let shaft=0;if(sj>=0&&sj-j-1>SHAFT_OPEN_FLOORS){shaft=sj-j-1;sj=-1}   // MDL-10: a shaft, not a through-shore
    const sup=sj>=0?stack[sj]:null;
    const needShores=resultant>0;
    const supSl=sup?(sup._slabAt||{}):null;
    // MDL-17. Under a ramp the shore height is a RANGE. The TALLEST governs
    // the pick — this floor at its high point standing on the floor below at
    // its low one — and the shortest is carried alongside so the chosen
    // shore can be checked against its closed length at the low end.
    const hFt=(needShores&&sup)?shoreHeightUnder(lv,sup,sl.soffitIn!=null?sl.soffitIn:sl.thick,sl.off,(supSl.offLow!=null?supSl.offLow:supSl.off)||0):null;
    const sloped=!!(sl.sloped||(supSl&&supSl.sloped));
    const hMinFt=(needShores&&sup&&sloped)
      ?shoreHeightUnder(lv,sup,sl.soffitIn!=null?sl.soffitIn:sl.thick,sl.offLow!=null?sl.offLow:sl.off,supSl.off||0):null;
    steps.push({levelIdx:j,level:lv,capacity:cap,remaining,resultant,
                shoreHeightFt:hFt,supportLevel:sup,supportIdx:sj,shaft,
                onGrade:!!(supSl&&supSl.grade),          // MDL-18: this shore's base sits on slab on grade
                ...(sloped&&hMinFt!=null&&hFt!=null&&Math.abs(hFt-hMinFt)>=1/24?{shoreHeightMinFt:hMinFt,sloped:true}:{}),
                spansOpen:sup?sj-j-1:0,
                options:(needShores&&hFt!=null)?shoreOptionsFor(hFt,Math.max(resultant,0),shores):[]});
    if(resultant<=0){
      // MDL-19: MINIMUM 2 LEVELS OF RESHORE. Adolfo, Sep 25 2026: "if only one
      // level of reshore is required, we would default to 2 levels (except
      // where not possible when reshore goes to slab on grade) as a safety
      // measure since slabs are still pretty green when we pour on top of
      // them." So where the first level of shores is the only one the load
      // needs, the floor that absorbs it gets a row of its own as well, at
      // the loosest pattern — unless there is nothing under it to stand on.
      // (A floor on grade has already ended the loop above.) Slabs only:
      // beams keep their own chain (BEM-01).
      if(reshore===1&&sup){
        const st=steps[steps.length-1];
        const h2=shoreHeightUnder(lv,sup,sl.soffitIn!=null?sl.soffitIn:sl.thick,sl.off,(supSl.offLow!=null?supSl.offLow:supSl.off)||0);
        if(h2!=null){
          st.minLevel=true;st.shoreHeightFt=h2;
          if(sloped){const h2m=shoreHeightUnder(lv,sup,sl.soffitIn!=null?sl.soffitIn:sl.thick,sl.offLow!=null?sl.offLow:sl.off,supSl.off||0);
            if(h2m!=null&&Math.abs(h2-h2m)>=1/24){st.shoreHeightMinFt=h2m;st.sloped=true}}
          st.options=shoreOptionsForMin(h2,shores);
        }
      }
      remaining=0;break;
    }
    remaining=resultant;
    reshore++;
    if(!sup)break;                      // nothing below to stand on
  }
  return{placementLoad:pLoad,steps,
         reshoreLevels:steps.filter(stNeeds).length,
         unresolved:remaining>0};
}

// Minimum region size (SF). A patch below this is a drawing artifact rather
// than a condition of its own, and is absorbed by a neighbor — but only a
// neighbor that reads the SAME WAY DOWN THE STACK (Adolfo, Sep 10, 2026).
// A patch with a different load path — no slab below, an opening, on grade —
// stands on its own however small, and is flagged instead.
// A piece this small is a tracing artifact whatever it reads, and so is one
// that is nowhere more than two sample steps across. Fixed, not a setting:
// the edge tolerance taught us that a knob here changes answers quietly.
const ARTIFACT_SF=50;
function minRegionSF(){
  const v=state.project&&state.project.minRegionSF;
  return (v==null||isNaN(v))?200:Math.max(0,+v);
}
// Legacy load-path label, retained for callers and regression fixtures.
function cascadeShape(r){
  return (r&&r.steps||[]).map(s=>s.grade?'grade':s.open?(s.noSlab?'noslab':'open'):'bear').join('>');
}
// THE MARKS ARE PART OF WHAT A REGION IS.
// Adolfo, Sep 8 2026: 9" over B2 and 9" over C2 are two conditions on the
// plan even at the same PSF. Sep 15 2026, after a 177 SF C2 patch was folded
// into the B2 region beside it and came back labeled "B2 / C2": "do not
// merge loading conditions."
// So the minimum-region rule may still absorb a sliver whose CAPACITY or
// shore height differs by a hair — his Sep 10 call, inches of height do not
// change the answer — but a difference in MARK on any carrying floor means
// two different loading conditions, and those are never merged into one row
// however small the piece is.
// (named ...Sig, because regionMarks further down is the display list read
// off r.steps, which is not filled in until the regions are final)
function regionMarkSig(r){
  const sc=(r&&r.stepCodes)||{};
  return Object.keys(sc).map(Number).sort((a,b)=>a-b)
    .map(k=>k+':'+[...sc[k]].sort().join('+')).join('|');
}
function mergeShape(r){return cascadeShape(r)+'#'+regionMarkSig(r)}
function mergeSlivers(regions,step,minSF){
  const list=[...regions.values()];
  const regSF=r=>r.areaSF!=null?r.areaSF:r.samples*step*step;
  const flag=()=>{for(const r of regions.values())r.smallRegion=minSF>0&&regSF(r)<minSF};
  flag();
  if(!(minSF>0)||list.length<2)return;

  // Sample centers sit on a regular lattice, so a cell's neighbor is one
  // step away on each axis. The epsilon keeps a .5 tie from flipping on
  // float jitter; every cell in a solve shares the same origin and step.
  const q=v=>Math.round(v/step+1e-6);
  const cellKey=(x,y)=>q(x)+','+q(y);
  const owner=new Map();
  list.forEach((r,i)=>{for(let c=0;c<r.cells.length;c+=2)owner.set(cellKey(r.cells[c],r.cells[c+1]),i)});
  const shape=list.map(mergeShape);
  const alive=list.map(()=>true);
  const host=i=>{while(!alive[i]&&list[i]._into!=null)i=list[i]._into;return i};
  const NB=[[1,0],[-1,0],[0,1],[0,-1]];

  let moved=true;
  while(moved){
    moved=false;
    // smallest first: a sliver should choose its neighbor, not be chosen
    const order=list.map((r,i)=>i)
      .filter(i=>alive[i]&&regSF(list[i])<minSF)
      .sort((a,b)=>regSF(list[a])-regSF(list[b]));
    for(const i of order){
      if(!alive[i])continue;
      const r=list[i];
      // how much boundary this patch shares with each candidate
      const share=new Map();
      for(let c=0;c<r.cells.length;c+=2){
        const x=q(r.cells[c]),y=q(r.cells[c+1]);
        for(const [dx,dy] of NB){
          const at=owner.get((x+dx)+','+(y+dy));
          if(at==null)continue;
          const h=host(at);
          if(h===i||!alive[h])continue;
          if(shape[h]!==shape[i])continue;   // different load path or mark — never merge
          share.set(h,(share.get(h)||0)+1);
        }
      }
      if(!share.size)continue;
      let pick=-1,most=-1;
      for(const [h,cnt] of share){
        if(cnt>most||(cnt===most&&regSF(list[h])>regSF(list[pick]))){pick=h;most=cnt}
      }
      const into=list[pick];
      into.sliverSF=(into.sliverSF||0)+regSF(r);
      if(into.areaSF!=null)into.areaSF+=regSF(r);
      if(r.mp)into.mp=mpUnion(into.mp,r.mp);
      into.sliverCount=(into.sliverCount||0)+1+(r.sliverCount||0);
      into.samples+=r.samples;
      into.edgeSamples=(into.edgeSamples||0)+(r.edgeSamples||0);
      for(let c=0;c<r.cells.length;c+=2){
        into.cells.push(r.cells[c],r.cells[c+1]);
        owner.set(cellKey(r.cells[c],r.cells[c+1]),pick);
      }
      for(const m of r.loadingMarks)into.loadingMarks.add(m);
      for(const k of Object.keys(r.stepCodes||{})){
        const set=into.stepCodes[k]||(into.stepCodes[k]=new Set());
        for(const code of r.stepCodes[k])set.add(code);
      }
      into.bb.minX=Math.min(into.bb.minX,r.bb.minX);into.bb.maxX=Math.max(into.bb.maxX,r.bb.maxX);
      into.bb.minY=Math.min(into.bb.minY,r.bb.minY);into.bb.maxY=Math.max(into.bb.maxY,r.bb.maxY);
      alive[i]=false;r._into=pick;r.mergedInto=into;
      regions.delete(r.key);
      moved=true;
    }
  }
  // ══ EDGE SLIVERS ══
  // Adolfo, Sep 21 2026: "WE NEED TO GET RID OF THE SLIVERS IN THE RESULTS."
  // What is left under the minimum is small AND reads differently — a
  // different mark, or a load path that differs only because two traced
  // outlines disagree by inches (noslab>bear along an edge, open>grade at the
  // lip of an opening). Where such a piece is TINY (under ARTIFACT_SF) or
  // THIN (nowhere more than two sample steps across) it is an artifact of the
  // drawing, not a condition, and it is absorbed into the neighbor it shares
  // the most boundary with WHATEVER that neighbor reads.
  //
  // What it does NOT do is take the sliver's identity with it: the host keeps
  // its own marks and its own cascade, so nothing comes back labeled
  // "B2 / C2" (Sep 15: "do not merge loading conditions") and no calculation
  // changes. What went in is recorded on the host and listed, so a patch that
  // read differently is stated rather than hidden.
  const cellSet=r=>{const t=new Set();for(let c=0;c<r.cells.length;c+=2)t.add(cellKey(r.cells[c],r.cells[c+1]));return t};
  // thin: no cell of it has all four neighbors inside the piece, so it is
  // nowhere more than two sample steps across
  const isThin=r=>{
    const t=cellSet(r);
    for(const k of t){
      const [x,y]=k.split(',').map(Number);
      if(NB.every(([dx,dy])=>t.has((x+dx)+','+(y+dy))))return false;
    }
    return true;
  };
  // Two tests, because two things can make a small piece its own region.
  //  · a different MARK on the same structure: absorbing it changes no
  //    shoring, so tiny OR thin is enough;
  //  · a different LOAD PATH — no slab below, an opening, grade: only
  //    THINNESS justifies absorbing that, because a compact patch is real
  //    geometry. This is what keeps the 49 SF corner notch of Sep 10 its own
  //    row ("this area is incorrectly reading a slab below when there is not
  //    one that exists") while clearing the ribbons that run along an edge
  //    because two traced outlines disagree by inches.
  const cascadeOf=list.map(cascadeShape);
  moved=true;
  while(moved){
    moved=false;
    const order=list.map((r,i)=>i)
      .filter(i=>alive[i]&&regSF(list[i])<minSF&&(regSF(list[i])<ARTIFACT_SF||isThin(list[i])))
      .sort((a,b)=>regSF(list[a])-regSF(list[b]));
    for(const i of order){
      if(!alive[i])continue;
      const r=list[i];
      const thin=isThin(r);
      const share=new Map();
      for(let c=0;c<r.cells.length;c+=2){
        const x=q(r.cells[c]),y=q(r.cells[c+1]);
        for(const [dx,dy] of NB){
          const at=owner.get((x+dx)+','+(y+dy));
          if(at==null)continue;
          const h=host(at);
          if(h===i||!alive[h])continue;
          // a thin piece may go anywhere; a compact one only where the load
          // path is the same, so nothing structural is absorbed away
          if(!thin&&cascadeOf[h]!==cascadeOf[i])continue;
          share.set(h,(share.get(h)||0)+1);
        }
      }
      if(!share.size)continue;                    // an island keeps its own row
      let pick=-1,most=-1;
      for(const [h,cnt] of share){
        if(cnt>most||(cnt===most&&regSF(list[h])>regSF(list[pick]))){pick=h;most=cnt}
      }
      const into=list[pick];
      const sf=regSF(r);
      into.artifactSF=(into.artifactSF||0)+sf;
      into.artifactCount=(into.artifactCount||0)+1+(r.artifactCount||0);
      (into.artifacts||(into.artifacts=[])).push({sf,shape:cascadeShape(r),
        marks:[...(r.loadingMarks||[])].filter(m=>m!=null).join('/'),thin:isThin(r)});
      for(const a of (r.artifacts||[]))into.artifacts.push(a);
      if(into.areaSF!=null)into.areaSF+=sf;
      if(r.mp)into.mp=mpUnion(into.mp,r.mp);
      into.samples+=r.samples;
      into.edgeSamples=(into.edgeSamples||0)+(r.edgeSamples||0);
      for(let c=0;c<r.cells.length;c+=2){
        into.cells.push(r.cells[c],r.cells[c+1]);
        owner.set(cellKey(r.cells[c],r.cells[c+1]),pick);
      }
      // deliberately NOT carried over: loadingMarks, stepCodes, the cascade
      into.bb.minX=Math.min(into.bb.minX,r.bb.minX);into.bb.maxX=Math.max(into.bb.maxX,r.bb.maxX);
      into.bb.minY=Math.min(into.bb.minY,r.bb.minY);into.bb.maxY=Math.max(into.bb.maxY,r.bb.maxY);
      alive[i]=false;r._into=pick;r.mergedInto=into;
      regions.delete(r.key);
      moved=true;
    }
  }
  // what is left under the threshold could not find a neighbor reading the
  // same way down the stack, and is neither thin nor tiny, so it keeps its
  // own calculation and is flagged
  flag();
}
function resolveMerged(r){while(r&&r.mergedInto)r=r.mergedInto;return r}

// BEAM PROFILE: for one beam footprint over one slab region, the per-floor
// facts the beam block needs. The stem rides down the same stack as the
// slab; at each floor only the capacity the slab leaves over can carry it.
// The effective width that turns that spare PSF into PLF is a per-row input
// applied at render time (beamChain), so this stores capacity, the slab
// load arriving, and the shore geometry only. It runs on past the floor
// where the slab itself was absorbed (spare = full capacity there).
function beamProfileAt(stack,pourIdx,regSteps,shores){
  const remAt={};for(const st of regSteps)remAt[st.levelIdx]=st.remaining;
  const rows=[];
  for(let j=pourIdx+1;j<stack.length&&rows.length<SOLVE_MAX_DEPTH+4;j++){
    const lv=stack[j];
    const sl=lv._slabAt||{open:false,thick:lv.slabThickness,off:0,soffitIn:lv.slabThickness};
    if(sl.open){rows.push({levelIdx:j,level:lv,open:true,noSlab:!!sl.noSlab});continue}
    if(sl.grade){rows.push({levelIdx:j,level:lv,grade:true});break}
    const cap=lv._capAt;
    const slabRem=remAt[j]!=null?remAt[j]:0;
    let sj=-1;
    for(let m=j+1;m<stack.length;m++){const t=stack[m]._slabAt;if(!t||!t.open){sj=m;break}}
    let shaft=0;if(sj>=0&&sj-j-1>SHAFT_OPEN_FLOORS){shaft=sj-j-1;sj=-1}   // MDL-10
    const sup=sj>=0?stack[sj]:null;
    const supSl=sup?(sup._slabAt||{}):null;
    const hFt=sup?shoreHeightUnder(lv,sup,sl.soffitIn!=null?sl.soffitIn:sl.thick,sl.off,(supSl.offLow!=null?supSl.offLow:supSl.off)||0):null;
    const sloped=!!(sl.sloped||(supSl&&supSl.sloped));      // MDL-17
    const hMinFt=(sup&&sloped)?shoreHeightUnder(lv,sup,sl.soffitIn!=null?sl.soffitIn:sl.thick,sl.offLow!=null?sl.offLow:sl.off,supSl.off||0):null;
    rows.push({levelIdx:j,level:lv,capacity:cap,slabRemaining:slabRem,sparePsf:Math.max(0,cap-slabRem),
               shoreHeightFt:hFt,supportLevel:sup,supportIdx:sj,spansOpen:sup?sj-j-1:0,shaft,
               onGrade:!!(supSl&&supSl.grade),           // MDL-18
               ...(sloped&&hMinFt!=null&&hFt!=null&&Math.abs(hFt-hMinFt)>=1/24?{shoreHeightMinFt:hMinFt,sloped:true}:{}),
               options:hFt!=null?shoreOptionsFor(hFt,0,shores):[]});
    if(!sup)break;
  }
  return rows;
}
function beamRowKey(pourName,item,levelIdx){return `${pourName}|beam|${item.beamId}|${item.regionKey}|${levelIdx}`}
// Apply the per-row effective widths and the user's shore picks.
function beamChain(item,pourName){
  const ch=shoreChoices();
  let net=item.plf;
  const rows=[];
  for(const r of item.profile){
    if(r.open){rows.push({...r,beamIn:net,beamNet:net});continue}
    if(r.grade){rows.push({...r,beamIn:net,beamNet:0});net=0;break}
    const key=beamRowKey(pourName,item,r.levelIdx);
    const wRaw=parseFloat(ch[key+'|W']);
    const effW=(!isNaN(wRaw)&&wRaw>0)?wRaw:item.widthFt;
    const spare=r.sparePsf*effW;
    const beamIn=net;
    net=Math.max(0,beamIn-spare);
    const chosen=net>0?chosenOption(r.options,key):null;
    const n=parseInt(ch[key+'N'],10)||1;
    rows.push({...r,beamKey:key,effW,effWIsDefault:isNaN(wRaw)||!(wRaw>0),spare,beamIn,beamNet:net,
               beamChosen:chosen,beamPerCluster:n,
               beamSpacingFt:(net>0&&chosen)?Math.min(10,Math.floor((n*chosen.capacityAtHeight/net)*4)/4):null,
               noOptions:net>0&&r.options.length===0});
    if(net<=0)break;
  }
  return{rows,unresolved:net>0,levels:rows.filter(r=>!r.open&&!r.grade&&r.beamNet>0).length,
         absorbedAt:(()=>{const a=rows.find(r=>!r.open&&(r.grade||r.beamNet<=0));return a?a.level:null})()};
}

// ════════════════════════════════════════════════════════════
//  EXACT REGIONS
//
//  Regions used to be found by sampling the floor on a grid, so their
//  boundaries were the sample lattice rather than the drawn lines — and
//  refining the grid produced MORE spurious regions, not fewer, because
//  ever-thinner slivers at a boundary resolved into conditions of their own.
//  A boundary sliver can never be merged away either: it sits between two
//  conditions, so its load path differs from both neighbors.
//
//  Now every floor's drawn areas are cut against each other with real
//  polygon booleans, so a region IS the shape you drew. The physics is
//  untouched: each piece is evaluated at an interior point by exactly the
//  same per-point code the sampler used, so a piece only has to be
//  homogeneous, not meaningful — pieces that evaluate the same are merged.
// ════════════════════════════════════════════════════════════
const PC=()=>(typeof polygonClipping!=='undefined'?polygonClipping:null);
function mpOf(poly){
  if(!poly||poly.length<3)return null;
  const r=poly.map(p=>[p.x,p.y]);
  const a=r[0],b=r[r.length-1];
  if(a[0]!==b[0]||a[1]!==b[1])r.push([a[0],a[1]]);
  return [[r]];
}
// THE UNION MUST NOT LOSE A FLOOR. The clipper's all-at-once union can trip
// on a near-coincident vertex ("Unable to complete output ring") and the old
// fallback handed back the FIRST shape alone — on Kinect Level 3 that was the
// South floor edge, and the whole North half of the pour silently vanished
// from Results (found Sep 17 2026 while splitting Results by zone). So on
// failure the shapes are folded in one at a time, each step retried on
// coordinates rounded to a thousandth of a foot, and a shape that still
// cannot be joined is reported rather than the rest being thrown away.
function mpRound(mp){return mp.map(poly=>poly.map(ring=>ring.map(p=>[Math.round(p[0]*1000)/1000,Math.round(p[1]*1000)/1000])))}
function pcTry(op,a,b){
  try{const r=PC()[op](a,b);if(r&&r.length)return r}catch(e){}
  try{const r=PC()[op](mpRound(a),mpRound(b));if(r&&r.length)return r}catch(e){}
  return null;
}
function mpUnion(...xs){
  const v=xs.filter(x=>x&&x.length);
  if(v.length<2)return v[0]||null;
  try{const r=PC().union(...v);if(r&&r.length)return r}catch(e){}
  let acc=v[0],lost=0;
  for(let i=1;i<v.length;i++){
    const r=pcTry('union',acc,v[i]);
    if(r)acc=r;else lost++;
  }
  if(lost)console.warn(`mpUnion: ${lost} shape${lost>1?'s':''} could not be joined and ${lost>1?'were':'was'} left out`);
  return acc;
}
function mpInter(a,b){
  if(!a||!b||!a.length||!b.length)return null;
  try{const r=PC().intersection(a,b);return r&&r.length?r:null}catch(e){}
  return pcTry('intersection',a,b);
}
function mpDiff(a,b){
  if(!a||!a.length)return null;
  if(!b||!b.length)return a;
  try{const r=PC().difference(a,b);return r&&r.length?r:null}catch(e){}
  return pcTry('difference',a,b)||a;
}
function ringArea(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]+r[i][0])*(r[j][1]-r[i][1]);return a/2}
function mpArea(mp){
  if(!mp)return 0;
  let a=0;
  for(const poly of mp)poly.forEach((r,i)=>{a+=i===0?Math.abs(ringArea(r)):-Math.abs(ringArea(r))});
  return a;
}
function mpBBox(mp){
  const bb={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  if(!mp)return bb;
  for(const poly of mp)for(const p of poly[0]){
    if(p[0]<bb.minX)bb.minX=p[0];if(p[0]>bb.maxX)bb.maxX=p[0];
    if(p[1]<bb.minY)bb.minY=p[1];if(p[1]>bb.maxY)bb.maxY=p[1];
  }
  return bb;
}
function mpHas(mp,x,y){
  if(!mp)return false;
  for(const poly of mp){
    if(!pointInPoly({x,y},poly[0].map(p=>({x:p[0],y:p[1]}))))continue;
    let hole=false;
    for(let i=1;i<poly.length;i++)
      if(pointInPoly({x,y},poly[i].map(p=>({x:p[0],y:p[1]})))){hole=true;break}
    if(!hole)return true;
  }
  return false;
}
// A point comfortably inside the piece, for evaluating its conditions.
function mpInnerPoint(mp){
  if(!mp||!mp.length)return null;
  let best=null,bestA=-1;
  for(const poly of mp){const a=Math.abs(ringArea(poly[0]));if(a>bestA){bestA=a;best=poly}}
  if(!best)return null;
  const ring=best[0].map(p=>({x:p[0],y:p[1]}));
  let cx=0,cy=0;for(const p of ring){cx+=p.x;cy+=p.y}
  cx/=ring.length;cy/=ring.length;
  if(mpHas(mp,cx,cy))return{x:cx,y:cy};
  const bb=mpBBox(mp);
  const w=bb.maxX-bb.minX,hh=bb.maxY-bb.minY;
  for(let d=3;d<=17;d+=2)for(let i=1;i<d;i++)for(let j=1;j<d;j++){
    const x=bb.minX+w*i/d,y=bb.minY+hh*j/d;
    if(mpHas(mp,x,y))return{x,y};
  }
  return null;
}
// Everything on one floor that can change the answer, as a set of
// mutually exclusive shapes covering `within`.
// THE EDGE TOLERANCE IS A BOUNDARY TOO.
// A slab that overhangs the floor below by more than the tolerance is partly
// bearing and partly hanging over nothing, and the exact partition has to cut
// along that line or one reading point decides for both halves — which read
// the whole of a 2 ft overhang as bearing at a 1 ft tolerance, the
// unconservative way round. The band is the edge grown by the tolerance,
// minus the edge itself: each edge segment extruded to both sides and a
// square at each corner, which never under-covers (a square kernel rather
// than a round one, on a slop allowance). Built once per solve, cached on the
// list the solve is already carrying.
function edgeToleranceBand(edges,tol){
  if(!edges||!edges.length||!(tol>0))return null;
  const host=edges[0];
  if(host._bandTol===tol)return host._band;
  const parts=[];
  for(const e of edges){
    parts.push(mpOf(e.bPoly));
    const P=e.bPoly;
    for(let i=0,j=P.length-1;i<P.length;j=i++){
      const a=P[j],b=P[i];
      const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);
      if(L>1e-9){
        const nx=dy/L*tol,ny=-dx/L*tol;
        parts.push(mpOf([{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}]));
      }
      parts.push(mpOf([{x:a.x-tol,y:a.y-tol},{x:a.x+tol,y:a.y-tol},{x:a.x+tol,y:a.y+tol},{x:a.x-tol,y:a.y+tol}]));
    }
  }
  const band=mpUnion(...parts.filter(Boolean));
  host._bandTol=tol;host._band=band;
  return band;
}
function floorCuts(lv,within,listsSlab,listsLoad){
  // THE TWO LAYERS CUT INDEPENDENTLY (Adolfo, Sep 15 2026: "do not merge
  // loading conditions"). They used to be one sequential pass: each shape
  // took its space out of a single `rest`, so a floor whose SLAB shape
  // covered the plan — which is every floor drawn slab-first — emptied
  // `rest` before the loading areas were reached, and none of their
  // boundaries were ever cut. On the Kalae job that silently lost the whole
  // 615 SF E2 strip on Level 3: the piece it fell in was read at a point
  // 30 ft away and the strip came back as B2, 138 PSF where the slab holds
  // 125. Wrong on the safe side is still wrong, and there was nothing on
  // screen to say so.
  // So: the slab layer partitions the floor, and then the loading areas
  // partition each of ITS pieces.
  const mpFor=e=>(e._mpCache||(e._mpCache=mpOf(e.bPoly)));
  const out=[];
  let rest=within;
  const edges=(listsSlab||[]).filter(e=>isEdgeZone(e.zone));
  if(edges.length){
    const inside=mpUnion(...edges.map(e=>mpFor(e)));
    const outside=mpDiff(rest,inside);
    if(outside){
      const tol=(typeof edgeToleranceFt==='function')?edgeToleranceFt():0;
      const grown=edgeToleranceBand(edges,tol);
      const band=grown?mpDiff(grown,inside):null;
      const near=band?mpInter(outside,band):null;
      const far=near?mpDiff(outside,band):outside;
      if(near)out.push({mp:near,tag:'edge-tol'});
      if(far)out.push({mp:far,tag:'outside-edge'});
    }
    rest=mpInter(rest,inside);
  }
  // PASS 1 — slab-layer conditions, smallest first so the smaller shape wins
  // its space (an opening drawn inside a slab area is an exception to it)
  // A BEAM IS AN OVERLAY, NOT A PIECE OF THE SLAB (Adolfo, Sep 18 2026: "if
  // I have a beam that is the same depth as an adjacent slab for a portion of
  // it, the calculator will assume no extra stem load for the entire beam").
  // Beams used to be cut with the slab shapes, smallest first, so a beam
  // footprint was taken out whole and read at one point — one slab thickness
  // for its whole run, one stem. The slab areas, openings and on-grade
  // patches partition the floor first; then each beam is cut along those
  // pieces, so a beam over a 9" slab and a 20" slab is two pieces with two
  // stems.
  const slabPieces=[];
  const nonBeam=(listsSlab||[]).filter(e=>!isEdgeZone(e.zone)&&!isBeam(e.zone))
    .slice().sort((a,b)=>a.areaFt-b.areaFt);
  const beamsHere=(listsSlab||[]).filter(e=>isBeam(e.zone));
  const base=[];
  for(const e of nonBeam){
    if(!rest)break;
    const mp=mpFor(e);
    if(!mp)continue;
    const got=mpInter(rest,mp);
    if(got){base.push({mp:got,tag:'slab:'+e.zone.id});rest=mpDiff(rest,mp)}
  }
  if(rest)base.push({mp:rest,tag:'slab:none'});
  for(const bp of base){
    let left=bp.mp;
    for(const e of beamsHere){
      if(!left)break;
      const mp=mpFor(e);if(!mp)continue;
      const got=mpInter(left,mp);
      if(got){slabPieces.push({mp:got,tag:bp.tag+'+beam:'+e.zone.id});left=mpDiff(left,mp)}
    }
    if(left)slabPieces.push({mp:left,tag:bp.tag});
  }
  // PASS 2 — loading areas, over each slab piece: same rule, smallest wins
  const loads=(listsLoad||[]).slice().sort((a,b)=>a.areaFt-b.areaFt);
  if(!loads.length)return out.concat(slabPieces);
  for(const sp of slabPieces){
    let r=sp.mp;
    for(const e of loads){
      if(!r)break;
      const mp=mpFor(e);
      if(!mp)continue;
      const got=mpInter(r,mp);
      if(got){out.push({mp:got,tag:sp.tag+'|load:'+e.zone.id});r=mpDiff(r,mp)}
    }
    if(r)out.push({mp:r,tag:sp.tag+'|typical'});
  }
  return out;
}
const EXACT_MAX_PIECES=4000;
// Split `extent` along every boundary that matters, from the pour down.
// CUT ONLY AS DEEP AS THE LOAD GOES. Every floor from the pour to the ground
// used to cut every piece, so on a 42-level model a tower pour was split by
// the openings and beams of twenty floors its load never reaches: 4 s per
// pour and eleven regions with one answer between them (Kalae, Sep 18 2026).
// `settled(mp,k)` says whether a piece's cascade is fully decided by floors
// 0..k — absorbed, on grade, or at the bottom — and a settled piece passes
// the floors below untouched. Deeper cuts could not change its answer.
function exactPartition(extent,belowLevels,slabLists,capLists,settled){
  let pieces=[{mp:extent}];
  for(let k=0;k<belowLevels.length;k++){
    const next=[];
    for(const piece of pieces){
      if(piece.done){next.push(piece);continue}
      // A BEAM IS READ ALONG ITS CENTERLINE (Adolfo, Sep 18 2026): "if a
      // beam above is slightly wider than a beam below, it will take the
      // shore height of the slab outside of the narrower beam below. usually
      // we'll try to install reshore at the center of the beam." So a piece
      // of the pour's beam is not cut by the floors below — the strips a
      // narrower beam beneath would leave along its sides are not where the
      // shores go. What is under the beam is read along its centerline
      // instead (`beamCenterlinePieces`), and changes along that line are
      // where the beam is split.
      if(k>0&&piece.beam){next.push(piece);continue}
      // The POUR's loading areas are cut too, even though the pour does not
      // use their capacity. The piece has to be uniform in whether a loading
      // area covers it: that is what says the concrete is there because an
      // area was drawn, rather than because a slab shape laps past it
      // (`viaSlab` / `fromSlabsSF`), and which mark the region head shows.
      // Reading one point for a piece that straddles the boundary reported a
      // 40x100 slab step as adding its whole 4,000 SF when only the 3,000
      // outside the loading area was new.
      const cuts=floorCuts(belowLevels[k],piece.mp,slabLists[k],capLists[k]);
      if(!cuts.length){next.push(piece);continue}
      for(const c of cuts){
        const m=k===0?/\+beam:([^|]+)/.exec(c.tag||''):null;
        next.push({mp:c.mp,beam:m?m[1]:(piece.beam||null)});
      }
    }
    if(settled&&k>=1)for(const piece of next){if(!piece.done&&!piece.beam&&settled(piece.mp,k))piece.done=true}
    pieces=next;
    if(pieces.length>EXACT_MAX_PIECES)break;
  }
  return pieces;
}
// ── WHAT IS UNDER A BEAM, ALONG ITS CENTERLINE ──
// The beam's long axis is the side of its minimum-area bounding rectangle;
// the centerline runs through that rectangle's middle. It is sampled every
// foot inside the piece, each sample keyed by what the floors below say
// there (`lowerSig`), and consecutive samples that agree become one
// sub-piece: the piece clipped to that run along the axis, read at the run's
// middle. A beam over a 24" beam below for 40 ft and over slab for the last
// 10 ft is two items; the 3" strips beside the narrower beam are gone.
function beamAxis(mp){
  const ring=(mp&&mp[0]&&mp[0][0])||[];
  if(ring.length<3)return null;
  let best=null;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    const ang=Math.atan2(b[1]-a[1],b[0]-a[0]);
    const c=Math.cos(ang),sn=Math.sin(ang);
    let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
    for(const p of ring){const u=p[0]*c+p[1]*sn,v=-p[0]*sn+p[1]*c;if(u<u0)u0=u;if(u>u1)u1=u;if(v<v0)v0=v;if(v>v1)v1=v}
    const area=(u1-u0)*(v1-v0);
    if(!best||area<best.area-1e-9)best={area,ang,u0,u1,v0,v1};
  }
  if(!best)return null;
  // the long side is the axis
  if(best.u1-best.u0<best.v1-best.v0){
    const ang=best.ang+Math.PI/2,c=Math.cos(ang),sn=Math.sin(ang);
    let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
    for(const p of ring){const u=p[0]*c+p[1]*sn,v=-p[0]*sn+p[1]*c;if(u<u0)u0=u;if(u>u1)u1=u;if(v<v0)v0=v;if(v>v1)v1=v}
    best={area:best.area,ang,u0,u1,v0,v1};
  }
  return best;
}
function beamCenterlinePieces(piece,lowerSig){
  const ax=beamAxis(piece.mp);
  if(!ax)return null;
  const c=Math.cos(ax.ang),sn=Math.sin(ax.ang),vm=(ax.v0+ax.v1)/2;
  const toXY=(u,v)=>({x:u*c-v*sn,y:u*sn+v*c});
  const len=ax.u1-ax.u0;
  const n=Math.max(2,Math.ceil(len));
  const samples=[];
  for(let i=0;i<=n;i++){
    const u=ax.u0+len*(i/n);
    const p=toXY(u,vm);
    if(!mpHas(piece.mp,p.x,p.y))continue;
    samples.push({u,x:p.x,y:p.y,sig:lowerSig(p.x,p.y)});
  }
  if(!samples.length)return null;
  const runs=[];
  for(const sm of samples){
    const last=runs[runs.length-1];
    if(last&&last.sig===sm.sig){last.to=sm.u;last.pts.push(sm)}
    else runs.push({sig:sm.sig,from:sm.u,to:sm.u,pts:[sm]});
  }
  if(runs.length===1)return [{mp:piece.mp,pt:samples[Math.floor(samples.length/2)]}];
  const out=[];
  const pad=1,V0=ax.v0-pad,V1=ax.v1+pad;
  for(let i=0;i<runs.length;i++){
    const r=runs[i];
    // the run's along-axis span, halfway to its neighbors
    const a=i===0?ax.u0-pad:(runs[i-1].to+r.from)/2;
    const b=i===runs.length-1?ax.u1+pad:(r.to+runs[i+1].from)/2;
    const box=[toXY(a,V0),toXY(b,V0),toXY(b,V1),toXY(a,V1)];
    const cut=mpInter(piece.mp,mpOf(box));
    if(!cut)continue;
    out.push({mp:cut,pt:r.pts[Math.floor(r.pts.length/2)]});
  }
  return out.length?out:null;
}
// A CELL THAT NOBODY CLAIMED.
// Cells are center-sampled from each region's polygon, so a cell whose center
// falls just outside every region — the band along each boundary, up to half a
// cell wide — belongs to no one. The region map paints cells, and
// click-to-region reads them, so that band was painted short and missed on a
// click: 1.8% of the drawn area at a 5 ft pitch, where the old cell-based
// solver covered it. Each unclaimed cell goes to the region holding most of
// it, decided on its corners and center, so the cells stay a partition —
// nothing is painted twice.
function claimBoundaryCells(regions,step){
  const list=[...regions.values()];
  if(!list.length)return;
  const q=v=>Math.round(v/step+1e-6);
  const claimed=new Set();
  for(const r of list)for(let i=0;i<r.cells.length;i+=2)claimed.add(q(r.cells[i])+','+q(r.cells[i+1]));
  const want=new Map();          // cell key -> {r,score,x,y}
  const h=step/2;
  for(const r of list){
    if(!r.mp)continue;
    const bb=mpBBox(r.mp);
    if(!isFinite(bb.minX))continue;
    const x0=Math.floor(bb.minX/step)*step+h, y0=Math.floor(bb.minY/step)*step+h;
    const nx=Math.floor((bb.maxX-bb.minX)/step)+3, ny=Math.floor((bb.maxY-bb.minY)/step)+3;
    if(nx*ny>CELLS_MAX)continue;
    for(let i=-1;i<nx;i++)for(let j=-1;j<ny;j++){
      const x=x0+i*step,y=y0+j*step;
      const key=q(x)+','+q(y);
      if(claimed.has(key))continue;
      let score=0;
      if(mpHas(r.mp,x,y))score+=2;                       // its center counts double
      for(const [dx,dy] of [[-h,-h],[h,-h],[h,h],[-h,h]])if(mpHas(r.mp,x+dx*0.98,y+dy*0.98))score++;
      if(!score)continue;
      const prev=want.get(key);
      if(!prev||score>prev.score||(score===prev.score&&r.areaSF>prev.r.areaSF))want.set(key,{r,score,x,y});
    }
  }
  for(const {r,x,y} of want.values()){r.cells.push(x,y)}
}
// Cells derived FROM a region's shape. They are no longer what a region is —
// the install plan, the sequence maths and click-to-region still speak cells,
// so the shape is rasterized for them while area comes from the polygon.
const CELLS_MAX=40000;
function mpCells(mp,step){
  const out=[];
  if(!mp)return out;
  const bb=mpBBox(mp);
  if(!isFinite(bb.minX))return out;
  const nx=Math.floor((bb.maxX-bb.minX)/step)+2, ny=Math.floor((bb.maxY-bb.minY)/step)+2;
  if(nx*ny>CELLS_MAX){
    // absurdly large: fall back to the bounding center so nothing downstream
    // is handed an empty set
    out.push((bb.minX+bb.maxX)/2,(bb.minY+bb.maxY)/2);return out;
  }
  const x0=Math.floor(bb.minX/step)*step+step/2, y0=Math.floor(bb.minY/step)*step+step/2;
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){
    const x=x0+i*step,y=y0+j*step;
    if(mpHas(mp,x,y))out.push(x,y);
  }
  if(!out.length){
    // thinner than the cell pitch: keep one point inside so it can still be
    // clicked, highlighted and counted
    const p=mpInnerPoint(mp);
    if(p)out.push(p.x,p.y);
  }
  return out;
}
// Hairlines left by the overlay where two floors' outlines nearly coincide.
// They are drafting noise, not conditions: absorbed on geometry, into the
// biggest region they touch, before anything reads the region list.
// Two sample cells' worth. The exact partition leaves wedges where two
// floors' outlines nearly coincide, and at this size a wedge cannot be a
// loading condition — a condition that small is not resolvable by the solve
// step, and its marks are whatever the overlay happened to clip. Anything
// LARGER is a condition and is never merged into another (see mergeShape).
const HAIRLINE_SF=4;
function hairlineSFFor(step){return Math.max(HAIRLINE_SF,2*step*step)}
function absorbHairlines(regions,step){
  const HL=hairlineSFFor(step||0);
  const list=[...regions.values()];
  if(list.length<2)return 0;
  const big=list.filter(r=>r.areaSF>=HL).sort((a,b)=>b.areaSF-a.areaSF);
  if(!big.length)return 0;
  let gone=0;
  for(const r of list){
    if(r.areaSF>=HL)continue;
    const near=(a,b)=>!(a.maxX+1<b.minX||b.maxX+1<a.minX||a.maxY+1<b.minY||b.maxY+1<a.minY);
    // A hairline is absorbed into a region it actually TOUCHES — a crumb of a
    // few square feet is overlay noise wherever its marks happen to read, but
    // it is not evidence about a region on the other side of the floor, and
    // the largest region is not a dumping ground. With nothing adjacent it
    // stays a region of its own, where it can be seen.
    const host=big.find(o=>o!==r&&near(o.bb,r.bb));
    if(!host||host===r)continue;
    host.mp=mpUnion(host.mp,r.mp);
    host.areaSF+=r.areaSF;
    host.hairlineSF=(host.hairlineSF||0)+r.areaSF;
    host.bb.minX=Math.min(host.bb.minX,r.bb.minX);host.bb.maxX=Math.max(host.bb.maxX,r.bb.maxX);
    host.bb.minY=Math.min(host.bb.minY,r.bb.minY);host.bb.maxY=Math.max(host.bb.maxY,r.bb.maxY);
    // its marks do NOT travel: a few square feet of overlay noise must never
    // put a second loading mark on the row it was absorbed into
    r.mergedInto=host;
    regions.delete(r.key);
    gone++;
  }
  return gone;
}
// An assumption now covers an area rather than a scatter of sample points.
function addAssumptionArea(store,floor,type,piece){
  const key=floor+'|'+type;
  const a=store.get(key)||{floor,type,cells:[],areaSF:0,mp:null};
  a.areaSF+=piece.area;
  a.mp=mpUnion(a.mp,piece.mp);
  store.set(key,a);
}
function solvePourLevel(stack,pourIdx,opts){
  const shores=state.shores;
  const pour=stack[pourIdx];
  const dl=projectDL();
  const step=(opts&&opts.step)||SOLVE_STEP_FT;

  // every level from the pour down needs an alignment to be stacked
  const belowLevels=stack.slice(pourIdx);
  const unaligned=belowLevels.filter(l=>levelNeedsAlignment(l)&&!levelFullyMatched(l));
  const pourLoading=levelZonesInBuilding(pour,'loading');
  const pourSlabs=levelZonesInBuilding(pour,'slab');
  // MDL-20: an area omitted from Results reads as the floor's typical
  // capacity; capAll keeps every area for the include/omit comparison
  const capAll=belowLevels.map(l=>levelZonesInBuilding(l,'loading'));
  const capLists=capAll.map((list,k)=>list&&k>0?list.filter(e=>!e.zone.omit):list);
  const slabLists=belowLevels.map(l=>levelZonesInBuilding(l,'slab'));
  // FLOOR EDGES: a floor with edge shapes exists only inside them; one
  // without exists everywhere. (Loading areas are about capacity only.)
  const edgeLists=slabLists.map(l=>l?l.filter(e=>isEdgeZone(e.zone)):null);
  const insideAny=(list,x,y)=>{for(const e of list){if(bboxHit(e.bb,x,y)&&pointInPoly({x,y},e.bPoly))return true}return false};

  // WHERE THE CONCRETE GOES. The pour's loading areas have always doubled as
  // its extent, which means drawing the slab's outline twice on the floor
  // being placed: once as the floor edge, once as a loading area that is very
  // nearly the same polygon — and that area's MARK does nothing, because the
  // pour applies the load rather than carrying it. So when a pour has no
  // loading areas, its floor edge is the extent. Detect floor edge is then
  // enough to solve a floor. Where loading areas ARE drawn they still decide,
  // so no existing job changes.
  const pourEdges=edgeLists[0]||[];
  const pourFromEdge=pourEdges.length>0;
  // A DRAWN SLAB IS SLAB (Adolfo, Sep 10, 2026). Without a floor edge the
  // pour's loading areas used to be the only thing that said where the
  // concrete goes, so a floor drawn on the slab layer — a 9" deck, a podium
  // on grade — read as "nothing drawn on the pour level" and the step stayed
  // locked. His point: "if a slab area is drawn then that should be taken
  // into account in the absence of a floor edge." So the extent is now the
  // loading areas AND the slab areas together. Openings still punch out
  // (they are handled per sample below) and a beam footprint adds nothing on
  // its own: a beam sits under a slab, so the slab around it is the extent.
  const pourExtentSlabs=(pourSlabs||[]).filter(e=>isSlabExtentZone(e.zone));
  const pourFromSlabs=!pourFromEdge&&pourExtentSlabs.length>0;
  const extent=pourFromEdge?pourEdges:(pourLoading||[]).concat(pourExtentSlabs);
  // the sampled box has to cover both: a loading area drawn past the edge is
  // still reported, it just is not poured
  const bbList=pourFromEdge&&pourLoading&&pourLoading.length?pourEdges.concat(pourLoading):extent;
  const spatial=unaligned.length===0&&extent&&extent.length>0;
  if(!spatial){
    return{spatial:false,unaligned:unaligned.map(l=>l.name),
           reason:unaligned.length?'levels not aligned'
                 :'nothing drawn on the pour level — draw its loading areas, its slab, or its floor edge'};
  }

  // sample over whichever of the two says where the slab is
  const bb=bbList.reduce((acc,e)=>({
    minX:Math.min(acc.minX,e.bb.minX),minY:Math.min(acc.minY,e.bb.minY),
    maxX:Math.max(acc.maxX,e.bb.maxX),maxY:Math.max(acc.maxY,e.bb.maxY)
  }),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});

  // WHERE THE CONCRETE GOES, as one exact shape.
  const extentMP=mpUnion(...extent.map(e=>mpOf(e.bPoly)));
  if(!extentMP)return{spatial:false,reason:'nothing drawn on the pour level'};
  // WHAT IS READ is a little wider than what is poured: a loading area drawn
  // past the floor edge has to be looked at to be reported as an overhang
  // (`outsideSF`) or accepted within the edge tolerance. Partitioning only
  // the edge left nothing outside it to read, so an overhang came back as
  // 0 SF and the header said nothing. Pieces outside the edge are still not
  // poured — the branch below decides that per piece.
  const readMP=(bbList===extent)?extentMP
    :(mpUnion(...bbList.map(e=>mpOf(e.bPoly)))||extentMP);

  const regions=new Map();
  const beamItems=new Map();
  let sampled=0,sampledSF=0,openSF=0,gradeSF=0,outsideSF=0,fromSlabsSF=0;
  const edgeTol=edgeToleranceFt();
  const assumptionSamples=new Map();

  // Cut the extent along every drawn boundary from the pour down, then read
  // each piece once at a point inside it. A piece only has to be uniform;
  // pieces that read the same are merged below, so the number of cuts never
  // shows up in the answer.
  // What the floors 1..kmax say at (x,y): fills belowLevels[k]._slabAt/_capAt/
  // _codeAt for the cascade and returns the region signature so far.
  const readColumn=(x,y,thick,kmax)=>{
    const sig=[thick];
    let edgeHits=0;
    const pointAssumptions=[];
    for(let k=1;k<=kmax;k++){
      let sl=slabStateAt(belowLevels[k],slabLists[k],x,y);
      let hit=capZoneAt(capLists[k],x,y);
      // SLAB EXTENT: where the floor has edge shapes it exists only inside
      // them — or within the edge tolerance of one (small overhangs,
      // drafting slop). Outside, there is no slab and the shore above spans
      // past it. A floor with no edge shapes exists everywhere.
      let atEdge=false;
      const edges=edgeLists[k];
      if(edges&&edges.length&&!sl.open&&!insideAny(edges,x,y)){
        if(capZoneNear(edges,x,y,edgeTol))atEdge=true;
        else sl={open:true,noSlab:true,thick:0,off:0,soffitIn:0,beam:null,zone:null};
      }
      if(atEdge){edgeHits++;if(!hit)hit=capZoneNear(capLists[k],x,y,edgeTol)}
      belowLevels[k]._slabAt=sl;
      if(sl.open){belowLevels[k]._capAt=0;sig.push(sl.noSlab?'none':'open');continue}
      // on grade: the cascade ends here, so floors further down (if any —
      // the stack warnings flag them) play no part in this point's signature
      if(sl.grade){belowLevels[k]._capAt=Infinity;sig.push('grade');break}
      if(!edges||!edges.length)pointAssumptions.push({k,type:'extent'});
      if(atEdge)pointAssumptions.push({k,type:'edge'});
      if(!hit)pointAssumptions.push({k,type:'capacity'});
      const cap=hit?hit.zone.capacityPSF:levelDefaultCapacity(belowLevels[k]);
      belowLevels[k]._capAt=cap;
      const code=hit?zoneCode(hit.zone):levelDefaultCode(belowLevels[k]);
      belowLevels[k]._codeAt=code;
      // The MARK belongs in the signature, not just the capacity: 9" slab
      // over B2 and 9" slab over C2 are two conditions on the plan even at
      // the same PSF, so each gets its own region, row and pattern.
      const tag=`${cap}${code?'/'+code:''}`;
      const odd=sl.thick!==belowLevels[k].slabThickness||sl.off||sl.beam;
      sig.push(odd?`${tag}@${sl.thick}/${sl.off}${sl.beam?'B'+sl.soffitIn:''}`:tag);
    }
    return{sig,edgeHits,pointAssumptions};
  };
  // Is a piece's answer decided by floors 0..k alone? Read its inside point
  // down to floor k and cascade over just those floors: decided when the load
  // is absorbed (or on grade) AND the floor the last shore stands on is known,
  // or when floor k is the bottom of the stack.
  const settledBy=(mp,k)=>{
    const pt=mpInnerPoint(mp);if(!pt)return true;
    const ps=slabStateAt(pour,pourSlabs,pt.x,pt.y);
    if(ps.open||ps.grade)return true;
    readColumn(pt.x,pt.y,ps.thick,k);
    if(k>=belowLevels.length-1)return true;
    const res=cascadeAtPoint(belowLevels.slice(0,k+1),0,ps.thick,dl,shores);
    if(res.unresolved)return false;
    const last=res.steps[res.steps.length-1];
    if(!last)return true;
    if(last.grade)return true;
    // absorbed, and nothing stands under it — unless MDL-19 will put a second
    // level there, which needs the floor it stands on read as well
    const wantsMin=!last.open&&!(last.resultant>0)&&res.steps.filter(x=>!x.open&&x.resultant>0).length===1;
    if(!stNeeds(last)&&!wantsMin)return true;
    return last.supportIdx!=null&&last.supportIdx>=0&&last.supportIdx<=k;
  };
  const rawPieces=exactPartition(readMP,belowLevels,slabLists,capLists,settledBy);
  // what the floors below say at a point, as a key — the beam centerline is
  // split where this changes (the same reading the main loop makes)
  const lowerSig=(x,y)=>{
    const parts=[];
    for(let k=1;k<belowLevels.length;k++){
      let sl=slabStateAt(belowLevels[k],slabLists[k],x,y);
      const edges=edgeLists[k];
      if(edges&&edges.length&&!sl.open&&!insideAny(edges,x,y)&&!capZoneNear(edges,x,y,edgeTol))sl={open:true,noSlab:true};
      if(sl.open){parts.push(sl.noSlab?'none':'open');continue}
      if(sl.grade){parts.push('grade');break}
      const hit=capZoneAt(capLists[k],x,y);
      parts.push(`${hit?hit.zone.capacityPSF+'/'+zoneCode(hit.zone):'d'}@${sl.thick}/${sl.off}${sl.beam?'B'+sl.soffitIn+'w'+(sl.beam.widthIn||0):''}`);
    }
    return parts.join('|');
  };
  const pieces=[];
  for(const p of rawPieces){
    const a=mpArea(p.mp);
    if(!(a>0))continue;
    if(p.beam){
      const subs=beamCenterlinePieces(p,lowerSig);
      if(subs){
        for(const sp of subs){const sa=mpArea(sp.mp);if(sa>0)pieces.push({mp:sp.mp,area:sa,pt:sp.pt,bb:mpBBox(sp.mp),beam:true})}
        continue;
      }
    }
    const pt=mpInnerPoint(p.mp);
    if(!pt)continue;                  // degenerate hairline, no inside to read
    pieces.push({mp:p.mp,area:a,pt,bb:mpBBox(p.mp)});
  }
  if(!pieces.length)return{spatial:false,reason:'the drawn areas do not enclose any floor'};

  for(const piece of pieces){
    const x=piece.pt.x, y=piece.pt.y, pcArea=piece.area;
    let pourZ=null,viaSlab=false;
    if(pourFromEdge){
      // the floor edge says where the concrete goes; a loading area on the
      // pour is capacity, which the pour does not use — it only ever says
      // which mark to show in the region head
      if(!insideAny(pourEdges,x,y)){
        // a loading area that laps just past the edge is drafting slop, not a
        // slab that stops there — the same tolerance the lower floors get.
        // Nothing is poured out here where no area was drawn at all.
        const lap=capZoneAt(pourLoading,x,y);
        if(!lap)continue;
        if(!capZoneNear(pourEdges,x,y,POUR_LAP_FT)){outsideSF+=pcArea;continue}
        pourZ=lap;
      }else{
        pourZ=capZoneAt(pourLoading,x,y);
      }
    }else{
      pourZ=capZoneAt(pourLoading,x,y);
      // no loading area here, but a slab drawn on the slab layer says there
      // is slab: poured, at the level's own thickness and typical capacity
      if(!pourZ){
        if(!capZoneAt(pourExtentSlabs,x,y))continue;   // outside the poured area
        viaSlab=true;
      }
    }
    const pourSlab=slabStateAt(pour,pourSlabs,x,y);
    const slabZ=pourSlab.zone?{zone:pourSlab.zone}:null;
    if(pourSlab.open){openSF+=pcArea;continue}   // no concrete placed here
    if(pourSlab.grade){gradeSF+=pcArea;continue} // placed on grade — nothing to reshore
    sampled++;sampledSF+=pcArea;
    if(viaSlab)fromSlabsSF+=pcArea;             // poured because a slab was drawn there
    const thick=pourSlab.thick;
    const beam=pourSlab.beam;

    // resolve each floor's capacity and slab state at this point, then cascade.
    // The slab signature ignores a beam on the pour: the slab around a beam
    // is the same slab, and the beam gets its own block.
    const {sig,edgeHits,pointAssumptions}=readColumn(x,y,thick,belowLevels.length-1);
    // the key reaches as far down as the cascade does — the floor that
    // absorbs the load and the floor its last shore stands on — and no
    // further, so floors the load never reaches cannot split a region
    const res=cascadeAtPoint(belowLevels,0,thick,dl,shores);
    let depth=belowLevels.length-1;
    if(!res.unresolved&&res.steps.length){
      const last=res.steps[res.steps.length-1];
      // the floor the last shores stand on counts only where shores go in:
      // a floor that absorbs the load (and gets no MDL-19 row) stands on
      // nothing, so what is under it cannot split a region (Sep 25, Adolfo:
      // regions that match down to where the load is absorbed are one)
      const stands=stNeeds(last)&&last.supportIdx!=null&&last.supportIdx>=0;
      depth=Math.max(last.levelIdx,stands?last.supportIdx:last.levelIdx);
    }
    const key=sig.slice(0,depth+1).join('|');
    let reg=regions.get(key);
    if(!reg){
      reg={key,thicknessIn:thick,slabZone:slabZ&&slabZ.zone,
           openBelow:res.steps.some(s=>s.open),
           toGrade:res.steps.some(s=>s.grade&&s.remaining>0),
           loadingMarks:new Set(),caps:sig.slice(1,depth+1),levelNames:belowLevels.map(l=>l.name),stepCodes:{},edgeSamples:0,
           placementLoad:res.placementLoad,steps:res.steps,
           reshoreLevels:res.reshoreLevels,unresolved:res.unresolved,
           samples:0,cells:[],cellStep:step,mp:null,areaSF:0,edgeSF:0,
           bb:{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}};
      regions.set(key,reg);
    }
    for(const a of pointAssumptions){
      const last=reg.steps.length?reg.steps[reg.steps.length-1].levelIdx:0;
      const support=reg.steps.reduce((m,s)=>Math.max(m,s.supportIdx||0),last);
      if(a.k<=(a.type==='capacity'?last:support)){
        addAssumptionArea(assumptionSamples,belowLevels[a.k].name,a.type,piece);
        assumptionSamples.get(belowLevels[a.k].name+'|'+a.type).defId=belowLevels[a.k].defId||belowLevels[a.k].id;
      }
    }
    reg.samples++;
    reg.areaSF+=pcArea;
    reg.mp=mpUnion(reg.mp,piece.mp);
    if(edgeHits)reg.edgeSF+=pcArea;
    // which marks did the carrying floors have here (equal capacities can
    // come from different marks — list them all)
    for(const st of reg.steps){
      if(st.open||st.grade)continue;
      const c=belowLevels[st.levelIdx]._codeAt;
      if(c){(reg.stepCodes[st.levelIdx]||(reg.stepCodes[st.levelIdx]=new Set())).add(c)}
    }
    // the pour's own mark, for the region tooltip — there is none when the
    // extent came from the floor edge, and none is needed: nothing is on it
    const tag=!pourZ?null
              :(pourZ.zone.llMark!=null?pairCode(pourZ.zone.llMark,pourZ.zone.sdlMark)
              :(pourZ.zone.mark!=null?pourZ.zone.mark:null));
    if(tag!=null)reg.loadingMarks.add(tag);
    reg.bb.minX=Math.min(reg.bb.minX,piece.bb.minX);reg.bb.maxX=Math.max(reg.bb.maxX,piece.bb.maxX);
    reg.bb.minY=Math.min(reg.bb.minY,piece.bb.minY);reg.bb.maxY=Math.max(reg.bb.maxY,piece.bb.maxY);

    // a beam on the pour here: its own item, over this slab region
    if(beam){
      const stemHere=beamStemIn(beam.depthIn,thick,pourSlab.slabOff!=null?pourSlab.slabOff:pourSlab.off,pourSlab.off);
      const bkey=beam.id+'|'+key+'|'+stemHere;
      let item=beamItems.get(bkey);
      if(!item){
        item={beamId:beam.id,zone:beam,region:reg,regionKey:key,
              widthIn:+beam.widthIn||0,depthIn:+beam.depthIn||0,widthFt:(+beam.widthIn||12)/12,
              stemIn:stemHere,plf:Math.round((+beam.widthIn||0)/12*(stemHere/12)*150*10)/10,label:beam.label||'',
              thicknessIn:thick,profile:beamProfileAt(belowLevels,0,reg.steps,shores),
              samples:0,cells:[],cellStep:step,mp:null,areaSF:0,
              bb:{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}};
        beamItems.set(bkey,item);
      }
      if(!item.below){
        // what the shores under this beam actually meet on each floor below:
        // a beam (and how wide) or the slab — and, where it is a beam, the
        // taller height a shore set off its side would need to the slab
        item.below={};
        for(let k=1;k<belowLevels.length;k++){
          const sl=belowLevels[k]._slabAt;if(!sl||sl.open||sl.grade)continue;
          if(sl.beam){
            let sj=-1;for(let m=k+1;m<belowLevels.length;m++){const t=belowLevels[m]._slabAt;if(!t||!t.open){sj=m;break}}
            const sup=sj>=0?belowLevels[sj]:null;
            item.below[k]={widthIn:+sl.beam.widthIn||0,depthIn:+sl.beam.depthIn||0,
              slabHeightFt:sup?shoreHeightUnder(belowLevels[k],sup,sl.thick,sl.off,(sup._slabAt||{}).off||0):null};
          }
        }
      }
      item.samples++;item.areaSF+=pcArea;
      item.mp=mpUnion(item.mp,piece.mp);
      item.bb.minX=Math.min(item.bb.minX,piece.bb.minX);item.bb.maxX=Math.max(item.bb.maxX,piece.bb.maxX);
      item.bb.minY=Math.min(item.bb.minY,piece.bb.minY);item.bb.maxY=Math.max(item.bb.maxY,piece.bb.maxY);
    }
  }

  // Boolean overlay leaves hairlines where two floors' outlines nearly but
  // not exactly coincide — an edge traced separately per level, off by a
  // fraction of a foot. Those are drafting noise, not conditions, and they
  // are absorbed on geometry before anything else looks at the regions.
  absorbHairlines(regions,step);
  // Cells are no longer what a region IS — they are derived from its shape
  // for the install plan, the sequence maths and click-to-region. The sliver
  // pass needs them to find neighbors, so they are built first.
  for(const r of regions.values()){r.cells=mpCells(r.mp,step);r.cellStep=step}
  // Then the minimum-region rule, on the same load path as always.
  mergeSlivers(regions,step,minRegionSF());
  // whatever absorbed a sliver has a new shape
  for(const r of regions.values())if(r.sliverSF||r.artifactSF)r.cells=mpCells(r.mp,step);
  claimBoundaryCells(regions,step);

  const out=[...regions.values()].map(r=>({
    ...r,
    loadingMarks:[...r.loadingMarks].sort((a,b)=>markSort(a,b)),
    edgeSamples:r.edgeSF>0?Math.max(1,Math.round(r.edgeSF/Math.max(1,r.areaSF)*Math.max(1,r.cells.length/2))):0,
    steps:r.steps.map((s,si)=>{
      const key=choiceKey(pour.name,r.key,s.levelIdx);
      const chosen=chosenOption(s.options,key);
      const codes=r.stepCodes[s.levelIdx];
      return{...s,choiceKey:key,chosen,
             code:codes&&codes.size?[...codes].sort(markSort).join(' / '):null,
             noOptions:(s.resultant>0||s.minLevel)&&s.options.length===0};
    })
  })).sort((a,b)=>b.areaSF-a.areaSF);
  out.forEach((r,i)=>{r.index=i});

  // beam items: follow region merges, combine items of one beam that ended
  // up over the same region, then apply widths and picks
  // THE STEM IS PART OF WHAT A BEAM ITEM IS (Adolfo, Sep 18 2026): "if I have
  // a beam that is the same depth as an adjacent slab for a portion of it,
  // the calculator will assume no extra stem load for the entire beam even if
  // a portion of the beam is deeper than another adjacent slab." Two pieces
  // of one beam over slabs of different thickness have different stems; when
  // a sliver merge put them over one region they were folded into whichever
  // had more samples and the other's stem was thrown away. Items are now
  // combined only when their stem agrees, so a beam over a 15" and a 20" slab
  // is two items — one with a stem, one without — and a hairline never folds
  // into an item with a smaller stem than its own.
  // …and so is what the shores under it meet: two pieces of a beam over a
  // beam below and over slab have different heights (Sep 18 2026), and the
  // sliver rule that lets slab regions with height-only differences merge
  // must not fold those together either.
  const profSig=it=>(it.profile||[]).map(r=>r.open?'o':r.grade?'g':Math.round((r.shoreHeightFt||0)*100)).join(',');
  const combined=new Map();
  for(const it of beamItems.values()){
    const reg=resolveMerged(it.region);
    const k=it.beamId+'|'+reg.key+'|'+it.stemIn+'|'+profSig(it);
    const prev=combined.get(k);
    if(!prev){it.region=reg;it.regionKey=reg.key;combined.set(k,it);continue}
    if(it.samples>prev.samples){it.samples+=prev.samples;it.cells.push(...prev.cells);it.areaSF+=prev.areaSF;it.mp=mpUnion(it.mp,prev.mp);it.region=reg;it.regionKey=reg.key;combined.set(k,it)}
    else{prev.samples+=it.samples;prev.cells.push(...it.cells);prev.areaSF+=it.areaSF;prev.mp=mpUnion(prev.mp,it.mp)}
  }
  {
    const byBeam=new Map();
    for(const it of combined.values()){
      const l=byBeam.get(it.beamId)||[];l.push(it);byBeam.set(it.beamId,l);
    }
    for(const [,l] of byBeam){
      if(l.length<2)continue;
      const bySize=l.slice().sort((a,b)=>b.areaSF-a.areaSF);
      for(const it of l){
        if(it.areaSF>=HAIRLINE_SF)continue;
        // a hairline folds into the largest item of the same stem, else the
        // largest item whose stem is at least its own — never into a lighter one
        const main=bySize.find(m=>m!==it&&m.areaSF>=HAIRLINE_SF&&m.stemIn===it.stemIn&&profSig(m)===profSig(it))
                 ||bySize.find(m=>m!==it&&m.areaSF>=HAIRLINE_SF&&m.stemIn>=it.stemIn);
        if(!main)continue;
        main.areaSF+=it.areaSF;main.samples+=it.samples;
        main.mp=mpUnion(main.mp,it.mp);
        for(const [k,v] of combined)if(v===it)combined.delete(k);
      }
      // several items of one beam with different stems: say which is which
      const stems=new Set([...combined.values()].filter(x=>x.beamId===l[0].beamId).map(x=>x.stemIn));
      if(stems.size>1)for(const x of combined.values())if(x.beamId===l[0].beamId)x.stemSplit=true;
    }
  }
  const rawBeams=[...combined.values()].map(it=>{
    const regOut=out.find(r=>r.key===it.regionKey);
    const chain=beamChain(it,pour.name);
    it.cells=mpCells(it.mp,step);it.cellStep=step;
    return{...it,regionIndex:regOut?regOut.index:-1,
           lengthFt:it.widthFt>0?Math.round(it.areaSF/it.widthFt):null,
           rows:chain.rows,beamUnresolved:chain.unresolved,beamLevels:chain.levels,absorbedAt:chain.absorbedAt};
  }).sort((a,b)=>b.areaSF-a.areaSF);
  // identical beams share a row (Adolfo, Sep 18 2026) — see groupBeamItems
  const beams=groupBeamItems(rawBeams,pour.name,shores,step);

  const needChoice=out.reduce((n,r)=>n+r.steps.filter(s=>stNeeds(s)&&!s.chosen&&s.options.length).length,0)
                  +beams.reduce((n,b)=>n+b.rows.filter(r=>r.beamKey&&r.beamNet>0&&!r.beamChosen&&r.options.length).length,0);
  // MDL-20: what the floors below would say at one point with some loading
  // areas put back or left out — the include/omit comparison, read the same
  // way the solve reads, without solving the job again
  const whatIf=(x,y,thick,opt)=>{
    const omit=new Set((opt&&opt.omit)||[]),incl=new Set((opt&&opt.include)||[]);
    const saved=capLists.slice();
    for(let k=1;k<capAll.length;k++)if(capAll[k])capLists[k]=capAll[k].filter(e=>!omit.has(e.zone.id)&&(!e.zone.omit||incl.has(e.zone.id)));
    try{readColumn(x,y,thick,belowLevels.length-1);return cascadeAtPoint(belowLevels,0,thick,dl,shores)}
    finally{for(let k=0;k<saved.length;k++)capLists[k]=saved[k]}
  };
  return{spatial:true,step,exact:true,pieces:pieces.length,sampled,whatIf,
         // Legacy sample COUNTS. The exact model measures area, so these are
         // kept only for old callers and are always zero — read the *SF
         // fields instead. Four Results-header notices (openings, overhang
         // past the floor edge, on grade, slab-added area) tested these and
         // so never appeared on v12; they test the areas now.
         openSamples:0,gradeSamples:0,outsideEdge:0,fromSlabs:0,
         pourFromEdge,pourFromSlabs,hadLoading:!!(pourLoading&&pourLoading.length),
         areaSF:sampledSF,openAreaSF:openSF,gradeAreaSF:gradeSF,outsideEdgeSF:outsideSF,fromSlabsSF,
         hasGrade:belowLevels.slice(1).some(l=>levelOnGrade(l)||zonesOf(l,'slab').some(isGradeZone)),
         regions:out,beams,rawBeams,assumptions:[...assumptionSamples.values()],
         sliverSF:out.reduce((n,r)=>n+(r.sliverSF||0),0),
         maxReshoreLevels:out.reduce((m,r)=>Math.max(m,r.reshoreLevels),0),
         anyUnresolved:out.some(r=>r.unresolved)||beams.some(b=>b.beamUnresolved),
         pendingChoices:needChoice,
         noShoreRows:out.reduce((n,r)=>n+r.steps.filter(s=>s.noOptions).length,0)+beams.reduce((n,b)=>n+b.rows.filter(r=>r.noOptions).length,0)};
}

// ════════════════════════════════════════════════════════════
//  IDENTICAL BEAMS SHARE A ROW  (Adolfo, Sep 18 2026: "the beams could be
//  grouped if they're the same type of beam and fall under the same shore
//  height and load capacity conditions")
//
//  A row is a condition, not an object — the slab regions have always worked
//  that way, and a floor with 55 beams was asking the same question 55 times.
//  Beam items of one pour group when they are the same size, carry the same
//  stem load over the same slab condition (the region key carries the marks,
//  so "do not merge loading conditions" holds for beams too), and on every
//  carrying floor see the same capacity, the same slab load arriving and the
//  same support — with shore heights within an inch of the group's anchor,
//  the row showing the tallest (his Sep 10 call: inches of height do not
//  change the answer). Reinforcement marks (LB1 / LB3) are listed, not split
//  on. One shore pick, effective width and shores-per-cluster apply to every
//  member; a member can be broken out to get its own values and stays out
//  until it is regrouped. A pick every member already agreed on before this
//  existed is carried into the group so old jobs open as they were.
// ════════════════════════════════════════════════════════════
const BEAM_GROUP_TOL_FT=1/12;
function beamBreakouts(){const p=state.project;if(!p.beamBreakout)p.beamBreakout={};return p.beamBreakout}
function beamMemberId(pourName,it){return `${pourName}|${it.beamId}|${it.regionKey}`}
function beamCondSig(it){
  const rows=(it.profile||[]).map(r=>r.open?`o${r.noSlab?'n':''}:${r.level.name}`
    :r.grade?`g:${r.level.name}`
    :`${r.level.name}:${r.capacity}:${(+r.slabRemaining||0).toFixed(1)}:${r.supportLevel?r.supportLevel.name:'-'}:${r.spansOpen||0}`);
  return `${it.widthIn}x${it.depthIn}|${it.stemIn}|${it.plf}|${it.thicknessIn}|${it.regionKey}|`+rows.join('|');
}
function beamHeights(it){return (it.profile||[]).map(r=>(r.open||r.grade||r.shoreHeightFt==null)?-1:r.shoreHeightFt)}
function strHash(str){let h=5381;for(let i=0;i<str.length;i++)h=((h<<5)+h+str.charCodeAt(i))|0;return (h>>>0).toString(36)}
function groupBeamItems(items,pourName,shores,step){
  const bo=beamBreakouts();
  const buckets=new Map(),out=[];
  for(const it of items){
    const sig=beamCondSig(it);it.groupSig=sig;it.memberId=beamMemberId(pourName,it);
    if(bo[it.memberId]){it.brokenOut=true;out.push(it);continue}
    (buckets.get(sig)||buckets.set(sig,[]).get(sig)).push(it);
  }
  for(const [sig,list] of buckets){
    list.sort((a,b)=>b.areaSF-a.areaSF);           // the largest anchors its cluster
    const used=list.map(()=>false);
    for(let i=0;i<list.length;i++){
      if(used[i])continue;used[i]=true;
      const anchor=list[i],ha=beamHeights(anchor),members=[anchor];
      for(let j=i+1;j<list.length;j++){
        if(used[j])continue;
        const hj=beamHeights(list[j]);
        const close=hj.length===ha.length&&hj.every((h,q)=>(h<0&&ha[q]<0)||(h>=0&&ha[q]>=0&&Math.abs(h-ha[q])<=BEAM_GROUP_TOL_FT+1e-9));
        if(close){used[j]=true;members.push(list[j])}
      }
      // a lone item whose signature has broken-out siblings can be regrouped — say so
      if(members.length<2){anchor.canRegroup=items.some(x=>x!==anchor&&x.brokenOut&&x.groupSig===sig);out.push(anchor);continue}
      out.push(makeBeamGroup(members,sig,pourName,shores,step));
    }
  }
  for(const it of out)if(it.brokenOut)it.canRegroup=true;
  return out.sort((a,b)=>b.areaSF-a.areaSF);
}
function makeBeamGroup(members,sig,pourName,shores,step){
  const a=members[0];
  // the row shows the tallest height in the group, and the shores legal at it
  const heights=a.profile.map((r,q)=>Math.max(...members.map(m=>{const x=m.profile[q];return x&&!x.open&&!x.grade&&x.shoreHeightFt!=null?x.shoreHeightFt:-1})));
  const profile=a.profile.map((r,q)=>{
    if(r.open||r.grade)return{...r};
    const h=heights[q]>=0?heights[q]:null;
    return{...r,shoreHeightFt:h,options:h!=null?shoreOptionsFor(h,0,shores):[]};
  });
  const id='grp:'+strHash(sig+'|'+heights.map(h=>Math.round(h*48)).join(','));
  let mp=null,cells=[],areaSF=0,samples=0,lengthFt=0;
  const bb={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  const labels=new Set();
  for(const m of members){
    mp=mpUnion(mp,m.mp);cells.push(...m.cells);areaSF+=m.areaSF;samples+=m.samples||0;lengthFt+=m.lengthFt||0;
    bb.minX=Math.min(bb.minX,m.bb.minX);bb.maxX=Math.max(bb.maxX,m.bb.maxX);bb.minY=Math.min(bb.minY,m.bb.minY);bb.maxY=Math.max(bb.maxY,m.bb.maxY);
    if(m.label)labels.add(m.label);
  }
  const g={...a,beamId:id,group:true,members,count:members.length,groupSig:sig,memberId:null,brokenOut:false,canRegroup:false,
           label:[...labels].sort().join(', '),mp,cells,cellStep:step,areaSF,samples,bb,profile,lengthFt:lengthFt||null,
           stemSplit:members.some(m=>m.stemSplit),
           // the beam below is read off the anchor; members that meet something else keep their own note
           belowDiffers:members.some(m=>JSON.stringify(m.below||{})!==JSON.stringify(a.below||{}))};
  // adopt a unanimous member pick into the group's key, once
  const ch=shoreChoices();
  for(const r of profile){
    if(r.open||r.grade)continue;
    const gk=beamRowKey(pourName,g,r.levelIdx);
    for(const suf of ['','|W','N']){
      if(ch[gk+suf]!=null)continue;
      const vals=members.map(m=>ch[beamRowKey(pourName,m,r.levelIdx)+suf]);
      if(vals.every(v=>v!=null)&&vals.every(v=>String(v)===String(vals[0])))ch[gk+suf]=vals[0];
    }
  }
  const chain=beamChain(g,pourName);
  g.rows=chain.rows;g.beamUnresolved=chain.unresolved;g.beamLevels=chain.levels;g.absorbedAt=chain.absorbedAt;
  return g;
}
// Break a member out of its group (or put it back) without re-solving: the
// geometry has not changed, only how the beam items are gathered.
function regroupBeamsOf(L){
  if(!L||!L.solve||!L.solve.rawBeams)return;
  const s=L.solve;
  s.beams=groupBeamItems(s.rawBeams,L.pour.name,state.shores,s.step||SOLVE_STEP_FT);
  L._beamNames=null;
  s.pendingChoices=s.regions.reduce((n,r)=>n+r.steps.filter(x=>stNeeds(x)&&!x.chosen&&x.options.length).length,0)
                  +s.beams.reduce((n,b)=>n+b.rows.filter(r=>r.beamKey&&r.beamNet>0&&!r.beamChosen&&r.options.length).length,0);
  s.anyUnresolved=s.regions.some(r=>r.unresolved)||s.beams.some(b=>b.beamUnresolved);
  s.noShoreRows=s.regions.reduce((n,r)=>n+r.steps.filter(x=>x.noOptions).length,0)+s.beams.reduce((n,b)=>n+b.rows.filter(r=>r.noOptions).length,0);
  if(s._cellIdx)s._cellIdx=null;
}
function setBeamBreakout(L,memberId,on){
  const bo=beamBreakouts();
  if(on)bo[memberId]=true;else delete bo[memberId];
  regroupBeamsOf(L);
}

// Solve every level that can be poured.
function solveAll(opts){
  const stack=expandLevels();
  const out={levels:[],stack};
  if(stack.length<2)return out;
  for(let i=0;i<stack.length-1;i++){
    out.levels.push({pour:stack[i],pourIdx:i,solve:solvePourLevel(stack,i,opts)});
  }
  return out;
}

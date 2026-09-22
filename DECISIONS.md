# Decisions of Record — McClone Reshore Calculator

The single source of truth for what the calculator is supposed to do.
Canonical copy. The project doc `claude/reshore-decisions-of-record.md` explains
the system; this file holds the rules and is versioned with the code.

**How it works**

1. Every rule has a stable ID. IDs are never reused or renumbered.
2. Each test file declares the rules it covers in a `// @rules` header line.
3. `node tests/rules.mjs` reports every rule with no test. That list is the
   regression backlog.
4. A rule changes by editing it HERE, in the same commit as the code and the
   test. Never in code alone. Retire it to Superseded, never delete it.
5. Commit messages name the rule IDs touched.

---

## MDL — Model and solver semantics

| ID | Rule | Decided |
|---|---|---|
| MDL-01 | McClone sequencing, not ACI: slab loading conditions, then capacities, then floor-to-ceiling heights, then resultant load per floor, then a shore picked by height and capacity, which sets the field grid spacing. | project |
| MDL-02 | Every level must be matched to a sheet, including a whole-level slab-on-grade with nothing drawn on it, because reshoring stands on it. | Sep 15 |
| MDL-03 | Slab on grade absorbs everything and takes no capacity. Both a whole-level flag and a per-area shape. A whole-level SOG is the bottom of the job; a partial SOG area allows floors below and the cascade continues outside it. | Sep |
| MDL-04 | A missing grade level keeps the unresolved warning with a hint. Never required, never assumed. | Sep |
| MDL-05 | Overlapping loading areas behave as cutouts: the smallest area covering a point governs — not the highest capacity, not draw order. | Sep 8 |
| MDL-06 | Live load marked reducible at columns is treated as NOT reduced for the slab; the reduction is taken in the columns. | Sep 9 |
| MDL-07 | Reshoring under a floor goes in once and must cover every placement that loads it, so the tightest pattern any placement needs governs. Shores are not rearranged between pours. A small area needing tighter spacing governs its own footprint only. | Sep 10 |
| MDL-08 | Reshoring at a level can be stripped once no reshoring is needed there, which is after the level above has had its falsework stripped following its pour. Both halves stated, the falsework event named. | Sep 10 |
| MDL-09 | Only LATER pours govern. A later placement's tighter pattern is a warning beside this placement's answer, never folded into it, in both Results and Sequence, silent until both have a shore chosen. | Sep 18 |
| MDL-10 | A shore spanning an open floor keeps running to the next floor with slab, but is never silent: flagged on row, chip and plan with a per-row OK saved to the job. An opening is NOT a shaft continuing upward. | Sep 18 |
| MDL-11 | An overhang of 3 ft or less past the floor below bears on that floor. Wider reads as no slab and the shore spans through, flagged. The slab-edge-tolerance setting is removed entirely. | Sep 18 |
| MDL-12 | The pour's own loading areas lapping past the pour's edge are not counted as poured; 0.5 ft of drafting slop counts as poured. | Sep 18 |
| MDL-13 | Slab and on-grade areas always count toward the poured extent, with a note when they add area; openings punch out; beams add nothing alone. On the floors BELOW, the floor edge stays authoritative. | Sep 10 |
| MDL-14 | The topmost floor needs no capacity and gets no nag. | Sep 9 |
| MDL-16 | The Floor edge step carries the slab-on-grade tick: the bottom of the stack arrives ticked (marked assumed), any row can be ticked or cleared by hand, and once cleared by hand it is never proposed again on that job. A floor on grade is asked for no capacity — it absorbs whatever reaches it. | Sep 21 |
| MDL-15 | The floor edge carries no capacity of its own; the level default does that per sample point. The floor edge stands in as the pour's extent when no loading areas are drawn there. | Sep 9 |
| MDL-17 | A sloped area (a ramp) carries a HIGH and a LOW top, and the shore height under it is a range. The TALLEST governs the pick — the floor at its high point standing on the floor below at its low one — and the low end is checked against the chosen shore's closed length, since a shore cannot close shorter than its own minimum height. A flat area answers the same to both ends, so nothing that does not know about slopes changes. | Sep 22 |

## RGN — Regions, merging and naming

| ID | Rule | Decided |
|---|---|---|
| RGN-01 | Do not merge loading conditions. A region with a different mark on a carrying floor is never merged into another, however small. | Sep 15 |
| RGN-02 | Conditions split by mark: the same PSF over B2, C2 and E2 are separate conditions with their own rows, SF and patterns. The carrying floor's mark is part of the region signature. | Sep 8 |
| RGN-03 | A region under the minimum region size merges into the neighbour it shares the most boundary with, ONLY on a matching load path (bearing / no-slab / opening / grade). Capacity- and shore-height-only differences still merge. | Sep 10, restored Sep 15 |
| RGN-04 | Hairline wedges below two sample cells (8 SF at a 2 ft step) are absorbed into a region they TOUCH, and their marks do not travel with them. Anything larger is a condition and is never merged. | Sep 15 |
| RGN-11 | Edge slivers: a piece under the minimum region size that is either under 50 SF or nowhere more than two sample steps across is absorbed into the neighbour it shares the most boundary with. A THIN piece may go into a neighbour whose load path differs — those ribbons are two traced outlines disagreeing by inches, not conditions — while a compact one may only go where the load path matches, so RGN-03's protection of a real patch stands. Marks and cascade never travel with it: the host keeps its own name and calculation, and what was absorbed is recorded and listed on it. | Sep 21 |
| RGN-05 | The slab layer and the loading layer partition the floor independently, smallest-first in both passes. | Sep 15 |
| RGN-06 | Regions and the click highlight are painted from their exact polygons, not from solver sample cells. | Sep 17 |
| RGN-07 | Region names read slab thickness then each level below with its capacity: `13" Slab - L3 39 PSF - L2 54 PSF - 1B SOG`. Beams the same with width x depth in front. | Sep 17 |
| RGN-08 | A region is named from its largest piece, not its bounding box. | Sep 15 |
| RGN-09 | The schedule lists the largest area first. | Sep 8 |
| RGN-10 | Regions with identical answers are grouped into one row. | Sep 15 |

## BEM — Beams

| ID | Rule | Decided |
|---|---|---|
| BEM-01 | Beams are their own line items, separate from the slab grid, with a per-row effective width for the slab credit. | Sep |
| BEM-02 | Beams carry a T.O.S. offset. | Sep |
| BEM-03 | A beam is an overlay, not a piece of the slab: it is cut along the slab pieces so its stem follows the slab it sits in, piece by piece. Items combined per region AND stem. | Sep 18 |
| BEM-04 | A beam is read along its centerline, always. A beam offset so its centerline sits over slab reads the slab. Where 2+ shores per cluster sit over a narrower beam below, WARN — do not widen the reading. | Sep 18 |
| BEM-05 | Beam rows are the reshores on the floors below the pour, not the posts under the beam itself. | Sep 17 |
| BEM-06 | Beams share a row when width x depth, stem, PLF, slab region key and the conditions on every carrying floor agree; heights cluster within 1 inch and the row shows the tallest. One shore pick, effective width and shores-per-cluster apply to every member. A broken-out member stays out until regrouped. | Sep 18 |
| BEM-07 | Anything named BM or BEAM is a beam whatever its category. Columns are ignored by auto-detect. | Sep 15, Sep 18 |
| BEM-08 | Auto-detected beams are proposed all, none ticked, sizes read from the nearby BM label, uncertain matches flagged. | Sep 15 |

## EDG — Floor edge

| ID | Rule | Decided |
|---|---|---|
| EDG-01 | Edge vertices land on drafted endpoints (curves aside) and one drafted corner comes back as ONE vertex. The smallest real step to keep is 3 inches. Applies to Detect floor edge, auto-traced slab/loading areas and Clean corners. | Sep 15 |
| EDG-02 | A rebuild that moves the area by more than 2% (6% on the on-demand button), or drops below a triangle, is refused — the traced outline is kept and the reason reported. | Sep 15 |
| EDG-03 | Curves are preserved: the detector handles them and Simplify must not flatten them. Chopped fine enough to stay within a quarter inch of the true arc. | Sep 9 |
| EDG-04 | The floor edge is its LINE alone — no invisible fill. Picking is on the line or a corner; everything inside falls through to what is really drawn there. Whole-level SOG keeps its visible hatch. | Sep 16 |
| EDG-05 | Auto-detect offers the top few candidate outlines to pick from rather than one guess, and must not return the key plan or follow wall lines. | Sep 17 |
| EDG-06 | Dimension strings and section/detail markers are erased from the raster before tracing, with the as-drawn outline kept as a fallback. | Sep 17 |
| EDG-07 | The edge is confirmed FIRST; auto-detect of beams, openings and thickened slabs then looks only inside the confirmed edge. | Sep 17 |
| EDG-08 | An edge edit after the Building step is an assumed confirmation. An edit on the Building step still reopens the review; an edge drawn by hand on a later step is created confirmed. | Sep 18 |
| EDG-09 | Learned from his own edges: they run straight past column bumps, cut X-marked openings out along their outline, and are closed by hand where the drawing leaves them open. | Sep 17 |

## BLD — Building step: levels, sheets, match

| ID | Rule | Decided |
|---|---|---|
| BLD-01 | Four groups — Building / Loads / Areas / Results — with Sequence a tab inside Results, as sections stacked down one panel. Within Building: Levels, Sheets, Edge, Match. | Sep 15, Sep 17 |
| BLD-02 | Levels are read out of the drawings on load (T.O.S. + slab thickness + clear height), names normalised from the sheet titles. A Confirm levels button gates the Sheets step. | Sep 9, Sep 17 |
| BLD-03 | A plan sheet with no elevation callouts is still proposed, with its name and page, elevation blank and on-grade flagged. | Sep 9 |
| BLD-04 | One always-present sheet table, a row per page: level picker, zone box, and "not a floor plan" as a CHOICE, never a silent verdict. Sheets are never filtered. A drawing titled as a plan counts as one; zone read from the title block. | Sep 17 |
| BLD-05 | A sheet assigned to a floor that already has one is ADDED as a second sheet, never replaces it. Each area belongs to the sheet it was drawn or detected on. | Sep 16 |
| BLD-06 | Where a floor has several plans, the soffit plan is the one bound. | Sep 9 |
| BLD-07 | Matching auto-pairs by level and zone against the sheet below, then reviews. A Confirm button per sheet and a Clear per sheet — never clear-all, never the project grid. New points work whether or not they match a previous floor. | Sep 10, Sep 17 |
| BLD-08 | Every successful match contributes the rest of that sheet's gridlines to the project grid. Where a sheet disagrees, THE PROJECT GRID STANDS and the drift is reported — never averaged. | Sep 17 |
| BLD-09 | A re-issued set is re-mapped sheet-by-sheet by title block, with a review before any page numbers change. A moved sheet's grid match carries over but is flagged. His levels are kept and what changed is shown. | Sep 17 |
| BLD-10 | Sheet scale comes from the plan views, not from a detail's note. One-click Rescale available. | Sep 17 |
| BLD-11 | A level may hold several sheets as named zones, one zone per sheet, with the grid running continuously across the split. Zones are names only for now. | Sep 10, Sep 17 |
| BLD-15 | A sheet that states its floor once, in a strip under the drawing title ("T.O.S. 9'-3" · typical slab 5" · SLAB ON GRADE"), is read. It is a SEPARATE channel from the T/SLAB - B/SLAB callouts: it fills only what they left empty, never overrides them, and never feeds the plan-vs-section test. One figure for the whole sheet or none — a set calling out an absolute T.O.S. per bay is the callout channel's job. | Sep 22 |
| BLD-16 | A title that names its level names it in FULL: "LEVEL MECH ROOF FLOOR PLAN" is MECH ROOF, not Roof. An explicit "LEVEL &lt;name&gt; … PLAN" beats the ROOF / PENTHOUSE / MEZZANINE shortcuts, which are for a sheet titled only "ROOF PLAN"; the designation stops at the words naming the kind of plan. | Sep 22 |
| BLD-17 | Number bubbles and letter bubbles are banded SEPARATELY. Clustered together, a band that came out mixed was discarded whole — and on a plan drawn at an angle one diagonal letter bubble lands in the row of numbers, so four of the ten Kalae podium sheets read zero column bubbles. Banding each kind on its own says what the homogeneity test meant without one stray bubble costing the band it strayed into. | Sep 22 |

## LOD — Loads

| ID | Rule | Decided |
|---|---|---|
| LOD-01 | Three ways loads arrive: a schedule table, loading diagrams (a key plan per level per load type), and manual/Excel entry. The drawings are scanned first; when nothing on them reads as a schedule the chart STARTS ITSELF as one combined chart with a blank row and says so. Switching to split LL + SDL schedules is under "by hand" while the chart is empty; a shape the user switched to stands. The blank starter row is a placeholder: an import or a re-scan that brings real marks replaces it. | Sep 9, Sep 14, Sep 21 |
| LOD-02 | Values read off loading diagrams go into the Loads step ONLY — not pinned, not auto-traced. | Sep 9 |
| LOD-03 | The Excel import reads his chart as written (Designation, SDL psf, LL psf, TOTAL CAPACITY psf, with * meaning reducible live load), with a downloadable blank template and a review panel before anything is written. | Sep 14 |
| LOD-04 | A re-scan keeps hand-entered marks and flags where the drawings disagree. | Sep 14 |
| LOD-05 | Verifying a mark stays on the Loads tab and highlights the schedule row the value was read from — never jumps to another step. | Sep 15 |
| LOD-06 | Auto-trace lives on the Loads step. A typical loading mark per level is auto-picked from the mark covering the largest traced area. | Sep 15 |
| LOD-08 | The typical capacity per floor has ONE home: the Loads step, with the marks. The Levels row and the Areas typical row show it read-only and link there. | Sep 21 |
| LOD-09 | Results waits for a schedule it can price: a chart whose rows carry no numbers does not open Results. | Sep 21 |
| LOD-10 | The typical capacity per floor is a card of its own on Loads, with its state in its head (all N set / N to confirm / N still to set) and amber while anything is missing — and the Loads step is NOT done until every carrying floor has one and no assumed value is left unconfirmed. The rail and Next carry the same count. | Sep 21 |
| LOD-07 | Load-map tracing is one pass over every load-map sheet, on the Loads step after the schedule. Plans filed under the floor their title names with level and zone pickers, one review grouped by floor, traced areas landing on whichever zone sheet they fall in. | Sep 17 |

## ARE — Areas step and markup

| ID | Rule | Decided |
|---|---|---|
| ARE-01 | Slab is the first tab, Loading the second. | Sep 15 |
| ARE-02 | Openings and slab-on-grade are handled on the Areas tab only. | Sep 15 |
| ARE-03 | The Areas pane shows only the items on the sheet on screen, nothing more. | Sep 17 |
| ARE-04 | Clicking an area in the list expands its properties inline under the row — it must not send him to the bottom of the pane. | Sep 17 |
| ARE-05 | Shapes are named from their own values unless he types a label; the list is grouped by type. | Sep 8 |
| ARE-06 | A Draw button per layer starts the drawing tool itself, and the tool stays armed for the next shape until Escape. | Sep 8 |
| ARE-07 | Slab draw prompts for kind (edge / slab / beam / opening), with slab-on-grade a Type option under slab. | Sep 8 |
| ARE-08 | The typical loading area is a hatched, labelled fill BOUNDED BY THE FLOOR EDGE — drawn, not a second shape to keep in sync — with drawn areas punched out as exceptions, a muted fill where there is no capacity yet, and a Typical capacity row editing the same level default. | Sep 9 |
| ARE-09 | Where a traced pocket is much smaller than the enclosure it sits in, FLAG it rather than guess. | Sep 15 |
| ARE-10 | A loading area split by a floor edge appearing in several zones is split into one piece per zone sheet, cut along each sheet's floor edge — for load-map-traced areas only. | Sep 17 |
| ARE-11 | Markup is LOCKED on Results and Sequence: nothing selects, drags, erases corners or deletes, and the drawing tools cannot be armed. Pan, zoom, paging and clicking a region still work, with a standing locked badge. | Sep 10, Sep 15 |

## RES — Results

| ID | Rule | Decided |
|---|---|---|
| RES-01 | Plan left, schedule right, both always on screen. An install summary per floor at the top. Bulk shore apply: pick once, apply to every row it fits. THE APP NEVER PRE-SELECTS A SHORE. | Sep 10 |
| RES-02 | Floor tabs with the plan coloured by required spacing; one-line region cards; a Next button through the rows still needing a shore. | Sep 18 |
| RES-03 | The "pick a shore" chip must stand out from the other chips. | Sep 18 |
| RES-04 | On a floor split across zones, results are split by zone. | Sep 17 |
| RES-05 | Clicking a result shows only the areas in question; irrelevant shapes are hidden. The pour floor's own loading areas do not show; the reshore-under floors' do, with the pour region as the overlay. | Sep 9 |
| RES-06 | The selected region highlight is GREEN with marching ants, independent of which Areas layer was last on, and the selected slab area shows over the carrying floor's loading area. | Sep 8, Sep 9 |
| RES-07 | "Nothing to shore against" is not a block of its own: a count in the summary head and the reason on the region rows. | Sep 17 |
| RES-08 | A shore-height alert names the floor, region and height, and the line clicks onto the plan. No taller-shore suggestion, no inline catalog link, no permanent warning hatch. | Sep 10 |
| RES-09 | Region titles carry no pour-slab loading mark; each reshore row carries the CARRYING floor's mark. | Sep |
| RES-10 | Print refuses results that no longer match the inputs. | Sep 15 |

## SEQ — Sequence

| ID | Rule | Decided |
|---|---|---|
| SEQ-01 | The strip column states both halves of MDL-08 and names the falsework event, stays in placements rather than dates, and adds a per-floor block. | Sep 10 |
| SEQ-02 | Areas needing the pattern tightened are clickable onto the plan. | Sep 17 |

## JOB — Job lifecycle

| ID | Rule | Decided |
|---|---|---|
| JOB-01 | Real step gates with a Next button; one route to a given end result, not several. | Sep 15 |
| JOB-02 | New job clears back to the upload screen behind a confirm dialog naming what goes, with a Save job button inside it. Project settings and hand-added shores carry over. | Sep 9 |
| JOB-03 | Sharing is a private claude.ai artifact link with Save job and Print adapted for the sandbox; the local file keeps its normal download and popup behaviour. | Sep 9 |

## UI — Interaction

| ID | Rule | Decided |
|---|---|---|
| UI-01 | Escape backs out of any command, everywhere. | Sep |
| UI-02 | Shift+click removes a vertex. Right-click undoes the last point placed while drawing. | Sep, Sep 17 |
| UI-03 | Corner removal by Shift+drag eraser sweep, Shift+Alt+drag box, and hover+Delete, plus a Simplify slider with a live corner count that must not flatten curves. | Sep 9 |
| UI-04 | Ortho is Shift-held only, no sticky mode, with a dashed blue tracking line and a perpendicular lock on drawing lines AND on other vertices' alignment — on Shift and as a toolbar toggle. | Sep 8 |
| UI-05 | Closing a polygon focuses the properties panel, Enter/Tab advancing fields. | Sep |
| UI-06 | Moving an area: select first, then drag. Snap on the corner nearest the grab, a toast naming what moved and how far, Shift mid-drag to keep the move square. | Sep 9 |
| UI-07 | The menu is Settings (not Advanced) and closes only on Escape or a click outside. Solver settings carry plain explanations. | Sep 8 |
| UI-08 | Step descriptions live behind a ? help icon. | Sep 8 |
| UI-09 | Markups copy between floors via a copy-from picker. | Sep |
| UI-10 | The slab kind is called Slab, not Step. | Sep |
| UI-11 | The ghost of the floor below combines the North and South floor edges into ONE complete floor, alongside a stacking-check panel. | Sep 17 |
| UI-12 | The stacking warning auto-clears where an on-grade area is drawn there, with an OK button on the row remembered on the job until the overshoot grows. | Sep 17 |
| UI-13 | On the Levels list, headers sit over the field they reference, and the F2F and shore-height line is bold and easy to read. | Sep 17 |
| UI-15 | Every section has ONE primary action at the top (Confirm levels · All N flagged look right · Confirm all N drawn · Confirm all N matched · Confirm all N marks · Add the proposed shapes). Re-readers and hand tools fold behind an "or do it by hand" disclosure that stays closed until opened and, once opened, stays open for the job. | Sep 21 |
| UI-16 | The Floor edge section reads itself on arrival: every plan sheet is swept, confident outlines are drawn for Confirm / Adjust, doubtful ones stay on their own sheet's row to look at and pick from (UI-22). Once per set of sheets; the button is the re-run. | Sep 21 |
| UI-17 | The Areas step reads itself on arrival: sheets with a confirmed edge and nothing yet read off them are scanned for beams and openings and the proposal opens (none ticked, BEM-08). Remembered on the job per sheet, so an old job is not rescanned. | Sep 21 |
| UI-18 | Results, Sequence and the rail report the same "still to choose" count: rows across every placement with a shore to pick; rows with nothing tall enough are listed, not counted. | Sep 21 |
| UI-19 | The level modal is gone. Single floors and typical ranges are edited in the Levels rows (… opens the range fields under a row; double-click lands in the row's own fields). Slab thickness is edited in the row or re-read from the drawings. | Sep 21 |
| UI-20 | While the app is waiting for a click on the plan — the floor-edge candidates, matching a floor or a load-map plan from its grid crossings, an armed drawing or fill tool — the canvas carries a ring and ONE bar sits over the drawing naming what is being asked, with the way out on it. Matching keeps its own bar in that slot (it carries the grid-label popup); no state ever shows two. | Sep 21 |
| UI-21 | The floor-edge candidates are drawn on the sheet, numbered and colour-matched to their rows in the pane. Hovering a row or an outline lights it; a click on the plan picks that outline and a second click on the picked one uses it; ← → cycle and Enter uses the one on screen. While they are up the plan is the picker — nothing else on the canvas hovers — and a click on bare sheet writes nothing. | Sep 21 |
| UI-22 | The Floor edge step is ONE list — a row per plan sheet, no second review panel. A read that has not been written sits on the sheet it came from, saying what it found and, where that sheet already has an edge, what it would change (area either side, how far the outline moves, how many drawn areas would fall outside it), with Show · Use this · Pick from the sheet · Keep current. Nothing is written until Use. The top action is Confirm all N drawn while anything is drawn, and Use all N read / proposed only when nothing is. | Sep 21 |
| UI-23 | A pass that reads every sheet says where it is in its own step's primary slot — "Reading sheet 3 of 6 for its grid bubbles…" — never only on a button folded away inside "or do it by hand". Applies to the arrival match pass and the floor-edge sweep. | Sep 21 |
| UI-14 | PDF fidelity: device-pixel-ratio-correct canvases, no PNG round trip, the visible patch re-rendered at on-screen magnification, auto-trace and floor-edge raster at 144 DPI. | Sep 9 |

## BRD — Brand

| ID | Rule | Decided |
|---|---|---|
| BRD-01 | McClone style guide: MCC Red #CF0A2C, MCC Grey #8A8A8D, black/white, tints #F2F2F2 and #D9D9D9, Calibri with a monospace kept for columns of figures, THE LOGO NEVER RECREATED. Brand colour in app chrome and print output only; the plan's functional colours left alone. Dark theme kept and adapted. Logo in the print/PDF header only. | Sep 9 |

## RVT — Revit / IFC feed

| ID | Rule | Decided |
|---|---|---|
| RVT-01 | Revit supplies GEOMETRY ONLY. Loading marks are drawn in the calculator. | Sep 18 |
| RVT-02 | FILL / PAD / CURB / PEDESTAL / Plinth / TOS SLOPE are never slab. Anything named BM or BEAM is a beam whatever its category (see BEM-07). | Sep 18 |
| RVT-03 | Rotation to project north is a user option. | Sep 18 |
| RVT-05 | Any gridline or bubble whose tag carries an apostrophe or a lowercase letter is not needed on the drawings, and bubbles sit outside the building extents. | Sep 18 |
| RVT-06 | Elevations are reported on the PROJECT datum, found from the model's own Reference Level properties (Top / Bottom Reference Elevation) against the storey elevations. Kalae: 90'-9" below the storey values, so Level 1 reads 9'-3". Storey elevations are the fallback. | Sep 21 |
| RVT-07 | A hole in the slab that a wall or column fills is not an opening. The pocket is filled back in: the load path runs through the wall or the column. | Sep 21 |
| RVT-08 | The X on an opening is drawn on the opening's own rotated rectangle and clipped to it, never on its axis-aligned box. | Sep 21 |
| RVT-09 | Default (`--drawings field`): the job stands on McClone's own printed set. It carries no sheets of its own; its geometry travels in FEET in the frame the project grid is written in, under `modelZones`. `--drawings rendered` keeps the old behaviour. The rendered PDF is written either way, as a check on what the model thinks it has. | Sep 21 |
| RVT-10 | Registration is the Match step: fitting one of his sheets to the model's project grid from that sheet's own bubbles IS the transform, and the same transform places the model's polygons on it. Model geometry governs; the drawing is the backdrop. Nothing is written until Apply. | Sep 21 |
| RVT-11 | A polygon is placed on the sheet it lands on and cut at the page edge, so a floor split North / South gets each half on its own sheet. | Sep 21 |
| RVT-12 | Feet and inches on a rendered sheet are written as a drawing writes them — 9'-3", 77'-11 1/2" — never 77'-11.5". The decimal form is in no drawing and the calculator's own dimension reader does not parse it. | Sep 22 |
| RVT-13 | A ramp is one element with a falling top, so its bounding box is the slope RISE plus the slab. The top face is grouped by the PLANE its triangles lie in: each run and each landing exports as its own piece with its own high and low T.O.S., and the thickness has the rise taken back out. An on-grade ramp is not flagged — it bears on the ground. | Sep 22 |
| BLD-12 | A sheet can serve more than one floor — a typical tower plan serves every floor above the podium. Where several floors hold a page, the floor being worked on is the one meant. | Sep 21 |
| BLD-13 | The fit is seeded from the two crossings that agree with the most others, refitted, and seeds over 3" RMS are discarded. A key plan in the title block carries its own bubbles at its own scale, and a fit taken over every crossing lands between the two plans and stays there. | Sep 21 |

---

## Deferred — not to be started without a new ask

- Pour zones as separate placements (zones are names only today).
- Pour dates and falsework-strip dates.
- Locking markup on the Drawings / Levels / Loads steps.
- An arc drawing tool, and arc-fitting on traced outlines.
- Neighbouring pours on the same floor (PT pour breaks) — a floor is one placement.
- Reading an opening on a lower floor as a shaft continuing upward.
- A simplified / field-plan results tab.
- Podium-beam solver speedup; making a shore pick instant instead of a full re-solve (27 s on Kalae).
- A pyRevit button for ifc2reshore.py.

## Open questions — not yet decided

- A job with no drawing set cannot be solved at all; runSchedule() returns early
  on the results gate. Seven fixtures work around it with a stand-in sheet.
  Is that the intent of the gates, or does the gate need an exception?
- Where the beam shore height came from on B4 48x20 over R3 (13'-10" against
  B3's 9'-10") — points at a 4'-0" T.O.S. offset on L2 or 1B, still to be checked.
- Field-plan tab: simplification per floor or one setting for the job, and
  whether cost shows as shore count or shore-days.

## Superseded — kept so they are not re-adopted by accident

| Was | Replaced by | When |
|---|---|---|
| Region names as grid bays plus carrying mark (1-6 / A-D B2) | RGN-07 | Sep 17 |
| Whole-level slab-on-grade needs no sheet match | MDL-02 | Sep 15 |
| Areas list grouped by sheet zone name, sheet on screen first | ARE-03 | Sep 17 |
| A Slab edge tolerance project setting (default 2 ft) | MDL-11 | Sep 18 |
| Sliver merge across marks where capacity differed | RGN-01, RGN-03 | Sep 15 |
| Seven steps in the rail | BLD-01 | Sep 15 |
| One-shot sheet review panel, edge column on the Sheets step | BLD-04 | Sep 17 |
| Orange selected-region highlight | RES-06 | Sep 8 |
| "Start a combined chart / Start split schedules" asked cold on an empty Loads step | LOD-01 | Sep 21 |
| Typical capacity editable on the Levels row, the level modal and the Areas typical row | LOD-08 | Sep 21 |
| RVT-04: the job's drawing set is a rendered plan sheet per level | RVT-09 | Sep 21 |
| The level modal (double-click a level / …) | UI-19 | Sep 21 |
| The Results modal (Schedule button) and gotoStep | BLD-01 | Sep 21 |
| Detect the floor edge / Auto detect as buttons the user must press first | UI-16, UI-17 | Sep 21 |
| The detected floor edge shown as one outline, accepted or cancelled in the left pane only | UI-20, UI-21 | Sep 21 |
| A separate floor-edge review panel listing the same sheets as the rows above it (tick, Apply, Tick all readable) | UI-22 | Sep 21 |

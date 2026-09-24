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
| MDL-18 | A STIFF shore standing on slab on grade needs a wood pad. Load-sharing down the stack depends on the slabs deflecting against each other; wood (Ellis) shores give that compliance, steel and aluminum posts do not, so a chain of them from the pour to grade holds the slabs flat and the bottom shores carry the full stack. Every shore not ticked Wood in the catalog counts as stiff. Where its base sits on grade (whole-level or drawn SOG, slab rows and beam rows alike) the note "wood pad under every base — two layers of 3/4" plywood (1-1/2" min), 12"×12" or larger" appears on the row, on the chip, in the install summary and on the printed sheet. It is a field condition to install, never an OK to press away, and it never changes the numbers. | Sep 22 |

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
| BLD-18 | A load-map or schedule sheet is never a floor plan: reading levels from the drawings skips it, so it creates no level and binds to none. Horizon House's three load-map sheets had become levels B7, 22-28 and 33, with B7 bound to its load map. | Sep 23 |
| BLD-19 | The plan scale is the job's, read once from the plan note on every plan sheet (checked by the dimension chain), held provisionally, and CONFIRMED once — on its card on Match floors or by confirming a match made at it. Every floor match, automatic or by hand, is held at it: the fit finds only where the sheet sits (rotation snaps to square within 0.25°, and up to 0.5% plotter stretch is taken). A sheet whose own plan note is a different plan scale is tried at both and keeps the one its bubbles agree with, and asks once. A job saved before this takes its scale from the matches its user confirmed. | Sep 23 |
| BLD-20 | A key plan's bubbles never place a floor: a bubble band under a third the length of the longest on its axis only speaks for labels the grid already knows, a bubble whose crossings the locked fit rejects is named on the row with how far off it read, and the grid is never given a line from a short band. When the project grid disagrees with two or more lines of a sheet by over a foot, or sheets were matched at another scale than the locked one, Match floors says the grid does not hold together and offers Rebuild the grid (clear the grid and every match, read every sheet again at the job scale; areas stay in sheet pixels). | Sep 23 |
| BLD-21 | A grid bubble moved clear of its neighbour on an elbowed leader (Horizon House 2.7, 2'-3" off 2.6) is followed down its leader to the dash-dot line it names; the line's position is the reading, not the bubble's. A bubble with a gridline through its own centre is read at its centre. | Sep 23 |
| BLD-22 | THE ELEVATION TAG. A plan (slab-on-grade and foundation plans above all) may state its T.O.S. as the bare elevation — 197'-4" — in a rounded box with a leader to a dot, no T/SLAB word and no strip. It is read as a third channel, only when the callout channel and the title strip both found nothing: a horizontal text item that is exactly an elevation string, with dark linework close in on all four sides of it and nothing else written in the box. A dimension string reads the same but has its line on one side only, so it is not a tag. The sheet takes the mode of its tags (n of total shown in the review, "elevation tags"). | Sep 23 |

## LOD — Loads

| ID | Rule | Decided |
|---|---|---|
| LOD-01 | Three ways loads arrive: a schedule table, loading diagrams (a key plan per level per load type), and manual/Excel entry. The drawings are scanned first; when nothing on them reads as a schedule the chart STARTS ITSELF as one combined chart with a blank row and says so. Switching to split LL + SDL schedules is under "by hand" while the chart is empty; a shape the user switched to stands. The blank starter row is a placeholder: an import or a re-scan that brings real marks replaces it. | Sep 9, Sep 14, Sep 21 |
| LOD-02 | Values read off loading diagrams go into the Loads step ONLY — not pinned, not auto-traced. | Sep 9 |
| LOD-03 | The Excel import reads his chart as written (Designation, SDL psf, LL psf, TOTAL CAPACITY psf, with * meaning reducible live load), with a downloadable blank template and a review panel before anything is written. | Sep 14 |
| LOD-04 | A re-scan keeps hand-entered marks and flags where the drawings disagree. | Sep 14 |
| LOD-05 | Verifying a mark stays on the Loads tab and highlights the schedule row the value was read from — never jumps to another step. | Sep 15 |
| LOD-06 | A typical loading mark per level is auto-picked from the mark covering the largest traced area. (Where the trace lives: ARE-12.) | Sep 15 |
| LOD-08 | The typical capacity per floor has ONE home: the Loads step, with the marks. The Areas typical row shows it read-only and links there; the Levels row does not show it at all (BLD-14). | Sep 21 |
| LOD-09 | Results waits for a schedule it can price: a chart whose rows carry no numbers does not open Results. | Sep 21 |
| LOD-10 | The typical capacity per floor is a card of its own on Loads, with its state in its head (all N set / N to confirm / N still to set) and amber while anything is missing — and the Loads step is NOT done until every carrying floor has one and no assumed value is left unconfirmed. The rail and Next carry the same count. | Sep 21 |
| LOD-07 | The all-floors pass reads every load-map sheet in one go: plans filed under the floor their title names with level and zone pickers, one review grouped by floor, traced areas landing on whichever zone sheet they fall in. It is the fallback behind "or do it by hand" on the Loading tab (ARE-12). | Sep 17 |
| LOD-11 | Every cache keyed by page number — vector strokes, painted shapes, rasters, X-marks, the traced load maps and the "ready" flag — belongs to ONE drawing set and is cleared whenever a set is loaded or the job reset. The trace-results cache is also keyed on the schedule, the set's page count and the project grid, so a plan fit made before the sheets were matched is redone, never served stale. | Sep 22 |
| LOD-12 | A tag is inside a painted load area only where that shape actually paints, even-odd over its own rings: a tag in a hole of a ring-shaped area (a corridor) or of an area with cut-outs belongs to what is drawn in the hole, not to the ring. The floor for "an area" (as against a tag square) is 3,000 image px². | Sep 22 |
| LOD-13 | On a sheet that calls itself a load map, a view titled with the floor alone ("LEVEL B7", "11 LEVEL B5", "LEVEL 22-28", "ROOF") is that floor's map. A token with a basement letter is only ever its own level: B1 is never level 1. | Sep 23 |
| LOD-14 | A split schedule reads as drawn: the description is the nearest DESCRIPTION / TYPE / USE / AREA column right of MARK, the value is the TOTAL column where there is one, a centred description that starts left of the column split is description (the mark is the cell's leftmost token), a table stacked under another stops at the next one's MARK header, and a value's trailing words ("50 (R) + 15 PARTITION") are kept as a comment. | Sep 23 |
| LOD-15 | Load-map tracing handles a light pen set and boxed tags: a split tag drawn as two cells (letter \| number) is one tag; a boxed tag with no leader floods the area around its box; where the sheet's heavy pen is scarce the next pen down (1.3-3.3 px) is the outline; maps side by side are fitted from their own run of a shared bubble row; and several tags that flood one region give it to the deepest one with the code left to confirm and the others reported. | Sep 23 |

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
| ARE-11 | THE SCAN IS A REVIEW QUEUE. The sheet on screen is read first and the review opens on it at once; the other sheets are read behind it, their shapes joining the queue, with the progress said in the head. One candidate at a time, shown and zoomed on its sheet with a glow, BY TYPE (beams, thickened slabs, openings) then floor by floor. Accept writes that one shape; Accept & adjust writes it and opens its PROPERTIES INSIDE THE ACCEPTANCE CARD with the corners live, the one button reading "Done — next candidate" (never a bare Next, which was mistaken for the step's Next: Results); Skip writes nothing; Accept all remaining <type> takes the rest of that type (sized beams only). Enter / A / N drive it. The tick list stays one click away and still writes only what is ticked (BEM-08 holds: nothing is written until you say so). Leaving Areas PAUSES the review and coming back resumes it — it is never thrown away by a step change. | Sep 21 |
| ARE-12 | THE TRACE LIVES ON THE LOADING TAB, where the beam scan lives on the Slab tab; "Detect again" is slab-only and does not show there. Arriving reads the load maps in the background (cached per schedule) and offers a card — "12 loading areas read from L3's load map — Review"; nothing moves until Review is pressed. Review takes you to THIS FLOOR's load map and walks its areas one at a time in the same queue as the beams (Accept / Accept & adjust / Skip / Accept all; Enter, A, N), with the plan's floor, zone and grid match above the area. Nothing is written until "Add N loading areas & back", which writes them and returns you to the sheet you started from, Loading layer up. Cancel returns too. | Sep 21 |
| ARE-13 | THE SOG AREA IS DRAWN FROM THE FLOOR EDGE. A floor ticked SOG on the Levels list gets an on-grade area matching its floor edge the moment that edge is confirmed (or the moment it is ticked, if the edge already is), on each of its sheets, named "Slab on grade" — nobody draws it by hand. Untouched, it follows the edge and the floor stays whole-level slab on grade. Adjusted (a corner moved, removed, added, simplified), it becomes the user's: the floor is then PARTLY on grade — inside the area the slab bears on soil, outside it the floor is suspended and the cascade goes on below — and the Levels row says "in part". Unticking SOG removes an untouched area and leaves an adjusted one. A sheet that already has a hand-drawn on-grade area gets none. | Sep 24 |
| ARE-11 | Markup is LOCKED on Results and Sequence: nothing selects, drags, erases corners or deletes, and the drawing tools cannot be armed. Pan, zoom, paging and clicking a region still work, with a standing locked badge. | Sep 10, Sep 15 |

## RES — Results

| ID | Rule | Decided |
|---|---|---|
| RES-01 | Plan left, schedule right, both always on screen. An install summary per floor at the top. Bulk shore apply: pick once, apply to every row it fits. THE APP NEVER PRE-SELECTS A SHORE. | Sep 10 |
| RES-02 | Floor tabs with the plan coloured by required spacing; one-line region cards; a Next button through the rows still needing a shore. | Sep 18 |
| RES-03 | The "pick a shore" chip must stand out from the other chips. | Sep 18 |
| RES-04 | On a floor split across zones, results are split by zone. | Sep 17 |
| RES-05 | Clicking a result shows only the areas in question; irrelevant shapes are hidden. The pour floor's own loading areas do not show; the reshore-under floors' do, with the pour region as the overlay. | Sep 9 |
| RES-06 | The selected region highlight is independent of which Areas layer was last on, and the selected slab area shows over the carrying floor's loading area. (Colour and motion: see RES-10.) | Sep 8, Sep 9 |
| RES-07 | "Nothing to shore against" is not a block of its own: a count in the summary head and the reason on the region rows. | Sep 17 |
| RES-08 | A shore-height alert names the floor, region and height, and the line clicks onto the plan. No taller-shore suggestion, no inline catalog link, no permanent warning hatch. | Sep 10 |
| RES-09 | Region titles carry no pour-slab loading mark; each reshore row carries the CARRYING floor's mark. | Sep |
| RES-10 | The selected region is a TEAL GLOW on its outline with a light tint inside — no dashes, nothing animated — so the drawing under the edge stays readable. While one region is selected the others step back. The same teal marks the lit row in the schedule. | Sep 21 |
| RES-11 | RESULTS READ TOP-DOWN LIKE A FIELD SHEET: one context row (pour · area · print); real warnings stay in view, explanatory notes fold into "Notes & assumptions"; the pane opens on the pour's own sheet; tabs read "All floors / Under 3" and chips "under 3" (a floor called 3 must never read as a count); the install row leads with the floor and its pattern at the title size; "Next pick" is the pane's one primary button. | Sep 21 |
| RES-10 | Print refuses results that no longer match the inputs. | Sep 15 |

## PRT — The printed sheet

| ID | Rule | Decided |
|---|---|---|
| PRT-01 | THE PRINT SHOWS WHERE. Every region row and beam row carries a crop of its own sheet around it, the region glowing (RES-10) with the floor below ghosted. Every floor that gets reshoring gets a page after the install table: its plan shaded by required spacing with the legend. The snippets are drawn after the print document opens; it prints once they are in. | Sep 21 |

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
| UI-02 | Shift+click removes a vertex — of the SELECTED shape only (UI-30). Right-click undoes the last point placed while drawing. | Sep, Sep 17, Sep 23 |
| UI-03 | Corner removal by Shift+drag eraser sweep, Shift+Alt+drag box, and hover+Delete — all on the SELECTED shape only (UI-30) — plus a Simplify slider with a live corner count that must not flatten curves. | Sep 9, Sep 23 |
| UI-04 | Ortho is Shift-held only, no sticky mode, with a dashed blue tracking line and a perpendicular lock on drawing lines AND on other vertices' alignment — on Shift and as a toolbar toggle. | Sep 8 |
| UI-05 | Closing a polygon focuses the properties panel, Enter/Tab advancing fields. Tab never leaves the pane by itself; Escape is the way back to the plan (UI-29). | Sep, Sep 23 |
| UI-06 | Moving an area: select first, then drag. Snap on the corner nearest the grab, a toast naming what moved and how far, Shift mid-drag to keep the move square. | Sep 9 |
| UI-07 | The menu is Settings (not Advanced) and closes only on Escape or a click outside. Solver settings carry plain explanations. | Sep 8 |
| UI-08 | Step descriptions live behind a ? help icon. | Sep 8 |
| UI-09 | Markups copy between floors via a copy-from picker. | Sep |
| UI-10 | The slab kind is called Slab, not Step. | Sep |
| UI-11 | The ghost of the floor below (and, since UI-37, the floor above) combines the North and South floor edges into ONE complete floor, alongside a stacking-check panel. | Sep 17, Sep 24 |
| UI-12 | The stacking warning auto-clears where an on-grade area is drawn there, with an OK button on the row remembered on the job until the overshoot grows. | Sep 17 |
| UI-13 | On the Levels list, headers sit over the field they reference (by the shared grid of UI-33, no measuring), and the F2F and shore-height line is bold and easy to read. | Sep 17, Sep 23 |
| UI-15 | Every section has ONE primary action at the top (Confirm levels · All N flagged look right · Confirm all N drawn · Confirm all N matched · Confirm all N marks · Add the proposed shapes). Re-readers and hand tools sit in ONE captioned row under the primary action, always in view — never folded behind a disclosure (UI-31). | Sep 21, Sep 23 |
| UI-16 | The Floor edge section reads itself on arrival: every plan sheet is swept, and the reads are walked one sheet at a time in the bar over the plan (UI-35) — nothing is written until each is confirmed. Once per set of sheets; Detect again is the re-run. | Sep 21, Sep 23 |
| UI-17 | The Areas step reads itself on arrival: sheets with a confirmed edge and nothing yet read off them are scanned for beams and openings and the proposal opens (none ticked, BEM-08). Remembered on the job per sheet, so an old job is not rescanned. | Sep 21 |
| UI-18 | Results, Sequence and the rail report the same "still to choose" count: rows across every placement with a shore to pick; rows with nothing tall enough are listed, not counted. | Sep 21 |
| UI-19 | The level modal is gone. Single floors and typical ranges are edited in the Levels rows (… opens the range fields under a row; double-click lands in the row's own fields). Slab thickness is edited in the row or re-read from the drawings. | Sep 21 |
| UI-20 | While the app is waiting for a click on the plan — the floor-edge candidates, matching a floor or a load-map plan from its grid crossings, an armed drawing or fill tool — the canvas carries a ring and ONE bar sits over the drawing naming what is being asked, with the way out on it. Matching keeps its own bar in that slot (it carries the grid-label popup); no state ever shows two. | Sep 21 |
| UI-21 | The floor-edge candidates are drawn on the sheet, numbered and colour-matched to their rows in the pane. Hovering a row or an outline lights it; a click on the plan picks that outline and a second click on the picked one uses it; ← → cycle and Enter uses the one on screen. While they are up the plan is the picker — nothing else on the canvas hovers — and a click on bare sheet writes nothing. | Sep 21 |
| UI-22 | The Floor edge step is ONE list — a row per plan sheet, no second review panel. A read that has not been written sits on the sheet it came from, saying what it found and, where that sheet already has an edge, what it would change (area either side, how far the outline moves, how many drawn areas would fall outside it), with Review · Dismiss / Keep current (UI-35). Nothing is written until Use. The top action is Confirm all N drawn while anything is drawn, and Use all N read / proposed only when nothing is. | Sep 21 |
| UI-23 | A pass that reads every sheet says where it is in its own step's primary slot — "Reading sheet 3 of 6 for its grid bubbles…" — never only on a button folded away inside "or do it by hand". Applies to the arrival match pass and the floor-edge sweep. | Sep 21 |
| UI-24 | ONE TYPE SCALE: four sizes (18 / 14 / 12.5 / 11 px as `--fs-xl/lg/md/sm`) and nothing else. Importance is carried by weight, colour and position, never a fifth size. Every state is a PILL in one vocabulary — amber "needs you", green "done", grey "read, unconfirmed", dashed "cannot start yet" — on section heads, rail rows, tabs and cards. | Sep 21 |
| UI-25 | THE RAIL IS A CHECKLIST: the four steps, and under the current step every section with its own state and one-line status, each clickable. A step with sections is summed up as "n of m done"; a one-section step says its own status. | Sep 21 |
| UI-26 | ONE STATUS BAR at the foot, same place on every step: it names what this step still wants ("Now: 5 sheets still to place") with the section it lives in, and offers "Open <section>" while a section other than the one in focus wants something. It carries NO Next button: the way forward is the Next row at the end of each section (UI-32). | Sep 21, Sep 23 |
| UI-27 | ONE SECTION OPEN AT A TIME. Within a stacked step the section in focus is open and every other section folds to its one-line head with its state pill, finished or not. Clicking a folded head opens it alone and makes it the section in focus; clicking the open head folds it; moving to another section opens that one. | Sep 21 |
| UI-28 | FEET AND INCHES, the way the plan view reads them. Every elevation and height a user types or reads — T.O.S. elevation, typical-floor floor-to-floor, the F2F / shore-height readouts, the T.O.S. elevation of an offset area — is feet and inches, accepted in every spelling (25-4 3/8 · 25'-4 3/8" · 25'-4 3/8 · 25-4 3/8" · 25.36 · 304.5" · -4-6, and the ⅛-fractions the app prints) and shown to the eighth of an inch. Stored as decimal feet. Slab thickness, beam width and depth stay in inches. A slab area, beam or on-grade area carries its T.O.S. offset (in) AND the elevation it comes to, side by side: type either and the other follows from the level's T.O.S.; a beam left blank shows the elevation of the slab area it rides on. | Sep 23 |
| UI-29 | FIELDS COMMIT IN PLACE. One click lands in the field that was clicked, even while another field holds an edit; Tab walks the pane in reading order — across the row, then the next row — and never jumps back to the top or out to the plan; Shift+Tab walks back; Escape drops the edit in progress and hands focus to the plan. A pane re-rendered while a field has focus puts focus back on the same field with the caret where it was — and where it was includes an inline properties panel (under an area's row, inside the scan card): a commit never sends the panel back to the foot of the pane; a render asked for while a typed field is committing waits until focus has settled. Icon buttons in a row (×, …, on-grade) are not Tab stops. | Sep 23 |
| UI-30 | REMOVING CORNERS TOUCHES THE SELECTED SHAPE ONLY. Shift+click, the eraser sweep, the box and hover+Delete see the corners of the selected shape and nothing else; with no shape selected they remove nothing and say to select one first. | Sep 23 |
| UI-31 | NOTHING FOLDED. No hand tool, re-reader, importer or switch on any step sits behind a disclosure; each section's tools are a plain captioned row under its primary action. (Replaces the "or do it by hand" details of UI-15.) | Sep 23 |
| UI-32 | THE WAY FORWARD IS AT THE END OF EACH SECTION. Every section ends with one row: its standing (Done / To do and the one-line status) and ONE button — "Next: <section>" inside a stacked step, "Next: <step>" from a step's last section or tab — enabled the moment the section (for a step's last section, the step) is done, disabled with the reason until then. The foot bar keeps the status line only (UI-26). | Sep 23 |
| UI-33 | ONE TABLE SYSTEM. Every list in the pane is a grid on a shared column template (`--cols` on the container; `.tbl-head` and every `.tbl-row` lay out on it): headers sit over their fields, columns are fixed widths, and nothing shifts when a value changes or an option is picked. The Levels list is the first: Level · TOS Elev · Slab Thickness (in) · SOG (a box) · Typical Floor? (a box that opens floors from / to plus shore height OR F2F, either typed) · Sheet (Show: the level's sheet, fitted) · ×. Confirm levels is the green confirm like every other section; Add a level, Read again and Import from Excel share the hand-tools row. The Sheets table is the second: Pg · Title block · Floor · Zone · state, always open (no fold-away head), the title block alone in its cell (what the reader made of the sheet is the row's tooltip), no "+ also serves" picker (a typical range on Levels already makes one sheet serve those floors), "not a floor plan" only as the picker's value, and a row to check carrying its flag and Looks right on one line. | Sep 23 |
| UI-34 | MATCH FLOORS IS ONE LIST. The arrival read puts each proposed fit ON ITS SHEET'S ROW (stats, verdict, off-grid bubbles, the scale question) with Show grid and ONE green Confirm; the primary is "Confirm all N proposed matches". Pressing Confirm writes the fit AND confirms it — nothing is written until then, and nothing asks twice. A hand match still asks for its own Confirm (BLD-07). A re-read of a matched sheet shows on the row only when it would move the sheet (¼" or more), as "Use the re-read". The separate "Proposed matches" panel with tick boxes, Apply and Tick all readable is gone. | Sep 23 |
| UI-35 | THE FLOOR EDGE IS A QUEUE. The arrival sweep reads every plan sheet and WRITES NOTHING; the sheets are then walked from the BOTTOM floor up — and the rows are listed in that same order, bottom floor at the top of the list — each opened on screen fitted to the window with its read outline in bright cyan and ONE bar over the plan: Confirm (writes the edge, confirmed; Enter, or a click on the outline) · Adjust (writes it unconfirmed, selects it, the corner tools — Simplify slider, Clean corners, Remove corner — open on its row; Done confirms; A) · Try the next outline (the detector's runner-ups, no re-read; T) · Draw by hand (closing the shape lands in Adjust) · Skip (N; "Keep current" on a re-read of a matched sheet). Escape closes the walk and leaves the reads on their rows with Review; the primary reopens it ("Review N reads from the bottom floor up"), and "Confirm all N good reads" takes the good ones in bulk. Detect again comes as "on this sheet" and "on every sheet", each walking what it read. Gone: Pick from the sheet / Pick again, the separate Clean corners button, the on-grade column (the Levels SOG box has it), the arrival split that wrote confident outlines unasked. | Sep 23 |
| UI-36 | THE GRID SHOWS ITSELF ON MATCH FLOORS. Opening a sheet on the Match step — by its row, by paging to it, on arrival, or the moment the arrival read finishes — draws what the app has for it with no button pressed: a written fit's grid and crossings, or the fit the read PROPOSED and is waiting for a Confirm on. Only a sheet with neither is asked for two crossings, and only by its own Match by hand button — never by clicking its row. | Sep 24 |
| UI-37 | "DO THE FLOORS LINE UP?" LIVES UNDER MATCH FLOORS on the Building step, as a plain open block (no fold-away head). The ghost is ON by default and draws BOTH neighbours over the sheet on screen — the floor below in blue (long dashes), the floor above in orange (short dashes), each labelled — with one box to switch it off. (Moved from the Areas step, where it was a collapsible head.) | Sep 24 |
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
| BLD-14 | THE BUILDING STEP IS GEOMETRY ONLY: names, elevations, slab thickness, sheets, floor edge, match. The Levels row carries nothing about loads — no capacity cell, no link, no PSF in its worked-out line. Loads are assigned and confirmed on the Loads step, where the typical capacity has its one home (LOD-08). | Sep 21 |

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
| The stacking check as a collapsible head on the Areas step, ghost off until asked | UI-37 | Sep 24 |
| The arrival sweep writing confident outlines unasked; Pick from the sheet / Pick again on the edge rows; a separate Clean corners button; the on-grade tick on the edge rows; Use this / Use all N read | UI-35 | Sep 23 |
| The "Proposed matches" panel (tick boxes · Apply N matches · Tick all readable · Close) above the sheet rows on Match floors | UI-34 | Sep 23 |
| "+ also serves…" on a Sheets row; the sheet kind and "reads as" written under the title block; the fold-away "Sheets in this set" head | UI-33 | Sep 23 |
| Levels row controls as icon buttons (▰ on grade, … range) with headers positioned by measuring the fields | UI-33 | Sep 23 |
| Shift+click / sweep / box / Delete removing corners of any shape on the sheet | UI-30 | Sep 23 |
| Re-readers and hand tools behind an "or do it by hand" `<details>` disclosure, remembered per section (UI-15 as first written) | UI-31 | Sep 23 |
| The Next / Go to button on the foot bar; Tab past the last property field returning to the plan | UI-32, UI-29 | Sep 23 |
| Elevations typed and shown as decimal feet (112.50) | UI-28 | Sep 23 |
| Region names as grid bays plus carrying mark (1-6 / A-D B2) | RGN-07 | Sep 17 |
| Whole-level slab-on-grade needs no sheet match | MDL-02 | Sep 15 |
| Areas list grouped by sheet zone name, sheet on screen first | ARE-03 | Sep 17 |
| A Slab edge tolerance project setting (default 2 ft) | MDL-11 | Sep 18 |
| Sliver merge across marks where capacity differed | RGN-01, RGN-03 | Sep 15 |
| Seven steps in the rail | BLD-01 | Sep 15 |
| One-shot sheet review panel, edge column on the Sheets step | BLD-04 | Sep 17 |
| Orange selected-region highlight | RES-06 | Sep 8 |
| Green selected-region highlight with marching ants | RES-10 | Sep 21 |
| Auto-trace button and review panel on the Loads step | ARE-12 | Sep 21 |
| The typical capacity shown read-only on the Levels row | BLD-14 | Sep 21 |
| Unfinished sections of a stacked step all open at once | UI-27 | Sep 21 |
| "Start a combined chart / Start split schedules" asked cold on an empty Loads step | LOD-01 | Sep 21 |
| Typical capacity editable on the Levels row, the level modal and the Areas typical row | LOD-08 | Sep 21 |
| RVT-04: the job's drawing set is a rendered plan sheet per level | RVT-09 | Sep 21 |
| The level modal (double-click a level / …) | UI-19 | Sep 21 |
| The Results modal (Schedule button) and gotoStep | BLD-01 | Sep 21 |
| Detect the floor edge / Auto detect as buttons the user must press first | UI-16, UI-17 | Sep 21 |
| The detected floor edge shown as one outline, accepted or cancelled in the left pane only | UI-20, UI-21 | Sep 21 |
| A separate floor-edge review panel listing the same sheets as the rows above it (tick, Apply, Tick all readable) | UI-22 | Sep 21 |

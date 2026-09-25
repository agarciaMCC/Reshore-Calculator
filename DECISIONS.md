# Decisions of Record — McClone Reshore Calculator

What the calculator must do. Canonical, versioned with the code; the project doc `claude/reshore-decisions-of-record.md` explains the system.

- Rule IDs are stable, never reused or renumbered. Retire a rule to Superseded; never delete it.
- Each test names its rules in a `// @rules` header. `node tests/rules.mjs` lists untested rules (the regression backlog) and unknown IDs.
- Change a rule here in the same commit as its code and test, never in code alone. Commit messages name the IDs touched.

---

## MDL — Model and solver semantics

| ID | Rule | Decided |
|---|---|---|
| MDL-01 | McClone sequence, not ACI: slab loading conditions, capacities, floor-to-ceiling heights, resultant load per floor, then a shore picked by height and capacity, which sets the field grid spacing. | project |
| MDL-02 | Every level is matched to a sheet, even a whole-level SOG with nothing drawn: reshoring stands on it. | Sep 15 |
| MDL-03 | Slab on grade (SOG) absorbs everything and needs no capacity; it is a whole-level flag or a per-area shape. Whole-level SOG is the bottom of the job; a partial SOG area allows floors below and the cascade continues outside it. | Sep |
| MDL-04 | A missing grade level keeps the unresolved warning with a hint; never required, never assumed. | Sep |
| MDL-05 | Overlapping loading areas act as cutouts: the smallest area covering a point governs, not highest capacity or draw order. | Sep 8 |
| MDL-06 | Live load marked reducible at columns is not reduced for the slab (the reduction is taken in the columns). | Sep 9 |
| MDL-07 | Reshoring under a floor goes in once for every placement loading it: the tightest pattern governs, and shores are not rearranged between pours. A small area needing tighter spacing governs only its own footprint. | Sep 10 |
| MDL-08 | Reshoring at a level can be stripped once none is needed there: after the level above has had its falsework stripped following its pour. State both halves; name the falsework event. | Sep 10 |
| MDL-09 | Only LATER pours govern. A later placement's tighter pattern is a warning beside this answer in Results and Sequence, never folded in; silent until both have a shore chosen. | Sep 18 |
| MDL-10 | A shore spanning an open floor runs on to the next floor with slab, flagged on row, chip and plan with a per-row OK saved to the job. An opening is NOT a shaft continuing upward. | Sep 18 |
| MDL-11 | An overhang of 3 ft or less past the floor below bears on it; wider reads as no slab and the shore spans through, flagged. No slab-edge-tolerance setting. | Sep 18 |
| MDL-12 | The pour's own loading areas lapping past its edge are not poured; 0.5 ft of drafting slop counts as poured. | Sep 18 |
| MDL-13 | Slab and on-grade areas always count toward the poured extent (noted when they add area); openings punch out; beams alone add nothing. On floors below, the floor edge governs. | Sep 10 |
| MDL-14 | The topmost floor needs no capacity and gets no nag. | Sep 9 |
| MDL-16 | The Floor edge step carries the SOG tick: the bottom floor arrives ticked (assumed); any row can be ticked or cleared by hand, and a hand-cleared row is never re-proposed on that job. A floor on grade is asked no capacity. | Sep 21 |
| MDL-15 | The floor edge has no capacity (the level default applies per sample point). With no loading areas drawn, it is the pour's extent. | Sep 9 |
| MDL-17 | A ramp has HIGH and LOW tops, so its shore height is a range: the tallest (high point over the floor below's low point) governs the pick, the shortest is checked against the shore's closed length. Flat areas give one value, so slope-unaware code is unchanged. | Sep 22 |
| MDL-18 | A STIFF shore on SOG needs a wood pad: load-sharing needs slabs to deflect together, which wood (Ellis) shores allow and steel or aluminum do not, so a stiff chain to grade leaves the bottom shores carrying the full stack. Anything not ticked Wood in the catalog is stiff. Where its base is on grade (whole-level or drawn SOG; slab and beam rows), "wood pad under every base — two layers of 3/4" plywood (1-1/2" min), 12"×12" or larger" shows on row, chip, install summary and print: a field condition, no OK dismisses it, numbers unchanged. | Sep 22 |
| MDL-19 | MINIMUM 2 LEVELS OF RESHORE (slabs; beams keep their own chain): where only the first level below needs shores, the floor that absorbs the load gets a second level anyway, at the loosest pattern (10×10) with any shore that reaches its height, marked "minimum 2 levels of reshore required" on that row (card, table, diagram, print) and nowhere else. Not added where the floor under the first level is on grade or where nothing below the absorbing floor can be stood on. It is a real row: it needs a pick, counts as a reshore level, goes in the install plan and Sequence, and takes the MDL-18 pad on grade. A region's key (and name) reaches as deep as shores go: a floor that absorbs the load with no shores under it ends the key, so what lies below it never splits a region; a second level adds the floor it stands on ("– L1 SOG"). | Sep 25 |
| MDL-20 | INCLUDE OR OMIT A HIGHER-CAPACITY AREA: only a loading area whose capacity is ABOVE its floor's typical may be left out of Results (the typical is then used there — always conservative); an area at or below the typical always counts. An area counts until omitted; the choice is the area's (`omit` on the zone), for every pour that loads it, and it is an input (the results key changes). Results lists these areas in one card ("Areas above the typical capacity") with what including each one saves as a shore count per floor — the tightest pour governs a floor, since its reshoring goes in once — worked out point by point with the area put back or left out (`solve.whatIf`), not by solving the job again. Omitting is recommended only when it changes nothing; where leaving it out would leave load unabsorbed within the stack the row says it is needed. An omitted area stays drawn (faded, dashed), is marked "omitted from Results" on the Areas list and tag, and the print names it. | Sep 25 |

## RGN — Regions, merging and naming

| ID | Rule | Decided |
|---|---|---|
| RGN-01 | Never merge loading conditions: a region with a different mark on a carrying floor is never merged, however small. | Sep 15 |
| RGN-02 | Conditions split by mark: equal PSF over B2, C2, E2 is three conditions with their own rows, SF and patterns. The carrying floor's mark is part of the region signature. | Sep 8 |
| RGN-03 | A region under the minimum size merges into the neighbor sharing most boundary, ONLY on a matching load path (bearing / no-slab / opening / grade). Capacity- or shore-height-only differences still merge. | Sep 10, restored Sep 15 |
| RGN-04 | Hairline wedges under two sample cells (8 SF at a 2 ft step) join a region they TOUCH, without their marks. Anything larger is a condition, never merged. | Sep 15 |
| RGN-11 | Edge slivers (under the minimum size, and under 50 SF or nowhere over two sample steps across) join the neighbor sharing most boundary; THIN ones may cross load paths (two traced outlines disagreeing by inches, not conditions), compact ones only on a match (RGN-03). Marks and cascade stay put: the host keeps its name and calculation and lists what it absorbed. | Sep 21 |
| RGN-05 | Slab and loading layers partition the floor independently, smallest-first. | Sep 15 |
| RGN-06 | Regions and the click highlight paint from exact polygons, not sample cells. | Sep 17 |
| RGN-07 | Region names: slab thickness, then each level below with capacity: `13" Slab - L3 39 PSF - L2 54 PSF - 1B SOG`. Beams prefix width x depth. | Sep 17 |
| RGN-08 | A region is named from its largest piece, not its bounding box. | Sep 15 |
| RGN-09 | The schedule lists the largest area first. | Sep 8 |
| RGN-10 | Regions with identical answers share one row. | Sep 15 |

## BEM — Beams

| ID | Rule | Decided |
|---|---|---|
| BEM-01 | Beams are their own line items, apart from the slab grid, with a per-row effective width for the slab credit. | Sep |
| BEM-02 | Beams carry a T.O.S. offset. | Sep |
| BEM-03 | A beam is an overlay cut along the slab pieces, so its stem follows the slab it sits in. Items combine per region AND stem. | Sep 18 |
| BEM-04 | A beam is read along its centerline; an offset beam whose centerline is over slab reads the slab. Where 2+ shores per cluster sit over a narrower beam below, WARN; never widen the reading. | Sep 18 |
| BEM-05 | Beam rows are the reshores on floors below the pour, not the posts under the beam. | Sep 17 |
| BEM-06 | Beams share a row when width x depth, stem, PLF, slab region key and all carrying-floor conditions agree; heights cluster within 1 in, row shows the tallest. Shore pick, effective width and shores-per-cluster apply to all. A broken-out member stays out until regrouped. | Sep 18 |
| BEM-07 | Anything named BM or BEAM is a beam, whatever its category. Auto-detect ignores columns. | Sep 15, Sep 18 |
| BEM-08 | Auto-detected beams are all proposed, none ticked, sized from the nearby BM label, uncertain matches flagged. | Sep 15 |
| BEM-09 | A BEAM'S STEM IS WHAT HANGS BELOW THE SLAB: the union of beam depth (from its top) and slab thickness (from the slab top), minus the slab. Flush: depth − slab; topped lower, it adds the concrete under the soffit (20" beam 6" down under a 9" slab: 17", not 11"). The shore meets the lowest concrete. Pieces with different stems are separate items (BEM-03). | Sep 24 |

## EDG — Floor edge

| ID | Rule | Decided |
|---|---|---|
| EDG-01 | Edge vertices land on drafted endpoints (curves aside); one drafted corner is ONE vertex; smallest real step 3 in. Applies to Detect floor edge, auto-traced slab/loading areas and Clean corners. | Sep 15 |
| EDG-02 | A rebuild changing area over 2% (6% on the on-demand button) or dropping below a triangle is refused; the traced outline stays and the reason is reported. | Sep 15 |
| EDG-03 | Curves survive: the detector keeps them, Simplify must not flatten them, chords stay within 1/4 in of the arc. | Sep 9 |
| EDG-04 | The floor edge is its LINE only, no invisible fill: picked on the line or a corner; clicks inside fall through to what is drawn there. Whole-level SOG keeps its visible hatch. | Sep 16 |
| EDG-05 | Auto-detect offers the top few candidates, not one guess, and never returns the key plan or follows wall lines. | Sep 17 |
| EDG-06 | Dimension strings and section/detail markers are erased from the raster before tracing; the as-drawn outline is the fallback. | Sep 17 |
| EDG-07 | The edge is confirmed FIRST; beam, opening and thickened-slab detection then look only inside it. | Sep 17 |
| EDG-08 | An edge edit after the Building step counts as confirmed; on the Building step it reopens the review; a hand-drawn edge on a later step is created confirmed. | Sep 18 |
| EDG-09 | Learned from the owner's edges: they run straight past column bumps, cut X-marked openings along their outline, and are closed by hand where the drawing is open. | Sep 17 |

## BLD — Building step: levels, sheets, match

| ID | Rule | Decided |
|---|---|---|
| BLD-01 | Four groups (Building / Loads / Areas / Results; Sequence a tab in Results) as sections stacked in one panel. Building: Levels, Sheets, Edge, Match. | Sep 15, Sep 17 |
| BLD-02 | Levels are read from the drawings on load (T.O.S., slab thickness, clear height), names normalized from sheet titles. Confirm levels gates Sheets. | Sep 9, Sep 17 |
| BLD-03 | A plan sheet with no elevation callouts is still proposed: name and page, elevation blank, on-grade flagged. | Sep 9 |
| BLD-04 | One always-present sheet table, a row per page: level picker, zone box, and "not a floor plan" as a CHOICE, never a silent verdict. Never filtered. A sheet titled as a plan is one; zone comes from the title block. | Sep 17 |
| BLD-05 | A sheet assigned to a floor that has one is ADDED as a second sheet, never a replacement. Each area belongs to the sheet it was drawn or detected on. | Sep 16 |
| BLD-06 | Where a floor has several plans, the soffit plan is bound. | Sep 9 |
| BLD-07 | Matching auto-pairs by level and zone against the sheet below, then reviews. Confirm and Clear per sheet; no clear-all, never clearing the project grid. New points work whether or not they match a previous floor. | Sep 10, Sep 17 |
| BLD-08 | Each match adds its sheet's other gridlines to the project grid. Where a sheet disagrees, THE PROJECT GRID STANDS and the drift is reported, never averaged. | Sep 17 |
| BLD-09 | A reissued set is re-mapped sheet by sheet by title block, reviewed before page numbers change. A moved sheet keeps its grid match, flagged. Levels are kept; changes are shown. | Sep 17 |
| BLD-10 | Sheet scale comes from plan views, not detail notes. One-click Rescale. | Sep 17 |
| BLD-11 | A level may hold several sheets as named zones, one per sheet, the grid continuous across them. Zones are names only for now. | Sep 10, Sep 17 |
| BLD-15 | A title strip stating the floor once ("T.O.S. 9'-3" · typical slab 5" · SLAB ON GRADE") is a SEPARATE channel from T/SLAB - B/SLAB callouts: it only fills their blanks, never overrides them or feeds the plan-vs-section test. One figure per sheet or none; per-bay T.O.S. is the callouts' job. | Sep 22 |
| BLD-16 | A title names its level in FULL: "LEVEL MECH ROOF FLOOR PLAN" is MECH ROOF, not Roof. "LEVEL &lt;name&gt; … PLAN" beats the ROOF / PENTHOUSE / MEZZANINE shortcuts (for titles like "ROOF PLAN"); the name stops at the words naming the plan kind. | Sep 22 |
| BLD-17 | Number and letter bubbles are banded SEPARATELY: banded together, one diagonal letter bubble in a number row on an angled plan got the mixed band discarded whole (four of ten Kalae podium sheets read zero column bubbles). | Sep 22 |
| BLD-18 | A load-map or schedule sheet is never a floor plan: level reading skips it, so it creates and binds no level (Horizon House's load maps had become levels B7, 22-28, 33). | Sep 23 |
| BLD-19 | The plan scale is the job's: read from every plan note (checked by the dimension chain), provisional until CONFIRMED once (its Match floors card, or confirming a match at it). All matches hold it; the fit finds only position (rotation snaps square within 0.25°; up to 0.5% plotter stretch). A sheet noting another scale is tried at both, keeps the one its bubbles agree with, asks once. Older jobs take it from user-confirmed matches. | Sep 23 |
| BLD-20 | Key-plan bubbles never place a floor: a band under a third of its axis's longest only speaks for known labels; a bubble the locked fit rejects is named on the row with its miss; a short band adds no grid line. If the grid disagrees with 2+ of a sheet's lines by over 1 ft, or sheets were matched off the locked scale, Match floors says the grid does not hold together and offers Rebuild the grid (clear grid and matches, reread all at job scale; areas keep sheet pixels). | Sep 23 |
| BLD-21 | A bubble moved off its neighbor on an elbowed leader (Horizon House 2.7, 2'-3" off 2.6) is followed to the dash-dot line it names; the line's position is the reading. A bubble with a gridline through its center reads at its center. | Sep 23 |
| BLD-22 | THE ELEVATION TAG: a plan's T.O.S. as a bare elevation (197'-4") in a rounded box with a leader to a dot, no T/SLAB, no strip (common on SOG and foundation plans). A third channel, read only if callouts and title strip found nothing: a horizontal text item that is exactly an elevation, dark linework close on all four sides, nothing else inside (a dimension string has its line on one side only). The sheet takes the mode of its tags (review: "n of total elevation tags"). | Sep 23 |

## LOD — Loads

| ID | Rule | Decided |
|---|---|---|
| LOD-01 | Loads come from a schedule table, loading diagrams (key plan per level per load type) or manual/Excel entry. Drawings are scanned first; with no schedule found, the chart STARTS ITSELF as one combined chart with a blank row and says so. Split LL + SDL is under "by hand" while empty; a chosen shape stands. The blank row is a placeholder replaced by an import or re-scan with real marks. | Sep 9, Sep 14, Sep 21 |
| LOD-02 | Values read off loading diagrams go into Loads ONLY: not pinned, not auto-traced. | Sep 9 |
| LOD-03 | Excel import reads the chart as written (Designation, SDL psf, LL psf, TOTAL CAPACITY psf; * = reducible LL), with a blank template download and a review before writing. | Sep 14 |
| LOD-04 | A re-scan keeps hand-entered marks and flags where the drawings disagree. | Sep 14 |
| LOD-05 | Verifying a mark stays on Loads and highlights the source schedule row; never jumps steps. | Sep 15 |
| LOD-06 | Each level's typical mark is auto-picked as the one covering the largest traced area (trace: ARE-12). | Sep 15 |
| LOD-08 | Typical capacity per floor has ONE home: Loads, with the marks. The Areas typical row shows it read-only with a link; Levels does not show it (BLD-14). | Sep 21 |
| LOD-09 | Results needs a schedule it can price: a chart with no numbers does not open Results. | Sep 21 |
| LOD-10 | Typical capacity is its own card on Loads, state in its head (all N set / N to confirm / N still to set), amber while incomplete. Loads is done only when every carrying floor has one and none is left assumed; rail and Next show the same count. | Sep 21 |
| LOD-07 | The all-floors pass reads every load-map sheet at once: plans filed under the floor their title names (level and zone pickers), one review by floor, traced areas landing on the zone sheet they fall in. It is the fallback behind "or do it by hand" on Loading (ARE-12). | Sep 17 |
| LOD-11 | Every page-keyed cache (vector strokes, painted shapes, rasters, X-marks, traced load maps, "ready" flag) belongs to ONE drawing set and clears on a set load or job reset. The trace-results cache is also keyed on schedule, page count and project grid, so a pre-match fit is redone, never served stale. | Sep 22 |
| LOD-12 | A tag is inside a painted area only where the shape paints (even-odd): a tag in a hole (ring-shaped corridor, cut-out) belongs to what is drawn in the hole. An "area" (vs a tag square) is at least 3,000 image px². | Sep 22 |
| LOD-13 | On a load-map sheet, a view titled with the floor alone ("LEVEL B7", "11 LEVEL B5", "LEVEL 22-28", "ROOF") is that floor's map. A basement-letter token is only its own level: B1 is never level 1. | Sep 23 |
| LOD-14 | Split schedules read as drawn: description = nearest DESCRIPTION / TYPE / USE / AREA column right of MARK; value = TOTAL column if any; a centered description starting left of the split is description (mark = leftmost token); a stacked table ends at the next MARK header; trailing words on a value ("50 (R) + 15 PARTITION") become a comment. | Sep 23 |
| LOD-15 | Load-map tracing: a two-cell tag (letter, number) is one tag; a boxed tag with no leader floods around its box; if the heavy pen is scarce, the next pen down (1.3-3.3 px) is the outline; side-by-side maps fit from their own run of a shared bubble row; tags flooding one region give it to the deepest, code to confirm, others reported. | Sep 23 |

## ARE — Areas step and markup

| ID | Rule | Decided |
|---|---|---|
| ARE-01 | Slab is the first tab, Loading the second. | Sep 15 |
| ARE-02 | Openings and SOG are handled on the Areas tab only. | Sep 15 |
| ARE-03 | The Areas pane shows only items on the sheet on screen. | Sep 17 |
| ARE-04 | Clicking a list area expands its properties inline under the row, not at the pane bottom. | Sep 17 |
| ARE-05 | Shapes are named from their values unless labeled; the list groups by type. | Sep 8 |
| ARE-06 | Each layer's Draw button arms the tool, which stays armed until Escape. | Sep 8 |
| ARE-07 | Slab draw asks for kind (edge / slab / beam / opening); SOG is a Type under slab. | Sep 8 |
| ARE-08 | The typical loading area is a hatched, labeled fill BOUNDED BY THE FLOOR EDGE (drawn, not a shape to keep in sync), drawn areas punched out as exceptions, muted where there is no capacity yet; its Typical capacity row edits the level default. | Sep 9 |
| ARE-09 | A traced pocket much smaller than its enclosure is FLAGGED, not guessed. | Sep 15 |
| ARE-10 | A load-map-traced loading area crossing a floor edge that appears in several zones splits into one piece per zone sheet, cut along each sheet's edge. | Sep 17 |
| ARE-11 | THE SCAN IS A REVIEW QUEUE. The sheet on screen is read first and reviewed at once; other sheets are read behind it into the queue, progress in the head. One candidate at a time, zoomed and glowing, BY TYPE (beams, thickened slabs, openings) then floor. Accept writes it; Accept & adjust writes it and opens its PROPERTIES IN THE CARD, corners live, with "Done — next candidate" (a bare Next was mistaken for Next: Results); Skip writes nothing; Accept all remaining <type> takes the rest (sized beams only). Keys Enter / A / N. The tick list stays one click away, writing only what is ticked (BEM-08). Leaving Areas PAUSES the review; returning resumes it. | Sep 21 |
| ARE-12 | THE TRACE LIVES ON THE LOADING TAB (beam scan on Slab); "Detect again" is slab-only, hidden there. Arriving reads load maps in the background (cached per schedule) and offers a card ("12 loading areas read from L3's load map — Review"); nothing moves until Review, which opens THIS FLOOR's load map and walks its areas one at a time in the beam queue (Accept / Accept & adjust / Skip / Accept all; Enter, A, N) with the plan's floor, zone and grid match above. "Add N loading areas & back" writes them and returns to the starting sheet, Loading layer up; Cancel returns without writing. | Sep 21 |
| ARE-13 | THE SOG AREA COMES FROM THE FLOOR EDGE. A floor ticked SOG gets a "Slab on grade" area matching its edge on each sheet once the edge is confirmed (or on ticking, if already confirmed); never hand-drawn. Untouched, it follows the edge (whole-level SOG). Adjusted (corners moved, removed, added, simplified), it is the user's and the floor is PARTLY on grade: soil inside, suspended outside with the cascade continuing; Levels says "in part". Unticking removes an untouched area, keeps an adjusted one. A sheet with a hand-drawn on-grade area gets none. | Sep 24 |
| ARE-14 | THE DRAWING BAR. Drawing an area (either layer) opens one fixed-size bar over the plan, not a "which kind?" menu: Type (Slab, Slab on grade, Opening, Beam, Floor edge; S G O B E); Mode (Rectangle, Polygon, Centerline, Fill; R P L F); values (Thick · T.O.S. · Offset, the floor's typical T.O.S. just before the "at typical" readout; beam Size and Top: Inherit / Set); snaps, Clip to floor edge, Ortho; a hint line; Done / Esc top right. On Loading, Type is the mark (or LL + SDL) with PSF. Stays armed; starts on the last type. Snaps add ⊥ (perpendicular foot from the last point to a line or edge), below corners, above the rest. Ortho is one setting (F8, toolbar box, bar chip) for corners, centerline segments and split lines; Shift flips it while held. The toolbar polygon (P) stays plain and focuses the first field on close (UI-28); from the bar, the plan keeps focus. | Sep 24 |
| ARE-15 | RECTANGLES AND CENTERLINES. A rectangle is two clicks, square to the sheet. A beam centerline is a polyline (double-click, Enter or click the last point to finish) at beam width with beveled joints, sized from the nearest BM label within 10 ft of any segment, else the bar's size (or 12 × slab+12), flagged in the checks. Rectangles edit like polygons. | Sep 24 |
| ARE-16 | A new shape is CLIPPED TO ITS SHEET'S FLOOR EDGE (Clip chip, on by default) with a note of what was trimmed; a shape wholly outside is kept and flagged. | Sep 24 |
| ARE-17 | THE GAPS NOBODY MEANT. On closing a shape or dropping a corner, gaps and laps UNDER 3 IN to neighbors (and the floor edge) close: its corners snap to the neighbor outline, neighbor corners on its edges are shared, thin laps are trimmed off it, a thin hole among shapes goes to the neighbor sharing most edge. Beams exempt (they sit in slabs on purpose). A note says what moved; Ctrl+Z undoes just the clean-up. 3 in or more is left to the checks (ARE-25). | Sep 24 |
| ARE-18 | ELEVATIONS. T.O.S. and offset are one value shown two ways. A beam's top inherits from the smallest overlapping slab; a beam crossing slabs at different elevations must be verified, the checks offering each elevation as a button. | Sep 24 |
| ARE-19 | THE SHEET'S OWN NOTES. A slab drawn around "T/SLAB = 119'-10"" (or T/SLAB:) takes that T.O.S.; around '7" PT SLAB' / '12" THICKENED SLAB', that thickness; conflicting notes keep the bar's values, noted. A paste the sheet disagrees with keeps its values, flagged. | Sep 24 |
| ARE-20 | COLOR BY PROPERTIES, HATCH BY ELEVATION, per floor. Each type has a color family (first shade = its Settings color); each new value set (thickness; beam size) takes the next shade; same values at another elevation share the color plus a hatch. Assignments stay with the floor, never reshuffle or reuse a hand-picked shade. Picking a color or hatch asks "Apply to all N × …?" (All / Just this one / Cancel); just-this-one holds until reset, marked •. The list is the legend, grouped by color. Style is not a calculation input. | Sep 24 |
| ARE-21 | TAGS at the sheet's text height (zooming like printed notes), inside their outline, clear of its contents, shrinking or shortening rather than spilling; beam tags run along the beam with size and top (T.O.B.). | Sep 24 |
| ARE-22 | COVERED AREAS STAY REACHABLE: a click picks the smallest area under the cursor; clicking again in place walks down the stack ("2 of 3 · …"). Short on-screen edges have no midpoint handle, so the click goes to the shape. | Sep 24 |
| ARE-23 | MANY AT ONCE. Shift+click (plan or list) toggles one; Ctrl+drag left-to-right takes what is fully inside, right-to-left what it touches; Ctrl+A the sheet. The panel edits them together (blank where they differ) with Merge (M; touching, same values), Copy, Delete. K splits the selected area on a two-click line (Ortho applies); pieces keep the values. | Sep 24 |
| ARE-24 | COPY / PASTE ON A BASE POINT. Ctrl+C copies; Ctrl+V shows a ghost held at its lower-left main corner (Tab cycles), snapping like a corner; each click places one until Esc. Values kept; beams re-inherit their top; pastes clip to the floor edge; a slab on a disagreeing sheet T/SLAB is flagged. | Sep 24 |
| ARE-25 | THE CHECKS atop the list ("Ready for Results" / "N to look at"): partial overlaps of different conditions (full containment is intended; OK keeps both), beams to verify, beam sizes not from a label, slabs the sheet disagrees with, and on Loading, floor no mark covers (only without a typical capacity). Gaps and overlaps are tinted; clicking a check zooms to it. | Sep 24 |
| ARE-26 | LIGHT / DARK toolbar toggle (remembered; follows the system until chosen). The sheet stays white and markup looks the same in both. User-visible text uses American spelling. | Sep 24 |
| ARE-27 | Markup is LOCKED on Results and Sequence: no selecting, dragging, corner erasing, deleting or arming drawing tools. Pan, zoom, paging and region clicks still work; a locked badge stays up. | Sep 10, Sep 15 |
| ARE-28 | THE SCAN REVIEW WALKS FLOOR BY FLOOR, BOTTOM UP (refines ARE-11): sheets are read bottom floor first; the queue holds ONE floor at a time (a floor on several sheets is one step; a floor with nothing found is passed over), by type within it (beams, thickened slabs, openings; largest first); "Accept all" takes the rest of that type on THIS floor. The candidate under review shows its grip points (every corner) so a stray corner is seen before Accept or Accept & adjust. When a floor is done the review stops on a card — "L3 reviewed · 3 accepted (1 adjusted) · 1 skipped" — with "Next: L4 — N to review" (Enter), Back to the last one skipped there, and Stop here; it never moves on by itself. The head says "floor 2 of 5". | Sep 25 |

## RES — Results

| ID | Rule | Decided |
|---|---|---|
| RES-01 | Plan left, schedule right, both always visible; an install summary per floor on top. Bulk apply: pick a shore once, apply to every row it fits. THE APP NEVER PRE-SELECTS A SHORE. | Sep 10 |
| RES-02 | Floor tabs, plan colored by required spacing, one-line region cards, and a Next through rows still needing a shore. | Sep 18 |
| RES-03 | The "pick a shore" chip stands out from the other chips. | Sep 18 |
| RES-04 | On a floor split across zones, results split by zone. | Sep 17 |
| RES-05 | Clicking a result shows only the relevant areas. The pour floor's own loading areas are hidden; the reshore-under floors' show, with the pour region overlaid. | Sep 9 |
| RES-06 | The selected-region highlight ignores which Areas layer was last on; the selected slab area shows over the carrying floor's loading area. (Look: RES-10.) | Sep 8, Sep 9 |
| RES-07 | "Nothing to shore against" is a count in the summary head and a reason on region rows, not a block of its own. | Sep 17 |
| RES-08 | A shore-height alert names floor, region and height and clicks onto the plan. No taller-shore suggestion, catalog link or permanent warning hatch. | Sep 10 |
| RES-09 | Region titles carry no pour-slab loading mark; each reshore row carries the CARRYING floor's mark. | Sep |
| RES-10 | The selected region is a TEAL GLOW on its outline with a light tint inside, no dashes or animation, so the drawing under the edge stays readable; other regions step back. The same teal marks the lit schedule row. | Sep 21 |
| RES-11 | RESULTS READ TOP-DOWN LIKE A FIELD SHEET: one context row (pour · area · print); real warnings visible, explanations folded into "Notes & assumptions"; opens on the pour's sheet; tabs "All floors / Under 3", chips "under 3" (a floor named 3 must not read as a count); install row leads with floor and pattern at title size; "Next pick" is the one primary button. | Sep 21 |
| RES-12 | A beam row lights only the part of the beam it covers, as the solver cut it (a beam over two conditions is two rows); a group row lights every member's piece. | Sep 24 |
| RES-13 | Print refuses results that no longer match the inputs. | Sep 15 |
| RES-14 | Results needs a drawing set: with none loaded the Results gate blocks the solve, whatever else is entered by hand. Test fixtures without a PDF use a stand-in sheet. | Sep 24 |
| RES-15 | EVERY RESULTS TITLE LEADS WITH THE POUR: region and beam cards, the no-shore alert and the print legend and headings read "Roof · 9" Slab – L3 138 PSF – L2 138 PSF (B2)" (the pour in its own pill on screen; a floor named 3 reads L3). NO GRID RANGE IN A TITLE: two patches of one condition are told apart by the shore height where it differs ("· 13'-1" under L3"), then by what else differs, then by a number; the bays stay in the row's small print. Plan labels and keys are unchanged. | Sep 25 |
| RES-16 | NUMBERS ON THE RESULTS PLAN: regions are numbered 1, 2, 3 … in schedule order and beams B1, B2 …; the number leads the title ("1 Roof · 9" Slab – …") and is the ONLY thing written on the Results plan (no load-path names, the selected region included; its tag lights teal instead). Tags follow ARE-21: inside their own polygon, clear of its holes, shrinking before they spill, never under ~15 px on screen; a region of several separate pieces gets its number on every piece; beams take theirs along the beam; a piece too small is found by color and click. On a floor's tab the tag carries the pattern ("1 · 8×8"). Print snippets carry the number. | Sep 25 |

## PRT — The printed sheet

| ID | Rule | Decided |
|---|---|---|
| PRT-01 | THE PRINT SHOWS WHERE: each region and beam row carries a crop of its sheet, region glowing (RES-10), floor below ghosted; each reshored floor gets a page after the install table, its plan shaded by required spacing, with legend. Snippets render after the print document opens; it prints once they are in. | Sep 21 |

## SEQ — Sequence

| ID | Rule | Decided |
|---|---|---|
| SEQ-01 | The strip column states both halves of MDL-08, names the falsework event, counts in placements not dates, and adds a per-floor block. | Sep 10 |
| SEQ-02 | Areas needing the pattern tightened click onto the plan. | Sep 17 |

## JOB — Job lifecycle

| ID | Rule | Decided |
|---|---|---|
| JOB-01 | Real step gates with Next; one route to any given result. | Sep 15 |
| JOB-02 | New job returns to upload behind a confirm naming what goes, with Save job inside. Project settings and hand-added shores carry over. | Sep 9 |
| JOB-03 | Sharing is a private claude.ai artifact link, Save job and Print adapted for the sandbox; the local file keeps normal download and popup behavior. | Sep 9 |

## UI — Interaction

| ID | Rule | Decided |
|---|---|---|
| UI-01 | Escape backs out of any command, everywhere. | Sep |
| UI-02 | Shift+click removes a vertex of the SELECTED shape only (UI-30). While drawing, right-click, Backspace or Ctrl+Z undoes the last point; with none placed, Ctrl+Z is normal undo; Ctrl+Shift+Z / Ctrl+Y redo. | Sep, Sep 17, Sep 23, Sep 24 |
| UI-03 | Corners go by Shift+drag eraser, Shift+Alt+drag box or hover+Delete, SELECTED shape only (UI-30), plus a Simplify slider with live corner count that must not flatten curves. | Sep 9, Sep 23 |
| UI-04 | Ortho is one setting, off by default: toolbar toggle, F8 or the drawing bar chip (ARE-14); Shift flips it while held. It locks perpendicular on drawn lines AND on alignment to other vertices, with a dashed blue tracking line. | Sep 8, Sep 24 |
| UI-05 | Closing a polygon focuses the properties panel; Enter/Tab advance fields. Tab never leaves the pane; Escape returns to the plan (UI-29). | Sep, Sep 23 |
| UI-06 | Moving an area: select, then drag. Snaps on the corner nearest the grab; a toast says what moved and how far; Shift mid-drag keeps it square. | Sep 9 |
| UI-07 | The menu is Settings (not Advanced), closing only on Escape or an outside click. Solver settings have plain explanations. | Sep 8 |
| UI-08 | Step descriptions live behind a ? help icon. | Sep 8 |
| UI-09 | Markups copy between floors via a copy-from picker. | Sep |
| UI-10 | The slab kind is called Slab, not Step. | Sep |
| UI-11 | The ghost of the floor below (and above, UI-37) joins the North and South floor edges into ONE floor, beside a stacking-check panel. | Sep 17, Sep 24 |
| UI-12 | The stacking warning clears where an on-grade area is drawn; its row OK is remembered on the job until the overshoot grows. | Sep 17 |
| UI-13 | On Levels, headers sit over their fields (UI-33 grid, no measuring); the F2F and shore-height line is bold and readable. | Sep 17, Sep 23 |
| UI-15 | Each section has ONE primary action on top (Confirm levels · All N flagged look right · Confirm all N drawn · Confirm all N matched · Confirm all N marks · Add the proposed shapes); re-readers and hand tools share ONE captioned row under it, always visible (UI-31). | Sep 21, Sep 23 |
| UI-16 | Floor edge reads itself on arrival: all plan sheets are swept, reads walked one sheet at a time in the plan bar (UI-35), nothing written until confirmed. Once per sheet set; Detect again re-runs. | Sep 21, Sep 23 |
| UI-17 | Areas reads itself on arrival: sheets with a confirmed edge and nothing read yet are scanned for beams and openings, the proposal opening (none ticked, BEM-08). Remembered per sheet on the job, so old jobs are not rescanned. | Sep 21 |
| UI-18 | Results, Sequence and the rail show the same "still to choose" count: rows in every placement with a shore to pick; rows with nothing tall enough are listed, not counted. | Sep 21 |
| UI-19 | No level modal: floors and typical ranges are edited in Levels rows (… opens range fields under the row; double-click lands in its fields). Slab thickness is edited there or re-read. | Sep 21 |
| UI-20 | While awaiting a plan click (edge candidates, matching by grid crossings, an armed draw or fill tool), the canvas shows a ring and ONE bar says what is asked and the way out. Matching keeps its own bar there (with the grid-label popup); never two. | Sep 21 |
| UI-21 | Edge candidates are drawn numbered and color-matched to their pane rows. Hovering a row or outline lights it; a plan click picks, a second click uses; ← → cycle, Enter uses the one shown. While up, the plan is only the picker: nothing else hovers, a bare-sheet click writes nothing. | Sep 21 |
| UI-22 | Floor edge is ONE list, a row per plan sheet, no second review panel. An unwritten read sits on its row with what it found and, over an existing edge, what would change (area either side, outline shift, drawn areas left outside), with Review · Dismiss / Keep current (UI-35). Nothing is written until Use. The top action is Confirm all N drawn while anything is drawn, else Use all N read / proposed. | Sep 21 |
| UI-23 | A pass over every sheet (arrival match, floor-edge sweep) shows progress in its step's primary slot ("Reading sheet 3 of 6 for its grid bubbles…"), not only on a folded "or do it by hand" button. | Sep 21 |
| UI-24 | ONE TYPE SCALE: 18 / 14 / 12.5 / 11 px (`--fs-xl/lg/md/sm`), no fifth; importance is weight, color, position. Every state is a PILL (amber "needs you", green "done", grey "read, unconfirmed", dashed "cannot start yet") on section heads, rail rows, tabs and cards. | Sep 21 |
| UI-25 | THE RAIL IS A CHECKLIST: the four steps, and under the current one each section with state and one-line status, clickable. Multi-section steps sum up as "n of m done"; single-section steps show their status. | Sep 21 |
| UI-26 | ONE STATUS BAR at every step's foot names what the step still wants ("Now: 5 sheets still to place") and where, offering "Open <section>" when another section needs something. No Next button (UI-32). | Sep 21, Sep 23 |
| UI-27 | ONE SECTION OPEN AT A TIME: in a stacked step the focused section is open; the rest fold to head and pill, finished or not. Clicking a folded head opens it alone and focuses it; clicking the open head folds it; moving to a section opens it. | Sep 21 |
| UI-28 | FEET AND INCHES, as the plan reads them. Every elevation and height (T.O.S., typical floor-to-floor, F2F / shore-height readouts, an offset area's elevation) is ft-in, accepted in any spelling (25-4 3/8 · 25'-4 3/8" · 25'-4 3/8 · 25-4 3/8" · 25.36 · 304.5" · -4-6, and the app's ⅛ fractions), shown to 1/8 in, stored as decimal feet. Slab thickness and beam size stay in inches. Slab, beam and on-grade areas show T.O.S. offset (in) and elevation side by side, either typed sets the other from the level T.O.S.; a blank beam shows its slab area's elevation. | Sep 23 |
| UI-29 | FIELDS COMMIT IN PLACE. A click lands in the clicked field, even mid-edit elsewhere. Tab walks reading order (across, then down), never to the top or the plan; Shift+Tab back; Escape drops the edit and focuses the plan. Re-renders keep focus and caret, inline panels included (area row, scan card): a commit never moves the panel to the pane foot; a render during a commit waits for focus to settle. Row icon buttons (×, …, on-grade) are not Tab stops. | Sep 23 |
| UI-30 | REMOVING CORNERS TOUCHES THE SELECTED SHAPE ONLY: Shift+click, eraser, box and hover+Delete see only its corners; with nothing selected they remove nothing and say to select one. | Sep 23 |
| UI-31 | NOTHING FOLDED: no hand tool, re-reader, importer or switch sits behind a disclosure; each section's tools are a plain captioned row under its primary action (replaces UI-15's "or do it by hand" details). | Sep 23 |
| UI-32 | THE WAY FORWARD ENDS EACH SECTION: one row with its standing (Done / To do, status) and ONE button, "Next: <section>" in a stacked step or "Next: <step>" from its last section or tab, enabled once the section (last: the step) is done, else disabled with the reason. The foot bar shows status only (UI-26). | Sep 23 |
| UI-33 | ONE TABLE SYSTEM: every pane list is a grid on a shared template (`--cols` on the container, used by `.tbl-head` and `.tbl-row`): headers over fields, fixed widths, nothing shifts. Levels: Level · TOS Elev · Slab Thickness (in) · SOG (box) · Typical Floor? (box opening from / to plus shore height OR F2F) · Sheet (Show: the level's sheet, fitted) · ×; green Confirm levels; Add a level, Read again, Import from Excel in the hand-tools row. Sheets: Pg · Title block · Floor · Zone · state, always open; title block alone in its cell (the reader's take is the tooltip); no "+ also serves" (a Levels typical range does it); "not a floor plan" only as a picker value; a row to check shows its flag and Looks right on one line. | Sep 23 |
| UI-34 | MATCH FLOORS IS ONE LIST: each proposed fit sits ON ITS SHEET'S ROW (stats, verdict, off-grid bubbles, scale question) with Show grid and ONE green Confirm that writes and confirms it; primary "Confirm all N proposed matches". Nothing is written before, nothing asks twice; a hand match still needs its Confirm (BLD-07). A matched sheet's re-read shows only if it moves the sheet ¼" or more ("Use the re-read"). No "Proposed matches" panel. | Sep 23 |
| UI-35 | THE FLOOR EDGE IS A QUEUE. The arrival sweep reads all plan sheets, WRITES NOTHING, and walks them BOTTOM floor up (rows listed likewise). Each opens fitted to the window, its read outline bright cyan, under ONE bar: Confirm (Enter or click the outline; writes it confirmed) · Adjust (A; writes it unconfirmed and selected, Simplify / Clean corners / Remove corner on its row; Done confirms) · Try the next outline (T; detector runners-up, no re-read) · Draw by hand (closing lands in Adjust) · Skip (N; "Keep current" on a matched sheet's re-read). Escape leaves the reads on their rows with Review; the primary reopens the walk ("Review N reads from the bottom floor up"); "Confirm all N good reads" takes the good ones. Detect again: "on this sheet" / "on every sheet", each walked. Gone: Pick from the sheet / Pick again, separate Clean corners, the on-grade column (Levels SOG box has it), unasked writes on arrival. | Sep 23 |
| UI-36 | THE GRID SHOWS ITSELF ON MATCH FLOORS: opening a sheet there (row, paging, arrival, read finishing) draws, unasked, its written fit's grid and crossings or the PROPOSED fit awaiting Confirm. Only a sheet with neither asks for two crossings, via its Match by hand button, never a row click. Grid marks and lines draw on Match floors ONLY; leaving drops the review and preview. | Sep 24 |
| UI-37 | "DO THE FLOORS LINE UP?" is a plain open block under Match floors. Its ghost is ON by default, drawing both neighbors, labeled: below blue long dashes, above orange short dashes; one box turns it off. Ghosts draw on Match floors ONLY (moved from a collapsible head on Areas). | Sep 24 |
| UI-38 | LOADS ADD BUTTONS HEAD THEIR TABLES: "+ Add a live-load mark" / "+ Add a dead-load mark" in those heads, "+ Add a mark" above a combined chart; blue `.btn-add`, never pushed down. Split tables end in a "Notes" column typed in place. The typical-capacity grid (Floor · LL · DL · PSF, or Floor · Mark · PSF) always has its PSF cell (a box until a mark is picked, then the figure), so nothing shifts. The read again / import / add by hand row closes the step, under the tables. | Sep 24 |
| UI-14 | PDF fidelity: DPR-correct canvases, no PNG round trip, the visible patch re-rendered at screen magnification, auto-trace and edge raster at 144 DPI. | Sep 9 |

## BRD — Brand

| ID | Rule | Decided |
|---|---|---|
| BRD-01 | McClone style guide: MCC Red #CF0A2C, MCC Grey #8A8A8D, black/white, tints #F2F2F2 and #D9D9D9; Calibri, monospace for figure columns; THE LOGO IS NEVER RECREATED, only in the print/PDF header. Brand color in chrome and print only; the plan's functional colors untouched. Dark theme kept, adapted. | Sep 9 |

## RVT — Revit / IFC feed

| ID | Rule | Decided |
|---|---|---|
| RVT-01 | Revit supplies GEOMETRY ONLY; loading marks are drawn in the calculator. | Sep 18 |
| RVT-02 | FILL / PAD / CURB / PEDESTAL / Plinth / TOS SLOPE are never slab. BM or BEAM is a beam whatever its category (BEM-07). | Sep 18 |
| RVT-03 | Rotation to project north is a user option. | Sep 18 |
| RVT-05 | Gridlines or bubbles tagged with an apostrophe or lowercase letter are not needed on the drawings; bubbles sit outside the building extents. | Sep 18 |
| RVT-06 | Elevations use the PROJECT datum, from the model's Reference Level properties (Top / Bottom Reference Elevation) against storey elevations (Kalae: 90'-9" below, so Level 1 reads 9'-3"); storey elevations are the fallback. | Sep 21 |
| RVT-07 | A slab hole filled by a wall or column is not an opening; it is filled back in and the load path runs through. | Sep 21 |
| RVT-08 | An opening's X is drawn on its own rotated rectangle, clipped to it, never its axis-aligned box. | Sep 21 |
| RVT-09 | Default (`--drawings field`): the job stands on McClone's printed set, no sheets of its own; geometry travels in FEET in the project grid's frame under `modelZones`. `--drawings rendered` keeps the old behavior. The rendered PDF is always written, as a check on the model. | Sep 21 |
| RVT-10 | Registration is the Match step: fitting a sheet to the model's project grid from its own bubbles IS the transform that places the model polygons. Model geometry governs; the drawing is backdrop. Nothing is written until Apply. | Sep 21 |
| RVT-11 | A polygon goes on the sheet it lands on, cut at the page edge, so each half of a North / South floor lands on its own sheet. | Sep 21 |
| RVT-12 | Rendered sheets write feet-inches as drawings do (9'-3", 77'-11 1/2"), never 77'-11.5", which no drawing uses and the dimension reader cannot parse. | Sep 22 |
| RVT-13 | A ramp is one element with a falling top, so its bounding box is RISE plus slab. Its top faces are grouped by PLANE: each run and landing is its own piece with high and low T.O.S., thickness less the rise. An on-grade ramp is not flagged; it bears on the ground. | Sep 22 |
| BLD-12 | A sheet can serve several floors (a typical tower plan above the podium); where several floors hold a page, the floor being worked on is meant. | Sep 21 |
| BLD-13 | The fit is seeded from the two crossings agreeing with the most others, then refitted; seeds over 3" RMS are discarded. (A title-block key plan has its own bubbles at its own scale; a fit over every crossing lands between the two plans and sticks.) | Sep 21 |
| BLD-14 | THE BUILDING STEP IS GEOMETRY ONLY: names, elevations, slab thickness, sheets, floor edge, match. The Levels row shows nothing about loads (no capacity cell, link or PSF in its worked-out line). Loads are assigned and confirmed on Loads (LOD-08). | Sep 21 |

---

## Deferred — not to be started without a new ask

- Pour zones as separate placements (zones are names only today).
- Pour dates and falsework-strip dates.
- Locking markup on the Drawings / Levels / Loads steps.
- An arc drawing tool; arc-fitting on traced outlines.
- Neighboring pours on one floor (PT pour breaks); a floor is one placement.
- Reading an opening on a lower floor as a shaft continuing upward.
- A simplified / field-plan results tab.
- Podium-beam solver speedup; an instant shore pick instead of a full re-solve (27 s on Kalae).
- A pyRevit button for ifc2reshore.py.

## Open questions — not yet decided

- Where the beam shore height on B4 48x20 over R3 came from (13'-10" vs B3's 9'-10"); points to a 4'-0" T.O.S. offset on L2 or 1B, not yet checked.
- Field-plan tab: simplification per floor or one job setting; cost as shore count or shore-days.

## Superseded — kept so they are not re-adopted by accident

| Was | Replaced by | When |
|---|---|---|
| The "Draw new slab area" menu of four kinds (no slab on grade); every new area focusing its first field | ARE-14 | Sep 24 |
| Area labels at fixed screen size at the centroid; slab color from type alone | ARE-20, ARE-21 | Sep 24 |
| The topmost area under the cursor winning the click | ARE-22 | Sep 24 |
| Add-mark buttons in a bar under the chart; read-only "Comments" as the dead-load table's last column; the PSF box only while no mark is picked | UI-38 | Sep 24 |
| The stacking check as a collapsible head on Areas, ghost off until asked | UI-37 | Sep 24 |
| The arrival sweep writing confident outlines unasked; Pick from the sheet / Pick again on edge rows; a separate Clean corners button; the on-grade tick on edge rows; Use this / Use all N read | UI-35 | Sep 23 |
| The "Proposed matches" panel (tick boxes · Apply N matches · Tick all readable · Close) above the Match floors rows | UI-34 | Sep 23 |
| "+ also serves…" on a Sheets row; sheet kind and "reads as" under the title block; the fold-away "Sheets in this set" head | UI-33 | Sep 23 |
| Levels row controls as icon buttons (▰ on grade, … range), headers placed by measuring the fields | UI-33 | Sep 23 |
| Shift+click / sweep / box / Delete removing corners of any shape on the sheet | UI-30 | Sep 23 |
| Re-readers and hand tools behind an "or do it by hand" `<details>`, remembered per section (UI-15 as first written) | UI-31 | Sep 23 |
| The Next / Go to button on the foot bar; Tab past the last property field returning to the plan | UI-32, UI-29 | Sep 23 |
| Elevations as decimal feet (112.50) | UI-28 | Sep 23 |
| Region names as grid bays plus carrying mark (1-6 / A-D B2) | RGN-07 | Sep 17 |
| Grid bays in a region's title to tell two patches apart (· 1-6 / A-D) | RES-15 | Sep 25 |
| Load-path names written on the Results plan (and the floating label on the selected region) | RES-16 | Sep 25 |
| Whole-level SOG needs no sheet match | MDL-02 | Sep 15 |
| Areas list grouped by sheet zone name, sheet on screen first | ARE-03 | Sep 17 |
| A Slab edge tolerance project setting (default 2 ft) | MDL-11 | Sep 18 |
| Sliver merge across marks where capacity differed | RGN-01, RGN-03 | Sep 15 |
| Seven steps in the rail | BLD-01 | Sep 15 |
| One-shot sheet review panel; edge column on the Sheets step | BLD-04 | Sep 17 |
| Orange selected-region highlight | RES-06 | Sep 8 |
| Green selected-region highlight with marching ants | RES-10 | Sep 21 |
| Auto-trace button and review panel on the Loads step | ARE-12 | Sep 21 |
| The scan queue ordered by type across the whole job, starting from the floor on screen | ARE-28 | Sep 25 |
| Typical capacity shown read-only on the Levels row | BLD-14 | Sep 21 |
| All unfinished sections of a stacked step open at once | UI-27 | Sep 21 |
| "Start a combined chart / Start split schedules" asked cold on an empty Loads step | LOD-01 | Sep 21 |
| Typical capacity editable on the Levels row, the level modal and the Areas typical row | LOD-08 | Sep 21 |
| RVT-04: the job's drawing set is a rendered plan sheet per level | RVT-09 | Sep 21 |
| The level modal (double-click a level / …) | UI-19 | Sep 21 |
| The Results modal (Schedule button) and gotoStep | BLD-01 | Sep 21 |
| Detect the floor edge / Auto detect as buttons pressed first | UI-16, UI-17 | Sep 21 |
| The detected floor edge as one outline, accepted or cancelled in the left pane only | UI-20, UI-21 | Sep 21 |
| A separate floor-edge review panel repeating the sheet rows above it (tick, Apply, Tick all readable) | UI-22 | Sep 21 |

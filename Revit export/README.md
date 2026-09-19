# ifc2reshore — Revit scope model → McClone Reshore Calculator

Turns an IFC export of McClone's own Revit scope model into a ready-made calculator job:

* `<job>-revit-plans.pdf` — one plan sheet per level, drawn from the model geometry (slab, openings, beams, columns, CIP walls, gridlines with bubbles, title strip with level name and T.O.S.). This is the "drawing set" the calculator stands on.
* `<job>-revit.reshore.json` — the job file: levels with T.O.S. elevations and typical slab thickness, every sheet assigned and matched (exact transform, confirmed), the floor edge per level (confirmed), openings, slab areas where thickness or top differs from the typical, slab-on-grade, beams with width / full depth / T.O.S. offset, and the primary project grid. The Building step is complete when it opens.
* `<job>-revit-export-log.txt` — what was read and skipped, per level.

Loading marks are **not** exported. They are drawn in the calculator over this geometry, as decided Sep 18 2026. Placements are one per level for now.

## Running it

Needs Python 3.10+ with `ifcopenshell`, `shapely`, `numpy`, `matplotlib`:

    pip install ifcopenshell shapely numpy matplotlib
    python ifc2reshore.py "HI_KALAE_MCC_ST.ifc" --out "Revit export" --name "1268 KALAE" --rotate auto

The first run on a model reads all the geometry (about 2 minutes for Kalae) and caches it beside the outputs; later runs with different options take seconds. Re-export the IFC and delete the `extract-*.json` cache when the model changes.

Options:

* `--rotate auto` rotates so the plain-number gridlines run vertical; `--rotate 21.87` (degrees, counter-clockwise) rotates by a fixed amount; no flag keeps the IFC's shared-coordinate orientation. Kalae has two grid orientations 30° apart (tower vs podium), so pick whichever reads better for the floors you are working on.
* `--scale 16` sets the sheet scale in feet per inch (16 = 1/16" = 1'-0"). Default: the smallest standard scale that fits the building on the sheet.
* `--sheet 36x24` sheet size in inches.
* `--levels 2,3,4` export only some levels.
* `--grid primary|all` which gridlines name the bays (default primary: plain numbers and letters only).
* `--min-opening 10`, `--min-area 15` ignore holes / slab pieces under that many SF.

Gridlines on the sheets: only clean tags are drawn — uppercase letters, digits and dots (1, 8, AA, A2.2). Anything with an apostrophe or a lowercase letter (1', 6w, L5-8a, bbw) and the mechanical M-numbers are working lines and are left off. Lines run across the building extents and every bubble sits outside those extents, so bubbles never lie over the slab where areas are drawn.

## Loading it in the calculator

1. Open `reshore-calc.html`, upload `<job>-revit-plans.pdf` as the drawing set.
2. Open job → `<job>-revit.reshore.json`.
3. Building shows complete. Go to Loads, enter or import the capacity chart, then draw the loading areas on the Areas step. Everything else (edges, openings, beams, slab steps, grid) is already there.

## Revit export settings

File → Export → IFC, setup **IFC4 Reference View** (IFC 2x3 Coordination View 2.0 also works), Property Sets tab: "Export Revit property sets" ticked. Whole model, not a single view.

## Modeling conventions the exporter relies on

Confirmed against the Kalae model, Sep 18 2026:

* Floors carry their thickness and kind in the type name: `7 1/2" PT SLAB`, `9" MS SLAB`, `5" SOG`. Thickness is read from the name, falling back to the geometry.
* Floors named `FILL`, `PAD`, `CURB`, `PEDESTAL`, `PLINTH`, `TOS SLOPE` are toppings/fixtures and are never slab. Piles, pile caps and foundation slabs are ignored.
* Anything whose type name contains `BM` or `BEAM` is a beam, whether it is Structural Framing or a Floor (`Floor:90x12 3/4 BM`).
* Beams are modeled **full depth from top of slab**; the `WxD` in the type name is width × total depth in inches and is exported as-is (the calculator takes the slab out itself). A beam whose top sits below the slab gets a negative T.O.S. offset; one whose top is above it (upturned) is skipped and listed in the log.
* Grade beams and steel (L-angles, HSS, W) are ignored.
* Floors joined to framing come through IFC with a slot where every beam runs; the exporter closes those slots (floors ∪ beams) before taking the floor edge and openings, so the edge is the real slab outline and the openings are the real openings.
* The level's T.O.S. is the top of its largest floor element, snapped to 1/8". Where that differs from the Revit level (Kalae L5: 143'-10" vs 144'-0") the log says so.
* A level whose slab is ≥ 90 % slab-on-grade is exported as on grade (`level.onGrade`); SOG areas on a suspended level become partial on-grade areas.

## Checking an export

`tests/load-in-calc.mjs` drives `reshore-calc.html` headlessly (Playwright): uploads the PDF, opens the job, checks every Building gate, reads back edge areas, then gives every level a flat 54 psf capacity and solves the L8 pour — expecting 70 psf on L7 at 9'-1" and 16 psf on L6, as in the Kalae workbook.

    node tests/load-in-calc.mjs ../reshore-calc.html "Revit export/1268_KALAE-revit-plans.pdf" "Revit export/1268_KALAE-revit.reshore.json"

## Known limits / later

* One level = one placement. Pour zones per level are a later option (the model would need floors split by pour, or the zones drawn in the calculator).
* Non-orthogonal gridlines after rotation are drawn on the sheets but cannot be in the project grid (it is x/y lists), so bays on the second grid system are unnamed.
* Sloped slabs (ramps) are exported flat at their top elevation with the name as label; check them by hand.
* The pyRevit button that writes the job straight from the open model, without the IFC step, is the planned next form of this tool.

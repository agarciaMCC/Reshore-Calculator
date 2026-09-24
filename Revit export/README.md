# ifc2reshore — Revit scope model → Reshore Calculator job

Turns an IFC export of McClone's Revit scope model into a calculator job. Outputs:

| File | What it is |
|---|---|
| `<job>-revit-plans.pdf` | One plan sheet per level, drawn from the model: slab, openings, beams, columns, CIP walls, gridlines with bubbles, and a title strip with the level name and T.O.S. This is the drawing set. |
| `<job>-revit.reshore.json` | The job. It has levels with T.O.S. and typical slab thickness, every sheet assigned and matched (exact, confirmed), a confirmed floor edge per level, openings, slab areas where thickness or top differs from typical, slab on grade, beams (width, full depth, T.O.S. offset) and the primary project grid. The Building step is complete when it opens. |
| `<job>-revit-export-log.txt` | What was read and skipped, per level. |

Loading marks are **not** exported; they are drawn in the calculator (decided Sep 18, 2026). There is one placement per level.

## Running it

Python 3.10+ with `ifcopenshell`, `shapely`, `numpy`, `matplotlib`:

    pip install ifcopenshell shapely numpy matplotlib
    python ifc2reshore.py "HI_KALAE_MCC_ST.ifc" --out "Revit export" --name "1268 KALAE" --rotate auto

- The first run reads all geometry (about 2 min for Kalae) and caches it beside the outputs, so later runs take seconds.
- Delete the `extract-*.json` cache when the model changes.

| Option | Effect |
|---|---|
| `--rotate auto` / `--rotate 21.87` | `auto` turns the plain-number gridlines vertical; a number rotates by that many degrees counter-clockwise. With neither, the IFC's shared coordinates are kept. Kalae has two grids 30° apart (tower and podium). |
| `--scale 16` | Sheet scale in feet per inch. The default is the smallest standard scale that fits. |
| `--sheet 36x24` | Sheet size in inches. |
| `--levels 2,3,4` | Export only these levels. |
| `--grid primary\|all` | Which gridlines name the bays. The default, `primary`, uses plain numbers and letters. |
| `--min-opening 10`, `--min-area 15` | Ignore holes and slab pieces under that many SF. |

**Gridlines:**
- Only clean tags are drawn: uppercase letters, digits and dots (1, 8, AA, A2.2).
- Working lines (1', 6w, L5-8a, M-numbers) are left off.
- Lines span the building, and every bubble sits outside it.

## Loading it in the calculator

1. Open `reshore-calc.html` and upload `<job>-revit-plans.pdf`.
2. Open job → `<job>-revit.reshore.json`.
3. Enter or import the capacity chart on Loads, then draw loading areas on Areas.

## Revit export settings

- File → Export → IFC, setup **IFC4 Reference View** (IFC 2x3 CV 2.0 also works).
- Tick "Export Revit property sets".
- Export the whole model, not a view.

## Modeling conventions it relies on (Kalae, Sep 18, 2026)

- **Floors:** the type name carries thickness and kind (`7 1/2" PT SLAB`, `9" MS SLAB`, `5" SOG`). The name wins over the geometry.
- **Never slab:** floors named `FILL`, `PAD`, `CURB`, `PEDESTAL`, `PLINTH` or `TOS SLOPE`. Piles, pile caps and foundation slabs are ignored.
- **Beams:** anything with `BM` or `BEAM` in the type name, as Structural Framing or as a Floor (`Floor:90x12 3/4 BM`).
  - `WxD` is width × full depth from the beam's own top, in inches, exported as-is.
  - A beam topped below the slab gets a negative T.O.S. offset, and the calculator counts everything below the slab soffit as stem (BEM-09).
  - Upturned beams are skipped and logged.
- **Ignored:** grade beams and steel (L, HSS, W).
- **Slots:** the IFC slots floors where framing joins them. The exporter closes those slots (floors ∪ beams) before taking the edge and openings.
- **Level T.O.S.:** the top of the largest floor element, snapped to 1/8". Differences from the Revit level are logged (Kalae L5: 143'-10" vs 144'-0").
- **On grade:** a level that is ≥ 90% SOG is exported whole-level on grade. SOG on a suspended level becomes a partial on-grade area.

## Checking an export

`tests/load-in-calc.mjs` opens the PDF and job headlessly, checks every Building gate and the edge areas, then solves the L8 pour at a flat 54 PSF. It expects 70 PSF on L7 at 9'-1" and 16 PSF on L6, matching the Kalae workbook.

    node tests/load-in-calc.mjs ../reshore-calc.html "Revit export/1268_KALAE-revit-plans.pdf" "Revit export/1268_KALAE-revit.reshore.json"

## Limits

- One placement per level. Pour zones would need floors split by pour in the model, or zones drawn in the calculator.
- Gridlines that are not orthogonal after rotation are drawn but can't join the project grid (it is x/y lists), so bays on the second system are unnamed.
- Ramps export flat at their top elevation, labeled; check them by hand.
- Next form of the tool: a pyRevit button that writes the job straight from the open model.

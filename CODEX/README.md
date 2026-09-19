# Reshore Calculator — improved copy

## Open the calculator

Open **reshore-calc-improved.html** in your regular desktop browser. It remains a standalone HTML app with its existing PDF library embedded.

To transfer work from the original calculator, use **Save job** there, then **Open job** in this copy and load the matching PDF. Browser storage can differ between local HTML files, so use a job file for the transfer.

The original files on your Desktop were not edited.

## Changes

- **Independent region calculations.** Small regions keep their own loads, heights, support conditions, shore choices, and beam profiles. The old minimum-region setting is now a **Small-region flag**. Changing it does not change the physical calculation.
- **Expandable result groups.** Once shores are selected, regions with the same floor-by-floor installation instructions can appear together. Each region retains its own card and calculations. Pending choices are not grouped.
- **Freshness checks.** Changes to the saved job invalidate Results and Sequence. Stale output is cleared and replaced with a Recalculate action. Printing independently checks the current inputs, including changes that have not yet triggered persistence. Drawing replacement also clears calculated output.
- **Save status and recovery.** The toolbar reports Saved in browser or Save failed. Failure leaves the job in memory and tells you to use Save job. Settings contains **Restore previous browser save**; a successful restore can be undone. Browser saves are separate from portable job-file downloads.
- **Job validation.** Malformed job structures, unsupported versions, invalid numeric values and coordinates, duplicate schedule marks, and invalid sheet transforms are rejected before replacing the current job.
- **Located assumptions.** Results includes a Calculation assumptions panel for the sampled slab load cascade: lower floors without floor edges, bearing accepted through edge tolerance, and typical capacities outside tagged areas. Select an item to highlight its footprint. The schedule print includes the same assumption descriptions and areas. Small regions are reported as retained.
- **Clearer field output.** Beam cards have a summary strip with load, height, selected shore, cluster size, and spacing. Results and Sequence show a persistent Areas locked badge. Named sheets contribute zone names to region labels in schedules and printed output where their polygons overlap the region.
- **Load provenance and import impact.** Drawing-derived load rows link to their recorded source sheets. Imported rows retain the workbook and worksheet names. The import review identifies affected drawn areas and floor defaults, and the recalculated result notes the applied import.

## Verification

The included Node test harness runs the real application functions with stub document/canvas endpoints. It does not open a browser or verify visual layout.

- 22 regression scenarios pass, covering retained region requirements, unchanged calculations across small-region thresholds, cache invalidation, print guards, storage errors, recovery and undo, import validation, assumption paths, beam text, and source escaping.
- The existing saved-job fixture solves all four modeled placements and conserves sampled region area.
- The supplied **Reshore Calculator Test.pdf** matches the existing `test-set.pdf` fixture byte-for-byte. A separate run through the calculator's actual PDF schedule parser read 11 pages, seven LL marks and five SDL marks, all from sheet 1. LL A retains the drawing's reduced-load indication.
- All three inline JavaScript blocks pass syntax compilation.

Run the included tests with Node from this folder:

```text
node tests/test-improvements.cjs
```

The optional PDF test also needs `pdfjs-dist` available to Node and accepts the HTML, saved-job fixture, and PDF paths as three arguments, in that order.

## Limits of this delivery

The browser tool blocked local-file navigation, so interactive browser testing, print-preview inspection, and the original Playwright suites were not run. The checks above are function tests and PDF parsing, not structural-design verification.

Source links open recorded load-schedule sheets. Legacy records do not contain exact value bounding boxes; precise highlights for loads, elevations, and slab thicknesses are not added here. Assumption areas are sampled approximations and can overlap between categories. The existing load formulas, shore catalog, edge-tolerance model, and placement-based release logic remain in use. Pour dates and concrete-strength-based release criteria are not introduced.

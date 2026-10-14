# Reshore Calculator

McClone's concrete reshoring calculator — a single-file HTML/CSS/JS app (`reshore-calc.html`, ~25,600 lines).

## Quick reference

- **App:** open `reshore-calc.html` in a browser (file:// works)
- **Test:** `node tests/run.mjs`
- **Rule coverage:** `node tests/rules.mjs`
- **IFC converter:** `python "Revit export/ifc2reshore.py"` (needs ifcopenshell, shapely, numpy, matplotlib)
- **PRs target `dev`**, never `master` directly. Use `gh pr create --base dev`.

## Architecture

| Path | What it is |
|---|---|
| `reshore-calc.html` | The entire app: UI, solver, PDF rendering, drawing tools, serialization, printing |
| `DECISIONS.md` | Canonical spec — ~120 stable-ID rules across 14 domains. The source of truth for behavior |
| `tests/` | 78 Playwright test files (~15,000 lines). Each declares `// @rules MDL-01, ...` |
| `tests/run.mjs` | Parallel, time-budgeted, resumable test runner. Maps failures to decision rule IDs |
| `tests/rules.mjs` | Reports which DECISIONS.md rules lack test coverage |
| `Revit export/` | Python IFC-to-calculator converter with its own tests and docs |

## Rules to follow

1. **Every change references its DECISIONS.md rule.** Commit messages name the IDs touched (e.g. `MDL-19: minimum 2 levels of reshore`).
2. **Change the rule, code and test in the same commit.** Never change code without updating the rule, never change a rule without code.
3. **Rule IDs are permanent.** Never reuse, renumber or delete a rule. Retire to "Superseded" with a pointer to the replacement.
4. **New tests must declare `// @rules`** at the top with the rule IDs they cover.
5. **Run `node tests/rules.mjs`** after adding tests to verify coverage.
6. **The app is one file.** Do not split `reshore-calc.html` into modules without discussion.
7. **No build step.** The app runs from the file system with no bundler, transpiler or server.

## Testing

```bash
# Full suite (resumes if time-budgeted; --fresh to restart)
node tests/run.mjs

# Filter by name
node tests/run.mjs cascade overlap

# Filter by rule ID
node tests/run.mjs --rule MDL-03

# Print last run's result without running
node tests/run.mjs --report

# Rule coverage audit
node tests/rules.mjs
```

Tests use Playwright with Chromium. Browsers live in `.pw-browsers/` (gitignored). Install with:

```bash
npm ci
npx playwright install chromium
```

Environment variables:
- `RESHORE_JOBS=6` — parallel test workers (default 6)
- `RESHORE_BUDGET=38` — time budget in seconds (default 38)
- `RESHORE_TIMEOUT=300` — per-suite timeout in seconds (default 300)

## Key solver functions (in reshore-calc.html)

- `markCapacity(sdl, ll, reducible)` — loading condition to capacity (PSF), ASCE 37 / McClone 1.3 factor
- `placementLoad(slabIn, dl)` — placement load from slab thickness and construction dead load
- `cascadeAtPoint(stack, pourIdx, thickIn, dl, shores)` — residual load cascade through floors
- `cascadeShape(r)` — cascade over a region area
- `solvePourLevel(stack, pourIdx, opts)` — solve one pour level
- `solveAll(opts)` — full job solve

## Workflow (four steps)

1. **Building** — Import PDF set, define levels/elevations/slab thickness, assign sheets, detect floor edges, match gridlines
2. **Loads** — Define loading conditions from schedule tables, diagrams or manual entry; set typical capacity per floor
3. **Areas** — Draw/detect slab areas, openings, beams, SOG zones; trace loading areas from load maps
4. **Results** — Run cascade solver, pick shores by height/capacity from catalog, generate install plan

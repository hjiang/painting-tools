# Plan 015: Palette Extraction → Paint Recipe List

## Goal

Add a **Palette** tool (`#tool-palette`) that distills the reference into
its N dominant colors and translates each into a concrete paint recipe using
the existing Kubelka-Munk engine — a "paint shopping list" for the
reference, plus an overall coverage score for the user's paint set.

## Clarified Requirements

- Extraction uses **median-cut** (deterministic — required for reproducible
  tests; no random-seeded k-means). K adjustable 3–12, default 6.
- Extraction runs on a **quantized histogram** (5 bits/channel → 32,768
  bins): one O(pixels) pass, then boxes split over bins. Full-resolution
  images stay fast and memory-bounded.
- Fully transparent pixels (alpha = 0) are excluded.
- Each extracted color carries a **weight** (fraction of image pixels);
  colors sort by weight descending; weights sum to ~1.
- Recipes come from the existing `matchColor(target, palette, opts)` in
  `colorMix.js`, using the **same paint palette as the Color Mixer tool**
  (localStorage `painting-tools.palette.v2`, with its default fallback).
  Palette loading is extracted into a shared helper so both tools read one
  source of truth.
- Each row shows: swatch, weight %, recipe (paint names + percentages),
  ΔE badge, and `valueHint` when `matchColor` reports one.
- **Coverage score** = weight-averaged ΔE across extracted colors, shown at
  the top ("Your paints cover this reference within ΔE 4.2").
- **Export list** button downloads a plain-text list:
  `1. 34% — Cadmium Red 70 / Titanium White 30 (ΔE 2.1)`.
- K persists (`painting-tools.paletteExtract.k`).

## Design

### New pure module: `paletteExtract.js`

Dual-mode export.

- `buildColorHistogram(imageData, bitsPerChannel) → {bins: Map|Array,
  total}` — quantized counts, skipping alpha = 0.
- `medianCut(hist, K) → [{rgb, weight}]` — recursively split the box with
  the largest channel range at its weighted median until K boxes or a box
  has one color; average each box (weighted, in sRGB); compute weights.
  Postconditions: `1 ≤ result.length ≤ K`; `Σweight ≈ 1 ± 1e-6`; output
  deterministic for identical input.
- `extractPalette(imageData, K, opts) → [{rgb, weight}]` — histogram →
  medianCut. Precondition: `1 ≤ K ≤ 12`.
- `paletteToRecipes(colors, paintPalette, opts) → [{rgb, weight, recipe}]`
  — maps each color through `matchColor`; `recipe` is matchColor's return
  (`entries`, `deltaE`, `valueHint`, …) so the UI renders existing fields.
- `coverageScore(colorsWithRecipes) → number` — Σ(weight × ΔE).

### Shared palette loading

- Move `DEFAULT_PALETTE` / `loadPalette()` out of `colorTool.js` into
  `colorMix.js` (exported), and update `colorTool.js` to import them.
  **Semantic-change checklist:** grep for `painting-tools.palette.v2`, v1
  migration notes, and palette docs in AGENTS.md (decision 9) /
  ARCHITECTURE / README; keep the storage key and migration behavior
  identical.

### Tool module: `paletteTool.js`

Registers `{ id: 'palette', ... }`. `process(imageData)` runs
`extractPalette` → `paletteToRecipes` and renders a swatch row grid (reuses
palette-grid CSS patterns from the Color Mixer). No result image to
promote — output is information, so no `createPromoteButton`. Export builds
the text list and downloads it as `paint-list.txt`.

### DOM (`index.html`)

- `<div class="tool-view hidden" id="tool-palette">`: K slider with
  readout, coverage score line, swatch grid container, Export button.
- Scripts: `paletteExtract.js` after `colorMix.js` (dependency),
  `paletteTool.js` after `app.js`. Tab placement: after Color Mixer.

## TDD Sequence

1. Write `tests/paletteExtract.test.js`:
   - Solid-color image → one extracted color ≈ that color for any K
     (weight ≈ 1).
   - Half-red/half-blue image with K=2 → both colors found, weights
     ≈ 0.5 ± 0.05, order by weight.
   - Determinism: two runs → identical output.
   - `result.length ≤ K`; weights sum to 1 ± 1e-6.
   - Alpha-0 pixels excluded (transparent red over blue → only blue).
   - `paletteToRecipes`: with a stub paint palette (pure red/white/black
     hexes), a red extracted color returns a recipe whose top entry is red;
     result carries through `deltaE`/`valueHint` fields.
   - `coverageScore`: known weights × known ΔE → expected weighted mean.
2. Run tests and report **"test failed as expected."**
3. Implement `paletteExtract.js`; extract shared palette loading from
   `colorTool.js` into `colorMix.js` (run `tests/colorMix.test.js` to
   confirm the refactor is behavior-preserving).
4. Re-run new tests, then the full suite.
5. Add DOM, styles, `paletteTool.js`, export-list download.
6. Update REQUIREMENTS (new feature), ARCHITECTURE, README, AGENTS.
7. Browser smoke test: photo with obvious dominant colors yields sensible
   recipes; editing the Color Mixer palette changes recipes here; export
   file content matches on-screen list; ≤700px layout.

## Validation Contract

### Automated

- New palette tests pass; existing `colorMix` tests pass unchanged after
  the palette-loading refactor.

### Manual Browser

- Dominant-color recipes look plausible to a painter's eye on 2–3 real
  references; coverage score moves in the expected direction when paints
  are removed from the palette; text export is well-formed.

## Non-Goals

- Gamut map visualization over the image (idea #15 — builds on this).
- Per-region palettes (sky vs. foreground segmentation).
- Glaze/layer recipes — physical mixing only, matching `mixPaints`.
- k-means extraction (non-deterministic; median-cut is sufficient).
- Saving the list into the Color Mixer as named recipes (idea #12).

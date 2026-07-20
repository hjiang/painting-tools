# Plan 012: Value Band Isolation (F8)

## Goal

Implement requirement **F8 (Layer Isolation)**: in the Posterize tool, click
a histogram bin to show *only* the shapes belonging to that value band —
band pixels rendered as a flat dark mask, everything else white — for
tracing and studying individual value masses.

## Clarified Requirements

- Isolation is available in **both** posterize modes (grayscale and color);
  the band a pixel belongs to must be *identical* to the band posterize()
  assigns it — no drift between display and isolation.
- Mask rendering: selected band → black (`#000`), all other pixels → white
  (`#fff`), alpha preserved. (Flat mask reads better for tracing than
  showing the band's midpoint color; noted as a possible later option.)
- Clicking the selected bin again, or clicking an "All bands" button,
  returns to the normal posterized view.
- Selecting a band **persists** (`Settings`), and the isolated output is
  what Download / "Use as New Reference" produce while a band is selected.
- Changing N or mode clears the selection (band indices are only meaningful
  for the N/mode that produced them).

## Design

### Shared band computation (`posterize.js`)

Extract the band-index rule so posterize and isolation share one source of
truth:

- `bandIndexForValue(v255, N)` — the existing
  `floor(v / (256 / N))` clamped to `[0, N-1]`.
- `bandIndexForPixel(r, g, b, N, mode)` — computes luminance (grayscale
  mode) or HSL L (color mode) exactly as `posterize()` does, then delegates
  to `bandIndexForValue`.

Refactor `posterize()` internals to call these helpers. **Semantic-change
checklist:** the band-boundary rule is described in `AGENTS.md`
(design decision 3), `docs/REQUIREMENTS.md` (F1), and `docs/ARCHITECTURE.md`
— grep for "band", "256/N", "midpoint" and update any wording that the
refactor makes stale (the rule itself must not change).

New pure function:

- `isolateBand(imageData, N, bandIndex, mode) → { imageData }` —
  per pixel: `bandIndexForPixel(...) === bandIndex ? black : white`.
  Preconditions: `2 ≤ N ≤ 12`, `0 ≤ bandIndex < N`, mode ∈
  `{'grayscale','color'}`. Postcondition: same dimensions, input unmodified.

### Histogram hit-testing (`histogram.js`)

- Export the padding constants (`HIST_PAD`) currently private to
  `drawHistogram`, and add pure `binAtX(cssX, canvasCssWidth, N)` → bin
  index or `-1` outside the chart area. The function must use the same pad
  values as the drawing path so clicks align with rendered bins (tests
  assert boundary consistency against `HIST_PAD`).
- `drawHistogram(canvas, bins, N, opts)` gains optional `opts.selectedBin`;
  that bin is drawn highlighted (accent color). Existing callers unaffected
  (`opts` optional).

### Tool wiring (`posterizeTool.js`)

- Histogram canvas gets a click listener → `binAtX` → set/clear selection →
  re-process.
- View state: `selectedBin = -1` means normal posterized output; otherwise
  output canvas shows `isolateBand(...)` and histogram redraws with
  highlight.
- `getResultImageData` returns the isolated mask while a band is selected;
  promote label: `Isolated band k (N values)`.
- Persist `painting-tools.posterize.isolateBand` (int, `-1` = off). Reset to
  `-1` when N or mode changes.

### DOM (`index.html`, `#tool-posterize`)

- Small hint under the histogram: "Click a bin to isolate that value band."
- "All bands" button, visible only when a band is selected.

## TDD Sequence

1. Extend `tests/posterize.test.js` (and/or new
   `tests/isolateBand.test.js`):
   - Refactor safety: posterize output for representative pixels is
     byte-identical before/after extracting the helpers.
   - `bandIndexForValue`: N=3 boundaries (0→0, 85→0, 86→1, 170→1, 171→2,
     255→2); clamping at 255 for all N.
   - `isolateBand` grayscale: crafted 1×4 image with known luminances lands
     the right pixels black/white for each band.
   - `isolateBand` color mode: a saturated red whose HSL L falls in band k
     is selected iff `bandIndex === k`.
   - Consistency property: for a gradient image, the set of pixels isolated
     for band k equals the set of pixels posterize paints with band k's
     midpoint value (grayscale mode).
   - `binAtX`: first/last bin edges, between-bin boundary, outside-chart →
     `-1`; consistency with `HIST_PAD`.
2. Run tests and report **"test failed as expected."**
3. Refactor `posterize.js`, extend `histogram.js`, implement `isolateBand`.
4. Re-run new tests, then the full suite.
5. Wire UI in `posterizeTool.js` + DOM/hint/button + highlight styles.
6. Update REQUIREMENTS (F8 from stretch goal to feature), ARCHITECTURE,
   README, AGENTS.
7. Browser smoke test: click bins in both modes, persistence across reload,
   promote isolated mask → Sketch operates on the mask; ≤700px layout.

## Validation Contract

### Automated

- New isolation/hit-test tests pass; full suite passes — the refactor must
  not change any existing posterize test result.

### Manual Browser

- Clicking bin k shows a clean black-on-white mask matching the posterized
  band shapes; clicking again / "All bands" restores the posterized view.
- With N=2, the two masks are complementary (every pixel black in exactly
  one mask).
- Download/promote while isolated exports the mask.

## Non-Goals

- Showing the band in its midpoint color or original colors (mask only).
- Multi-band selection.
- Adaptive (median-cut) band boundaries — separate idea, unchanged here.
- Isolation controls in tools other than Posterize.

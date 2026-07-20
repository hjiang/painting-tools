# Plan 011: Flip, Squint, and Grayscale View Tool

## Goal

Add a new **View** tool (`#tool-view`) that helps painters judge their
reference the way they judge a physical canvas:

1. **Flip horizontal** — mirror the reference to expose drawing errors.
2. **Squint (blur)** — a slider that blurs the image to simulate squinting,
   so value masses read clearly.
3. **Grayscale** — desaturate to judge values independent of hue.

All three are independent toggles/controls that compose in a fixed pipeline:
source → flip → grayscale → blur → display.

## Clarified Requirements

- The tool is **display + export only**: it never mutates
  `ImageManager._imageData` on its own. Export/promote follows the existing
  `createPromoteButton(getResultFn, labelFn)` convention so a flipped or
  blurred image can optionally become the new reference.
- Transforms are **pure pixel functions** (not `ctx.filter`), so they are
  testable in Node and their output can be downloaded/promoted at full
  resolution — consistent with design decision 5 (process at full
  resolution).
- Pipeline order is fixed: flip → grayscale → blur. This keeps reasoning and
  tests simple; reordering has no painterly benefit.
- Blur radius 0–8 px (slider 0–8, default 0). Grayscale default off. Flip
  default off. All three persist via `Settings`.

## Design

### New pure module: `viewTransforms.js`

Dual-mode export (global + `module.exports`), same pattern as `posterize.js`.
Alpha is preserved by every function (photos are opaque, but the invariant is
cheap and matches `lighten.js`).

- `flipHorizontal(imageData) → ImageData` — new ImageData, column-reversed
  rows. Does not mutate input.
- `toGrayscale(imageData) → ImageData` — Rec. 601 luminance
  (`L = 0.299R + 0.587G + 0.114B`, `Math.round`), written back to R=G=B.
- `boxBlur(imageData, radius, iterations) → ImageData` — separable sliding-
  window box blur (horizontal pass then vertical pass, O(1) per pixel per
  pass), `iterations` defaults to 2 (two passes approximate a Gaussian well
  enough for squint simulation). `radius = 0` returns a copy unchanged. RGB
  channels are blurred; alpha is copied from the source.
  - Codebase style is ES5 (`var`, function declarations) — write the
    default as `if (iterations === undefined) iterations = 2;`, not an ES6
    default parameter.
  - **Edge handling:** the window shrinks at borders. For index `i`,
    average the samples in `[max(0, i-r), min(n-1, i+r)]` and divide by the
    in-bounds count. No darkened edges; a uniform image stays exactly
    uniform at any radius.
  - **No intermediate rounding:** the horizontal pass stores per-channel
    floats (plain arrays or `Float32Array`); round only when writing the
    final `Uint8ClampedArray`. Rounding between passes breaks the impulse
    test's expected value (28).
  - **Sliding window:** advance the running sum by adding the entering
    sample and subtracting the leaving one (O(1) per pixel). Do not re-sum
    the window per pixel — at radius 8 that is ~17× slower and will jank
    on 12 MP photos.
- Precondition for all three: `imageData` is a valid ImageData with
  `data.length === width * height * 4`. Postcondition: output has identical
  dimensions; input is unmodified.

### Tool module: `viewTool.js`

Registers via `ToolShell.register({ id: 'view', name: 'View',
icon: '👁\uFE0F', mount })`. Model it on `lightenTool.js`: `mount()` grabs
DOM refs, defines `render()`, wires listeners, and returns `render` — the
shell stores the returned function as `process` and calls it on image
load, tab switch, and resize. `render()` reads
`ImageManager.getImageData()`, returns early when null, runs the pipeline
flip → grayscale → blur with current control values into `_lastResult`,
and draws via `drawImageDataToCanvas` to a single CSS-scaled result
canvas (no original side-by-side).

Settings, following the `gridTool.js` / `sketchTool.js` pattern — restore
at mount with DOM-state fallbacks, then refresh the blur readout label;
persist via `Settings.set` in the same `input`/`change` handlers that
re-run `render`:

- `painting-tools.view.flip` — `Settings.getBool(KEY, flipCheck.checked)`
- `painting-tools.view.grayscale` — same bool pattern
- `painting-tools.view.blurRadius` — `Settings.getInt(KEY, ...)`

Download + "Use as New Reference" via `downloadImageData` /
`createPromoteButton` (promote spot `<span id="view-promote-spot">`,
download filename `view.png`). The promote label lists active transforms
in pipeline order — parts taken from `['Flipped', 'Grayscale', 'Blurred '
+ r + 'px']`, joined with `', '`, falling back to `'Unaltered view'` when
nothing is active (example: `Flipped, Blurred 4px`).

No new CSS: reuse `.canvas-box`, `.controls`, `.control-row`,
`.checkbox-label`, `.slider-ticks`, `.download-section`, `.download-btn`.

### DOM (`index.html`)

- `<div class="tool-view hidden" id="tool-view">` placed first inside
  `#tool-views` (before `#tool-posterize`), containing: flip checkbox,
  grayscale checkbox, blur slider (0–8, step 1, default 0) with value
  readout, one result canvas (`id="view-canvas"`) in a `.canvas-box`,
  `<span id="view-promote-spot">`, download button. DOM order is cosmetic
  — it does NOT determine tab order.
- Script tags: `viewTransforms.js` in the pure-module group before
  `app.js` (after `underpaintingAlignment.js`); `viewTool.js`
  **immediately after `app.js`, before `posterizeTool.js`** — tab order is
  `ToolShell.register()` call order, i.e. script order.
- Tab placement: first, before Posterize — it is a way of *looking at* the
  reference, not a processing step.
- **`app.js` landing-tab change:** `ToolShell.activate('posterize')` is
  hardcoded twice (file-input `change` handler and `drop` handler). Change
  both to `ToolShell.activate('view')` so the first tab is also the tool
  shown right after upload.

## TDD Sequence

1. Write `tests/viewTransforms.test.js` — copy the harness from
   `tests/lighten.test.js` (assert/assertEq/assertClose, ImageData
   polyfill, pixel/solidImage helpers, non-zero exit on failure):
   - `flipHorizontal`: 3×1 image with R values 10/20/30 maps to 30/20/10;
     the input array is untouched; alpha preserved.
   - `toGrayscale`: pure red (255,0,0) → **76** on all channels
     (`Math.round(0.299*255)`); white → 255; black → 0; alpha preserved.
   - `boxBlur`: radius 0 is identity (content-equal, not the same
     reference); a uniform image (solid 128) is unchanged at any radius;
     dimensions preserved; with `iterations = 1`, a 5×5 gray impulse (255
     at the center, radius 1) spreads to exactly `Math.round(255/9)` =
     **28** in the 3×3 neighborhood around the center and 0 elsewhere
     (this expectation only holds with float intermediates + shrinking
     edge windows); alpha channel copied verbatim; input unmodified.
2. Run the test and report **"test failed as expected."**
3. Implement `viewTransforms.js`.
4. Re-run the test, then the whole suite:
   `for t in tests/*.test.js; do node "$t" || exit 1; done`
   (bare `node tests/*.test.js` runs only the first glob match).
5. Add DOM and `viewTool.js` wiring (no new CSS — see Design), plus the
   two `app.js` landing-tab edits.
6. Docs sweep (all in the same commit):
   - `docs/REQUIREMENTS.md` — new feature **F12** (F10 = Underpainting
     Accuracy, F11 = Color Mixer are already taken); also add View to
     F9's list of promoting tools.
   - `docs/ARCHITECTURE.md` — tool diagram, file-structure block, module
     table.
   - `README.md` — tool table, tab list in usage step 3, promote list in
     step 5, chaining mention in the intro.
   - `AGENTS.md` — file structure + new design decision #11 (View tool:
     display-only flip/grayscale/blur pipeline of pure pixel functions;
     first tab and landing tool after upload).
   - `docs/IDEAS.md` — mark ideas #1–#3 as implemented (append " ✅") and
     remove them from the "Top 5 (planned)" line.
7. Browser smoke test at desktop and ≤700px widths: controls persist
   across reload; View is the landing tab after upload; promote chains
   into Posterize.

## Validation Contract

### Automated

- All new `viewTransforms` tests pass.
- Full suite green:
  `for t in tests/*.test.js; do node "$t" || exit 1; done`.

### Manual Browser

- Flip mirrors the image; grayscale + blur compose in pipeline order.
- View is the first tab and the active tool immediately after upload.
- Blur slider is responsive on a multi-megapixel photo (separable blur
  should hold ~interactive rates; note any jank as input to idea #19,
  Web Workers).
- "Use as New Reference" on a flipped image makes every other tool operate
  on the flipped source; Reset restores.

## Non-Goals

- **Rotation** (90°/arbitrary) — useful for phone photos, but adds UI and
  dimension-swap complexity; separate plan if wanted.
- **Applying flip/blur inside other tools' pipelines** — the View tool is
  standalone; chaining happens through promote.
- `ctx.filter`-based blur — not Node-testable and not exportable at full
  fidelity.
- Bilateral/median edge-preserving blur — see plan 014's non-goals.

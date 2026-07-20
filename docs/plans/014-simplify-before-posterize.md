# Plan 014: Smoothing Pass Before Posterization

## Status

**Implemented.** This plan has been fully implemented on branch `014-simplify-posterize`.

## Goal

Add an optional **Simplify** (smoothing) slider to the Posterize tool so
noisy photos posterize into clean, paintable value masses instead of
speckled bands. Pipeline becomes: source → optional smooth(radius) →
posterize → histogram → isolation mask.

## Implementation Context

- Plan 011 (View tool with flip/grayscale/blur) already landed. `boxBlur` is
  available as a global from `viewTransforms.js`, which loads before
  `posterizeTool.js` in the script order. **No new `blur.js` is created**;
  the existing `boxBlur` is reused directly.
- The script load order is already correct: `viewTransforms.js` → `settings.js`
  → `app.js` → ... → `posterizeTool.js`. No changes to `index.html` script
  ordering are needed.
- Isolation masks (`isolateBand`) must consume the **same optionally smoothed
  input** as posterization, histogram, and export. A cached smoothed source
  is retained so all downstream paths are coherent.

## Approved Behavior

- Posterize gets a **Simplify (blur)** range slider 0–8 px, default 0, step 1,
  persisted at `painting-tools.posterize.smooth`, using `.slider-stack` and
  ticks `0/2/4/6/8`, placed **after Values before Mode**.
- Pipeline is: raw source → optional `boxBlur(source, radius)` (2 iterations)
  → `posterize`. Radius 0 must skip `boxBlur` and preserve today's exact path.
  Original pane remains raw.
- Cache must include smoothing radius and retain the smoothed source.
  Histogram and all isolation paths (render, promote, download) must use the
  same smoothed source. Keep an isolated band selected when radius changes;
  recompute coherently.
- Promote labels retain current mode and append `, smoothed Npx` only when
  N>0. Isolated labels also append smoothing. Download filename unchanged.
- Reuse global `boxBlur`; `viewTransforms.js` already loads before
  `posterizeTool.js`. Do not move/duplicate blur and do not change script
  order.
- Update README.md, AGENTS.md, docs/REQUIREMENTS.md, docs/ARCHITECTURE.md,
  docs/IDEAS.md (mark idea #7 done), and the plan.
- Semantic-change checklist applied.

## Implementation

### Files modified

| File | Change |
|------|--------|
| `index.html` | Add smoothing slider HTML in `#tool-posterize`, after Values slider and before Mode row |
| `posterizeTool.js` | Add smoothing state, cache smoothing radius + smoothed source, apply `boxBlur` before `posterize`, update labels |
| `docs/plans/014-simplify-before-posterize.md` | This file: mark as implemented |
| `docs/REQUIREMENTS.md` | Update F1 (value posterization) to mention optional smoothing pre-pass |
| `docs/ARCHITECTURE.md` | Update posterize algorithm and tool module descriptions |
| `docs/IDEAS.md` | Mark idea #7 as done |
| `README.md` | Mention smoothing in Posterize tool description |
| `AGENTS.md` | Update design decisions 1/3 to mention optional smoothing |
| `tests/posterizeSmoothing.test.js` | New: VM-based fake-DOM integration test for smoothing UI wiring |
| `tests/posterize.test.js` | Add composition coverage: smoothing a 1px checkerboard collapses histogram in both modes; radius-zero is byte-identical |

### HTML (`index.html`)

Add after the Values slider control row and before the Mode row:

```html
<div class="control-row">
  <label for="posterize-smooth" class="control-label">
    Simplify (blur): <strong id="posterize-smooth-label">0</strong> px
  </label>
  <div class="slider-stack">
    <input type="range" id="posterize-smooth" min="0" max="8" value="0" step="1">
    <div class="slider-ticks">
      <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span>
    </div>
  </div>
</div>
```

### `posterizeTool.js` changes

1. Add `_lastSmooth` and `_lastSmoothedSource` to mount closure state.
2. Get ref to `#posterize-smooth` slider and `#posterize-smooth-label`.
3. Restore persisted value on mount.
4. In `render()`:
   - Read `smooth = parseInt(smoothSlider.value)`.
   - Extend cache key: if smoothing changed (or source/N/mode changed),
     apply `boxBlur(imageData, smooth, 2)` when `smooth > 0`, else use
     `imageData` directly. Cache the smoothed source.
   - Pass the smoothed source to `posterize()`, `isolateBand()`, and draw.
5. Promote label: `Posterized (N values, mode)${smooth > 0 ? ', smoothed Npx' : ''}`.
6. Isolated promote label: `Isolated band B (N values)${smooth > 0 ? ', smoothed Npx' : ''}`.
7. Smooth slider `input` event: update label, persist, trigger re-render.
   Do NOT clear isolated band selection (unlike N/mode changes).

## TDD Sequence

1. Write `tests/posterizeSmoothing.test.js` — a VM-based fake-DOM integration
   test that sets up minimal DOM, loads `posterizeTool.js`, and asserts the
   smoothing slider exists. This test fails before implementation.
2. Run the test, confirm it fails as expected.
3. Add composition tests to `tests/posterize.test.js`:
   - High-frequency checkerboard (1px cells) with N=2: both bands present.
     Smoothed with radius ≥ 2 collapses toward a single dominant band.
   - Radius 0 is byte-identical to today's posterize output.
4. Implement the changes.
5. Re-run all tests — all pass.
6. Update all documentation.
7. Browser smoke test.

## Validation

### Automated

- `tests/posterizeSmoothing.test.js` passes (VM-based integration test).
- `tests/posterize.test.js` passes (including new composition tests).
- Full suite passes (`for t in tests/*.test.js; do node "$t"; done`).

### Manual Browser

- Slider appears between Values and Mode controls.
- Adjusting Simplify from 0→8 on a noisy photo visibly merges speckled bands.
- Histogram updates accordingly.
- Persistence across reload: set slider to 4, reload, slider shows 4.
- Promote labels include smoothing info when N>0.
- Isolated band shows smoothed mask.
- ≤700px layout is not broken (smoothed slider wraps as expected).

## Non-Goals

- Edge-preserving smoothing (bilateral/median).
- Adaptive (median-cut) posterize bands.
- Smoothing controls in other tools (Lighten, Sketch) — chaining through
  promote covers those workflows.
- Per-channel or HSL-space smoothing — RGB only.

# Plan 014: Smoothing Pass Before Posterization

## Goal

Add an optional **Simplify** (smoothing) slider to the Posterize tool so
noisy photos posterize into clean, paintable value masses instead of
speckled bands. Pipeline becomes: source → smooth(radius) → posterize →
histogram.

## Clarified Requirements

- Slider 0–8 (default 0 = off, today's behavior exactly). Radius maps
  directly to blur radius in image pixels; two iterations for a
  Gaussian-like falloff.
- Smoothing applies to **both** modes (grayscale and color): smoothing runs
  on RGB before any mode-specific conversion.
- The **histogram reflects the smoothed image** — it must show the mass
  distribution the painter will actually get.
- Download and "Use as New Reference" export the smoothed-then-posterized
  result (they already consume the pipeline output; only the label changes:
  `Posterized (5 values, smoothed 3px)`).
- Setting persists: `painting-tools.posterize.smooth`.
- Blur implementation is shared, not duplicated: use `boxBlur` from
  `viewTransforms.js` (plan 011). If this plan lands first, create
  `blur.js` with `boxBlur(imageData, radius, iterations)` and have plan 011
  import it from there instead.

## Clarified Requirements (performance)

- Full-resolution separable box blur is O(width × height) per pass with a
  sliding window (independent of radius), so radius 8 × 2 iterations ×
  (H+V) stays interactive on multi-megapixel photos. If profiling shows
  jank, that is input to idea #19 (Web Workers) — **not** a reason to
  process at reduced resolution (decision 5 stands).

## Design

### Pure function

- `boxBlur(imageData, radius, iterations) → ImageData` — see plan 011 for
  the contract (separable sliding-window, alpha preserved, radius 0 =
  identity copy). Owner module depends on landing order, per above.

### Wiring (`posterizeTool.js`)

- Insert the smoothing step before the `posterize(...)` call in
  `process(imageData)`; skip entirely when radius is 0 (identity, no extra
  pass).
- Add slider + readout to `#tool-posterize` controls; persist via
  `Settings`; re-process on input (existing pattern).

### Docs

- `AGENTS.md` design decision 1/3 describe the posterize pipeline; update
  wording to "optional smoothing pre-pass". Semantic-change checklist: grep
  for "posterize(imageData" / pipeline descriptions in REQUIREMENTS (F1)
  and ARCHITECTURE and update in the same commit.

## TDD Sequence

1. Write `tests/blur.test.js` if plan 011 has not landed (otherwise reuse
   `tests/viewTransforms.test.js` cases): identity at radius 0, uniform
   invariant, impulse spread, alpha preserved, dimensions preserved,
   iterations ≥ 1 monotone smoothing (sampled variance does not increase).
2. Add an integration test in `tests/posterize.test.js`:
   - A high-frequency checkerboard (1px cells) posterized with N=2 produces
     both bands present; the same image smoothed with radius ≥ 2 collapses
     toward a single dominant band (deterministic bounds, not exact counts).
   - Radius 0 path is byte-identical to today's posterize output.
3. Run tests and report **"test failed as expected."**
4. Implement/relocate `boxBlur`; wire the slider in `posterizeTool.js`.
5. Re-run new tests, then the full suite.
6. Update REQUIREMENTS (F1), ARCHITECTURE, README, AGENTS.
7. Browser smoke test: slider 0→8 on a noisy photo (speckle visibly
   merges), histogram updates accordingly, persistence across reload,
   ≤700px layout, promote chains into Sketch.

## Validation Contract

### Automated

- Blur unit tests + posterize integration tests pass; full suite passes
  with radius-0 byte-identity guarding the default path.

### Manual Browser

- Speckled bands merge into clean masses as radius increases; histogram
  bins shift to match; no visible UI lag on a ~12 MP photo (note numbers
  for the Web Workers idea if lag appears).

## Non-Goals

- Edge-preserving smoothing (bilateral/median) — better quality but
  significantly more expensive at full resolution; evaluate after Workers.
- Adaptive (median-cut) posterize bands — orthogonal idea, unchanged.
- Smoothing controls in other tools (Lighten, Sketch) — chaining through
  promote covers those workflows today.
- Per-channel or HSL-space smoothing — RGB only.

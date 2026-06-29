# Plan 007: Color Mixer Accuracy — Value/Chroma Separation & Tinting Strength

## Problem

Two recurring user complaints:

1. **"I needed to lighten or darken the result."** The recipe nails the hue but
   the predicted value (lightness) is off, so the physical mix has to be
   hand-corrected with white or a darker pigment.
2. **"It said I can't mix the color, but I could get close then lighten/darken
   it."** The "screen color — out of paint gamut" warning fires whenever total
   ΔE exceeds the `reachableDeltaE` threshold (8). In practice that ΔE is
   usually dominated by a **lightness** miss (ΔL), not a hue/chroma miss — so a
   perfectly mixable hue gets rejected just because its value is off.

### Root causes (in `colorMix.js`)

- **`matchColor` scores with a single scalar `deltaE`** that lumps ΔL, Δa, Δb
  together. It cannot distinguish "wrong hue" (truly out of gamut) from "right
  hue, wrong value" (one dab of white/black away). Both surface as the same
  unreachable warning.
- **The default palette has no black and a weak white** (`Flake White #f5f4ea`,
  L≈95). Burnt Umber is the only darkener. So the search literally cannot reach
  dark or very light targets, inflating ΔE.
- **Single-constant Kubelka–Munk treats every pigment as equal tinting
  strength.** Real pigments differ by 10–50× (Phthalo Blue vs. an earth). A
  recipe like "20% phthalo / 80% white" is physically misleading — in the can,
  20% phthalo would dominate completely. This is a primary source of the
  lighten/darken drift.

## Goals

- Surface **value error separately from hue error**, with actionable guidance
  ("mix this hue, then lighten ~15%").
- Stop flagging value-only misses as "out of gamut."
- Make predicted recipes closer to what actually happens in the can.

## Design

### Stage 1 — Decompose the match (CIELAB ΔL vs. ΔC) and re-message
**Goal**: `matchColor` reports *why* a target is hard, separating value from chroma.
**Status**: Done

- In `matchColor`, after finding the best mix, compute against the target in
  CIELAB:
  - `dL = targetLab.L - mixedLab.L` (signed: positive ⇒ target is lighter)
  - `dC = sqrt(da² + db²)` (chroma/hue distance, value-independent)
- Return these on the result object alongside existing `deltaE`/`reachable`:
  ```js
  { ..., dL, dC, valueHint: 'lighten' | 'darken' | null }
  ```
- Redefine reachability on **chroma**, not total ΔE:
  - `chromaReachable = dC <= chromaTolerance` (default ~6)
  - If `chromaReachable` but `|dL|` is large ⇒ "Reachable — mix this hue, then
    {lighten|darken} by ~N%." (Not an error.)
  - If `!chromaReachable` ⇒ keep the genuine "out of paint gamut" message
    (hue/saturation beyond the pigments).
- **Tests** (`tests/colorMix.test.js`):
  - A target equal to a palette paint but scaled lighter ⇒ `chromaReachable`
    true, `valueHint === 'lighten'`, `dL > 0`.
  - Pure screen green (`0,255,0`) ⇒ `chromaReachable` false (real gamut miss).
  - `dC` is invariant to multiplying target L (value change doesn't move chroma).

### Stage 2 — Update the Color Mixer UI messaging (`colorTool.js`)
**Goal**: The result panel tells the painter the hue recipe + the value tweak.
**Status**: Done

- In `renderResult`, replace the binary reachable/unreachable block with three
  states driven by Stage 1's fields:
  1. **Close match** — `dC` small and `|dL|` small. (unchanged)
  2. **Hue reachable, adjust value** — `dC` small, `|dL|` large: show recipe +
     "Then {lighten with white | darken} to raise/lower value ~N%." Use `dL`
     magnitude to phrase the nudge.
  3. **Out of gamut** — `dC` large: current "screen color" wording, trimmed to
     only claim a *hue/saturation* miss (not value).
- Show the predicted mixed swatch next to the target as today, but also a small
  "after value adjust" swatch when in state 2, so the user sees the achievable
  endpoint.
- Manual check at ≤700px that the new copy wraps cleanly.

### Stage 3 — Add a value axis: black + stronger white
**Goal**: The solver can actually reach dark and very-light targets.
**Status**: Done

- Add to `DEFAULT_PALETTE`: a black (e.g. `Ivory Black #1b1b1b`) and keep/raise
  white. Document that white/black are *value adjusters*.
- Note: existing users have a persisted palette in `localStorage`
  (`painting-tools.palette.v1`); new defaults only apply on reset. Add a brief
  hint near the "Reset palette" button that black improves dark matches.
- **Tests**: a dark brown target (low L, warm hue) now matches with
  `deltaE` below the close-match threshold using black + an earth.

### Stage 4 — Per-pigment tinting strength
**Goal**: Recipes reflect real pigment loading, not equal-weight assumption.
**Status**: Done

- Extend the palette item shape with an optional `strength` (default 1.0),
  editable in the palette UI. In `mixPaints`, weight each pigment's K/S
  contribution by `weight * strength` instead of `weight` alone.
- Seed sensible defaults (Phthalo/strong organics high; earths/white lower).
- Persist `strength` in `localStorage` (bump key to `...palette.v2` with a
  migration that defaults missing `strength` to 1.0).
- **Tests**: with phthalo `strength = 30`, a 10%-phthalo/90%-white recipe is
  far more saturated than the equal-strength model predicts; round-trip of a
  v1 palette (no `strength`) loads with `strength === 1`.

## Decisions / Open Questions

- **CIEDE2000 vs. current Euclidean ΔE76?** ΔE76 over-weights chroma at high
  saturation. Switching the scorer to ΔE2000 would improve perceptual accuracy
  but adds code. Proposed: keep ΔE76 for the search loop (cheap), but compute
  the *reported* `dL`/`dC` directly in LAB (no metric change needed for the
  decomposition). Revisit ΔE2000 only if Stage 1 isn't enough.
- **Strength defaults** are inherently approximate; expose them as editable so
  serious users can calibrate to their actual paints.

## Out of Scope

- Two-constant Kubelka–Munk (requires measured K and S spectra per pigment).
- Spectral (multi-wavelength) mixing — overkill for a zero-dependency app.

## Docs to update when done

- `AGENTS.md` design decision #9 (color mixing) — note value/chroma split and
  tinting strength.
- `docs/REQUIREMENTS.md` and `docs/ARCHITECTURE.md`.

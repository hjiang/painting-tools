# Plan 013: Crop Tool with Canvas Aspect Presets

## Goal

Add a **Crop** tool (`#tool-crop`): trim the reference to standard canvas
proportions with a draggable/resizable crop rectangle and rule-of-thirds
overlay, then promote the crop as the new reference so Grid, Posterize, and
every other tool works on exactly what will be painted.

## Clarified Requirements

- Aspect presets: **Free**, 1:1, 4:5 (8×10, 16×20), 3:4 (9×12, 18×24),
  2:3 (20×30), 5:7, 11:14, golden ratio (1.618:1). A **Rotate** button swaps
  the preset's orientation (portrait ↔ landscape).
- Crop rect interaction: drag inside to move; drag corner handles to resize.
  With a preset, aspect is locked during resize; with Free, corners resize
  independently. Minimum rect size: 32×32 image pixels. Rect is always
  clamped inside the image.
- Rule-of-thirds lines draw inside the crop rect; the area outside the rect
  is dimmed (same visual language as the Grid tool's margin dimming).
- **Apply Crop** produces the cropped image at full resolution (no
  resampling — pure pixel cut) and promotes it via
  `ImageManager.setImageData(result, 'Cropped (W×H)')`. Download also
  available. There is no "preview" state separate from the source: until
  Apply, the tool only draws an overlay on the current reference.
- Selected preset persists (`Settings`); the rect itself does not (it is
  meaningless for a different image).

## Design

### New pure module: `crop.js`

Dual-mode export. All rects are `{x, y, w, h}` in image pixels.

- `largestRectForAspect(imgW, imgH, aspectW, aspectH) → rect` — centered
  maximal rect of the given aspect inside the image. Precondition: all
  positive. Postcondition: `w/h ≈ aspectW/aspectH` within integer rounding,
  rect inside bounds.
- `clampRect(rect, imgW, imgH, minSize) → rect` — clamp position and size;
  invariant: `0 ≤ x`, `x + w ≤ imgW`, `w ≥ minSize` (same for height).
- `resizeRect(rect, handle, dx, dy, aspect, imgW, imgH) → rect` —
  `handle ∈ {'nw','ne','sw','se'}`; if `aspect` is non-null, adjust the
  secondary dimension to preserve aspect (anchor the opposite corner), then
  clamp. Pure and unit-testable without any DOM events.
- `cropImageData(imageData, rect) → ImageData` — integer-rounded rect cut;
  output dimensions `rect.w × rect.h`; input unmodified.

### Tool module: `cropTool.js`

Registers `{ id: 'crop', ... }`. `process(imageData)` draws the reference
(CSS-scaled canvas), dimmed exterior, crop rect, thirds lines, and handles
via Canvas 2D compositing — same approach as `gridOverlay.js` (no pixel
manipulation for the overlay). Pointer events map CSS coordinates → image
coordinates (scale factor from canvas backing vs. CSS size, same pattern the
underpainting tool uses). Hit priority: handles (within 12 CSS px) → inside
rect (move) → outside (drag creates a new rect, centered preset-fitting if
locked).

- Apply → `cropImageData` → `ImageManager.setImageData` (promote) — the
  source banner then offers Reset to Original, so Apply is non-destructive.
- Persists `painting-tools.crop.preset` (string) and
  `painting-tools.crop.landscape` (bool).
- `getResultImageData` returns the would-be crop for the shared
  download/promote helpers.

### DOM (`index.html`)

- `<div class="tool-view hidden" id="tool-crop">`: preset radio group (use
  the shared radio-reader helper), Rotate button, overlay canvas, Apply
  Crop button, download button.
- Scripts: `crop.js` with pure modules; `cropTool.js` after `app.js`.
- Tab placement: first, before Posterize (crop is the first decision in a
  painting workflow).

## TDD Sequence

1. Write `tests/crop.test.js`:
   - `largestRectForAspect`: landscape image + portrait preset (and vice
     versa); exact-fit aspect returns full image; 1:1 on 4×2 → centered 2×2.
   - `clampRect`: off-edge positions/sizes clamp; min size enforced.
   - `resizeRect`: aspect-locked SE drag keeps `w/h`; NW drag anchors the SE
     corner; Free mode changes one dimension; clamping during resize.
   - `cropImageData`: known 4×4 image cut to `{1,1,2,2}` yields the expected
     2×2 pixels; dimensions exact; input untouched.
2. Run tests and report **"test failed as expected."**
3. Implement `crop.js`.
4. Re-run tests, then the full suite.
5. Add DOM, styles, `cropTool.js` (overlay drawing, pointer interaction,
   promote wiring).
6. Update REQUIREMENTS (new feature), ARCHITECTURE, README, AGENTS.
7. Browser smoke test at desktop and ≤700px: every preset, rotate, drag
   interactions, promote → Grid labels/proportions match the crop.

## Validation Contract

### Automated

- New `crop` tests pass; full existing suite passes.

### Manual Browser

- Rect drags/resizes smoothly with locked aspect for each preset; thirds
  lines and dimming render correctly; Rotate swaps orientation.
- Apply Crop promotes the cut image; the source banner shows
  "Source: Cropped (…)" and Reset restores the full photo.
- Grid tool on a 4:5 crop shows square cells matching the crop.

## Non-Goals

- Arbitrary rotation/straighten (angle slider) — large interaction scope.
- Non-destructive re-editable crop state across tools (promote + Reset is
  the workflow).
- Rule-of-thirds *grid* in other tools; golden-ratio spiral overlays.
- Resampling/upscaling on apply — crop is a pure pixel cut.

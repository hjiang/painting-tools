# Plan 010: Underpainting Marker Magnifier and Comparison Zoom

## Goal

Improve Underpainting Check precision and inspection:

1. While a user drags an existing corner marker, show a live magnifier of the
   **underpainting photograph only** around that marker so the canvas corner can
   be placed accurately.
2. Display the aligned reference/underpainting comparison larger and centered.
3. Let the user zoom and pan the final layered comparison without recomputing
   the perspective warp.

## Clarified Requirements

- The drag magnifier contains only the underpainting photograph. It does not
  contain the reference or aligned comparison.
- The magnifier is centered on the marker's exact pixel-center coordinate,
  includes a crosshair, and is visible only during an active marker drag.
- The magnifier is offset from the mouse cursor or touch contact and switches
  sides near viewport edges so it stays visible and does not cover the marker.
- The magnifier is approximately 168 CSS pixels at 4× the marking image's
  current display scale.
- Magnifier rendering must not run the projective warp.
- The final comparison is centered and fits the available width up to 960 CSS
  pixels at 100% zoom, even when that upscales a small working image.
- Final-comparison zoom ranges from 50% to 400%, with a slider, −/+, and Reset
  controls. The percentage is relative to the fit size, not source pixels.
- Both comparison layers zoom together. Zooming changes only CSS layout and
  must never resize backing canvases or rerun `warpPerspective`.
- The zoomed comparison is pannable in its scroll viewport. Mouse/pointer drag
  pans the viewport; native scrolling remains available.
- Zoom applies only to the final comparison, not the corner-marking image.
- Opacity remains independent of zoom.

## Design

### DOM

Add to the Underpainting Check view:

- `#underpainting-magnifier`: fixed-position canvas, hidden when no marker drag
  is active.
- `#underpainting-comparison-viewport`: centered scroll viewport around the
  existing comparison stage.
- `#underpainting-zoom-out`, `#underpainting-zoom-in`,
  `#underpainting-zoom-reset`: zoom buttons.
- `#underpainting-zoom`: range input (`50..400`, step `25`, default `100`).
- `#underpainting-zoom-label`: visible percentage.

### Magnifier

On successful pointer capture of an existing handle:

1. Keep the existing marker point as the magnifier center.
2. Draw the underpainting image canvas into the magnifier with `drawImage`.
   Compute the source crop from the marking canvas's current CSS-to-bitmap
   scale so the result is 4× the on-screen marking image.
3. Draw a centered crosshair over the crop.
4. Position the fixed magnifier above/right of the pointer by default, switching
   horizontally or vertically when needed and clamping to the viewport.
5. Redraw after every accepted active-pointer move.
6. Hide it before any drag completion/cancellation, Undo, Reset, replacement
   upload, decode failure, or resource cleanup.

Magnifier drawing failure is non-fatal: hide the magnifier and preserve the
core marker-drag interaction.

### Comparison Layout and Zoom

Maintain a fit size derived from the current reference aspect ratio and the
comparison viewport width:

```text
fitWidth = min(960, available viewport width)
fitHeight = fitWidth * referenceHeight / referenceWidth
renderedWidth = fitWidth * zoomPercent / 100
renderedHeight = fitHeight * zoomPercent / 100
```

Set the comparison stage's CSS width/height to the rendered size while both
canvas backings remain at the capped reference dimensions. Preserve the viewed
center when zoom changes, then clamp scroll offsets. At 100%, center the stage.

Pointer-drag panning operates on `scrollLeft`/`scrollTop` and is independent of
marker drag because it is scoped to the comparison viewport.

## TDD Sequence

1. Extend `tests/underpaintingAccuracyTool.test.js` with failing behavioral
   tests for magnifier rendering/lifecycle, edge-aware positioning, zoom controls,
   no-warp zooming, shared layer dimensions, centered 960px fit, and panning.
2. Run the focused test and report **“test failed as expected.”**
3. Add the required static DOM and styles.
4. Implement magnifier and zoom/pan behavior in
   `underpaintingAccuracyTool.js`.
5. Run the focused test and all existing tests.
6. Update requirements, architecture, README, and AGENTS documentation.
7. Perform a browser smoke test at desktop and 320px widths.

## Validation Contract

### Automated

- Magnifier becomes visible only after a successful existing-handle drag starts.
- Its draw source is `#underpainting-image-canvas`; no reference/aligned canvas
  and no warp call is used.
- Active-pointer movement redraws the magnifier around the updated marker.
- Up, cancel, lost capture, reset, undo, replacement, and failed capture hide it.
- Magnifier position remains within representative desktop and 320px viewports.
- Comparison fit width is centered and capped at 960px.
- Zoom clamps to 50–400%, updates both layers together, and never changes canvas
  backing dimensions or warp count.
- Zoom Reset returns to 100%.
- Pointer panning changes viewport scroll offsets only while a pan is active.
- Opacity changes remain independent and do not reset zoom.
- Every `tests/*.test.js` file passes.

### Manual Browser

- Drag each corner with mouse and touch emulation; verify the magnifier is not
  covered by the pointer and its crosshair tracks the exact marker.
- Verify magnifier behavior at all viewport edges.
- Verify the final comparison is centered and visibly larger than the previous
  540px layout on desktop.
- Exercise 50%, 100%, 200%, and 400% zoom; pan to all edges; adjust opacity at
  each zoom.
- Confirm 320px layout has no page-level horizontal overflow.
- Record unavailable real-device and browser checks as release risks.

## Non-Goals

- Magnifying the reference or aligned overlay during marker drag.
- Zooming the corner-marking image.
- Pinch-to-zoom or wheel-to-zoom gestures.
- Rewarping continuously during drag or zoom.
- Persisting zoom across page reloads.
- Changing alignment resolution, homography, or buffer caps.

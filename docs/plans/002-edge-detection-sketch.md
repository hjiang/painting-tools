# Plan 002: Edge Detection & Rough Sketch Tool

## Overview

Add a tool that detects edges in a photo and renders a rough line-drawing sketch.
Painters use this to:
- See the essential structural lines independent of value masses
- Use as a tracing reference or under-drawing guide
- Check composition strength through pure line-work

## Algorithm: Sobel Edge Detection

Sobel is chosen over Canny because it's simpler to implement correctly without
dependencies and gives good results for artistic sketch purposes.

### Pipeline

```
Source Image
  → Convert to grayscale (Rec. 601 luminance)
  → Apply Sobel operator (compute gradient magnitude)
  → Normalize magnitude to 0–255
  → Apply threshold: magnitude > threshold → edge pixel, else → background
  → Output: sketch ImageData (dark lines on light background)
```

### Sobel Kernels

```
Gx = [[-1, 0, +1],        Gy = [[-1, -2, -1],
      [-2, 0, +2],              [ 0,  0,  0],
      [-1, 0, +1]]              [+1, +2, +1]]
```

Gradient magnitude: `G = sqrt(Gx² + Gy²)`, clamped to 0–255.

### Thresholding

- `threshold` parameter (0–255): gradient magnitudes above this value become
  edge pixels (black); below become background (white in sketch mode).
- Lower threshold = more edges (noisier). Higher = fewer edges (cleaner).
- Default: 50.

### Edge Pixels

Edge pixels are rendered as dark (RGB 30,30,30) on white (RGB 255,255,255)
for a pencil-sketch look. Optionally invert for white lines on dark.

## Parameters

| Parameter   | Type    | Range     | Default | Description                            |
|-------------|---------|-----------|---------|----------------------------------------|
| threshold   | number  | 0–255     | 50      | Gradient magnitude cutoff              |
| invert      | boolean | —         | false   | Swap light/dark (white lines on black) |

## New File: `edgeDetect.js`

```js
// Pure function, follows existing pattern from posterize.js
// detectEdges(imageData, options) → { imageData }
//   imageData  : ImageData (RGBA) at original resolution
//   options.threshold : number (0–255), gradient cutoff
//   options.invert    : boolean, swap edge/background colors
```

Follow the dual-mode export pattern: global declaration + `module.exports`.

## New File: `tests/edgeDetect.test.js`

Tests for:
- Uniform image (all same color) → no edges (threshold > 0)
- Sharp vertical edge (left black, right white) → strong edge detected
- Sharp horizontal edge (top black, bottom white) → strong edge detected
- Diagonal edge
- Threshold: very high threshold → no edges; very low → many edges
- Invert: edge pixels swap with background
- Alpha preservation
- Edge cases: 1x1 image, 2x2 image, single-pixel-width image

## UI Changes

### `index.html`

Add a third view section (togglable), containing:
- A sketch canvas
- A threshold slider (range 0–255, default 50)
- An invert checkbox
- A download button for the sketch

Layout options (need to pick one):

**Option A: Third panel in row** — `[Original | Posterized | Sketch]`
- Pro: all visible at once for comparison
- Con: cramped on mobile (already 2 columns → stacked), 3 panels means very
  small canvases on desktop

**Option B: Toggle between posterized and sketch view**
- Pro: keeps the current 2-panel layout, sketch replaces posterized when active
- Con: can't see posterized and sketch simultaneously

**Option C: Third panel on its own row (like histogram)**
- Pro: full-width sketch below the posterized pair, good for mobile
- Con: more vertical scrolling

**Recommendation: Option C** — a collapsible "Sketch" section below the
posterized pair. Opens when user interacts with it, renders at comfortable
size. Fits the existing layout pattern (histogram is already a row below the
canvases).

### `style.css`

- `.sketch-section`: collapsible container below histogram
- Sketch canvas: same styling as histogram canvas (max-width: 100%, dark bg)
- Threshold slider: similar to value slider
- Toggle button/checkbox for invert

### `app.js`

New wiring:
- `detectEdgesAndRender()` — called when threshold/invert changes
- Re-run edge detection when source image changes (same image, new params)
- Download sketch button
- Collapsible section toggle

## Edge Detection at Full Resolution

Like posterization, edge detection runs at the original image resolution.
The visible canvas is CSS-scaled. Downloads export at full resolution.

Performance: Sobel is O(width × height) with a 3×3 kernel. For a 12 MP image,
this is about 36 million operations — well under 200 ms in modern JS.

## Out of Scope for This Feature

- Line thinning / skeletonization
- Adaptive thresholding (Otsu's method) — could be a follow-up
- Edge-aware smoothing (bilateral filter pre-pass)
- Color edge detection (separate edges per channel)
- Vector output (SVG tracing)

## File Changes Summary

| File                     | Action | Description                              |
|--------------------------|--------|------------------------------------------|
| `edgeDetect.js`          | NEW    | Edge detection pure function             |
| `tests/edgeDetect.test.js` | NEW  | Unit tests for edge detection            |
| `index.html`             | MODIFY | Add sketch section, controls             |
| `app.js`                 | MODIFY | Wire edge detection pipeline             |
| `style.css`              | MODIFY | Style sketch section, threshold slider   |
| `docs/REQUIREMENTS.md`   | MODIFY | Add edge detection to feature list       |
| `docs/ARCHITECTURE.md`   | MODIFY | Document edge detection module           |

## Implementation Order (TDD)

1. Create `edgeDetect.js` with `detectEdges()` function
2. Create `tests/edgeDetect.test.js`, write failing tests, then implement
3. Update `index.html` with sketch section HTML
4. Update `style.css` with sketch section styles
5. Update `app.js` to wire everything together
6. Update docs
7. Manual visual testing with sample photos

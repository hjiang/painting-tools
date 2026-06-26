# Plan 006: Clean Sketch via Canny Edge Detection

## Problem

The current Sobel edge detector (Plan 002) produces output that is too "dirty":
many isolated dots, short lines, and noise specks from photo texture/grain.
Three root causes:

1. **No noise suppression** — Sobel responds to every local gradient, including
   JPEG artifacts and subtle texture (sky grain, skin pores, paper texture).
2. **No edge thinning** — edges are 2–3 pixels wide, especially at strong
   boundaries, making lines look fuzzy rather than crisp.
3. **No connectivity filtering** — isolated high-gradient specks pass the
   threshold alongside real contour lines; there's no distinction between a
   single dot and a continuous edge.

## Solution: Canny Edge Detector

The Canny algorithm (1986) is the standard for clean, single-pixel edge maps.
It adds four stages beyond the current pipeline:

```
Source Image → Grayscale → Gaussian Blur → Sobel Gradient → NMS → Hysteresis → Output
                (exists)      (NEW)         (exists)       (NEW)    (NEW)
```

### Stage 1: Gaussian Blur (NEW)

Convolve the grayscale image with a Gaussian kernel. This suppresses
high-frequency noise (texture, grain) before gradient computation.

- Parameter: `blur` (σ, default 2.0)
- σ = 0 disables blur (no-op)
- Kernel size: `ceil(6σ + 1)`, clamped to odd ≥ 3
- Implementation: separable 1D convolution (horizontal pass then vertical pass)
  for O(2·kernel_size·N) instead of O(kernel_size²·N)

### Stage 2: Sobel Gradient (EXISTS, minor change)

Same as current — compute `Gx`, `Gy`, magnitude, and **direction** (new).
Direction `θ = atan2(Gy, Gx)` rounded to one of 4 angles: 0°, 45°, 90°, 135°.

### Stage 3: Non-Maximum Suppression (NEW)

For each pixel, compare its gradient magnitude to its two neighbors in the
gradient direction. If it's not the local maximum, suppress it to 0.

This thins edges to **single-pixel width**.

| θ rounded | Compare with |
|-----------|-------------|
| 0° (→)    | left, right |
| 45° (↗)   | top-right, bottom-left |
| 90° (↑)   | top, bottom |
| 135° (↖)  | top-left, bottom-right |

### Stage 4: Double Threshold + Hysteresis (NEW)

- **Strong edges**: magnitude > `highThreshold` → definitely edge
- **Weak edges**: `lowThreshold` < magnitude ≤ `highThreshold` → maybe edge
- **Non-edges**: magnitude ≤ `lowThreshold` → suppressed

Then **hysteresis** (edge tracking): a weak pixel becomes an edge **only if**
it is 8-connected to a strong edge pixel. This preserves continuous contours
while eliminating isolated noise specks.

Uses a queue-based BFS flood-fill for the connectivity traversal.

### Parameters

| Parameter     | Type   | Range   | Default | Description                              |
|---------------|--------|---------|---------|------------------------------------------|
| `threshold`   | number | 0–255   | 50      | High threshold (strong edges)            |
| `blur`        | number | 0–10    | 2.0     | Gaussian sigma (0 = off)                 |
| `invert`      | bool   | —       | false   | White lines on dark (swap edge/bg color) |

`lowThreshold` is derived automatically: `Math.max(5, threshold * 0.4)`.
This keeps the UI simple (no second threshold slider) while following the
standard Canny 2.5:1 to 3:1 ratio recommendation.

### Performance

For a 12 MP image (4000×3000):
- Gaussian blur (separable): ~2 × 7 × 12M = 168M ops
- Sobel: 9 × 12M = 108M ops
- NMS: ~8 × 12M = 96M ops
- Hysteresis: ~12M pixels scanned, only weak pixels queued

Total: under 500M operations. Modern JS handles this in < 500 ms.
Acceptable for interactive use with a working-spinner pattern.

## File Changes

| File                          | Action  | Description                                    |
|-------------------------------|---------|------------------------------------------------|
| `edgeDetect.js`               | REWRITE | Replace Sobel with full Canny pipeline         |
| `tests/edgeDetect.test.js`    | REWRITE | New tests for blur, NMS, hysteresis stages     |
| `sketchTool.js`               | MODIFY  | Add blur slider, update parameter wiring       |
| `index.html`                  | MODIFY  | Add blur slider control in sketch section      |
| `style.css`                   | MODIFY  | Style new blur slider                          |
| `docs/ARCHITECTURE.md`        | MODIFY  | Update edge detection section                  |
| `docs/REQUIREMENTS.md`        | MODIFY  | Update sketch tool feature description         |

## New Function Contracts (edgeDetect.js)

```js
// Internal helpers (also exported for testing)

/**
 * Generate a 1D Gaussian kernel.
 * @param {number} sigma - Standard deviation
 * @param {number} [size] - Kernel size (auto-computed if omitted)
 * @returns {Float64Array} Normalized 1D kernel
 */
function gaussianKernel1D(sigma, size)

/**
 * Apply separable Gaussian blur to a grayscale image.
 * @param {Uint8Array} gray - Grayscale pixel values (length = width * height)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} sigma - Gaussian sigma
 * @returns {Uint8Array} Blurred grayscale values
 */
function gaussianBlur(gray, width, height, sigma)

/**
 * Apply non-maximum suppression to gradient data.
 * @param {Float32Array} magnitude - Gradient magnitude per pixel
 * @param {Float32Array} direction - Gradient direction per pixel (radians)
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} Suppressed magnitude (0 where non-maximum)
 */
function nonMaxSuppression(magnitude, direction, width, height)

/**
 * Apply hysteresis thresholding.
 * @param {Uint8Array} nms - NMS-suppressed magnitudes
 * @param {number} width
 * @param {number} height
 * @param {number} lowThreshold
 * @param {number} highThreshold
 * @param {Uint8Array} outDir - Gradient direction per pixel (for weak-edge neighbor check)
 * @returns {Uint8ClampedArray} Binary edge map (255 = edge, 0 = non-edge)
 */
function hysteresis(nms, width, height, lowThreshold, highThreshold)

/**
 * Full Canny edge detection pipeline.
 * @param {ImageData} imageData
 * @param {{ threshold?: number, blur?: number, invert?: boolean }} [options]
 * @returns {ImageData}
 */
function detectEdges(imageData, options)
```

## Implementation Order (TDD)

1. Write `gaussianKernel1D` + tests (verify normalization, shape, edge cases)
2. Write `gaussianBlur` + tests (uniform image unchanged, impulse response, edge preservation)
3. Write Sobel with direction output + tests (direction angles on known edges)
4. Write `nonMaxSuppression` + tests (ramp image, known edge orientations)
5. Write `hysteresis` + tests (connectivity, weak-isolated-suppressed, strong-always-kept)
6. Wire up full `detectEdges` pipeline + integration tests
7. Update `index.html` with blur slider
8. Update `style.css`
9. Update `sketchTool.js` with blur control wiring
10. Update docs
11. Manual visual testing with real photos

## UI Mockup

```
┌─ Rough Sketch ──────────────────────────────┐
│                                              │
│  Blur:    [=======|==============] 2.0       │
│  Threshold: [===|=================] 50       │
│  □ Invert (white lines on dark)              │
│                                              │
│  ┌──────────────────────────────────┐        │
│  │                                  │        │
│  │        Sketch Canvas             │        │
│  │                                  │        │
│  └──────────────────────────────────┘        │
│                                              │
│  [Download Sketch]  [Use as New Reference]   │
└──────────────────────────────────────────────┘
```

## Edge Cases to Handle

- **σ = 0**: skip blur entirely (passthrough)
- **Image too small for kernel**: if width or height < kernel size, skip blur
- **All-zero NMS**: hysteresis returns all-non-edge
- **Very low highThreshold → everything strong**: all weak pixels promoted
- **Very high highThreshold → nothing strong**: no edges at all
- **Single-pixel image**: border pixels → background (unchanged behavior)
- **lowThreshold ≥ highThreshold**: clamp low to high - 1

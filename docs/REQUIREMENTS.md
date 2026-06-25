# Requirements: Painting Value Study Tool

## Problem Statement

A painter learning value structure needs to see a reference photo reduced to a
limited number of tonal values (e.g., 2, 3, 5, 9). This mirrors the traditional
painting process:
1. **Block-in** — 2–3 values establish the composition and major masses
2. **First pass** — 4–5 values add mid-tones and secondary planes
3. **Refinement** — 7–9 values bring finer form and detail

A good tool lets the painter load a photo and instantly see it at any value
count, helping them decide what to simplify at each stage.

## Core Features

### F1: Value Posterization
Convert any uploaded photo to a posterized image that uses exactly `N` discrete
values.
- Input: a common image format (JPEG, PNG, WebP)
- Output: a posterized image with `N` equal-interval value bands
- `N` configurable from 2 to 12 (covers the practical painting range)
- **Two modes**:
  - **Grayscale** — convert to luminance, posterize, output grayscale image
  - **Color** — convert to HSL, quantize lightness only, preserve hue & saturation

### F2: Before / After Split View
Show the original photo and posterized result side by side (or with a draggable
slider) so the painter can compare.

### F3: Download Result
Export the posterized image at original resolution as PNG.

### F4: Histogram
Display a value histogram below the posterized image showing the distribution
of values across the `N` bands. Each band is shown as a bar whose height
represents the pixel count in that band.

### F5: Edge Detection / Rough Sketch
Detect edges in the uploaded photo and render a rough line-drawing sketch.
- Uses the Sobel operator for edge detection (3×3 kernel, gradient magnitude)
- Configurable threshold (0–255) controls edge sensitivity
- Invert option for white lines on dark background
- Collapsible section below the posterized view
- Download the sketch as PNG at original resolution

### F6: Grid Overlay
Overlay a configurable grid on the uploaded photo to aid accurate initial sketching.
- Configurable rows (2–12) and columns (2–12)
- Three preset line colors: white, black, red
- Line width control (1–4 px)
- Dashed or solid line style
- Optional row/column labels (A, B, C… / 1, 2, 3…)
- Optional diagonals within each cell
- Square cells mode: forces cells to be perfect squares
  - Auto Rows/Cols toggle: when on, adjusting one dimension auto-computes
    the other from the image aspect ratio
  - Dims margins outside the grid area
- Download gridded photo at original resolution as PNG

### F7: Image Lightening
Lighten the uploaded photo by blending it toward white. Useful for printing
reference images that consume less ink and are easier to mark up with pencil
or paint.
- Blends every pixel toward white by a configurable percentage (0–100%)
- 0% = original image, 100% = pure white
- Preserves the original colors (just fades them)
- Side-by-side comparison of original vs lightened
- Download the lightened image at original resolution as PNG

### F8: Layer Isolation (Stretch Goal)
For a given `N`, show ONLY the shapes that belong to a specific value band.
Useful for tracing or studying individual value masses.

## Non-Functional Requirements

- **Works offline** — all processing happens client-side (no upload to a server)
- **Fast** — posterization completes in under 200 ms for a 12 MP image
- **Simple UI** — one image, one slider, one result
- **Works on mobile** — the painter uses a phone to reference while at the easel

## Out of Scope (v1)

- Line thinning / skeletonization
- Adaptive thresholding (Otsu)
- Batch processing
- Palette suggestions or color matching
- Composition guides (golden ratio, rule of thirds) — separate tool idea

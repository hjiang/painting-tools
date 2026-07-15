# Requirements: Painting Tools

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

### F5: Edge Detection / Clean Sketch
Detect edges in the uploaded photo and render a clean single-pixel line sketch.
- Uses the Canny edge detector: Gaussian blur → Sobel gradient →
  non-maximum suppression → hysteresis thresholding
- Configurable blur (σ 0–5) to suppress photo texture and noise
- Configurable threshold (0–255) controls edge sensitivity
- Invert option for white lines on dark background
- Download the sketch as PNG at original resolution

### F6: Grid Overlay
Overlay a configurable grid on the uploaded photo to aid accurate initial sketching.
- Configurable rows (2–12) and columns (2–12)
- Three preset line colors: white, black, red
- Line width control (1–4 px)
- Dashed or solid line style
- Optional row/column labels (A, B, C… / 1, 2, 3…)
- Optional crossed diagonals within each cell (both corner-to-corner directions)
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

### F9: Promote Output to Reference Image
After processing an image with any tool, promote the output to become the new
source image for all tools. Enables operation chaining — e.g., lighten then
posterize, or posterize then add a grid.
- "Use as New Reference" button in each tool's download section
- Source banner shows what was applied and offers a "Reset to Original" button
- Preserves the originally uploaded image for reset at any time

### F10: Color Mixer / Paint Recipe
Sample a color from the photo and show how to mix it from a paint palette.
- Click the image to sample the **average color** of pixels inside a small
  circle (configurable radius).
- Mix paints **subtractively** (Kubelka-Munk), not by averaging RGB, because
  the photo is transmitted light (additive) while paint is reflected light
  (subtractive). Blue + yellow paint makes green; RGB-averaging makes gray.
- Output a recipe: which pigments and what percentages best approximate the
  sampled color, plus a predicted swatch and a CIELAB ΔE closeness score.
- Report when a sampled color is a **screen color** outside the paint gamut
  (large ΔE — brighter / more saturated than pigment can reach).
- The palette is **configurable** (name + color per paint) and persisted to
  `localStorage`. Default palette: Cadmium Scarlet, Phthalo Blue, Burnt Umber,
  Yellow Ochre, Flake White, Ultramarine Blue, Lemon Yellow, Alizarin Crimson.

## Non-Functional Requirements

- **Works offline** — all processing happens client-side (no upload to a server)
- **Fast** — posterization completes in under 200 ms for a 12 MP image
- **Simple UI** — one image, one slider, one result
- **Works on mobile** — the painter uses a phone to reference while at the easel

## Out of Scope (v1)

- Line thinning / skeletonization
- Adaptive thresholding (Otsu)
- Batch processing
- Composition guides (golden ratio, rule of thirds) — separate tool idea

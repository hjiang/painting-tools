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
Posterize, Sketch, Grid, Lighten, and View can each promote their output to become
the new source image for all processing tools. This enables operation chaining
— e.g., lighten then posterize, or posterize then add a grid.
- "Use as New Reference" button in the download section of each promoting tool
- Source banner shows what was applied and offers a "Reset to Original" button
- Preserves the originally uploaded image for reset at any time
- **Excluded:** Color Mixer and Underpainting Check are visual-only analysis
  tools and do not produce a promotable result.

### F10: Underpainting Accuracy Overlay
Upload a photograph of an underpainting, mark the four corners of its canvas,
rectify the photographed canvas to match the reference-image perspective, and
visually compare the two by adjusting overlay opacity.

- **One reference, one underpainting.** The image already loaded into
  `ImageManager` is the reference. The tool owns a separate in-memory
  underpainting upload.
- **Four draggable corner markers** in semantic order:
  top-left → top-right → bottom-right → bottom-left. Supports rotated and
  upside-down photographs — the user identifies canvas corners, not the tool.
- **Projective warp** uses a four-point homography, not an affine stretch.
- **Visual comparison only** — the reference is the bottom layer and the
  rectified underpainting is the top layer with a 0–100% opacity slider.
  Default opacity is 50%.
- **Capped working resolution** (~2 MP) for mobile performance. No
  full-resolution aligned result is created.
- **Precision drag magnifier:** while an existing corner marker is dragged, a
  4×, 168-CSS-pixel loupe shows only the underpainting photograph around the
  marker with a centered crosshair. It avoids the pointer and viewport edges,
  hides when dragging ends, and never runs the projective warp.
- **Large centered comparison:** at 100% zoom, the layered comparison fits the
  available width up to 960 CSS pixels and is centered. Small working images may
  be CSS-upscaled for inspection without changing their backing resolution.
- **Comparison zoom and pan:** zoom is adjustable from 50–400% in 25% steps via
  a slider, −/+, and Reset controls. Both reference and aligned layers zoom
  together using CSS only; zoom and pan never resize backing canvases or rerun
  the warp. The corner-marking image itself is not zoomed.
- **Undo Last** and **Reset Corners** controls. Undo removes the most recently
  placed point; Reset clears all points and hides the comparison.
- **Recoverable errors:** invalid/corrupt uploads, decode failures, singular
  geometry, and out-of-memory states are caught and displayed without breaking
  the tab.
- **Assumptions:** The reference must represent the whole physical canvas,
  including any crop and aspect ratio. Corner-placement errors can look like
  painting errors.
- **Out of scope:** automatic corner detection, edge/difference/heatmap/pass-fail
  modes, blink/wipe view, pinch/wheel zoom gestures, numerical scores, download,
  print, persistence, promotion, and full-resolution rectification.

### F12: Flip, Squint & Grayscale View
View the reference photo with any combination of horizontal flip, grayscale
conversion, and adjustable blur (squint simulation). All three are real-time
pure-pixel transforms — display, download, and promote at full resolution.
- **Flip Horizontal** — mirror the image to expose drawing errors
- **Grayscale** — desaturate using Rec. 601 luminance to judge values
  independent of hue
- **Squint (blur)** — adjustable box blur (0–8 px radius) to see value masses
  clearly, simulating squinting
- Pipeline order is fixed: flip → grayscale → blur
- Controls persist across reload via localStorage
- Download the view result at original resolution as PNG
- "Use as New Reference" enables chaining (e.g., flip then posterize)

### F11: Color Mixer / Paint Recipe
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

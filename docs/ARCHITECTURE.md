# Architecture: Painting Tools

## Technology Choice

A **single-page web app** (HTML + CSS + vanilla JS). No framework, no build
step, no server. The painter opens `index.html` in a browser, loads a photo,
and gets results instantly.

Why this over alternatives:

| Option | Pro | Con |
|--------|-----|-----|
| Web (Canvas API) | Zero install, mobile-friendly, offline-capable | Harder to batch-process |
| Python CLI (Pillow) | Familiar, scriptable | Not visual, harder for non-technical users |
| Desktop (Qt/GTK) | Native feel | Heavy dep, platform-specific builds |

## High-Level Design

The app uses a **tool registry pattern**: a shared shell manages image loading
and tab switching, while each tool self-registers and owns its own UI + logic.

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser                                   │
│                                                                  │
│  ┌──────────┐   ┌──────────────────────────────────┐            │
│  │ File     │──▶│         ImageManager             │            │
│  │ Input    │   │  (load once, share imageData)    │            │
│  └──────────┘   └──────────┬───────────────────────┘            │
│                            │ notify                              │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              ToolShell (registry + tabs)                   │   │
│  │  activate('view') activate('posterize') activate('grid')  │   │
│  │  activate('sketch') activate('lighten') ...               │   │
│  └────────┬──────────────┬──────────────┬──────────┬─────────┘   │
│           │ mount/process│              │          │             │
│           ▼              ▼              ▼          ▼             │
│  ┌──────────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Posterize Tool  │  │ Grid Tool│  │Sketch Tool│ │Lighten   │  │
│  │  ┌────────────┐  │  │ drawGrid │  │detectEdges│ │ lighten()│  │
│  │  │ posterize()│  │  └──────────┘  └──────────┘  └──────────┘  │
│  │  │ histogram()│  │                                             │
│  │  └────────────┘  │                                             │
│  └──────────────────┘                                             │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. User selects a file → `ImageManager.load(file)` reads it asynchronously
2. Image decoded → `ImageData` stored in `ImageManager`
3. `ImageManager` notifies `ToolShell` listener
4. `ToolShell` calls active tool's `process(imageData)`
5. The tool runs its algorithm, draws to its canvases, updates its controls
6. User switches tabs → `ToolShell.activate(id)` → new tool's `mount()` + `process()`
7. User changes a tool's parameters → tool re-runs its algorithm directly
8. Download: tool exports its computed `ImageData` as PNG blob
9. **Promote**: User clicks "Use as New Reference" on a tool's output →
   `ImageManager.setImageData(result, label)` replaces the source, preserving
   the original in `_originalImageData`. All tools re-render with the new
   source, enabling chaining (e.g., lighten → posterize → grid). A banner
   shows the modified state with a "Reset to Original" button.

### Underpainting Accuracy Data Flow

The Underpainting Check tool maintains a second, in-memory image alongside
the shared reference. It follows a two-image data flow:

```
ImageManager current ImageData ── resize to working reference ─┐
                                                               ├─ layered comparison
underpainting file ── decode/downscale ── mark four corners ──┤
                                         │                     │
                                         └─ homography + warp ─┘
```

The tool caches the last reference `ImageData` object identity. Tab activation
and window resize with the same object update only CSS layout and guides; they
never resize or warp again. A genuinely new reference rebuilds the capped
reference and recomputes if four valid underpainting corners are available.

During an existing-handle drag, a fixed-position 168px loupe draws a 4× crop
from the marking `underpainting-image-canvas`. The crop is centered on the
marker's exact pixel-center coordinate, not the pointer coordinate, and a
crosshair shows the placement point. The loupe switches sides near viewport
edges, is hidden on every drag termination/cancellation path, and never reads
from the reference/aligned canvases or invokes the homography warp.

The final layered comparison has a CSS-only view transform. A centered fit size
uses the available width up to 960px; zoom controls scale the common comparison
stage from 50–400% while both canvas backings stay at capped reference
resolution. The scroll viewport preserves the viewed center across zoom changes
and supports pointer-drag panning. Opacity, zoom, and pan are mutually
independent and none reruns `warpPerspective`.

### Working Resolution

Both the reference and the underpainting are capped to ~2 MP for mobile
performance using a two-constraint scale:

```
scale = min(1, 2048 / max(width, height), sqrt(2_000_000 / (width * height)))
```

Output dimensions are rounded to integers of at least 2 pixels while retaining
aspect ratio as closely as possible. The warped output dimensions match the
capped reference dimensions. No full-resolution underpainting `ImageData` is
retained after downscaling.

Peak buffer ownership is bounded: during alignment, at most five full capped
RGBA buffers/backings are held simultaneously (capped underpainting, marking
canvas, lower comparison canvas, temporary warped output, upper comparison
canvas). Temporary buffers are released immediately after drawing. The
168×168 magnifier and display-resolution guide are small UI backings and do not
add another full capped-image buffer.

### Algorithm: Value Posterization

Given values in [0, 255] and desired level count `N`:

```
band_width = 256 / N
for each pixel:
    band_index = floor(value / band_width)
    output = band_index * band_width + band_width / 2
```

This maps the continuous 0–255 range into `N` evenly-spaced bands. Each band
gets the **midpoint** value of its range, preserving overall brightness balance.

Example for N=3: bands are [0–85), [85–170), [170–255] → outputs 42, 127, 212.

**Optional smoothing pre-pass:** Before posterization, a Simplify slider (0–8 px)
applies `boxBlur(imageData, radius, 2)` when radius > 0. The same smoothed source
is used for posterization, histogram, band isolation, promote, and download.
`boxBlur` is reused from `viewTransforms.js` — no duplication. Radius 0 skips the
pass entirely, preserving the original pixel-exact path.

#### Grayscale Mode
- Convert RGB to luminance: `L = 0.299*R + 0.587*G + 0.114*B`
- Quantize L to N bands → set R=G=B=quantized_L

#### Color Mode
- Convert RGB to HSL
- Quantize the L (lightness) channel to N bands
- Keep original H (hue) and S (saturation) intact
- Convert HSL back to RGB

This preserves the color identity of objects while forcing them into N value
levels — useful for planning a painting with a limited palette.

### Algorithm: Image Lightening

Blends each pixel toward white by a configurable percentage:

```
factor = amount / 100
for each pixel:
    R' = R + (255 - R) * factor
    G' = G + (255 - G) * factor
    B' = B + (255 - B) * factor
    A' = A  (alpha preserved)
```

- 0% = original image, 100% = pure white
- Preserves color relationships while reducing ink density
- Useful for printing faint reference images to mark up

### Algorithm: Edge Detection (Canny)

Full Canny edge detection pipeline for clean, single-pixel edge maps:

```
Source Image → Grayscale (Rec. 601)
  → Gaussian Blur (separable 1D convolution)
  → Sobel Gradient (magnitude + 8-sector direction)
  → Non-Maximum Suppression (ahead/behind tiebreaker)
  → Double-Threshold Hysteresis (BFS flood-fill)
  → Output
```

1. **Gaussian blur**: Separable 1D convolution (horizontal then vertical pass)
   with kernel size `2·ceil(3σ)+1` (clamped to max 31). σ=0 bypasses blur.

2. **Sobel gradient**: 3×3 Sobel kernels produce gradient magnitude
   (clamped 0–255) and direction quantized to 8 sectors (0–7), encoding both
   angle and sign. This allows NMS to distinguish which side of an edge is
   "ahead" in the gradient direction.

3. **Non-Maximum Suppression (NMS)**: For each pixel, compare magnitude with
   the "ahead" neighbor (in gradient direction) and "behind" neighbor
   (opposite). Keep only if `m > ahead && m >= behind`. The strict check on
   "ahead" ensures consistent single-pixel thinning at perfectly sharp step
   edges.

4. **Double-threshold hysteresis**:
   - Strong edges (> `threshold`) are always kept
   - Weak edges (> `Math.max(5, Math.round(threshold * 0.4))`, ≤ `threshold`) are kept only if
     8-connected to a strong edge (BFS flood-fill)
   - Everything else suppressed
   This eliminates isolated noise specks while preserving continuous contours.

### Algorithm: Subtractive Paint Mixing (Color Mixer)

A screen emits **additive** light (RGB), so averaging two screen colors
simulates mixing light. Paint is **subtractive** — pigments absorb wavelengths,
so mixing must happen in reflectance space. We use the Kubelka-Munk
single-constant model, per RGB channel, in linear light:

```
linearize each paint channel (sRGB → linear reflectance R)
K/S      = (1 - R)^2 / (2R)          # reflectance → absorption/scatter ratio
(K/S)mix = Σ wᵢ · (K/S)ᵢ              # mix by weight in K/S space
Rmix     = 1 + (K/S) - sqrt((K/S)^2 + 2·(K/S))   # invert back to reflectance
delinearize Rmix → sRGB
```

This makes blue + yellow → green (additive RGB averaging gives gray) and
mixing many pigments → mud, never brighter than white — exactly like paint.

**Recipe search.** `matchColor` searches recipes of 1–3 pigments on a
percentage grid, scoring each candidate mix against the target by **CIELAB ΔE**
(perceptual distance). Simpler recipes win ties (a larger recipe is only kept
if it beats the best smaller one by a ΔE margin). The result is decomposed
into **chroma distance (ΔC)** and **signed lightness difference (ΔL)**. When
chroma is within tolerance, the hue is reachable with paint — a `valueHint`
(`'lighten'` / `'darken'`) signals whether the target needs value adjustment
(add white or black). Only genuine hue/saturation misses are flagged as
"out of gamut." Each pigment has an optional `strength` multiplier for
tinting power; `mixPaints` weights K/S contributions by `weight × strength`.

**Palette persistence.** The palette (name + hex + optional strength per
paint) is stored in `localStorage` under `painting-tools.palette.v2`.
A v1 → v2 migration adds the strength field when old v1 data is present.
The default palette has 10 paints including Titanium White and Ivory Black
for value adjustment.

### Algorithm: Underpainting Perspective Warp

Rectification uses a four-point projective homography solving a full 8×8
linear system with point normalization, Gaussian elimination with partial
pivoting, and bilinear inverse-mapping rasterization.

**Geometry convention:** All points are stored as pixel-center coordinates
in `[0, width-1] × [0, height-1]`. The homography maps
**destination/reference → source/underpainting**. The four destination corners
are `(0,0)`, `(W-1,0)`, `(W-1,H-1)`, `(0,H-1)`.

**Normalization:** Each four-point set is normalized by translating its
centroid to the origin and scaling by `√2 / meanDistance`. This improves
numerical conditioning. After solving in normalized space, the result is
denormalized.

**Solving:** For each normalized correspondence `(x,y) → (u,v)`, two rows are
appended to an 8×8 system. Gaussian elimination with partial pivoting solves
`A·q = b`. The solution is checked for pivot quality, finite values, and
corner reprojection error ≤ `1e-6 × max(1, sourceDiagonal)`.

**Rasterization:** For every destination pixel `(x,y)`, the homography maps
back to a floating-point source coordinate. Bilinear interpolation uses
premultiplied alpha to avoid color fringes. Coordinates outside
`[-1e-7, width-1+1e-7] × [-1e-7, height-1+1e-7]` produce transparent output.
Precise align-corners convention (`sx = x * (srcW-1) / (dstW-1)`) matches
resize and warp geometrically.

### File Structure

```
painting-tools/
├── index.html                       # Shell: file input, tab bar, tool view containers
├── style.css                        # Layout, tab bar, tool styling, responsive
├── app.js                           # Shared infrastructure: ImageManager, ToolShell, helpers
├── settings.js                      # Settings: typed, error-safe localStorage wrappers
├── posterize.js                     # Pure function: posterization algorithm
├── edgeDetect.js                    # Pure function: Canny edge detection → clean sketch
├── lighten.js                       # Pure function: blend toward white by percentage
├── histogram.js                     # Pure function: histogram rendering
├── gridOverlay.js                   # Pure function: grid math + Canvas 2D drawing
├── colorMix.js                      # Pure: KM subtractive mixing, CIELAB ΔE, recipe solver
├── crop.js                          # Pure: crop rect math (largestRectForAspect, clampRect, resizeRect, cropImageData)
├── underpaintingAlignment.js        # Pure: working-size caps, homography, warp, quad validation
├── viewTransforms.js                # Pure: flipHorizontal, toGrayscale, boxBlur
├── posterizeTool.js                 # Tool module: posterization UI wiring
├── sketchTool.js                    # Tool module: edge detection UI wiring
├── gridTool.js                      # Tool module: grid overlay UI wiring
├── lightenTool.js                   # Tool module: lighten UI wiring
├── viewTool.js                      # Tool module: flip/grayscale/blur View UI
├── cropTool.js                      # Tool module: crop UI (rect drag/resize, preset selection, apply)
├── colorTool.js                     # Tool module: color sampling + recipe + palette editor
├── underpaintingAccuracyTool.js     # Tool module: upload, marking, homography overlay
├── docs/
│   ├── REQUIREMENTS.md
│   ├── ARCHITECTURE.md
│   └── plans/
│       ├── 001-initial-mvp.md
│       ├── 002-edge-detection-sketch.md
│       ├── 003-tool-registry.md
│       ├── 004-grid-overlay.md
│       ├── 005-promote-output.md
│       ├── 006-canny-edge-detection.md
│       ├── 007-color-mixer-accuracy.md
│       ├── 008-grid-cell-cross-diagonals.md
│       ├── 009-underpainting-accuracy.md
│       ├── 010-underpainting-magnifier-and-zoom.md
│       ├── 011-flip-squint-view-tool.md
│       ├── 012-value-isolation.md
│       ├── 013-crop-to-canvas-aspect.md
│       ├── 014-simplify-before-posterize.md
│       └── 015-palette-extraction-paint-recipes.md
└── tests/
    ├── posterize.test.js
    ├── edgeDetect.test.js
    ├── gridOverlay.test.js
    ├── lighten.test.js
    ├── colorMix.test.js
    ├── settings.test.js
    ├── underpaintingAlignment.test.js
    ├── underpaintingAccuracyTool.test.js
    └── viewTransforms.test.js
```

### Key Modules

| Module | Responsibility | Contract |
|--------|---------------|----------|
| `app.js` | `ImageManager`, `ToolShell`, canvas helpers | `ImageManager.load(file)`, `ImageManager.getImageData()`, `ImageManager.onLoad(fn)`. `ToolShell.register({id,name,icon,mount,process,unmount})`, `ToolShell.activate(id)`. |
| `settings.js` | Typed, error-safe localStorage access | `getString`, `getNumber`, `getInt`, and `getBool` return the supplied fallback when a key is absent or storage cannot be read; `set` never propagates a storage error. UI modules must use these typed accessors rather than direct storage reads. |
| `posterize.js` | `posterize(imageData, N, mode) → {imageData, histogram}`, `bandIndexForValue(v255, N) → number`, `bandIndexForPixel(r,g,b,N,mode) → number`, `isolateBand(imageData,N,bandIndex,mode) → {imageData}` | Pure functions. `posterize()` takes pixel data, level count, and mode (`'grayscale'` or `'color'`). Returns posterized `ImageData` plus histogram bin counts. `bandIndexForValue`/`bandIndexForPixel` extract the equal-interval band assignment (shared source of truth with posterize internals). `isolateBand` produces a black-on-white mask for a single value band, alpha preserved. |
| `gridOverlay.js` | `computeGridLayout(w, h, opts) → {...}`, `drawGrid(ctx, w, h, opts)` | Pure functions. Computes cell dimensions and centering offsets; draws grid lines, labels, both corner-to-corner diagonals in each enabled cell, and margin dimming via Canvas 2D compositing. |
| `edgeDetect.js` | `detectEdges(imageData, {threshold, blur, invert}) → ImageData` | Pure function. Full Canny pipeline (Gaussian blur → Sobel → NMS → hysteresis). Returns clean single-pixel edge sketch on light/dark background. |
| `lighten.js` | `lighten(imageData, amount) → { imageData }` | Pure function. Blends each pixel toward white by a percentage (0–100%). 0% = no change, 100% = pure white. Alpha preserved. |
| `colorMix.js` | `averageColor`, `mixPaints` (Kubelka-Munk), `rgbToLab`, `deltaE`, `matchColor`, `DEFAULT_PALETTE` | Pure functions. Subtractive paint mixing in reflectance space + CIELAB ΔE recipe matching against a configurable palette. |
| `histogram.js` | `drawHistogram(canvas, bins, N, opts?)`, `binAtX(cssX, canvasCssWidth, N) → number`, `HIST_PAD` | Renders histogram bars on a given canvas. Optional `opts.selectedBin` draws that bar in the accent color. `binAtX` converts a CSS x-coordinate to a bin index for hit-testing (uses the same padding constants as drawing). `HIST_PAD` exported for unit test alignment. |
| `crop.js` | `largestRectForAspect(imgW, imgH, aspectW, aspectH) → rect`, `clampRect(rect, imgW, imgH, minSize) → rect`, `resizeRect(rect, handle, dx, dy, aspect, imgW, imgH) → rect`, `cropImageData(imageData, rect) → ImageData` | Pure functions. `largestRectForAspect` computes a centered maximal rectangle of the given aspect inside the image bounds. `clampRect` enforces position and size constraints. `resizeRect` adjusts a corner handle while optionally preserving aspect ratio. `cropImageData` produces a new ImageData from a pixel-accurate rect cut of the source. |
| `underpaintingAlignment.js` | `computeWorkingSize`, `resizeImageData`, `validateCornerQuad`, `solveHomography`, `mapHomographyPoint`, `warpPerspective` | Pure geometry. Working-size caps, bilinear resize with premultiplied alpha, quadrilateral validation, 8×8 DLT homography solver with normalized partial pivoting, and inverse-mapping perspective warp. |
| `posterizeTool.js` | Tool module: registers posterization UI with `ToolShell` | Calls `ToolShell.register({...})` with mount/process. Wires slider, mode radios, Simplify (blur) slider, histogram with click-to-isolate (via `binAtX`), "All Bands" button, and download. Applies `boxBlur` smoothing pre-pass when Simplify > 0. Persists selected band and smooth radius via `Settings`. |
| `gridTool.js` | Tool module: registers grid overlay UI with `ToolShell` | Calls `ToolShell.register({...})` with mount/process. Wires rows/cols sliders (with square-cell auto-sync), line color, width, style, labels, diagonals, square cells toggle, and download. |
| `sketchTool.js` | Tool module: registers sketch UI with `ToolShell` | Calls `ToolShell.register({...})` with mount/process. Wires threshold slider, invert checkbox, and download. |
| `lightenTool.js` | Tool module: registers lighten UI with `ToolShell` | Calls `ToolShell.register({...})` with mount/process. Wires amount slider (0–100%), side-by-side canvases, and download. |
| `colorTool.js` | Tool module: registers Color Mixer UI with `ToolShell` | Calls `ToolShell.register({...})`. Click-to-sample circle (image + overlay canvas), sample-size slider, recipe/swatch display, and a localStorage-backed palette editor. |
| `underpaintingAccuracyTool.js` | Tool module: registers Underpainting Check with `ToolShell` | Calls `ToolShell.register({...}`). Wires upload, guided draggable corners, the underpainting-only drag magnifier, perspective warp, and the centered layered comparison with opacity plus CSS-only zoom/pan. |
| `index.html` | Shell structure | File input, empty tab bar (populated by ToolShell), tool view containers. Each tool's DOM lives in its `.tool-view` div. |
| `style.css` | Responsive layout + tab bar | Tab bar styles, tool view layout, side-by-side on wide screens, stacked on narrow. |

### Tool Contract

Each tool registers with `ToolShell.register(config)` where:

```js
{
  id: 'my-tool',        // unique string, matches tool-my-tool DOM id
  name: 'My Tool',      // display name in tab
  icon: '🔧',           // optional emoji
  mount(container) {},  // called once: grab DOM refs, wire events, override process()
  process(imageData) {},// called when image loaded or tab activated — runs algorithm
  unmount() {}          // optional cleanup
}
```

To add a new tool, you add:
- A static `<div class="tool-view hidden" id="tool-my-tool">` view in `index.html`
- A `<script src="myTool.js">` tag in `index.html` loaded in dependency order
- Zero changes to `app.js` or existing tools, but `style.css` may need scoped styles

The `app.js` landing-tab logic also changed: `ToolShell.activate('posterize')`
became `ToolShell.activate('view')` in both the file-input and drop handlers,
making View the first tool shown after upload.

### Script Load Order

Script tags in `index.html` must load pure-function modules before their
consumers, and `app.js` before any tool module that calls
`ToolShell.register()`:

1. Pure function modules: `posterize.js`, `histogram.js`, `edgeDetect.js`,
   `lighten.js`, `gridOverlay.js`, `colorMix.js`, `crop.js`,
   `underpaintingAlignment.js`, `viewTransforms.js`
2. `settings.js`
3. `app.js` (defines `ImageManager`, `ToolShell`, helpers)
4. Tool modules in any order: `cropTool.js`, `viewTool.js`, `posterizeTool.js`,
   `sketchTool.js`, `gridTool.js`, `colorTool.js`, `lightenTool.js`,
   `underpaintingAccuracyTool.js`

Tab order follows `ToolShell.register()` call order = script tag order.
`cropTool.js` is loaded first among tools so Crop is the first tab.

## Testing Strategy

- **Unit tests for pure functions** (`posterize.test.js`, `edgeDetect.test.js`,
  `gridOverlay.test.js`, `lighten.test.js`, `colorMix.test.js`,
  `underpaintingAlignment.test.js`, `viewTransforms.test.js`): Test algorithm correctness with known
  inputs and fixtures. Run with Node.js (no DOM required — `ImageData` is
  polyfilled for older Node versions).
- **Unit tests for settings** (`settings.test.js`): Test localStorage
  wrappers for type safety and error handling.
- **Behavioral lifecycle tests for the Underpainting Check tool**
  (`underpaintingAccuracyTool.test.js`): Zero-dependency mock-DOM suite
  using Node `vm` to test pointer capture, drag completion, guide/reset
  failure paths, the underpainting-only magnifier, CSS-only zoom/pan, warp
  counts, and state transitions without a browser.
- **Manual visual tests for tools**: Load sample photos in a browser,
  verify UI rendering, interaction, and download output. The Underpainting
  Check tool additionally requires manual verification of handle dragging,
  the underpainting-only drag magnifier, perspective rectification, opacity
  blending, centered 50–400% zoom/pan, and responsive layout on mobile
  viewports.
- **Buffer budget validation**: Verify via browser DevTools that peak memory
  does not exceed five capped RGBA buffers during alignment, and that
  repeated replacement uploads do not increase retained working storage.
- **Performance validation**: Measure warp time for a capped ~2 MP image.
  Target: under 500 ms on desktop, under 2 seconds on a representative
  supported phone. Phone benchmarking must be recorded as a release risk
  if unavailable.

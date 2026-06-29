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
│  │  activate('posterize') activate('grid') activate('sketch')│   │
│  │  activate('lighten') ...                                  │   │
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
   - Weak edges (> `threshold × 0.4`, ≤ `threshold`) are kept only if
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

### File Structure

```
painting-tools/
├── index.html          # Shell: file input, tab bar, tool view containers
├── style.css           # Layout, tab bar, tool styling, responsive
├── app.js              # Shared infrastructure: ImageManager, ToolShell, helpers
├── posterize.js        # Pure function: posterization algorithm
├── edgeDetect.js       # Pure function: Canny edge detection → clean sketch
├── lighten.js          # Pure function: blend toward white by percentage
├── histogram.js        # Pure function: histogram rendering
├── gridOverlay.js      # Pure function: grid math + Canvas 2D drawing
├── posterizeTool.js    # Tool module: posterization UI wiring
├── sketchTool.js       # Tool module: edge detection UI wiring
├── gridTool.js         # Tool module: grid overlay UI wiring
├── lightenTool.js      # Tool module: lighten UI wiring
├── colorMix.js         # Pure: KM subtractive mixing, CIELAB ΔE, recipe solver
├── colorTool.js        # Tool module: color sampling + recipe + palette editor
├── docs/
│   ├── REQUIREMENTS.md
│   ├── ARCHITECTURE.md
│   └── plans/
│       ├── 001-initial-mvp.md
│       ├── 002-edge-detection-sketch.md
│       └── 003-tool-registry.md
└── tests/
    ├── posterize.test.js
    ├── edgeDetect.test.js
    ├── histogram.test.js
    ├── gridOverlay.test.js
    ├── lighten.test.js
    └── colorMix.test.js
```

### Key Modules

| Module | Responsibility | Contract |
|--------|---------------|----------|
| `app.js` | `ImageManager`, `ToolShell`, canvas helpers | `ImageManager.load(file)`, `ImageManager.getImageData()`, `ImageManager.onLoad(fn)`. `ToolShell.register({id,name,icon,mount,process,unmount})`, `ToolShell.activate(id)`. |
| `posterize.js` | `posterize(imageData, N, mode) → {imageData, histogram}` | Pure function. Takes pixel data, level count, and mode (`'grayscale'` or `'color'`). Returns posterized `ImageData` plus histogram bin counts. |
| `gridOverlay.js` | `computeGridLayout(w, h, opts) → {...}`, `drawGrid(ctx, w, h, opts)` | Pure functions. Computes cell dimensions and centering offsets; draws grid lines, labels, diagonals, and margin dimming via Canvas 2D compositing. |
| `edgeDetect.js` | `detectEdges(imageData, {threshold, blur, invert}) → ImageData` | Pure function. Full Canny pipeline (Gaussian blur → Sobel → NMS → hysteresis). Returns clean single-pixel edge sketch on light/dark background. |
| `lighten.js` | `lighten(imageData, amount) → { imageData }` | Pure function. Blends each pixel toward white by a percentage (0–100%). 0% = no change, 100% = pure white. Alpha preserved. |
| `colorMix.js` | `averageColor`, `mixPaints` (Kubelka-Munk), `rgbToLab`, `deltaE`, `matchColor`, `DEFAULT_PALETTE` | Pure functions. Subtractive paint mixing in reflectance space + CIELAB ΔE recipe matching against a configurable palette. |
| `histogram.js` | `drawHistogram(canvas, bins, N)` | Renders histogram bars on a given canvas. Each bar height = pixel count in that value band. |
| `posterizeTool.js` | Tool module: registers posterization UI with `ToolShell` | Calls `ToolShell.register({...})` with mount/process. Wires slider, mode radios, histogram, and download. |
| `gridTool.js` | Tool module: registers grid overlay UI with `ToolShell` | Calls `ToolShell.register({...})` with mount/process. Wires rows/cols sliders (with square-cell auto-sync), line color, width, style, labels, diagonals, square cells toggle, and download. |
| `sketchTool.js` | Tool module: registers sketch UI with `ToolShell` | Calls `ToolShell.register({...})` with mount/process. Wires threshold slider, invert checkbox, and download. |
| `lightenTool.js` | Tool module: registers lighten UI with `ToolShell` | Calls `ToolShell.register({...})` with mount/process. Wires amount slider (0–100%), side-by-side canvases, and download. |
| `colorTool.js` | Tool module: registers Color Mixer UI with `ToolShell` | Calls `ToolShell.register({...})`. Click-to-sample circle (image + overlay canvas), sample-size slider, recipe/swatch display, and a localStorage-backed palette editor. |
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

To add a new tool, you add **one `<script>` tag** in `index.html` — zero changes
to `app.js`, `style.css`, or existing tools.

## Testing Strategy

- **Unit tests** (`posterize.test.js`): Test grayscale and color posterization
  with known inputs. Verify histogram bin counts. Run with Node.js.
- **Unit tests** (`edgeDetect.test.js`): Test each Canny pipeline stage —
  Gaussian kernel, separable blur, Sobel with 8-sector direction, non-maximum
  suppression, hysteresis connectivity — plus integration tests for uniform
  images, sharp edges, invert mode, alpha preservation, noise suppression,
  and small inputs.
- **Unit tests** (`gridOverlay.test.js`): Test `computeGridLayout` grid math —
  normal mode, square-cells mode with various aspect ratios, centering offsets,
  and edge cases where image dimensions perfectly fit the grid.
- **Unit tests** (`lighten.test.js`): Test `lighten` with 0%, 50%, 100% amounts
  on known pixels, fractional amounts, alpha preservation, edge clamping,
  color channels lightening independently, and image dimension preservation.
- **Manual visual tests**: Load sample photos and verify grid rendering,
  label readability, margin dimming, and download output.

# Architecture: Painting Value Study Tool

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

```
┌──────────────────────────────────────────────────────────┐
│                        Browser                           │
│                                                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌───────┐ │
│  │ File     │   │ Canvas   │   │ Download │   │ Mode  │ │
│  │ Input    │──▶│ Pipeline │──▶│ Link     │   │Toggle │ │
│  └──────────┘   └──────────┘   └──────────┘   │B&W/Clr│ │
│                      │                         └───────┘ │
│                      ▼                                    │
│               ┌──────────────┐   ┌──────────────┐        │
│               │ Value Slider │   │  Histogram   │        │
│               │ (2 ───●───12)│   │  (bar chart) │        │
│               └──────────────┘   └──────────────┘        │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

1. User selects a file → `FileReader` reads it as a data URL
2. Data URL → `Image` object (decoded in-memory)
3. Image → offscreen `<canvas>` at original resolution
4. Canvas pixel data → `ImageData` → posterization algorithm
   - **Grayscale mode**: RGB→luminance, quantize, output grayscale
   - **Color mode**: RGB→HSL, quantize L, keep H & S, HSL→RGB
5. Posterized pixels → visible `<canvas>` (scaled to fit viewport)
6. User adjusts `N` or toggles mode → re-run step 4–5
7. Histogram computed from posterized pixel data → rendered to a small canvas
8. User clicks download → visible canvas → PNG blob → download

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

### File Structure

```
painting-tools/
├── index.html          # Main page (UI structure)
├── style.css           # Layout and appearance
├── app.js              # App logic: file input, slider, mode toggle, download
├── posterize.js        # Pure function: posterization algorithm
├── histogram.js        # Compute and render value histogram
├── docs/
│   ├── REQUIREMENTS.md
│   ├── ARCHITECTURE.md
│   └── plans/
│       └── 001-initial-mvp.md
└── tests/
    ├── posterize.test.js   # Unit tests for posterization
    └── histogram.test.js   # Unit tests for histogram computation
```

### Key Modules

| Module | Responsibility | Contract |
|--------|---------------|----------|
| `posterize.js` | `posterize(imageData, N, mode) → {imageData, histogram}` | Pure function. Takes pixel data, level count, and mode (`'grayscale'` or `'color'`). Returns posterized `ImageData` plus histogram bin counts. |
| `histogram.js` | `drawHistogram(canvas, bins, N)` | Renders histogram bars on a given canvas. Each bar height = pixel count in that value band. |
| `app.js` | Wiring: DOM events, canvas management, download | Calls `posterize`, updates visible canvas and histogram, handles UI state. |
| `index.html` | Static structure | File input, two canvases (result + histogram), slider, mode toggle, download button. |
| `style.css` | Responsive layout | Side-by-side on wide screens, stacked on narrow. |

## Testing Strategy

- **Unit tests** (`posterize.test.js`): Test grayscale and color posterization
  with known inputs. Verify histogram bin counts. Run with Node.js.
- **Unit tests** (`histogram.test.js`): Test histogram computation on known
  pixel distributions.
- **Manual visual tests**: Load sample photos at various N values, verify
  posterized output and histogram match expectations.

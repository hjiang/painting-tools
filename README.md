# 🎨 Painting Tools

A multi-tool reference photo prep app for painters — posterize to value levels,
detect edges for sketching, overlay grids, lighten for printing, and mix colors
with subtractive (Kubelka-Munk) blending.

## How It Works

| Slider | What You See | Painting Stage |
|--------|-------------|----------------|
| **2–3** | Only dark / mid / light masses | Block-in & composition |
| **4–5** | Mid-tones and secondary planes appear | First pass |
| **7–9** | Fine form and detail emerge | Refinement |
| **10–12** | Near-photographic | Final touches |

Two modes:
- **Grayscale** — reduce to N brightness levels, output black & white
- **Color** — quantize lightness only, keep original hue & saturation

A **histogram** below the image shows the distribution of pixels across the N
value bands.

Expand the **Rough Sketch** section to see an edge-detected line drawing —
useful for tracing or studying structural lines. Adjust the threshold slider
to control edge sensitivity, and toggle invert for white-on-dark.

## Usage

1. Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge)
2. Drop a photo or click to upload (JPG, PNG, WebP)
3. Adjust the **Values** slider (2–12)
4. Toggle between **Grayscale** and **Color** mode
5. Click **▶ Rough Sketch** for an edge-detected line drawing
6. Use the **Color Mixer** tab to click-sample a color and get a paint recipe
   (mixed subtractively, with a configurable palette saved in your browser)
7. Click **Download PNG** (or **Download Sketch PNG**) to save at original resolution

Works on desktop and mobile. No internet needed — everything runs in your
browser.

## Development

Zero dependencies. Zero build step. Edit the files and reload.

```bash
# Run unit tests (all suites)
for t in tests/*.test.js; do node "$t"; done
```

### File Map

| File | What It Does |
|------|-------------|
| `index.html` | Page structure |
| `style.css` | Dark theme, responsive layout |
| `app.js` | Wiring: file load → posterize → display → download |
| `posterize.js` | Core algorithm: grayscale & color posterization |
| `edgeDetect.js` | Sobel edge detection → rough line sketch |
| `colorMix.js` | Subtractive (Kubelka-Munk) paint mixing + recipe matching |
| `histogram.js` | Value-distribution bar chart |
| `tests/posterize.test.js` | 40 unit tests |
| `tests/edgeDetect.test.js` | 153 unit tests |

See `AGENTS.md` for detailed architecture and conventions.

## License

MIT

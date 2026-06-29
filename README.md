# 🎨 Painting Tools

A multi-tool reference photo prep app for painters — posterize to value levels,
detect edges for sketching, overlay grids, lighten for printing, and mix colors
with subtractive (Kubelka-Munk) blending. All five tools can be chained via
output promotion.

## Tools

| Tab | What It Does |
|-----|-------------|
| **Posterize** | Reduce the photo to N value levels (2–12), grayscale or color |
| **Sketch** | Sobel edge detection → line drawing with adjustable threshold |
| **Grid** | Overlay a configurable grid (square or fixed cells, with diagonals) |
| **Lighten** | Blend toward white for printable reference images |
| **Color Mixer** | Click-sample a color → subtractive paint recipe with ΔE matching |

Output promotion: any tool's result can be promoted to become the new source
image, enabling chains like _Lighten → Posterize → Grid_. A banner shows the
current source and offers a one-click reset to the original upload.

### Posterize — How It Works

| Levels | What You See | Painting Stage |
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

## Usage

1. Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge)
2. Drop a photo or click to upload (JPG, PNG, WebP)
3. Switch between tabs: **Posterize**, **Sketch**, **Grid**, **Lighten**, **Color Mixer**
4. Adjust each tool's controls to get the result you want
5. Use **Use as New Reference** to chain tools together
6. Click **Download** to save the result at original resolution

Works on desktop and mobile. No internet needed — everything runs in your
browser.

## Development

Zero dependencies. Zero build step. Edit the files and reload.

```bash
# Run all unit tests (932 tests across 6 suites)
for t in tests/*.test.js; do node "$t"; done
```

### File Map

| File | What It Does |
|------|-------------|
| `index.html` | Page structure, tabs, and tool views |
| `style.css` | Dark theme, responsive layout |
| `app.js` | ImageManager, ToolShell, output promotion, wiring |
| `settings.js` | Typed, error-safe localStorage wrappers |
| `posterize.js` | Core algorithm: grayscale & color posterization |
| `histogram.js` | Value-distribution bar chart |
| `edgeDetect.js` | Sobel edge detection → line sketch |
| `gridOverlay.js` | Grid layout computation & canvas drawing |
| `lighten.js` | Blend pixels toward white for printing |
| `colorMix.js` | Subtractive (Kubelka-Munk) mixing, ΔE matching, palette |
| `posterizeTool.js` | Tool module: posterization UI |
| `sketchTool.js` | Tool module: edge detection / sketch UI |
| `gridTool.js` | Tool module: grid overlay UI |
| `lightenTool.js` | Tool module: lighten UI |
| `colorTool.js` | Tool module: color mixer (sample + recipe + palette) |
| `tests/posterize.test.js` | 40 unit tests |
| `tests/edgeDetect.test.js` | 672 unit tests |
| `tests/gridOverlay.test.js` | 57 unit tests |
| `tests/lighten.test.js` | 89 unit tests |
| `tests/colorMix.test.js` | 54 unit tests |
| `tests/settings.test.js` | 20 unit tests |

See `AGENTS.md` for detailed architecture and conventions.

## License

MIT

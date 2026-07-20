# 🎨 Painting Tools

A multi-tool reference photo prep app for painters — posterize to value levels,
detect edges for sketching, overlay grids, lighten for printing, mix colors
with subtractive (Kubelka-Munk) blending, check underpainting alignment
via projective rectification, and flip/desaturate/blur the reference for easy value-judgment. Posterize, Sketch, Grid, Lighten, and View can be chained via
output promotion; Color Mixer and Underpainting Check are visual-only and do not promote.

## Tools

| Tab | What It Does |
|-----|-------------|
| **Posterize** | Reduce the photo to N value levels (2–12), grayscale or color; click a histogram bin to isolate that value band |
| **Sketch** | Canny edge detection → line drawing with adjustable threshold |
| **Grid** | Overlay a configurable grid (square or fixed cells, with diagonals) |
| **Lighten** | Blend toward white for printable reference images |
| **View** | Flip, grayscale, or blur (squint) the reference to judge values. Display, download, and promote at full resolution |
| **Color Mixer** | Click-sample a color → subtractive paint recipe with ΔE matching |
| **Underpainting Check** | Mark photographed canvas corners with a drag magnifier, then inspect a centered projective comparison with opacity and 50–400% zoom/pan (visual-only, no promotion) |

Output promotion: any processing tool's result can be promoted to become the
new source image, enabling chains like _Lighten → Posterize → Grid_. A banner
shows the current source and offers a one-click reset to the original upload.

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
3. Switch between tabs: **View**, **Posterize**, **Sketch**, **Grid**, **Lighten**, **Color Mixer**, **Underpainting Check**
4. Adjust each tool's controls to get the result you want
5. Use **Use as New Reference** to chain image-processing tools together
   (Posterize, Sketch, Grid, Lighten, View)
6. Use **Download** to save a processing tool's result at original resolution
   (where offered; Color Mixer and Underpainting Check have no download)

Works on desktop and mobile. No internet needed — everything runs in your
browser.

## Development

Zero dependencies. Zero build step. Edit the files and reload.

```bash
# Run all unit tests
for t in tests/*.test.js; do node "$t"; done
```

### File Map

| File | What It Does |
|------|-------------|
| `index.html` | Page structure, tabs, and tool views |
| `style.css` | Dark theme, responsive layout |
| `app.js` | ImageManager, ToolShell, output promotion, wiring |
| `settings.js` | Typed, error-safe localStorage wrappers |
| `posterize.js` | Core algorithm: grayscale & color posterization, band-index helpers (`bandIndexForValue`, `bandIndexForPixel`), band isolation (`isolateBand`) |
| `histogram.js` | Value-distribution bar chart with hit-testing (`binAtX`, `HIST_PAD`) and selected-bin highlight |
| `edgeDetect.js` | Canny edge detection → line sketch |
| `gridOverlay.js` | Grid layout computation & canvas drawing |
| `lighten.js` | Blend pixels toward white for printing |
| `colorMix.js` | Subtractive (Kubelka-Munk) mixing, ΔE matching, palette |
| `underpaintingAlignment.js` | Pure geometry: homography solving, bilinear warp, corner validation |
| `viewTransforms.js` | Pure functions: flip, grayscale, box blur for View tool |
| `posterizeTool.js` | Tool module: posterization UI with click-to-isolate value bands |
| `sketchTool.js` | Tool module: edge detection / sketch UI |
| `gridTool.js` | Tool module: grid overlay UI |
| `lightenTool.js` | Tool module: lighten UI |
| `viewTool.js` | Tool module: View tool (flip/grayscale/blur) UI |
| `colorTool.js` | Tool module: color mixer (sample + recipe + palette) |
| `underpaintingAccuracyTool.js` | Tool module: upload, precision corner magnifier, projective alignment, opacity comparison, CSS-only zoom/pan |
| `tests/posterize.test.js` | 40 unit tests |
| `tests/histogram.test.js` | 24 unit tests |
| `tests/isolateBand.test.js` | 48 unit tests |
| `tests/edgeDetect.test.js` | 672 unit tests |
| `tests/gridOverlay.test.js` | 58 unit tests |
| `tests/lighten.test.js` | 89 unit tests |
| `tests/colorMix.test.js` | 54 unit tests |
| `tests/settings.test.js` | 20 unit tests |
| `tests/underpaintingAlignment.test.js` | 337 unit tests |
| `tests/underpaintingAccuracyTool.test.js` | 102 lifecycle assertions (mock-DOM VM suite, 22 named cases) |
| `tests/viewTransforms.test.js` | 185 unit tests |

See `AGENTS.md` for detailed architecture and conventions.

**Note:** The Underpainting Check tool has no download or promotion — it is a
visual-only overlay. Results are not persisted across page reloads.

## License

MIT

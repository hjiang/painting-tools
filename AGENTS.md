# AGENTS.md

Project-specific instructions for AI agents working on this codebase.

## Project Overview

Painting Tools — a single-page web app with multiple reference-photo prep tools
images with a configurable number of value levels (2–12). Helps painters plan
their value structure layer by layer.

**Zero dependencies, zero build step.** Everything is vanilla HTML/CSS/JS using
the Canvas API. Open `index.html` in a browser — it works offline.

## Technology

- **Platform**: Browser (no Node server, no framework)
- **Languages**: HTML, CSS, vanilla JavaScript (ES6+)
- **No build tooling**: No webpack, vite, npm, or package.json
- **Testing**: Node.js for unit tests (`node tests/*.test.js`). No jsdom needed
  — ImageData is a global in Node 18+.

## Code Conventions

- Functions that are pure and testable go in their own file (e.g.,
  `posterize.js`, `histogram.js`).
- UI wiring goes in `app.js` (IIFE, no global pollution).
- New tools currently require both a static `#tool-<id>` view and script tags in
  `index.html`; load pure dependencies before their tool module and load `app.js`
  before modules that call `ToolShell.register()`.
- All JS files use dual-mode exports: global declaration for the browser +
  conditional `module.exports` for Node tests. See `posterize.js` for the
  pattern.
- CSS uses dark theme (`#1a1a2e` background) with responsive breakpoint at
  700px.

## Running Tests

```bash
node tests/posterize.test.js
```

Tests are written with a tiny inline test runner (no Jest/Mocha dependency).
Each test file prints `passed / failed` counts and exits non-zero on failure.

## Key Design Decisions

1. **Grayscale posterization** uses Rec. 601 luminance weights:
   `L = 0.299*R + 0.587*G + 0.114*B`. The sum of these coefficients is ~0.99999
   in IEEE 754, so `Math.round()` is applied to the result before quantization.

2. **Color posterization** converts RGB → HSL, quantizes only the L channel,
   then converts back. Hue and saturation are preserved, so a red apple stays
   red but its lightness is forced into N bands.

3. **Posterization algorithm**: equal-interval bands with midpoint output.
   `band = floor(value / (256/N))`, `output = round(band * bandWidth + bandWidth/2)`.
   Band boundaries are floating-point; for N=3, band 0 covers [0, 85.3),
   band 1 covers [85.3, 170.7), band 2 covers [170.7, 255].

4. **Histogram bins** correspond 1:1 with posterization bands. Bin heights are
   normalized to the maximum bin count.

5. **Image processing happens at full resolution** — the visible canvases are
   CSS-scaled, but posterization and download use original pixel dimensions.

6. **Grid overlay** uses Canvas 2D compositing (not pixel manipulation) — the
   source image is drawn, then grid lines, labels, and diagonals are drawn on
   top. Square-cells mode auto-computes the companion dimension from the
   image aspect ratio and dims margins outside the grid area.

7. **Image lightening** blends every pixel toward white by a configurable
   percentage: `ch' = ch + (255 - ch) * (amount / 100)`. Alpha is preserved.
   0% = original image, 100% = pure white. Useful for printing faint
   reference images that use less ink and accept pencil/paint markup.

8. **Output promotion**: Posterize, Sketch, Grid, and Lighten can promote their
   processed output via `ImageManager.setImageData(result, label)`. The
   original upload is preserved in `_originalImageData` so `reset()` can restore
   it. A source banner between the tab bar and tool views shows the modified state
   with a "Reset to Original" button. Each tool creates a "Use as New Reference"
   button via the shared `createPromoteButton(getResultFn, labelFn)` helper.
   This enables operation chaining (e.g., lighten → posterize → grid).

9. **Color mixing is subtractive (Kubelka-Munk), not additive.** The photo is
   transmitted light (additive RGB); paint is reflected light (subtractive).
   So `mixPaints` does NOT average RGB — it linearizes each channel, converts
   reflectance to `K/S = (1-R)²/(2R)`, mixes `K/S` by weight, then inverts
   `R = 1 + K/S - sqrt((K/S)² + 2·K/S)`. Blue+yellow → green, all-pigments → mud.
   `matchColor` searches 1–3-paint recipes on a percentage grid, scoring by
   CIELAB ΔE and preferring simpler recipes. It decomposes the result into
   chroma distance (ΔC) and signed lightness difference (ΔL), producing a
   `valueHint` ('lighten'/'darken') when the hue is reachable but value needs
   adjustment. Only genuine hue/saturation misses are flagged as "out of gamut."
   Each pigment has an optional `strength` multiplier (default 1.0) for tinting
   power; `mixPaints` weights K/S contributions by `weight × strength`.
   The palette includes Ivory Black and Titanium White as value adjusters.
   Saved to `localStorage` as `painting-tools.palette.v2` with v1 migration.

10. **Underpainting precision UI is display-only.** Marker dragging shows a
    fixed 168px, 4× magnifier sourced only from the underpainting marking canvas;
    it never warps or displays the reference. The final comparison fits centered
    up to 960 CSS pixels and zooms 50–400% by resizing the common CSS stage, not
    either canvas backing. Zoom, pan, and opacity must never rerun the warp.

## File Structure

```
painting-tools/
├── index.html          # UI shell with tab bar and tool views
├── style.css           # Dark theme, responsive layout
├── app.js              # ImageManager, ToolShell, canvas/radio helpers (IIFE)
├── settings.js         # Settings: typed, error-safe localStorage wrappers
├── posterize.js        # posterize(imageData, N, mode) → { imageData, histogram }
├── histogram.js        # drawHistogram(canvas, bins, N)
├── edgeDetect.js       # detectEdges(imageData, {threshold, invert}) → ImageData
├── lighten.js          # lighten(imageData, amount) → { imageData }
├── gridOverlay.js      # computeGridLayout(w,h,opts), drawGrid(ctx,w,h,opts)
├── colorMix.js                    # averageColor, mixPaints (KM), rgbToLab, deltaE, matchColor
├── underpaintingAlignment.js      # Pure: homography, warp, working-size, quad validation
├── posterizeTool.js               # Tool module: posterization UI
├── sketchTool.js                  # Tool module: edge detection / sketch UI
├── gridTool.js                    # Tool module: grid overlay UI
├── lightenTool.js                 # Tool module: lighten UI
├── colorTool.js                   # Tool module: color mixer (sample + recipe + palette)
├── underpaintingAccuracyTool.js   # Tool: marking magnifier, homography overlay, zoom/pan
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
│       └── 010-underpainting-magnifier-and-zoom.md
└── tests/
    ├── posterize.test.js
    ├── edgeDetect.test.js
    ├── gridOverlay.test.js
    ├── lighten.test.js
    ├── colorMix.test.js
    ├── settings.test.js
    ├── underpaintingAlignment.test.js
    └── underpaintingAccuracyTool.test.js
```

## When Adding Features

- Update `docs/REQUIREMENTS.md` and `docs/ARCHITECTURE.md` to reflect changes.
- Add tests for any new pure functions.
- Keep the zero-dependency constraint — prefer Canvas API over libraries.
- Test on mobile viewport (≤700px) to ensure responsive layout still works.

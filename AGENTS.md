# AGENTS.md

Project-specific instructions for AI agents working on this codebase.

## Project Overview

Painting Value Study — a single-page web app that converts photos to posterized
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

## File Structure

```
painting-tools/
├── index.html          # UI shell
├── style.css           # Dark theme, responsive layout
├── app.js              # Wiring: file input, canvas, controls, download
├── posterize.js        # posterize(imageData, N, mode) → { imageData, histogram }
├── histogram.js        # drawHistogram(canvas, bins, N)
├── docs/
│   ├── REQUIREMENTS.md
│   ├── ARCHITECTURE.md
│   └── plans/
└── tests/
    └── posterize.test.js
```

## When Adding Features

- Update `docs/REQUIREMENTS.md` and `docs/ARCHITECTURE.md` to reflect changes.
- Add tests for any new pure functions.
- Keep the zero-dependency constraint — prefer Canvas API over libraries.
- Test on mobile viewport (≤700px) to ensure responsive layout still works.

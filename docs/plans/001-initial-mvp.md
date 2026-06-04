# Plan 001: Initial MVP — Value Posterization Web App

## Goal

A single-page web app that converts uploaded photos to posterized images with a
configurable number of value levels (2–12).

## Step 1: Project Scaffold & Test Harness

Create the file structure and a simple unit test runner for the posterization
algorithm. We'll use a tiny in-browser test runner (no Node dependency needed),
but write the tests as a module that can also run under Node for CI later.

**Files**: `posterize.js`, `tests/posterize.test.js`

**Acceptance**:
- Running `node tests/posterize.test.js` passes all unit tests
- Tests cover: N=2, N=3, N=5, N=12, edge cases (N=1, all-black, all-white)

## Step 2: Posterization Algorithm

Implement `posterize(imageData, N)`:
- Accept `ImageData` (RGBA array) and integer `N`
- Convert each pixel to grayscale using luminance weights
- Quantize to N equal-interval bands
- Return new `ImageData` with posterized grayscale values in all three RGB
  channels (R=G=B=gray)

**File**: `posterize.js`

## Step 3: HTML Shell & CSS Layout

Build the UI skeleton:
- File input (or drag-and-drop zone)
- Before canvas (original) and After canvas (posterized)
- Value slider (range input, 2–12, default 3)
- Download button
- Responsive CSS (flexbox, side-by-side on wide, stacked on narrow)

**Files**: `index.html`, `style.css`

## Step 4: App Wiring

Wire everything together in `app.js`:
- File input → load image → draw to hidden canvas
- Slider change → re-run posterize → draw to visible canvas
- Download button → export visible canvas as PNG
- Handle window resize (redraw canvases fitting viewport)

**File**: `app.js`

## Step 5: Polish & Manual Verification

- Test with real photos on desktop and mobile
- Ensure slider feels instant (no perceptible delay)
- Add a value-count label next to the slider
- Add brief usage instructions on the page

## Implementation Order

```
Step 1 (Test) → Step 2 (Algorithm) → Step 3 (UI) → Step 4 (Wiring) → Step 5 (Polish)
```

The first two steps can be done together (TDD: write tests first, then
implementation). Steps 3 and 4 could be parallelized but the wiring depends on
the DOM structure, so sequential is cleaner.

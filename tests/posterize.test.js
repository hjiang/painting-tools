// tests/posterize.test.js
// Run with: node tests/posterize.test.js
//
// Tests the posterize() function for both grayscale and color modes,
// including histogram bin counts.

// ---- tiny test runner (zero deps) ----
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertEq(actual, expected, msg) {
  if (actual === expected) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg} — expected ${expected}, got ${actual}`); }
}

function assertClose(actual, expected, msg, tolerance = 2) {
  if (Math.abs(actual - expected) <= tolerance) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg} — expected ≈${expected}, got ${actual}`); }
}

// ---- polyfill ImageData for older Node ----
if (typeof ImageData === 'undefined') {
  globalThis.ImageData = class {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

const { posterize } = require('../posterize.js');

// ============================================================
// GRAYSCALE MODE
// ============================================================
console.log('\n--- Grayscale mode ---');

// Helper: create a 1x1 pixel ImageData
function pixel(r, g, b) {
  const data = new Uint8ClampedArray([r, g, b, 255]);
  return new ImageData(data, 1, 1);
}

// N=2: bands [0-127]→64, [128-255]→192
{
  // black → band 0
  const r = posterize(pixel(0, 0, 0), 2, 'grayscale');
  assertEq(r.imageData.data[0], 64, 'N=2: black → 64');
  assertEq(r.imageData.data[1], 64, 'N=2: black → R=G=B');
  assertEq(r.imageData.data[2], 64, 'N=2: black → R=G=B');

  // white → band 1
  const r2 = posterize(pixel(255, 255, 255), 2, 'grayscale');
  assertEq(r2.imageData.data[0], 192, 'N=2: white → 192');

  // mid-gray 128 → band 1 (boundary falls in upper band)
  const r3 = posterize(pixel(128, 128, 128), 2, 'grayscale');
  assertEq(r3.imageData.data[0], 192, 'N=2: 128 → 192 (upper band)');

  // dark gray 64 → band 0
  const r4 = posterize(pixel(64, 64, 64), 2, 'grayscale');
  assertEq(r4.imageData.data[0], 64, 'N=2: 64 → 64 (lower band)');
}

// N=3: bands [0-85)→43, [86-170)→128, [171-255]→213
{
  const r = posterize(pixel(0, 0, 0), 3, 'grayscale');
  assertClose(r.imageData.data[0], 43, 'N=3: black → ~43');

  const r2 = posterize(pixel(86, 86, 86), 3, 'grayscale');
  assertClose(r2.imageData.data[0], 128, 'N=3: 86 → ~128');

  const r3 = posterize(pixel(171, 171, 171), 3, 'grayscale');
  assertClose(r3.imageData.data[0], 213, 'N=3: 171 → ~213');

  const r4 = posterize(pixel(255, 255, 255), 3, 'grayscale');
  assertClose(r4.imageData.data[0], 213, 'N=3: 255 → ~213');
}

// N=5
{
  const r = posterize(pixel(0, 0, 0), 5, 'grayscale');
  // band 0: [0-50] → 26
  assertClose(r.imageData.data[0], 26, 'N=5: black → ~26');

  const r2 = posterize(pixel(52, 52, 52), 5, 'grayscale');
  // band 1: [52-102] → 77
  assertClose(r2.imageData.data[0], 77, 'N=5: 52 → ~77');

  const r3 = posterize(pixel(255, 255, 255), 5, 'grayscale');
  // band 4: [205-255] → 230
  assertClose(r3.imageData.data[0], 230, 'N=5: 255 → ~230');
}

// N=12
{
  const r = posterize(pixel(0, 0, 0), 12, 'grayscale');
  // band_width = 256/12 ≈ 21.33, output ≈ 11
  assert(r.imageData.data[0] <= 20, 'N=12: black → low value');

  const r2 = posterize(pixel(255, 255, 255), 12, 'grayscale');
  // band 11 → output ≈ 245
  assert(r2.imageData.data[0] >= 235, 'N=12: white → high value');
}

// Edge: N=1 (single band — whole image one value)
{
  const r = posterize(pixel(50, 50, 50), 1, 'grayscale');
  assertEq(r.imageData.data[0], 128, 'N=1: any value → 128 (midpoint)');

  const r2 = posterize(pixel(200, 200, 200), 1, 'grayscale');
  assertEq(r2.imageData.data[0], 128, 'N=1: any value → 128');
}

// Luminance conversion: different colors same luminance → same output
{
  // Red (R=255,G=0,B=0): lum = 0.299*255 ≈ 76
  // Blue (R=0,G=0,B=255): lum = 0.114*255 ≈ 29
  // These should go to different bands with low N
  const r = posterize(pixel(255, 0, 0), 3, 'grayscale');
  const b = posterize(pixel(0, 0, 255), 3, 'grayscale');
  // Red luminance ~76 → band 0 (< 85.33)? Actually 76 < 85.33 → band 0 → ~43
  // Blue luminance ~29 → band 0 → ~43
  // Both land in band 0 for N=3
  assertEq(r.imageData.data[0], b.imageData.data[0],
    'Red and Blue with similar low luminance → same band for N=3');
}

// ============================================================
// COLOR MODE
// ============================================================
console.log('--- Color mode ---');

// N=2 color: quantization should preserve hue
{
  // Pure red (hue 0°, sat 100%, light 50%)
  const r = posterize(pixel(255, 0, 0), 2, 'color');
  // With N=2, lightness 50% → band 1 (upper) → output lightness 75%
  // Should still look red (R channel dominant)
  assert(r.imageData.data[0] > r.imageData.data[1], 'N=2 color: red stays reddish');
  assert(r.imageData.data[0] > r.imageData.data[2], 'N=2 color: red stays reddish');

  // Pure blue (hue 240°, sat 100%, light 50%)
  const b = posterize(pixel(0, 0, 255), 2, 'color');
  // Should still look blue
  assert(b.imageData.data[2] > b.imageData.data[0], 'N=2 color: blue stays bluish');
  assert(b.imageData.data[2] > b.imageData.data[1], 'N=2 color: blue stays bluish');
}

// Color mode: black and white are preserved (they're achromatic)
{
  const black = posterize(pixel(0, 0, 0), 3, 'color');
  assertEq(black.imageData.data[0], black.imageData.data[1], 'Color N=3: black → R=G=B');
  assertEq(black.imageData.data[1], black.imageData.data[2], 'Color N=3: black → R=G=B');

  const white = posterize(pixel(255, 255, 255), 3, 'color');
  assertEq(white.imageData.data[0], white.imageData.data[1], 'Color N=3: white → R=G=B');
  assertEq(white.imageData.data[1], white.imageData.data[2], 'Color N=3: white → R=G=B');
}

// Color mode with more bands preserves hue
{
  const r = posterize(pixel(255, 0, 0), 12, 'color');
  assert(r.imageData.data[0] > 200, 'Color N=12: red pixel stays bright red');
  assert(r.imageData.data[1] < 50, 'Color N=12: red pixel has low green');
  assert(r.imageData.data[2] < 50, 'Color N=12: red pixel has low blue');
}

// ============================================================
// HISTOGRAM
// ============================================================
console.log('--- Histogram ---');

// N=2 grayscale: 4 pixels, 2 bands
{
  const data = new Uint8ClampedArray([
    0, 0, 0, 255,      // → band 0 (dark)
    64, 64, 64, 255,    // → band 0
    192, 192, 192, 255, // → band 1
    255, 255, 255, 255  // → band 1
  ]);
  const img = new ImageData(data, 2, 2);
  const result = posterize(img, 2, 'grayscale');

  assert(result.histogram, 'histogram array exists');
  assertEq(result.histogram.length, 2, 'N=2 → 2 histogram bins');
  assertEq(result.histogram[0], 2, '2 dark pixels in band 0');
  assertEq(result.histogram[1], 2, '2 light pixels in band 1');
}

// Histogram sums to total pixel count
{
  const width = 4, height = 3; // 12 pixels
  const data = new Uint8ClampedArray(width * height * 4);
  // Fill with various grays
  for (let i = 0; i < width * height; i++) {
    const v = Math.floor((i / (width * height)) * 256);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const img = new ImageData(data, width, height);
  const result = posterize(img, 4, 'grayscale');

  const total = result.histogram.reduce((a, b) => a + b, 0);
  assertEq(total, width * height,
    `Histogram total (${total}) equals pixel count (${width * height})`);
}

// Histogram in color mode
{
  const width = 2, height = 2;
  const data = new Uint8ClampedArray([
    255, 0, 0, 255,    // red
    0, 255, 0, 255,    // green
    0, 0, 255, 255,    // blue
    128, 128, 128, 255 // gray
  ]);
  const img = new ImageData(data, width, height);
  const result = posterize(img, 3, 'color');

  const total = result.histogram.reduce((a, b) => a + b, 0);
  assertEq(total, width * height,
    'Color histogram total equals pixel count');
  assertEq(result.histogram.length, 3, 'Color N=3 → 3 histogram bins');
}

// ============================================================
// ALPHA PRESERVATION
// ============================================================
console.log('--- Alpha preservation ---');

{
  const data = new Uint8ClampedArray([100, 100, 100, 128]);
  const img = new ImageData(data, 1, 1);
  const r = posterize(img, 2, 'grayscale');
  assertEq(r.imageData.data[3], 128, 'Alpha channel preserved (grayscale)');
}

{
  const data = new Uint8ClampedArray([255, 0, 0, 200]);
  const img = new ImageData(data, 1, 1);
  const r = posterize(img, 2, 'color');
  assertEq(r.imageData.data[3], 200, 'Alpha channel preserved (color)');
}

// ============================================================
// EDGE: N=12 (max)
// ============================================================
console.log('--- N=12 (max) ---');

{
  const r = posterize(pixel(0, 0, 0), 12, 'grayscale');
  assert(r.imageData.data[0] >= 0 && r.imageData.data[0] <= 30,
    'N=12: black → near 0');
}

{
  const r = posterize(pixel(255, 255, 255), 12, 'grayscale');
  assert(r.imageData.data[0] >= 225 && r.imageData.data[0] <= 255,
    'N=12: white → near 255');
}

// ============================================================
// RESULTS
// ============================================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(40)}`);

process.exit(failed > 0 ? 1 : 0);

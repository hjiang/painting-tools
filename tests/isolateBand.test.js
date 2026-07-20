// tests/isolateBand.test.js
// Run with: node tests/isolateBand.test.js
//
// Tests the band-index helpers and isolateBand() function extracted from
// posterize.js. The plan calls for these to be new pure functions added
// to posterize.js.

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

const { posterize, bandIndexForValue, bandIndexForPixel, isolateBand } = require('../posterize.js');

// ============================================================
// bandIndexForValue
// ============================================================
console.log('\n--- bandIndexForValue ---');

// N=3 boundaries
assertEq(bandIndexForValue(0, 3), 0,   'N=3: 0 → band 0');
assertEq(bandIndexForValue(85, 3), 0,  'N=3: 85 → band 0');
assertEq(bandIndexForValue(86, 3), 1,  'N=3: 86 → band 1');
assertEq(bandIndexForValue(170, 3), 1, 'N=3: 170 → band 1');
assertEq(bandIndexForValue(171, 3), 2, 'N=3: 171 → band 2');
assertEq(bandIndexForValue(255, 3), 2, 'N=3: 255 → band 2');

// N=2 boundaries
assertEq(bandIndexForValue(0, 2), 0,   'N=2: 0 → band 0');
assertEq(bandIndexForValue(127, 2), 0, 'N=2: 127 → band 0');
assertEq(bandIndexForValue(128, 2), 1, 'N=2: 128 → band 1');
assertEq(bandIndexForValue(255, 2), 1, 'N=2: 255 → band 1');

// N=1: single band
assertEq(bandIndexForValue(0, 1), 0,   'N=1: 0 → band 0');
assertEq(bandIndexForValue(255, 1), 0, 'N=1: 255 → band 0');

// N=12: max bands
assertEq(bandIndexForValue(0, 12), 0,    'N=12: 0 → band 0');
assertEq(bandIndexForValue(255, 12), 11, 'N=12: 255 → band 11');

// Clamping at 255
assertEq(bandIndexForValue(256, 3), 2, 'N=3: 256 → clamped to band 2');

// ============================================================
// bandIndexForPixel (grayscale)
// ============================================================
console.log('\n--- bandIndexForPixel (grayscale) ---');

// A known pixel: pure red (R=255,G=0,B=0), luminance = 0.299*255 ≈ 76
// N=3: 76 / (256/3) = 76/85.33 ≈ 0.89 → band 0
assertEq(bandIndexForPixel(255, 0, 0, 3, 'grayscale'), 0, 'Red N=3 grayscale → band 0');

// Pure blue: luminance = 0.114*255 ≈ 29 → band 0
assertEq(bandIndexForPixel(0, 0, 255, 3, 'grayscale'), 0, 'Blue N=3 grayscale → band 0');

// Mid-gray: luminance = 128 → N=2: 128/128 = 1 → band 1
assertEq(bandIndexForPixel(128, 128, 128, 2, 'grayscale'), 1, 'Mid-gray N=2 → band 1');

// Black: luminance = 0 → band 0
assertEq(bandIndexForPixel(0, 0, 0, 3, 'grayscale'), 0, 'Black N=3 grayscale → band 0');

// White: luminance = 255 → band N-1
assertEq(bandIndexForPixel(255, 255, 255, 3, 'grayscale'), 2, 'White N=3 grayscale → band 2');

// ============================================================
// bandIndexForPixel (color mode)
// ============================================================
console.log('\n--- bandIndexForPixel (color mode) ---');

// Pure red: HSL L = 0.5 → L*255 = 127.5 → N=2: 127.5/128 ≈ 0.99 → band 0
assertEq(bandIndexForPixel(255, 0, 0, 2, 'color'), 0, 'Red N=2 color → band 0 (L=0.5)');

// Saturated yellow: R=255,G=255,B=0 → HSL L = 0.5 → band 0 for N=2
assertEq(bandIndexForPixel(255, 255, 0, 2, 'color'), 0, 'Yellow N=2 color → band 0 (L=0.5)');

// Black: L=0 → band 0
assertEq(bandIndexForPixel(0, 0, 0, 3, 'color'), 0, 'Black N=3 color → band 0');

// White: L=1 → L*255=255 → N=3: 255/85.33=2.99 → clamped to band 2
assertEq(bandIndexForPixel(255, 255, 255, 3, 'color'), 2, 'White N=3 color → band 2');

// A light blue: R=173,G=216,B=230 → HSL L ≈ 0.79 → L*255 ≈ 201
// N=4: 201/(256/4) = 201/64 = 3.14 → clamped to 3
const lb = bandIndexForPixel(173, 216, 230, 4, 'color');
assert(lb >= 0 && lb < 4, 'Light blue N=4 color → valid band index (got ' + lb + ')');

// ============================================================
// Consistency: bandIndexForPixel matches posterize histogram bin
// ============================================================
console.log('\n--- Consistency: bandIndexForPixel vs posterize histogram ---');

{
  // Create a small image with known pixels
  const data = new Uint8ClampedArray([
    0, 0, 0, 255,       // black
    255, 0, 0, 255,     // red
    0, 255, 0, 255,     // green
    128, 128, 128, 255, // mid-gray
    255, 255, 255, 255  // white
  ]);
  const img = new ImageData(data, 5, 1);
  const result = posterize(img, 3, 'grayscale');

  // Manually count which band each pixel should fall in
  const expectedBands = [
    bandIndexForPixel(0, 0, 0, 3, 'grayscale'),
    bandIndexForPixel(255, 0, 0, 3, 'grayscale'),
    bandIndexForPixel(0, 255, 0, 3, 'grayscale'),
    bandIndexForPixel(128, 128, 128, 3, 'grayscale'),
    bandIndexForPixel(255, 255, 255, 3, 'grayscale')
  ];

  // Verify histogram matches
  for (let i = 0; i < 5; i++) {
    result.histogram[expectedBands[i]]--;
  }
  const allZero = result.histogram.every(c => c === 0);
  assert(allZero, 'bandIndexForPixel histogram matches posterize histogram for grayscale');
}

{
  // Same for color mode
  const data = new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255
  ]);
  const img = new ImageData(data, 5, 1);
  const result = posterize(img, 4, 'color');

  const expectedBands = [
    bandIndexForPixel(0, 0, 0, 4, 'color'),
    bandIndexForPixel(255, 0, 0, 4, 'color'),
    bandIndexForPixel(0, 255, 0, 4, 'color'),
    bandIndexForPixel(0, 0, 255, 4, 'color'),
    bandIndexForPixel(255, 255, 255, 4, 'color')
  ];

  for (let i = 0; i < 5; i++) {
    result.histogram[expectedBands[i]]--;
  }
  const allZero2 = result.histogram.every(c => c === 0);
  assert(allZero2, 'bandIndexForPixel histogram matches posterize histogram for color');
}

// ============================================================
// isolateBand
// ============================================================
console.log('\n--- isolateBand ---');

// Simple 1×4 image with 4 different luminances
{
  const data = new Uint8ClampedArray([
    0, 0, 0, 255,       // black → band 0
    85, 85, 85, 255,    // dark gray → band 0 (N=3, bandWidth≈85.33, 85<85.33)
    171, 171, 171, 255, // light gray → band 2
    255, 255, 255, 255  // white → band 2
  ]);
  const img = new ImageData(data, 4, 1);

  // Isolate band 0 (the two dark pixels)
  const isolated0 = isolateBand(img, 3, 0, 'grayscale');
  // Pixels: [0,0,0,255,  0,0,0,255,  255,255,255,255,  255,255,255,255]
  assertEq(isolated0.imageData.data[0], 0,   'Isolate band 0: pixel 0 → black');
  assertEq(isolated0.imageData.data[1], 0,   'Isolate band 0: pixel 0 → black');
  assertEq(isolated0.imageData.data[2], 0,   'Isolate band 0: pixel 0 → black');
  assertEq(isolated0.imageData.data[4], 0,   'Isolate band 0: pixel 1 → black');
  assertEq(isolated0.imageData.data[8], 255, 'Isolate band 0: pixel 2 → white');
  assertEq(isolated0.imageData.data[12], 255,'Isolate band 0: pixel 3 → white');

  // Isolate band 2 (the two light pixels)
  const isolated2 = isolateBand(img, 3, 2, 'grayscale');
  assertEq(isolated2.imageData.data[0], 255,  'Isolate band 2: pixel 0 → white');
  assertEq(isolated2.imageData.data[4], 255,  'Isolate band 2: pixel 1 → white');
  assertEq(isolated2.imageData.data[8], 0,    'Isolate band 2: pixel 2 → black');
  assertEq(isolated2.imageData.data[12], 0,   'Isolate band 2: pixel 3 → black');
}

// Isolate in color mode: saturated red stays red-ish but mask is black/white
{
  const data = new Uint8ClampedArray([
    255, 0, 0, 255,     // red
    0, 0, 0, 255,       // black
    255, 255, 255, 255  // white
  ]);
  const img = new ImageData(data, 3, 1);

  // Red has HSL L = 0.5 → N=3: L*255=127.5 → 127.5/85.33≈1.49 → band 1
  const isolated = isolateBand(img, 3, 1, 'color');
  assertEq(isolated.imageData.data[0], 0,   'Isolate band 1 color: red pixel → black');
  assertEq(isolated.imageData.data[4], 255, 'Isolate band 1 color: black pixel → white');
  assertEq(isolated.imageData.data[8], 255, 'Isolate band 1 color: white pixel → white');
}

// Alpha preservation
{
  const data = new Uint8ClampedArray([
    100, 100, 100, 128,
    200, 200, 200, 64
  ]);
  const img = new ImageData(data, 2, 1);

  const isolated = isolateBand(img, 2, 0, 'grayscale');
  assertEq(isolated.imageData.data[3], 128, 'Isolate: alpha preserved for band 0');
  assertEq(isolated.imageData.data[7], 64,  'Isolate: alpha preserved for band 1 (white)');
}

// isolateBand returns same dimensions
{
  const data = new Uint8ClampedArray(4 * 4 * 4);
  const img = new ImageData(data, 4, 4);
  const result = isolateBand(img, 3, 0, 'grayscale');
  assertEq(result.imageData.width, 4, 'Isolate: same width');
  assertEq(result.imageData.height, 4, 'Isolate: same height');
}

// N=2: the two masks are complementary (every pixel black in exactly one)
{
  const data = new Uint8ClampedArray([
    0, 0, 0, 255,
    128, 128, 128, 255,
    200, 200, 200, 255,
    255, 255, 255, 255
  ]);
  const img = new ImageData(data, 2, 2);

  const mask0 = isolateBand(img, 2, 0, 'grayscale');
  const mask1 = isolateBand(img, 2, 1, 'grayscale');

  for (let i = 0; i < data.length; i += 4) {
    const p0Black = mask0.imageData.data[i] === 0;
    const p1White = mask1.imageData.data[i] === 255;
    assertEq(p0Black, p1White, 'N=2: band 0 black == band 1 white at pixel ' + (i/4));
  }
}

// ============================================================
// RESULTS
// ============================================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(40)}`);

process.exit(failed > 0 ? 1 : 0);

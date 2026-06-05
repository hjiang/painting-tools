// tests/edgeDetect.test.js
// Run with: node tests/edgeDetect.test.js
//
// Tests the detectEdges() function for Sobel edge detection.

// ---- tiny test runner (zero deps) ----
var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg); }
}

function assertEq(actual, expected, msg) {
  if (actual === expected) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg + ' — expected ' + expected + ', got ' + actual); }
}

function assertClose(actual, expected, msg, tolerance) {
  tolerance = tolerance || 2;
  if (Math.abs(actual - expected) <= tolerance) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg + ' — expected ≈' + expected + ', got ' + actual); }
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

if (typeof Uint8Array === 'undefined') {
  globalThis.Uint8Array = Array;
}

var detectEdges = require('../edgeDetect.js').detectEdges;

// Helper: create an ImageData from a flat RGBA array
function makeImageData(width, height, values) {
  var data = new Uint8ClampedArray(width * height * 4);
  for (var i = 0; i < values.length; i++) {
    data[i] = values[i];
  }
  return new ImageData(data, width, height);
}

// Helper: fill an ImageData with a single color
function solidImage(width, height, r, g, b, a) {
  a = a || 255;
  var data = new Uint8ClampedArray(width * height * 4);
  for (var i = 0; i < width * height * 4; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return new ImageData(data, width, height);
}

// ============================================================
// UNIFORM IMAGE — NO EDGES
// ============================================================
console.log('\n--- Uniform image → no edges ---');

{
  // A 3x3 image of all mid-gray: no gradient anywhere
  var img = solidImage(3, 3, 128, 128, 128);
  var result = detectEdges(img, { threshold: 20 });

  // Every pixel should be background (240,240,240)
  for (var i = 0; i < result.data.length; i += 4) {
    assertEq(result.data[i], 240, 'uniform gray: R is bg (240)');
    assertEq(result.data[i + 1], 240, 'uniform gray: G is bg (240)');
    assertEq(result.data[i + 2], 240, 'uniform gray: B is bg (240)');
  }
}

{
  // Uniform white
  var img = solidImage(5, 5, 255, 255, 255);
  var result = detectEdges(img, { threshold: 10 });
  for (var i = 0; i < result.data.length; i += 4) {
    assertEq(result.data[i], 240, 'uniform white: bg pixel');
  }
}

{
  // Uniform black
  var img = solidImage(4, 4, 0, 0, 0);
  var result = detectEdges(img, { threshold: 5 });
  for (var i = 0; i < result.data.length; i += 4) {
    assertEq(result.data[i], 240, 'uniform black: bg pixel');
  }
}

// ============================================================
// SHARP VERTICAL EDGE
// ============================================================
console.log('--- Sharp vertical edge ---');

{
  // 7x7 image: left 3 columns black, right 4 columns white
  // Edge at x=3. Interior pixel (3,3) sees the transition.
  // Pixel (1,3) is 2 columns from edge → uniform black neighborhood.
  var W = 7, H = 7;
  var data = new Uint8ClampedArray(W * H * 4);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = (y * W + x) * 4;
      if (x < 3) {
        data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0;
      } else {
        data[idx] = 255; data[idx + 1] = 255; data[idx + 2] = 255;
      }
      data[idx + 3] = 255;
    }
  }
  var img = new ImageData(data, W, H);
  var result = detectEdges(img, { threshold: 50 });

  // Edge at x=3. Pixel (3,3) should detect the vertical transition.
  var midIdx = (3 * W + 3) * 4;
  assert(result.data[midIdx] <= 40, 'vertical edge center: dark edge pixel (R)');
  assert(result.data[midIdx + 1] <= 40, 'vertical edge center: dark edge pixel (G)');
  assert(result.data[midIdx + 2] <= 40, 'vertical edge center: dark edge pixel (B)');

  // Away from edge (x=1, y=3) → 3x3 neighborhood is all black → no gradient
  var offIdx = (3 * W + 1) * 4;
  assertEq(result.data[offIdx], 240, 'away from vertical edge: bg pixel');
}

// ============================================================
// SHARP HORIZONTAL EDGE
// ============================================================
console.log('--- Sharp horizontal edge ---');

{
  // 7x7 image: top 3 rows black, bottom 4 rows white
  // Edge at y=3. Pixel (3,3) sees transition; pixel (3,1) is 2 rows from edge.
  var W = 7, H = 7;
  var data = new Uint8ClampedArray(W * H * 4);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = (y * W + x) * 4;
      if (y < 3) {
        data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0;
      } else {
        data[idx] = 255; data[idx + 1] = 255; data[idx + 2] = 255;
      }
      data[idx + 3] = 255;
    }
  }
  var img = new ImageData(data, W, H);
  var result = detectEdges(img, { threshold: 50 });

  // Edge at y=3. Pixel (3,3) should detect horizontal transition.
  var midIdx = (3 * W + 3) * 4;
  assert(result.data[midIdx] <= 40, 'horizontal edge center: dark edge pixel (R)');
  assert(result.data[midIdx + 1] <= 40, 'horizontal edge center: dark edge pixel (G)');
  assert(result.data[midIdx + 2] <= 40, 'horizontal edge center: dark edge pixel (B)');

  // Away from edge (y=1, x=3) → 3x3 neighborhood is all black → no gradient
  var offIdx = (1 * W + 3) * 4;
  assertEq(result.data[offIdx], 240, 'away from horizontal edge: bg pixel');
}

// ============================================================
// DIAGONAL EDGE
// ============================================================
console.log('--- Diagonal edge ---');

{
  // 5x5 image: top-left triangle black, bottom-right white
  var data = new Uint8ClampedArray(5 * 5 * 4);
  for (var y = 0; y < 5; y++) {
    for (var x = 0; x < 5; x++) {
      var idx = (y * 5 + x) * 4;
      if (x + y < 4) {
        data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0;
      } else {
        data[idx] = 255; data[idx + 1] = 255; data[idx + 2] = 255;
      }
      data[idx + 3] = 255;
    }
  }
  var img = new ImageData(data, 5, 5);
  var result = detectEdges(img, { threshold: 50 });

  // The diagonal edge should produce edge pixels along the boundary.
  // Check pixel (2,2): neighborhood crosses the diagonal.
  var midIdx = (2 * 5 + 2) * 4;
  assert(result.data[midIdx] <= 40, 'diagonal edge: edge pixel at (2,2)');

  // Far from edge (0,0) → background
  var cornerIdx = (0 * 5 + 0) * 4;
  assertEq(result.data[cornerIdx], 240, 'diagonal edge: corner = bg');

  // Far from edge (4,4) → background (but it's a border pixel, always bg)
  var farIdx = (4 * 5 + 4) * 4;
  assertEq(result.data[farIdx], 240, 'diagonal edge: far corner = bg');
}

// ============================================================
// THRESHOLD BEHAVIOR
// ============================================================
console.log('--- Threshold behavior ---');

{
  // 7x7 vertical edge image (black | white, edge at x=3)
  var W = 7, H = 7;
  var data = new Uint8ClampedArray(W * H * 4);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = (y * W + x) * 4;
      var v = x < 3 ? 0 : 255;
      data[idx] = v; data[idx + 1] = v; data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  var img = new ImageData(data, W, H);
  var midIdx = (3 * W + 3) * 4;

  // Very high threshold (255) → magnitude clamped to 255, threshold=255 suppresses all
  var resultHigh = detectEdges(img, { threshold: 255 });
  assertEq(resultHigh.data[midIdx], 240, 'threshold=255: edge suppressed → bg');

  // Very low threshold → edges detected
  var resultLow = detectEdges(img, { threshold: 5 });
  assert(resultLow.data[midIdx] <= 40, 'threshold=5: edge detected');

  // Default threshold (50) → edge detected
  var resultDefault = detectEdges(img);
  assert(resultDefault.data[midIdx] <= 40, 'default threshold (50): edge detected');
}

// ============================================================
// INVERT MODE
// ============================================================
console.log('--- Invert mode ---');

{
  // 7x7 vertical edge image (edge at x=3)
  var W = 7, H = 7;
  var data = new Uint8ClampedArray(W * H * 4);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = (y * W + x) * 4;
      var v = x < 3 ? 0 : 255;
      data[idx] = v; data[idx + 1] = v; data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  var img = new ImageData(data, W, H);

  // Normal: background is light (test uniform region at x=1)
  var norm = detectEdges(img, { threshold: 50 });
  var uniformIdx = (3 * W + 1) * 4; // (x=1, y=3) — uniform black neighborhood
  assert(norm.data[uniformIdx] > 200, 'normal: bg is light');

  // Inverted: background is dark, edge is light
  var inv = detectEdges(img, { threshold: 50, invert: true });
  assert(inv.data[uniformIdx] < 50, 'invert: bg is dark');

  var midIdx = (3 * W + 3) * 4;
  assert(inv.data[midIdx] > 200, 'invert: edge is light');
}

// ============================================================
// ALPHA PRESERVATION
// ============================================================
console.log('--- Alpha preservation ---');

{
  var img = solidImage(5, 5, 128, 128, 128, 200);
  var result = detectEdges(img, { threshold: 20 });
  for (var i = 3; i < result.data.length; i += 4) {
    assertEq(result.data[i], 200, 'alpha preserved at ' + i);
  }
}

{
  // Image with varying alpha, vertical edge
  var data = new Uint8ClampedArray(5 * 5 * 4);
  for (var y = 0; y < 5; y++) {
    for (var x = 0; x < 5; x++) {
      var idx = (y * 5 + x) * 4;
      var v = x < 2 ? 0 : 255;
      data[idx] = v; data[idx + 1] = v; data[idx + 2] = v;
      data[idx + 3] = (y * 5 + x) * 10 + 5; // varying alpha
    }
  }
  var img = new ImageData(data, 5, 5);
  var result = detectEdges(img, { threshold: 50 });

  for (var i = 3; i < result.data.length; i += 4) {
    assertEq(result.data[i], data[i], 'varying alpha preserved');
  }
}

// ============================================================
// SMALL INPUTS
// ============================================================
console.log('--- Small inputs ---');

{
  // 1x1 image — all border pixels → all background
  var r = 128, g = 128, b = 128;
  var img = solidImage(1, 1, r, g, b);
  var result = detectEdges(img, { threshold: 10 });
  assertEq(result.data[0], 240, '1x1: R = bg');
  assertEq(result.data[1], 240, '1x1: G = bg');
  assertEq(result.data[2], 240, '1x1: B = bg');
  assertEq(result.data[3], 255, '1x1: alpha preserved');
}

{
  // 2x2 image — all border → all background
  var img = solidImage(2, 2, 200, 100, 50);
  var result = detectEdges(img, { threshold: 10 });
  for (var i = 0; i < result.data.length; i += 4) {
    assertEq(result.data[i], 240, '2x2 pixel ' + i + ': bg');
  }
}

{
  // 3x3 image — only center pixel is interior, uniform → bg
  var img = solidImage(3, 3, 128, 128, 128);
  var result = detectEdges(img, { threshold: 10 });
  // All pixels should be background (no edges in uniform image)
  for (var i = 0; i < result.data.length; i += 4) {
    assertEq(result.data[i], 240, '3x3 uniform: all bg');
  }
}

{
  // 3x3 with vertical edge: left column black, others white
  var data = new Uint8ClampedArray(3 * 3 * 4);
  for (var y = 0; y < 3; y++) {
    for (var x = 0; x < 3; x++) {
      var idx = (y * 3 + x) * 4;
      var v = x === 0 ? 0 : 255;
      data[idx] = v; data[idx + 1] = v; data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  var img = new ImageData(data, 3, 3);
  var result = detectEdges(img, { threshold: 50 });

  // Center pixel (1,1) is interior → should detect the vertical edge
  var midIdx = (1 * 3 + 1) * 4;
  assert(result.data[midIdx] <= 40, '3x3 edge: center is edge pixel');
}

// ============================================================
// RESULTS
// ============================================================
console.log('\n' + '='.repeat(40));
console.log('Tests: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
console.log('='.repeat(40));

process.exit(failed > 0 ? 1 : 0);

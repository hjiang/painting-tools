// tests/viewTransforms.test.js
// Run with: node tests/viewTransforms.test.js
//
// Tests the viewTransforms pure functions: flipHorizontal, toGrayscale,
// and boxBlur.

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
  tolerance = tolerance || 1;
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

var viewTransforms = require('../viewTransforms.js');

// Helper: create a 1x1 pixel ImageData
function pixel(r, g, b, a) {
  a = a !== undefined ? a : 255;
  var data = new Uint8ClampedArray([r, g, b, a]);
  return new ImageData(data, 1, 1);
}

// Helper: create a multi-pixel ImageData
function solidImage(width, height, r, g, b, a) {
  a = a !== undefined ? a : 255;
  var data = new Uint8ClampedArray(width * height * 4);
  for (var i = 0; i < width * height * 4; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return new ImageData(data, width, height);
}

// Helper: deep-copy an ImageData
function cloneImageData(img) {
  var copy = new Uint8ClampedArray(img.data.length);
  copy.set(img.data);
  return new ImageData(copy, img.width, img.height);
}

// ============================================================
// flipHorizontal
// ============================================================
console.log('\n--- flipHorizontal ---');

// 3×1 image: columns A(10), B(20), C(30) → C, B, A
{
  var data = new Uint8ClampedArray([
    10, 0, 0, 255,   // col 0
    20, 0, 0, 255,   // col 1
    30, 0, 0, 255    // col 2
  ]);
  var img = new ImageData(data, 3, 1);
  var inputCopy = cloneImageData(img);
  var out = viewTransforms.flipHorizontal(img);
  assertEq(out.width, 3, 'flip: width preserved');
  assertEq(out.height, 1, 'flip: height preserved');
  // Flipped: col0=30, col1=20, col2=10
  assertEq(out.data[0], 30, 'flip: col0 R → 30');
  assertEq(out.data[4], 20, 'flip: col1 R → 20');
  assertEq(out.data[8], 10, 'flip: col2 R → 10');
  // Input untouched
  assertEq(inputCopy.data[0], img.data[0], 'flip: input R untouched');
  assertEq(inputCopy.data[4], img.data[4], 'flip: input G untouched');
  assertEq(inputCopy.data[8], img.data[8], 'flip: input B untouched');
}

// Alpha preserved
{
  var img = solidImage(2, 2, 100, 100, 100, 128);
  var out = viewTransforms.flipHorizontal(img);
  assertEq(out.data[3], 128, 'flip: alpha preserved (pixel 0)');
  assertEq(out.data[7], 128, 'flip: alpha preserved (pixel 1)');
  assertEq(out.data[11], 128, 'flip: alpha preserved (pixel 2)');
  assertEq(out.data[15], 128, 'flip: alpha preserved (pixel 3)');
}

// Dimensions preserved on non-square image
{
  var img = solidImage(5, 3, 50, 100, 150);
  var out = viewTransforms.flipHorizontal(img);
  assertEq(out.width, 5, 'flip: non-square width');
  assertEq(out.height, 3, 'flip: non-square height');
  assertEq(out.data.length, 5 * 3 * 4, 'flip: data length');
}

// ============================================================
// toGrayscale
// ============================================================
console.log('\n--- toGrayscale ---');

// Pure red → L = Math.round(0.299*255) = Math.round(76.245) = 76
{
  var out = viewTransforms.toGrayscale(pixel(255, 0, 0));
  assertEq(out.data[0], 76, 'grayscale: pure red R → 76');
  assertEq(out.data[1], 76, 'grayscale: pure red G → 76');
  assertEq(out.data[2], 76, 'grayscale: pure red B → 76');
}

// White → 255
{
  var out = viewTransforms.toGrayscale(pixel(255, 255, 255));
  assertEq(out.data[0], 255, 'grayscale: white → 255');
  assertEq(out.data[1], 255, 'grayscale: white → 255');
  assertEq(out.data[2], 255, 'grayscale: white → 255');
}

// Black → 0
{
  var out = viewTransforms.toGrayscale(pixel(0, 0, 0));
  assertEq(out.data[0], 0, 'grayscale: black → 0');
  assertEq(out.data[1], 0, 'grayscale: black → 0');
  assertEq(out.data[2], 0, 'grayscale: black → 0');
}

// Alpha preserved
{
  var out = viewTransforms.toGrayscale(pixel(100, 150, 200, 64));
  assertEq(out.data[3], 64, 'grayscale: alpha preserved');
}

// Input untouched
{
  var img = pixel(50, 100, 150);
  var copy = cloneImageData(img);
  viewTransforms.toGrayscale(img);
  assertEq(img.data[0], copy.data[0], 'grayscale: input R untouched');
  assertEq(img.data[1], copy.data[1], 'grayscale: input G untouched');
  assertEq(img.data[2], copy.data[2], 'grayscale: input B untouched');
  assertEq(img.data[3], copy.data[3], 'grayscale: input A untouched');
}

// Mixed colors produce correct luminance
{
  // L = round(0.299*40 + 0.587*180 + 0.114*60) = round(11.96 + 105.66 + 6.84) = round(124.46) = 124
  var out = viewTransforms.toGrayscale(pixel(40, 180, 60));
  assertEq(out.data[0], 124, 'grayscale: mixed color → 124');
  assertEq(out.data[1], 124, 'grayscale: mixed color → 124');
  assertEq(out.data[2], 124, 'grayscale: mixed color → 124');
}

// ============================================================
// boxBlur
// ============================================================
console.log('\n--- boxBlur ---');

// radius 0 = identity (content-equal, not same reference)
{
  var img = pixel(123, 45, 67);
  var out = viewTransforms.boxBlur(img, 0, 1);
  assert(out !== img, 'boxBlur(0): output is new object');
  assertEq(out.data[0], 123, 'boxBlur(0): R unchanged');
  assertEq(out.data[1], 45, 'boxBlur(0): G unchanged');
  assertEq(out.data[2], 67, 'boxBlur(0): B unchanged');
  assertEq(out.data[3], 255, 'boxBlur(0): A unchanged');
}

// Uniform image unchanged at any radius
{
  var img = solidImage(10, 10, 128, 128, 128);
  var out = viewTransforms.boxBlur(img, 3, 2);
  assertEq(out.data[0], 128, 'boxBlur: uniform R unchanged');
  assertEq(out.data[1], 128, 'boxBlur: uniform G unchanged');
  assertEq(out.data[2], 128, 'boxBlur: uniform B unchanged');
}

// Dimensions preserved
{
  var img = solidImage(7, 11, 100, 100, 100);
  var out = viewTransforms.boxBlur(img, 2, 1);
  assertEq(out.width, 7, 'boxBlur: width preserved');
  assertEq(out.height, 11, 'boxBlur: height preserved');
  assertEq(out.data.length, 7 * 11 * 4, 'boxBlur: data length');
}

// Center impulse with radius 1, 1 iteration on 5×5
// With float intermediates and shrinking edge windows, the 3×3 neighborhood
// around center (2,2) all get 255/9 = 28.33 → 28. Pixels outside get 0.
{
  var img = solidImage(5, 5, 0, 0, 0);  // black background
  // Set center pixel to 255
  var cx = 2, cy = 2;
  var idx = (cy * 5 + cx) * 4;
  img.data[idx] = 255;
  img.data[idx + 1] = 255;
  img.data[idx + 2] = 255;

  var out = viewTransforms.boxBlur(img, 1, 1);

  var expected = Math.round(255 / 9); // 28

  // Check all 25 pixels
  for (var y = 0; y < 5; y++) {
    for (var x = 0; x < 5; x++) {
      var pi = (y * 5 + x) * 4;
      // The 3×3 neighborhood [1..3]×[1..3] should be 28
      if (x >= 1 && x <= 3 && y >= 1 && y <= 3) {
        assertEq(out.data[pi], expected, 'boxBlur impulse: pixel (' + x + ',' + y + ') R = ' + expected);
        assertEq(out.data[pi + 1], expected, 'boxBlur impulse: pixel (' + x + ',' + y + ') G = ' + expected);
        assertEq(out.data[pi + 2], expected, 'boxBlur impulse: pixel (' + x + ',' + y + ') B = ' + expected);
      } else {
        assertEq(out.data[pi], 0, 'boxBlur impulse: pixel (' + x + ',' + y + ') R = 0');
        assertEq(out.data[pi + 1], 0, 'boxBlur impulse: pixel (' + x + ',' + y + ') G = 0');
        assertEq(out.data[pi + 2], 0, 'boxBlur impulse: pixel (' + x + ',' + y + ') B = 0');
      }
    }
  }
}

// Alpha channel copied verbatim
{
  var img = solidImage(4, 4, 100, 100, 100, 200);
  img.data[3] = 100;  // make alpha non-uniform
  img.data[7] = 150;
  img.data[11] = 200;
  var out = viewTransforms.boxBlur(img, 2, 2);
  assertEq(out.data[3], 100, 'boxBlur: alpha copied (pixel 0)');
  assertEq(out.data[7], 150, 'boxBlur: alpha copied (pixel 1)');
  assertEq(out.data[11], 200, 'boxBlur: alpha copied (pixel 2)');
}

// Input unmodified
{
  var img = solidImage(4, 4, 100, 100, 100);
  img.data[0] = 255;
  var copy = cloneImageData(img);
  viewTransforms.boxBlur(img, 1, 1);
  for (var i = 0; i < img.data.length; i++) {
    assertEq(img.data[i], copy.data[i], 'boxBlur: input[' + i + '] untouched');
  }
}

// Monotone variance: additional iterations smooth more (variance non-increasing)
{
  var checker = solidImage(8, 8, 0, 0, 0);
  for (var y = 0; y < 8; y++) {
    for (var x = 0; x < 8; x++) {
      var idx = (y * 8 + x) * 4;
      var val = (x + y) % 2 === 0 ? 0 : 255;
      checker.data[idx] = val;
      checker.data[idx + 1] = val;
      checker.data[idx + 2] = val;
    }
  }

  var blur1 = viewTransforms.boxBlur(checker, 1, 1);
  var blur2 = viewTransforms.boxBlur(checker, 1, 2);
  var blur3 = viewTransforms.boxBlur(checker, 1, 3);

  function computeVariance(img) {
    var data = img.data;
    var sum = 0, sumSq = 0, count = 0;
    for (var i = 0; i < data.length; i += 4) {
      var v = data[i]; // R channel (grayscale)
      sum += v;
      sumSq += v * v;
      count++;
    }
    var mean = sum / count;
    return sumSq / count - mean * mean;
  }

  var v1 = computeVariance(blur1);
  var v2 = computeVariance(blur2);
  var v3 = computeVariance(blur3);

  assert(v2 <= v1 + 0.01, 'boxBlur variance non-increasing: iter 2 ≤ iter 1 (' + v2 + ' ≤ ' + v1 + ')');
  assert(v3 <= v2 + 0.01, 'boxBlur variance non-increasing: iter 3 ≤ iter 2 (' + v3 + ' ≤ ' + v2 + ')');
}

// ============================================================
// RESULTS
// ============================================================
console.log('\n' + '='.repeat(40));
console.log('Tests: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
console.log('='.repeat(40));

process.exit(failed > 0 ? 1 : 0);

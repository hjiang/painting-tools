// tests/lighten.test.js
// Run with: node tests/lighten.test.js
//
// Tests the lighten() function — blends each pixel toward white by a
// configurable percentage to save ink when printing and aid markup.

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

var lighten = require('../lighten.js').lighten;

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

// ============================================================
// AMOUNT = 0 — NO CHANGE
// ============================================================
console.log('\n--- Amount 0% (no change) ---');

{
  var r = lighten(pixel(0, 0, 0), 0);
  assertEq(r.imageData.data[0], 0, '0%: black stays 0 (R)');
  assertEq(r.imageData.data[1], 0, '0%: black stays 0 (G)');
  assertEq(r.imageData.data[2], 0, '0%: black stays 0 (B)');
}

{
  var r = lighten(pixel(128, 128, 128), 0);
  assertEq(r.imageData.data[0], 128, '0%: mid-gray unchanged');
}

{
  var r = lighten(pixel(255, 255, 255), 0);
  assertEq(r.imageData.data[0], 255, '0%: white unchanged');
}

{
  var r = lighten(pixel(100, 150, 200), 0);
  assertEq(r.imageData.data[0], 100, '0%: color R unchanged');
  assertEq(r.imageData.data[1], 150, '0%: color G unchanged');
  assertEq(r.imageData.data[2], 200, '0%: color B unchanged');
}

// ============================================================
// AMOUNT = 100 — PURE WHITE
// ============================================================
console.log('--- Amount 100% (pure white) ---');

{
  var r = lighten(pixel(0, 0, 0), 100);
  assertEq(r.imageData.data[0], 255, '100%: black → 255 (R)');
  assertEq(r.imageData.data[1], 255, '100%: black → 255 (G)');
  assertEq(r.imageData.data[2], 255, '100%: black → 255 (B)');
}

{
  var r = lighten(pixel(128, 128, 128), 100);
  assertEq(r.imageData.data[0], 255, '100%: mid-gray → 255');
}

{
  var r = lighten(pixel(255, 255, 255), 100);
  assertEq(r.imageData.data[0], 255, '100%: white stays white');
}

{
  var r = lighten(pixel(100, 150, 200), 100);
  assertEq(r.imageData.data[0], 255, '100%: color R → 255');
  assertEq(r.imageData.data[1], 255, '100%: color G → 255');
  assertEq(r.imageData.data[2], 255, '100%: color B → 255');
}

// ============================================================
// AMOUNT = 50 — HALFWAY TO WHITE
// ============================================================
console.log('--- Amount 50% (halfway) ---');

{
  // black → 0 + (255-0)*0.5 = 127.5 → 128
  var r = lighten(pixel(0, 0, 0), 50);
  assertClose(r.imageData.data[0], 128, '50%: black → ~128 (R)');
  assertClose(r.imageData.data[1], 128, '50%: black → ~128 (G)');
  assertClose(r.imageData.data[2], 128, '50%: black → ~128 (B)');
}

{
  // white → 255 + (255-255)*0.5 = 255
  var r = lighten(pixel(255, 255, 255), 50);
  assertEq(r.imageData.data[0], 255, '50%: white stays white');
}

{
  // 100 → 100 + (255-100)*0.5 = 100 + 77.5 = 177.5 → 178
  var r = lighten(pixel(100, 100, 100), 50);
  assertClose(r.imageData.data[0], 178, '50%: gray 100 → ~178');
}

{
  // 200 → 200 + (255-200)*0.5 = 200 + 27.5 = 227.5 → 228
  var r = lighten(pixel(200, 200, 200), 50);
  assertClose(r.imageData.data[0], 228, '50%: gray 200 → ~228');
}

// ============================================================
// AMOUNT = 25 — QUARTER WAY
// ============================================================
console.log('--- Amount 25% ---');

{
  // black → 0 + 255*0.25 = 63.75 → 64
  var r = lighten(pixel(0, 0, 0), 25);
  assertClose(r.imageData.data[0], 64, '25%: black → ~64');
}

{
  // 100 → 100 + 155*0.25 = 100 + 38.75 = 138.75 → 139
  var r = lighten(pixel(100, 100, 100), 25);
  assertClose(r.imageData.data[0], 139, '25%: gray 100 → ~139');
}

// ============================================================
// AMOUNT = 75 — THREE-QUARTERS WAY
// ============================================================
console.log('--- Amount 75% ---');

{
  var r = lighten(pixel(0, 0, 0), 75);
  assertClose(r.imageData.data[0], 191, '75%: black → ~191');
}

{
  var r = lighten(pixel(50, 100, 150), 75);
  // 50 + 205*0.75 = 50 + 153.75 = 203.75 → 204
  assertClose(r.imageData.data[0], 204, '75%: color R 50 → ~204');
  // 100 + 155*0.75 = 100 + 116.25 = 216.25 → 216
  assertClose(r.imageData.data[1], 216, '75%: color G 100 → ~216');
  // 150 + 105*0.75 = 150 + 78.75 = 228.75 → 229
  assertClose(r.imageData.data[2], 229, '75%: color B 150 → ~229');
}

// ============================================================
// ALPHA PRESERVATION
// ============================================================
console.log('--- Alpha preservation ---');

{
  var r = lighten(pixel(100, 100, 100, 128), 50);
  assertEq(r.imageData.data[3], 128, 'alpha=128 preserved after lighten');
}

{
  var r = lighten(pixel(0, 0, 0, 0), 100);
  assertEq(r.imageData.data[3], 0, 'alpha=0 preserved');
}

{
  var r = lighten(pixel(255, 255, 255, 200), 50);
  assertEq(r.imageData.data[3], 200, 'alpha=200 preserved');
}

// ============================================================
// LARGE IMAGE — DIMENSIONS + DATA LENGTH
// ============================================================
console.log('--- Image dimensions preserved ---');

{
  var img = solidImage(10, 20, 128, 128, 128);
  var r = lighten(img, 30);
  assertEq(r.imageData.width, 10, 'width preserved');
  assertEq(r.imageData.height, 20, 'height preserved');
  assertEq(r.imageData.data.length, 10 * 20 * 4, 'data length matches');
}

// Check that all pixels in a solid image are lightened consistently
{
  var img = solidImage(4, 4, 80, 80, 80);
  var r = lighten(img, 50);
  for (var i = 0; i < r.imageData.data.length; i += 4) {
    assertClose(r.imageData.data[i], 168, 'solid 4x4: consistent R');
    assertClose(r.imageData.data[i + 1], 168, 'solid 4x4: consistent G');
    assertClose(r.imageData.data[i + 2], 168, 'solid 4x4: consistent B');
  }
}

// ============================================================
// EDGE CASES
// ============================================================
console.log('--- Edge cases ---');

// Amount out of range — clamped to 0-100
{
  var r = lighten(pixel(0, 0, 0), -10);
  assertEq(r.imageData.data[0], 0, 'negative amount → clamped to 0 (no change)');
}

{
  var r = lighten(pixel(0, 0, 0), 200);
  assertEq(r.imageData.data[0], 255, 'amount > 100 → clamped to 100 (white)');
}

// Amount = 0.5 — fractional amounts should work (float blend)
{
  // black → 0 + 255*0.005 = 1.275 → 1
  var r = lighten(pixel(0, 0, 0), 0.5);
  assertClose(r.imageData.data[0], 1, '0.5% fractional: black → ~1');
}

// Amount = 1 — very subtle lightening
{
  // black → 0 + 255*0.01 = 2.55 → 3
  var r = lighten(pixel(0, 0, 0), 1);
  assertClose(r.imageData.data[0], 3, '1%: black → ~3');
}

// Color image: different channels lighten at different rates
{
  var r = lighten(pixel(0, 128, 255), 40);
  // R: 0 + 255*0.4 = 102
  assertClose(r.imageData.data[0], 102, 'color R=0 +40% → ~102');
  // G: 128 + 127*0.4 = 128 + 50.8 = 178.8 → 179
  assertClose(r.imageData.data[1], 179, 'color G=128 +40% → ~179');
  // B: 255 + 0*0.4 = 255
  assertEq(r.imageData.data[2], 255, 'color B=255 +40% → 255');
}

// ============================================================
// RESULTS
// ============================================================
console.log('\n' + '='.repeat(40));
console.log('Tests: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
console.log('='.repeat(40));

process.exit(failed > 0 ? 1 : 0);

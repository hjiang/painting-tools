// tests/edgeDetect.test.js
// Run with: node tests/edgeDetect.test.js
//
// Tests for Canny edge detection pipeline:
//   gaussianKernel1D, gaussianBlur, sobelGradient,
//   nonMaxSuppression, hysteresis, detectEdges

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

function assertGt(actual, expected, msg) {
  if (actual > expected) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg + ' — expected >' + expected + ', got ' + actual); }
}

function assertLt(actual, expected, msg) {
  if (actual < expected) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg + ' — expected <' + expected + ', got ' + actual); }
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

var mod = require('../edgeDetect.js');
var detectEdges = mod.detectEdges;
var gaussianKernel1D = mod.gaussianKernel1D;
var gaussianBlur = mod.gaussianBlur;
var sobelGradient = mod.sobelGradient;
var nonMaxSuppression = mod.nonMaxSuppression;
var hysteresis = mod.hysteresis;

// ── Helpers ────────────────────────────────────────────────

function makeImageData(width, height, values) {
  var data = new Uint8ClampedArray(width * height * 4);
  for (var i = 0; i < values.length; i++) {
    data[i] = values[i];
  }
  return new ImageData(data, width, height);
}

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

function makeGrayArray(width, height, fn) {
  // fn(x, y) → 0–255 grayscale value
  var arr = new Uint8Array(width * height);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      arr[y * width + x] = fn(x, y);
    }
  }
  return arr;
}

// ============================================================
// GAUSSIAN KERNEL 1D
// ============================================================
console.log('\n--- Gaussian Kernel 1D ---');

{
  // sigma=0 → identity kernel [1.0]
  var k = gaussianKernel1D(0);
  assertEq(k.length, 1, 'sigma=0: kernel length 1');
  assertClose(k[0], 1.0, 'sigma=0: kernel[0] ≈ 1.0', 0.001);
}

{
  // sigma=1 → size 7 (2*ceil(3)+1 = 7)
  var k = gaussianKernel1D(1);
  assertEq(k.length, 7, 'sigma=1: kernel length 7');
  // Sum should be ~1.0
  var sum = 0;
  for (var i = 0; i < k.length; i++) sum += k[i];
  assertClose(sum, 1.0, 'sigma=1: kernel sums to 1.0', 0.001);
  // Symmetric
  for (var i = 0; i < k.length; i++) {
    assertClose(k[i], k[k.length - 1 - i], 'sigma=1: symmetric at ' + i, 0.0001);
  }
  // Center is largest
  var mid = Math.floor(k.length / 2);
  for (var i = 0; i < k.length; i++) {
    if (i !== mid) {
      assert(k[mid] > k[i], 'sigma=1: center > index ' + i);
    }
  }
}

{
  // sigma=2 → size 13
  var k = gaussianKernel1D(2);
  assertEq(k.length, 13, 'sigma=2: kernel length 13');
  var sum = 0;
  for (var i = 0; i < k.length; i++) sum += k[i];
  assertClose(sum, 1.0, 'sigma=2: kernel sums to 1.0', 0.001);
}

{
  // sigma=0.3 → size 3
  var k = gaussianKernel1D(0.3);
  assertEq(k.length, 3, 'sigma=0.3: kernel length 3');
}

{
  // Large sigma (10) → clamped to size 31
  var k = gaussianKernel1D(10);
  assertEq(k.length, 31, 'sigma=10: kernel length clamped to 31');
  var sum = 0;
  for (var i = 0; i < k.length; i++) sum += k[i];
  assertClose(sum, 1.0, 'sigma=10: kernel sums to 1.0', 0.001);
}

{
  // sigma=100 → clamped to size 31
  var k = gaussianKernel1D(100);
  assertEq(k.length, 31, 'sigma=100: kernel length clamped to 31');
}

// ============================================================
// GAUSSIAN BLUR
// ============================================================
console.log('--- Gaussian Blur ---');

{
  // sigma=0 → identity (same array returned)
  var gray = makeGrayArray(5, 5, function(x, y) { return 100; });
  var result = gaussianBlur(gray, 5, 5, 0);
  assertEq(result, gray, 'sigma=0: returns same array');

  // sigma=0 on 1x1 image
  var g1 = new Uint8Array([128]);
  var r1 = gaussianBlur(g1, 1, 1, 0);
  assertEq(r1, g1, 'sigma=0 on 1x1: returns same array');
}

{
  // Uniform image → unchanged
  var gray = makeGrayArray(7, 7, function(x, y) { return 128; });
  var result = gaussianBlur(gray, 7, 7, 1.0);
  for (var i = 0; i < result.length; i++) {
    assertClose(result[i], 128, 'uniform blur: pixel ' + i + ' ≈ 128', 1);
  }
}

{
  // Dimension preserved
  var gray = makeGrayArray(5, 3, function(x, y) { return 100; });
  var result = gaussianBlur(gray, 5, 3, 1.0);
  assertEq(result.length, 15, 'blur: output length = 15');
  assertEq(result instanceof Uint8Array, true, 'blur: output is Uint8Array');
}

{
  // Single bright pixel (impulse) → spreads
  var W = 9, H = 9;
  var gray = new Uint8Array(W * H);
  gray[4 * W + 4] = 255; // center pixel white
  var result = gaussianBlur(gray, W, H, 1.0);
  // Center should still be brightest
  var centerVal = result[4 * W + 4];
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (x === 4 && y === 4) continue;
      assert(result[y * W + x] <= centerVal, 'impulse blur: center (' + centerVal + ') >= (' + x + ',' + y + ') = ' + result[y * W + x]);
    }
  }
  // Neighbors should have non-zero values (blur spread)
  assertGt(result[4 * W + 5], 0, 'impulse blur: right neighbor > 0');
  assertGt(result[5 * W + 4], 0, 'impulse blur: bottom neighbor > 0');
  // Center should be less than 255 after blur
  assertLt(centerVal, 255, 'impulse blur: center < 255');
}

// ============================================================
// SOBEL GRADIENT
// ============================================================
console.log('--- Sobel Gradient ---');

{
  // Uniform image → all zero magnitude
  var gray = makeGrayArray(7, 7, function(x, y) { return 128; });
  var grad = sobelGradient(gray, 7, 7);
  for (var i = 0; i < grad.magnitude.length; i++) {
    assertEq(grad.magnitude[i], 0, 'uniform sobel: magnitude=0 at ' + i);
  }
}

{
  // Vertical edge (left black, right white) at x=3 (0-indexed interior)
  var W = 7, H = 7;
  var gray = makeGrayArray(W, H, function(x, y) {
    return x < 3 ? 0 : 255;
  });
  var grad = sobelGradient(gray, W, H);

  // Edge at x=3. Center (3,3) → strong Gx, weak Gy
  var idx = 3 * W + 3;
  assertGt(grad.magnitude[idx], 100, 'vertical edge: magnitude > 100 at (3,3)');
  // Direction should be → (sector 0) — gradient points right (dark→bright)
  assertEq(grad.direction[idx], 0,
    'vertical edge: direction=0 at (3,3), got ' + grad.direction[idx]);

  // Away from edge (1,3) → no gradient
  var offIdx = 3 * W + 1;
  assertEq(grad.magnitude[offIdx], 0, 'vertical edge: away magnitude=0 at (1,3)');
}

{
  // Horizontal edge (top black, bottom white) at y=3
  var W = 7, H = 7;
  var gray = makeGrayArray(W, H, function(x, y) {
    return y < 3 ? 0 : 255;
  });
  var grad = sobelGradient(gray, W, H);

  var idx = 3 * W + 3;
  assertGt(grad.magnitude[idx], 100, 'horizontal edge: magnitude > 100 at (3,3)');
  // Direction should be ↓ (sector 2) — gradient points down (dark top→bright bottom)
  assertEq(grad.direction[idx], 2, 'horizontal edge: direction=2 (↓) at (3,3)');

  var offIdx = 1 * W + 3;
  assertEq(grad.magnitude[offIdx], 0, 'horizontal edge: away magnitude=0 at (3,1)');
}

{
  // Diagonal edge: top-left black, bottom-right white
  var W = 5, H = 5;
  var gray = makeGrayArray(W, H, function(x, y) {
    return (x + y < 4) ? 0 : 255;
  });
  var grad = sobelGradient(gray, W, H);

  // Diagonal edge should produce gradient at the boundary
  var idx = 2 * W + 2;
  assertGt(grad.magnitude[idx], 50, 'diagonal edge: magnitude > 50 at (2,2)');
  // Direction should be ↘ (sector 1) — gradient points toward bottom-right
  assertEq(grad.direction[idx], 1,
    'diagonal edge: direction=1 (↘) at (2,2), got ' + grad.direction[idx]);
}

{
  // Border pixels → zero magnitude
  var W = 7, H = 7;
  var gray = makeGrayArray(W, H, function(x, y) {
    return x < 3 ? 0 : 255;
  });
  var grad = sobelGradient(gray, W, H);
  for (var y = 0; y < H; y++) {
    assertEq(grad.magnitude[y * W + 0], 0, 'sobel border: (0,' + y + ') = 0');
    assertEq(grad.magnitude[y * W + (W - 1)], 0, 'sobel border: (' + (W - 1) + ',' + y + ') = 0');
  }
  for (var x = 0; x < W; x++) {
    assertEq(grad.magnitude[0 * W + x], 0, 'sobel border: (' + x + ',0) = 0');
    assertEq(grad.magnitude[(H - 1) * W + x], 0, 'sobel border: (' + x + ',' + (H - 1) + ') = 0');
  }
}

// ============================================================
// NON-MAXIMUM SUPPRESSION
// ============================================================
console.log('--- Non-Maximum Suppression ---');

{
  // All zero → all zero
  var W = 5, H = 5;
  var mag = new Uint8Array(W * H);
  var dir = new Uint8Array(W * H); // all 0
  var result = nonMaxSuppression(mag, dir, W, H);
  for (var i = 0; i < result.length; i++) {
    assertEq(result[i], 0, 'zero NMS: all zero at ' + i);
  }
}

{
  // Border pixels → always suppressed
  var W = 5, H = 5;
  var mag = new Uint8Array(W * H);
  mag.fill(100);
  var dir = new Uint8Array(W * H);
  var result = nonMaxSuppression(mag, dir, W, H);
  // All border pixels should be 0
  for (var x = 0; x < W; x++) {
    assertEq(result[0 * W + x], 0, 'NMS border: top row x=' + x + ' suppressed');
    assertEq(result[(H - 1) * W + x], 0, 'NMS border: bottom row x=' + x + ' suppressed');
  }
  for (var y = 1; y < H - 1; y++) {
    assertEq(result[y * W + 0], 0, 'NMS border: left col y=' + y + ' suppressed');
    assertEq(result[y * W + (W - 1)], 0, 'NMS border: right col y=' + y + ' suppressed');
  }
}

{
  // Single peak in horizontal direction (0°) — should survive
  // Pattern: 0 50 100 50 0 in a row, direction=0
  var W = 5, H = 5;
  var mag = new Uint8Array(W * H);
  var dir = new Uint8Array(W * H);
  // Set row 2 (interior): [0, 50, 100, 50, 0], dir=0
  mag[2 * W + 0] = 0;   dir[2 * W + 0] = 0;
  mag[2 * W + 1] = 50;  dir[2 * W + 1] = 0;
  mag[2 * W + 2] = 100; dir[2 * W + 2] = 0;
  mag[2 * W + 3] = 50;  dir[2 * W + 3] = 0;
  mag[2 * W + 4] = 0;   dir[2 * W + 4] = 0;

  var result = nonMaxSuppression(mag, dir, W, H);
  // Peak at (2,2): m=100 > 50(right) and >= 50(left) → survives
  assertGt(result[2 * W + 2], 0, 'NMS peak: center survives');
  // Neighbors suppressed
  assertEq(result[2 * W + 1], 0, 'NMS peak: left neighbor suppressed');
  assertEq(result[2 * W + 3], 0, 'NMS peak: right neighbor suppressed');
}

{
  // Plateau: all equal → front neighbor suppressed (strict > check fails)
  // Pattern: 100 100 100, direction=0
  var W = 5, H = 5;
  var mag = new Uint8Array(W * H);
  mag.fill(100);
  var dir = new Uint8Array(W * H);
  var result = nonMaxSuppression(mag, dir, W, H);

  // On a plateau, only rightmost interior pixels survive due to tie-break
  // For direction=0, check: m > right && m >= left
  // (2,2): 100 > 100? No → suppressed
  // (2,1): 100 > 100? No → suppressed (with left neighbor (2,0) which is border-suppressed=0, so 100 > 0 && 100 >= 0? That's true!)
  //
  // Wait, (2,1) is not a border pixel (x=1, y=2). Its left neighbor is (2,0) which has magnitude 100,
  // but in the result array it's 0 (border). HOWEVER: NMS compares against the INPUT magnitude array,
  // not the output. So (2,1) compares against mag[2*W+0]=100 and mag[2*W+2]=100.
  // 100 > 100? No → suppressed.
  //
  // So on a uniform plateau, all interior pixels are suppressed.
  // Border pixels are always suppressed. So all pixels = 0.
  for (var i = 0; i < result.length; i++) {
    assertEq(result[i], 0, 'NMS plateau: all suppressed at ' + i);
  }
}

{
  // Vertical gradient direction (90°/dir=2): compare top and bottom
  var W = 5, H = 5;
  var mag = new Uint8Array(W * H);
  var dir = new Uint8Array(W * H);
  // Column 2: [0, 50, 100, 50, 0], direction=2 (top-bottom)
  mag[0 * W + 2] = 0;   dir[0 * W + 2] = 2;
  mag[1 * W + 2] = 50;  dir[1 * W + 2] = 2;
  mag[2 * W + 2] = 100; dir[2 * W + 2] = 2;
  mag[3 * W + 2] = 50;  dir[3 * W + 2] = 2;
  mag[4 * W + 2] = 0;   dir[4 * W + 2] = 2;

  var result = nonMaxSuppression(mag, dir, W, H);
  // dir=2: compare (x, y-1) [top/ahead] and (x, y+1) [bottom/behind]
  // Check: m > top && m >= bottom
  // (2,2): 100 > 50 && 100 >= 50 → survives
  assertGt(result[2 * W + 2], 0, 'NMS vertical peak: center survives');
  assertEq(result[1 * W + 2], 0, 'NMS vertical peak: top neighbor suppressed');
  assertEq(result[3 * W + 2], 0, 'NMS vertical peak: bottom neighbor suppressed');
}

// ============================================================
// HYSTERESIS
// ============================================================
console.log('--- Hysteresis ---');

{
  // All zero → all non-edge
  var W = 5, H = 5;
  var nms = new Uint8Array(W * H);
  var result = hysteresis(nms, W, H, 20, 50);
  for (var i = 0; i < result.length; i++) {
    assertEq(result[i], 0, 'hysteresis zeros: all non-edge at ' + i);
  }
}

{
  // All strong (> high) → all edge
  var W = 5, H = 5;
  var nms = new Uint8Array(W * H);
  nms.fill(100);
  var result = hysteresis(nms, W, H, 20, 50);
  for (var i = 0; i < result.length; i++) {
    assertEq(result[i], 255, 'hysteresis all-strong: all edge at ' + i);
  }
}

{
  // All weak, no strong → all non-edge
  var W = 5, H = 5;
  var nms = new Uint8Array(W * H);
  nms.fill(30);
  var result = hysteresis(nms, W, H, 20, 50);
  for (var i = 0; i < result.length; i++) {
    assertEq(result[i], 0, 'hysteresis all-weak: all non-edge at ' + i);
  }
}

{
  // All below low threshold → all non-edge
  var W = 5, H = 5;
  var nms = new Uint8Array(W * H);
  nms.fill(10);
  var result = hysteresis(nms, W, H, 20, 50);
  for (var i = 0; i < result.length; i++) {
    assertEq(result[i], 0, 'hysteresis below-low: all non-edge at ' + i);
  }
}

{
  // Weak pixel adjacent to strong → promoted
  // 3x3 interior: center is strong, neighbors are weak
  var W = 5, H = 5;
  var nms = new Uint8Array(W * H);
  nms[2 * W + 2] = 100; // strong center
  nms[2 * W + 1] = 30;  // left neighbor (weak)
  nms[2 * W + 3] = 30;  // right neighbor (weak)
  nms[1 * W + 2] = 30;  // top neighbor (weak)
  nms[3 * W + 2] = 30;  // bottom neighbor (weak)

  var result = hysteresis(nms, W, H, 20, 50);

  assertEq(result[2 * W + 2], 255, 'hysteresis connect: strong center = edge');
  assertEq(result[2 * W + 1], 255, 'hysteresis connect: weak-left promoted');
  assertEq(result[2 * W + 3], 255, 'hysteresis connect: weak-right promoted');
  assertEq(result[1 * W + 2], 255, 'hysteresis connect: weak-top promoted');
  assertEq(result[3 * W + 2], 255, 'hysteresis connect: weak-bottom promoted');
}

{
  // Weak pixel isolated (no strong neighbor) → suppressed
  var W = 5, H = 5;
  var nms = new Uint8Array(W * H);
  nms[2 * W + 2] = 30; // isolated weak center

  var result = hysteresis(nms, W, H, 20, 50);

  assertEq(result[2 * W + 2], 0, 'hysteresis isolate: weak center suppressed');
}

{
  // Chain: strong → weak → weak → strong → all promoted
  var W = 7, H = 3;
  var nms = new Uint8Array(W * H);
  // Row 1: strong at x=1, weak at x=2,3, strong at x=4
  nms[1 * W + 1] = 100; // strong
  nms[1 * W + 2] = 30;  // weak
  nms[1 * W + 3] = 30;  // weak
  nms[1 * W + 4] = 100; // strong
  nms[1 * W + 5] = 30;  // weak — connected to strong at x=4

  var result = hysteresis(nms, W, H, 20, 50);

  assertEq(result[1 * W + 1], 255, 'hysteresis chain: strong-left = edge');
  assertEq(result[1 * W + 2], 255, 'hysteresis chain: weak-chain-1 promoted');
  assertEq(result[1 * W + 3], 255, 'hysteresis chain: weak-chain-2 promoted');
  assertEq(result[1 * W + 4], 255, 'hysteresis chain: strong-right = edge');
  assertEq(result[1 * W + 5], 255, 'hysteresis chain: weak-tail promoted');
}

{
  // Weak pixel at exact high threshold → not strong (strict >)
  var W = 5, H = 5;
  var nms = new Uint8Array(W * H);
  nms[2 * W + 2] = 50; // exactly at high threshold

  var result = hysteresis(nms, W, H, 20, 50);
  assertEq(result[2 * W + 2], 0, 'hysteresis edge: exact high = not strong (strict >)');
}

{
  // Weak pixel at exact low threshold → not weak (strict >)
  var W = 5, H = 5;
  var nms = new Uint8Array(W * H);
  nms[2 * W + 1] = 100; // strong
  nms[2 * W + 2] = 20;  // exactly at low threshold

  var result = hysteresis(nms, W, H, 20, 50);
  assertEq(result[2 * W + 2], 0, 'hysteresis edge: exact low = not weak (strict >)');
}

// ============================================================
// detectEdges — INTEGRATION TESTS
// ============================================================
console.log('--- detectEdges (integration) ---');

{
  // Uniform image → no edges (all background)
  var img = solidImage(7, 7, 128, 128, 128);
  var result = detectEdges(img, { threshold: 30, blur: 0 });
  for (var i = 0; i < result.data.length; i += 4) {
    assertEq(result.data[i], 240, 'uniform: R=bg(240)');
    assertEq(result.data[i + 1], 240, 'uniform: G=bg(240)');
    assertEq(result.data[i + 2], 240, 'uniform: B=bg(240)');
  }
}

{
  // Sharp vertical edge → edge detected
  var W = 15, H = 9;
  var data = new Uint8ClampedArray(W * H * 4);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = (y * W + x) * 4;
      var v = x < 7 ? 0 : 255;
      data[idx] = v; data[idx + 1] = v; data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  var img = new ImageData(data, W, H);
  var result = detectEdges(img, { threshold: 40, blur: 0 });

  // Edge at x=7. Check interior pixel (7, 4)
  var edgeIdx = (4 * W + 7) * 4;
  assert(result.data[edgeIdx] <= 40, 'vertical edge integration: edge pixel (R ≤ 40)');
  assert(result.data[edgeIdx + 1] <= 40, 'vertical edge integration: edge pixel (G ≤ 40)');
  assert(result.data[edgeIdx + 2] <= 40, 'vertical edge integration: edge pixel (B ≤ 40)');

  // Away from edge (x=3, y=4) → background
  var bgIdx = (4 * W + 3) * 4;
  assertEq(result.data[bgIdx], 240, 'vertical edge integration: away = bg');

  // 1px from edge should be suppressed by NMS (edge is single-pixel)
  var nearIdx = (4 * W + 8) * 4; // x=8, one pixel right of the edge
  // With blur=0 and NMS, only the peak at x=7 should survive
  assertEq(result.data[nearIdx], 240, 'vertical edge integration: x=8 should be bg (NMS thinned)');
}

{
  // Blur parameter works: high blur → fewer edges on noisy image
  var W = 30, H = 10;
  var data = new Uint8ClampedArray(W * H * 4);
  // Create a noisy gradient: random noise added to a ramp
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = (y * W + x) * 4;
      var base = Math.floor(x / W * 255);
      var noise = Math.floor(Math.random() * 30);
      var v = Math.min(255, base + noise);
      data[idx] = v; data[idx + 1] = v; data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  var img = new ImageData(data, W, H);

  // With no blur, noise creates many edge pixels
  var resultNoBlur = detectEdges(img, { threshold: 30, blur: 0 });
  var countNoBlur = 0;
  for (var i = 0; i < resultNoBlur.data.length; i += 4) {
    if (resultNoBlur.data[i] <= 40) countNoBlur++;
  }

  // With high blur, noise is smoothed out → fewer edges
  var resultBlur = detectEdges(img, { threshold: 30, blur: 3.0 });
  var countBlur = 0;
  for (var i = 0; i < resultBlur.data.length; i += 4) {
    if (resultBlur.data[i] <= 40) countBlur++;
  }

  assert(countBlur <= countNoBlur, 'blur: high blur (' + countBlur + ' edges) ≤ no blur (' + countNoBlur + ' edges)');
}

{
  // Invert mode: edge pixels become light, background becomes dark
  var W = 15, H = 9;
  var data = new Uint8ClampedArray(W * H * 4);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = (y * W + x) * 4;
      var v = x < 7 ? 0 : 255;
      data[idx] = v; data[idx + 1] = v; data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  var img = new ImageData(data, W, H);
  var result = detectEdges(img, { threshold: 40, blur: 0, invert: true });

  // Edge pixel (7, 4) should be light
  var edgeIdx = (4 * W + 7) * 4;
  assertGt(result.data[edgeIdx], 200, 'invert: edge pixel is light');

  // Away from edge (3, 4) should be dark
  var bgIdx = (4 * W + 3) * 4;
  assertLt(result.data[bgIdx], 50, 'invert: away pixel is dark');
}

{
  // Alpha preserved
  var img = solidImage(7, 7, 128, 128, 128, 200);
  var result = detectEdges(img, { threshold: 30, blur: 0 });
  for (var i = 3; i < result.data.length; i += 4) {
    assertEq(result.data[i], 200, 'alpha preserved at byte ' + i);
  }
}

{
  // Varying alpha preserved
  var W = 5, H = 5;
  var data = new Uint8ClampedArray(W * H * 4);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = (y * W + x) * 4;
      var v = x < 2 ? 0 : 255;
      data[idx] = v; data[idx + 1] = v; data[idx + 2] = v;
      data[idx + 3] = (y * W + x) * 10 + 5;
    }
  }
  var img = new ImageData(data, W, H);
  var result = detectEdges(img, { threshold: 40, blur: 0 });
  for (var i = 3; i < result.data.length; i += 4) {
    assertEq(result.data[i], data[i], 'varying alpha preserved at byte ' + i);
  }
}

// ============================================================
// SMALL INPUTS
// ============================================================
console.log('--- Small Inputs ---');

{
  // 1x1 image → all background
  var img = solidImage(1, 1, 128, 128, 128);
  var result = detectEdges(img, { threshold: 10, blur: 0 });
  assertEq(result.data[0], 240, '1x1: R=bg');
  assertEq(result.data[1], 240, '1x1: G=bg');
  assertEq(result.data[2], 240, '1x1: B=bg');
  assertEq(result.data[3], 255, '1x1: alpha preserved');
}

{
  // 2x2 image → all background (no interior pixels)
  var img = solidImage(2, 2, 200, 100, 50);
  var result = detectEdges(img, { threshold: 10, blur: 0 });
  for (var i = 0; i < result.data.length; i += 4) {
    assertEq(result.data[i], 240, '2x2: all bg');
  }
}

{
  // 3x3 edge: left column black, rest white → one interior pixel (1,1) should detect
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
  var result = detectEdges(img, { threshold: 50, blur: 0 });

  // Center pixel (1,1) is the only interior pixel → edge
  var midIdx = (1 * 3 + 1) * 4;
  assert(result.data[midIdx] <= 40, '3x3 edge: center is edge pixel');
}

// ============================================================
// DEFAULT PARAMETERS
// ============================================================
console.log('--- Default Parameters ---');

{
  var img = solidImage(7, 7, 128, 128, 128);
  // No options → should use defaults (threshold=50, blur=2.0, no invert)
  var result = detectEdges(img);
  assertEq(result.width, 7, 'defaults: width preserved');
  assertEq(result.height, 7, 'defaults: height preserved');
  assert(result instanceof ImageData, 'defaults: returns ImageData');
}

{
  // Partial options
  var img = solidImage(7, 7, 128, 128, 128);
  var result = detectEdges(img, { threshold: 80 });
  assertEq(result.width, 7, 'partial opts: width preserved');
}

// ============================================================
// NOISE SUPPRESSION (Canny vs raw Sobel)
// ============================================================
console.log('--- Noise Suppression ---');

{
  // Image with subtle noise: slight variations around a mid-gray
  // With blur=0, many noise pixels should register as edges
  // With blur=1, noise should be suppressed
  var W = 30, H = 10;
  var data = new Uint8ClampedArray(W * H * 4);
  var baseVal = 128;
  // Uniform image with small random ±2 noise
  for (var i = 0; i < W * H * 4; i += 4) {
    var noise = Math.floor(Math.random() * 5) - 2; // -2 to +2
    var v = Math.min(255, Math.max(0, baseVal + noise));
    data[i] = v; data[i + 1] = v; data[i + 2] = v;
    data[i + 3] = 255;
  }
  var img = new ImageData(data, W, H);

  // No blur, low threshold: noise should produce edges
  var resultNoBlur = detectEdges(img, { threshold: 5, blur: 0 });
  var noiseEdgesNoBlur = 0;
  for (var i = 0; i < resultNoBlur.data.length; i += 4) {
    if (resultNoBlur.data[i] <= 40) noiseEdgesNoBlur++;
  }

  // With blur, same threshold: noise smoothed, fewer edges
  var resultWithBlur = detectEdges(img, { threshold: 5, blur: 1.0 });
  var noiseEdgesWithBlur = 0;
  for (var i = 0; i < resultWithBlur.data.length; i += 4) {
    if (resultWithBlur.data[i] <= 40) noiseEdgesWithBlur++;
  }

  assert(noiseEdgesWithBlur <= noiseEdgesNoBlur,
    'noise: blur (' + noiseEdgesWithBlur + ') ≤ no-blur (' + noiseEdgesNoBlur + ')');
}

// ============================================================
// RESULTS
// ============================================================
console.log('\n' + '='.repeat(40));
console.log('Tests: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
console.log('='.repeat(40));

process.exit(failed > 0 ? 1 : 0);

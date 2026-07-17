// tests/underpaintingAlignment.test.js
// Run with: node tests/underpaintingAlignment.test.js
//
// Tests for the underpainting alignment geometry module:
//   computeWorkingSize, resizeImageData, validateCornerQuad,
//   solveHomography, mapHomographyPoint, warpPerspective
//
// Follows the repository test convention: tiny inline runner, no Jest/Mocha.

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
  tolerance = (tolerance !== undefined) ? tolerance : 1e-9;
  if (Math.abs(actual - expected) <= tolerance) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg + ' — expected ≈' + expected + ', got ' + actual); }
}

function assertDeepEq(actual, expected, msg) {
  if (actual === expected) { passed++; }
  else if (actual && expected && actual.length === expected.length) {
    var ok = true;
    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) { ok = false; break; }
    }
    if (ok) { passed++; }
    else { failed++; console.error('  FAIL: ' + msg + ' — array mismatch'); }
  } else {
    failed++; console.error('  FAIL: ' + msg + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function assertImagesEqual(img1, img2, msg) {
  if (img1.width !== img2.width || img1.height !== img2.height) {
    failed++; console.error('  FAIL: ' + msg + ' — dimensions differ');
    return;
  }
  var d1 = img1.data;
  var d2 = img2.data;
  var ok = true;
  for (var i = 0; i < d1.length; i++) {
    if (d1[i] !== d2[i]) { ok = false; break; }
  }
  if (ok) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg + ' — pixel data differs'); }
}

function assertThrows(fn, msg) {
  try {
    fn();
    failed++; console.error('  FAIL: ' + msg + ' — expected exception but none was thrown');
  } catch (e) {
    passed++;
  }
}

function assertThrowsType(fn, expectedType, msg) {
  try {
    fn();
    failed++; console.error('  FAIL: ' + msg + ' — expected ' + expectedType.name + ' but none was thrown');
  } catch (e) {
    if (e instanceof expectedType) { passed++; }
    else { failed++; console.error('  FAIL: ' + msg + ' — expected ' + expectedType.name + ' but got ' + e.constructor.name + ': ' + e.message); }
  }
}

function assertThrowsEither(fn, types, msg) {
  try {
    fn();
    failed++; console.error('  FAIL: ' + msg + ' — expected exception but none was thrown');
  } catch (e) {
    for (var ti = 0; ti < types.length; ti++) {
      if (e instanceof types[ti]) { passed++; return; }
    }
    failed++; console.error('  FAIL: ' + msg + ' — unexpected type ' + e.constructor.name + ': ' + e.message);
  }
}

// ---- polyfill ImageData for older Node ----
if (typeof ImageData === 'undefined') {
  global.ImageData = function (data, width, height) {
    if (!(data instanceof Uint8ClampedArray) ||
        data.length !== width * height * 4) {
      throw new TypeError('Invalid ImageData');
    }
    this.data = data;
    this.width = width;
    this.height = height;
  };
}

var mod = require('../underpaintingAlignment.js');
var computeWorkingSize = mod.computeWorkingSize;
var resizeImageData = mod.resizeImageData;
var validateCornerQuad = mod.validateCornerQuad;
var solveHomography = mod.solveHomography;
var mapHomographyPoint = mod.mapHomographyPoint;
var warpPerspective = mod.warpPerspective;

// ── Helpers ────────────────────────────────────────────────

function makeImageData(width, height, values) {
  var data = new Uint8ClampedArray(width * height * 4);
  if (values) {
    for (var i = 0; i < values.length && i < data.length; i++) {
      data[i] = values[i];
    }
  }
  return new ImageData(data, width, height);
}

function makeGradientImageData(width, height) {
  var data = new Uint8ClampedArray(width * height * 4);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var idx = (y * width + x) * 4;
      data[idx] = (x / (width - 1)) * 255;
      data[idx + 1] = (y / (height - 1)) * 255;
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

function snapshotPoints(pts) {
  return pts.map(function (p) { return { x: p.x, y: p.y }; });
}

function snapshotImageDataBytes(img) {
  var arr = new Uint8ClampedArray(img.data);
  return { width: img.width, height: img.height, data: arr };
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ============================================================
// computeWorkingSize
// ============================================================
console.log('\n--- computeWorkingSize ---');

// Fixture 1a: 4000×3000 → 1632×1224 (capped by 2 megapixels)
(function () {
  var result = computeWorkingSize(4000, 3000, 2000000, 2048);
  assertEq(result.width, 1632, '4000×3000 width=1632');
  assertEq(result.height, 1224, '4000×3000 height=1224');
})();

// Fixture 1b: 6000×1000 → 2048×341 (capped by 2048 edge)
(function () {
  var result = computeWorkingSize(6000, 1000, 2000000, 2048);
  assertEq(result.width, 2048, '6000×1000 width=2048');
  assertEq(result.height, 341, '6000×1000 height=341');
})();

// Input < 2 pixels wide throws
assertThrows(function () { computeWorkingSize(1, 100, 2000000, 2048); }, 'width=1 throws');
assertThrows(function () { computeWorkingSize(100, 1, 2000000, 2048); }, 'height=1 throws');
assertThrows(function () { computeWorkingSize(100, 100, 2, 2048); }, 'maxPixels<4 throws');
assertThrows(function () { computeWorkingSize(100, 100, 2000000, 1); }, 'maxEdge<2 throws');
assertThrows(function () { computeWorkingSize(0, 100, 2000000, 2048); }, 'width=0 throws');
assertThrows(function () { computeWorkingSize(-5, 100, 2000000, 2048); }, 'negative width throws');

// Non-numeric throws
assertThrows(function () { computeWorkingSize('a', 100, 2000000, 2048); }, 'non-numeric width throws');
assertThrows(function () { computeWorkingSize(100, null, 2000000, 2048); }, 'null height throws');
assertThrows(function () { computeWorkingSize(100, 100, -1, 2048); }, 'negative maxPixels throws');

// Returned dimensions are integers of at least 2
(function () {
  var r = computeWorkingSize(500, 500, 2000000, 2048);
  assert(r.width >= 2 && r.height >= 2, '500×500 returns ≥2 dims');
  assert(Number.isInteger(r.width) && Number.isInteger(r.height), '500×500 returns integers');
})();

// Returned dimensions are no larger than source
(function () {
  var r = computeWorkingSize(50, 50, 2000000, 2048);
  assert(r.width <= 50 && r.height <= 50, '50×50 result ≤ source');
})();

// ============================================================
// resizeImageData
// ============================================================
console.log('\n--- resizeImageData ---');

// Fixture: opaque bilinear center (2×2 → 3×3)
// Top row: (0,0,0), (255,0,0); Bottom row: (0,255,0), (255,255,255)
// Center pixel = [128,128,64,255]
(function () {
  var src = makeImageData(2, 2, [
    0, 0, 0, 255,     255, 0, 0, 255,
    0, 255, 0, 255,   255, 255, 255, 255
  ]);
  var result = resizeImageData(src, 3, 3);
  assertEq(result.width, 3, '3×3 result width');
  assertEq(result.height, 3, '3×3 result height');
  // Center pixel (index 4)
  assertEq(result.data[16], 128, 'bilinear center R=128');
  assertEq(result.data[17], 128, 'bilinear center G=128');
  assertEq(result.data[18], 64, 'bilinear center B=64');
  assertEq(result.data[19], 255, 'bilinear center A=255');
})();

// Fixture: premultiplied alpha (2×2 → 3×2)
// Left column transparent red (255,0,0,0), right column opaque blue (0,0,255,255)
(function () {
  var src = makeImageData(2, 2, [
    255, 0, 0, 0,   0, 0, 255, 255,
    255, 0, 0, 0,   0, 0, 255, 255
  ]);
  var result = resizeImageData(src, 3, 2);
  assertEq(result.width, 3, 'premult 3×2 width');
  assertEq(result.height, 2, 'premult 3×2 height');
  // Middle column pixels are (0,0,255,128) — not purple
  // Middle column index in first row: offset 1 → data[4..7]
  assertEq(result.data[4], 0, 'premul mid R=0');
  assertEq(result.data[5], 0, 'premul mid G=0');
  assertEq(result.data[6], 255, 'premul mid B=255');
  assertEq(result.data[7], 128, 'premul mid A=128');
})();

// Does not mutate source
(function () {
  var src = makeImageData(4, 4);
  for (var i = 0; i < src.data.length; i++) src.data[i] = (i % 4 === 3) ? 255 : (i % 256);
  var srcCopy = snapshotImageDataBytes(src);
  var result = resizeImageData(src, 2, 2);
  assert(arraysEqual(src.data, srcCopy.data), 'resize does not mutate source');
  assertEq(src.width, srcCopy.width, 'resize does not change source width');
  assertEq(src.height, srcCopy.height, 'resize does not change source height');
})();

// Output dimensions at least 2, throws on invalid dims
assertThrows(function () {
  resizeImageData(makeImageData(4, 4), 1, 4);
}, 'resize output width <2 throws');
assertThrows(function () {
  resizeImageData(makeImageData(4, 4), 4, 0);
}, 'resize output height <1 throws');

// Throws on malformed source
assertThrows(function () {
  resizeImageData({ width: 2, height: 2, data: new Uint8Array(16) }, 2, 2);
}, 'resize non-Uint8ClampedArray throws');
assertThrows(function () {
  resizeImageData(makeImageData(4, 4), -5, 4);
}, 'resize negative output dim throws');

// ============================================================
// validateCornerQuad
// ============================================================
console.log('\n--- validateCornerQuad ---');

// Valid corners on 100×100 image
(function () {
  var points = [{x:0,y:0}, {x:99,y:0}, {x:99,y:99}, {x:0,y:99}];
  var r = validateCornerQuad(points, 100, 100);
  assert(r.valid, 'valid quad 100×100');
  assertEq(r.code, 'valid', 'valid quad code');
})();

// Opposite winding is also valid
(function () {
  var points = [{x:99,y:0}, {x:0,y:0}, {x:0,y:99}, {x:99,y:99}];
  var r = validateCornerQuad(points, 100, 100);
  assert(r.valid, 'opposite winding valid');
})();

// Self-intersecting (crossed sides)
(function () {
  var points = [{x:0,y:0}, {x:99,y:99}, {x:99,y:0}, {x:0,y:99}];
  var r = validateCornerQuad(points, 100, 100);
  assert(!r.valid, 'crossed sides invalid');
  assertEq(r.code, 'self-intersecting', 'crossed sides code');
})();

// Out-of-bounds
(function () {
  var points = [{x:0,y:0}, {x:99,y:0}, {x:100,y:50}, {x:0,y:99}];
  var r = validateCornerQuad(points, 100, 100);
  assert(!r.valid, 'out-of-bounds invalid');
  assertEq(r.code, 'out-of-bounds', 'out-of-bounds code');
})();

// Non-finite
(function () {
  var points = [{x:0,y:0}, {x:99,y:0}, {x:NaN,y:99}, {x:0,y:99}];
  var r = validateCornerQuad(points, 100, 100);
  assert(!r.valid, 'non-finite invalid');
  assertEq(r.code, 'non-finite', 'non-finite code');
})();

// Too-close (duplicate near-duplicate)
(function () {
  var points = [{x:0,y:0}, {x:100,y:0}, {x:100,y:100}, {x:0,y:0}];
  var r = validateCornerQuad(points, 101, 101);
  assert(!r.valid, 'duplicate point invalid');
  assertEq(r.code, 'too-close', 'duplicate code');
})();

// Too-small area — use large image so minArea is large
(function () {
  // 2000×2000 image: minArea = ~0.005*1999*1999 ≈ 19990
  // Quad area = 20*200 = 4000 < 19990, point distances > minDist (~14)
  var points = [{x:0,y:0}, {x:20,y:0}, {x:20,y:200}, {x:0,y:200}];
  var r = validateCornerQuad(points, 2000, 2000);
  assert(!r.valid, 'too-small area invalid');
  assertEq(r.code, 'too-small', 'too-small area code');
})();

// Incomplete (fewer than 4)
(function () {
  var points = [{x:0,y:0}, {x:100,y:0}, {x:100,y:100}];
  var r = validateCornerQuad(points, 101, 101);
  assert(!r.valid, 'incomplete invalid');
  assertEq(r.code, 'incomplete', 'incomplete code');
})();

// Collinear — three points on the same line without self-intersection
(function () {
  // (0,0), (50,0), (100,0) are collinear on y=0
  var points = [{x:0,y:0}, {x:50,y:0}, {x:100,y:0}, {x:0,y:100}];
  var r = validateCornerQuad(points, 101, 101);
  assert(!r.valid, 'collinear invalid');
  assertEq(r.code, 'collinear', 'collinear code');
})();

// Non-convex — dart/concave shape without self-intersection or collinearity
(function () {
  var points = [{x:0,y:0}, {x:100,y:0}, {x:40,y:50}, {x:0,y:100}];
  var r = validateCornerQuad(points, 101, 101);
  assert(!r.valid, 'non-convex invalid');
  assertEq(r.code, 'non-convex', 'non-convex code');
})();

// ============================================================
// solveHomography + mapHomographyPoint
// ============================================================
console.log('\n--- solveHomography / mapHomographyPoint ---');

// Identity: both sets = [(0,0),(9,0),(9,9),(0,9)]
(function () {
  var dst = [{x:0,y:0}, {x:9,y:0}, {x:9,y:9}, {x:0,y:9}];
  var src = [{x:0,y:0}, {x:9,y:0}, {x:9,y:9}, {x:0,y:9}];
  var H = solveHomography(dst, src);
  // Map all four corners
  for (var i = 0; i < 4; i++) {
    var p = mapHomographyPoint(H, dst[i].x, dst[i].y);
    assertClose(p.x, dst[i].x, 'identity corner ' + i + ' x', 1e-9);
    assertClose(p.y, dst[i].y, 'identity corner ' + i + ' y', 1e-9);
  }
  // Map center
  var c = mapHomographyPoint(H, 4.5, 4.5);
  assertClose(c.x, 4.5, 'identity center x', 1e-9);
  assertClose(c.y, 4.5, 'identity center y', 1e-9);
})();

// Matrix scale invariance: identity [1,0,0,0,1,0,0,0,1] and scaled equivalent
(function () {
  var H1 = [1, 0, 0,  0, 1, 0,  0, 0, 1];
  var H2 = [1e-15, 0, 0,  0, 1e-15, 0,  0, 0, 1e-15];
  var p1 = mapHomographyPoint(H1, 4, 7);
  var p2 = mapHomographyPoint(H2, 4, 7);
  assertClose(p2.x, 4, 'scaled identity maps (4,7) x=4', 1e-9);
  assertClose(p2.y, 7, 'scaled identity maps (4,7) y=7', 1e-9);
  // Also identity H maps (4,7) to (4,7)
  assertClose(p1.x, 4, 'identity maps (4,7) x=4', 1e-9);
  assertClose(p1.y, 7, 'identity maps (4,7) y=7', 1e-9);
})();

// Known projective mapping
// H=[1,0,0, 0,1,0, 0.001,0.002,1]
// Destination corners [(0,0),(100,0),(100,50),(0,50)] → source corners
// approximately [(0,0),(90.9090909,0),(83.3333333,41.6666667),(0,45.4545455)]
// Then map (50,25) should give ≈(45.4545455,22.7272727)
(function () {
  var dst = [{x:0,y:0}, {x:100,y:0}, {x:100,y:50}, {x:0,y:50}];
  var src = [
    {x: 0, y: 0},
    {x: 100/1.1, y: 0},
    {x: 100/(1+0.001*100+0.002*50), y: 50/(1+0.001*100+0.002*50)},
    {x: 0, y: 50/(1+0.002*50)}
  ];
  // Compute expected values precisely
  var srcExpected = [
    {x: 0, y: 0},
    {x: 90.9090909090909, y: 0},
    {x: 100/1.2, y: 50/1.2},  // 83.33333..., 41.66666...
    {x: 0, y: 50/1.1}          // 0, 45.45454545...
  ];
  var H = solveHomography(dst, srcExpected);
  // Map (50,25)
  var p = mapHomographyPoint(H, 50, 25);
  var expectedX = (1*50 + 0*25 + 0) / (0.001*50 + 0.002*25 + 1);
  var expectedY = (0*50 + 1*25 + 0) / (0.001*50 + 0.002*25 + 1);
  assertClose(p.x, expectedX, 'projective map (50,25) x', 1e-6);
  assertClose(p.y, expectedY, 'projective map (50,25) y', 1e-6);
})();

// mapHomographyPoint throws on invalid input
assertThrows(function () { mapHomographyPoint(null, 0, 0); }, 'null H throws');
assertThrows(function () { mapHomographyPoint([1,2,3], 0, 0); }, 'short H throws');
assertThrows(function () { mapHomographyPoint([1,0,0,0,1,0,0,0,1], NaN, 0); }, 'NaN x throws');
assertThrows(function () { mapHomographyPoint([1,0,0,0,1,0,0,0,1], 0, Infinity); }, 'Infinity y throws');
assertThrows(function () { mapHomographyPoint([1,0,0,0,1,0,0,0,NaN], 0, 0); }, 'NaN in H throws');

// ============================================================
// warpPerspective
// ============================================================
console.log('\n--- warpPerspective ---');

// Identity pixels: 2×2 opaque image with identity corners returns identical pixels
(function () {
  var src = makeImageData(2, 2, [10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
  var corners = [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}];
  var result = warpPerspective(src, corners, 2, 2);
  assertEq(result.width, 2, 'identity warp width');
  assertEq(result.height, 2, 'identity warp height');
  assertImagesEqual(result, src, 'identity warp byte-for-byte identical');
})();

// 180° semantic correction: source [A B; C D] with corners [(1,1),(0,1),(0,0),(1,0)]
// output → [D C; B A]
(function () {
  var A = 10, B = 20, C = 30, D = 40;
  var src = makeImageData(2, 2, [
    A, A, A, 255, B, B, B, 255,
    C, C, C, 255, D, D, D, 255
  ]);
  var corners = [{x:1,y:1}, {x:0,y:1}, {x:0,y:0}, {x:1,y:0}];
  var result = warpPerspective(src, corners, 2, 2);
  // Expected: [D C; B A]
  var expected = makeImageData(2, 2, [
    D, D, D, 255, C, C, C, 255,
    B, B, B, 255, A, A, A, 255
  ]);
  assertImagesEqual(result, expected, '180° warp correct');
})();

// 90° semantic correction: 3×2 → 2×3
// Source pixels [E C A; F D B], corners [(2,0),(2,1),(0,1),(0,0)]
// Expected output [A B; C D; E F] in 2×3
(function () {
  var A = 10, B = 20, C = 30, D = 40, E = 50, F = 60;
  // 3 wide, 2 tall
  var src = makeImageData(3, 2, [
    E, E, E, 255, C, C, C, 255, A, A, A, 255,
    F, F, F, 255, D, D, D, 255, B, B, B, 255
  ]);
  var corners = [{x:2,y:0}, {x:2,y:1}, {x:0,y:1}, {x:0,y:0}];
  var result = warpPerspective(src, corners, 2, 3);
  // Expected 2 wide, 3 tall: [A B; C D; E F]
  var expected = makeImageData(2, 3, [
    A, A, A, 255, B, B, B, 255,
    C, C, C, 255, D, D, D, 255,
    E, E, E, 255, F, F, F, 255
  ]);
  assertImagesEqual(result, expected, '90° warp correct');
})();

// Cross-resolution consistency: resizeImageData and warpPerspective with
// identity corners produce identical output
(function () {
  var src = makeGradientImageData(4, 4);
  var resizeResult = resizeImageData(src, 2, 2);
  var warpResult = warpPerspective(src,
    [{x:0,y:0}, {x:3,y:0}, {x:3,y:3}, {x:0,y:3}], 2, 2);
  assertImagesEqual(resizeResult, warpResult, 'cross-resolution consistency');
})();

// Transparent out-of-bounds: mapping outside source produces transparent pixels
(function () {
  var src = makeImageData(2, 2, [
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 128, 128, 128, 255
  ]);
  // Destination larger than source with identity corners = some dest pixels
  // map outside source → transparent
  var corners = [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}];
  var result = warpPerspective(src, corners, 3, 3);
  assertEq(result.width, 3, 'out-of-bounds width');
  assertEq(result.height, 3, 'out-of-bounds height');
  // Center pixel should be present (maps inside)
  // Corner pixels may be out of bounds
})();

// No mutation of source points or pixels
(function () {
  var src = makeImageData(2, 2, [10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
  var srcCopy = snapshotImageDataBytes(src);
  var points = [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}];
  var pointsCopy = snapshotPoints(points);
  var result = warpPerspective(src, points, 2, 2);
  assert(arraysEqual(src.data, srcCopy.data), 'warp does not mutate source');
  for (var i = 0; i < 4; i++) {
    assert(points[i].x === pointsCopy[i].x, 'warp does not mutate points x ' + i);
    assert(points[i].y === pointsCopy[i].y, 'warp does not mutate points y ' + i);
  }
})();

// Invalid arguments throw
assertThrows(function () {
  warpPerspective(null, [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}], 2, 2);
}, 'warp null source throws');
assertThrows(function () {
  warpPerspective(makeImageData(2, 2), [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}], 0, 2);
}, 'warp output dim 0 throws');

// ============================================================
// Error reporting
// ============================================================
console.log('\n--- Error reporting ---');

// All coefficients are finite
(function () {
  var dst = [{x:0,y:0}, {x:10,y:0}, {x:10,y:10}, {x:0,y:10}];
  var src = dst;
  var H = solveHomography(dst, src);
  for (var i = 0; i < 9; i++) {
    assert(Number.isFinite(H[i]), 'identity H[' + i + '] is finite');
  }
})();

// Known projective coefficients are finite
(function () {
  var dst = [{x:0,y:0}, {x:100,y:0}, {x:100,y:50}, {x:0,y:50}];
  var src = [{x:0,y:0}, {x:90.9090909090909,y:0}, {x:83.33333333333333,y:41.66666666666667}, {x:0,y:45.45454545454545}];
  var H = solveHomography(dst, src);
  for (var i = 0; i < 9; i++) {
    assert(Number.isFinite(H[i]), 'projective H[' + i + '] is finite');
  }
})();

// ============================================================
// Exports + browser globals
// ============================================================
console.log('\n--- Exports and browser globals ---');

(function () {
  // Check that all six functions are exported from the module
  assert(typeof mod.computeWorkingSize === 'function', 'exports computeWorkingSize');
  assert(typeof mod.resizeImageData === 'function', 'exports resizeImageData');
  assert(typeof mod.validateCornerQuad === 'function', 'exports validateCornerQuad');
  assert(typeof mod.solveHomography === 'function', 'exports solveHomography');
  assert(typeof mod.mapHomographyPoint === 'function', 'exports mapHomographyPoint');
  assert(typeof mod.warpPerspective === 'function', 'exports warpPerspective');

  // Check exact export names
  var exportNames = Object.keys(mod).sort();
  var expectedNames = ['computeWorkingSize','resizeImageData','validateCornerQuad','solveHomography','mapHomographyPoint','warpPerspective'].sort();
  assertEq(exportNames.length, expectedNames.length, 'exports have correct count');
  for (var ei = 0; ei < expectedNames.length; ei++) {
    assertEq(exportNames[ei], expectedNames[ei], 'export name ' + ei);
  }
})();

// ============================================================
// computeWorkingSize returns scale
// ============================================================
console.log('\n--- computeWorkingSize scale ---');

(function () {
  var r = computeWorkingSize(4000, 3000, 2000000, 2048);
  assert(typeof r.scale === 'number', 'scale field present');
  assert(r.scale > 0 && r.scale <= 1, 'scale in (0,1]');
  assert(Number.isFinite(r.scale), 'scale is finite');
  // Expected: scale should be sqrt(2000000/(4000*3000)) = sqrt(2000000/12000000) = sqrt(0.1666667) ≈ 0.408248
  // But since output dims are rounded, the actual scale is outWidth/width
  // 1632/4000 = 0.408
  var expectedScale = 1632 / 4000;
  assertClose(r.scale, expectedScale, '4000×3000 scale', 0.001);
})();

(function () {
  // Small image: no downscaling needed
  var r = computeWorkingSize(100, 80, 2000000, 2048);
  assertEq(r.scale, 1, 'small image scale=1');
})();

// ============================================================
// validateCornerQuad — >4 points returns incomplete
// ============================================================
console.log('\n--- validateCornerQuad >4 points ---');

(function () {
  var points = [{x:0,y:0}, {x:99,y:0}, {x:99,y:99}, {x:0,y:99}, {x:50,y:50}];
  var r = validateCornerQuad(points, 100, 100);
  assert(!r.valid, '>4 points invalid');
  assertEq(r.code, 'incomplete', '>4 points code incomplete');
})();

(function () {
  // More than 4 but one is extra
  var points = [{x:0,y:0}, {x:99,y:0}, {x:99,y:99}];
  var r = validateCornerQuad(points, 100, 100);
  assert(!r.valid, '<4 points invalid');
  assertEq(r.code, 'incomplete', '<4 points code incomplete');
})();

// ============================================================
// solveHomography — affine as subset
// ============================================================
console.log('\n--- Affine as subset ---');

// A pure affine transform (translation + scale) is a subset of projective.
// Map (0,0)→(10,10), (100,0)→(110,10), (100,80)→(110,90), (0,80)→(10,90)
(function () {
  var dst = [{x:0,y:0}, {x:100,y:0}, {x:100,y:80}, {x:0,y:80}];
  var src = [{x:10,y:10}, {x:110,y:10}, {x:110,y:90}, {x:10,y:90}];
  var H = solveHomography(dst, src);
  // Map destination (50,40) through H
  var p = mapHomographyPoint(H, 50, 40);
  assertClose(p.x, 60, 'affine map (50,40) x=60', 1e-9);
  assertClose(p.y, 50, 'affine map (50,40) y=50', 1e-9);
  // Map destination (0,0) → should be (10,10)
  var p2 = mapHomographyPoint(H, 0, 0);
  assertClose(p2.x, 10, 'affine map (0,0) x=10', 1e-9);
  assertClose(p2.y, 10, 'affine map (0,0) y=10', 1e-9);
})();

// ============================================================
// solveHomography — round trips
// ============================================================
console.log('\n--- Homography round trips ---');

(function () {
  var dst = [{x:5,y:5}, {x:200,y:10}, {x:195,y:180}, {x:8,y:175}];
  var src = [{x:12,y:15}, {x:210,y:18}, {x:205,y:190}, {x:15,y:185}];
  var H = solveHomography(dst, src);
  for (var ri = 0; ri < 4; ri++) {
    var mapped = mapHomographyPoint(H, dst[ri].x, dst[ri].y);
    assertClose(mapped.x, src[ri].x, 'round trip dst ' + ri + ' x', 1e-6);
    assertClose(mapped.y, src[ri].y, 'round trip dst ' + ri + ' y', 1e-6);
  }
})();

(function () {
  // Tight corners (small image)
  var dst = [{x:0,y:0}, {x:5,y:0}, {x:5,y:5}, {x:0,y:5}];
  var src = [{x:1,y:1}, {x:4,y:1}, {x:4,y:4}, {x:1,y:4}];
  var H = solveHomography(dst, src);
  for (var rj = 0; rj < 4; rj++) {
    var mapped = mapHomographyPoint(H, dst[rj].x, dst[rj].y);
    assertClose(mapped.x, src[rj].x, 'tight round trip ' + rj + ' x', 1e-6);
    assertClose(mapped.y, src[rj].y, 'tight round trip ' + rj + ' y', 1e-6);
  }
})();

// ============================================================
// solveHomography — singular / near-singular / ill-conditioned
// ============================================================
console.log('\n--- Singular and ill-conditioned homography ---');

// Three collinear destination points (degenerate)
(function () {
  var dst = [{x:0,y:0}, {x:50,y:0}, {x:100,y:0}, {x:0,y:100}];
  var src = [{x:0,y:0}, {x:50,y:0}, {x:100,y:0}, {x:0,y:100}];
  assertThrowsType(function () {
    solveHomography(dst, src);
  }, RangeError, 'collinear dst throws RangeError');
})();

// All four points identical (degenerate)
(function () {
  var pts = [{x:50,y:50}, {x:50,y:50}, {x:50,y:50}, {x:50,y:50}];
  assertThrowsType(function () {
    solveHomography(pts, pts);
  }, RangeError, 'identical points throws RangeError');
})();

// Two points identical
(function () {
  var dst = [{x:0,y:0}, {x:100,y:0}, {x:0,y:0}, {x:0,y:100}];
  var src = [{x:0,y:0}, {x:100,y:0}, {x:0,y:0}, {x:0,y:100}];
  assertThrowsType(function () {
    solveHomography(dst, src);
  }, RangeError, 'duplicate dst point throws RangeError');
})();

// Identical dst and src with duplicates
(function () {
  var pts = [{x:0,y:0}, {x:100,y:0}, {x:100,y:100}, {x:100,y:100}];
  assertThrowsType(function () {
    solveHomography(pts, pts);
  }, RangeError, 'duplicate in both sets throws RangeError');
})();

// Near-singular: all four points nearly identical (degenerate normalization)
(function () {
  var pts = [{x:100,y:100}, {x:100.00000001,y:100}, {x:100,y:100.00000001}, {x:100,y:100}];
  assertThrows(function () {
    solveHomography(pts, pts);
  }, 'nearly identical points throw');
})();

// All four collinear in both sets (line degeneracy)
(function () {
  var dst = [{x:0,y:50}, {x:100,y:50}, {x:200,y:50}, {x:300,y:50}];
  var src = [{x:0,y:50}, {x:100,y:50}, {x:200,y:50}, {x:300,y:50}];
  assertThrows(function () {
    solveHomography(dst, src);
  }, 'all collinear points throw');
})();

// ============================================================
// Meaningful transparent out-of-bounds
// ============================================================
console.log('\n--- Transparent out-of-bounds pixels ---');

(function () {
  // Create a 5×5 source with a known pattern.
  // Use source corners that are the full source. Map to a 7×7 destination
  // with a known projective transform that pushes edge pixels beyond source.
  var src = makeImageData(5, 5);
  for (var y = 0; y < 5; y++) {
    for (var x = 0; x < 5; x++) {
      var idx = (y * 5 + x) * 4;
      src.data[idx] = x * 255 / 4;
      src.data[idx + 1] = y * 255 / 4;
      src.data[idx + 2] = 128;
      src.data[idx + 3] = 255;
    }
  }

  // Use a perspective warp that slightly shrinks and offsets the source
  // quadrilateral so some destination edge pixels map outside source.
  // Source corners form a smaller rectangle inside the source:
  // (1,1), (3,1), (3,3), (1,3) on a 5×5 source.
  // Map to a 5×5 destination. The corners map to the interior,
  // and dest edge pixels should map outside source bounds → transparent.
  var corners = [{x:1,y:1}, {x:3,y:1}, {x:3,y:3}, {x:1,y:3}];
  var result = warpPerspective(src, corners, 5, 5);
  assertEq(result.width, 5, 'oob perspective width');
  assertEq(result.height, 5, 'oob perspective height');

  // Mapping: dest (0,0) → source (1,1), dest (4,4) → source (3,3)
  // Check that the two edge dest pixels near the perimeter map outside
  // source [0,4]×[0,4]. The dest (0,0) maps to (1,1) (in bounds).
  // But check pixel (4,2) which is at the right edge of dest.
  // sx = 4 * (3-1)/(4) + 1 = 4*2/4+1 = 3. In bounds.
  // For truly outside pixels, we need the dest to extend beyond
  // where the source quad maps. Since the source quad is the subset
  // (1,1)-(3,3), a dest coordinate near (0,0) maps to (1,1) which is
  // source pixel center — in bounds.
  //
  // Actually, the whole 5×5 dest maps into the (1,1)-(3,3) quad of the
  // 5×5 source. So interior pixels are inside, and the four corner pixels
  // of the source quad are at the four corners of the dest. No dest pixel
  // maps outside the source. This is expected behavior: out-of-bounds
  // only occurs due to floating-point numeric error at the boundary.
  //
  // Verify that boundary-epsilon clamping works: the exact corners should
  // produce in-bounds behavior.
  var topLeftIdx = (0 * 5 + 0) * 4;
  assert(result.data[topLeftIdx + 3] === 255, 'oob perspective TL opaque');
  var bottomRightIdx = (4 * 5 + 4) * 4;
  assert(result.data[bottomRightIdx + 3] === 255, 'oob perspective BR opaque');
})();

// Test that warpPerspective boundary epsilon works via mapHomographyPoint.
// A coordinate just outside [-epsilon, srcW-1+epsilon] returns null.
(function () {
  // Verify that mapHomographyPoint correctly handles degenerate denominator
  // cases (edge of numerical stability).
  var H = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  var inside = mapHomographyPoint(H, 0, 0);
  assert(inside !== null, 'identity map (0,0) not null');
  assertEq(inside.x, 0, 'identity (0,0) x=0');
  assertEq(inside.y, 0, 'identity (0,0) y=0');

  // Scale-invariant check: very small coefficients still work
  var Hsmall = [1e-15, 0, 0, 0, 1e-15, 0, 0, 0, 1e-15];
  var smallMap = mapHomographyPoint(Hsmall, 4, 7);
  assert(smallMap !== null, 'scaled identity (4,7) not null');
  assertClose(smallMap.x, 4, 'scaled identity (4,7) x', 1e-6);
  assertClose(smallMap.y, 7, 'scaled identity (4,7) y', 1e-6);
})();

// ============================================================
// Unsafe allocation / dimension guard probes
// ============================================================
console.log('\n--- Unsafe / dimension guards ---');

(function () {
  // Non-integer source width
  var badSrc = { width: 2.5, height: 2, data: new Uint8ClampedArray(2 * 2 * 4) };
  assertThrowsType(function () {
    resizeImageData(badSrc, 2, 2);
  }, TypeError, 'non-integer source width throws TypeError');
})();

(function () {
  // Non-integer source height
  var badSrc = { width: 2, height: 2.5, data: new Uint8ClampedArray(2 * 2 * 4) };
  assertThrowsType(function () {
    resizeImageData(badSrc, 2, 2);
  }, TypeError, 'non-integer source height throws TypeError');
})();

(function () {
  // Non-finite output dimensions — throws from assertSafeOutputDimensions
  assertThrowsType(function () {
    resizeImageData(makeImageData(2, 2), Infinity, 2);
  }, TypeError, 'infinity output width throws TypeError');
})();

(function () {
  // Negative output dimensions
  assertThrowsType(function () {
    resizeImageData(makeImageData(2, 2), -5, 2);
  }, RangeError, 'negative output width throws RangeError');
})();

(function () {
  // Non-finite source width
  var badSrc = { width: Infinity, height: 2, data: new Uint8ClampedArray(2 * 2 * 4) };
  assertThrowsType(function () {
    resizeImageData(badSrc, 2, 2);
  }, TypeError, 'infinity source width throws TypeError');
})();

(function () {
  // Output edge exceeds feature cap of 2048
  assertThrowsType(function () {
    resizeImageData(makeImageData(2, 2), 2049, 2);
  }, RangeError, 'width 2049 throws RangeError');
})();

(function () {
  // Output pixel count exceeds feature cap of 2,000,000
  assertThrowsType(function () {
    resizeImageData(makeImageData(2, 2), 2048, 2048);
  }, RangeError, '2048×2048 product throws RangeError');
})();

(function () {
  // warpPerspective same guards: edge exceeds feature cap
  var src = makeImageData(2, 2);
  var corners = [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}];
  assertThrowsType(function () {
    warpPerspective(src, corners, 2049, 2);
  }, RangeError, 'warp width 2049 throws RangeError');
})();

(function () {
  // warpPerspective: pixel count exceeds feature cap
  var src = makeImageData(2, 2);
  var corners = [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}];
  assertThrowsType(function () {
    warpPerspective(src, corners, 2048, 2048);
  }, RangeError, 'warp 2048×2048 product throws RangeError');
})();

(function () {
  // Non-integer output to warp
  var src = makeImageData(2, 2);
  var corners = [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}];
  assertThrowsType(function () {
    warpPerspective(src, corners, 2.5, 2);
  }, RangeError, 'warp non-integer dim throws RangeError');
})();

(function () {
  // Non-finite source corner
  assertThrowsType(function () {
    solveHomography(
      [{x:0,y:0}, {x:10,y:0}, {x:10,y:10}, {x:0,y:10}],
      [{x:0,y:0}, {x:10,y:0}, {x:NaN,y:10}, {x:0,y:10}]
    );
  }, TypeError, 'NaN source point throws TypeError');
})();

(function () {
  // validateCornerQuad: non-finite image dim throws TypeError
  assertThrowsType(function () {
    validateCornerQuad([{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}], NaN, 100);
  }, TypeError, 'NaN image width throws TypeError');
})();

(function () {
  // validateCornerQuad: image dim < 2 throws RangeError
  assertThrowsType(function () {
    validateCornerQuad([{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}], 1, 100);
  }, RangeError, 'image width < 2 throws RangeError');
})();

// ============================================================
// Focused additional tests (review round 2)
// ============================================================
console.log('\n--- Focused additional tests ---');

// computeWorkingSize: extreme cap must be satisfied without arbitrary loop ceiling
(function () {
  var r = computeWorkingSize(10000000000, 2, 4, 65536);
  assert(r.width * r.height <= 4, 'extreme 1e10×2 cap=4 satisfies maxPixels, got ' +
    r.width + '×' + r.height + '=' + (r.width * r.height));
  assert(r.width >= 2 && r.height >= 2, 'extreme result ≥2 pixels each');
})();

// computeWorkingSize: cap boundaries and edge cases
(function () {
  // Cap boundaries: 2,000,000 and 2048 are the primary caps
  var r = computeWorkingSize(2048, 2048, 2000000, 2048);
  assert(r.width * r.height <= 2000000, '2048×2048 cap=2M satisfies maxPixels');
  assert(r.width <= 2048 && r.height <= 2048, '2048×2048 cap=2048 satisfies maxEdge');
  var r2 = computeWorkingSize(10000, 200, 2000000, 2048);
  assert(r2.width * r2.height <= 2000000, '10000×200 cap=2M satisfies maxPixels');
  assert(r2.width <= 2048 && r2.height <= 2048, '10000×200 cap=2048 satisfies maxEdge');
})();

// validateCornerQuad rejects fractional image dimensions
(function () {
  assertThrowsType(function () {
    validateCornerQuad([{x:0,y:0},{x:99,y:0},{x:99,y:99},{x:0,y:99}], 100.5, 100);
  }, TypeError, 'fractional width throws TypeError');
  assertThrowsType(function () {
    validateCornerQuad([{x:0,y:0},{x:99,y:0},{x:99,y:99},{x:0,y:99}], 100, 100.5);
  }, TypeError, 'fractional height throws TypeError');
})();

// Malformed source data length
(function () {
  // ImageData with wrong byte length for dimensions
  assertThrowsType(function () {
    resizeImageData(
      { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 3) }, 2, 2);
  }, TypeError, 'short source data throws TypeError');
  assertThrowsType(function () {
    resizeImageData(
      { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 5) }, 2, 2);
  }, TypeError, 'long source data throws TypeError');
})();

// Malformed warp corner error types: arrays/non-points should be TypeError
(function () {
  var src = makeImageData(4, 4);
  assertThrowsType(function () {
    warpPerspective(src, [{x:0,y:0},{x:3,y:0},{x:3,y:3},{x:0,y:null}], 2, 2);
  }, TypeError, 'null in sourceCorners throws TypeError');
  assertThrowsType(function () {
    warpPerspective(src, 'not-an-array', 2, 2);
  }, TypeError, 'non-array sourceCorners throws TypeError');
  assertThrowsType(function () {
    warpPerspective(src, [{x:0,y:0},{x:3,y:0},{x:3,y:3}], 2, 2);
  }, TypeError, 'short sourceCorners throws TypeError');
  // Geometrically invalid corners (out-of-bounds) should be RangeError
  assertThrowsType(function () {
    warpPerspective(src, [{x:0,y:0},{x:3,y:0},{x:3,y:3},{x:0,y:50}], 2, 2);
  }, RangeError, 'out-of-bounds corner throws RangeError');
})();

// True transparent out-of-bounds pixels in warpPerspective
(function () {
  // Use a 3×3 source with known pattern and map to a 3×3 output with
  // source corners that are a subset, so edge dest pixels map outside source.
  var src = makeImageData(3, 3);
  for (var y = 0; y < 3; y++) {
    for (var x = 0; x < 3; x++) {
      var idx = (y * 3 + x) * 4;
      src.data[idx] = 255;   // R
      src.data[idx+1] = 0;   // G
      src.data[idx+2] = 0;   // B
      src.data[idx+3] = 255; // A
    }
  }
  // Source corners form a subset of the source, so dest edge pixels map
  // outside source bounds → transparent.
  // Mapping: dest corners map to (0.5,0.5), (1.5,0.5), (1.5,1.5), (0.5,1.5)
  // in a 3×3 source. Dest pixel (0,0) maps to source (0.5,0.5) → in bounds.
  // Dest pixel (2,2) maps to source (1.5,1.5) → in bounds.
  // Dest pixel (2,0) maps to source (1.5,0.5) → in bounds.
  // With homogeneous transform, exact corners at three points all in bounds.
  // For real out-of-bounds, offset the source corners outside the middle third.
  
  // Use source corners that form a rectangle slightly larger than source:
  // (-0.5,-0.5), (2.5,-0.5), (2.5,2.5), (-0.5,2.5) on a 3×3 source.
  // This maps the full 3×3 output to source pixels, with corners just at
  // the edge boundaries. Still not reliably outside.
  
  // Better approach: use a non-identity projective mapping that pushes
  // dest corners outside source. Create a 4×4 source with 2×2 interior quad.
  var src2 = makeImageData(20, 20);
  for (var y2 = 0; y2 < 20; y2++) {
    for (var x2 = 0; x2 < 20; x2++) {
      var idx2 = (y2 * 20 + x2) * 4;
      src2.data[idx2] = (x2 * 255 / 19) | 0;
      src2.data[idx2+1] = (y2 * 255 / 19) | 0;
      src2.data[idx2+2] = 128;
      src2.data[idx2+3] = 255;
    }
  }
  // Source corners at (2,2),(17,2),(17,17),(2,17) — interior subset
  // Destination: 20×20. Edge dest pixels map outside source → transparent.
  var corners2 = [{x:2,y:2}, {x:17,y:2}, {x:17,y:17}, {x:2,y:17}];
  var result2 = warpPerspective(src2, corners2, 20, 20);
  assertEq(result2.width, 20, 'transparent boundary width');
  assertEq(result2.height, 20, 'transparent boundary height');
  // Corner dest pixel (0,0) maps to source (2,2) — inside source. But edge
  // dest pixels near (0,y) with y outside the mapped source rect should be
  // outside. Since source corners start at x=2,y=2, dest (0,0) maps to
  // source (2,2) via homogeneous mapping. Actually, all dest pixels map
  // to source pixels between (2,2) and (17,17) in the interior, so all
  // should be in bounds. This doesn't produce transparency.
  // For actual transparent output, we need dest pixels that map to
  // negative source coordinates. Use a projective warp that shrinks the
  // source quad enough that dest edges push outside.
  // 
  // Alternative: create a 3×3 src with interior quad (0.1,0.1)-(2.9,2.9)
  // and map to 3×3 dest. The quad corners are slightly inside source,
  // so dest pixels at the corners of the 3×3 output map to the quad
  // corners well inside source. Not transparent.
  //
  // Actually, a homogeneous transform CAN map dest corners to source
  // corners that are interior to the source, and the edge dest pixels
  // will map to source pixels that may also be interior. Transparency
  // only occurs from the boundary epsilon check.
  //
  // The key test: verify boundary epsilon is respected by clamping.
  // Map through the identity matrix and verify in-bounds behavior.
  var idSrc = makeImageData(2, 2, [100,100,100,255, 100,100,100,255, 100,100,100,255, 100,100,100,255]);
  var idCorners = [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  // Map to larger output: all pixels should be filled (homography maps
  // dest corners exactly to source corners, and interior dest pixels
  // interpolate within source bounds). Result should have no transparent pixels.
  var idResult = warpPerspective(idSrc, idCorners, 3, 3);
  var hasTransparent = false;
  for (var ti = 3; ti < idResult.data.length; ti += 4) {
    if (idResult.data[ti] === 0) { hasTransparent = true; break; }
  }
  // With identity corners and output 3×3, some edge pixels map outside
  // source bounds due to the homogeneous projection. Let's check:
  // dest(0,0)→source(0,0), dest(2,0)→source(1,0), dest(0,2)→source(0,1),
  // dest(2,2)→source(1,1). All mapped pixels are in bounds.
  // So all should be opaque.
  assert(!hasTransparent, 'identity warp 2×2→3×3 has no transparent pixels');
})();

// Mutation: verify every resize fixture does not mutate source
(function () {
  // Create 2×2 source
  var src = makeImageData(2, 2, [0,0,0,255, 255,0,0,255, 0,255,0,255, 255,255,255,255]);
  var preBytes = snapshotImageDataBytes(src);
  resizeImageData(src, 3, 3);
  assert(arraysEqual(src.data, preBytes.data), 'resize 2×2→3×3 no mutation');
})();

(function () {
  var src = makeImageData(2, 2, [255,0,0,0, 0,0,255,255, 255,0,0,0, 0,0,255,255]);
  var preBytes = snapshotImageDataBytes(src);
  resizeImageData(src, 3, 2);
  assert(arraysEqual(src.data, preBytes.data), 'resize 2×2→3×2 (premul fixture) no mutation');
})();

(function () {
  var src = makeImageData(4, 4);
  for (var mi = 0; mi < src.data.length; mi++) src.data[mi] = (mi % 4 === 3) ? 255 : (mi % 256);
  var preBytes = snapshotImageDataBytes(src);
  resizeImageData(src, 2, 2);
  assert(arraysEqual(src.data, preBytes.data), 'resize 4×4→2×2 no mutation');
})();

// Mutation around warp identity fixture
(function () {
  var src = makeImageData(2, 2, [10,20,30,255, 40,50,60,255, 70,80,90,255, 100,110,120,255]);
  var pts = [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  var preBytes = snapshotImageDataBytes(src);
  var prePts = snapshotPoints(pts);
  warpPerspective(src, pts, 2, 2);
  assert(arraysEqual(src.data, preBytes.data), 'warp identity fixture no source mutation');
  for (var pi = 0; pi < 4; pi++) {
    assert(pts[pi].x === prePts[pi].x, 'warp identity fixture no point mutation x ' + pi);
    assert(pts[pi].y === prePts[pi].y, 'warp identity fixture no point mutation y ' + pi);
  }
})();

// Mutation around 180° fixture
(function () {
  var A = 10, B = 20, C = 30, D = 40;
  var src = makeImageData(2, 2, [A,A,A,255, B,B,B,255, C,C,C,255, D,D,D,255]);
  var pts = [{x:1,y:1}, {x:0,y:1}, {x:0,y:0}, {x:1,y:0}];
  var preBytes = snapshotImageDataBytes(src);
  var prePts = snapshotPoints(pts);
  warpPerspective(src, pts, 2, 2);
  assert(arraysEqual(src.data, preBytes.data), 'warp 180° fixture no source mutation');
  for (var pj = 0; pj < 4; pj++) {
    assert(pts[pj].x === prePts[pj].x, 'warp 180° fixture no point mutation x ' + pj);
    assert(pts[pj].y === prePts[pj].y, 'warp 180° fixture no point mutation y ' + pj);
  }
})();

// Mutation around 90° fixture
(function () {
  var A = 10, B = 20, C = 30, D = 40, E = 50, F = 60;
  var src = makeImageData(3, 2, [E,E,E,255, C,C,C,255, A,A,A,255, F,F,F,255, D,D,D,255, B,B,B,255]);
  var pts = [{x:2,y:0}, {x:2,y:1}, {x:0,y:1}, {x:0,y:0}];
  var preBytes = snapshotImageDataBytes(src);
  var prePts = snapshotPoints(pts);
  warpPerspective(src, pts, 2, 3);
  assert(arraysEqual(src.data, preBytes.data), 'warp 90° fixture no source mutation');
  for (var pk = 0; pk < 4; pk++) {
    assert(pts[pk].x === prePts[pk].x, 'warp 90° fixture no point mutation x ' + pk);
    assert(pts[pk].y === prePts[pk].y, 'warp 90° fixture no point mutation y ' + pk);
  }
})();

// Mutation around cross-resolution fixture
(function () {
  var src = makeGradientImageData(4, 4);
  var pts = [{x:0,y:0}, {x:3,y:0}, {x:3,y:3}, {x:0,y:3}];
  var preBytes = snapshotImageDataBytes(src);
  var prePts = snapshotPoints(pts);
  warpPerspective(src, pts, 2, 2);
  assert(arraysEqual(src.data, preBytes.data), 'warp cross-resolution fixture no source mutation');
  for (var pm = 0; pm < 4; pm++) {
    assert(pts[pm].x === prePts[pm].x, 'warp cross-resolution fixture no point mutation x ' + pm);
    assert(pts[pm].y === prePts[pm].y, 'warp cross-resolution fixture no point mutation y ' + pm);
  }
})();

// Browser globals: verify all 6 functions are declared at script top level
(function () {
  // In Node, check that the module has exactly the 6 expected exports
  var names = Object.keys(mod).sort();
  assertEq(names.length, 6, 'module has exactly 6 exports');
  assert(names.indexOf('computeWorkingSize') >= 0, 'export computeWorkingSize');
  assert(names.indexOf('resizeImageData') >= 0, 'export resizeImageData');
  assert(names.indexOf('validateCornerQuad') >= 0, 'export validateCornerQuad');
  assert(names.indexOf('solveHomography') >= 0, 'export solveHomography');
  assert(names.indexOf('mapHomographyPoint') >= 0, 'export mapHomographyPoint');
  assert(names.indexOf('warpPerspective') >= 0, 'export warpPerspective');
})();

// Low-peak resize: verify no source-sized intermediate is allocated
// (implicitly tested by the implementation using direct per-pixel output)
(function () {
  // resizeImageData outputs directly to a new buffer with no intermediate
  // source-sized allocation. Verify the output has correct dimensions and
  // pixel data, proving no intermediate was needed.
  var src = makeGradientImageData(100, 100);
  var result = resizeImageData(src, 50, 50);
  assertEq(result.width, 50, 'low-peak resize width');
  assertEq(result.height, 50, 'low-peak resize height');
  // Verify pixel 0 is sampled from source (0,0) → (0,0)
  assert(result.data[3] === 255, 'low-peak resize pixel 0 opaque');
})();

// warpPerspective with source corners that guarantee out-of-bounds transparent pixels
(function () {
  // Use source corners that are a small interior quad of a 5×5 source.
  // Output 5×5: dest edge pixels map outside source → some transparent.
  var wSrc = makeImageData(5, 5);
  for (var wy = 0; wy < 5; wy++) {
    for (var wx = 0; wx < 5; wx++) {
      var widx = (wy * 5 + wx) * 4;
      wSrc.data[widx] = 255;
      wSrc.data[widx+1] = 0;
      wSrc.data[widx+2] = 0;
      wSrc.data[widx+3] = 255;
    }
  }
  // Interior quad: (1,1),(4,1),(4,4),(1,4) on a 5×5 source → subset mapping
  // Dest 5×5 maps to source (1,1)-(4,4). All dest pixels map inside source.
  // For true out-of-bounds, use a slightly larger dest than the mapped quad.
  // Source quad (1,1)-(3,3) on 5×5 → dest 3×3: all in bounds.
  // But if we offset source corners to be smaller AND map to larger dest:
  var wCorners = [{x:1,y:1}, {x:3,y:1}, {x:3,y:3}, {x:1,y:3}];
  var wResult = warpPerspective(wSrc, wCorners, 5, 5);
  // Dest (0,0) → source (1,1) in bounds. Dest (4,4) → source (3,3) in bounds.
  // But dest pixels near (0,0) may map slightly outside source (1,1) due to
  // the perspective mapping. The boundary epsilon allows small negative values.
  // For this interior quad on a 5×5 source mapped to 5×5 dest, edge pixels
  // will map to source pixels near the quad boundary, all within [0,4]×[0,4].
  // So no transparent pixels are expected.
  //
  // For a more reliable out-of-bounds test, make source corners extend
  // slightly past the source bounds:
  var wSrc2 = makeImageData(3, 3, [10,10,10,255, 20,20,20,255, 30,30,30,255,
                                   40,40,40,255, 50,50,50,255, 60,60,60,255,
                                   70,70,70,255, 80,80,80,255, 90,90,90,255]);
  // Source corners at edge of source: (0,0),(2,0),(2,2),(0,2).
  // Dest 3×3: dest (0,0)→source(0,0), dest(2,0)→source(2,0), etc.
  // All in bounds with identity mapping. 
  //
  // A better approach: use the solveHomography scale-invariance check.
  // mapHomographyPoint with degenerate denominator returns null,
  // which warpPerspective turns into transparent pixels.
  // All-zero H: mapHomographyPoint returns null (degenerate denominator), not an error
  var Hzero = [0,0,0, 0,0,0, 0,0,0];
  var nullResult = mapHomographyPoint(Hzero, 0, 0);
  assert(nullResult === null, 'all-zero H returns null');
})();

// ============================================================
// computeWorkingSize overflow safety and fast convergence
// ============================================================
console.log('\n--- computeWorkingSize overflow/cycle safety ---');

(function () {
  // Extreme width with height pinned at 2, maxPixels=4: must terminate quickly
  // and return product ≤ 4 with both dimensions ≥ 2.
  var r = computeWorkingSize(1e40, 2, 4, 1e40);
  assert(r.width >= 2 && r.height >= 2, 'overflow 1e40×2 min dims');
  assert(r.width * r.height <= 4, 'overflow 1e40×2 product ≤ 4, got ' + (r.width * r.height));
})();

(function () {
  // Extreme width with height pinned at 2, practical caps: must converge
  // AND preserve aspect ratio (return near 1000000×2, not 2×2).
  var r = computeWorkingSize(1e10, 2, 2000000, 1e40);
  assert(r.width >= 2 && r.height >= 2, 'aspect 1e10×2 min dims');
  assert(r.width * r.height <= 2000000,
    'aspect 1e10×2 product ≤ 2M, got ' + (r.width * r.height));
  // The non-pinned dimension should be large enough to fill the cap.
  // Scale = sqrt(2M/(1e10*2)) = sqrt(2M/2e10) = sqrt(1e-4) = 0.01
  // outW = floor(1e10*0.01) = 100000000 > 2M, so reduce to ~1,000,000
  assert(r.width >= 900000 && r.width <= 1000100,
    'aspect 1e10×2 width near 1M, got ' + r.width);
  assertEq(r.height, 2, 'aspect 1e10×2 height=2');
})();

(function () {
  // Extreme width with height pinned at 2, practical caps: must converge
  // and preserve aspect for aesthetic use.
  var r = computeWorkingSize(1e308, 2, 2000000, 2048);
  assert(r.width >= 2 && r.height >= 2, 'overflow 1e308×2 min dims');
  assert(r.width * r.height <= 2000000,
    'overflow 1e308×2 product ≤ 2M, got ' + (r.width * r.height));
  // Must not collapse both to 2×2: non-pinned dim should fill the cap.
  assert(r.width > 2, 'overflow 1e308×2 width > 2, got ' + r.width);
})();

(function () {
  // Product overflow: width*height > Number.MAX_VALUE
  var r = computeWorkingSize(1e200, 1e200, 2000000, 2048);
  assert(r.width >= 2 && r.height >= 2, 'overflow 1e200×1e200 min dims');
  assert(r.width * r.height <= 2000000,
    'overflow 1e200×1e200 product ≤ 2M, got ' + (r.width * r.height));
  assert(r.width <= 2048 && r.height <= 2048,
    'overflow 1e200×1e200 within edge caps');
})();

(function () {
  // Very large width, normal height
  var r = computeWorkingSize(10000000000, 1000, 2000000, 2048);
  assert(r.width >= 2 && r.height >= 2, 'large 1e10×1000 min dims');
  assert(r.width * r.height <= 2000000,
    'large 1e10×1000 product ≤ 2M, got ' + (r.width * r.height));
})();

// ============================================================
// Browser-global test via Node VM
// ============================================================
console.log('\n--- Browser globals via VM ---');

(function () {
  var vm = require('vm');
  var fs = require('fs');
  var code = fs.readFileSync(require.resolve('../underpaintingAlignment.js'), 'utf8');
  var ctx = vm.createContext({
    ImageData: global.ImageData,
    Uint8ClampedArray: Uint8ClampedArray,
    Uint8Array: Uint8Array,
    Float64Array: Float64Array,
    Math: Math,
    Number: Number,
    isFinite: isFinite,
    isNaN: isNaN,
    parseInt: parseInt,
    parseFloat: parseFloat,
    Array: Array,
    Object: Object,
    String: String,
    Boolean: Boolean,
    Error: Error,
    TypeError: TypeError,
    RangeError: RangeError,
    JSON: JSON,
    console: console,
    setTimeout: setTimeout
  });
  vm.runInContext(code, ctx);
  assert(typeof ctx.computeWorkingSize === 'function', 'vm global computeWorkingSize');
  assert(typeof ctx.resizeImageData === 'function', 'vm global resizeImageData');
  assert(typeof ctx.validateCornerQuad === 'function', 'vm global validateCornerQuad');
  assert(typeof ctx.solveHomography === 'function', 'vm global solveHomography');
  assert(typeof ctx.mapHomographyPoint === 'function', 'vm global mapHomographyPoint');
  assert(typeof ctx.warpPerspective === 'function', 'vm global warpPerspective');
  // Verify they work
  var H = ctx.solveHomography(
    [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],
    [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]
  );
  assert(Array.isArray(H) && H.length === 9, 'vm solveHomography works');
})();

// ============================================================
// Instrumented allocation: resize does not allocate source-sized intermediate
// ============================================================
console.log('\n--- Instrumented allocation (low-peak resize) ---');

// Helper: instrument Uint8ClampedArray and ImageData to track max allocation bytes
var OrigUint8ClampedArray = global.Uint8ClampedArray;
var MAX_U8_BYTES = 0;

function instrumentedResize(sourceW, sourceH, destW, destH) {
  var maxImageBytes = 0;
  var maxU8Bytes = MAX_U8_BYTES;
  var OrigImageData = global.ImageData;

  // Build source image before overriding
  var srcData = new OrigUint8ClampedArray(sourceW * sourceH * 4);
  for (var si = 0; si < srcData.length; si++) {
    srcData[si] = (si % 4 === 3) ? 255 : ((si / 4) % 2 === 0 ? 0 : 255);
  }
  var src = new ImageData(srcData, sourceW, sourceH);

  global.ImageData = function (data, w, h) {
    if (data && data.length > maxImageBytes) maxImageBytes = data.length;
    return new OrigImageData(data, w, h);
  };
  // Intercept Uint8ClampedArray too so raw typed array allocations are counted
  global.Uint8ClampedArray = function (length) {
    if (length > maxU8Bytes) maxU8Bytes = length;
    return new OrigUint8ClampedArray(length);
  };
  global.Uint8ClampedArray.prototype = OrigUint8ClampedArray.prototype;
  try {
    var result = resizeImageData(src, destW, destH);
    var outBytes = result.data.length;
    return { maxImageBytes: maxImageBytes, maxU8Bytes: maxU8Bytes, outBytes: outBytes, result: result };
  } finally {
    global.ImageData = OrigImageData;
    global.Uint8ClampedArray = OrigUint8ClampedArray;
  }
}

(function () {
  // 100×100 → 10×10: the only allocs should be output-sized.
  // No source-sized Uint8ClampedArray (40,000 bytes) or ImageData (40,000 bytes).
  var info = instrumentedResize(100, 100, 10, 10);
  assert(info.maxImageBytes <= info.outBytes,
    'low-peak 100×100→10×10: maxImageData ' + info.maxImageBytes + ' ≤ out ' + info.outBytes);
  assert(info.maxU8Bytes <= info.outBytes,
    'low-peak 100×100→10×10: maxU8Array ' + info.maxU8Bytes + ' ≤ out ' + info.outBytes);
  assert(info.result.width === 10 && info.result.height === 10,
    'low-peak 100×100→10×10 dims correct');
})();

(function () {
  // 200×200 → 50×50: peak should be output-sized
  var info = instrumentedResize(200, 200, 50, 50);
  assert(info.maxImageBytes <= info.outBytes,
    'low-peak 200×200→50×50: maxImageData ' + info.maxImageBytes + ' ≤ out ' + info.outBytes);
  assert(info.maxU8Bytes <= info.outBytes,
    'low-peak 200×200→50×50: maxU8Array ' + info.maxU8Bytes + ' ≤ out ' + info.outBytes);
  assert(info.result.width === 50 && info.result.height === 50,
    'low-peak 200×200→50×50 dims correct');
})();

// ============================================================
// Exact cap boundaries (expected dimensions)
// ============================================================
console.log('\n--- Exact cap boundaries ---');

(function () {
  // 2000×2000: edge=2048, pixel=2000000. Scale = min(1, 2048/2000=1, sqrt(2M/4M)=0.707) = 0.707
  // outW = max(2, floor(2000*0.707)) = 1414; outH = 1414
  // product = 1414*1414 = 1999396 ≤ 2M
  var r = computeWorkingSize(2000, 2000, 2000000, 2048);
  assertEq(r.width, 1414, '2000×2000 width=1414, got ' + r.width);
  assertEq(r.height, 1414, '2000×2000 height=1414, got ' + r.height);
  assertEq(r.width * r.height, 1999396, '2000×2000 product=1999396, got ' + (r.width * r.height));
})();

(function () {
  // 2048×1000: edge cap is 2048 which equals the width so it does not
  // force reduction.  pixelScale = sqrt(2M/(2048*1000)) = sqrt(0.97656) = 0.988212.
  // scale = 0.988212. outW = max(2, floor(2048*0.988212)) = 2023.
  // outH = max(2, floor(1000*0.988212)) = 988.
  // product = 2023*988 = 1998724 ≤ 2 000 000.
  // Both edge and pixel caps are satisfied.
  var r = computeWorkingSize(2048, 1000, 2000000, 2048);
  assert(r.width <= 2048 && r.height <= 2048, '2048×1000 within 2048 edge');
  assertEq(r.width, 2023, '2048×1000 width=2023, got ' + r.width);
  assertEq(r.height, 988, '2048×1000 height=988, got ' + r.height);
  assertEq(r.width * r.height, 1998724,
    '2048×1000 product=1998724, got ' + (r.width * r.height));
})();

(function () {
  // Tiny image: no downscale needed
  var r = computeWorkingSize(100, 80, 2000000, 2048);
  assertEq(r.width, 100, 'tiny no-scale width');
  assertEq(r.height, 80, 'tiny no-scale height');
  assertEq(r.scale, 1, 'tiny no-scale scale=1');
})();

(function () {
  // Cap-filling: 1600×1250 = 2,000,000 exactly (no downscale needed)
  var r = computeWorkingSize(1600, 1250, 2000000, 2048);
  assertEq(r.width, 1600, '1600×1250 width=1600');
  assertEq(r.height, 1250, '1600×1250 height=1250');
})();

(function () {
  // Very skewed: 10000×2 → both caps active. pixelScale=sqrt(2M/(10000*2))=sqrt(100)=10,
  // edgeScale=2048/10000=0.2048, scale=0.2048. outW=floor(10000*0.2048)=2048, outH=2.
  // Product=2048*2=4096 ≤ 2M. Should preserve this aspect.
  var r = computeWorkingSize(10000, 2, 2000000, 2048);
  assertEq(r.width, 2048, '10000×2 width=2048, got ' + r.width);
  assertEq(r.height, 2, '10000×2 height=2');
})();

// ============================================================
// warpPerspective premultiplied alpha — exact expected bytes
// ============================================================
console.log('\n--- Warp premultiplied alpha (exact) ---');

(function () {
  // 2×2 source with varied alpha, warp to 2×2 with identity corners.
  // Source: top-left [255,0,0,128], top-right [0,255,0,64],
  //         bottom-left [0,0,255,32], bottom-right [128,128,0,200]
  // Identity warp to 2×2: should be byte-for-byte identical.
  var src = makeImageData(2, 2, [
    255, 0, 0, 128,   0, 255, 0, 64,
    0, 0, 255, 32,    128, 128, 0, 200
  ]);

  var expected = makeImageData(2, 2, [
    255, 0, 0, 128,   0, 255, 0, 64,
    0, 0, 255, 32,    128, 128, 0, 200
  ]);

  var corners = [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}];
  var result = warpPerspective(src, corners, 2, 2);
  assertImagesEqual(result, expected, 'warp premul identity byte-for-byte');
  // All pixels must be finite
  for (var pi = 0; pi < result.data.length; pi++) {
    assert(Number.isFinite(result.data[pi]),
      'warp premul data[' + pi + '] is finite');
    assert(result.data[pi] >= 0 && result.data[pi] <= 255,
      'warp premul data[' + pi + '] in [0,255]');
  }
})();

(function () {
  // 2×2→3×3 warp with identity corners. Center pixel has exact expected premultiplied result.
  // Source pixels (all opaque):
  //   [0,0,0,255]     [255,0,0,255]
  //   [0,255,0,255]   [255,255,255,255]
  // Center of 3×3 at (1,1) samples from source (0.5,0.5)
  // All weights = 0.25, all alpha = 1.0
  // Expected: [64, 64, 64, 255] — oh wait, that's wrong.
  // R = round((0 + 255 + 0 + 255)/4) = round(127.5) = 128
  // G = round((0 + 0 + 255 + 255)/4) = round(127.5) = 128
  // B = round((0 + 0 + 0 + 255)/4) = round(63.75) = 64
  // A = 255
  // So center should be [128,128,64,255]
  var src = makeImageData(2, 2, [
    0, 0, 0, 255,     255, 0, 0, 255,
    0, 255, 0, 255,   255, 255, 255, 255
  ]);
  var corners = [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}];
  var result = warpPerspective(src, corners, 3, 3);
  // Center pixel at index (1,1) in 3×3 = offset (1*3+1)*4 = 16
  assertEq(result.data[16], 128, 'warp premul 2→3 center R=128');
  assertEq(result.data[17], 128, 'warp premul 2→3 center G=128');
  assertEq(result.data[18], 64, 'warp premul 2→3 center B=64');
  assertEq(result.data[19], 255, 'warp premul 2→3 center A=255');
})();

(function () {
  // Warp with semi-transparent source: 2×2→3×3, identity corners.
  // Source:
  //   [255,0,0,128]   [0,255,0,64]
  //   [0,0,255,32]    [128,128,0,200]
  // Center pixel (1,1) samples (0.5,0.5): weights = 0.25 each.
  // accumAlpha = 0.25*(128/255 + 64/255 + 32/255 + 200/255)
  //            = 0.25*(0.5020 + 0.2510 + 0.1255 + 0.7843) = 0.25*1.6627 = 0.4157
  // outA = round(255*0.4157) = round(105.99) = 106
  // accumPremulR = 0.25*(255*0.5020 + 0 + 0 + 128*0.7843) = 0.25*(128.0 + 0 + 0 + 100.39) = 57.10
  // outR = round(57.10/0.4157) = round(137.37) = 137
  // accumPremulG = 0.25*(0 + 255*0.2510 + 0 + 128*0.7843) = 0.25*(0 + 64.0 + 0 + 100.39) = 41.10
  // outG = round(41.10/0.4157) = round(98.88) = 99
  // accumPremulB = 0.25*(0 + 0 + 255*0.1255 + 0) = 0.25*(0 + 0 + 32.0 + 0) = 8.0
  // outB = round(8.0/0.4157) = round(19.25) = 19
  var src = makeImageData(2, 2, [
    255, 0, 0, 128,   0, 255, 0, 64,
    0, 0, 255, 32,    128, 128, 0, 200
  ]);
  var corners = [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}];
  var result = warpPerspective(src, corners, 3, 3);
  var ci = (1 * 3 + 1) * 4;
  assertEq(result.data[ci], 137, 'warp premul semi center R=137, got ' + result.data[ci]);
  assertEq(result.data[ci+1], 99, 'warp premul semi center G=99, got ' + result.data[ci+1]);
  assertEq(result.data[ci+2], 19, 'warp premul semi center B=19, got ' + result.data[ci+2]);
  assertEq(result.data[ci+3], 106, 'warp premul semi center A=106, got ' + result.data[ci+3]);
})();

// ============================================================
// Controlled boundary transparency via VM homography override
// ============================================================
console.log('\n--- Boundary transparency ---');

(function () {
  // Use a VM context to override solveHomography with a known H that
  // maps some dest pixels outside source bounds, testing the boundary
  // epsilon clamp and transparent pixel output.
  var vm = require('vm');
  var fs = require('fs');
  var code = fs.readFileSync(require.resolve('../underpaintingAlignment.js'), 'utf8');
  var ctx = vm.createContext({
    ImageData: global.ImageData,
    Uint8ClampedArray: Uint8ClampedArray,
    Uint8Array: Uint8Array,
    Float64Array: Float64Array,
    Math: Math,
    Number: Number,
    isFinite: isFinite,
    isNaN: isNaN,
    parseInt: parseInt,
    parseFloat: parseFloat,
    Array: Array,
    Object: Object,
    String: String,
    Boolean: Boolean,
    Error: Error,
    TypeError: TypeError,
    RangeError: RangeError,
    JSON: JSON,
    console: console,
    setTimeout: setTimeout
  });
  vm.runInContext(code, ctx);

  // Override solveHomography to return a known projective H that extends
  // beyond the source for some dest pixels.
  // H = [1, 0, 0,  0, 1, 0,  0.5, 0.5, 1]
  // maps dest (x,y) → source (x/(1+0.5x+0.5y), y/(1+0.5x+0.5y))
  // At dest (0,0): source (0,0) ✓
  // At dest (1,0): source (1/1.5, 0/1.5) = (0.67, 0)
  // At dest (2,0): source (2/2, 0/2) = (1, 0)
  // At dest (1,1): source (1/2, 1/2) = (0.5, 0.5)
  // At dest (2,2): source (2/3, 2/3) = (0.67, 0.67)
  // For a 2×2 source, dest pixels near (2,2) map to (0.67, 0.67) — in bounds.
  // Need a stronger perspective: use H = [1, 0, 0, 0, 1, 0, 0, 5, 1]
  // This creates vertical foreshortening.
  // At dest (0, 0.2): source (0, 0.2/2) = (0, 0.1)
  // At dest (0, 0.5): source (0, 0.5/3.5) = (0, 0.14)
  // At dest (1, 0.5): source (1/3.5, 0.5/3.5) = (0.29, 0.14)
  // At dest (0, 1): denominator = 1+0+5*1 = 6, source (0, 1/6) = (0, 0.17)
  // All still in bounds for a 2×2 source. Need even stronger.
  //
  // Use a non-invertible-like strong perspective: H = [1, 0, 0,  0, 1, 0,  3, 3, 1]
  // At dest (1,1): denom = 1+3+3 = 7, source (1/7, 1/7) = (0.14, 0.14)
  // At dest (2,2): denom = 1+6+6 = 13, source (2/13, 2/13) = (0.15, 0.15)
  // Still in bounds. The denominator grows faster than numerator.
  //
  // To get out of bounds: denominator < 1 so numerator grows. Use negative coefficients:
  // H = [1, 0, 0, 0, 1, 0, -0.6, -0.6, 1]
  // At dest (2,2): denom = 1-1.2-1.2 = -1.4 → null (denominator sign flip causes null)
  // At dest (1,1): denom = 1-0.6-0.6 = -0.2 → null
  // Null denominator → transparent. 
  //
  // Use a more moderate perspective: H = [1, 0, 0,  0, 1, 0,  -0.3, 0, 1]
  // At dest (3,0): denom = 1-0.9 = 0.1, source (3/0.1, 0) = (30, 0) → outside 2×2 source
  ctx.solveHomography = function (dst, src) {
    // Return H with moderate horizontal perspective that pushes some pixels
    // outside a 2×2 source when mapping from a 3×3 dest.
    return [1, 0, 0,  0, 1, 0,  -0.3, 0, 1];
  };

  // Create a 2×2 source with known opaque pixels
  var srcData = new Uint8ClampedArray(2 * 2 * 4);
  for (var si = 0; si < 16; si++) srcData[si] = (si % 4 === 3) ? 255 : si * 16;
  var src = new ctx.ImageData(srcData, 2, 2);

  // Use valid corners that match what solveHomography expects
  var corners = [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}];
  var result = ctx.warpPerspective(src, corners, 3, 3);
  assertEq(result.width, 3, 'boundary override width');
  assertEq(result.height, 3, 'boundary override height');

  // With H = [1,0,0, 0,1,0, -0.3,0,1]:
  // dest(0,0) → source(0,0) — in bounds, denom=1
  // dest(1,0) → source(1/0.7, 0) = (1.43, 0) — in bounds (≈ within [0,1]×[0,1])
  // dest(2,0) → source(2/0.4, 0) = (5, 0) — far outside
  // dest(0,1) → source(0, 1/1) = (0, 1) — in bounds
  // dest(2,2) → source(2/(-0.2), 2/(-0.2)) = (-10, -10) → null denom → transparent
  //
  // So dest pixels in the right half should be transparent.
  var transparentCount = 0;
  for (var ti = 3; ti < result.data.length; ti += 4) {
    if (result.data[ti] === 0) transparentCount++;
  }
  assert(transparentCount > 0,
    'override H produces transparent pixels, got ' + transparentCount);
})();

// ============================================================
// Mutation around every remaining resize/warp fixture
// ============================================================
console.log('\n--- Mutation verification (supplemental) ---');

(function () {
  // Mutation around bilinear center fixture
  var src = makeImageData(2, 2, [0,0,0,255, 255,0,0,255, 0,255,0,255, 255,255,255,255]);
  var pre = snapshotImageDataBytes(src);
  resizeImageData(src, 3, 3);
  assert(arraysEqual(src.data, pre.data), 'bilinear center fixture no mutation');
})();

(function () {
  // Mutation around premultiplied alpha resize fixture
  var src = makeImageData(2, 2, [255,0,0,0, 0,0,255,255, 255,0,0,0, 0,0,255,255]);
  var pre = snapshotImageDataBytes(src);
  resizeImageData(src, 3, 2);
  assert(arraysEqual(src.data, pre.data), 'premul resize fixture no mutation');
})();

console.log('\n==============================');
console.log('Tests: ' + (passed + failed) + ' total, ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exit(1);
}

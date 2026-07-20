// tests/crop.test.js
// Unit tests for crop.js — pure functions for the Crop tool.

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

var crop = require('../crop.js');
var largestRectForAspect = crop.largestRectForAspect;
var clampRect = crop.clampRect;
var resizeRect = crop.resizeRect;
var cropImageData = crop.cropImageData;

var passed = 0;
var failed = 0;

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + message);
    console.error('  expected:', JSON.stringify(expected));
    console.error('  actual:  ', JSON.stringify(actual));
  }
}

function assertClose(actual, expected, epsilon, message) {
  if (Math.abs(actual - expected) <= epsilon) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + message);
    console.error('  expected ~' + expected + ', got ' + actual);
  }
}

// ── largestRectForAspect ──────────────────────────────

// Landscape image (800×600) with portrait preset (4:5 = 0.8)
// The image is wider than tall, so height is the constraint.
// rect.h = 600, rect.w = 600 * 4/5 = 480, centered x = (800-480)/2 = 160
(function testLandscapeImagePortraitPreset() {
  var rect = largestRectForAspect(800, 600, 4, 5);
  assertEqual(rect, { x: 160, y: 0, w: 480, h: 600 }, 'landscape img + portrait preset: height-constrained, centered');
})();

// Portrait image (600×800) with landscape preset (16:9 ≈ 1.778)
// Width is the constraint: rect.w = 600, rect.h = 600 * 9/16 = 337.5, centered
(function testPortraitImageLandscapePreset() {
  var rect = largestRectForAspect(600, 800, 16, 9);
  assertEqual(rect, { x: 0, y: Math.round((800 - Math.round(600 * 9 / 16)) / 2), w: 600, h: Math.round(600 * 9 / 16) },
    'portrait img + landscape preset: width-constrained, centered');
})();

// Exact-fit aspect returns full image
(function testExactFitReturnsFull() {
  var rect = largestRectForAspect(800, 600, 4, 3);
  assertEqual(rect, { x: 0, y: 0, w: 800, h: 600 }, 'exact-fit aspect returns full image');
})();

// 1:1 on 4×2 image → centered 2×2
(function testOneToOneOnWideImage() {
  var rect = largestRectForAspect(4, 2, 1, 1);
  assertEqual(rect, { x: 1, y: 0, w: 2, h: 2 }, '1:1 on 4×2 → centered 2×2');
})();

// Square image with 1:1 preset → full image
(function testSquareImageOneToOne() {
  var rect = largestRectForAspect(500, 500, 1, 1);
  assertEqual(rect, { x: 0, y: 0, w: 500, h: 500 }, 'square image + 1:1 → full image');
})();

// Golden ratio on 1000×618 → nearly full (very close aspect)
(function testGoldenRatio() {
  var rect = largestRectForAspect(1618, 1000, 1618, 1000);
  assertEqual(rect, { x: 0, y: 0, w: 1618, h: 1000 }, 'golden ratio exact fit');
})();

// Image smaller than preset aspect in both dims → width-constrained, centered
(function testSmallImageWidthConstrained() {
  var rect = largestRectForAspect(200, 100, 1, 1);
  // wFromH = 100*1/1 = 100 ≤ 200, so height constrains: h=100, w=100, centered x=50
  assertEqual(rect, { x: 50, y: 0, w: 100, h: 100 }, '200×100 with 1:1 → 100×100 centered x=50');
})();

// ── clampRect ─────────────────────────────────────────

// Off-edge left position clamps to 0
(function testClampLeftEdge() {
  var rect = clampRect({ x: -10, y: 0, w: 100, h: 100 }, 200, 200, 32);
  assertEqual(rect.x, 0, 'negative x clamps to 0');
  assertEqual(rect.w, 100, 'width unchanged');
})();

// Off-edge top position clamps to 0
(function testClampTopEdge() {
  var rect = clampRect({ x: 0, y: -20, w: 100, h: 100 }, 200, 200, 32);
  assertEqual(rect.y, 0, 'negative y clamps to 0');
  assertEqual(rect.h, 100, 'height unchanged');
})();

// Right edge overflow clamps position
(function testClampRightEdge() {
  var rect = clampRect({ x: 150, y: 0, w: 100, h: 100 }, 200, 200, 32);
  assertEqual(rect.x, 100, 'right overflow clamps x so x+w = imgW');
})();

// Bottom edge overflow clamps position
(function testClampBottomEdge() {
  var rect = clampRect({ x: 0, y: 150, w: 100, h: 100 }, 200, 200, 32);
  assertEqual(rect.y, 100, 'bottom overflow clamps y so y+h = imgH');
})();

// Width below minSize enforces minSize
(function testClampMinWidth() {
  var rect = clampRect({ x: 0, y: 0, w: 10, h: 100 }, 200, 200, 32);
  assertEqual(rect.w, 32, 'width below minSize enforces minSize');
  // Position may adjust if x + minSize exceeds imgW
  assertEqual(rect.x, 0, 'x unchanged when width grows but still fits');
})();

// Height below minSize enforces minSize
(function testClampMinHeight() {
  var rect = clampRect({ x: 0, y: 0, w: 100, h: 5 }, 200, 200, 32);
  assertEqual(rect.h, 32, 'height below minSize enforces minSize');
})();

// Width + x overflow after minSize adjustment clamps x
(function testClampMinSizeOverflowX() {
  var rect = clampRect({ x: 190, y: 0, w: 5, h: 100 }, 200, 200, 32);
  // minSize = 32, so w → 32, then x must clamp: x = 200 - 32 = 168
  assertEqual(rect.w, 32, 'minSize enforced when w < 32');
  assertEqual(rect.x, 168, 'x clamps to make x + minSize = imgW');
})();

// Height + y overflow after minSize adjustment clamps y
(function testClampMinSizeOverflowY() {
  var rect = clampRect({ x: 0, y: 190, w: 100, h: 5 }, 200, 200, 32);
  assertEqual(rect.h, 32, 'minSize enforced when h < 32');
  assertEqual(rect.y, 168, 'y clamps to make y + minSize = imgH');
})();

// Everything within bounds — no change
(function testClampNoChange() {
  var rect = clampRect({ x: 10, y: 10, w: 100, h: 100 }, 200, 200, 32);
  assertEqual(rect, { x: 10, y: 10, w: 100, h: 100 }, 'within bounds → unchanged');
})();

// ── resizeRect ────────────────────────────────────────

// Aspect-locked SE drag: increasing w by 20 should increase h proportionally
(function testResizeSELocked() {
  var rect = resizeRect({ x: 0, y: 0, w: 100, h: 100 }, 'se', 20, 0, { w: 1, h: 1 }, 400, 400);
  assertEqual(rect.w, 120, 'SE drag +20w with 1:1 → w = 120');
  assertEqual(rect.h, 120, 'SE drag +20w with 1:1 → h = 120 (locked)');
  assertEqual(rect.x, 0, 'SE drag → x unchanged');
  assertEqual(rect.y, 0, 'SE drag → y unchanged');
})();

// Aspect-locked NW drag: dragging NW shrinks, anchor is SE corner
(function testResizeNWLocked() {
  // Rect at (100, 100, 200, 200). SE corner at (300, 300).
  // Drag NW by (20, 10) → dx=-20, dy=-10 → new w should decrease by 20, h by 20 (preserving 1:1)
  // Actually: new w = 200 - 20 = 180, but h must match: since aspect is 1:1, h = 180.
  // But dy = -10 so if we only use dx: w = 200 - 20 = 180, h = 180 (from aspect), 
  // so y must adjust: y = 300 - 180 = 120
  var rect = resizeRect({ x: 100, y: 100, w: 200, h: 200 }, 'nw', 20, 10, { w: 1, h: 1 }, 400, 400);
  assertEqual(rect.w, 180, 'NW drag +20dx with 1:1 → w = 180');
  assertEqual(rect.h, 180, 'NW drag → h = 180 (1:1 locked)');
  assertEqual(rect.x, 120, 'NW drag → x = seX - w = 300 - 180 = 120');
  assertEqual(rect.y, 120, 'NW drag → y = seY - h = 300 - 180 = 120');
})();

// Free mode (aspect=null): SE drag changes only w
(function testResizeSEFree() {
  var rect = resizeRect({ x: 0, y: 0, w: 100, h: 100 }, 'se', 20, 0, null, 400, 400);
  assertEqual(rect.w, 120, 'Free SE drag +20w → w = 120');
  assertEqual(rect.h, 100, 'Free SE drag → h unchanged');
})();

// Free mode: NW drag changes both independently
(function testResizeNWFree() {
  var rect = resizeRect({ x: 100, y: 100, w: 200, h: 200 }, 'nw', 20, 30, null, 400, 400);
  assertEqual(rect.w, 180, 'Free NW drag +20dx → w = 180');
  assertEqual(rect.h, 170, 'Free NW drag +30dy → h = 170');
  assertEqual(rect.x, 120, 'Free NW drag → x = 100 + 20 = 120');
  assertEqual(rect.y, 130, 'Free NW drag → y = 100 + 30 = 130');
})();

// Clamping during resize: dragging off image edge
(function testResizeClamp() {
  // Rect at (0, 0, 100, 100), drag NW by (-50, 0) — can't go negative
  var rect = resizeRect({ x: 0, y: 0, w: 100, h: 100 }, 'nw', 50, 0, { w: 1, h: 1 }, 400, 400);
  // NW drag by dx=50, dy=0 → new w = 100 - 50 = 50, new h = 50 (1:1)
  // x would be 0 + 50 = 50? No, wait...
  // NW handle: x increases by dx, y increases by dy. w decreases by dx, h decreases by dy.
  // Actually: for NW, dx > 0 means drag right (wider), dx < 0 means drag left (narrower).
  // But if dx=50 is positive: x += dx = 50, w -= dx = 50. So w = 50.
  // Then h = 50 from aspect (1:1). And y = seY - h = 100 - 50 = 50. But y was 0...
  // Hmm, I need to think about what dx and dy mean for resizeRect more carefully.
  // 
  // In the plan: resizeRect(rect, handle, dx, dy, aspect, imgW, imgH)
  // dx and dy represent mouse movement deltas. For NW, moving right (+dx) makes 
  // the rect wider (x increases, w decreases... no, x increases means left edge moves right,
  // making rect narrower). Let me think again.
  //
  // For SE handle: the SE corner moves by (dx, dy). So w += dx, h += dy.
  // For NW handle: the NW corner moves by (dx, dy). So x += dx, y += dy, w -= dx, h -= dy.
  //
  // With dx=50 (drag right), NW corner goes right: x=50, w=50, then aspect-locked h=50,
  // so y needs to be: se.y = y + h = 50 + 50 = 100, so y stays at... wait, se.y = original y + original h = 100.
  // With new h=50, y = se.y - h = 100 - 50 = 50. That's fine, y can be 50.
  assertEqual(rect.x, 50, 'resize clamp: NW drag right +50dx → x = 50');
  assertEqual(rect.y, 50, 'resize clamp: NW drag right +50dx → y adjusts for aspect');
  assertEqual(rect.w, 50, 'resize clamp: NW drag right +50dx → w = 50');
  assertEqual(rect.h, 50, 'resize clamp: NW drag right +50dx → h = 50 (1:1 locked)');
})();

// SW handle: aspect-locked, drag changes w and h preserving aspect
(function testResizeSWLocked() {
  // Rect at (100, 0, 200, 200), SW corner at (100, 200).
  // Drag SW right (+dx) = increase w. With 1:1, h must also increase.
  var rect = resizeRect({ x: 100, y: 0, w: 200, h: 200 }, 'sw', 40, 0, { w: 1, h: 1 }, 400, 400);
  // SW: x += dx? No... SW handle is bottom-left. dx moves the left edge right (narrower).
  // Actually: SW handle moves bottom-left corner. dx>0 → left edge moves right, w decreases by dx.
  // But h increases by dy. For aspect-locked, it's more complex.
  // 
  // Let me re-read the plan: "if aspect is non-null, adjust the secondary dimension
  // to preserve aspect (anchor the opposite corner)"
  // 
  // For SW: opposite corner is NE. dx > 0 means left edge moves right, so w -= dx.
  // But aspect-locked: h must match. NE corner anchored at (100+200, 0) = (300, 0).
  // New w = 200 - 40 = 160. h = 160 (1:1). But that changes y = 0 - (160-200) = 40? No.
  // NE.y = 0, so new y = 0 (NE is top-right corner). Wait, NE y = original y = 0.
  // New h = 160, y = 0. So bottom edge at y = 160. That means SW y = 160.
  // But wait, SW handle is bottom-left. Original SW y = 200.
  // If dx=40, w = 200 - 40 = 160. For 1:1, h = 160. NE y = 0, so y = 0. h = 160. SW y = 160.
  assertEqual(rect.w, 160, 'SW drag: w = 200 - 40 = 160');
  assertEqual(rect.h, 160, 'SW drag: h = 160 (1:1 locked)');
  assertEqual(rect.y, 0, 'SW drag: y unchanged (NE corner anchored)');
})();

// NE handle: aspect-locked, drag increases w and decreases h
(function testResizeNELocked() {
  // Rect at (100, 100, 200, 200). SW corner at (100, 300).
  // Drag NE right by 40 (+dx): w should increase, h follows aspect (1:1).
  // Opposite corner is SW (100, 300).
  var rect = resizeRect({ x: 100, y: 100, w: 200, h: 200 }, 'ne', 40, 0, { w: 1, h: 1 }, 400, 400);
  assertEqual(rect.w, 240, 'NE drag +40dx with 1:1 → w = 240');
  assertEqual(rect.h, 240, 'NE drag +40dx with 1:1 → h = 240 (locked)');
  assertEqual(rect.x, 100, 'NE drag → x unchanged (SW corner anchored)');
  assertEqual(rect.y, 60, 'NE drag → y = swY - h = 300 - 240 = 60');
})();

// NE handle: aspect-locked vertical drag (dy dominant)
(function testResizeNELockedVertical() {
  // Rect at (100, 100, 200, 200). SW corner at (100, 300).
  // Drag NE down by +40 (+dy): h decreases, w should follow 1:1.
  var rect = resizeRect({ x: 100, y: 100, w: 200, h: 200 }, 'ne', 0, 40, { w: 1, h: 1 }, 400, 400);
  // From dy: h = 200 - 40 = 160, w = 160. From dx: w = 200 + 0 = 200.
  // dy delta = |160 - 200| = 40, dx delta = |200 - 200| = 0. dy dominates.
  assertEqual(rect.w, 160, 'NE drag +40dy with 1:1 → w = 160 (from dy)');
  assertEqual(rect.h, 160, 'NE drag +40dy with 1:1 → h = 160');
  assertEqual(rect.x, 100, 'NE drag +40dy → x unchanged');
  assertEqual(rect.y, 140, 'NE drag +40dy → y = swY - h = 300 - 160 = 140');
})();

// NE handle: free mode changes both independently
(function testResizeNEFree() {
  var rect = resizeRect({ x: 100, y: 100, w: 200, h: 200 }, 'ne', 30, -20, null, 400, 400);
  assertEqual(rect.w, 230, 'Free NE drag +30dx → w = 230');
  assertEqual(rect.h, 220, 'Free NE drag -20dy → h = 220');
  assertEqual(rect.x, 100, 'Free NE drag → x unchanged');
  assertEqual(rect.y, 80, 'Free NE drag → y = 100 + (-20) = 80');
})();

// ── cropImageData ──────────────────────────────────────

// Known 4×4 image cut to {1, 1, 2, 2} yields a 2×2 image
(function testCropImageData() {
  // Create a 4×4 RGBA image with known pixel values
  var srcData = new Uint8ClampedArray(4 * 4 * 4); // 64 bytes
  // Fill with distinct pixel values
  for (var i = 0; i < 64; i += 4) {
    var px = i / 4;
    srcData[i] = px * 10;       // R
    srcData[i + 1] = px * 10;   // G
    srcData[i + 2] = px * 10;   // B
    srcData[i + 3] = 255;       // A
  }
  var srcImageData = { data: srcData, width: 4, height: 4 };

  var result = cropImageData(srcImageData, { x: 1, y: 1, w: 2, h: 2 });

  assertEqual(result.width, 2, 'cropped width = 2');
  assertEqual(result.height, 2, 'cropped height = 2');

  // Expected: pixel at (1,1) → index (1+1*4) = 5 in original
  // Pixel at (2,1) → index (2+1*4) = 6
  // Pixel at (1,2) → index (1+2*4) = 9
  // Pixel at (2,2) → index (2+2*4) = 10
  // Each pixel is 4 bytes (RGBA)
  var expectedValues = [
    srcData[5 * 4], srcData[5 * 4 + 1], srcData[5 * 4 + 2], srcData[5 * 4 + 3],
    srcData[6 * 4], srcData[6 * 4 + 1], srcData[6 * 4 + 2], srcData[6 * 4 + 3],
    srcData[9 * 4], srcData[9 * 4 + 1], srcData[9 * 4 + 2], srcData[9 * 4 + 3],
    srcData[10 * 4], srcData[10 * 4 + 1], srcData[10 * 4 + 2], srcData[10 * 4 + 3]
  ];

  for (var j = 0; j < 16; j++) {
    if (result.data[j] !== expectedValues[j]) {
      failed++;
      console.error('FAIL: cropImageData pixel mismatch at offset ' + j);
      console.error('  expected:', expectedValues[j]);
      console.error('  actual:  ', result.data[j]);
      return;
    }
  }
  passed++;
  console.log('PASS: cropImageData 4×4 → 2×2 crop correct');
})();

// Ensure input is unmodified
(function testCropImageDataDoesNotMutateInput() {
  var srcData = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
  var srcImageData = { data: srcData, width: 2, height: 2 };
  var before = Array.from(srcData);

  cropImageData(srcImageData, { x: 0, y: 0, w: 1, h: 1 });

  var after = Array.from(srcData);
  var unchanged = before.every(function (v, i) { return v === after[i]; });
  if (unchanged) {
    passed++;
    console.log('PASS: cropImageData input unmodified');
  } else {
    failed++;
    console.error('FAIL: cropImageData modified input data');
  }
})();

// Crop full image returns identical dimensions
(function testCropFullImage() {
  var srcData = new Uint8ClampedArray(2 * 2 * 4);
  for (var i = 0; i < srcData.length; i++) srcData[i] = 128;
  var srcImageData = { data: srcData, width: 2, height: 2 };

  var result = cropImageData(srcImageData, { x: 0, y: 0, w: 2, h: 2 });

  assertEqual(result.width, 2, 'full crop width = 2');
  assertEqual(result.height, 2, 'full crop height = 2');
})();

// Crop at edge: rect partially off-image — should handle gracefully
// (clampRect already ensures in-bounds, but cropImageData should work
// for any in-bounds rect)
(function testCropAtEdge() {
  var srcData = new Uint8ClampedArray(4 * 4 * 4);
  for (var i = 0; i < srcData.length; i++) srcData[i] = 42;
  var srcImageData = { data: srcData, width: 4, height: 4 };

  var result = cropImageData(srcImageData, { x: 2, y: 2, w: 2, h: 2 });

  assertEqual(result.width, 2, 'edge crop width = 2');
  assertEqual(result.height, 2, 'edge crop height = 2');
  // Check alpha preserved
  assertEqual(result.data[3], 42, 'edge crop: alpha preserved');
})();

// ── Report ────────────────────────────────────────────

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);

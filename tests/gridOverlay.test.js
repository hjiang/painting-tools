// tests/gridOverlay.test.js
// Unit tests for computeGridLayout — the pure math function.

var computeGridLayout = require('../gridOverlay.js').computeGridLayout;
var computeAutoValue = require('../gridOverlay.js').computeAutoValue;

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

// ── Normal mode (non-square) ──────────────────────────

// Landfill image (3:2), 3 rows × 4 columns
(function testNormalLandfill() {
  var layout = computeGridLayout(1200, 800, { rows: 3, columns: 4, squareCells: false });
  assertEqual(layout.offsetX, 0, 'normal: no horizontal offset');
  assertEqual(layout.offsetY, 0, 'normal: no vertical offset');
  assertClose(layout.cellW, 300, 0.01, 'normal: cellW = width/cols');
  assertClose(layout.cellH, 266.67, 0.01, 'normal: cellH = height/rows');
  assertEqual(layout.gridW, 1200, 'normal: gridW = image width');
  assertEqual(layout.gridH, 800, 'normal: gridH = image height');
})();

// Square image, 2×2
(function testNormalSquare() {
  var layout = computeGridLayout(600, 600, { rows: 2, columns: 2, squareCells: false });
  assertClose(layout.cellW, 300, 0.01, 'square image: cellW = 300');
  assertClose(layout.cellH, 300, 0.01, 'square image: cellH = 300');
  assertEqual(layout.offsetX, 0, 'square image: no offset');
  assertEqual(layout.offsetY, 0, 'square image: no offset');
})();

// Many columns (12), few rows (2) on a tall image
(function testNormalTall() {
  var layout = computeGridLayout(600, 1200, { rows: 2, columns: 12, squareCells: false });
  assertClose(layout.cellW, 50, 0.01, 'tall image: cellW = 50');
  assertClose(layout.cellH, 600, 0.01, 'tall image: cellH = 600');
  assertEqual(layout.gridW, 600, 'tall image: gridW = width');
  assertEqual(layout.gridH, 1200, 'tall image: gridH = height');
})();

// ── Square cells mode ─────────────────────────────────

// Image 1200×800 (3:2), 4 columns, 3 rows — cells naturally square already
(function testSquareCellsNatural() {
  var layout = computeGridLayout(1200, 800, { rows: 3, columns: 4, squareCells: true });
  assertClose(layout.cellW, 266.67, 0.01, 'sq: natural fit cellW');
  assertClose(layout.cellH, 266.67, 0.01, 'sq: natural fit cellH = cellW');
  assertClose(layout.gridW, 1066.67, 0.1, 'sq: gridW = cellW * 4');
  assertClose(layout.gridH, 800, 0.1, 'sq: gridH = cellW * 3 = 800 (fills height)');
  assertClose(layout.offsetX, 66.67, 0.1, 'sq: offsetX centers grid horizontally');
  assertClose(layout.offsetY, 0, 0.01, 'sq: offsetY = 0 (height is the constraining dim)');
})();

// Image 1200×800 (3:2), 6 columns, 2 rows — cells cramped by height
(function testSquareCellsHeightConstrained() {
  var layout = computeGridLayout(1200, 800, { rows: 2, columns: 6, squareCells: true });
  // cellSize = min(1200/6, 800/2) = min(200, 400) = 200
  assertClose(layout.cellW, 200, 0.01, 'sq height-constrained: cellW = 200');
  assertClose(layout.cellH, 200, 0.01, 'sq height-constrained: cellH = 200');
  assertClose(layout.gridW, 1200, 0.01, 'sq height-constrained: gridW = 6*200 = 1200 (fills width)');
  assertClose(layout.gridH, 400, 0.01, 'sq height-constrained: gridH = 2*200 = 400');
  assertClose(layout.offsetX, 0, 0.01, 'sq height-constrained: offsetX = 0');
  assertClose(layout.offsetY, 200, 0.01, 'sq height-constrained: offsetY = (800-400)/2 = 200');
})();

// Image 1200×800, 4 columns, 4 rows — cells cramped by width
(function testSquareCellsWidthConstrained() {
  var layout = computeGridLayout(1200, 800, { rows: 4, columns: 4, squareCells: true });
  // cellSize = min(1200/4, 800/4) = min(300, 200) = 200
  assertClose(layout.cellW, 200, 0.01, 'sq width-constrained: cellW = 200');
  assertClose(layout.cellH, 200, 0.01, 'sq width-constrained: cellH = 200');
  assertClose(layout.gridW, 800, 0.01, 'sq width-constrained: gridW = 4*200 = 800');
  assertClose(layout.gridH, 800, 0.01, 'sq width-constrained: gridH = 4*200 = 800 (fills height)');
  assertClose(layout.offsetX, 200, 0.01, 'sq width-constrained: offsetX = (1200-800)/2 = 200');
  assertClose(layout.offsetY, 0, 0.01, 'sq width-constrained: offsetY = 0');
})();

// Square image 800×800, squareCells should be a no-op
(function testSquareCellsSquareImage() {
  var layout = computeGridLayout(800, 800, { rows: 4, columns: 4, squareCells: true });
  assertClose(layout.cellW, 200, 0.01, 'sq square image: cellW = 200');
  assertClose(layout.cellH, 200, 0.01, 'sq square image: cellH = 200');
  assertClose(layout.gridW, 800, 0.01, 'sq square image: gridW = 800');
  assertClose(layout.gridH, 800, 0.01, 'sq square image: gridH = 800');
  assertClose(layout.offsetX, 0, 0.01, 'sq square image: offsetX = 0');
  assertClose(layout.offsetY, 0, 0.01, 'sq square image: offsetY = 0');
})();

// Edge: very tall image — all margin top and bottom
(function testSquareCellsTallImage() {
  var layout = computeGridLayout(400, 1600, { rows: 8, columns: 2, squareCells: true });
  // cellSize = min(400/2, 1600/8) = min(200, 200) = 200 — perfect fit!
  assertClose(layout.cellW, 200, 0.01, 'sq tall: cellW = 200');
  assertClose(layout.cellH, 200, 0.01, 'sq tall: cellH = 200');
  assertClose(layout.gridW, 400, 0.01, 'sq tall: gridW = 400');
  assertClose(layout.gridH, 1600, 0.01, 'sq tall: gridH = 1600');
  assertClose(layout.offsetX, 0, 0.01, 'sq tall: offsetX = 0');
  assertClose(layout.offsetY, 0, 0.01, 'sq tall: offsetY = 0');
})();

// Edge: very wide image — all margin left and right
(function testSquareCellsWideImage() {
  var layout = computeGridLayout(2400, 600, { rows: 3, columns: 12, squareCells: true });
  // cellSize = min(2400/12, 600/3) = min(200, 200) = 200 — perfect fit!
  assertClose(layout.cellW, 200, 0.01, 'sq wide: cellW = 200');
  assertClose(layout.cellH, 200, 0.01, 'sq wide: cellH = 200');
  assertClose(layout.gridW, 2400, 0.01, 'sq wide: gridW = 2400');
  assertClose(layout.gridH, 600, 0.01, 'sq wide: gridH = 600');
  assertClose(layout.offsetX, 0, 0.01, 'sq wide: offsetX = 0');
  assertClose(layout.offsetY, 0, 0.01, 'sq wide: offsetY = 0');
})();

// ── computeAutoValue (square-cell auto-dimension math) ─

// Landscape 1200×800 (3:2), rows=3 → columns should be 5 (4.5 rounded)
(function testAutoRowsToCols() {
  var val = computeAutoValue('rows', 3, 1200, 800, 2, 12);
  assertEqual(val, 5, 'auto rows→cols: 3 rows on 3:2 → round(3*1200/800) = 5');
})();

// Same aspect, columns=4 → rows should be 3 (2.67 rounded)
(function testAutoColsToRows() {
  var val = computeAutoValue('columns', 4, 1200, 800, 2, 12);
  assertEqual(val, 3, 'auto cols→rows: 4 cols on 3:2 → round(4*800/1200) = 3');
})();

// Clamping: rows=12 on 3:2 would give cols=18, clamped to max 12
(function testAutoClampMax() {
  var val = computeAutoValue('rows', 12, 1200, 800, 2, 12);
  assertEqual(val, 12, 'auto: 12 rows on 3:2 → round(12*1200/800)=18 → clamped to 12');
})();

// Clamping: columns=2 on 3:2 would give rows=1, clamped to min 2
(function testAutoClampMin() {
  var val = computeAutoValue('columns', 2, 1200, 800, 2, 12);
  assertEqual(val, 2, 'auto: 2 cols on 3:2 → round(2*800/1200)=1 → clamped to 2');
})();

// Square image 800×800: rows=4 → columns=4
(function testAutoSquareImage() {
  var val = computeAutoValue('rows', 4, 800, 800, 2, 12);
  assertEqual(val, 4, 'auto square: 4 rows → 4 cols');
})();

// Portrait 400×800 (1:2): columns=2 → rows=4
(function testAutoPortrait() {
  var val = computeAutoValue('columns', 2, 400, 800, 2, 12);
  assertEqual(val, 4, 'auto portrait: 2 cols on 1:2 → round(2*800/400) = 4');
})();

// Wide 2400×600 (4:1): rows=4 → columns=16, clamped to 12
(function testAutoPanorama() {
  var val = computeAutoValue('rows', 4, 2400, 600, 2, 12);
  assertEqual(val, 12, 'auto panorama: 4 rows on 4:1 → round(4*2400/600)=16 → clamped to 12');
})();

// ── Report ────────────────────────────────────────────

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);

// tests/histogram.test.js
// Run with: node tests/histogram.test.js
//
// Tests histogram hit-testing (binAtX) and HIST_PAD export.

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

const { drawHistogram, binAtX, HIST_PAD } = require('../histogram.js');

// ============================================================
// HIST_PAD export
// ============================================================
console.log('\n--- HIST_PAD export ---');

assert(HIST_PAD, 'HIST_PAD is exported');
assertEq(typeof HIST_PAD.top, 'number', 'HIST_PAD.top is a number');
assertEq(typeof HIST_PAD.right, 'number', 'HIST_PAD.right is a number');
assertEq(typeof HIST_PAD.bottom, 'number', 'HIST_PAD.bottom is a number');
assertEq(typeof HIST_PAD.left, 'number', 'HIST_PAD.left is a number');

// ============================================================
// binAtX
// ============================================================
console.log('\n--- binAtX ---');

const canvasCssW = 600;  // matches #histogram-canvas width
const padLeft = HIST_PAD.left;
const padRight = HIST_PAD.right;
const chartW = canvasCssW - padLeft - padRight;
const barGap = 2;

function xForBin(binIndex, N) {
  const barW = Math.max(2, (chartW - (N - 1) * barGap) / N);
  return padLeft + binIndex * (barW + barGap) + barW / 2;
}

// N=3: test each bin center
{
  const N = 3;
  for (let bin = 0; bin < N; bin++) {
    const cx = xForBin(bin, N);
    assertEq(binAtX(cx, canvasCssW, N), bin, `N=3: center of bin ${bin} → ${bin}`);
  }
}

// N=5: test each bin center
{
  const N = 5;
  for (let bin = 0; bin < N; bin++) {
    const cx = xForBin(bin, N);
    assertEq(binAtX(cx, canvasCssW, N), bin, `N=5: center of bin ${bin} → ${bin}`);
  }
}

// Between-bin boundaries: should return the left bin (boundary belongs to left bin)
{
  const N = 3;
  const barW = Math.max(2, (chartW - (N - 1) * barGap) / N);
  for (let bin = 0; bin < N - 1; bin++) {
    const boundaryX = padLeft + (bin + 1) * (barW + barGap) - barGap / 2 - 0.5;
    assertEq(binAtX(boundaryX, canvasCssW, N), bin,
      `N=3: just before boundary after bin ${bin} → ${bin}`);
  }
}

// Outside chart area (left padding)
{
  assertEq(binAtX(0, canvasCssW, 3), -1, 'N=3: x=0 (outside left) → -1');
  assertEq(binAtX(padLeft - 1, canvasCssW, 3), -1, 'N=3: x=padLeft-1 → -1');
}

// Outside chart area (right padding)
{
  assertEq(binAtX(canvasCssW - padRight + 1, canvasCssW, 3), -1,
    'N=3: x=canvasW-padRight+1 → -1');
  assertEq(binAtX(canvasCssW, canvasCssW, 3), -1, 'N=3: x=canvasW → -1');
}

// First pixel of first bar
{
  const N = 3;
  const barW = Math.max(2, (chartW - (N - 1) * barGap) / N);
  const firstBarX = padLeft;
  assertEq(binAtX(firstBarX, canvasCssW, N), 0, 'N=3: first pixel of first bar → 0');
}

// Last pixel of last bar
{
  const N = 3;
  const barW = Math.max(2, (chartW - (N - 1) * barGap) / N);
  const lastBarEnd = padLeft + (N - 1) * (barW + barGap) + barW;
  // The last bar's last pixel is at lastBarEnd - 0.5 (pixel center)
  assertEq(binAtX(lastBarEnd - 0.5, canvasCssW, N), N - 1,
    'N=3: last pixel of last bar → ' + (N - 1));
}

// N=12: test extremes
{
  const N = 12;
  const barW = Math.max(2, (chartW - (N - 1) * barGap) / N);
  const firstBarX = padLeft;
  assertEq(binAtX(firstBarX, canvasCssW, N), 0, 'N=12: first pixel of first bar → 0');
  const lastBarEnd = padLeft + (N - 1) * (barW + barGap) + barW;
  assertEq(binAtX(lastBarEnd - 0.5, canvasCssW, N), N - 1,
    'N=12: last pixel of last bar → ' + (N - 1));
}

// ============================================================
// Consistency: binAtX uses same HIST_PAD as drawHistogram
// ============================================================
console.log('\n--- Consistency: binAtX aligns with drawHistogram ---');

// Verify that the pad values used by binAtX match what drawHistogram uses
// by checking the first bar's x position matches drawHistogram's pad.left.
// drawHistogram draws the first bar at pad.left.
// binAtX should return 0 for the same position.

{
  const N = 4;
  const firstBarLeftEdge = HIST_PAD.left;
  assertEq(binAtX(firstBarLeftEdge, canvasCssW, N), 0,
    'binAtX first bar x matches drawHistogram pad.left');
}

// ============================================================
// RESULTS
// ============================================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(40)}`);

process.exit(failed > 0 ? 1 : 0);

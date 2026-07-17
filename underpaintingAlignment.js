// underpaintingAlignment.js
// Pure functions for four-point projective homography and perspective warping.
// Used by the Underpainting Check tool to rectify a photographed underpainting.
//
// Exports:
//   computeWorkingSize, resizeImageData, validateCornerQuad,
//   solveHomography, mapHomographyPoint, warpPerspective

'use strict';

// ── Constants ─────────────────────────────────────────────

var LINEAR_SOLVE_EPSILON = 1e-12;
var BOUNDARY_EPSILON = 1e-7;

// ── Shared strict ImageData validation ────────────────
// Used by resizeImageData and warpPerspective to enforce
// finite/integer dimensions, exact byte length, and safe allocation size.

// Feature working caps — the tool never produces an output larger than these.
// computeWorkingSize accepts caller-provided caps but the output guards below
// enforce these hard feature limits before any buffer allocation.
var MAX_EDGE = 2048;
var MAX_PIXELS = 2000000;

function assertValidImageData2D(source) {
  if (!source || !source.data || !(source.data instanceof Uint8ClampedArray)) {
    throw new TypeError('Source must be an ImageData with Uint8ClampedArray data');
  }
  if (typeof source.width !== 'number' || typeof source.height !== 'number' ||
      !Number.isFinite(source.width) || !Number.isFinite(source.height)) {
    throw new TypeError('Source dimensions must be finite numbers');
  }
  if (!Number.isInteger(source.width) || !Number.isInteger(source.height)) {
    throw new TypeError('Source dimensions must be integers');
  }
  if (source.width < 2 || source.height < 2) {
    throw new RangeError('Source must be at least 2×2 pixels');
  }
  if (source.data.length !== source.width * source.height * 4) {
    throw new TypeError('Source data length does not match dimensions');
  }
}

function assertSafeOutputDimensions(outputWidth, outputHeight) {
  if (typeof outputWidth !== 'number' || typeof outputHeight !== 'number' ||
      !Number.isFinite(outputWidth) || !Number.isFinite(outputHeight)) {
    throw new TypeError('Output dimensions must be finite numbers');
  }
  if (!Number.isInteger(outputWidth) || !Number.isInteger(outputHeight)) {
    throw new RangeError('Output dimensions must be integers');
  }
  if (outputWidth < 2 || outputHeight < 2) {
    throw new RangeError('Output dimensions must be at least 2 pixels');
  }
  // Hard feature limits: no dimension exceeds 2048 and total pixels ≤ 2,000,000
  if (outputWidth > MAX_EDGE || outputHeight > MAX_EDGE) {
    throw new RangeError('Output dimension exceeds feature cap of ' + MAX_EDGE);
  }
  var product = outputWidth * outputHeight;
  if (!Number.isFinite(product) || product <= 0 ||
      product > MAX_PIXELS) {
    throw new RangeError('Output pixel count exceeds feature cap of ' + MAX_PIXELS);
  }
}

// ── computeWorkingSize ────────────────────────────────────
// Returns capped working dimensions and their computed scale.

function computeWorkingSize(width, height, maxPixels, maxEdge) {
  // Validate types
  if (typeof width !== 'number' || typeof height !== 'number' ||
      typeof maxPixels !== 'number' || typeof maxEdge !== 'number') {
    throw new TypeError('All arguments must be numbers');
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) ||
      !Number.isFinite(maxPixels) || !Number.isFinite(maxEdge)) {
    throw new TypeError('All arguments must be finite');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new RangeError('Width and height must be integers');
  }
  if (width < 2 || height < 2) {
    throw new RangeError('Width and height must be at least 2 pixels');
  }
  if (maxPixels < 4) {
    throw new RangeError('maxPixels must be at least 4');
  }
  if (maxEdge < 2) {
    throw new RangeError('maxEdge must be at least 2');
  }

  // Compute each constraint's scale safely without overflow.
  // sqrt(maxPixels) / sqrt(width) / sqrt(height) = sqrt(maxPixels / (width*height))
  // but avoids overflowing width*height for extreme inputs.
  var pixelScale = Math.sqrt(maxPixels) / Math.sqrt(width) / Math.sqrt(height);
  var edgeScale = maxEdge / Math.max(width, height);
  var scale = Math.min(1, edgeScale, pixelScale);

  var outWidth = Math.max(2, Math.floor(width * scale));
  var outHeight = Math.max(2, Math.floor(height * scale));

  // Reduce product to satisfy the pixel cap.  This bulk correction is
  // safe because outWidth and outHeight are integers of at least 2.
  if (outWidth > maxPixels / outHeight || outWidth * outHeight > maxPixels) {
    // When one dimension is pinned at the minimum, compute the other
    // directly from the cap to preserve as much image content as possible.
    if (outHeight === 2) {
      outWidth = Math.max(2, Math.floor(maxPixels / outHeight));
    } else if (outWidth === 2) {
      outHeight = Math.max(2, Math.floor(maxPixels / outWidth));
    } else {
      // Both dimensions above minimum — use a single multiplicative
      // sqrt correction.  Product overflow cannot happen because both
      // outWidth and outHeight are at most maxEdge (≤ 2048).
      var prod = outWidth * outHeight;
      var factor = Math.sqrt(maxPixels / prod);
      outWidth = Math.max(2, Math.floor(outWidth * factor));
      outHeight = Math.max(2, Math.floor(outHeight * factor));
    }
  }

  // Final guard: if after all corrections the product still exceeds the
  // cap (possible from rounding), reduce the larger dimension.
  if (outWidth * outHeight > maxPixels) {
    if (outWidth > outHeight) {
      outWidth = Math.max(2, Math.floor(maxPixels / outHeight));
    } else {
      outHeight = Math.max(2, Math.floor(maxPixels / outWidth));
    }
  }

  var computedScale = Math.min(outWidth / width, outHeight / height);
  return { width: outWidth, height: outHeight, scale: computedScale };
}

// ── Bilinear sampling helper (premultiplied alpha) ────────

function sampleBilinear(data, width, height, sx, sy, out) {
  // Callers pass one reusable result object; keep the hot pixel loop free of
  // per-sample arrays and neighbor objects.
  if (!out) out = { r: 0, g: 0, b: 0, a: 0 };
  var x0 = Math.floor(sx);
  var y0 = Math.floor(sy);
  var x1 = Math.min(x0 + 1, width - 1);
  var y1 = Math.min(y0 + 1, height - 1);
  var tx = sx - x0;
  var ty = sy - y0;
  var w00 = (1 - tx) * (1 - ty);
  var w10 = tx * (1 - ty);
  var w01 = (1 - tx) * ty;
  var w11 = tx * ty;

  var idx00 = (y0 * width + x0) * 4;
  var idx10 = (y0 * width + x1) * 4;
  var idx01 = (y1 * width + x0) * 4;
  var idx11 = (y1 * width + x1) * 4;
  var a00 = data[idx00 + 3] / 255;
  var a10 = data[idx10 + 3] / 255;
  var a01 = data[idx01 + 3] / 255;
  var a11 = data[idx11 + 3] / 255;
  var accumAlpha = w00 * a00 + w10 * a10 + w01 * a01 + w11 * a11;
  var accumR = w00 * a00 * data[idx00] + w10 * a10 * data[idx10] +
    w01 * a01 * data[idx01] + w11 * a11 * data[idx11];
  var accumG = w00 * a00 * data[idx00 + 1] + w10 * a10 * data[idx10 + 1] +
    w01 * a01 * data[idx01 + 1] + w11 * a11 * data[idx11 + 1];
  var accumB = w00 * a00 * data[idx00 + 2] + w10 * a10 * data[idx10 + 2] +
    w01 * a01 * data[idx01 + 2] + w11 * a11 * data[idx11 + 2];

  if (accumAlpha <= 1e-12) {
    out.r = 0; out.g = 0; out.b = 0; out.a = 0;
    return out;
  }

  out.r = Math.max(0, Math.min(255, Math.round(accumR / accumAlpha)));
  out.g = Math.max(0, Math.min(255, Math.round(accumG / accumAlpha)));
  out.b = Math.max(0, Math.min(255, Math.round(accumB / accumAlpha)));
  out.a = Math.max(0, Math.min(255, Math.round(255 * accumAlpha)));
  return out;
}

// ── resizeImageData ───────────────────────────────────────
// Bilinear resampling with premultiplied alpha, align-corners pixel-center convention.

function resizeImageData(source, outputWidth, outputHeight) {
  assertValidImageData2D(source);
  assertSafeOutputDimensions(outputWidth, outputHeight);

  var srcW = source.width;
  var srcH = source.height;
  var srcData = source.data;

  var outData = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  var sampledPixel = { r: 0, g: 0, b: 0, a: 0 };

  for (var y = 0; y < outputHeight; y++) {
    for (var x = 0; x < outputWidth; x++) {
      var sx = x * (srcW - 1) / (outputWidth - 1);
      var sy = y * (srcH - 1) / (outputHeight - 1);

      // Clamp to source bounds
      sx = Math.max(0, Math.min(srcW - 1, sx));
      sy = Math.max(0, Math.min(srcH - 1, sy));

      var pixel = sampleBilinear(srcData, srcW, srcH, sx, sy, sampledPixel);
      var outIdx = (y * outputWidth + x) * 4;
      outData[outIdx] = pixel.r;
      outData[outIdx + 1] = pixel.g;
      outData[outIdx + 2] = pixel.b;
      outData[outIdx + 3] = pixel.a;
    }
  }

  return new ImageData(outData, outputWidth, outputHeight);
}

// ── Quadrilateral validation ──────────────────────────────

function validateCornerQuad(points, width, height) {
  // Validate image dimensions
  if (typeof width !== 'number' || typeof height !== 'number' ||
      !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new TypeError('Image dimensions must be finite numbers');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new TypeError('Image dimensions must be integers');
  }
  if (width < 2 || height < 2) {
    throw new RangeError('Image dimensions must be at least 2');
  }

  // Check points array: must be exactly 4
  if (!Array.isArray(points)) {
    return { valid: false, code: 'incomplete', message: 'Need four corner points.' };
  }
  if (points.length !== 4) {
    return { valid: false, code: 'incomplete', message: 'Need exactly four corner points, got ' + points.length + '.' };
  }

  // Non-finite check
  for (var i = 0; i < 4; i++) {
    var p = points[i];
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' ||
        !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return { valid: false, code: 'non-finite', message: 'Corner coordinates must be finite numbers.' };
    }
  }

  // Out-of-bounds check
  for (var j = 0; j < 4; j++) {
    if (points[j].x < 0 || points[j].x >= width ||
        points[j].y < 0 || points[j].y >= height) {
      return { valid: false, code: 'out-of-bounds', message: 'Corner is outside the image.' };
    }
  }

  var diagonal = Math.hypot(width - 1, height - 1);
  var minDist = 0.005 * diagonal;

  // Too-close / duplicate check
  for (var m = 0; m < 4; m++) {
    for (var n = m + 1; n < 4; n++) {
      var dx = points[m].x - points[n].x;
      var dy = points[m].y - points[n].y;
      if (Math.hypot(dx, dy) < minDist) {
        return { valid: false, code: 'too-close', message: 'Two corners are too close together.' };
      }
    }
  }

  var turnEpsilon = 1e-8 * (diagonal * diagonal);
  var EPS = Math.max(turnEpsilon, 1e-12);

  // Strict orientation with epsilon tolerance; returns >0, <0, or ~0
  function orient(ox, oy, ax, ay, bx, by) {
    var v = (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
    if (Math.abs(v) <= EPS) return 0;
    return v > 0 ? 1 : -1;
  }

  // True if point c lies on the closed segment ab (assumes collinear)
  function onSegment(a, b, c) {
    return c.x >= Math.min(a.x, b.x) - EPS && c.x <= Math.max(a.x, b.x) + EPS &&
           c.y >= Math.min(a.y, b.y) - EPS && c.y <= Math.max(a.y, b.y) + EPS;
  }

  // Self-intersecting: segment(p0,p1) intersects segment(p2,p3)
  // and segment(p1,p2) intersects segment(p3,p0)
  // Treats touching non-adjacent segments as intersecting.
  function segmentsIntersect(a, b, c, d) {
    var o1 = orient(a.x, a.y, b.x, b.y, c.x, c.y);
    var o2 = orient(a.x, a.y, b.x, b.y, d.x, d.y);
    var o3 = orient(c.x, c.y, d.x, d.y, a.x, a.y);
    var o4 = orient(c.x, c.y, d.x, d.y, b.x, b.y);

    // The general crossing case requires four definite orientations. If an
    // orientation is within EPS of zero, only the explicit on-segment checks
    // below can establish a touching/collinear intersection.
    if (o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 &&
        o1 !== o2 && o3 !== o4) return true;

    // Collinear cases with on-segment check
    if (o1 === 0 && onSegment(a, b, c)) return true;
    if (o2 === 0 && onSegment(a, b, d)) return true;
    if (o3 === 0 && onSegment(c, d, a)) return true;
    if (o4 === 0 && onSegment(c, d, b)) return true;

    return false;
  }

  var p0 = points[0], p1 = points[1], p2 = points[2], p3 = points[3];

  // Check diagonal intersections
  if (segmentsIntersect(p0, p1, p2, p3)) {
    return { valid: false, code: 'self-intersecting', message: 'The polygon sides cross each other.' };
  }
  if (segmentsIntersect(p1, p2, p3, p0)) {
    return { valid: false, code: 'self-intersecting', message: 'The polygon sides cross each other.' };
  }

  // Turn direction
  var turns = [];
  var pts = [p0, p1, p2, p3];
  for (var t = 0; t < 4; t++) {
    var a = pts[(t + 0) % 4];
    var b = pts[(t + 1) % 4];
    var c = pts[(t + 2) % 4];
    var turn = cross2(b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y);
    turns.push(turn);
  }

  function cross2(ax, ay, bx, by) {
    return ax * by - ay * bx;
  }

  // Collinear check
  var anyCollinear = false;
  for (var u = 0; u < 4; u++) {
    if (Math.abs(turns[u]) <= turnEpsilon) {
      anyCollinear = true;
      break;
    }
  }
  if (anyCollinear) {
    return { valid: false, code: 'collinear', message: 'Three corners are in a straight line.' };
  }

  // Non-convex check (sign must be consistent)
  var posCount = 0;
  var negCount = 0;
  for (var v = 0; v < 4; v++) {
    if (turns[v] > 0) posCount++;
    else if (turns[v] < 0) negCount++;
  }
  if (posCount > 0 && negCount > 0) {
    return { valid: false, code: 'non-convex', message: 'Corners form a non-convex quadrilateral.' };
  }

  // Area check
  var area = shoelaceArea(points);
  var minArea = 0.005 * (width - 1) * (height - 1);
  if (area < minArea) {
    return { valid: false, code: 'too-small', message: 'The marked area is too small.' };
  }

  return { valid: true, code: 'valid', message: '' };
}

function shoelaceArea(points) {
  var sum = 0;
  for (var i = 0; i < 4; i++) {
    var j = (i + 1) % 4;
    sum += points[i].x * points[j].y;
    sum -= points[j].x * points[i].y;
  }
  return Math.abs(sum) / 2;
}

// ── Point normalization ───────────────────────────────────

function normalizePoints(points) {
  var n = points.length;
  var cx = 0, cy = 0;
  for (var i = 0; i < n; i++) {
    cx += points[i].x;
    cy += points[i].y;
  }
  cx /= n;
  cy /= n;

  var meanDist = 0;
  for (var j = 0; j < n; j++) {
    meanDist += Math.hypot(points[j].x - cx, points[j].y - cy);
  }
  meanDist /= n;

  if (meanDist <= 1e-12) {
    throw new RangeError('Points are degenerate (mean distance too small).');
  }

  var scale = Math.sqrt(2) / meanDist;

  // Normalization matrix T: [scale, 0, -scale*cx; 0, scale, -scale*cy; 0, 0, 1]
  var T = [
    scale, 0, -scale * cx,
    0, scale, -scale * cy,
    0, 0, 1
  ];

  // Inverse T
  var invScale = 1 / scale;
  var invT = [
    invScale, 0, cx,
    0, invScale, cy,
    0, 0, 1
  ];

  var normalized = [];
  for (var k = 0; k < n; k++) {
    var x = T[0] * points[k].x + T[1] * points[k].y + T[2];
    var y = T[3] * points[k].x + T[4] * points[k].y + T[5];
    normalized.push({ x: x, y: y });
  }

  return { points: normalized, T: T, invT: invT };
}

// ── Matrix helpers ────────────────────────────────────────

function matMul3(a, b) {
  var result = [];
  for (var i = 0; i < 3; i++) {
    for (var j = 0; j < 3; j++) {
      var sum = 0;
      for (var k = 0; k < 3; k++) {
        sum += a[i * 3 + k] * b[k * 3 + j];
      }
      result.push(sum);
    }
  }
  return result;
}

// ── solveHomography ────────────────────────────────────────

function solveHomography(destinationPoints, sourcePoints) {
  if (!Array.isArray(destinationPoints) || !Array.isArray(sourcePoints)) {
    throw new TypeError('Points must be arrays');
  }
  if (destinationPoints.length !== 4 || sourcePoints.length !== 4) {
    throw new TypeError('Need exactly 4 point correspondences');
  }

  // Validate all points
  for (var i = 0; i < 4; i++) {
    var dp = destinationPoints[i];
    var sp = sourcePoints[i];
    if (!dp || !sp || typeof dp.x !== 'number' || typeof dp.y !== 'number' ||
        typeof sp.x !== 'number' || typeof sp.y !== 'number' ||
        !Number.isFinite(dp.x) || !Number.isFinite(dp.y) ||
        !Number.isFinite(sp.x) || !Number.isFinite(sp.y)) {
      throw new TypeError('All points must be finite numbers');
    }
  }

  // Normalize both point sets
  var normDst, normSrc;
  try {
    normDst = normalizePoints(destinationPoints);
    normSrc = normalizePoints(sourcePoints);
  } catch (e) {
    throw new RangeError('Degenerate point configuration: ' + e.message);
  }

  var nd = normDst.points;
  var ns = normSrc.points;

  // Build 8×8 system
  var A = [];
  var b = [];
  for (var row = 0; row < 8; row++) {
    A[row] = [];
    for (var col = 0; col < 8; col++) {
      A[row][col] = 0;
    }
    b[row] = 0;
  }

  for (var corr = 0; corr < 4; corr++) {
    var x = nd[corr].x;
    var y = nd[corr].y;
    var u = ns[corr].x;
    var v = ns[corr].y;
    var row1 = corr * 2;
    var row2 = corr * 2 + 1;

    // Row 1: [x, y, 1, 0, 0, 0, -u*x, -u*y] * q = u
    A[row1][0] = x;
    A[row1][1] = y;
    A[row1][2] = 1;
    A[row1][3] = 0;
    A[row1][4] = 0;
    A[row1][5] = 0;
    A[row1][6] = -u * x;
    A[row1][7] = -u * y;
    b[row1] = u;

    // Row 2: [0, 0, 0, x, y, 1, -v*x, -v*y] * q = v
    A[row2][0] = 0;
    A[row2][1] = 0;
    A[row2][2] = 0;
    A[row2][3] = x;
    A[row2][4] = y;
    A[row2][5] = 1;
    A[row2][6] = -v * x;
    A[row2][7] = -v * y;
    b[row2] = v;
  }

  // Gaussian elimination with partial pivoting
  var n = 8;
  var maxAbsPivot = 0;
  var minAbsPivot = Infinity;

  // Forward elimination
  for (var col = 0; col < n; col++) {
    // Find pivot
    var maxVal = 0;
    var maxRow = col;
    for (var r = col; r < n; r++) {
      var absVal = Math.abs(A[r][col]);
      if (absVal > maxVal) {
        maxVal = absVal;
        maxRow = r;
      }
    }

    if (maxVal <= LINEAR_SOLVE_EPSILON) {
      throw new RangeError('Singular or ill-conditioned homography (pivot too small).');
    }

    if (maxVal > maxAbsPivot) maxAbsPivot = maxVal;
    if (maxVal < minAbsPivot) minAbsPivot = maxVal;

    // Swap rows
    if (maxRow !== col) {
      var tempRow = A[col];
      A[col] = A[maxRow];
      A[maxRow] = tempRow;
      var tempB = b[col];
      b[col] = b[maxRow];
      b[maxRow] = tempB;
    }

    // Use signed pivot value (A[col][col] after any row swap)
    var pivot = A[col][col];

    // Eliminate below
    for (var r2 = col + 1; r2 < n; r2++) {
      var factor = A[r2][col] / pivot;
      for (var c = col; c < n; c++) {
        A[r2][c] -= factor * A[col][c];
      }
      b[r2] -= factor * b[col];
    }
  }

  if (minAbsPivot / maxAbsPivot <= LINEAR_SOLVE_EPSILON) {
    throw new RangeError('Ill-conditioned homography (pivot ratio too small).');
  }

  // Back substitution
  var q = [];
  for (var i = n - 1; i >= 0; i--) {
    var sum = b[i];
    for (var j = i + 1; j < n; j++) {
      sum -= A[i][j] * q[j];
    }
    q[i] = sum / A[i][i];
    if (!Number.isFinite(q[i])) {
      throw new RangeError('Non-finite value during back-substitution.');
    }
  }

  // Construct normalized homography
  var Hn = [
    q[0], q[1], q[2],
    q[3], q[4], q[5],
    q[6], q[7], 1
  ];

  // Denormalize: H = inv(Ts) * Hn * Td
  // Where Ts and Td are the normalization matrices for source and destination
  var Htemp = matMul3(normSrc.invT, Hn);
  var H = matMul3(Htemp, normDst.T);

  // Divide by largest absolute coefficient
  var maxAbs = 0;
  for (var m = 0; m < 9; m++) {
    var absVal = Math.abs(H[m]);
    if (absVal > maxAbs) maxAbs = absVal;
  }
  if (maxAbs === 0 || !Number.isFinite(maxAbs)) {
    throw new RangeError('All-zero or non-finite homography coefficients.');
  }

  for (var m2 = 0; m2 < 9; m2++) {
    H[m2] /= maxAbs;
  }

  // Consistent sign: if H[8] < 0, negate
  if (H[8] < 0) {
    for (var m3 = 0; m3 < 9; m3++) {
      H[m3] = -H[m3];
    }
  }

  // Verify corner mapping
  var sourceDiagonal = sourceDiagonalLength(sourcePoints);
  var maxError = 1e-6 * Math.max(1, sourceDiagonal);

  for (var check = 0; check < 4; check++) {
    var mapped = mapHomographyPoint(H, destinationPoints[check].x, destinationPoints[check].y);
    if (mapped === null) {
      throw new RangeError('Destination corner ' + check + ' maps to null.');
    }
    var err = Math.hypot(mapped.x - sourcePoints[check].x, mapped.y - sourcePoints[check].y);
    if (err > maxError) {
      throw new RangeError('Corner mapping error ' + err + ' exceeds tolerance ' + maxError);
    }
  }

  return H;
}

function sourceDiagonalLength(points) {
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < points.length; i++) {
    if (points[i].x < minX) minX = points[i].x;
    if (points[i].x > maxX) maxX = points[i].x;
    if (points[i].y < minY) minY = points[i].y;
    if (points[i].y > maxY) maxY = points[i].y;
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

// ── mapHomographyPoint ────────────────────────────────────

function mapHomographyPoint(H, x, y) {
  if (!H || H.length !== 9 || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError('Invalid homography or point.');
  }
  for (var i = 0; i < 9; i++) {
    if (!Number.isFinite(H[i])) throw new TypeError('Invalid homography.');
  }

  var denominator = H[6] * x + H[7] * y + H[8];
  var denominatorScale = Math.abs(H[6] * x) +
    Math.abs(H[7] * y) + Math.abs(H[8]);

  if (!Number.isFinite(denominator) ||
      !Number.isFinite(denominatorScale) || denominatorScale === 0 ||
      Math.abs(denominator) <= 1e-12 * denominatorScale) {
    return null;
  }

  var mappedX = (H[0] * x + H[1] * y + H[2]) / denominator;
  var mappedY = (H[3] * x + H[4] * y + H[5]) / denominator;

  return Number.isFinite(mappedX) && Number.isFinite(mappedY)
    ? { x: mappedX, y: mappedY }
    : null;
}

// ── warpPerspective ────────────────────────────────────────

function warpPerspective(source, sourceCorners, outputWidth, outputHeight) {
  assertValidImageData2D(source);
  assertSafeOutputDimensions(outputWidth, outputHeight);
  if (!Array.isArray(sourceCorners) || sourceCorners.length !== 4) {
    throw new TypeError('sourceCorners must be an array of 4 points');
  }

  // Validate corners: check for non-finite or missing point fields first
  // (TypeError for malformed input), then geometric validation (RangeError
  // for invalid geometry).
  for (var ci = 0; ci < sourceCorners.length; ci++) {
    var cp = sourceCorners[ci];
    if (!cp || typeof cp.x !== 'number' || typeof cp.y !== 'number' ||
        !Number.isFinite(cp.x) || !Number.isFinite(cp.y)) {
      throw new TypeError('All source corners must have finite coordinates');
    }
  }
  var validation = validateCornerQuad(sourceCorners, source.width, source.height);
  if (!validation.valid) {
    throw new RangeError('Invalid source corners: ' + validation.message);
  }

  // Destination corners in pixel-center convention
  var dstW = outputWidth;
  var dstH = outputHeight;
  var dstCorners = [
    { x: 0, y: 0 },
    { x: dstW - 1, y: 0 },
    { x: dstW - 1, y: dstH - 1 },
    { x: 0, y: dstH - 1 }
  ];

  // Solve homography: destination → source
  var H;
  try {
    H = solveHomography(dstCorners, sourceCorners);
  } catch (e) {
    throw new RangeError('Failed to compute homography for warp: ' + e.message);
  }

  var srcW = source.width;
  var srcH = source.height;
  var srcData = source.data;
  var outData = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  var sampledPixel = { r: 0, g: 0, b: 0, a: 0 };
  // Hoist validated coefficients out of the hot raster loop. Keep
  // mapHomographyPoint as the public/tested helper, but avoid its validation
  // and mapped-point allocation for every destination pixel.
  var h00 = H[0], h01 = H[1], h02 = H[2];
  var h10 = H[3], h11 = H[4], h12 = H[5];
  var h20 = H[6], h21 = H[7], h22 = H[8];

  for (var y = 0; y < dstH; y++) {
    for (var x = 0; x < dstW; x++) {
      var denominator = h20 * x + h21 * y + h22;
      var denominatorScale = Math.abs(h20 * x) + Math.abs(h21 * y) + Math.abs(h22);
      var outIdx = (y * dstW + x) * 4;
      if (!Number.isFinite(denominator) ||
          !Number.isFinite(denominatorScale) || denominatorScale === 0 ||
          Math.abs(denominator) <= 1e-12 * denominatorScale) {
        outData[outIdx] = 0;
        outData[outIdx + 1] = 0;
        outData[outIdx + 2] = 0;
        outData[outIdx + 3] = 0;
        continue;
      }

      var sx = (h00 * x + h01 * y + h02) / denominator;
      var sy = (h10 * x + h11 * y + h12) / denominator;
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
        outData[outIdx] = 0;
        outData[outIdx + 1] = 0;
        outData[outIdx + 2] = 0;
        outData[outIdx + 3] = 0;
        continue;
      }

      // Check boundary epsilon
      if (sx < -BOUNDARY_EPSILON || sx > srcW - 1 + BOUNDARY_EPSILON ||
          sy < -BOUNDARY_EPSILON || sy > srcH - 1 + BOUNDARY_EPSILON) {
        // Transparent
        outData[outIdx] = 0;
        outData[outIdx + 1] = 0;
        outData[outIdx + 2] = 0;
        outData[outIdx + 3] = 0;
        continue;
      }

      // Clamp to source bounds
      sx = Math.max(0, Math.min(srcW - 1, sx));
      sy = Math.max(0, Math.min(srcH - 1, sy));

      var pixel = sampleBilinear(srcData, srcW, srcH, sx, sy, sampledPixel);
      outData[outIdx] = pixel.r;
      outData[outIdx + 1] = pixel.g;
      outData[outIdx + 2] = pixel.b;
      outData[outIdx + 3] = pixel.a;
    }
  }

  return new ImageData(outData, outputWidth, outputHeight);
}

// ── Exports ────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeWorkingSize: computeWorkingSize,
    resizeImageData: resizeImageData,
    validateCornerQuad: validateCornerQuad,
    solveHomography: solveHomography,
    mapHomographyPoint: mapHomographyPoint,
    warpPerspective: warpPerspective
  };
}

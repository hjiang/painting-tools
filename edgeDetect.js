// edgeDetect.js
// Canny edge detection pipeline — generates a clean line sketch.
//
// detectEdges(imageData, options) → ImageData
//   imageData         : ImageData (RGBA) at original resolution
//   options.threshold : number (0–255), high threshold for hysteresis (default 50)
//   options.blur      : number (0–5), Gaussian sigma for pre-smoothing (default 2.0)
//   options.invert    : boolean, swap edge/background colors (default false)
//
// Pipeline:
//   1. Convert to grayscale (Rec. 601 luminance)
//   2. Gaussian blur (separable 1D convolution)
//   3. Sobel operator → gradient magnitude + quantized direction
//   4. Non-maximum suppression (thin edges to 1 px)
//   5. Double-threshold hysteresis (connectivity filtering)
//   6. Render edge pixels in chosen color scheme

/**
 * Generate a 1D Gaussian kernel.
 * @param {number} sigma - Standard deviation (sigma <= 0 returns identity [1]).
 * @returns {Float64Array} Normalized 1D kernel.
 */
function gaussianKernel1D(sigma) {
  if (sigma <= 0) {
    return new Float64Array([1.0]);
  }
  var size = 2 * Math.ceil(3 * sigma) + 1;
  // Clamp size to keep interactive performance reasonable
  if (size > 31) size = 31;
  var half = Math.floor(size / 2);
  var kernel = new Float64Array(size);
  var sum = 0;
  var denom = 2 * sigma * sigma;
  for (var i = 0; i < size; i++) {
    var x = i - half;
    var val = Math.exp(-(x * x) / denom);
    kernel[i] = val;
    sum += val;
  }
  // Normalize
  for (var j = 0; j < size; j++) {
    kernel[j] /= sum;
  }
  return kernel;
}

/**
 * Apply separable Gaussian blur to a grayscale image.
 * @param {Uint8Array} gray - Grayscale pixel values (length = width * height).
 * @param {number} width
 * @param {number} height
 * @param {number} sigma - Gaussian sigma (0 = skip).
 * @returns {Uint8Array} Blurred grayscale values.
 */
function gaussianBlur(gray, width, height, sigma) {
  if (sigma <= 0 || width < 2 || height < 2) {
    return gray;
  }
  var kernel = gaussianKernel1D(sigma);
  var kSize = kernel.length;
  var half = Math.floor(kSize / 2);

  // Temp buffer for horizontal pass
  var temp = new Float32Array(width * height);

  // Horizontal pass: convolve each row
  for (var y = 0; y < height; y++) {
    var rowOff = y * width;
    for (var x = 0; x < width; x++) {
      var sum = 0;
      for (var ki = 0; ki < kSize; ki++) {
        var srcX = x + ki - half;
        if (srcX < 0) srcX = 0;
        else if (srcX >= width) srcX = width - 1;
        sum += kernel[ki] * gray[rowOff + srcX];
      }
      temp[rowOff + x] = sum;
    }
  }

  // Vertical pass: convolve each column, output to new buffer
  var result = new Uint8Array(width * height);
  for (var x = 0; x < width; x++) {
    for (var y = 0; y < height; y++) {
      var sum = 0;
      for (var ki = 0; ki < kSize; ki++) {
        var srcY = y + ki - half;
        if (srcY < 0) srcY = 0;
        else if (srcY >= height) srcY = height - 1;
        sum += kernel[ki] * temp[srcY * width + x];
      }
      var val = Math.round(sum);
      if (val < 0) val = 0;
      else if (val > 255) val = 255;
      result[y * width + x] = val;
    }
  }

  return result;
}

/**
 * Apply Sobel operator to compute gradient magnitude and quantized direction.
 * @param {Uint8Array} gray - Grayscale pixel values.
 * @param {number} width
 * @param {number} height
 * @returns {{ magnitude: Uint8Array, direction: Uint8Array }}
 *   magnitude: 0–255 (clamped)
 *   direction: 8-sector encoding (0–7), representing the gradient vector direction:
 *     0: → (0°),   1: ↘ (45°),  2: ↓ (90°),  3: ↙ (135°),
 *     4: ← (180°), 5: ↖ (225°), 6: ↑ (270°), 7: ↗ (315°)
 */
function sobelGradient(gray, width, height) {
  var magnitude = new Uint8Array(width * height);
  var direction = new Uint8Array(width * height);

  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var idx = y * width + x;

      // Border pixels → zero gradient
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        magnitude[idx] = 0;
        direction[idx] = 0;
        continue;
      }

      // 3×3 neighborhood
      var tl = gray[(y - 1) * width + (x - 1)];
      var tc = gray[(y - 1) * width + x];
      var tr = gray[(y - 1) * width + (x + 1)];
      var ml = gray[y * width + (x - 1)];
      var mr = gray[y * width + (x + 1)];
      var bl = gray[(y + 1) * width + (x - 1)];
      var bc = gray[(y + 1) * width + x];
      var br = gray[(y + 1) * width + (x + 1)];

      var gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      var gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

      var mag = Math.sqrt(gx * gx + gy * gy);
      magnitude[idx] = mag > 255 ? 255 : Math.round(mag);

      // Quantize gradient direction to 8 sectors (supports sign)
      if (gx === 0 && gy === 0) {
        direction[idx] = 0;
      } else {
        var angle = Math.atan2(gy, gx); // [-π, π]
        var d8 = Math.round(angle / (Math.PI / 4)) & 7;
        direction[idx] = d8;
      }
    }
  }

  return { magnitude: magnitude, direction: direction };
}

/**
 * Apply non-maximum suppression to thin edges to single-pixel width.
 *
 * For each pixel, compares its magnitude with two neighbors:
 * the "ahead" neighbor (in the gradient direction) and the "behind"
 * neighbor (opposite direction). Keeps only if it is strictly greater
 * than the ahead neighbor and greater-or-equal to the behind neighbor.
 * The tiebreaker ensures consistent single-pixel thinning.
 *
 * @param {Uint8Array} magnitude - Gradient magnitude (0–255).
 * @param {Uint8Array} direction - 8-sector quantized gradient direction (0–7).
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} Suppressed magnitude (0 where non-maximum).
 */
function nonMaxSuppression(magnitude, direction, width, height) {
  var out = new Uint8Array(width * height);

  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var idx = y * width + x;
      var d = direction[idx];
      var m = magnitude[idx];

      // Border pixels can't have both neighbors → suppress
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        out[idx] = 0;
        continue;
      }

      var nx1, ny1, nx2, ny2;
      switch (d) {
        case 0: // → — ahead is right, behind is left
          nx1 = x + 1; ny1 = y;
          nx2 = x - 1; ny2 = y;
          break;
        case 1: // ↘ — ahead is bottom-right, behind is top-left
          nx1 = x + 1; ny1 = y + 1;
          nx2 = x - 1; ny2 = y - 1;
          break;
        case 2: // ↓ — ahead is bottom, behind is top
          nx1 = x; ny1 = y + 1;
          nx2 = x; ny2 = y - 1;
          break;
        case 3: // ↙ — ahead is bottom-left, behind is top-right
          nx1 = x - 1; ny1 = y + 1;
          nx2 = x + 1; ny2 = y - 1;
          break;
        case 4: // ← — ahead is left, behind is right
          nx1 = x - 1; ny1 = y;
          nx2 = x + 1; ny2 = y;
          break;
        case 5: // ↖ — ahead is top-left, behind is bottom-right
          nx1 = x - 1; ny1 = y - 1;
          nx2 = x + 1; ny2 = y + 1;
          break;
        case 6: // ↑ — ahead is top, behind is bottom
          nx1 = x; ny1 = y - 1;
          nx2 = x; ny2 = y + 1;
          break;
        case 7: // ↗ — ahead is top-right, behind is bottom-left
          nx1 = x + 1; ny1 = y - 1;
          nx2 = x - 1; ny2 = y + 1;
          break;
        default:
          nx1 = x + 1; ny1 = y;
          nx2 = x - 1; ny2 = y;
      }

      var n1 = magnitude[ny1 * width + nx1]; // ahead
      var n2 = magnitude[ny2 * width + nx2]; // behind

      // Strict on ahead to break ties on symmetric step edges;
      // permissive on behind to avoid gaps on plateaus.
      if (m > n1 && m >= n2) {
        out[idx] = m;
      } else {
        out[idx] = 0;
      }
    }
  }

  return out;
}

/**
 * Apply hysteresis thresholding with edge connectivity.
 *
 * Strong edges (> highThreshold) are always kept. Weak edges
 * (> lowThreshold, ≤ highThreshold) are kept only if 8-connected
 * to a strong edge pixel. Everything else is suppressed.
 *
 * @param {Uint8Array} nms - NMS-suppressed magnitudes (0–255).
 * @param {number} width
 * @param {number} height
 * @param {number} lowThreshold - Lower threshold (0–255).
 * @param {number} highThreshold - Higher threshold (0–255).
 * @returns {Uint8ClampedArray} Binary edge map (255 = edge, 0 = non-edge).
 */
function hysteresis(nms, width, height, lowThreshold, highThreshold) {
  var total = width * height;
  // Edge map: 0 = non-edge, 1 = weak, 2 = strong
  var edgeMap = new Uint8Array(total);
  var queue = [];
  var qHead = 0;

  // First pass: classify pixels
  for (var i = 0; i < total; i++) {
    var v = nms[i];
    if (v > highThreshold) {
      edgeMap[i] = 2;
      queue.push(i);
    } else if (v > lowThreshold) {
      edgeMap[i] = 1;
    }
  }

  // BFS: promote weak pixels connected to strong pixels
  var w = width;
  while (qHead < queue.length) {
    var p = queue[qHead++];
    var px = p % w;
    var py = Math.floor(p / w);

    // Check all 8 neighbors
    for (var dy = -1; dy <= 1; dy++) {
      var ny = py + dy;
      if (ny < 0 || ny >= height) continue;
      for (var dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        var nx = px + dx;
        if (nx < 0 || nx >= w) continue;
        var np = ny * w + nx;
        if (edgeMap[np] === 1) {
          edgeMap[np] = 2;
          queue.push(np);
        }
      }
    }
  }

  // Convert to binary output
  var out = new Uint8ClampedArray(total);
  for (var j = 0; j < total; j++) {
    out[j] = edgeMap[j] === 2 ? 255 : 0;
  }

  return out;
}

/**
 * Full Canny edge detection pipeline.
 *
 * @param {ImageData} imageData - Source image pixels (RGBA).
 * @param {{ threshold?: number, blur?: number, invert?: boolean }} [options]
 * @returns {ImageData} Edge-detected sketch image.
 */
function detectEdges(imageData, options) {
  var threshold = (options && options.threshold != null) ? options.threshold : 50;
  var blur = (options && options.blur != null) ? options.blur : 2.0;
  var invert = !!(options && options.invert);

  var lowThreshold = Math.max(5, Math.round(threshold * 0.4));
  var highThreshold = threshold;

  var data = imageData.data;
  var width = imageData.width;
  var height = imageData.height;
  var out = new Uint8ClampedArray(data.length);

  // Edge and background colors
  var edgeR, edgeG, edgeB, bgR, bgG, bgB;
  if (invert) {
    edgeR = 240; edgeG = 240; edgeB = 240;
    bgR = 30; bgG = 30; bgB = 30;
  } else {
    edgeR = 30; edgeG = 30; edgeB = 30;
    bgR = 240; bgG = 240; bgB = 240;
  }

  // Step 1: Convert to grayscale (Rec. 601)
  var total = width * height;
  var gray = new Uint8Array(total);
  for (var i = 0; i < data.length; i += 4) {
    var r = data[i];
    var g = data[i + 1];
    var b = data[i + 2];
    gray[i >>> 2] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // Step 2: Gaussian blur
  var blurred = gaussianBlur(gray, width, height, blur);

  // Step 3: Sobel gradient
  var grad = sobelGradient(blurred, width, height);

  // Step 4: Non-maximum suppression
  var nms = nonMaxSuppression(grad.magnitude, grad.direction, width, height);

  // Step 5: Hysteresis thresholding
  var edgeMap = hysteresis(nms, width, height, lowThreshold, highThreshold);

  // Step 6: Render output
  for (var j = 0; j < total; j++) {
    var outIdx = j * 4;
    if (edgeMap[j] === 255) {
      out[outIdx] = edgeR;
      out[outIdx + 1] = edgeG;
      out[outIdx + 2] = edgeB;
    } else {
      out[outIdx] = bgR;
      out[outIdx + 1] = bgG;
      out[outIdx + 2] = bgB;
    }
    out[outIdx + 3] = data[outIdx + 3]; // preserve alpha
  }

  return new ImageData(out, width, height);
}

// ── Exports ───────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectEdges: detectEdges,
    gaussianKernel1D: gaussianKernel1D,
    gaussianBlur: gaussianBlur,
    sobelGradient: sobelGradient,
    nonMaxSuppression: nonMaxSuppression,
    hysteresis: hysteresis
  };
}

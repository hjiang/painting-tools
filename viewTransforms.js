// viewTransforms.js
// Pure functions for the View tool: flip, grayscale, and box blur.
//
// flipHorizontal(imageData) → ImageData
// toGrayscale(imageData) → ImageData
// boxBlur(imageData, radius, iterations) → ImageData

/**
 * Flip an image horizontally (mirror).
 * Creates a new ImageData with columns reversed. Does not mutate input.
 *
 * @param {ImageData} imageData
 * @returns {ImageData}
 */
function flipHorizontal(imageData) {
  var data = imageData.data;
  var w = imageData.width;
  var h = imageData.height;
  var out = new Uint8ClampedArray(data.length);

  for (var y = 0; y < h; y++) {
    var rowStart = y * w * 4;
    for (var x = 0; x < w; x++) {
      var srcIdx = rowStart + x * 4;
      var dstIdx = rowStart + (w - 1 - x) * 4;
      out[dstIdx]     = data[srcIdx];
      out[dstIdx + 1] = data[srcIdx + 1];
      out[dstIdx + 2] = data[srcIdx + 2];
      out[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  return new ImageData(out, w, h);
}

/**
 * Convert an image to grayscale using Rec. 601 luminance weights.
 * Alpha is preserved. Does not mutate input.
 *
 * L = 0.299*R + 0.587*G + 0.114*B, Math.round applied.
 *
 * @param {ImageData} imageData
 * @returns {ImageData}
 */
function toGrayscale(imageData) {
  var data = imageData.data;
  var len = data.length;
  var out = new Uint8ClampedArray(len);

  for (var i = 0; i < len; i += 4) {
    var r = data[i];
    var g = data[i + 1];
    var b = data[i + 2];
    var lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    out[i]     = lum;
    out[i + 1] = lum;
    out[i + 2] = lum;
    out[i + 3] = data[i + 3];
  }

  return new ImageData(out, imageData.width, imageData.height);
}

/**
 * Apply a separable sliding-window box blur.
 *
 * Edge handling: the window shrinks at borders. For index i, samples span
 * [max(0, i-r), min(n-1, i+r)] and the average divides by the in-bounds
 * count. No darkened edges — a uniform image stays exact at any radius.
 *
 * No intermediate rounding: the horizontal pass stores per-channel floats;
 * rounding only happens when writing the final Uint8ClampedArray.
 *
 * @param {ImageData} imageData - Source image.
 * @param {number} radius - Blur radius (0 = identity).
 * @param {number} [iterations] - Number of box-blur passes (default 2).
 * @returns {ImageData}
 */
function boxBlur(imageData, radius, iterations) {
  if (iterations === undefined) iterations = 2;
  if (radius <= 0) {
    // Return a copy (not the same reference)
    var copy = new Uint8ClampedArray(imageData.data.length);
    copy.set(imageData.data);
    return new ImageData(copy, imageData.width, imageData.height);
  }

  var w = imageData.width;
  var h = imageData.height;
  var srcData = imageData.data;
  var floatBuffer = new Float64Array(srcData.length);

  // Copy source into float buffer (for the first pass)
  for (var i = 0; i < srcData.length; i++) {
    floatBuffer[i] = srcData[i];
  }

  // Temporary buffer for intermediate results between passes
  var tmpBuffer = new Float64Array(srcData.length);

  function blurPassHoriz(src, dst, w, h, r) {
    for (var y = 0; y < h; y++) {
      var rowOffset = y * w * 4;
      // Process each channel separately
      for (var ch = 0; ch < 3; ch++) {
        var sum = 0;
        var count = 0;
        // Initial window [0, r] for column 0
        for (var k = 0; k <= r && k < w; k++) {
          sum += src[rowOffset + k * 4 + ch];
          count++;
        }
        // Write column 0
        dst[rowOffset + ch] = sum / count;
        // Slide across remaining columns
        for (var x = 1; x < w; x++) {
          var lo = x - r;
          var hi = x + r;
          // Remove leaving pixel
          if (lo - 1 >= 0) {
            sum -= src[rowOffset + (lo - 1) * 4 + ch];
            count--;
          }
          // Add entering pixel
          if (hi < w) {
            sum += src[rowOffset + hi * 4 + ch];
            count++;
          }
          dst[rowOffset + x * 4 + ch] = sum / count;
        }
      }
      // Copy alpha unchanged
      for (var x2 = 0; x2 < w; x2++) {
        dst[rowOffset + x2 * 4 + 3] = src[rowOffset + x2 * 4 + 3];
      }
    }
  }

  function blurPassVert(src, dst, w, h, r) {
    for (var x = 0; x < w; x++) {
      for (var ch = 0; ch < 3; ch++) {
        var sum = 0;
        var count = 0;
        // Initial window [0, r] for row 0
        for (var k = 0; k <= r && k < h; k++) {
          sum += src[(k * w + x) * 4 + ch];
          count++;
        }
        // Write row 0
        dst[x * 4 + ch] = sum / count;
        // Slide
        for (var y = 1; y < h; y++) {
          var lo = y - r;
          var hi = y + r;
          if (lo - 1 >= 0) {
            sum -= src[((lo - 1) * w + x) * 4 + ch];
            count--;
          }
          if (hi < h) {
            sum += src[(hi * w + x) * 4 + ch];
            count++;
          }
          dst[(y * w + x) * 4 + ch] = sum / count;
        }
      }
      // Copy alpha
      for (var y2 = 0; y2 < h; y2++) {
        dst[(y2 * w + x) * 4 + 3] = src[(y2 * w + x) * 4 + 3];
      }
    }
  }

  // Iterate: horizontal → vertical, swap buffers
  var a = floatBuffer;
  var b = tmpBuffer;
  for (var iter = 0; iter < iterations; iter++) {
    blurPassHoriz(a, b, w, h, radius);
    blurPassVert(b, a, w, h, radius);
    // After each full iteration, a contains the result (floats)
    // Swap: next iteration reads from a, writes to b → then vert writes back to a
    // After the loop, a contains the result.
    // But note: blurPassHoriz writes to b, blurPassVert writes to a.
    // So a is always the result after one full iteration.
  }

  // Convert floats to uint8, rounding
  var out = new Uint8ClampedArray(srcData.length);
  for (var j = 0; j < srcData.length; j++) {
    out[j] = Math.round(a[j]);
  }

  return new ImageData(out, w, h);
}

// ── Exports ───────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    flipHorizontal: flipHorizontal,
    toGrayscale: toGrayscale,
    boxBlur: boxBlur
  };
}

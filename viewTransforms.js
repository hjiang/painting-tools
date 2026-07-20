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
  radius = Math.max(0, Math.round(radius)) || 0;
  iterations = Math.max(1, Math.round(iterations)) || 1;
  if (radius <= 0) {
    // Return a copy (not the same reference)
    var copy = new Uint8ClampedArray(imageData.data.length);
    copy.set(imageData.data);
    return new ImageData(copy, imageData.width, imageData.height);
  }

  var w = imageData.width;
  var h = imageData.height;
  var srcData = imageData.data;
  var pixelCount = w * h;

  // Extract alpha — blur operates on RGB only, reducing scratch memory by 25%
  var alpha = new Uint8ClampedArray(pixelCount);
  for (var ai = 0; ai < pixelCount; ai++) {
    alpha[ai] = srcData[ai * 4 + 3];
  }

  // Float buffers for RGB only (3 floats/pixel instead of 4)
  var floatLen = pixelCount * 3;
  var floatBuffer = new Float32Array(floatLen);
  for (var pi = 0; pi < pixelCount; pi++) {
    var srcOff = pi * 4;
    var dstOff = pi * 3;
    floatBuffer[dstOff] = srcData[srcOff];
    floatBuffer[dstOff + 1] = srcData[srcOff + 1];
    floatBuffer[dstOff + 2] = srcData[srcOff + 2];
  }
  var tmpBuffer = new Float32Array(floatLen);

  var STRIDE = 3;

  function blurPassHoriz(src, dst, w, h, r) {
    for (var y = 0; y < h; y++) {
      var rowOffset = y * w * STRIDE;
      for (var ch = 0; ch < 3; ch++) {
        var sum = 0;
        var count = 0;
        for (var k = 0; k <= r && k < w; k++) {
          sum += src[rowOffset + k * STRIDE + ch];
          count++;
        }
        dst[rowOffset + ch] = sum / count;
        for (var x = 1; x < w; x++) {
          var lo = x - r;
          var hi = x + r;
          if (lo - 1 >= 0) {
            sum -= src[rowOffset + (lo - 1) * STRIDE + ch];
            count--;
          }
          if (hi < w) {
            sum += src[rowOffset + hi * STRIDE + ch];
            count++;
          }
          dst[rowOffset + x * STRIDE + ch] = sum / count;
        }
      }
    }
  }

  function blurPassVert(src, dst, w, h, r) {
    for (var x = 0; x < w; x++) {
      for (var ch = 0; ch < 3; ch++) {
        var sum = 0;
        var count = 0;
        for (var k = 0; k <= r && k < h; k++) {
          sum += src[(k * w + x) * STRIDE + ch];
          count++;
        }
        dst[x * STRIDE + ch] = sum / count;
        for (var y = 1; y < h; y++) {
          var lo = y - r;
          var hi = y + r;
          if (lo - 1 >= 0) {
            sum -= src[((lo - 1) * w + x) * STRIDE + ch];
            count--;
          }
          if (hi < h) {
            sum += src[(hi * w + x) * STRIDE + ch];
            count++;
          }
          dst[(y * w + x) * STRIDE + ch] = sum / count;
        }
      }
    }
  }

  var a = floatBuffer;
  var b = tmpBuffer;
  for (var iter = 0; iter < iterations; iter++) {
    blurPassHoriz(a, b, w, h, radius);
    blurPassVert(b, a, w, h, radius);
  }

  // Recombine blurred RGB with original alpha
  var out = new Uint8ClampedArray(srcData.length);
  for (var pi2 = 0; pi2 < pixelCount; pi2++) {
    var outOff = pi2 * 4;
    var floatOff = pi2 * 3;
    out[outOff] = Math.round(a[floatOff]);
    out[outOff + 1] = Math.round(a[floatOff + 1]);
    out[outOff + 2] = Math.round(a[floatOff + 2]);
    out[outOff + 3] = alpha[pi2];
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

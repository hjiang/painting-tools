// edgeDetect.js
// Pure function for Sobel edge detection — generates a rough line sketch.
//
// detectEdges(imageData, options) → ImageData
//   imageData        : ImageData (RGBA) at original resolution
//   options.threshold: number (0–255), gradient magnitude cutoff (default 50)
//   options.invert   : boolean, swap edge/background colors (default false)
//
// Algorithm:
//   1. Convert to grayscale via Rec. 601 luminance
//   2. Apply 3×3 Sobel operator to compute gradient magnitude
//   3. Threshold: mag > threshold → edge pixel, else → background
//   4. Render dark edges (#1e1e1e) on light background (#f0f0f0)

/**
 * Detect edges using the Sobel operator and render a sketch.
 *
 * @param {ImageData} imageData - Source image pixels (RGBA).
 * @param {{ threshold?: number, invert?: boolean }} [options]
 * @returns {ImageData} Edge-detected sketch image.
 */
function detectEdges(imageData, options) {
  const threshold = (options && options.threshold != null) ? options.threshold : 50;
  const invert = !!(options && options.invert);
  const { data, width, height } = imageData;
  const out = new Uint8ClampedArray(data.length);

  // Edge and background colors
  var edgeR, edgeG, edgeB, bgR, bgG, bgB;
  if (invert) {
    // White lines on dark background
    edgeR = 240; edgeG = 240; edgeB = 240;
    bgR = 30; bgG = 30; bgB = 30;
  } else {
    // Dark lines on light background (pencil sketch)
    edgeR = 30; edgeG = 30; edgeB = 30;
    bgR = 240; bgG = 240; bgB = 240;
  }

  // Step 1: Compute grayscale luminance values for all pixels.
  // Use Rec. 601 weights, matching posterize.js convention.
  var gray = new Uint8Array(width * height);
  for (var i = 0; i < data.length; i += 4) {
    var r = data[i];
    var g = data[i + 1];
    var b = data[i + 2];
    gray[i >>> 2] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // Step 2: Apply Sobel operator and threshold.
  // Border pixels (first/last row, first/last column) are set to background
  // because they lack a full 3×3 neighborhood.
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var idx = (y * width + x) * 4;

      // Border pixels → background
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        out[idx] = bgR;
        out[idx + 1] = bgG;
        out[idx + 2] = bgB;
        out[idx + 3] = data[idx + 3];
        continue;
      }

      // Get 3×3 neighborhood grayscale values
      var tl = gray[(y - 1) * width + (x - 1)];
      var tc = gray[(y - 1) * width + x];
      var tr = gray[(y - 1) * width + (x + 1)];
      var ml = gray[y * width + (x - 1)];
      var mc = gray[y * width + x];
      var mr = gray[y * width + (x + 1)];
      var bl = gray[(y + 1) * width + (x - 1)];
      var bc = gray[(y + 1) * width + x];
      var br = gray[(y + 1) * width + (x + 1)];

      // Sobel kernels
      // Gx = [[-1,0,1],[-2,0,2],[-1,0,1]]
      // Gy = [[-1,-2,-1],[0,0,0],[1,2,1]]
      var gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      var gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

      var magnitude = Math.min(255, Math.sqrt(gx * gx + gy * gy));

      // Apply threshold
      if (magnitude > threshold) {
        out[idx] = edgeR;
        out[idx + 1] = edgeG;
        out[idx + 2] = edgeB;
      } else {
        out[idx] = bgR;
        out[idx + 1] = bgG;
        out[idx + 2] = bgB;
      }
      out[idx + 3] = data[idx + 3];
    }
  }

  return new ImageData(out, width, height);
}

// ── Exports ───────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { detectEdges };
}

// crop.js
// Pure functions for the Crop tool.
// All rects are { x, y, w, h } in image pixels.
// Dual-mode export: global for browser, module.exports for Node tests.

'use strict';

/**
 * Compute the centered maximal rectangle of a given aspect that fits inside
 * the image dimensions.
 *
 * Precondition: imgW > 0, imgH > 0, aspectW > 0, aspectH > 0.
 * Postcondition: w/h ≈ aspectW/aspectH within integer rounding;
 *                rect is centered inside bounds.
 *
 * @param {number} imgW    — image width in pixels
 * @param {number} imgH    — image height in pixels
 * @param {number} aspectW — aspect ratio numerator (e.g. 4 for 4:5)
 * @param {number} aspectH — aspect ratio denominator (e.g. 5 for 4:5)
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
function largestRectForAspect(imgW, imgH, aspectW, aspectH) {
  // Determine which dimension constrains the rect
  var wFromH = imgH * aspectW / aspectH;  // width if height is the constraint
  var hFromW = imgW * aspectH / aspectW;  // height if width is the constraint

  var w, h;
  if (wFromH <= imgW) {
    // Height is the constraining dimension
    h = imgH;
    w = Math.round(wFromH);
  } else {
    // Width is the constraining dimension
    w = imgW;
    h = Math.round(hFromW);
  }

  // Center the rect
  var x = Math.round((imgW - w) / 2);
  var y = Math.round((imgH - h) / 2);

  return { x: x, y: y, w: w, h: h };
}

/**
 * Clamp a rect so it stays within image bounds and meets minimum size.
 * Enforces: 0 ≤ x, 0 ≤ y, x + w ≤ imgW, y + h ≤ imgH, w ≥ minSize, h ≥ minSize.
 *
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {number} imgW   — image width in pixels
 * @param {number} imgH   — image height in pixels
 * @param {number} minSize — minimum allowed width and height (default 32)
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
function clampRect(rect, imgW, imgH, minSize) {
  minSize = minSize || 32;

  var x = rect.x;
  var y = rect.y;
  var w = rect.w;
  var h = rect.h;

  // Enforce minimum size first
  if (w < minSize) {
    // Adjust width, possibly pushing x left if anchored at right edge
    if (x + minSize > imgW) {
      x = imgW - minSize;
    }
    w = minSize;
  }
  if (h < minSize) {
    if (y + minSize > imgH) {
      y = imgH - minSize;
    }
    h = minSize;
  }

  // Clamp position — cannot be negative
  if (x < 0) {
    x = 0;
    // Re-check width after repositioning
    if (w > imgW) w = imgW;
  }
  if (y < 0) {
    y = 0;
    if (h > imgH) h = imgH;
  }

  // Clamp right/bottom edges
  if (x + w > imgW) {
    x = imgW - w;
  }
  if (y + h > imgH) {
    y = imgH - h;
  }

  // Final guard: if after all adjustments x is still negative, shrink width
  if (x < 0) {
    w = imgW;
    x = 0;
  }
  if (y < 0) {
    h = imgH;
    y = 0;
  }

  // Final clamp: if minSize pushes width beyond image, cap at image size
  if (w > imgW) w = imgW;
  if (h > imgH) h = imgH;

  return { x: x, y: y, w: w, h: h };
}

/**
 * Resize a rect by dragging one of its four corner handles.
 *
 * @param {{ x: number, y: number, w: number, h: number }} rect — original rect
 * @param {'nw'|'ne'|'sw'|'se'} handle — which corner is being dragged
 * @param {number} dx — horizontal mouse delta (positive = right)
 * @param {number} dy — vertical mouse delta (positive = down)
 * @param {{ w: number, h: number }|null} aspect — aspect ratio object {w, h}
 *   or null for free resize
 * @param {number} imgW — image width (for clamping)
 * @param {number} imgH — image height (for clamping)
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
function resizeRect(rect, handle, dx, dy, aspect, imgW, imgH) {
  var x = rect.x;
  var y = rect.y;
  var w = rect.w;
  var h = rect.h;

  // Helper: clamp the resulting rect to bounds
  function applyClamp(r) {
    // Clamp min size first
    if (r.w < 32) r.w = 32;
    if (r.h < 32) r.h = 32;
    // Clamp to image bounds
    if (r.x < 0) { r.w += r.x; r.x = 0; }
    if (r.y < 0) { r.h += r.y; r.y = 0; }
    if (r.x + r.w > imgW) { r.w = imgW - r.x; }
    if (r.y + r.h > imgH) { r.h = imgH - r.y; }
    // Re-enforce min size after clamping
    if (r.w < 32) r.w = 32;
    if (r.h < 32) r.h = 32;
    if (r.x + r.w > imgW) r.x = imgW - r.w;
    if (r.y + r.h > imgH) r.y = imgH - r.h;
    return r;
  }

  switch (handle) {
    case 'se':
      // Bottom-right corner: move by (dx, dy)
      w = Math.max(1, rect.w + dx);
      h = Math.max(1, rect.h + dy);
      if (aspect) {
        // Use dx to determine new size, then derive h from aspect
        w = Math.max(32, rect.w + dx);
        h = Math.round(w * aspect.h / aspect.w);
      }
      break;

    case 'sw':
      // Bottom-left corner: left edge moves by dx, bottom edge by dy
      if (aspect) {
        // Opposite corner is NE (x + w, y). Anchor that.
        var neX = rect.x + rect.w;
        var neY = rect.y;
        var newW = Math.max(32, rect.w - dx);
        var newH = Math.round(newW * aspect.h / aspect.w);
        x = neX - newW;
        y = neY;
        w = newW;
        h = newH;
      } else {
        x = rect.x + dx;
        w = Math.max(1, rect.w - dx);
        h = Math.max(1, rect.h + dy);
      }
      break;

    case 'ne':
      // Top-right corner: right edge by dx, top edge by dy
      if (aspect) {
        // Opposite corner is SW (x, y + h)
        var swX = rect.x;
        var swY = rect.y + rect.h;
        var newW2 = Math.max(32, rect.w + dx);
        var newH2 = Math.round(newW2 * aspect.h / aspect.w);
        x = swX;
        y = swY - newH2;
        w = newW2;
        h = newH2;
      } else {
        y = rect.y + dy;
        w = Math.max(1, rect.w + dx);
        h = Math.max(1, rect.h - dy);
      }
      break;

    case 'nw':
      // Top-left corner: move by (dx, dy)
      if (aspect) {
        // Opposite corner is SE (x + w, y + h)
        var seX = rect.x + rect.w;
        var seY = rect.y + rect.h;
        var newW3 = Math.max(32, rect.w - dx);
        var newH3 = Math.round(newW3 * aspect.h / aspect.w);
        x = seX - newW3;
        y = seY - newH3;
        w = newW3;
        h = newH3;
      } else {
        x = rect.x + dx;
        y = rect.y + dy;
        w = Math.max(1, rect.w - dx);
        h = Math.max(1, rect.h - dy);
      }
      break;
  }

  return applyClamp({ x: x, y: y, w: w, h: h });
}

/**
 * Crop an ImageData to the specified rect.
 * Output is a new ImageData of size rect.w × rect.h.
 * Input is not modified.
 *
 * @param {ImageData} imageData — source image
 * @param {{ x: number, y: number, w: number, h: number }} rect — crop rect
 *   in image pixels (must be within image bounds; caller should clampRect first)
 * @returns {ImageData}
 */
function cropImageData(imageData, rect) {
  var src = imageData.data;
  var srcW = imageData.width;
  var srcH = imageData.height;

  var x = Math.round(rect.x);
  var y = Math.round(rect.y);
  var w = Math.round(rect.w);
  var h = Math.round(rect.h);

  // Clamp to image bounds just in case
  x = Math.max(0, Math.min(x, srcW - 1));
  y = Math.max(0, Math.min(y, srcH - 1));
  w = Math.max(1, Math.min(w, srcW - x));
  h = Math.max(1, Math.min(h, srcH - y));

  var outData = new Uint8ClampedArray(w * h * 4);

  for (var row = 0; row < h; row++) {
    var srcRow = y + row;
    for (var col = 0; col < w; col++) {
      var srcCol = x + col;
      var srcIdx = (srcRow * srcW + srcCol) * 4;
      var dstIdx = (row * w + col) * 4;
      outData[dstIdx]     = src[srcIdx];
      outData[dstIdx + 1] = src[srcIdx + 1];
      outData[dstIdx + 2] = src[srcIdx + 2];
      outData[dstIdx + 3] = src[srcIdx + 3];
    }
  }

  return new ImageData(outData, w, h);
}

// Dual-mode export: global for browser, module.exports for Node tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { largestRectForAspect: largestRectForAspect, clampRect: clampRect, resizeRect: resizeRect, cropImageData: cropImageData };
}

// histogram.js
// Renders a value-distribution histogram on a <canvas>.

// Padding constants — shared with binAtX for hit-testing alignment.
var HIST_PAD = { top: 12, right: 8, bottom: 20, left: 8 };

/**
 * Draw a histogram bar chart for N value bands.
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element.
 * @param {number[]} bins - Pixel counts per band (length N).
 * @param {number} N - Number of value levels (for label placement).
 * @param {object} [opts] - Optional parameters.
 * @param {number} [opts.selectedBin] - If set (0 ≤ selectedBin < N), that
 *   bin is drawn in the accent color instead of the default gradient.
 */
function drawHistogram(canvas, bins, N, opts) {
  var ctx = canvas.getContext('2d');
  var W = canvas.width;
  var H = canvas.height;
  var pad = HIST_PAD;
  var chartW = W - pad.left - pad.right;
  var chartH = H - pad.top - pad.bottom;

  // Clear
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);

  if (bins.length === 0) return;

  var maxCount = Math.max.apply(null, bins.concat([1]));
  var barGap = 2;
  var barW = Math.max(2, (chartW - (N - 1) * barGap) / N);

  var selectedBin = (opts && typeof opts.selectedBin === 'number') ? opts.selectedBin : -1;

  // Draw bars
  for (var i = 0; i < bins.length; i++) {
    var barH = (bins[i] / maxCount) * chartH;
    var x = pad.left + i * (barW + barGap);
    var y = pad.top + chartH - barH;

    if (i === selectedBin) {
      // Highlighted bin: accent color
      ctx.fillStyle = '#7c8aff';
    } else {
      // Gradient from dark to light (left to right)
      var lightness = i / Math.max(N - 1, 1);
      var r = Math.round(60 + lightness * 150);
      var g = Math.round(60 + lightness * 150);
      var b = Math.round(80 + lightness * 140);
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    ctx.fillRect(x, y, barW, barH);
  }

  // Labels: light / dark indicators
  ctx.fillStyle = '#888';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('dark', pad.left, pad.top + chartH + 14);
  ctx.textAlign = 'right';
  ctx.fillText('light', pad.left + chartW, pad.top + chartH + 14);
}

/**
 * Given an x-coordinate in canvas-pixel space, determine which histogram bin
 * was clicked. Use canvas-pixel coordinates (e.g., canvas.width, not CSS
 * clientWidth) to align with drawHistogram's coordinate system.
 *
 * When the canvas is CSS-scaled (e.g., max-width: 100%), convert the click's
 * CSS offset to canvas pixels before calling: canvasX = event.offsetX *
 * (canvas.width / canvas.clientWidth).
 *
 * @param {number} cssX - X coordinate in canvas-pixel space.
 * @param {number} canvasCssWidth - Width of the canvas in the same pixel
 *   space as cssX (typically canvas.width).
 * @param {number} N - Number of histogram bins.
 * @returns {number} Bin index (0–N-1) or -1 if outside the chart area.
 */
function binAtX(cssX, canvasCssWidth, N) {
  var pad = HIST_PAD;
  var chartW = canvasCssWidth - pad.left - pad.right;
  var barGap = 2;
  var barW = Math.max(2, (chartW - (N - 1) * barGap) / N);

  // Outside left/right padding
  if (cssX < pad.left || cssX > pad.left + chartW) return -1;

  var relX = cssX - pad.left;
  var slotWidth = barW + barGap;
  var idx = Math.floor(relX / slotWidth);

  if (idx < 0 || idx >= N) return -1;
  return idx;
}

// Node export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { drawHistogram, binAtX, HIST_PAD };
}

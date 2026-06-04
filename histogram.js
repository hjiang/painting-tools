// histogram.js
// Renders a value-distribution histogram on a <canvas>.

/**
 * Draw a histogram bar chart for N value bands.
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element.
 * @param {number[]} bins - Pixel counts per band (length N).
 * @param {number} N - Number of value levels (for label placement).
 */
function drawHistogram(canvas, bins, N) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const pad = { top: 12, right: 8, bottom: 20, left: 8 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  // Clear
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);

  if (bins.length === 0) return;

  const maxCount = Math.max(...bins, 1);
  const barGap = 2;
  const barW = Math.max(2, (chartW - (N - 1) * barGap) / N);

  // Draw bars
  for (let i = 0; i < bins.length; i++) {
    const barH = (bins[i] / maxCount) * chartH;
    const x = pad.left + i * (barW + barGap);
    const y = pad.top + chartH - barH;

    // Gradient from dark to light (left to right)
    const lightness = i / Math.max(N - 1, 1);
    const r = Math.round(60 + lightness * 150);
    const g = Math.round(60 + lightness * 150);
    const b = Math.round(80 + lightness * 140);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
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

// Node export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { drawHistogram };
}

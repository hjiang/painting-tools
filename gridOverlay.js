// gridOverlay.js
// Grid overlay drawing — pure Canvas 2D compositing.
// Draws configurable grid lines, labels, and diagonals onto a canvas context
// that already has the source image rendered.

'use strict';

/**
 * Compute grid layout: cell dimensions, grid area, and centering offset.
 * Pure function — no Canvas dependency — so it can be unit-tested.
 *
 * @param {number} width  — image width in pixels
 * @param {number} height — image height in pixels
 * @param {{ rows: number, columns: number, squareCells: boolean }} options
 * @returns {{ cellW: number, cellH: number, gridW: number, gridH: number,
 *             offsetX: number, offsetY: number }}
 */
function computeGridLayout(width, height, options) {
  var rows = options.rows;
  var columns = options.columns;

  if (options.squareCells) {
    var cellSize = Math.min(width / columns, height / rows);
    return {
      cellW: cellSize,
      cellH: cellSize,
      gridW: cellSize * columns,
      gridH: cellSize * rows,
      offsetX: (width - cellSize * columns) / 2,
      offsetY: (height - cellSize * rows) / 2
    };
  }

  return {
    cellW: width / columns,
    cellH: height / rows,
    gridW: width,
    gridH: height,
    offsetX: 0,
    offsetY: 0
  };
}

/**
 * Draw a configurable grid on top of a source image that is already
 * rendered on the canvas context.
 *
 * Preconditions:
 *   - The source image is already drawn on ctx (e.g. via putImageData).
 *   - width and height are the canvas pixel dimensions.
 *
 * Postconditions:
 *   - Grid lines, optional labels, optional diagonals, and optional margin
 *     dimming are composited on top.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width  — canvas pixel width (source image width)
 * @param {number} height — canvas pixel height
 * @param {{
 *   rows: number,
 *   columns: number,
 *   lineColor: string,
 *   lineWidth: number,
 *   lineStyle: ('solid'|'dashed'),
 *   showLabels: boolean,
 *   showDiagonals: boolean,
 *   squareCells: boolean
 * }} options
 */
function drawGrid(ctx, width, height, options) {
  var layout = computeGridLayout(width, height, options);
  var cellW = layout.cellW;
  var cellH = layout.cellH;
  var gridW = layout.gridW;
  var gridH = layout.gridH;
  var ox = layout.offsetX;
  var oy = layout.offsetY;
  var rows = options.rows;
  var columns = options.columns;
  var lineColor = options.lineColor || '#ffffff';
  var lineWidth = options.lineWidth || 1;

  ctx.save();

  // ── Dim margins outside the grid area (square cells mode) ──
  if (options.squareCells) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';

    // Top margin
    if (oy > 0) ctx.fillRect(0, 0, width, oy);
    // Bottom margin
    if (oy + gridH < height) ctx.fillRect(0, oy + gridH, width, height - oy - gridH);
    // Left margin (within the vertical span of the grid)
    if (ox > 0) ctx.fillRect(0, oy, ox, gridH);
    // Right margin
    if (ox + gridW < width) ctx.fillRect(ox + gridW, oy, width - ox - gridW, gridH);

    // Subtle border around grid area
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = Math.max(1, lineWidth);
    ctx.setLineDash([]);
    ctx.strokeRect(ox, oy, gridW, gridH);
  }

  // ── Grid line style ──
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  if (options.lineStyle === 'dashed') {
    ctx.setLineDash([8, 6]);
  } else {
    ctx.setLineDash([]);
  }

  // ── Vertical lines ──
  for (var i = 1; i < columns; i++) {
    var x = ox + i * cellW;
    ctx.beginPath();
    ctx.moveTo(x, oy);
    ctx.lineTo(x, oy + gridH);
    ctx.stroke();
  }

  // ── Horizontal lines ──
  for (var j = 1; j < rows; j++) {
    var y = oy + j * cellH;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + gridW, y);
    ctx.stroke();
  }

  // ── Diagonals ──
  if (options.showDiagonals) {
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(1, lineWidth - 1 || 1);

    for (var ci = 0; ci < columns; ci++) {
      for (var rj = 0; rj < rows; rj++) {
        var cx = ox + ci * cellW;
        var cy = oy + rj * cellH;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + cellW, cy + cellH);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx, cy + cellH);
        ctx.lineTo(cx + cellW, cy);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }

  // ── Labels (column numbers + row letters) ──
  if (options.showLabels) {
    // Font size scales with cell size, clamped for readability
    var fontSize = Math.max(10, Math.round(Math.min(cellW, cellH) * 0.32));
    ctx.font = 'bold ' + fontSize + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var labelPadX = Math.max(4, Math.round(fontSize * 0.3));
    var labelPadY = Math.max(2, Math.round(fontSize * 0.15));

    // Column numbers (1, 2, 3…) along the top of the grid area
    // Positioned just below the top edge so they don't bleed out
    var labelY = oy + Math.min(cellH * 0.18, fontSize * 1.2);
    for (var ci2 = 0; ci2 < columns; ci2++) {
      var lx = ox + ci2 * cellW + cellW / 2;
      var text = '' + (ci2 + 1);
      var tw = ctx.measureText(text).width;

      // Semi-transparent background pill
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(lx - tw / 2 - labelPadX, labelY - fontSize / 2 - labelPadY, tw + labelPadX * 2, fontSize + labelPadY * 2);
      ctx.fillStyle = lineColor;
      ctx.fillText(text, lx, labelY);
    }

    // Row letters (A, B, C…) along the left of the grid area
    var labelX = ox + Math.min(cellW * 0.18, fontSize * 1.2);
    for (var rj2 = 0; rj2 < rows; rj2++) {
      var ly2 = oy + rj2 * cellH + cellH / 2;
      // Handle rows beyond Z — use AA, AB, …
      var labelText = rj2 < 26
        ? String.fromCharCode(65 + rj2)
        : String.fromCharCode(65 + Math.floor((rj2 - 26) / 26)) + String.fromCharCode(65 + ((rj2 - 26) % 26));
      var tw2 = ctx.measureText(labelText).width;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(labelX - tw2 / 2 - labelPadX, ly2 - fontSize / 2 - labelPadY, tw2 + labelPadX * 2, fontSize + labelPadY * 2);
      ctx.fillStyle = lineColor;
      ctx.fillText(labelText, labelX, ly2);
    }
  }

  ctx.restore();
}

/**
 * Compute the auto-dimension value when square cells is on.
 * Pure function — testable in Node without DOM.
 *
 * Given a master dimension value and image aspect ratio, returns the
 * value for the companion dimension, clamped to [minVal, maxVal].
 *
 * @param {'rows'|'columns'} master  — which dimension the user adjusted
 * @param {number} masterValue       — the value the user set
 * @param {number} imgW              — image width in px
 * @param {number} imgH              — image height in px
 * @param {number} minVal            — minimum allowed value (inclusive)
 * @param {number} maxVal            — maximum allowed value (inclusive)
 * @returns {number} the auto-computed companion value
 */
function computeAutoValue(master, masterValue, imgW, imgH, minVal, maxVal) {
  if (master === 'rows') {
    return Math.max(minVal, Math.min(maxVal, Math.round(masterValue * imgW / imgH)));
  }
  return Math.max(minVal, Math.min(maxVal, Math.round(masterValue * imgH / imgW)));
}

// Dual-mode export: global for browser, module.exports for Node tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeGridLayout: computeGridLayout, drawGrid: drawGrid, computeAutoValue: computeAutoValue };
}

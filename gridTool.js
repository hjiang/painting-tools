// gridTool.js
// Tool module for grid overlay. Registers with ToolShell.
// Depends on: gridOverlay.js (pure functions)
//             app.js (ImageManager, ToolShell, canvas helpers)

ToolShell.register({
  id: 'grid',
  name: 'Grid Overlay',
  icon: '\uD83D\uDCD0',  // 📐

  mount: function (container) {
    var gridCanvas = document.getElementById('grid-canvas');
    var rowsSlider = document.getElementById('grid-rows');
    var colsSlider = document.getElementById('grid-cols');
    var rowsLabel = document.getElementById('grid-rows-label');
    var colsLabel = document.getElementById('grid-cols-label');
    var lineColorRadios = document.getElementsByName('grid-line-color');
    var lineWidthSlider = document.getElementById('grid-line-width');
    var lineWidthLabel = document.getElementById('grid-line-width-label');
    var showLabelsCheck = document.getElementById('grid-show-labels');
    var dashedCheck = document.getElementById('grid-dashed');
    var diagonalsCheck = document.getElementById('grid-diagonals');
    var squareCellsCheck = document.getElementById('grid-square-cells');
    var autoComputeCheck = document.getElementById('grid-auto-compute');
    var downloadBtn = document.getElementById('download-grid-btn');

    var SQUARE_KEY = 'painting-tools.grid.squareCells';
    var AUTO_KEY = 'painting-tools.grid.autoCompute';

    var _offscreenCanvas = null;  // full-res composite for download
    var _autoDim = null;           // which dim is auto-computed: 'rows', 'columns', or null

    // ── Settings persistence ─────────────────────

    // Restore saved settings on mount (falling back to the HTML defaults).
    squareCellsCheck.checked = Settings.getBool(SQUARE_KEY, squareCellsCheck.checked);
    autoComputeCheck.checked = Settings.getBool(AUTO_KEY, autoComputeCheck.checked);

    // ── Helpers ──────────────────────────────────────

    function getLineColor() {
      return getCheckedValue(lineColorRadios, '#ffffff');
    }

    function getOptions() {
      return {
        rows: parseInt(rowsSlider.value, 10),
        columns: parseInt(colsSlider.value, 10),
        lineColor: getLineColor(),
        lineWidth: parseInt(lineWidthSlider.value, 10),
        lineStyle: dashedCheck.checked ? 'dashed' : 'solid',
        showLabels: showLabelsCheck.checked,
        showDiagonals: diagonalsCheck.checked,
        squareCells: squareCellsCheck.checked
      };
    }

    /**
     * When both squareCells and autoCompute are on, adjust the "other"
     * slider to maintain the image aspect ratio. The slider that the user
     * just moved is the "master" and the other becomes auto-computed.
     *
     * @param {'rows'|'columns'} master — which slider was just adjusted
     */
    function syncSquareSliders(master) {
      if (!squareCellsCheck.checked || !autoComputeCheck.checked) {
        _autoDim = null;
        return;
      }

      var imageData = ImageManager.getImageData();
      if (!imageData) return;

      var imgW = imageData.width;
      var imgH = imageData.height;

      if (master === 'rows') {
        colsSlider.value = computeAutoValue('rows', parseInt(rowsSlider.value, 10), imgW, imgH, 2, 12);
        _autoDim = 'columns';
      } else {
        rowsSlider.value = computeAutoValue('columns', parseInt(colsSlider.value, 10), imgW, imgH, 2, 12);
        _autoDim = 'rows';
      }
    }

    // ── Render ───────────────────────────────────────

    function render() {
      var imageData = ImageManager.getImageData();
      if (!imageData) return;

      // Auto-compute on first render when both checkboxes are on
      if (squareCellsCheck.checked && autoComputeCheck.checked && !_autoDim) {
        syncSquareSliders('columns');
      }

      var opts = getOptions();
      var w = imageData.width;
      var h = imageData.height;

      // Update labels (including auto-suffix when square cells is on)
      rowsLabel.textContent = opts.rows + (_autoDim === 'rows' ? ' (auto)' : '');
      colsLabel.textContent = opts.columns + (_autoDim === 'columns' ? ' (auto)' : '');

      // Visually indicate whether auto-compute checkbox is active
      var autoLabel = document.getElementById('grid-auto-label');
      if (autoLabel) {
        if (opts.squareCells) {
          autoLabel.style.opacity = '';
        } else {
          autoLabel.style.opacity = '0.4';
        }
      }

      // Set visible canvas to full-resolution pixel dimensions
      gridCanvas.width = w;
      gridCanvas.height = h;

      // CSS scale to fit container (same logic as drawImageDataToCanvas)
      var maxW = Math.min(gridCanvas.parentElement.clientWidth - 16, 540);
      var scale = Math.min(1, maxW / w);
      gridCanvas.style.width = Math.round(w * scale) + 'px';
      gridCanvas.style.height = Math.round(h * scale) + 'px';

      var ctx = gridCanvas.getContext('2d');

      // 1. Draw original photo
      ctx.putImageData(imageData, 0, 0);

      // 2. Draw grid on top
      drawGrid(ctx, w, h, opts);

      // 3. Build offscreen canvas for download (duplicate the composite)
      _offscreenCanvas = document.createElement('canvas');
      _offscreenCanvas.width = w;
      _offscreenCanvas.height = h;
      var octx = _offscreenCanvas.getContext('2d');
      octx.putImageData(imageData, 0, 0);
      drawGrid(octx, w, h, opts);
    }

    // ── Event listeners ──────────────────────────────

    rowsSlider.addEventListener('input', function () {
      syncSquareSliders('rows');
      render();
    });

    colsSlider.addEventListener('input', function () {
      syncSquareSliders('columns');
      render();
    });

    squareCellsCheck.addEventListener('change', function () {
      Settings.set(SQUARE_KEY, squareCellsCheck.checked);
      if (squareCellsCheck.checked && autoComputeCheck.checked) {
        syncSquareSliders('columns');
      } else {
        _autoDim = null;
      }
      render();
    });

    autoComputeCheck.addEventListener('change', function () {
      Settings.set(AUTO_KEY, autoComputeCheck.checked);
      if (autoComputeCheck.checked && squareCellsCheck.checked) {
        syncSquareSliders('columns');
      } else {
        _autoDim = null;
      }
      render();
    });

    lineWidthSlider.addEventListener('input', function () {
      lineWidthLabel.textContent = lineWidthSlider.value;
      render();
    });

    for (var i = 0; i < lineColorRadios.length; i++) {
      lineColorRadios[i].addEventListener('change', render);
    }

    showLabelsCheck.addEventListener('change', render);
    dashedCheck.addEventListener('change', render);
    diagonalsCheck.addEventListener('change', render);

    // ── Promote button ─────────────────────────

    var promoteBtn = createPromoteButton(
      function () {
        if (!_offscreenCanvas) return null;
        return _offscreenCanvas.getContext('2d').getImageData(0, 0, _offscreenCanvas.width, _offscreenCanvas.height);
      },
      function () {
        return 'Grid (' + parseInt(rowsSlider.value, 10) + '×' + parseInt(colsSlider.value, 10) + ')';
      }
    );
    document.getElementById('grid-promote-spot').appendChild(promoteBtn);

    downloadBtn.addEventListener('click', function () {
      if (_offscreenCanvas) {
        _offscreenCanvas.toBlob(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'grid-photo.png';
          a.click();
          URL.revokeObjectURL(url);
        }, 'image/png');
      }
    });

    return render;
  }
});

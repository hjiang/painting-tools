// posterizeTool.js
// Tool module for value posterization. Registers with ToolShell.
// Depends on: posterize.js, histogram.js (pure functions)
//             app.js (ImageManager, ToolShell, canvas helpers)
//             viewTransforms.js (boxBlur for smoothing)

ToolShell.register({
  id: 'posterize',
  name: 'Value Posterizer',
  icon: '\uD83C\uDFA8',  // 🎨

  mount: function (container) {
    var valueSlider = document.getElementById('value-slider');
    var valueLabel = document.getElementById('value-label');
    var modeRadios = document.getElementsByName('mode');
    var downloadBtn = document.getElementById('download-btn');
    var originalCanvas = document.getElementById('original-canvas');
    var resultCanvas = document.getElementById('result-canvas');
    var histogramCanvas = document.getElementById('histogram-canvas');
    var allBandsBtn = document.getElementById('all-bands-btn');
    var isolateHint = document.getElementById('isolate-hint');
    var smoothSlider = document.getElementById('posterize-smooth');
    var smoothLabel = document.getElementById('posterize-smooth-label');

    var _lastResult = null;
    var _lastImageData = null;
    var _lastN = -1;
    var _lastMode = '';
    var _lastSmooth = -1;           // smoothing radius used for last cache
    var _lastSmoothedSource = null; // cached smoothed ImageData (null when smooth=0)
    var _selectedBin = Settings.getInt('painting-tools.posterize.isolateBand', -1);

    // ── Restore persisted smoothing value ─────────

    if (smoothSlider) {
      smoothSlider.value = String(Settings.getInt('painting-tools.posterize.smooth', 0));
    }

    function getN() {
      return parseInt(valueSlider.value, 10);
    }

    function getMode() {
      return getCheckedValue(modeRadios, 'grayscale');
    }

    function getSmooth() {
      return smoothSlider ? parseInt(smoothSlider.value, 10) : 0;
    }

    function updateAllBandsButton() {
      if (_selectedBin >= 0 && _selectedBin < getN()) {
        if (allBandsBtn) allBandsBtn.classList.remove('hidden');
        if (isolateHint) isolateHint.classList.add('hidden');
      } else {
        if (allBandsBtn) allBandsBtn.classList.add('hidden');
        if (isolateHint) isolateHint.classList.remove('hidden');
      }
    }

    function render() {
      var imageData = ImageManager.getImageData();
      if (!imageData) return;

      var N = getN();
      var mode = getMode();
      var smooth = getSmooth();
      valueLabel.textContent = N;
      if (smoothLabel) smoothLabel.textContent = String(smooth);

      // Phase 1: recompute smoothed source only when raw image or smooth radius changes.
      // N/mode-only changes skip boxBlur entirely.
      var sourceNeedsUpdate = (imageData !== _lastImageData || smooth !== _lastSmooth);
      var source;
      if (sourceNeedsUpdate) {
        if (smooth > 0) {
          _lastSmoothedSource = boxBlur(imageData, smooth, 2);
          source = _lastSmoothedSource;
        } else {
          _lastSmoothedSource = null;
          source = imageData;
        }
        _lastImageData = imageData;
        _lastSmooth = smooth;
      } else {
        source = _lastSmoothedSource || imageData;
      }

      // Phase 2: recompute posterize result when source, N, or mode changes.
      // boxBlur is NOT called again for N/mode-only changes.
      if (sourceNeedsUpdate || N !== _lastN || mode !== _lastMode) {
        _lastResult = posterize(source, N, mode);
        _lastN = N;
        _lastMode = mode;
      }

      drawImageDataToCanvas(imageData, originalCanvas);

      // Determine the source to use for isolation — must match the
      // same (optionally smoothed) input that posterize consumed
      var sourceForIsolation = _lastSmoothedSource || imageData;

      if (_selectedBin >= 0 && _selectedBin < N) {
        // Show isolated band mask
        var isolated = isolateBand(sourceForIsolation, N, _selectedBin, mode);
        drawImageDataToCanvas(isolated.imageData, resultCanvas);
        drawHistogram(histogramCanvas, _lastResult.histogram, N, { selectedBin: _selectedBin });
      } else {
        // Show normal posterized result
        drawImageDataToCanvas(_lastResult.imageData, resultCanvas);
        drawHistogram(histogramCanvas, _lastResult.histogram, N);
      }

      updateAllBandsButton();
    }

    valueSlider.addEventListener('input', function () {
      // Changing N clears selection
      _selectedBin = -1;
      Settings.set('painting-tools.posterize.isolateBand', -1);
      render();
    });

    for (var i = 0; i < modeRadios.length; i++) {
      modeRadios[i].addEventListener('change', function () {
        // Changing mode clears selection
        _selectedBin = -1;
        Settings.set('painting-tools.posterize.isolateBand', -1);
        render();
      });
    }

    // ── Smoothing slider: update label, persist, re-render ──
    // Does NOT clear the isolated band selection — the mask is
    // recomputed coherently from the new smoothed source.

    if (smoothSlider) {
      smoothSlider.addEventListener('input', function () {
        var v = parseInt(smoothSlider.value, 10);
        if (smoothLabel) smoothLabel.textContent = String(v);
        Settings.set('painting-tools.posterize.smooth', v);
        render();
      });
    }

    // ── Histogram click: select/deselect a band ─────────

    histogramCanvas.addEventListener('click', function (e) {
      var imageData = ImageManager.getImageData();
      if (!imageData) return;

      var N = getN();
      // Scale CSS offset to canvas-pixel space for hit-test alignment
      var cssW = histogramCanvas.clientWidth || histogramCanvas.width;
      var canvasW = histogramCanvas.width;
      var bin = binAtX(e.offsetX * (canvasW / cssW), canvasW, N);

      if (bin >= 0) {
        if (_selectedBin === bin) {
          // Clicking the same bin again → deselect
          _selectedBin = -1;
        } else {
          _selectedBin = bin;
        }
      } else {
        // Clicked outside chart → deselect
        _selectedBin = -1;
      }

      Settings.set('painting-tools.posterize.isolateBand', _selectedBin);
      render();
    });

    // ── "All bands" button ──────────────────────────────

    if (allBandsBtn) {
      allBandsBtn.addEventListener('click', function () {
        _selectedBin = -1;
        Settings.set('painting-tools.posterize.isolateBand', -1);
        render();
      });
    }

    // ── Promote button ─────────────────────────

    function getSmoothLabelPart() {
      var s = getSmooth();
      return s > 0 ? ', smoothed ' + s + 'px' : '';
    }

    var promoteBtn = createPromoteButton(
      function () {
        if (!_lastResult) return null;
        var imageData = ImageManager.getImageData();
        if (!imageData) return null;
        var smooth = getSmooth();
        var source = (smooth > 0 && _lastSmoothedSource) ? _lastSmoothedSource : imageData;

        if (_selectedBin >= 0 && _selectedBin < getN()) {
          var isolated = isolateBand(source, getN(), _selectedBin, getMode());
          return isolated.imageData;
        }
        return _lastResult.imageData;
      },
      function () {
        var sp = getSmoothLabelPart();
        if (_selectedBin >= 0 && _selectedBin < getN()) {
          return 'Isolated band ' + (_selectedBin + 1) + ' (' + getN() + ' values' + sp + ')';
        }
        return 'Posterized (' + getN() + ' values, ' + getMode() + sp + ')';
      }
    );
    document.getElementById('posterize-promote-spot').appendChild(promoteBtn);

    downloadBtn.addEventListener('click', function () {
      var result = null;
      var imageData = ImageManager.getImageData();
      if (!imageData) return;
      var smooth = getSmooth();
      var source = (smooth > 0 && _lastSmoothedSource) ? _lastSmoothedSource : imageData;

      if (_selectedBin >= 0 && _selectedBin < getN()) {
        result = isolateBand(source, getN(), _selectedBin, getMode()).imageData;
      } else if (_lastResult) {
        result = _lastResult.imageData;
      }
      if (result) {
        downloadImageData(result, 'posterized.png');
      }
    });

    updateAllBandsButton();

    return render;
  }
});

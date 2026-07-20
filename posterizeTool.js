// posterizeTool.js
// Tool module for value posterization. Registers with ToolShell.
// Depends on: posterize.js, histogram.js (pure functions)
//             app.js (ImageManager, ToolShell, canvas helpers)

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

    var _lastResult = null;
    var _selectedBin = Settings.getInt('painting-tools.posterize.isolateBand', -1);

    function getN() {
      return parseInt(valueSlider.value, 10);
    }

    function getMode() {
      return getCheckedValue(modeRadios, 'grayscale');
    }

    function updateAllBandsButton() {
      if (_selectedBin >= 0) {
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
      valueLabel.textContent = N;

      _lastResult = posterize(imageData, N, mode);

      drawImageDataToCanvas(imageData, originalCanvas);

      if (_selectedBin >= 0 && _selectedBin < N) {
        // Show isolated band mask
        var isolated = isolateBand(imageData, N, _selectedBin, mode);
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

    // ── Histogram click: select/deselect a band ─────────

    histogramCanvas.addEventListener('click', function (e) {
      var imageData = ImageManager.getImageData();
      if (!imageData) return;

      var N = getN();
      var cssW = histogramCanvas.clientWidth || histogramCanvas.width;
      var bin = binAtX(e.offsetX, cssW, N);

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

    var promoteBtn = createPromoteButton(
      function () {
        if (!_lastResult) return null;
        if (_selectedBin >= 0 && _selectedBin < getN()) {
          var imageData = ImageManager.getImageData();
          if (!imageData) return null;
          var isolated = isolateBand(imageData, getN(), _selectedBin, getMode());
          return isolated.imageData;
        }
        return _lastResult.imageData;
      },
      function () {
        if (_selectedBin >= 0 && _selectedBin < getN()) {
          return 'Isolated band ' + (_selectedBin + 1) + ' (' + getN() + ' values)';
        }
        return 'Posterized (' + getN() + ' values, ' + getMode() + ')';
      }
    );
    document.getElementById('posterize-promote-spot').appendChild(promoteBtn);

    downloadBtn.addEventListener('click', function () {
      var result = null;
      if (_selectedBin >= 0 && _selectedBin < getN()) {
        var imageData = ImageManager.getImageData();
        if (imageData) {
          result = isolateBand(imageData, getN(), _selectedBin, getMode()).imageData;
        }
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

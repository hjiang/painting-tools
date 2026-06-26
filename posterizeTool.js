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

    var _lastResult = null;

    function getN() {
      return parseInt(valueSlider.value, 10);
    }

    function getMode() {
      for (var i = 0; i < modeRadios.length; i++) {
        if (modeRadios[i].checked) return modeRadios[i].value;
      }
      return 'grayscale';
    }

    function render() {
      var imageData = ImageManager.getImageData();
      if (!imageData) return;

      var N = getN();
      var mode = getMode();
      valueLabel.textContent = N;

      _lastResult = posterize(imageData, N, mode);

      drawImageDataToCanvas(imageData, originalCanvas);
      drawImageDataToCanvas(_lastResult.imageData, resultCanvas);
      drawHistogram(histogramCanvas, _lastResult.histogram, N);
    }

    // Override the tool's process binding so the shell calls our render
    ToolShell._tools['posterize'].process = function (imageData) {
      drawImageDataToCanvas(imageData, originalCanvas);
      render();
    };

    valueSlider.addEventListener('input', render);
    for (var i = 0; i < modeRadios.length; i++) {
      modeRadios[i].addEventListener('change', render);
    }

    // ── Promote button ─────────────────────────

    var promoteBtn = createPromoteButton(
      function () { return _lastResult ? _lastResult.imageData : null; },
      function () { return 'Posterized (' + getN() + ' values, ' + getMode() + ')'; }
    );
    document.getElementById('posterize-promote-spot').appendChild(promoteBtn);

    downloadBtn.addEventListener('click', function () {
      if (_lastResult) {
        downloadImageData(_lastResult.imageData, 'posterized.png');
      }
    });
  },

  process: function (imageData) {
    // Overridden in mount()
  }
});

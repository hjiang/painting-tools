// sketchTool.js
// Tool module for edge detection sketch. Registers with ToolShell.
// Depends on: edgeDetect.js (pure function)
//             app.js (ImageManager, ToolShell, canvas helpers)

ToolShell.register({
  id: 'sketch',
  name: 'Rough Sketch',
  icon: '\u270F\uFE0F',  // ✏️

  mount: function (container) {
    var sketchCanvas = document.getElementById('sketch-canvas');
    var edgeBlur = document.getElementById('edge-blur');
    var edgeBlurLabel = document.getElementById('edge-blur-label');
    var edgeThreshold = document.getElementById('edge-threshold');
    var edgeThresholdLabel = document.getElementById('edge-threshold-label');
    var edgeInvert = document.getElementById('edge-invert');
    var downloadSketchBtn = document.getElementById('download-sketch-btn');

    var BLUR_KEY = 'painting-tools.sketch.blur';
    var THRESHOLD_KEY = 'painting-tools.sketch.threshold';

    var _sketchImageData = null;

    // ── Settings persistence ─────────────────────

    // Restore saved settings on mount (falling back to the HTML defaults).
    edgeBlur.value = Settings.getNumber(BLUR_KEY, parseFloat(edgeBlur.value));
    edgeBlurLabel.textContent = parseFloat(edgeBlur.value).toFixed(1);
    edgeThreshold.value = Settings.getInt(THRESHOLD_KEY, parseInt(edgeThreshold.value, 10));
    edgeThresholdLabel.textContent = edgeThreshold.value;

    function renderSketch() {
      var imageData = ImageManager.getImageData();
      if (!imageData) return;

      var threshold = parseInt(edgeThreshold.value, 10);
      var invert = edgeInvert.checked;
      edgeThresholdLabel.textContent = threshold;

      _sketchImageData = detectEdges(imageData, {
        blur: parseFloat(edgeBlur.value),
        threshold: threshold,
        invert: invert
      });

      drawImageDataToCanvas(_sketchImageData, sketchCanvas);
    }

    edgeBlur.addEventListener('input', function () {
      var val = parseFloat(edgeBlur.value);
      edgeBlurLabel.textContent = val.toFixed(1);
      Settings.set(BLUR_KEY, val);
      renderSketch();
    });
    edgeThreshold.addEventListener('input', function () {
      Settings.set(THRESHOLD_KEY, parseInt(edgeThreshold.value, 10));
      renderSketch();
    });
    edgeInvert.addEventListener('change', renderSketch);

    // ── Promote button ─────────────────────────

    var promoteBtn = createPromoteButton(
      function () { return _sketchImageData; },
      function () {
        return 'Sketch (blur ' + parseFloat(edgeBlur.value).toFixed(1) +
        ', threshold ' + parseInt(edgeThreshold.value, 10) +
          (edgeInvert.checked ? ', inverted' : '') + ')';
      }
    );
    document.getElementById('sketch-promote-spot').appendChild(promoteBtn);

    downloadSketchBtn.addEventListener('click', function () {
      if (_sketchImageData) {
        downloadImageData(_sketchImageData, 'sketch.png');
      }
    });

    return renderSketch;
  }
});

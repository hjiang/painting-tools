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
    var edgeThreshold = document.getElementById('edge-threshold');
    var edgeThresholdLabel = document.getElementById('edge-threshold-label');
    var edgeInvert = document.getElementById('edge-invert');
    var downloadSketchBtn = document.getElementById('download-sketch-btn');

    var THRESHOLD_KEY = 'painting-tools.sketch.threshold';

    var _sketchImageData = null;

    // ── Settings persistence ─────────────────────

    function loadThreshold() {
      try {
        var saved = localStorage.getItem(THRESHOLD_KEY);
        if (saved !== null) {
          var val = parseInt(saved, 10);
          if (!isNaN(val)) return val;
        }
      } catch (e) { /* ignore */ }
      return parseInt(edgeThreshold.value, 10);
    }

    function saveThreshold(val) {
      try {
        localStorage.setItem(THRESHOLD_KEY, String(val));
      } catch (e) { /* storage unavailable */ }
    }

    // Restore saved threshold on mount
    edgeThreshold.value = loadThreshold();
    edgeThresholdLabel.textContent = edgeThreshold.value;

    function renderSketch() {
      var imageData = ImageManager.getImageData();
      if (!imageData) return;

      var threshold = parseInt(edgeThreshold.value, 10);
      var invert = edgeInvert.checked;
      edgeThresholdLabel.textContent = threshold;

      _sketchImageData = detectEdges(imageData, {
        threshold: threshold,
        invert: invert
      });

      drawImageDataToCanvas(_sketchImageData, sketchCanvas);
    }

    // Override the tool's process binding
    ToolShell._tools['sketch'].process = function (imageData) {
      renderSketch();
    };

    edgeThreshold.addEventListener('input', function () {
      saveThreshold(parseInt(edgeThreshold.value, 10));
      renderSketch();
    });
    edgeInvert.addEventListener('change', renderSketch);

    // ── Promote button ─────────────────────────

    var promoteBtn = createPromoteButton(
      function () { return _sketchImageData; },
      function () {
        return 'Sketch (threshold ' + parseInt(edgeThreshold.value, 10) +
          (edgeInvert.checked ? ', inverted' : '') + ')';
      }
    );
    document.getElementById('sketch-promote-spot').appendChild(promoteBtn);

    downloadSketchBtn.addEventListener('click', function () {
      if (_sketchImageData) {
        downloadImageData(_sketchImageData, 'sketch.png');
      }
    });
  },

  process: function (imageData) {
    // Overridden in mount()
  }
});

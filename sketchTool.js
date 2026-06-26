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

    var _sketchImageData = null;

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

    edgeThreshold.addEventListener('input', renderSketch);
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

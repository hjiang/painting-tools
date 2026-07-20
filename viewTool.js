// viewTool.js
// Tool module for the View tool: flip, grayscale, and blur.
// Depends on: viewTransforms.js (pure functions)
//             app.js (ImageManager, ToolShell, canvas helpers)

ToolShell.register({
  id: 'view',
  name: 'View',
  icon: '\uD83D\uDC41\uFE0F',  // 👁️

  mount: function (container) {
    var canvas = document.getElementById('view-canvas');
    var flipCheck = document.getElementById('view-flip');
    var grayscaleCheck = document.getElementById('view-grayscale');
    var blurSlider = document.getElementById('view-blur');
    var blurLabel = document.getElementById('view-blur-label');
    var downloadBtn = document.getElementById('download-view-btn');

    var _lastResult = null;

    // Settings keys
    var FLIP_KEY = 'painting-tools.view.flip';
    var GRAY_KEY = 'painting-tools.view.grayscale';
    var BLUR_KEY = 'painting-tools.view.blurRadius';

    // Restore persisted values
    flipCheck.checked = Settings.getBool(FLIP_KEY, flipCheck.checked);
    grayscaleCheck.checked = Settings.getBool(GRAY_KEY, grayscaleCheck.checked);
    blurSlider.value = Settings.getInt(BLUR_KEY, parseInt(blurSlider.value, 10));
    blurLabel.textContent = blurSlider.value;

    function getBlurRadius() {
      return parseInt(blurSlider.value, 10);
    }

    function buildPromoteLabel() {
      var parts = [];
      if (flipCheck.checked) parts.push('Flipped');
      if (grayscaleCheck.checked) parts.push('Grayscale');
      var r = getBlurRadius();
      if (r > 0) parts.push('Blurred ' + r + 'px');
      return parts.length > 0 ? parts.join(', ') : 'Unaltered view';
    }

    function render() {
      var imageData = ImageManager.getImageData();
      if (!imageData) return;

      var r = getBlurRadius();
      blurLabel.textContent = r;

      var current = imageData;

      // Pipeline: flip → grayscale → blur
      if (flipCheck.checked) {
        current = flipHorizontal(current);
      }
      if (grayscaleCheck.checked) {
        current = toGrayscale(current);
      }
      if (r > 0) {
        current = boxBlur(current, r);
      }

      _lastResult = current;
      drawImageDataToCanvas(current, canvas);
    }

    // ── Event listeners ──────────────────────────

    flipCheck.addEventListener('change', function () {
      Settings.set(FLIP_KEY, flipCheck.checked);
      render();
    });

    grayscaleCheck.addEventListener('change', function () {
      Settings.set(GRAY_KEY, grayscaleCheck.checked);
      render();
    });

    blurSlider.addEventListener('input', function () {
      Settings.set(BLUR_KEY, getBlurRadius());
      render();
    });

    // ── Promote button ───────────────────────────

    var promoteBtn = createPromoteButton(
      function () { return _lastResult ? _lastResult : null; },
      function () { return 'View (' + buildPromoteLabel() + ')'; }
    );
    document.getElementById('view-promote-spot').appendChild(promoteBtn);

    downloadBtn.addEventListener('click', function () {
      if (_lastResult) {
        downloadImageData(_lastResult, 'view.png');
      }
    });

    return render;
  }
});

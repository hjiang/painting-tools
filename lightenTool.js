// lightenTool.js
// Tool module for image lightening. Registers with ToolShell.
// Depends on: lighten.js (pure function)
//             app.js (ImageManager, ToolShell, canvas helpers)

ToolShell.register({
  id: 'lighten',
  name: 'Lighten',
  icon: '\u2600\uFE0F',  // ☀️

  mount: function (container) {
    var originalCanvas = document.getElementById('lighten-original-canvas');
    var resultCanvas = document.getElementById('lighten-result-canvas');
    var amountSlider = document.getElementById('lighten-amount');
    var amountLabel = document.getElementById('lighten-amount-label');
    var downloadBtn = document.getElementById('download-lighten-btn');

    var _lastResult = null;

    function getAmount() {
      return parseInt(amountSlider.value, 10);
    }

    function render() {
      var imageData = ImageManager.getImageData();
      if (!imageData) return;

      var amount = getAmount();
      amountLabel.textContent = amount + '%';

      _lastResult = lighten(imageData, amount);

      drawImageDataToCanvas(imageData, originalCanvas);
      drawImageDataToCanvas(_lastResult.imageData, resultCanvas);
    }

    amountSlider.addEventListener('input', render);

    // ── Promote button ─────────────────────────

    var promoteBtn = createPromoteButton(
      function () { return _lastResult ? _lastResult.imageData : null; },
      function () { return 'Lightened (' + getAmount() + '%)'; }
    );
    document.getElementById('lighten-promote-spot').appendChild(promoteBtn);

    downloadBtn.addEventListener('click', function () {
      if (_lastResult) {
        downloadImageData(_lastResult.imageData, 'lightened.png');
      }
    });

    return render;
  }
});

// cropTool.js
// Tool module for cropping. Registers with ToolShell.
// Depends on: crop.js (pure functions), app.js (ImageManager, ToolShell, canvas helpers)
//             settings.js (Settings persistence)

ToolShell.register({
  id: 'crop',
  name: 'Crop',
  icon: '\u2702\uFE0F',  // ✂️

  mount: function (container) {
    var canvas = document.getElementById('crop-canvas');
    var applyBtn = document.getElementById('crop-apply-btn');
    var downloadBtn = document.getElementById('download-crop-btn');
    var rotateBtn = document.getElementById('crop-rotate-btn');
    var aspectLabel = document.getElementById('crop-aspect-label');

    // ── State ──────────────────────────────────
    var _imageData = null;       // current source ImageData
    var _rect = null;            // { x, y, w, h } in image pixels
    var _dragMode = null;        // 'move' | 'nw' | 'ne' | 'sw' | 'se'
    var _dragStart = null;       // { mx, my, rect } — mouse coords at drag start
    var _preset = 'free';
    var _landscape = true;       // orientation flag

    // ── Preset definitions ─────────────────────
    var PRESETS = {
      'free':   null,
      '1:1':    { w: 1, h: 1 },
      '4:5':    { w: 4, h: 5 },
      '3:4':    { w: 3, h: 4 },
      '2:3':    { w: 2, h: 3 },
      '5:7':    { w: 5, h: 7 },
      '11:14':  { w: 11, h: 14 },
      'golden': { w: 1618, h: 1000 }
    };

    // ── Settings persistence ───────────────────
    var savedPreset = Settings.getString('painting-tools.crop.preset', 'free');
    if (savedPreset && PRESETS[savedPreset] !== undefined) {
      _preset = savedPreset;
    }
    _landscape = Settings.getBool('painting-tools.crop.landscape', _landscape);

    // ── Helpers ────────────────────────────────

    function getAspect() {
      var base = PRESETS[_preset];
      if (!base) return null; // free
      return _landscape ? base : { w: base.h, h: base.w };
    }

    function updateAspectLabel() {
      var aspect = getAspect();
      if (!aspect) {
        aspectLabel.textContent = 'Free';
      } else {
        var ratio = (aspect.w / aspect.h).toFixed(3);
        aspectLabel.textContent = (_landscape ? 'Landscape' : 'Portrait') + ' (' + ratio + ':1)';
      }
    }

    function initRect() {
      if (!_imageData) return;
      var aspect = getAspect();
      if (aspect) {
        _rect = largestRectForAspect(_imageData.width, _imageData.height, aspect.w, aspect.h);
      } else {
        // Free: start with a centered 80% rect
        var w = Math.round(_imageData.width * 0.8);
        var h = Math.round(_imageData.height * 0.8);
        _rect = {
          x: Math.round((_imageData.width - w) / 2),
          y: Math.round((_imageData.height - h) / 2),
          w: w,
          h: h
        };
      }
    }

    function syncRadioUI() {
      var radios = container.querySelectorAll('input[name="crop-preset"]');
      for (var i = 0; i < radios.length; i++) {
        radios[i].checked = (radios[i].value === _preset);
      }
    }

    // ── Rendering ──────────────────────────────

    function render() {
      if (!_imageData || !_rect) return;

      var imgW = _imageData.width;
      var imgH = _imageData.height;

      // Set canvas backing to full image resolution
      canvas.width = imgW;
      canvas.height = imgH;

      // CSS-scale the canvas to fit the container
      var maxW = Math.min(canvas.parentElement.clientWidth - 16, 540);
      var scale = Math.min(1, maxW / imgW);
      canvas.style.width = Math.round(imgW * scale) + 'px';
      canvas.style.height = Math.round(imgH * scale) + 'px';

      var ctx = canvas.getContext('2d');
      ctx.putImageData(_imageData, 0, 0);

      var r = _rect;
      var aspect = getAspect();

      // ── Dim exterior ───────────────────────
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';

      // Top
      if (r.y > 0) ctx.fillRect(0, 0, imgW, r.y);
      // Bottom
      if (r.y + r.h < imgH) ctx.fillRect(0, r.y + r.h, imgW, imgH - r.y - r.h);
      // Left (within vertical span)
      if (r.x > 0) ctx.fillRect(0, r.y, r.x, r.h);
      // Right
      if (r.x + r.w < imgW) ctx.fillRect(r.x + r.w, r.y, imgW - r.x - r.w, r.h);

      // ── Rule-of-thirds lines ───────────────
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      var thirdW = r.w / 3;
      var thirdH = r.h / 3;

      // Vertical thirds
      ctx.beginPath();
      ctx.moveTo(r.x + thirdW, r.y);
      ctx.lineTo(r.x + thirdW, r.y + r.h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(r.x + 2 * thirdW, r.y);
      ctx.lineTo(r.x + 2 * thirdW, r.y + r.h);
      ctx.stroke();

      // Horizontal thirds
      ctx.beginPath();
      ctx.moveTo(r.x, r.y + thirdH);
      ctx.lineTo(r.x + r.w, r.y + thirdH);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(r.x, r.y + 2 * thirdH);
      ctx.lineTo(r.x + r.w, r.y + 2 * thirdH);
      ctx.stroke();

      ctx.restore();

      // ── Crop rect border ───────────────────
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();

      // ── Corner handles (8×8 px squares) ────
      var handleSize = 10;
      var half = handleSize / 2;
      var corners = [
        { x: r.x, y: r.y },           // nw
        { x: r.x + r.w, y: r.y },     // ne
        { x: r.x, y: r.y + r.h },     // sw
        { x: r.x + r.w, y: r.y + r.h } // se
      ];

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1;
      for (var ci = 0; ci < corners.length; ci++) {
        ctx.fillRect(corners[ci].x - half, corners[ci].y - half, handleSize, handleSize);
        ctx.strokeRect(corners[ci].x - half, corners[ci].y - half, handleSize, handleSize);
      }
    }

    // ── Pointer interaction ──────────────────

    function cssToImageCoords(cssX, cssY) {
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width;
      var scaleY = canvas.height / rect.height;
      return {
        x: (cssX - rect.left) * scaleX,
        y: (cssY - rect.top) * scaleY
      };
    }

    function handleAt(ix, iy) {
      if (!_rect) return null;
      var r = _rect;
      var threshold = 12; // CSS pixels threshold for handle hit
      // Convert threshold to image coordinates based on current scale
      var rect2 = canvas.getBoundingClientRect();
      var imgThreshold = threshold * (canvas.width / rect2.width);

      var corners = {
        nw: { x: r.x, y: r.y },
        ne: { x: r.x + r.w, y: r.y },
        sw: { x: r.x, y: r.y + r.h },
        se: { x: r.x + r.w, y: r.y + r.h }
      };

      for (var name in corners) {
        if (Math.abs(ix - corners[name].x) <= imgThreshold &&
            Math.abs(iy - corners[name].y) <= imgThreshold) {
          return name;
        }
      }
      return null;
    }

    function isInsideRect(ix, iy) {
      if (!_rect) return false;
      return ix >= _rect.x && ix <= _rect.x + _rect.w &&
             iy >= _rect.y && iy <= _rect.y + _rect.h;
    }

    function onPointerDown(e) {
      if (!_imageData || !_rect) return;
      e.preventDefault();

      var coords = cssToImageCoords(e.clientX, e.clientY);

      var handle = handleAt(coords.x, coords.y);
      if (handle) {
        _dragMode = handle;
        _dragStart = { mx: coords.x, my: coords.y, rect: { x: _rect.x, y: _rect.y, w: _rect.w, h: _rect.h } };
        return;
      }

      if (isInsideRect(coords.x, coords.y)) {
        _dragMode = 'move';
        _dragStart = { mx: coords.x, my: coords.y, rect: { x: _rect.x, y: _rect.y, w: _rect.w, h: _rect.h } };
        return;
      }

      // Click outside → create new rect (centered on click point)
      var aspect = getAspect();
      if (aspect) {
        // Center a preset-sized rect on the click point, capped to image
        var size = Math.min(_imageData.width * 0.6, _imageData.height * 0.6);
        var newW = Math.round(size);
        var newH = Math.round(size * aspect.h / aspect.w);
        // But ensure it fits in the image
        if (newW > _imageData.width || newH > _imageData.height) {
          newW = Math.round(_imageData.width * 0.8);
          newH = Math.round(newW * aspect.h / aspect.w);
          if (newH > _imageData.height) {
            newH = Math.round(_imageData.height * 0.8);
            newW = Math.round(newH * aspect.w / aspect.h);
          }
        }
        _rect = clampRect({
          x: Math.round(coords.x - newW / 2),
          y: Math.round(coords.y - newH / 2),
          w: newW,
          h: newH
        }, _imageData.width, _imageData.height, 32);
      } else {
        // Free: start with a 200×200 centered on click
        _rect = clampRect({
          x: Math.round(coords.x - 100),
          y: Math.round(coords.y - 100),
          w: 200,
          h: 200
        }, _imageData.width, _imageData.height, 32);
      }
      render();
    }

    function onPointerMove(e) {
      if (!_dragMode || !_dragStart || !_imageData) return;
      e.preventDefault();

      var coords = cssToImageCoords(e.clientX, e.clientY);
      var dx = coords.x - _dragStart.mx;
      var dy = coords.y - _dragStart.my;
      var startRect = _dragStart.rect;
      var aspect = getAspect();

      if (_dragMode === 'move') {
        var newX = startRect.x + dx;
        var newY = startRect.y + dy;
        _rect = clampRect({ x: newX, y: newY, w: startRect.w, h: startRect.h },
          _imageData.width, _imageData.height, 32);
      } else {
        _rect = resizeRect(startRect, _dragMode, dx, dy, aspect,
          _imageData.width, _imageData.height);
      }

      render();

      // Update cursor style
      if (_dragMode !== 'move') {
        canvas.style.cursor = _dragMode + '-resize';
      } else {
        canvas.style.cursor = 'move';
      }
    }

    function onPointerUp(e) {
      if (!_dragMode) return;
      _dragMode = null;
      _dragStart = null;
      canvas.style.cursor = 'crosshair';
    }

    // ── Listeners ─────────────────────────────

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // ── Preset radio change ──────────────────

    function onPresetChange() {
      var radios = container.querySelectorAll('input[name="crop-preset"]');
      var newPreset = getCheckedValue(radios, 'free');
      if (newPreset !== _preset) {
        _preset = newPreset;
        Settings.set('painting-tools.crop.preset', _preset);
        initRect();
        render();
        updateAspectLabel();
      }
    }

    var presetRadios = container.querySelectorAll('input[name="crop-preset"]');
    for (var pi = 0; pi < presetRadios.length; pi++) {
      presetRadios[pi].addEventListener('change', onPresetChange);
    }

    // ── Rotate button ─────────────────────────

    rotateBtn.addEventListener('click', function () {
      _landscape = !_landscape;
      Settings.set('painting-tools.crop.landscape', _landscape);
      initRect();
      render();
      updateAspectLabel();
    });

    // ── Apply Crop ────────────────────────────

    applyBtn.addEventListener('click', function () {
      if (!_imageData || !_rect) return;
      var result = cropImageData(_imageData, _rect);
      var label = 'Cropped (' + _rect.w + '\u00D7' + _rect.h + ')';
      ImageManager.setImageData(result, label);
    });

    // ── Download ──────────────────────────────

    downloadBtn.addEventListener('click', function () {
      if (!_imageData || !_rect) return;
      var result = cropImageData(_imageData, _rect);
      downloadImageData(result, 'cropped.png');
    });

    // ── Promote button ────────────────────────

    var promoteBtn = createPromoteButton(
      function () {
        if (!_imageData || !_rect) return null;
        return cropImageData(_imageData, _rect);
      },
      function () {
        if (!_rect) return 'Cropped';
        return 'Cropped (' + _rect.w + '\u00D7' + _rect.h + ')';
      }
    );
    document.getElementById('crop-promote-spot').appendChild(promoteBtn);

    // ── Render function (called on image load and resize) ──

    function process(imageData) {
      var dimsChanged = !_imageData || _imageData.width !== imageData.width || _imageData.height !== imageData.height;
      _imageData = imageData;
      // Restore saved state
      syncRadioUI();
      if (dimsChanged || !_rect) initRect();
      render();
      updateAspectLabel();
    }

    return process;
  }
});

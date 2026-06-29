// colorTool.js
// Tool module for the Color Mixer. Registers with ToolShell.
// Depends on: colorMix.js (pure functions)
//             app.js (ImageManager, ToolShell)

ToolShell.register({
  id: 'color',
  name: 'Color Mixer',
  icon: '\uD83C\uDFA8',  // 🎨

  mount: function (container) {
    var PALETTE_STORAGE_KEY = 'painting-tools.palette.v2';
    var RADIUS_STORAGE_KEY = 'painting-tools.color.radius';

    var mainCanvas = document.getElementById('color-canvas');
    var overlay = document.getElementById('color-overlay');
    var stage = document.getElementById('color-stage');
    var radiusSlider = document.getElementById('color-radius');
    var radiusLabel = document.getElementById('color-radius-label');
    var resultEl = document.getElementById('color-result');
    var listEl = document.getElementById('palette-list');
    var addBtn = document.getElementById('palette-add-btn');
    var resetBtn = document.getElementById('palette-reset-btn');

    var mainCtx = mainCanvas.getContext('2d');
    var overlayCtx = overlay.getContext('2d');

    var _scale = 1;            // displayed px per image px
    var _sampleImg = null;     // { x, y } in image pixel space, or null

    // ── Palette persistence ──────────────────────────

    function loadPalette() {
      try {
        var raw = localStorage.getItem(PALETTE_STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) return parsed;
        }
        // Migrate v1 palette: add missing strength field.
        var v1Raw = localStorage.getItem('painting-tools.palette.v1');
        if (v1Raw) {
          var v1 = JSON.parse(v1Raw);
          if (Array.isArray(v1) && v1.length) {
            for (var vi = 0; vi < v1.length; vi++) {
              if (v1[vi].strength == null) v1[vi].strength = 1;
            }
            // Persist to v2 before dropping v1 so the migration survives a
            // reload even if the user never edits the palette.
            localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(v1));
            localStorage.removeItem('painting-tools.palette.v1');
            return v1;
          }
        }
      } catch (e) { /* ignore — fall back to default */ }
      return DEFAULT_PALETTE.map(function (p) { return { name: p.name, hex: p.hex, strength: p.strength != null ? p.strength : 1 }; });
    }

    function savePalette() {
      try {
        localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palette));
      } catch (e) { /* storage unavailable — keep in memory only */ }
    }

    var palette = loadPalette();

    // ── Sample size persistence ─────────────────────

    function getRadiusPx() {
      return parseInt(radiusSlider.value, 10);
    }

    // ── Drawing the image + circle ───────────────────

    function drawImage() {
      var imageData = ImageManager.getImageData();
      if (!imageData) return;

      mainCanvas.width = imageData.width;
      mainCanvas.height = imageData.height;
      mainCtx.putImageData(imageData, 0, 0);

      var maxW = Math.min(stage.parentElement.clientWidth - 16, 540);
      _scale = Math.min(1, maxW / imageData.width);
      var dispW = Math.round(imageData.width * _scale);
      var dispH = Math.round(imageData.height * _scale);

      mainCanvas.style.width = dispW + 'px';
      mainCanvas.style.height = dispH + 'px';

      // Overlay matches the displayed size so we can draw in CSS pixels.
      overlay.width = dispW;
      overlay.height = dispH;
      overlay.style.width = dispW + 'px';
      overlay.style.height = dispH + 'px';
    }

    function drawCircle(cssX, cssY) {
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
      var r = getRadiusPx();
      overlayCtx.lineWidth = 2;
      overlayCtx.strokeStyle = '#ffffff';
      overlayCtx.beginPath();
      overlayCtx.arc(cssX, cssY, r, 0, Math.PI * 2);
      overlayCtx.stroke();
      overlayCtx.strokeStyle = 'rgba(0,0,0,0.7)';
      overlayCtx.lineWidth = 1;
      overlayCtx.beginPath();
      overlayCtx.arc(cssX, cssY, r + 1, 0, Math.PI * 2);
      overlayCtx.stroke();
    }

    function clearCircle() {
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    }

    // ── Sampling + recipe ────────────────────────────

    function sampleAt(cssX, cssY) {
      var imageData = ImageManager.getImageData();
      if (!imageData) return;
      _sampleImg = { x: cssX / _scale, y: cssY / _scale };
      runMatch();
    }

    function runMatch() {
      var imageData = ImageManager.getImageData();
      if (!imageData || !_sampleImg) return;

      var radiusImg = getRadiusPx() / _scale;
      var target = averageColor(imageData, _sampleImg.x, _sampleImg.y, radiusImg);
      var recipe = matchColor(target, palette, { maxPaints: 3, step: 2 });

      drawCircle(_sampleImg.x * _scale, _sampleImg.y * _scale);
      renderResult(target, recipe);
    }

    function renderResult(target, recipe) {
      var targetHex = rgbToHex(target);
      var rows = recipe.entries.map(function (e) {
        return '<div class="recipe-row">' +
          '<span class="recipe-swatch" style="background:' + e.hex + '"></span>' +
          '<span class="recipe-name">' + escapeHtml(e.name) + '</span>' +
          '<span class="recipe-bar"><span style="width:' + e.percent + '%"></span></span>' +
          '<span class="recipe-percent">' + e.percent + '%</span>' +
          '</div>';
      }).join('');

      var absDL = Math.abs(recipe.dL);
      var isValueMiss = recipe.valueHint !== null;
      var isHueMiss = !recipe.chromaReachable;

      var quality;
      if (!isHueMiss && !isValueMiss) {
        // Close match: chroma and value are both close.
        quality = '<div class="match-quality reachable">Close match \u2014 \u0394E ' +
          recipe.deltaE.toFixed(1) + ' (within paint gamut)</div>';
      } else if (!isHueMiss && isValueMiss) {
        // Hue reachable, adjust value.
        var dir = recipe.valueHint === 'lighten' ? 'lighten (add white)' : 'darken (add black)';
        var pctHint = Math.round(absDL);
        quality = '<div class="match-quality value-adjust">' +
          'Mix this hue, then <strong>' + dir + '</strong> to adjust value by ~' + pctHint + ' L* units.' +
          ' <span class="delta-note">' +
          '(\u0394E ' + recipe.deltaE.toFixed(1) + ', \u0394L ' +
          (recipe.dL > 0 ? '+' : '') + recipe.dL.toFixed(1) + ', ' +
          '\u0394C ' + recipe.dC.toFixed(1) + ')' +
          '</span></div>';
      } else {
        // Out of gamut: chroma/hue beyond the pigments.
        quality = '<div class="match-quality unreachable">' +
          'Best possible \u0394E ' + recipe.deltaE.toFixed(1) +
          ' \u2014 this hue is beyond these paints\u2019 gamut.' +
          ' The swatch shows the closest mixable color.' +
          ' <span class="delta-note">' +
          '(\u0394C ' + recipe.dC.toFixed(1) + ', ' +
          '\u0394L ' + (recipe.dL > 0 ? '+' : '') + recipe.dL.toFixed(1) + ')' +
          '</span></div>';
      }

      resultEl.innerHTML =
        '<div class="swatch-pair">' +
          '<div class="swatch">' +
            '<div class="swatch-chip" style="background:' + targetHex + '"></div>' +
            '<div class="swatch-label">Sampled (screen)</div>' +
            '<div class="swatch-value">' + targetHex + '</div>' +
          '</div>' +
          '<div class="swatch">' +
            '<div class="swatch-chip" style="background:' + recipe.hex + '"></div>' +
            '<div class="swatch-label">Mixed paint</div>' +
            '<div class="swatch-value">' + recipe.hex + '</div>' +
          '</div>' +
        '</div>' +
        quality +
        '<div class="recipe-list">' + rows + '</div>';
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    // ── Palette editor ───────────────────────────────

    function renderPalette() {
      listEl.innerHTML = '';
      palette.forEach(function (paint, i) {
        var row = document.createElement('div');
        row.className = 'palette-item';

        var color = document.createElement('input');
        color.type = 'color';
        color.value = paint.hex;
        color.addEventListener('input', function () {
          palette[i].hex = color.value;
          savePalette();
          runMatch();
        });

        var name = document.createElement('input');
        name.type = 'text';
        name.value = paint.name;
        name.addEventListener('input', function () {
          palette[i].name = name.value;
          savePalette();
        });

        var strength = document.createElement('input');
        strength.type = 'number';
        strength.className = 'palette-strength';
        strength.value = paint.strength != null ? paint.strength : 1;
        strength.min = '0.1';
        strength.step = '0.5';
        strength.title = 'Tinting strength (higher = more dominant)';
        strength.addEventListener('input', function () {
          palette[i].strength = parseFloat(strength.value) || 1;
          savePalette();
          runMatch();
        });

        var remove = document.createElement('button');
        remove.className = 'palette-remove';
        remove.textContent = '\u00d7';
        remove.title = 'Remove paint';
        remove.addEventListener('click', function () {
          if (palette.length <= 1) return; // keep at least one paint
          palette.splice(i, 1);
          savePalette();
          renderPalette();
          runMatch();
        });

        row.appendChild(color);
        row.appendChild(name);
        row.appendChild(strength);
        row.appendChild(remove);
        listEl.appendChild(row);
      });
    }

    // ── Events ───────────────────────────────────────

    stage.addEventListener('pointermove', function (e) {
      var rect = mainCanvas.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      // Live preview circle; the persisted sample (if any) is restored on leave.
      drawCircle(x, y);
    });

    stage.addEventListener('pointerleave', function () {
      if (_sampleImg) drawCircle(_sampleImg.x * _scale, _sampleImg.y * _scale);
      else clearCircle();
    });

    stage.addEventListener('pointerdown', function (e) {
      var rect = mainCanvas.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      x = Math.max(0, Math.min(rect.width, x));
      y = Math.max(0, Math.min(rect.height, y));
      sampleAt(x, y);
    });

    radiusSlider.addEventListener('input', function () {
      var val = getRadiusPx();
      radiusLabel.textContent = val + ' px';
      Settings.set(RADIUS_STORAGE_KEY, val);
      runMatch();
    });

    addBtn.addEventListener('click', function () {
      palette.push({ name: 'New Paint', hex: '#808080', strength: 1 });
      savePalette();
      renderPalette();
    });

    resetBtn.addEventListener('click', function () {
      palette = DEFAULT_PALETTE.map(function (p) { return { name: p.name, hex: p.hex, strength: p.strength != null ? p.strength : 1 }; });
      savePalette();
      renderPalette();
      runMatch();
    });

    renderPalette();

    // Restore saved circle size.
    var savedRadius = Settings.getInt(RADIUS_STORAGE_KEY, parseInt(radiusSlider.value, 10));
    radiusSlider.value = savedRadius;
    radiusLabel.textContent = savedRadius + ' px';

    // Called by the shell on image load / resize.
    return function (imageData) {
      drawImage();
      if (_sampleImg) runMatch();
      else { clearCircle(); }
    };
  }
});

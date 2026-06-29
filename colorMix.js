// colorMix.js
// Pure functions for the Color Mixer tool.
//
// The core idea: a screen shows ADDITIVE color (transmitted light, RGB),
// while paint is SUBTRACTIVE (reflected light — pigments absorb wavelengths).
// Averaging RGB simulates mixing light, not paint: RGB-averaging blue + yellow
// yields gray, but real paint yields green. So we mix in reflectance space
// using the Kubelka-Munk single-constant model:
//
//   K/S = (1 - R)^2 / (2R)          (reflectance R -> absorption/scatter ratio)
//   (K/S)_mix = Σ wᵢ · (K/S)ᵢ       (mix by weight in K/S space)
//   R = 1 + (K/S) - sqrt((K/S)^2 + 2·(K/S))   (invert back to reflectance)
//
// done per RGB channel in LINEAR light. This makes blue+yellow→green and
// mixing everything→mud (never brighter than white), like real pigment.
//
// Exposed: DEFAULT_PALETTE, hexToRgb, rgbToHex, averageColor, mixPaints,
//          rgbToLab, deltaE, matchColor.

var DEFAULT_PALETTE = [
  { name: 'Cadmium Scarlet', hex: '#e2452f' },
  { name: 'Phthalo Blue',    hex: '#14346e' },
  { name: 'Burnt Umber',     hex: '#5f3d26' },
  { name: 'Yellow Ochre',    hex: '#c8963c' },
  { name: 'Flake White',     hex: '#f5f4ea' },
  { name: 'Titanium White',  hex: '#fbfbf6', strength: 1 },
  { name: 'Ivory Black',     hex: '#1b1b1b', strength: 1 },
  { name: 'Ultramarine Blue',hex: '#34378a' },
  { name: 'Lemon Yellow',    hex: '#f0e64a' },
  { name: 'Alizarin Crimson',hex: '#8a1f37' }
];

// ── Color conversions ─────────────────────────────────────

function hexToRgb(hex) {
  var h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

function rgbToHex(rgb) {
  function h(v) {
    var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
    return s.length === 1 ? '0' + s : s;
  }
  return '#' + h(rgb.r) + h(rgb.g) + h(rgb.b);
}

// sRGB (0-1) ↔ linear-light (0-1)
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// ── Average color inside a circle ──────────────────────────

/**
 * Average the RGB of all pixels whose center lies within `radius` of (cx, cy).
 * Fully transparent pixels are skipped. Coordinates are in image pixel space.
 *
 * @param {ImageData} imageData
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @returns {{r:number,g:number,b:number}}
 */
function averageColor(imageData, cx, cy, radius) {
  var data = imageData.data;
  var w = imageData.width;
  var h = imageData.height;
  var r2 = radius * radius;

  var x0 = Math.max(0, Math.floor(cx - radius));
  var x1 = Math.min(w - 1, Math.ceil(cx + radius));
  var y0 = Math.max(0, Math.floor(cy - radius));
  var y1 = Math.min(h - 1, Math.ceil(cy + radius));

  var sr = 0, sg = 0, sb = 0, n = 0;
  for (var y = y0; y <= y1; y++) {
    var dy = y - cy;
    for (var x = x0; x <= x1; x++) {
      var dx = x - cx;
      if (dx * dx + dy * dy > r2) continue;
      var i = (y * w + x) * 4;
      if (data[i + 3] === 0) continue; // skip transparent
      sr += data[i];
      sg += data[i + 1];
      sb += data[i + 2];
      n++;
    }
  }
  if (n === 0) {
    // Degenerate (radius < 1px): sample the single nearest pixel.
    var px = Math.max(0, Math.min(w - 1, Math.round(cx)));
    var py = Math.max(0, Math.min(h - 1, Math.round(cy)));
    var j = (py * w + px) * 4;
    return { r: data[j], g: data[j + 1], b: data[j + 2] };
  }
  return {
    r: Math.round(sr / n),
    g: Math.round(sg / n),
    b: Math.round(sb / n)
  };
}

// ── Kubelka-Munk subtractive paint mixing ─────────────────

function ksFromR(R) {
  // Clamp to keep K/S finite (R=0 → ∞, R=1 → 0).
  R = Math.max(0.005, Math.min(0.995, R));
  return (1 - R) * (1 - R) / (2 * R);
}
function rFromKs(ks) {
  return 1 + ks - Math.sqrt(ks * ks + 2 * ks);
}

/**
 * Mix paints subtractively (Kubelka-Munk) and return the resulting sRGB.
 *
 * @param {Array<{r:number,g:number,b:number}>} paints
 * @param {number[]} weights - relative amounts; normalized internally.
 * @param {number[]} [strengths] - optional per-pigment tinting strength
 *   multipliers (default 1.0 each). Effective weight = weight × strength.
 * @returns {{r:number,g:number,b:number}}
 */
function mixPaints(paints, weights, strengths) {
  // Apply strength multipliers to compute effective weights.
  var n = weights.length;
  var effective = [];
  for (var i = 0; i < n; i++) {
    var s = strengths ? (strengths[i] != null ? strengths[i] : 1) : 1;
    effective[i] = weights[i] * s;
  }
  var total = 0;
  for (var w2 = 0; w2 < effective.length; w2++) total += effective[w2];
  if (total <= 0) return { r: 0, g: 0, b: 0 };

  var channels = ['r', 'g', 'b'];
  var out = {};
  for (var c = 0; c < 3; c++) {
    var ch = channels[c];
    var ksMix = 0;
    for (var p = 0; p < paints.length; p++) {
      var lin = srgbToLinear(paints[p][ch] / 255);
      ksMix += (effective[p] / total) * ksFromR(lin);
    }
    var Rmix = rFromKs(ksMix);
    out[ch] = Math.round(linearToSrgb(Rmix) * 255);
  }
  return out;
}

// ── CIELAB ΔE (perceptual closeness) ──────────────────────

function rgbToLab(rgb) {
  var rl = srgbToLinear(rgb.r / 255);
  var gl = srgbToLinear(rgb.g / 255);
  var bl = srgbToLinear(rgb.b / 255);

  // linear sRGB → XYZ (D65)
  var X = rl * 0.4124 + gl * 0.3576 + bl * 0.1805;
  var Y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  var Z = rl * 0.0193 + gl * 0.1192 + bl * 0.9505;

  // normalize by D65 white
  X /= 0.95047; Y /= 1.0; Z /= 1.08883;

  function f(t) {
    return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
  }
  var fx = f(X), fy = f(Y), fz = f(Z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

function deltaE(lab1, lab2) {
  var dL = lab1.L - lab2.L;
  var da = lab1.a - lab2.a;
  var db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

// ── Recipe solver ─────────────────────────────────────────

function combinations(n, k) {
  var result = [];
  (function pick(start, combo) {
    if (combo.length === k) { result.push(combo.slice()); return; }
    for (var i = start; i < n; i++) {
      combo.push(i);
      pick(i + 1, combo);
      combo.pop();
    }
  })(0, []);
  return result;
}

// Enumerate positive integer tuples of length k that sum to `units`.
function compositions(units, k) {
  var result = [];
  (function place(remaining, parts) {
    if (parts.length === k - 1) {
      if (remaining >= 1) result.push(parts.concat(remaining));
      return;
    }
    var max = remaining - (k - 1 - parts.length); // leave ≥1 for the rest
    for (var v = 1; v <= max; v++) {
      parts.push(v);
      place(remaining - v, parts);
      parts.pop();
    }
  })(units, []);
  return result;
}

/**
 * Find paint proportions whose subtractive mix best matches `target`.
 *
 * Searches recipes of 1..maxPaints pigments, with percentages on a grid of
 * `step`% (default 2). Prefers simpler recipes: a larger recipe is only
 * chosen if it beats the best smaller one by more than `improveBy` ΔE.
 *
 * @param {{r:number,g:number,b:number}} target - sampled (screen) color
 * @param {Array<{name:string,hex:string,strength?:number}>} palette
 * @param {{maxPaints?:number, step?:number, improveBy?:number,
 *          chromaTolerance?:number, valueHintThreshold?:number}} [opts]
 * @returns {{entries:Array<{name:string,hex:string,percent:number}>,
 *            mixed:{r:number,g:number,b:number}, hex:string,
 *            deltaE:number, reachable:boolean,
 *            dL:number, dC:number, valueHint:string|null,
 *            chromaReachable:boolean}}
 */
function matchColor(target, palette, opts) {
  opts = opts || {};
  var maxPaints = opts.maxPaints || 3;
  var step = opts.step || 2;
  var improveBy = opts.improveBy != null ? opts.improveBy : 1.0;
  var chromaTolerance = opts.chromaTolerance != null ? opts.chromaTolerance : 6;
  var valueHintThreshold = opts.valueHintThreshold != null ? opts.valueHintThreshold : 2;

  var rgbs = palette.map(function (p) { return hexToRgb(p.hex); });
  var strengths = palette.map(function (p) { return p.strength != null ? p.strength : 1; });
  var targetLab = rgbToLab(target);
  var units = Math.round(100 / step);

  var best = null;
  maxPaints = Math.min(maxPaints, palette.length);

  for (var size = 1; size <= maxPaints; size++) {
    var combos = combinations(palette.length, size);
    var parts = size === 1 ? [[units]] : compositions(units, size);

    var bestForSize = null;
    for (var ci = 0; ci < combos.length; ci++) {
      var idx = combos[ci];
      var paints = idx.map(function (i) { return rgbs[i]; });
      var idxStrengths = idx.map(function (i) { return strengths[i]; });
      for (var pi = 0; pi < parts.length; pi++) {
        var weights = parts[pi];
        var mixed = mixPaints(paints, weights, idxStrengths);
        var d = deltaE(rgbToLab(mixed), targetLab);
        if (!bestForSize || d < bestForSize.deltaE) {
          bestForSize = { idx: idx, weights: weights, mixed: mixed, deltaE: d };
        }
      }
    }

    if (!best || bestForSize.deltaE < best.deltaE - improveBy) {
      best = bestForSize;
    }
  }

  var entries = best.idx.map(function (i, k) {
    return {
      name: palette[i].name,
      hex: palette[i].hex,
      percent: Math.round((best.weights[k] / units) * 100)
    };
  }).sort(function (a, b) { return b.percent - a.percent; });

  // ── Value/chroma decomposition ───────────────────────
  var mixedLab = rgbToLab(best.mixed);
  var dL = targetLab.L - mixedLab.L;   // positive → target lighter
  var da = targetLab.a - mixedLab.a;
  var db = targetLab.b - mixedLab.b;
  var dC = Math.sqrt(da * da + db * db);

  var chromaReachable = dC <= chromaTolerance;
  var valueHint = null;
  if (chromaReachable) {
    if (dL > valueHintThreshold) valueHint = 'lighten';
    else if (dL < -valueHintThreshold) valueHint = 'darken';
  }

  return {
    entries: entries,
    mixed: best.mixed,
    hex: rgbToHex(best.mixed),
    deltaE: best.deltaE,
    reachable: chromaReachable,
    dL: dL,
    dC: dC,
    valueHint: valueHint,
    chromaReachable: chromaReachable
  };
}

// ── Exports ───────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_PALETTE: DEFAULT_PALETTE,
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    averageColor: averageColor,
    mixPaints: mixPaints,
    rgbToLab: rgbToLab,
    deltaE: deltaE,
    matchColor: matchColor
  };
}

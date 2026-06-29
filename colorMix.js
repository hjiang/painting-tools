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
  // Tinting strengths approximate Winsor & Newton Artists' Oil Colour.
  // Phthalo Blue is ~5× stronger than Flake White (the baseline at 1.0);
  // Yellow Ochre, a natural earth, is ~0.5× (weakest in the set).
  { name: 'Cadmium Scarlet', hex: '#e2452f', strength: 2.0 },
  { name: 'Phthalo Blue',    hex: '#14346e', strength: 5.0 },
  { name: 'Burnt Umber',     hex: '#5f3d26', strength: 0.8 },
  { name: 'Yellow Ochre',    hex: '#c8963c', strength: 0.5 },
  { name: 'Flake White',     hex: '#f5f4ea', strength: 1.0 },
  { name: 'Titanium White',  hex: '#fbfbf6', strength: 3.0 },
  { name: 'Ivory Black',     hex: '#1b1b1b', strength: 1.5 },
  { name: 'Ultramarine Blue',hex: '#34378a', strength: 1.5 },
  { name: 'Lemon Yellow',    hex: '#f0e64a', strength: 2.0 },
  { name: 'Alizarin Crimson',hex: '#8a1f37', strength: 1.8 }
];

// ── Winsor & Newton Artists' Oil Colour — full range ──────
// Strengths estimated from pigment codes; see PIGMENT_STRENGTH map.
var WN_COLORS = [
  { name: 'Lemon Yellow Hue', hex: '#F7EF79', strength: 2 },
  { name: 'Winsor Lemon', hex: '#FBEE34', strength: 1.5 },
  { name: 'Cadmium Lemon', hex: '#FCEE1E', strength: 2 },
  { name: 'Cadmium-Free Lemon', hex: '#ECDB14', strength: 1 },
  { name: 'Bismuth Yellow', hex: '#EAE84B', strength: 2 },
  { name: 'Transparent Yellow', hex: '#FBE802', strength: 2 },
  { name: 'Winsor Yellow', hex: '#F9E700', strength: 1.5 },
  { name: 'Chrome Yellow Hue', hex: '#FAE200', strength: 1.5 },
  { name: 'Cadmium Yellow Pale', hex: '#FCD700', strength: 2 },
  { name: 'Cadmium-Free Yellow Pale', hex: '#ECDB14', strength: 1 },
  { name: 'Indian Yellow Deep', hex: '#FED103', strength: 1.5 },
  { name: 'Indian Yellow', hex: '#F2B01D', strength: 1.2 },
  { name: 'Cadmium Yellow', hex: '#ED9A22', strength: 2 },
  { name: 'Cadmium-Free Yellow', hex: '#FAA21B', strength: 1 },
  { name: 'Winsor Yellow Deep', hex: '#EEA121', strength: 1.5 },
  { name: 'Cadmium Yellow Deep', hex: '#E68125', strength: 2 },
  { name: 'Cadmium-Free Yellow Deep', hex: '#F58220', strength: 1 },
  { name: 'Cadmium Orange', hex: '#DD6B26', strength: 2 },
  { name: 'Cadmium-Free Orange', hex: '#F26724', strength: 1 },
  { name: 'Winsor Orange', hex: '#E08A2A', strength: 2 },
  { name: 'Cadmium Scarlet', hex: '#D84226', strength: 2 },
  { name: 'Cadmium-Free Scarlet', hex: '#E63E30', strength: 1 },
  { name: 'Scarlet Lake', hex: '#D32027', strength: 2 },
  { name: 'Winsor Red', hex: '#CC2027', strength: 2.3 },
  { name: 'Cadmium Red', hex: '#D31F35', strength: 2 },
  { name: 'Cadmium-Free Red', hex: '#E12827', strength: 1 },
  { name: 'Bright Red', hex: '#CA202D', strength: 2.5 },
  { name: 'Winsor Red Deep', hex: '#BF202B', strength: 2.5 },
  { name: 'Cadmium Red Deep', hex: '#A71E2F', strength: 2 },
  { name: 'Cadmium-Free Red Deep', hex: '#A42036', strength: 1 },
  { name: 'Quinacridone Red', hex: '#EF3753', strength: 2.5 },
  { name: 'Pale Rose Blush', hex: '#FABEAE', strength: 1.2 },
  { name: 'Permanent Rose', hex: '#CA1F4B', strength: 2 },
  { name: 'Rose Doré', hex: '#E7948C', strength: 1.5 },
  { name: 'Rose Madder Genuine', hex: '#E1506D', strength: 1.5 },
  { name: 'Alizarin Crimson', hex: '#AC1F25', strength: 1.8 },
  { name: 'Permanent Alizarin Crimson', hex: '#C82036', strength: 2 },
  { name: 'Permanent Carmine', hex: '#BD2657', strength: 2 },
  { name: 'Quinacridone Magenta', hex: '#B4469A', strength: 2.5 },
  { name: 'Magenta', hex: '#A5206D', strength: 2.8 },
  { name: 'Permanent Magenta', hex: '#901D58', strength: 2 },
  { name: 'Purple Madder', hex: '#6B0B2C', strength: 1.5 },
  { name: 'Purple Lake', hex: '#502847', strength: 2 },
  { name: 'Cobalt Violet', hex: '#974287', strength: 1.5 },
  { name: 'Permanent Mauve', hex: '#622B67', strength: 2.5 },
  { name: 'Mauve (Blue Shade)', hex: '#372D77', strength: 3.3 },
  { name: 'Ultramarine Violet', hex: '#7D559A', strength: 1 },
  { name: 'Winsor Violet (Dioxazine)', hex: '#612E81', strength: 3 },
  { name: 'Prussian Blue', hex: '#233C78', strength: 1.5 },
  { name: 'Indanthrene Blue', hex: '#201D52', strength: 2.5 },
  { name: 'Cobalt Blue Deep', hex: '#2C3480', strength: 1.5 },
  { name: 'French Ultramarine', hex: '#054F96', strength: 1.5 },
  { name: 'Ultramarine (Green Shade)', hex: '#005FA6', strength: 1.5 },
  { name: 'Winsor Blue (Red Shade)', hex: '#035797', strength: 5 },
  { name: 'Winsor Blue (Green Shade)', hex: '#1E3868', strength: 5 },
  { name: 'Cerulean Blue', hex: '#4BA7C8', strength: 1.5 },
  { name: 'Cobalt Blue', hex: '#006DB4', strength: 1.5 },
  { name: 'Manganese Blue Hue', hex: '#1099D6', strength: 5 },
  { name: 'Phthalo Turquoise', hex: '#0D5A6B', strength: 5 },
  { name: 'Cobalt Turquoise', hex: '#007272', strength: 1.5 },
  { name: 'Cobalt Turquoise Light', hex: '#00B1A9', strength: 1.5 },
  { name: 'Cobalt Green', hex: '#024955', strength: 1.5 },
  { name: 'Cadmium Green Pale', hex: '#98CB4F', strength: 1.8 },
  { name: 'Cadmium-Free Green Pale', hex: '#98CB4F', strength: 1 },
  { name: 'Winsor Emerald', hex: '#2FA170', strength: 2.8 },
  { name: 'Permanent Green Light', hex: '#369244', strength: 3.2 },
  { name: 'Permanent Green', hex: '#369244', strength: 3.2 },
  { name: 'Permanent Green Deep', hex: '#238C44', strength: 3.2 },
  { name: 'Terre Verte', hex: '#A3C08B', strength: 0.8 },
  { name: 'Oxide of Chromium', hex: '#5F853B', strength: 1 },
  { name: 'Chrome Green Deep Hue', hex: '#20763B', strength: 3.5 },
  { name: 'Cobalt Chromite Green', hex: '#90B89A', strength: 1.5 },
  { name: 'Viridian', hex: '#1E9A5E', strength: 1.5 },
  { name: 'Winsor Green (Yellow Shade)', hex: '#2B8842', strength: 4 },
  { name: 'Winsor Green (Phthalo)', hex: '#007F4E', strength: 5 },
  { name: 'Prussian Green', hex: '#0E6C37', strength: 3.3 },
  { name: 'Sap Green', hex: '#236533', strength: 3.3 },
  { name: 'Olive Green', hex: '#3C4C24', strength: 1.5 },
  { name: 'Green Gold', hex: '#567434', strength: 1.5 },
  { name: 'Jaune Brillant', hex: '#F6CF3E', strength: 1.7 },
  { name: 'Naples Yellow Light', hex: '#FCF0A7', strength: 2 },
  { name: 'Naples Yellow', hex: '#F8D877', strength: 1.2 },
  { name: 'Naples Yellow Deep', hex: '#F1BD48', strength: 1.5 },
  { name: 'Yellow Ochre Pale', hex: '#E0A126', strength: 0.6 },
  { name: 'Yellow Ochre Light', hex: '#C7962C', strength: 0.5 },
  { name: 'Gold Ochre', hex: '#D69828', strength: 0.6 },
  { name: 'Yellow Ochre', hex: '#C18F32', strength: 0.5 },
  { name: 'Raw Sienna', hex: '#C9822A', strength: 0.6 },
  { name: 'Transparent Gold Ochre', hex: '#E3AC36', strength: 0.6 },
  { name: 'Burnt Sienna', hex: '#BB3726', strength: 0.8 },
  { name: 'Transparent Brown Oxide', hex: '#884D31', strength: 0.8 },
  { name: 'Transparent Maroon', hex: '#AD452F', strength: 1 },
  { name: 'Brown Ochre', hex: '#BA6D29', strength: 0.8 },
  { name: 'Transparent Red Ochre', hex: '#DC7134', strength: 0.5 },
  { name: 'Terra Rosa', hex: '#AF2025', strength: 0.8 },
  { name: 'Light Red', hex: '#89351D', strength: 0.8 },
  { name: 'Venetian Red', hex: '#901F1D', strength: 0.8 },
  { name: 'Indian Red', hex: '#AD452F', strength: 0.8 },
  { name: 'Mars Violet Deep', hex: '#87202C', strength: 0.8 },
  { name: 'Ruby Madder Alizarin', hex: '#973622', strength: 1.5 },
  { name: 'Burnt Umber', hex: '#633C16', strength: 0.8 },
  { name: 'Vandyke Brown', hex: '#221417', strength: 1 },
  { name: 'Raw Umber Light', hex: '#BF972D', strength: 0.8 },
  { name: 'Raw Umber (Green Shade)', hex: '#967C52', strength: 0.8 },
  { name: 'Raw Umber', hex: '#523420', strength: 0.8 },
  { name: "Davy's Gray", hex: '#C1BF9B', strength: 1 },
  { name: 'Charcoal Grey', hex: '#212222', strength: 1.5 },
  { name: 'Indigo', hex: '#0B5EAA', strength: 2.7 },
  { name: "Payne's Gray", hex: '#404348', strength: 1.2 },
  { name: 'Blue Black', hex: '#0A0F10', strength: 1.5 },
  { name: 'Mars Black', hex: '#161617', strength: 2 },
  { name: 'Ivory Black', hex: '#0C0B0A', strength: 1.5 },
  { name: 'Lamp Black', hex: '#0C0B0A', strength: 1.5 },
  { name: 'Perylene Black', hex: '#1F3327', strength: 1.5 },
  { name: 'Iridescent White', hex: '#FFFFFF', strength: 1 },
  { name: 'Flake White Hue', hex: '#FFFFFF', strength: 2 },
  { name: 'Titanium White', hex: '#FFFFFF', strength: 2 },
  { name: 'Underpainting White (Fast Drying)', hex: '#FFFFFF', strength: 2 },
  { name: 'Zinc White', hex: '#FFFFFF', strength: 1 },
  { name: 'Gold', hex: '#E9D491', strength: 1 },
  { name: 'Renaissance Gold', hex: '#DD9530', strength: 1 },
  { name: 'Copper', hex: '#CE702B', strength: 1 },
  { name: 'Bronze', hex: '#6E4D25', strength: 1 },
  { name: 'Pewter', hex: '#ACA29B', strength: 1 },
  { name: 'Silver', hex: '#BBBCBB', strength: 1 },
  { name: 'Mineral Grey', hex: '#BCB39B', strength: 1 },
  { name: 'Warm Brown Pink', hex: '#B88E70', strength: 1.5 },
  { name: 'Transparent Orange', hex: '#F48033', strength: 1 },
  { name: 'Cinnabar Green', hex: '#858668', strength: 1 },
  { name: 'Oriental Blue', hex: '#2D618F', strength: 5 },
  { name: 'Mineral Green Deep', hex: '#567551', strength: 1.5 },
  { name: "Smalt (Dumont's Blue)", hex: '#535E83', strength: 1 },
  { name: 'Ultramarine Ash', hex: '#C6C4C1', strength: 1 },
  { name: 'Ultramarine Pink', hex: '#DDA9BA', strength: 1.5 },
  { name: 'Warm White', hex: '#FFFEF0', strength: 1 }
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
    WN_COLORS: WN_COLORS,
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    averageColor: averageColor,
    mixPaints: mixPaints,
    rgbToLab: rgbToLab,
    deltaE: deltaE,
    matchColor: matchColor
  };
}

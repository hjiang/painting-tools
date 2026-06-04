// posterize.js
// Pure functions for value posterization.
//
// posterize(imageData, N, mode) → { imageData, histogram }
//   imageData  : ImageData (RGBA) at original resolution
//   N          : number of value levels (2–12)
//   mode       : 'grayscale' | 'color'
//   histogram  : number[N] — pixel count per value band

// ── RGB ↔ HSL conversion ──────────────────────────────────

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l }; // achromatic
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    case b: h = ((r - g) / d + 4) / 6; break;
  }

  return { h, s, l };
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

// ── Posterization ─────────────────────────────────────────

/**
 * Posterize an image to exactly N value levels.
 *
 * @param {ImageData} imageData - Source image pixels (RGBA).
 * @param {number} N - Number of value levels (1–12, clamped internally).
 * @param {'grayscale'|'color'} mode - Grayscale: quantize luminance.
 *   Color: quantize HSL lightness, preserve hue & saturation.
 * @returns {{ imageData: ImageData, histogram: number[] }}
 */
function posterize(imageData, N, mode) {
  N = Math.max(1, Math.min(12, N | 0));
  const { data, width, height } = imageData;
  const out = new Uint8ClampedArray(data.length);
  const histogram = new Array(N).fill(0);
  const bandWidth = 256 / N;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    let bandIdx, outR, outG, outB;

    if (mode === 'color') {
      // RGB → HSL, quantize lightness, HSL → RGB
      const hsl = rgbToHsl(r, g, b);
      const L255 = hsl.l * 255;
      bandIdx = Math.min(Math.floor(L255 / bandWidth), N - 1);
      const newL = (bandIdx * bandWidth + bandWidth / 2) / 255;
      const rgb = hslToRgb(hsl.h, hsl.s, newL);
      outR = rgb.r;
      outG = rgb.g;
      outB = rgb.b;
    } else {
      // Grayscale: luminance → quantize → R=G=B
      // Math.round fixes floating-point: 0.299+0.587+0.114 ≈ 0.99999 in IEEE 754
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      bandIdx = Math.min(Math.floor(lum / bandWidth), N - 1);
      const val = Math.round(bandIdx * bandWidth + bandWidth / 2);
      outR = outG = outB = val;
    }

    out[i] = outR;
    out[i + 1] = outG;
    out[i + 2] = outB;
    out[i + 3] = a;

    histogram[bandIdx]++;
  }

  return {
    imageData: new ImageData(out, width, height),
    histogram,
  };
}

// ── Exports ───────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { posterize, rgbToHsl, hslToRgb };
}

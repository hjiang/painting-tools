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

// ── Band Index Helpers ─────────────────────────────────────

/**
 * Compute the value band index for a 0–255 value.
 * Uses equal-interval bands: band = floor(v / (256/N)), clamped to [0, N-1].
 *
 * @param {number} v255 - Value in [0, 255] (values > 255 are clamped to N-1).
 * @param {number} N - Number of bands (1–12).
 * @returns {number} Band index in [0, N-1].
 */
function bandIndexForValue(v255, N) {
  const bandWidth = 256 / N;
  return Math.min(Math.floor(v255 / bandWidth), N - 1);
}

/**
 * Compute the posterization band index for a single pixel.
 * The band assignment is identical to posterize() for the given mode:
 *   - 'grayscale': Rec. 601 luminance → bandIndexForValue
 *   - 'color':     HSL L (×255) → bandIndexForValue
 *
 * @param {number} r - Red channel (0–255).
 * @param {number} g - Green channel (0–255).
 * @param {number} b - Blue channel (0–255).
 * @param {number} N - Number of bands (1–12).
 * @param {'grayscale'|'color'} mode
 * @returns {number} Band index in [0, N-1].
 */
function bandIndexForPixel(r, g, b, N, mode) {
  let v255;

  if (mode === 'color') {
    const hsl = rgbToHsl(r, g, b);
    v255 = hsl.l * 255;
  } else {
    v255 = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  return bandIndexForValue(v255, N);
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
      bandIdx = bandIndexForValue(L255, N);
      const newL = (bandIdx * bandWidth + bandWidth / 2) / 255;
      const rgb = hslToRgb(hsl.h, hsl.s, newL);
      outR = rgb.r;
      outG = rgb.g;
      outB = rgb.b;
    } else {
      // Grayscale: luminance → quantize → R=G=B
      // Math.round fixes floating-point: 0.299+0.587+0.114 ≈ 0.99999 in IEEE 754
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      bandIdx = bandIndexForValue(lum, N);
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

// ── Value Band Isolation ──────────────────────────────────

/**
 * Produce a mask showing only the pixels belonging to a single value band.
 * Selected band pixels → black (#000), all other pixels → white (#fff),
 * alpha preserved.
 *
 * @param {ImageData} imageData - Source image pixels (RGBA).
 * @param {number} N - Number of bands (2–12).
 * @param {number} bandIndex - Which band to isolate (0 ≤ bandIndex < N).
 * @param {'grayscale'|'color'} mode - Same band assignment as posterize().
 * @returns {{ imageData: ImageData }}
 */
function isolateBand(imageData, N, bandIndex, mode) {
  const { data, width, height } = imageData;
  const out = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    const idx = bandIndexForPixel(r, g, b, N, mode);

    if (idx === bandIndex) {
      // Selected band → black
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
    } else {
      // All others → white
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
    }
    out[i + 3] = a; // alpha preserved
  }

  return {
    imageData: new ImageData(out, width, height),
  };
}

// ── Exports ───────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { posterize, rgbToHsl, hslToRgb, bandIndexForValue, bandIndexForPixel, isolateBand };
}

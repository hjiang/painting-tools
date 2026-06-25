// lighten.js
// Pure function for lightening an image — blends each pixel toward white
// by a configurable percentage. Useful for saving ink when printing and
// creating faint reference images for markup / sketching over.
//
// lighten(imageData, amount) → { imageData }
//   imageData  : ImageData (RGBA) at original resolution
//   amount     : number (0–100), percentage toward white.
//                0 = no change, 100 = pure white.

/**
 * Lighten an image by blending every pixel toward white.
 *
 * Formula: output = channel + (255 - channel) * (amount / 100)
 * The alpha channel is preserved unchanged.
 *
 * @param {ImageData} imageData - Source image pixels (RGBA).
 * @param {number} amount - Percentage toward white (0–100, clamped).
 * @returns {{ imageData: ImageData }}
 */
function lighten(imageData, amount) {
  amount = Math.max(0, Math.min(100, amount));
  var factor = amount / 100;
  var data = imageData.data;
  var out = new Uint8ClampedArray(data.length);

  for (var i = 0; i < data.length; i += 4) {
    var r = data[i];
    var g = data[i + 1];
    var b = data[i + 2];
    var a = data[i + 3];

    out[i] = Math.round(r + (255 - r) * factor);
    out[i + 1] = Math.round(g + (255 - g) * factor);
    out[i + 2] = Math.round(b + (255 - b) * factor);
    out[i + 3] = a; // alpha preserved
  }

  return {
    imageData: new ImageData(out, imageData.width, imageData.height)
  };
}

// ── Exports ───────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { lighten: lighten };
}

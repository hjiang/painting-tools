// tests/colorMix.test.js
// Run with: node tests/colorMix.test.js
//
// Tests the Color Mixer pure functions — circle averaging, Kubelka-Munk
// subtractive paint mixing, CIELAB ΔE, and the recipe solver. The headline
// behavior under test is that paint mixing is SUBTRACTIVE, not additive:
// the result is not the arithmetic RGB mean.

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg); }
}
function assertEq(actual, expected, msg) {
  if (actual === expected) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg + ' — expected ' + expected + ', got ' + actual); }
}
function assertClose(actual, expected, msg, tol) {
  tol = tol || 1;
  if (Math.abs(actual - expected) <= tol) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg + ' — expected ≈' + expected + ', got ' + actual); }
}

if (typeof ImageData === 'undefined') {
  globalThis.ImageData = class {
    constructor(data, width, height) {
      this.data = data; this.width = width; this.height = height;
    }
  };
}

var cm = require('../colorMix.js');

// helper: solid image
function solidImage(width, height, r, g, b, a) {
  a = a !== undefined ? a : 255;
  var data = new Uint8ClampedArray(width * height * 4);
  for (var i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }
  return new ImageData(data, width, height);
}

// ============================================================
console.log('\n--- hex <-> rgb ---');
{
  var c = cm.hexToRgb('#e2452f');
  assertEq(c.r, 226, 'hexToRgb r'); assertEq(c.g, 69, 'hexToRgb g'); assertEq(c.b, 47, 'hexToRgb b');
  assertEq(cm.rgbToHex({ r: 226, g: 69, b: 47 }), '#e2452f', 'rgbToHex round-trip');
  assertEq(cm.rgbToHex({ r: 0, g: 0, b: 0 }), '#000000', 'rgbToHex black pads zeros');
}

// ============================================================
console.log('--- averageColor ---');
{
  var img = solidImage(10, 10, 120, 60, 30);
  var avg = cm.averageColor(img, 5, 5, 4);
  assertEq(avg.r, 120, 'uniform image → exact R');
  assertEq(avg.g, 60, 'uniform image → exact G');
  assertEq(avg.b, 30, 'uniform image → exact B');
}
{
  // two halves: left red, right blue; a circle on the left should read red.
  var data = new Uint8ClampedArray(10 * 10 * 4);
  for (var y = 0; y < 10; y++) {
    for (var x = 0; x < 10; x++) {
      var i = (y * 10 + x) * 4;
      if (x < 5) { data[i] = 200; data[i + 1] = 0; data[i + 2] = 0; }
      else { data[i] = 0; data[i + 1] = 0; data[i + 2] = 200; }
      data[i + 3] = 255;
    }
  }
  var split = new ImageData(data, 10, 10);
  var left = cm.averageColor(split, 2, 5, 1.5);
  assertEq(left.r, 200, 'small circle in left half reads red');
  assertEq(left.b, 0, 'small circle in left half has no blue');
}
{
  // transparent pixels skipped
  var t = solidImage(4, 4, 100, 100, 100, 0);
  // set one opaque pixel
  t.data[0] = 10; t.data[1] = 20; t.data[2] = 30; t.data[3] = 255;
  var avg = cm.averageColor(t, 0, 0, 1);
  assertEq(avg.r, 10, 'transparent pixels excluded from average');
}

// ============================================================
console.log('--- mixPaints: subtractive, not additive ---');
{
  // identity: a paint mixed with itself is itself (within rounding)
  var p = { r: 130, g: 90, b: 40 };
  var same = cm.mixPaints([p, p], [1, 1]);
  assertClose(same.r, 130, 'self-mix preserves R', 2);
  assertClose(same.g, 90, 'self-mix preserves G', 2);
  assertClose(same.b, 40, 'self-mix preserves B', 2);
}
{
  // blue + yellow: additive RGB mean of red channel would be ~130.
  // Subtractive KM must collapse red far below that (pigments absorb).
  var blue = cm.hexToRgb('#14346e');   // phthalo blue ≈ (20,52,110)
  var yellow = cm.hexToRgb('#f0e64a'); // lemon yellow ≈ (240,230,74)
  var mix = cm.mixPaints([blue, yellow], [1, 1]);
  var rgbMeanR = (blue.r + yellow.r) / 2; // ~130
  assert(mix.r < 60, 'subtractive red collapses well below RGB mean (' +
    mix.r + ' < 60; additive mean would be ' + rgbMeanR + ')');
  // result must be a saturated color, not the muddy gray that RGB averaging
  // produces — green channel clearly dominates the red channel.
  assert(mix.g > mix.r + 20, 'blue+yellow leans green, not gray (g=' +
    mix.g + ', r=' + mix.r + ')');
}
{
  // tinting: adding white to a color raises its lightness toward white
  var scarlet = cm.hexToRgb('#e2452f');
  var white = cm.hexToRgb('#f5f4ea');
  var tint = cm.mixPaints([scarlet, white], [1, 3]);
  var Ls = cm.rgbToLab(scarlet).L;
  var Lt = cm.rgbToLab(tint).L;
  var Lw = cm.rgbToLab(white).L;
  assert(Lt > Ls, 'adding white lightens scarlet (L ' + Lt.toFixed(1) + ' > ' + Ls.toFixed(1) + ')');
  assert(Lt < Lw, 'tint is not brighter than the white itself');
}
{
  // mixing many pigments → mud, never brighter than the brightest component
  var pal = cm.DEFAULT_PALETTE.map(function (p) { return cm.hexToRgb(p.hex); });
  var ws = pal.map(function () { return 1; });
  var mud = cm.mixPaints(pal, ws);
  var Lmud = cm.rgbToLab(mud).L;
  assert(Lmud < 70, 'mixing all pigments yields a dark muddy color (L=' + Lmud.toFixed(1) + ')');
}

// ============================================================
console.log('--- rgbToLab / deltaE ---');
{
  var white = cm.rgbToLab({ r: 255, g: 255, b: 255 });
  assertClose(white.L, 100, 'white L ≈ 100', 0.5);
  var black = cm.rgbToLab({ r: 0, g: 0, b: 0 });
  assertClose(black.L, 0, 'black L ≈ 0', 0.5);
  assertEq(cm.deltaE(white, white), 0, 'ΔE of identical colors is 0');
  assert(cm.deltaE(white, black) > 95, 'ΔE black↔white is large');
}

// ============================================================
console.log('--- matchColor ---');
{
  // target equal to a single palette paint → that paint, ~100%, reachable
  var palette = cm.DEFAULT_PALETTE;
  var target = cm.hexToRgb('#c8963c'); // yellow ochre exactly
  var recipe = cm.matchColor(target, palette, { step: 10 });
  assert(recipe.deltaE < 5, 'exact palette color matched closely (ΔE=' + recipe.deltaE.toFixed(1) + ')');
  assert(recipe.reachable, 'exact palette color is reachable');
  assertEq(recipe.entries[0].name, 'Yellow Ochre', 'dominant pigment is Yellow Ochre');
  assert(recipe.entries[0].percent >= 80, 'dominant pigment ≥ 80%');
  var sum = recipe.entries.reduce(function (s, e) { return s + e.percent; }, 0);
  assertEq(sum, 100, 'recipe percentages sum to 100');
}
{
  // pure saturated screen green is OUT of the paint gamut → not reachable
  var palette2 = cm.DEFAULT_PALETTE;
  var neon = { r: 0, g: 255, b: 0 };
  var recipe2 = cm.matchColor(neon, palette2, { step: 10 });
  assert(!recipe2.reachable, 'pure screen green is not reachable with paint (ΔE=' +
    recipe2.deltaE.toFixed(1) + ')');
}

// ============================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);

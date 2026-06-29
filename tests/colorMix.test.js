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
console.log('--- matchColor: value/chroma decomposition ---');
{
  var palette3 = cm.DEFAULT_PALETTE;
  // Target: yellow ochre hue but lighter (raise L).
  var yocher = cm.hexToRgb('#c8963c'); // L ≈ 59
  var lighter = { r: Math.min(255, yocher.r + 60), g: Math.min(255, yocher.g + 60), b: Math.min(255, yocher.b + 60) };
  var recipe3 = cm.matchColor(lighter, palette3, { step: 5 });
  assert(recipe3.chromaReachable, 'lighter version of palette paint is chroma-reachable');
  assert(recipe3.dL > 0, 'dL > 0 when target is lighter than mixable result (dL=' + recipe3.dL.toFixed(1) + ')');
  assertEq(recipe3.valueHint, 'lighten', 'valueHint is lighten when target is too light');
}
{
  var palette4 = cm.DEFAULT_PALETTE;
  // Target: definitively too dark for any paint — near-black with warm cast.
  var darker = { r: 15, g: 8, b: 5 };  // very dark, warmer than pure black
  var recipe4 = cm.matchColor(darker, palette4, { step: 5 });
  assert(recipe4.chromaReachable, 'near-black target is chroma-reachable');
  assert(recipe4.dL < 0, 'dL < 0 when target is darker than mixable result (dL=' + recipe4.dL.toFixed(1) + ')');
  assertEq(recipe4.valueHint, 'darken', 'valueHint is darken when target is too dark');
}
{
  // neon green is a real hue/saturation miss, not just a value issue
  var neon = { r: 0, g: 255, b: 0 };
  var recipe5 = cm.matchColor(neon, cm.DEFAULT_PALETTE, { step: 10 });
  assert(!recipe5.chromaReachable, 'neon green is chroma-unreachable (dC=' + recipe5.dC.toFixed(1) + ')');
  assertEq(recipe5.valueHint, null, 'valueHint is null when chroma dominates the miss');
}
{
  // exact palette match should have dL ≈ 0, dC ≈ 0
  var target6 = cm.hexToRgb('#e2452f'); // Cadmium Scarlet exactly
  var recipe6 = cm.matchColor(target6, cm.DEFAULT_PALETTE, { step: 10 });
  assert(recipe6.chromaReachable, 'exact palette match is chroma-reachable');
  assert(Math.abs(recipe6.dL) < 2, 'exact palette match has near-zero dL (dL=' + recipe6.dL.toFixed(1) + ')');
  assert(recipe6.dC < 2, 'exact palette match has near-zero dC (dC=' + recipe6.dC.toFixed(1) + ')');
  assertEq(recipe6.valueHint, null, 'valueHint is null for exact palette match');
}

// ============================================================
console.log('--- matchColor: boundary conditions ---');
{
  // Custom chromaTolerance and valueHintThreshold options work.
  var paletteB = cm.DEFAULT_PALETTE;
  var ochre = cm.hexToRgb('#c8963c');
  var slightlyLight = { r: Math.min(255, ochre.r + 30), g: Math.min(255, ochre.g + 30), b: Math.min(255, ochre.b + 30) };
  var rb = cm.matchColor(slightlyLight, paletteB, { step: 5, chromaTolerance: 4, valueHintThreshold: 1 });
  assertEq(rb.chromaReachable, rb.dC <= 4, 'chromaReachable matches custom chromaTolerance (dC=' + rb.dC.toFixed(1) + ')');
  assert(rb.valueHint != null, 'lower valueHintThreshold triggers hint sooner (threshold=1, dL=' + rb.dL.toFixed(1) + ', hint=' + rb.valueHint + ')');
}
{
  // With a huge chroma tolerance, even neon green is "reachable".
  var targetC = { r: 0, g: 255, b: 0 };
  var rc = cm.matchColor(targetC, cm.DEFAULT_PALETTE, { step: 10, chromaTolerance: 100 });
  assert(rc.chromaReachable, 'huge chromaTolerance makes everything reachable');
  assert(rc.dC <= 100, 'dC is finite');
}
{
  // dC exactly at 6 (default boundary): dC <= 6 is reachable.
  // We verify the boolean is <= (inclusive) by using tolerance=6 on a target
  // that produces dC exactly at 6 — hard to force exactly, so test the invariant.
  var targetD = cm.hexToRgb('#c8963c'); // exact palette match: dC ≈ 0
  var rd = cm.matchColor(targetD, cm.DEFAULT_PALETTE, { step: 10, chromaTolerance: 0.1 });
  assert(rd.chromaReachable, 'exact match reachable even with tiny tolerance (dC=' + rd.dC.toFixed(3) + ')');
}
{
  // valueHint is null when dL is within threshold (between -2 and +2).
  var targetE = cm.hexToRgb('#c8963c');
  var re = cm.matchColor(targetE, cm.DEFAULT_PALETTE, { step: 10, valueHintThreshold: 100 });
  // Exact match: dL ≈ 0, valueHintThreshold=100 means dL must exceed 100 to trigger.
  // So valueHint should be null because 0 < 100.
  assertEq(re.valueHint, null, 'valueHint null when dL within large threshold (dL=' + re.dL.toFixed(1) + ')');
}

// ============================================================
console.log('--- mixPaints: tinting strength ---');
{
  // With equal strength (default), 50/50 is identity in KM space for the same paint
  var p7 = { r: 130, g: 90, b: 40 };
  var mix = cm.mixPaints([p7, p7], [1, 1], [1, 1]);
  assertClose(mix.r, 130, 'equal-strength self-mix preserves R', 2);
}
{
  // With phthalo@30 + white@1, even a little phthalo dominates
  var phthalo = cm.hexToRgb('#14346e');   // deep blue
  var titWhite = cm.hexToRgb('#fbfbf6');  // bright white
  var weakMix = cm.mixPaints([phthalo, titWhite], [10, 90], [1, 1]);
  var strongMix = cm.mixPaints([phthalo, titWhite], [10, 90], [30, 1]);
  assert(strongMix.r < weakMix.r, 'higher phthalo strength makes mix darker (r=' + strongMix.r + ' vs ' + weakMix.r + ')');
  var Ls = cm.rgbToLab(strongMix).L;
  var Lw = cm.rgbToLab(weakMix).L;
  assert(Ls < Lw, 'high-strength phthalo suppresses lightness (L=' + Ls.toFixed(1) + ' vs ' + Lw.toFixed(1) + ')');
}
{
  // strengths array is optional: call without strengths still works
  var p9 = { r: 200, g: 100, b: 80 };
  var mix9 = cm.mixPaints([p9, p9], [1, 1]);
  assertClose(mix9.r, 200, 'mixPaints without strengths arg preserves R', 2);
}

// ============================================================
console.log('--- matchColor: black + dark targets (Stage 3) ---');
{
  var pal10 = cm.DEFAULT_PALETTE;
  assert(pal10.some(function (p) { return p.name === 'Ivory Black'; }), 'default palette includes Ivory Black');
  // A dark brown target should now match closely with black available.
  var darkBrown = { r: 35, g: 22, b: 15 };  // very dark, warm
  var recipe10 = cm.matchColor(darkBrown, pal10, { step: 5 });
  assert(recipe10.entries.some(function (e) { return e.hex === '#1b1b1b'; }),
    'dark brown recipe includes Ivory Black');
  assert(recipe10.chromaReachable, 'dark brown is chroma-reachable with black available');
}

// ============================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);

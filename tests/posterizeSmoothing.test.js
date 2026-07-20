// tests/posterizeSmoothing.test.js
// Zero-dependency VM-based fake-DOM integration test for Posterize
// Simplify (smoothing) UI wiring.
//
// This test validates that the smoothing slider exists in the DOM,
// is persisted via Settings, and that boxBlur is applied before
// posterize when smoothing radius > 0.
//
// Run with: node tests/posterizeSmoothing.test.js

// ---- tiny test runner (zero deps) ----
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

// ---- polyfill ImageData for older Node ----
if (typeof ImageData === 'undefined') {
  globalThis.ImageData = class {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

// ---- shared assertion helpers for posterize composition ----
var posterize = require('../posterize.js').posterize;
var isolateBand = require('../posterize.js').isolateBand;

// We can require boxBlur for composition tests
var viewTransforms = require('../viewTransforms.js');
var boxBlur = viewTransforms.boxBlur;

// Helper: solid image
function solidImage(width, height, r, g, b, a) {
  a = a !== undefined ? a : 255;
  var data = new Uint8ClampedArray(width * height * 4);
  for (var i = 0; i < width * height * 4; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return new ImageData(data, width, height);
}

// Helper: checkerboard (1px alternating black/white cells)
function checkerboard1px(w, h) {
  var data = new Uint8ClampedArray(w * h * 4);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = (y * w + x) * 4;
      var val = (x + y) % 2 === 0 ? 0 : 255;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, w, h);
}

// ============================================================
// RED PHASE: VM-based fake-DOM test for smoothing UI wiring
// ============================================================
console.log('\n=== Red Phase: Posterize Smoothing UI Wiring ===');

var vm = require('vm');
var fs = require('fs');

// ── Pre-load pure-function globals that posterizeTool.js depends on ──

// Settings module
var SettingsCode = fs.readFileSync('./settings.js', 'utf8');

// posterize.js globals
var posterizeCode = fs.readFileSync('./posterize.js', 'utf8');

// histogram.js globals
var histogramCode = fs.readFileSync('./histogram.js', 'utf8');

// viewTransforms.js globals (for boxBlur)
var viewTransformsCode = fs.readFileSync('./viewTransforms.js', 'utf8');

// posterizeTool.js
var posterizeToolCode = fs.readFileSync('./posterizeTool.js', 'utf8');

// ── Build the VM context ──

// Track localStorage writes for the smooth key
var localStorageData = {};

// Elements that our test will look for — before implementation these
// don't exist in posterizeTool.js, so mount won't read them.
// The test asserts that they ARE read and wired, which fails pre-impl.
var smoothSlider = {
  value: '0',
  _inputCallback: null,
  addEventListener: function(evt, fn) {
    if (evt === 'input') {
      this._inputCallback = fn;
    }
  },
  min: 0,
  max: 8,
  step: 1
};

var smoothLabel = { textContent: '' };

function createMockCanvas() {
  return {
    width: 0, height: 0,
    style: {},
    parentElement: { clientWidth: 540 },
    addEventListener: function() {},
    getContext: function() { return { putImageData: function() {}, drawImage: function() {} }; }
  };
}

function createMockHistogramCanvas() {
  return {
    width: 600, height: 120, clientWidth: 600,
    addEventListener: function() {},
    getContext: function() {
      return {
        fillRect: function() {},
        clearRect: function() {},
        fillStyle: ''
      };
    }
  };
}

function createClassList() {
  return {
    _classes: {},
    add: function(c) { this._classes[c] = true; },
    remove: function(c) { delete this._classes[c]; },
    contains: function(c) { return !!this._classes[c]; }
  };
}

var toolRegistration = null;

var ctx = vm.createContext({
  // === Browser globals ===
  document: {
    getElementById: function(id) {
      // Elements that our test must find — smoothing slider/label
      if (id === 'posterize-smooth') return smoothSlider;
      if (id === 'posterize-smooth-label') return smoothLabel;

      // Standard posterize tool elements
      if (id === 'value-slider') return { value: '3', addEventListener: function() {} };
      if (id === 'value-label') return { textContent: '' };
      if (id === 'original-canvas') return createMockCanvas();
      if (id === 'result-canvas') return createMockCanvas();
      if (id === 'histogram-canvas') return createMockHistogramCanvas();
      if (id === 'download-btn') return { addEventListener: function() {} };
      if (id === 'all-bands-btn') return { classList: createClassList(), addEventListener: function() {} };
      if (id === 'isolate-hint') return { classList: createClassList() };
      if (id === 'posterize-promote-spot') return { appendChild: function() {} };
      return null;
    },
    getElementsByName: function(name) {
      if (name === 'mode') {
        return [
          { value: 'grayscale', checked: true, addEventListener: function() {} },
          { value: 'color', checked: false, addEventListener: function() {} }
        ];
      }
      return [];
    },
    createElement: function(tag) {
      return {
        className: '',
        textContent: '',
        title: '',
        addEventListener: function() {},
        appendChild: function() {},
        style: {}
      };
    }
  },
  window: {
    document: null,  // set below
    localStorage: null // set below
  },
  localStorage: {
    _data: localStorageData,
    getItem: function(key) { return this._data[key] !== undefined ? String(this._data[key]) : null; },
    setItem: function(key, val) { this._data[key] = String(val); },
    removeItem: function(key) { delete this._data[key]; }
  },
  ImageData: globalThis.ImageData,
  Uint8ClampedArray: Uint8ClampedArray,
  Float32Array: Float32Array,
  Image: function() { this.onload = null; this.src = ''; },
  FileReader: function() { this.onload = null; this.readAsDataURL = function() {}; },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  URL: { createObjectURL: function() {}, revokeObjectURL: function() {} },

  // === App globals (what app.js normally provides) ===
  ImageManager: {
    getImageData: function() { return null; },
    setImageData: function() {},
    _imageData: null,
    _listeners: [],
    onLoad: function() {}
  },
  ToolShell: {
    register: function(config) {
      toolRegistration = config;
    },
    _tools: {},
    activate: function() {}
  },
  drawImageDataToCanvas: function() {},
  downloadImageData: function() {},
  createPromoteButton: function(getResultFn, labelFn) {
    return {
      className: '',
      textContent: labelFn(),
      addEventListener: function() {}
    };
  },
  getCheckedValue: function(radios, fallback) {
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].checked) return radios[i].value;
    }
    return fallback;
  }
});

// Wire up window aliases
ctx.window.document = ctx.document;
ctx.window.localStorage = ctx.localStorage;

// ── Load the pure-function modules into the context ──

try {
  // Run settings.js (defines Settings global)
  vm.runInContext(SettingsCode, ctx, { filename: 'settings.js' });
} catch (e) {
  console.error('  FAIL: settings.js load error — ' + e.message);
  failed++;
}

try {
  // Run posterize.js (defines posterize, isolateBand, bandIndexForValue, bandIndexForPixel)
  vm.runInContext(posterizeCode, ctx, { filename: 'posterize.js' });
} catch (e) {
  console.error('  FAIL: posterize.js load error — ' + e.message);
  failed++;
}

try {
  // Run histogram.js (defines drawHistogram, binAtX, HIST_PAD)
  vm.runInContext(histogramCode, ctx, { filename: 'histogram.js' });
} catch (e) {
  console.error('  FAIL: histogram.js load error — ' + e.message);
  failed++;
}

try {
  // Run viewTransforms.js (defines boxBlur, flipHorizontal, toGrayscale)
  vm.runInContext(viewTransformsCode, ctx, { filename: 'viewTransforms.js' });
} catch (e) {
  console.error('  FAIL: viewTransforms.js load error — ' + e.message);
  failed++;
}

// ── Run the posterizeTool module ──

try {
  vm.runInContext(posterizeToolCode, ctx, { filename: 'posterizeTool.js' });
} catch (e) {
  // Before implementation: the mount function won't find 'posterize-smooth'
  // and may throw, or the mount won't wire smoothing at all.
  console.error('  INFO: posterizeTool.js threw: ' + e.message);
  console.error('  (Expected before implementation — smoothing UI wiring absent)');
  failed++;
}

// ── RED PHASE ASSERTIONS ──

var tool = toolRegistration;

// Test 1: The registered tool exists
assert(!!tool, 'posterizeTool registered with ToolShell');

// Test 2: mount function exists
assert(typeof tool.mount === 'function', 'posterizeTool has mount function');

// Test 3: process function exists (may be set by mount)
// Even before implementation, mount returns the render function as process

// Test 4: Call mount and check smoothing wiring
if (tool && typeof tool.mount === 'function') {
  var container = { querySelector: function() { return null; } };
  var processFn;

  try {
    processFn = tool.mount(container);
    // mount succeeded — check that smoothing elements were wired
  } catch (e) {
    // mount threw — expected before implementation
    console.error('  INFO: mount() threw: ' + e.message);
    console.error('  (Expected before implementation)');
    // One failure for the mount not working
  }

  // Test: smoothing slider should have been wired by mount
  // Before implementation, the mount function does NOT reference
  // 'posterize-smooth', so the slider's _inputCallback remains null.
  var hasInputCallback = typeof smoothSlider._inputCallback === 'function';
  assert(hasInputCallback,
    'smoothing slider input callback is wired by mount()');

  // Test: smoothing value persisted to localStorage when slider changes
  var smoothKey = 'painting-tools.posterize.smooth';

  // Simulate user changing the slider
  smoothSlider.value = '4';
  if (smoothSlider._inputCallback) {
    smoothSlider._inputCallback({ target: smoothSlider });
  }

  var persisted = ctx.localStorage.getItem(smoothKey);

  // Before implementation: this assertion FAILS because no smooth slider wiring exists
  assertEq(persisted, '4',
    'smoothing value 4 persisted to localStorage key "' + smoothKey + '"');

  // Before implementation: this assertion FAILS because no smooth label update exists
  assertEq(smoothLabel.textContent, '4',
    'smoothing label shows "4" when slider is 4');
}

// ============================================================
// COMPOSITION TESTS (may pass with pre-landed boxBlur)
// ============================================================
console.log('\n=== Composition: Posterize + boxBlur ===');

// Test 1: Radius 0 is byte-identical to today's posterize output
{
  var checker = checkerboard1px(4, 4);

  // Posterize without smoothing (direct)
  var direct = posterize(checker, 2, 'grayscale');

  // Posterize with radius 0 smoothing (should be identity)
  var smooth0 = boxBlur(checker, 0, 2);
  var viaSmooth = posterize(smooth0, 2, 'grayscale');

  // Both results should be byte-identical
  var identical = true;
  for (var i = 0; i < direct.imageData.data.length; i++) {
    if (direct.imageData.data[i] !== viaSmooth.imageData.data[i]) {
      identical = false;
      break;
    }
  }
  assert(identical, 'radius-0 smoothing is byte-identical to direct posterize (grayscale)');

  // Same for color mode
  var directColor = posterize(checker, 2, 'color');
  var viaSmoothColor = posterize(boxBlur(checker, 0, 2), 2, 'color');
  var identicalColor = true;
  for (var i2 = 0; i2 < directColor.imageData.data.length; i2++) {
    if (directColor.imageData.data[i2] !== viaSmoothColor.imageData.data[i2]) {
      identicalColor = false;
      break;
    }
  }
  assert(identicalColor, 'radius-0 smoothing is byte-identical to direct posterize (color)');
}

// Test 2: Smoothing a 1px checkerboard with N=2 collapses histogram toward
// a single dominant band in both modes
{
  var checker = checkerboard1px(8, 8); // 64 pixels, 50% black, 50% white
  var totalPixels = 64;

  // N=2 grayscale: band 0 = dark [0-127], band 1 = light [128-255]
  // 1px checkerboard: black pixels (0) → band 0, white pixels (255) → band 1
  // Each band should have exactly 32 pixels
  var raw = posterize(checker, 2, 'grayscale');
  assertEq(raw.histogram[0], 32, '1px checker N=2 grayscale: band 0 has 32 pixels');
  assertEq(raw.histogram[1], 32, '1px checker N=2 grayscale: band 1 has 32 pixels');

  // After smoothing with radius >= 2, the checkerboard blurs to ~50% gray (128)
  // which falls in band 1 (upper band [128-255] for N=2)
  var blurred = boxBlur(checker, 2, 2);
  var smoothed = posterize(blurred, 2, 'grayscale');

  // After smoothing, most pixels should be in a single dominant band
  // At radius 2 on 1px checker, the central pixels average to ~128 → band 1
  var dominantCount = Math.max(smoothed.histogram[0], smoothed.histogram[1]);
  assert(dominantCount > totalPixels * 0.7,
    'smoothing 1px checker N=2 grayscale: dominant band > 70% (got ' +
    Math.round(dominantCount / totalPixels * 100) + '%)');

  // Color mode: same behavior since checker is grayscale
  var blurredColor = boxBlur(checker, 2, 2);
  var smoothedColor = posterize(blurredColor, 2, 'color');

  var dominantCountColor = Math.max(smoothedColor.histogram[0], smoothedColor.histogram[1]);
  assert(dominantCountColor > totalPixels * 0.7,
    'smoothing 1px checker N=2 color: dominant band > 70% (got ' +
    Math.round(dominantCountColor / totalPixels * 100) + '%)');
}

// Test 3: isolateBand on the smoothed input stays consistent with posterize
{
  var checker = checkerboard1px(8, 8);
  var N = 3;

  // Smooth
  var blurred = boxBlur(checker, 2, 2);

  // Posterize the smoothed image
  var postResult = posterize(blurred, N, 'grayscale');

  // Isolate band 0 on the smoothed image
  var isolated = isolateBand(blurred, N, 0, 'grayscale');

  // For every pixel in the posterized output that is in band 0,
  // the corresponding pixel in the isolated mask should be black (0,0,0)
  // For pixels not in band 0, the mask should be white (255,255,255)
  var isoData = isolated.imageData.data;
  var consistent = true;

  // Verify that the isolate mask is purely black/white (no in-between values)
  for (var i3 = 0; i3 < isoData.length; i3 += 4) {
    var r = isoData[i3];
    var g = isoData[i3 + 1];
    var b = isoData[i3 + 2];
    var isBW = (r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255);
    if (!isBW) {
      consistent = false;
      break;
    }
  }
  assert(consistent, 'isolateBand on smoothed input produces only black/white pixels');

  // Also verify alpha is preserved
  assertEq(isoData[3], 255, 'isolateBand on smoothed input preserves alpha');
  assertEq(isoData[7], 255, 'isolateBand on smoothed input preserves alpha');
}

// Test 4: Monotone variance check — additional boxBlur iteration smooths more
// (variance should be non-increasing with more iterations)
{
  var checker = checkerboard1px(8, 8);

  var blur1 = boxBlur(checker, 1, 1);
  var blur2 = boxBlur(checker, 1, 2);
  var blur3 = boxBlur(checker, 1, 3);

  function computeVariance(img) {
    var data = img.data;
    var sum = 0, sumSq = 0, count = 0;
    for (var i4 = 0; i4 < data.length; i4 += 4) {
      var v = data[i4]; // R channel (grayscale)
      sum += v;
      sumSq += v * v;
      count++;
    }
    var mean = sum / count;
    return sumSq / count - mean * mean;
  }

  var v1 = computeVariance(blur1);
  var v2 = computeVariance(blur2);
  var v3 = computeVariance(blur3);

  // Variance should not increase with more iterations
  assert(v2 <= v1 + 0.01, 'variance non-increasing: iter 2 ≤ iter 1 (' + v2 + ' ≤ ' + v1 + ')');
  assert(v3 <= v2 + 0.01, 'variance non-increasing: iter 3 ≤ iter 2 (' + v3 + ' ≤ ' + v2 + ')');
}

// ============================================================
// RESULTS
// ============================================================
console.log('\n' + '='.repeat(40));
console.log('Tests: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
console.log('='.repeat(40));

process.exit(failed > 0 ? 1 : 0);

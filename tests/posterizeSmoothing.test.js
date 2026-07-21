// tests/posterizeSmoothing.test.js
// Zero-dependency VM-based fake-DOM integration test for Posterize
// Simplify (smoothing) UI wiring.
//
// This test was introduced first and failed for missing wiring
// (red phase). It validates that the smoothing slider is wired,
// persisted via Settings, and that boxBlur is applied before
// posterize when smoothing radius > 0.
//
// Run with: node tests/posterizeSmoothing.test.js

var path = require('path');
var vm = require('vm');
var fs = require('fs');

// ---- tiny test runner (zero deps) ----
var passed = 0;
var failed = 0;

function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg); }
}

function eq(actual, expected, msg) {
  if (actual === expected) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

function neq(a, b, msg) {
  if (a !== b) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg + ' — values are the same reference'); }
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

var SRC_DIR = path.join(__dirname, '..');

// ── Pre-load source files ──
var SettingsCode        = fs.readFileSync(path.join(SRC_DIR, 'settings.js'),         'utf8');
var posterizeCode       = fs.readFileSync(path.join(SRC_DIR, 'posterize.js'),         'utf8');
var histogramCode       = fs.readFileSync(path.join(SRC_DIR, 'histogram.js'),         'utf8');
var viewTransformsCode  = fs.readFileSync(path.join(SRC_DIR, 'viewTransforms.js'),   'utf8');
var posterizeToolCode   = fs.readFileSync(path.join(SRC_DIR, 'posterizeTool.js'),     'utf8');

// ── Spies ──
var callLog = { boxBlur: [], posterize: [], isolateBand: [] };

// ── Sentinel ImageData for identity checking ──
var SMOOTHED_SENTINEL = new ImageData(new Uint8ClampedArray([0,0,0,255, 255,255,255,255, 128,128,128,255]), 3, 1);

// ── Raw fixture ──
function makeTestImageData() {
  var w = 4, h = 3;
  var data = new Uint8ClampedArray(w * h * 4);
  for (var i = 0; i < w * h; i++) {
    var off = i * 4;
    var v = Math.floor((i / (w * h)) * 256);
    data[off] = v;
    data[off + 1] = v;
    data[off + 2] = v;
    data[off + 3] = 255;
  }
  return new ImageData(data, w, h);
}

var _testImageData = makeTestImageData();

// ── Fake DOM state ──
var localStorageData = {};
var smoothSlider = {
  value: '0',
  _inputCallback: null,
  addEventListener: function(evt, fn) {
    if (evt === 'input') this._inputCallback = fn;
  },
  min: 0, max: 8, step: 1
};
var smoothLabel = { textContent: '' };
var valueSlider = {
  value: '3',
  _inputCallback: null,
  addEventListener: function(name, fn) {
    if (name === 'input') this._inputCallback = fn;
  }
};
var promoteLabelFn = null;
var promoteGetResultFn = null;
var downloadClickHandler = null;
var histogramClickHandler = null;
var toolRegistration = null;

function createMockCanvas() {
  return {
    width: 0, height: 0, style: {}, parentElement: { clientWidth: 540 },
    addEventListener: function() {},
    getContext: function() { return { putImageData: function() {}, drawImage: function() {} }; }
  };
}
function createMockHistogramCanvas() {
  return {
    width: 600, height: 120, clientWidth: 600,
    addEventListener: function(name, fn) {
      if (name === 'click') histogramClickHandler = fn;
    },
    getContext: function() {
      return {
        fillRect: function() {}, clearRect: function() {},
        fillStyle: '', font: '', textAlign: '',
        fillText: function() {}, measureText: function() { return { width: 10 }; }
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

var ctx = vm.createContext({
  document: {
    getElementById: function(id) {
      if (id === 'posterize-smooth') return smoothSlider;
      if (id === 'posterize-smooth-label') return smoothLabel;
      if (id === 'value-slider') return valueSlider;
      if (id === 'value-label') return { textContent: '' };
      if (id === 'original-canvas') return createMockCanvas();
      if (id === 'result-canvas') return createMockCanvas();
      if (id === 'histogram-canvas') return createMockHistogramCanvas();
      if (id === 'download-btn') return {
        addEventListener: function(name, fn) {
          if (name === 'click') downloadClickHandler = fn;
        }
      };
      if (id === 'all-bands-btn') return { classList: createClassList(), addEventListener: function() {} };
      if (id === 'isolate-hint') return { classList: createClassList() };
      if (id === 'posterize-promote-spot') return { appendChild: function() {} };
      return null;
    },
    getElementsByName: function(name) {
      if (name === 'mode') return [
        { value: 'grayscale', checked: true, addEventListener: function() {} },
        { value: 'color', checked: false, addEventListener: function() {} }
      ];
      return [];
    },
    createElement: function(tag) {
      return { className: '', textContent: '', title: '', addEventListener: function() {}, appendChild: function() {}, style: {} };
    }
  },
  window: { document: null, localStorage: null },
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

  ImageManager: {
    getImageData: function() { return _testImageData; },
    setImageData: function() {},
    _imageData: _testImageData,
    _listeners: [],
    onLoad: function() {}
  },
  ToolShell: {
    register: function(config) { toolRegistration = config; },
    _tools: {}, activate: function() {}
  },
  drawImageDataToCanvas: function() {},
  downloadImageData: function() {},
  createPromoteButton: function(getResultFn, labelFn) {
    promoteGetResultFn = getResultFn;
    promoteLabelFn = labelFn;
    return { className: '', textContent: labelFn(), addEventListener: function() {} };
  },
  getCheckedValue: function(radios, fallback) {
    for (var i = 0; i < radios.length; i++) { if (radios[i].checked) return radios[i].value; }
    return fallback;
  },
  // Spies — installed temporarily, overwritten by module loads below
  boxBlur: function() {},
  posterize: function() {},
  isolateBand: function() {}
});
ctx.window.document = ctx.document;
ctx.window.localStorage = ctx.localStorage;

// ── Load pure-function modules ──
try { vm.runInContext(SettingsCode, ctx, { filename: 'settings.js' }); }
catch (e) { console.error('  FAIL: settings.js load error — ' + e.message); failed++; }

try { vm.runInContext(posterizeCode, ctx, { filename: 'posterize.js' }); }
catch (e) { console.error('  FAIL: posterize.js load error — ' + e.message); failed++; }

try { vm.runInContext(histogramCode, ctx, { filename: 'histogram.js' }); }
catch (e) { console.error('  FAIL: histogram.js load error — ' + e.message); failed++; }

try { vm.runInContext(viewTransformsCode, ctx, { filename: 'viewTransforms.js' }); }
catch (e) { console.error('  FAIL: viewTransforms.js load error — ' + e.message); failed++; }

// ── Install spies after module loads ──
// boxBlur spy: record args, return a sentinel for identity checks
ctx.boxBlur = function(imageData, radius, iterations) {
  callLog.boxBlur.push({ input: imageData, radius: radius, iterations: iterations });
  // Return a distinct sentinel so we can identity-check that posterize/isolateBand
  // receive the exact same object
  return SMOOTHED_SENTINEL;
};

// posterize spy: record args (including exact input ImageData reference)
ctx.posterize = function(imageData, N, mode) {
  callLog.posterize.push({ input: imageData, N: N, mode: mode });
  return require('../posterize.js').posterize(imageData, N, mode);
};

// isolateBand spy: record args
ctx.isolateBand = function(imageData, N, bandIndex, mode) {
  callLog.isolateBand.push({ input: imageData, N: N, bandIndex: bandIndex, mode: mode });
  return require('../posterize.js').isolateBand(imageData, N, bandIndex, mode);
};

// ── Load posterizeTool module ──
try { vm.runInContext(posterizeToolCode, ctx, { filename: 'posterizeTool.js' }); }
catch (e) { console.error('  FAIL: posterizeTool.js load error — ' + e.message); failed++; }

console.log('\n=== Posterize Smoothing UI Wiring (VM integration) ===');

// Verify tool was registered
ok(!!toolRegistration, 'posterizeTool registered with ToolShell');
ok(typeof toolRegistration.mount === 'function', 'mount function exists');

// Mount the tool
try { toolRegistration.mount({ querySelector: function() { return null; } }); }
catch (e) { console.error('  FAIL: mount threw: ' + e.message); failed++; }

// ---- Test 1: Smoothing slider wired by mount ----
ok(typeof smoothSlider._inputCallback === 'function',
   'smoothing slider input callback is wired by mount()');

// ---- Test 2: Slider change persists and updates label ----
smoothSlider.value = '6';
if (smoothSlider._inputCallback) smoothSlider._inputCallback({ target: smoothSlider });
eq(ctx.localStorage.getItem('painting-tools.posterize.smooth'), '6',
   'smoothing value 6 persisted to localStorage');
eq(smoothLabel.textContent, '6', 'smoothing label shows "6"');

// ---- Test 3: Radius 0 passes raw fixture directly to posterize, no boxBlur ----
callLog.boxBlur = [];
callLog.posterize = [];
smoothSlider.value = '0';
if (smoothSlider._inputCallback) smoothSlider._inputCallback({ target: smoothSlider });

// boxBlur must NOT have been called
eq(callLog.boxBlur.length, 0, 'radius 0: boxBlur not called');

// posterize must have been called with the raw fixture (identical reference)
ok(callLog.posterize.length >= 1, 'radius 0: posterize called at least once');
var lastPost = callLog.posterize[callLog.posterize.length - 1];
eq(lastPost.input, _testImageData, 'radius 0: posterize receives raw fixture directly');

// ---- Test 4: Radius > 0 calls boxBlur; posterize receives the sentinel ----
callLog.boxBlur = [];
callLog.posterize = [];
smoothSlider.value = '3';
if (smoothSlider._inputCallback) smoothSlider._inputCallback({ target: smoothSlider });

// boxBlur must have been called with radius=3, iterations=2
eq(callLog.boxBlur.length, 1, 'radius 3: boxBlur called exactly once');
eq(callLog.boxBlur[0].radius, 3, 'boxBlur called with radius 3');
eq(callLog.boxBlur[0].iterations, 2, 'boxBlur called with 2 iterations');
eq(callLog.boxBlur[0].input, _testImageData, 'boxBlur receives raw fixture');

// posterize must have been called with the SMOOTHED_SENTINEL (identity check)
ok(callLog.posterize.length >= 1, 'radius 3: posterize called');
var postIdx = callLog.posterize.length - 1;
eq(callLog.posterize[postIdx].input, SMOOTHED_SENTINEL,
   'radius 3: posterize receives the exact smoothed sentinel from boxBlur');

// ---- Test 5: N-only change reruns posterize but NOT boxBlur ----
callLog.boxBlur = [];
callLog.posterize = [];
// Change N by simulating slider input. We need to trigger the value-slider
// input event. But we stored a no-op handler. Instead, set N and trigger
// render manually via the smooth slider callback (which calls render).
// Actually, the value-slider's addEventListener doesn't store its callback.
// Let's use an alternative approach: set the value-slider value and re-trigger
// render via smoothSlider callback (same smooth value).
valueSlider.value = '5';
if (valueSlider._inputCallback) valueSlider._inputCallback({ target: valueSlider });

// boxBlur must NOT have been called again (smooth value unchanged)
eq(callLog.boxBlur.length, 0,
   'N-only change: boxBlur NOT called again');

// posterize must have been called (N changed from 3 to 5)
var foundN5 = false;
for (var p = 0; p < callLog.posterize.length; p++) {
  if (callLog.posterize[p].N === 5) { foundN5 = true; break; }
}
ok(foundN5, 'N-only change: posterize called with N=5');

// ---- Test 6: Exact label strings ----
smoothSlider.value = '0';
if (smoothSlider._inputCallback) smoothSlider._inputCallback({ target: smoothSlider });
var label0 = promoteLabelFn();
eq(label0, 'Posterized (5 values, grayscale)',
   'exact promote label when smooth=0: "Posterized (5 values, grayscale)"');

smoothSlider.value = '5';
if (smoothSlider._inputCallback) smoothSlider._inputCallback({ target: smoothSlider });
var label5 = promoteLabelFn();
eq(label5, 'Posterized (5 values, grayscale, smoothed 5px)',
   'exact promote label when smooth=5: "Posterized (5 values, grayscale, smoothed 5px)"');

ok(label5.indexOf(')') === label5.length - 1,
   'promote label ends with ")" — smoothing inside parens');
var inside = label5.slice(label5.indexOf('grayscale'), label5.length - 1);
eq(inside, 'grayscale, smoothed 5px',
   'smoothing suffix inside parentheses after mode');

// ---- Test 7: Select a band, verify isolation uses smoothed sentinel ----
callLog.isolateBand = [];

// Simulate clicking histogram bin 1 (band index 1) to select it
// The histogram click handler needs an event with offsetX.
// band 1 at N=5 starts at 1*bandWidth in pixels.
// binAtX computes: x * N / canvasW = bin. For N=5, canvasW=600, HIST_PAD=30.
// bin 1 center is roughly at (1 * 600/5) + some padding offset.
// Actually let's just use offsetX = 150 which should be in bin 1.
if (histogramClickHandler) {
  histogramClickHandler({
    offsetX: 150
  });
}

// After clicking, render was called and isolateBand should have been invoked.
// It should receive the smoothed sentinel (smooth=5, so _lastSmoothedSource = SMOOTHED_SENTINEL)
var foundIsolate = false;
for (var ib = 0; ib < callLog.isolateBand.length; ib++) {
  if (callLog.isolateBand[ib].input === SMOOTHED_SENTINEL &&
      callLog.isolateBand[ib].bandIndex === 1) {
    foundIsolate = true;
    break;
  }
}
ok(foundIsolate,
   'render isolation: isolateBand called with smoothed sentinel for band 1');

// ---- Test 8: Promote isolation passes smoothed sentinel to isolateBand ----
callLog.isolateBand = [];
// Call promote's getResultFn. With a band selected (band 1) and smooth=5,
// it should pass the smoothed sentinel to isolateBand.
if (promoteGetResultFn) {
  promoteGetResultFn();
}
var foundPromoteIsolate = false;
for (var ip = 0; ip < callLog.isolateBand.length; ip++) {
  if (callLog.isolateBand[ip].input === SMOOTHED_SENTINEL &&
      callLog.isolateBand[ip].bandIndex === 1) {
    foundPromoteIsolate = true;
    break;
  }
}
ok(foundPromoteIsolate,
   'promote isolation: isolateBand called with smoothed sentinel for band 1');

// ---- Test 9: Download isolation passes smoothed sentinel to isolateBand ----
callLog.isolateBand = [];
// Call download's click handler
if (downloadClickHandler) {
  downloadClickHandler();
}
var foundDownloadIsolate = false;
for (var id2 = 0; id2 < callLog.isolateBand.length; id2++) {
  if (callLog.isolateBand[id2].input === SMOOTHED_SENTINEL &&
      callLog.isolateBand[id2].bandIndex === 1) {
    foundDownloadIsolate = true;
    break;
  }
}
ok(foundDownloadIsolate,
   'download isolation: isolateBand called with smoothed sentinel for band 1');

// ---- Test 10: Exact isolated label string ----
// With band 1 selected and smooth=5, the isolated label should be:
// "Isolated band 2 (5 values, smoothed 5px)"
var isolatedLabel = promoteLabelFn();
eq(isolatedLabel, 'Isolated band 2 (5 values, smoothed 5px)',
   'exact isolated label when band 1 selected, smooth=5');

// ---- Results ----
console.log('\n' + '='.repeat(40));
console.log('Tests: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
console.log('='.repeat(40));

process.exit(failed > 0 ? 1 : 0);

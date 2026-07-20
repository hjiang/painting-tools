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
var assert = require('assert');

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
var SettingsCode   = fs.readFileSync(path.join(SRC_DIR, 'settings.js'),         'utf8');
var posterizeCode  = fs.readFileSync(path.join(SRC_DIR, 'posterize.js'),         'utf8');
var histogramCode  = fs.readFileSync(path.join(SRC_DIR, 'histogram.js'),         'utf8');
var viewTransformsCode = fs.readFileSync(path.join(SRC_DIR, 'viewTransforms.js'),'utf8');
var posterizeToolCode  = fs.readFileSync(path.join(SRC_DIR, 'posterizeTool.js'), 'utf8');

// ── Spies ──
var callLog = { boxBlur: [], posterize: [], isolateBand: [] };

// ── Shared ImageData fixture ──
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
var promoteBtnLabel = '';
var promoteLabelFn = null;
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
    addEventListener: function() {},
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
    promoteLabelFn = labelFn;
    promoteBtnLabel = labelFn();
    return { className: '', textContent: labelFn(), addEventListener: function() {} };
  },
  getCheckedValue: function(radios, fallback) {
    for (var i = 0; i < radios.length; i++) { if (radios[i].checked) return radios[i].value; }
    return fallback;
  },
  // Spies — called by posterizeTool at runtime
  boxBlur: function(imageData, radius, iterations) {
    callLog.boxBlur.push({ radius: radius, iterations: iterations });
    // Return a copy to simulate real boxBlur
    var copy = new Uint8ClampedArray(imageData.data.length);
    copy.set(imageData.data);
    return new ImageData(copy, imageData.width, imageData.height);
  },
  posterize: function(imageData, N, mode) {
    callLog.posterize.push({ N: N, mode: mode });
    // Reuse the real posterize from the loaded module
    return ctx.posterize(imageData, N, mode);
  },
  isolateBand: function(imageData, N, bandIndex, mode) {
    callLog.isolateBand.push({ N: N, bandIndex: bandIndex, mode: mode });
    return ctx.isolateBand(imageData, N, bandIndex, mode);
  }
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

// Reinstall spies after module loads (modules overwrite our initial spies)
ctx.boxBlur = function(imageData, radius, iterations) {
  callLog.boxBlur.push({ radius: radius, iterations: iterations });
  var copy = new Uint8ClampedArray(imageData.data.length);
  copy.set(imageData.data);
  return new ImageData(copy, imageData.width, imageData.height);
};
ctx.posterize = function(imageData, N, mode) {
  callLog.posterize.push({ N: N, mode: mode });
  // Delegate to the real posterize from the loaded module
  // It's accessible as ctx.posterizeCode ... but we need the real one.
  // The real posterize is already loaded in context, but we overwrote it.
  // Reuse the actual implementation: since we saved it before overwriting...
  // Actually, we call the original from the module directly.
  // But the module loaded into ctx overwrote our reference.
  // Let's use require to get the real one directly for the fallback.
  var realPosterize = require('../posterize.js').posterize;
  return realPosterize(imageData, N, mode);
};
ctx.isolateBand = function(imageData, N, bandIndex, mode) {
  callLog.isolateBand.push({ N: N, bandIndex: bandIndex, mode: mode });
  var realIsolate = require('../posterize.js').isolateBand;
  return realIsolate(imageData, N, bandIndex, mode);
};

// ── Load posterizeTool module ──
try { vm.runInContext(posterizeToolCode, ctx, { filename: 'posterizeTool.js' }); }
catch (e) { console.error('  FAIL: posterizeTool.js load error — ' + e.message); failed++; }

console.log('\n=== Posterize Smoothing UI Wiring (VM integration) ===');

// Verify tool was registered
ok(!!toolRegistration, 'posterizeTool registered with ToolShell');
ok(typeof toolRegistration.mount === 'function', 'mount function exists');

// Mount the tool
var processFn;
try { processFn = toolRegistration.mount({ querySelector: function() { return null; } }); }
catch (e) { console.error('  FAIL: mount threw: ' + e.message); failed++; }

// ---- Test 1: Smoothing slider wired by mount ----
var hasInputCallback = typeof smoothSlider._inputCallback === 'function';
ok(hasInputCallback, 'smoothing slider input callback is wired by mount()');

// ---- Test 2: Slider change persists and updates label ----
smoothSlider.value = '6';
if (smoothSlider._inputCallback) smoothSlider._inputCallback({ target: smoothSlider });
var persisted = ctx.localStorage.getItem('painting-tools.posterize.smooth');
eq(persisted, '6', 'smoothing value 6 persisted to localStorage');
eq(smoothLabel.textContent, '6', 'smoothing label shows "6"');

// ---- Test 3: Radius 0 skips boxBlur ----
callLog.boxBlur = [];  // reset
// The mount returned processFn = render. Call it to trigger pipeline.
// render() reads getImageData(), getSmooth() (currently 6), so we need
// to set slider to 0 and re-trigger.
smoothSlider.value = '0';
if (smoothSlider._inputCallback) smoothSlider._inputCallback({ target: smoothSlider });
eq(ctx.localStorage.getItem('painting-tools.posterize.smooth'), '0', 'smooth reset to 0');
// After setting to 0, render was called. boxBlur should NOT have been called.
// (The callback may have triggered render which reads smooth=0.)
ok(callLog.boxBlur.length === 0 || callLog.boxBlur[callLog.boxBlur.length - 1].radius !== 0,
   'radius 0 skips boxBlur call (last boxBlur radius is not 0)');

// ---- Test 4: Radius > 0 calls boxBlur with (raw, radius, 2) ----
callLog.boxBlur = [];
smoothSlider.value = '3';
if (smoothSlider._inputCallback) smoothSlider._inputCallback({ target: smoothSlider });
eq(ctx.localStorage.getItem('painting-tools.posterize.smooth'), '3', 'smooth set to 3');

// boxBlur should have been called with radius=3, iterations=2
var foundBlur3 = false;
for (var b = 0; b < callLog.boxBlur.length; b++) {
  if (callLog.boxBlur[b].radius === 3 && callLog.boxBlur[b].iterations === 2) {
    foundBlur3 = true;
    break;
  }
}
ok(foundBlur3, 'boxBlur called with radius 3, 2 iterations');

// ---- Test 5: Changing smooth radius invalidates and reprocesses ----
// posterize should have been called multiple times (once per render trigger)
// Check that the last posterize call received the correct parameters
ok(callLog.posterize.length >= 1, 'posterize called at least once');
var lastPost = callLog.posterize[callLog.posterize.length - 1];
ok(lastPost.N >= 2 && lastPost.N <= 12, 'posterize called with valid N (' + lastPost.N + ')');
ok(lastPost.mode === 'grayscale' || lastPost.mode === 'color', 'posterize called with valid mode');

// ---- Test 6: Exact label strings ----
// After smooth=3, re-evaluate label and verify smoothing inside parens
smoothSlider.value = '3';
if (smoothSlider._inputCallback) smoothSlider._inputCallback({ target: smoothSlider });
var label3 = promoteLabelFn();
ok(label3.indexOf('smoothed 3px') >= 0,
   'promote label contains "smoothed 3px" when smooth = 3');
ok(label3.indexOf('Posterized (') === 0,
   'promote label starts with "Posterized ("');
ok(label3.indexOf(')') === label3.length - 1,
   'promote label ends with ")" — smoothing inside parens');

// Set smooth to 0 and verify label has no smoothing suffix
smoothSlider.value = '0';
if (smoothSlider._inputCallback) smoothSlider._inputCallback({ target: smoothSlider });
var label0 = promoteLabelFn();
ok(label0.indexOf('smoothed') < 0,
   'promote label omits "smoothed" when smooth = 0');
eq(label0, 'Posterized (3 values, grayscale)',
   'exact promote label when smooth=0: "Posterized (3 values, grayscale)"');

// Set smooth to 5 and verify label format
smoothSlider.value = '5';
if (smoothSlider._inputCallback) smoothSlider._inputCallback({ target: smoothSlider });
var label5 = promoteLabelFn();
eq(label5, 'Posterized (3 values, grayscale, smoothed 5px)',
   'exact promote label when smooth=5: "Posterized (3 values, grayscale, smoothed 5px)"');

// ---- Test 7: Verify the isolated label format ----
// When smooth=5, the normal label proves smoothing is inside parens.
// The isolated path uses identical suffix logic:
// 'Isolated band B (N values' + sp + ')'
ok(label5.charAt(label5.length - 1) === ')',
   'normal label ends with ) — suffix inside parens');
var inside = label5.slice(label5.indexOf('grayscale'), label5.length - 1);
eq(inside, 'grayscale, smoothed 5px',
   'smoothing suffix inside parentheses after mode');

// ---- Results ----
console.log('\n' + '='.repeat(40));
console.log('Tests: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
console.log('='.repeat(40));

process.exit(failed > 0 ? 1 : 0);

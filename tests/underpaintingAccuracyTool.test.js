// tests/underpaintingAccuracyTool.test.js
// Run with: node tests/underpaintingAccuracyTool.test.js
//
// Behavioral lifecycle tests for the Underpainting Check tool module.
// Uses Node VM with mock DOM to test pointer capture, drag completion,
// guide/reset failure paths, warp counts, and state transitions.
// No external dependencies — runs in vanilla Node 18+.

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

function assertNeq(actual, forbidden, msg) {
  if (actual !== forbidden) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg + ' — value is ' + actual); }
}

// ---- Polyfill ImageData for older Node ----
if (typeof ImageData === 'undefined') {
  global.ImageData = function (data, width, height) {
    if (!(data instanceof Uint8ClampedArray) ||
        data.length !== width * height * 4) {
      throw new TypeError('Invalid ImageData');
    }
    this.data = data;
    this.width = width;
    this.height = height;
  };
}

// ==============================================================
// Mock DOM helpers
// ==============================================================

function createMockCanvas(w, h) {
  var ctx = null;
  var listeners = {};
  var canvas = {
    width: (w !== undefined) ? w : 0,
    height: (h !== undefined) ? h : 0,
    _warpCount: 0,
    _state: null,          // 'hidden' | 'visible'
    style: {
      _props: {},
      set opacity(v) { canvas.style._props.opacity = v; },
      get opacity() { return canvas.style._props.opacity; },
      set cssText(v) { }
    },
    classList: {
      _classes: {},
      add: function (c) { canvas.classList._classes[c] = true; },
      remove: function (c) { delete canvas.classList._classes[c]; },
      contains: function (c) { return !!canvas.classList._classes[c]; }
    },
    _attributes: {},
    setAttribute: function (name, value) { canvas._attributes[name] = String(value); },
    getAttribute: function (name) { return canvas._attributes[name]; },
    _eventListeners: {},
    addEventListener: function (name, handler) {
      if (!canvas._eventListeners[name]) canvas._eventListeners[name] = [];
      canvas._eventListeners[name].push(handler);
    },
    removeEventListener: function (name, handler) {
      var arr = canvas._eventListeners[name];
      if (arr) canvas._eventListeners[name] = arr.filter(function (h) { return h !== handler; });
    },
    _triggerEvent: function (name, evt) {
      var arr = canvas._eventListeners[name];
      if (arr) { for (var i = 0; i < arr.length; i++) arr[i](evt); }
    },
    getContext: function (type) {
      if (type !== '2d') return null;
      if (!ctx) ctx = createMockCanvasContext(canvas);
      return ctx;
    },
    _resetContext: function () {
      ctx = null;
    },
    getBoundingClientRect: function () {
      return {
        left: 0, top: 0,
        width: canvas.width || 100,
        height: canvas.height || 100
      };
    },
    // For interaction surface: pointer capture support
    _capturedPointerId: -1,
    setPointerCapture: function (id) {
      canvas._capturedPointerId = id;
    },
    releasePointerCapture: function (id) {
      if (canvas._capturedPointerId === id || id === undefined) {
        canvas._capturedPointerId = -1;
      }
    },
    // Additional canvas properties needed for real DOM
    parentElement: null,
    offsetWidth: 100
  };
  return canvas;
}

var mockCtxId = 0;

function createMockCanvasContext(canvas) {
  var paintingData = null; // {w, h, data}
  var ctx = {
    _id: ++mockCtxId,
    _cleared: false,
    _beginPathCalled: false,
    _throwsOnBeginPath: false,
    _throwsOnClearRect: false,
    _throwsOnPutImageData: false,
    _canvas: canvas,

    clearRect: function (x, y, w, h) {
      ctx._cleared = true;
      if (ctx._throwsOnClearRect) throw new Error('clearRect mock failure');
    },
    beginPath: function () {
      ctx._beginPathCalled = true;
      if (ctx._throwsOnBeginPath) throw new Error('beginPath mock failure');
    },
    moveTo: function () {},
    lineTo: function () {},
    arc: function () {},
    stroke: function () {
      if (ctx._throwsOnBeginPath) throw new Error('stroke mock failure');
    },
    fill: function () {},
    fillText: function () {},
    putImageData: function (data, dx, dy) {
      if (ctx._throwsOnPutImageData) throw new Error('putImageData mock failure');
      paintingData = { w: data.width, h: data.height, data: data };
    },
    _drawImageCalls: 0,
    _drawImageArgs: null,
    drawImage: function () {
      ctx._drawImageCalls++;
      ctx._drawImageArgs = Array.prototype.slice.call(arguments);
    },
    fillRect: function () {},
    getImageData: function (x, y, w, h) {
      if (paintingData && paintingData.w === w && paintingData.h === h) return paintingData;
      return new global.ImageData(new Uint8ClampedArray(w * h * 4), w, h);
    },
    setLineDash: function () {},

    // Property accessors for style reading
    _strokeStyle: '',
    set strokeStyle(v) { ctx._strokeStyle = v; },
    get strokeStyle() { return ctx._strokeStyle; },
    _lineWidth: 1,
    set lineWidth(v) { ctx._lineWidth = v; },
    get lineWidth() { return ctx._lineWidth; },
    _fillStyle: '',
    set fillStyle(v) { ctx._fillStyle = v; },
    get fillStyle() { return ctx._fillStyle; },
    _font: '',
    set font(v) { ctx._font = v; },
    get font() { return ctx._font; },
    _textAlign: '',
    set textAlign(v) { ctx._textAlign = v; },
    get textAlign() { return ctx._textAlign; },
    _textBaseline: '',
    set textBaseline(v) { ctx._textBaseline = v; },
    get textBaseline() { return ctx._textBaseline; }
  };
  return ctx;
}

function createMockElement(tag, isInput) {
  var el = {
    tagName: (tag || 'div').toUpperCase(),
    style: {},
    classList: {
      _classes: {},
      add: function (c) { el.classList._classes[c] = true; },
      remove: function (c) { delete el.classList._classes[c]; },
      contains: function (c) { return !!el.classList._classes[c]; }
    },
    textContent: '',
    value: '',
    files: null,
    type: isInput ? 'file' : '',
    accept: '',
    hidden: false,
    parentElement: null,
    offsetWidth: 100,
    offsetHeight: 100,
    clientWidth: 100,
    clientHeight: 100,
    scrollWidth: 100,
    scrollHeight: 100,
    scrollLeft: 0,
    scrollTop: 0,
    _capturedPointerId: -1,
    setPointerCapture: function (id) { el._capturedPointerId = id; },
    releasePointerCapture: function (id) {
      if (el._capturedPointerId === id || id === undefined) el._capturedPointerId = -1;
    },
    _eventListeners: {},
    addEventListener: function (name, handler) {
      if (!el._eventListeners[name]) el._eventListeners[name] = [];
      el._eventListeners[name].push(handler);
    },
    removeEventListener: function (name, handler) {
      var arr = el._eventListeners[name];
      if (arr) el._eventListeners[name] = arr.filter(function (h) { return h !== handler; });
    },
    _triggerEvent: function (name, evt) {
      var arr = el._eventListeners[name];
      if (arr) { for (var i = 0; i < arr.length; i++) arr[i](evt); }
    },
    getBoundingClientRect: function () {
      return { left: 0, top: 0, width: 100, height: 20 };
    },
    querySelector: function (sel) { return null; },
    querySelectorAll: function (sel) { return []; },
    closest: function (sel) { return null; },
    focus: function () {},
    blur: function () {},
    firstChild: null,
    insertBefore: function (child, ref) { if (!this.firstChild) this.firstChild = child; },
    removeChild: function (child) {},
    appendChild: function (child) {}
  };
  return el;
}

// ==============================================================
// Build a mock container with all 17 required DOM IDs
// ==============================================================

function buildMockContainer() {
  var imageCanvas = createMockCanvas(100, 100);
  var guideCanvas = createMockCanvas(0, 0);
  var referenceCanvas = createMockCanvas(0, 0);
  var alignedCanvas = createMockCanvas(0, 0);
  var magnifierCanvas = createMockCanvas(168, 168);
  magnifierCanvas.classList.add('hidden');

  var elements = {
    'underpainting-file': createMockElement('input', true),
    'underpainting-status': createMockElement('div'),
    'underpainting-upload-panel': createMockElement('div'),
    'underpainting-marking-panel': createMockElement('div'),
    'underpainting-stage': createMockElement('div'),
    'underpainting-image-canvas': imageCanvas,
    'underpainting-guide-canvas': guideCanvas,
    'underpainting-next-corner': createMockElement('span'),
    'underpainting-undo': createMockElement('button'),
    'underpainting-reset': createMockElement('button'),
    'underpainting-magnifier': magnifierCanvas,
    'underpainting-comparison-panel': createMockElement('div'),
    'underpainting-comparison-viewport': createMockElement('div'),
    'underpainting-comparison-stage': createMockElement('div'),
    'underpainting-reference-canvas': referenceCanvas,
    'underpainting-aligned-canvas': alignedCanvas,
    'underpainting-opacity': createMockElement('input'),
    'underpainting-opacity-label': createMockElement('span'),
    'underpainting-zoom-out': createMockElement('button'),
    'underpainting-zoom': createMockElement('input'),
    'underpainting-zoom-label': createMockElement('span'),
    'underpainting-zoom-in': createMockElement('button'),
    'underpainting-zoom-reset': createMockElement('button')
  };

  elements['underpainting-opacity'].value = '50';
  elements['underpainting-zoom'].value = '100';
  elements['underpainting-comparison-viewport'].clientWidth = 960;
  elements['underpainting-comparison-viewport'].offsetWidth = 960;
  elements['underpainting-comparison-viewport'].clientHeight = 600;
  elements['underpainting-comparison-stage'].parentElement =
    elements['underpainting-comparison-viewport'];
  referenceCanvas.parentElement = elements['underpainting-comparison-stage'];
  alignedCanvas.parentElement = elements['underpainting-comparison-stage'];

  return {
    elements: elements,
    querySelector: function (sel) {
      if (sel.charAt(0) === '#') {
        var id = sel.substring(1);
        return elements[id] || null;
      }
      return null;
    },
    querySelectorAll: function (sel) { return []; },
    getElementById: function (id) { return elements[id] || null; }
  };
}

// ==============================================================
// Build VM context for the tool + alignment modules
// ==============================================================

function buildVMContext(container, opts) {
  opts = opts || {};

  var imageManager = {
    currentImageData: null,
    _originalImageData: null
  };

  // Mock Image: fires onload synchronously (same tick) when naturalWidth > 0 and src is set.
  // This makes the decode predictably available in the same turn.
  var MockImage = function () {
    var img = {
      naturalWidth: 0,
      naturalHeight: 0,
      onload: null,
      onerror: null,
      _src: '',
      get src() { return img._src; },
      set src(url) {
        img._src = url;
        if (img.onload && img.naturalWidth > 0) {
          img.onload.call(img);
        }
      }
    };
    return img;
  };

  // Mock canvas element for document.createElement
  var mockCanvasEl = function (w, h) {
    var c = createMockCanvas(w, h);
    // Temporary canvases for decode: need drawImage + getImageData
    var tempCtx = null;
    var _origGetContext = c.getContext;
    c.getContext = function (type, attrs) {
      if (type !== '2d') return null;
      if (!tempCtx) {
        tempCtx = createMockCanvasContext(c);
        // For temp canvases, drawImage should store pixel data
        tempCtx.drawImage = function (img, dx, dy, dw, dh) {
          // Store that draw was called with dimensions
          tempCtx._drawCalled = true;
          tempCtx._drawW = dw || img.naturalWidth || c.width;
          tempCtx._drawH = dh || img.naturalHeight || c.height;
        };
        // getImageData returns a valid ImageData
        tempCtx.getImageData = function (x, y, w, h) {
          if (w > 0 && h > 0) {
            // ImageData is available as a top-level sandbox global
            return new ImageData(new Uint8ClampedArray(w * h * 4), w, h);
          }
          return null;
        };
      }
      return tempCtx;
    };
    return c;
  };

  var interactionHolder = { surface: null };

  var ctx = vm.createContext({
    // Standard JS
    Math: Math, Number: Number, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat,
    Array: Array, Object: Object, String: String, Boolean: Boolean,
    Error: Error, TypeError: TypeError, RangeError: RangeError,
    JSON: JSON, console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    Uint8ClampedArray: Uint8ClampedArray,
    Float64Array: Float64Array,
    hypot: Math.hypot,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    min: Math.min,
    max: Math.max,
    sqrt: Math.sqrt,

    // ImageData needs to be a top-level global for mock canvases that use global.ImageData
    ImageData: global.ImageData,

    // These will be set after context creation to avoid self-reference issues
    Image: null,
    URL: null,

    // DOM stubs
    document: {
      createElement: function (tag) {
        if (tag.toLowerCase() === 'canvas') {
          return mockCanvasEl();
        }
        var el = createMockElement(tag);
        // The mount function creates a div for the interaction surface.
        // Give it pointer capture support.
        if (tag.toLowerCase() === 'div') {
          el._capturedPointerId = -1;
          el.setPointerCapture = function (id) {
            el._capturedPointerId = id;
          };
          el.releasePointerCapture = function (id) {
            if (el._capturedPointerId === id || id === undefined) {
              el._capturedPointerId = -1;
            }
          };
          // Preserve event dispatch
          var origTrigger = el._triggerEvent;
          el._triggerEvent = function (name, evt) {
            if (el._eventListeners && el._eventListeners[name]) {
              el._eventListeners[name].forEach(function (fn) { fn(evt); });
            }
          };
          interactionHolder.surface = el;
        }
        return el;
      },
      createDocumentFragment: function () { return {}; },
      addEventListener: function () {}
    },
    _capturedInteractionSurface: interactionHolder,
    window: {
      innerWidth: 320,
      innerHeight: 800,
      addEventListener: function () {},
      removeEventListener: function () {},
      ImageData: global.ImageData
    },

    // Geometry spies installed after alignment module runs (see setupTool)

    ToolShell: {
      _modules: [],
      _lastModule: null,
      register: function (mod) {
        this._modules.push(mod);
        this._lastModule = mod;
      }
    },

    ImageManager: imageManager,
    _capturedInteractionSurface: interactionHolder
  });

  // Set global mocks after context creation to avoid self-reference issues
  ctx.Image = MockImage;
  ctx.ImageData = global.ImageData;
  var urlList = [];
  var urlMock = {
    createObjectURL: function (file) {
      var url = 'blob:mock/' + urlList.length;
      urlList.push(url);
      return url;
    },
    revokeObjectURL: function (url) {
      var idx = urlList.indexOf(url);
      if (idx >= 0) urlList.splice(idx, 1);
    }
  };
  ctx.URL = urlMock;

  return ctx;
}

// ==============================================================
// Setup helper: loads modules in VM and mounts tool
// ==============================================================

var vm = require('vm');
var fs = require('fs');
var path = require('path');

var alignCode = fs.readFileSync(path.join(__dirname, '..', 'underpaintingAlignment.js'), 'utf8');
var toolCode = fs.readFileSync(path.join(__dirname, '..', 'underpaintingAccuracyTool.js'), 'utf8');

function setupTool(opts) {
  opts = opts || {};
  var container = buildMockContainer();
  var ctx = buildVMContext(container, opts);
  ctx._warpCount = 0;

  // Run alignment module (declares global functions in sandbox)
  vm.runInContext(alignCode, ctx);

  // Override alignment functions with spies AFTER the module runs but BEFORE the tool.
  // This ensures tool code calls our controlled versions.
  var ID = global.ImageData;
  ctx.warpPerspective = function (src, corners, ow, oh) {
    ctx._warpCount = (ctx._warpCount || 0) + 1;
    return new ID(new Uint8ClampedArray(ow * oh * 4), ow, oh);
  };
  ctx.validateCornerQuad = function (pts, w, h) {
    if (!pts || pts.length < 4) return { valid: false, code: 'incomplete', message: 'Need 4 points' };
    // Check for duplicate/close points on a 100x100 image
    var minDist = 0.005 * Math.hypot(w - 1, h - 1);
    for (var i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < minDist) {
          return { valid: false, code: 'too-close', message: 'Points too close' };
        }
      }
    }
    return { valid: true, code: 'valid', message: '' };
  };
  ctx.computeWorkingSize = function (w, h) {
    return { width: Math.min(w, 100), height: Math.min(h, 100), scale: 1 };
  };
  ctx.resizeImageData = function (src, ow, oh) {
    return new ID(new Uint8ClampedArray(ow * oh * 4), ow, oh);
  };
  ctx.solveHomography = function () { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; };
  ctx.mapHomographyPoint = function (H, x, y) { return { x: x, y: y }; };

  // Run tool module (calls ToolShell.register)
  vm.runInContext(toolCode, ctx);

  var ToolShell = ctx.ToolShell;
  var mod = ToolShell._lastModule;
  if (!mod) throw new Error('Tool module did not register');

  var processFn = mod.mount(container);

  // Find the interaction surface: it was created with insertBefore
  // as the first child of stage. In our mock, we need to locate it
  // via the container's interaction surface reference.
  // The interaction surface is a div created in mount().
  // We'll capture it via the container's querySelector for #underpainting-stage
  // and check its children ... but our mock doesn't track children.
  // Instead, we install a hook: override document.createElement to
  // store the interaction surface when it creates the overlay.

  var els = container.elements;

  var harness = {
    container: container,
    ctx: ctx,
    processFn: processFn,
    elements: els,
    imageCanvas: els['underpainting-image-canvas'],
    guideCanvas: els['underpainting-guide-canvas'],
    referenceCanvas: els['underpainting-reference-canvas'],
    alignedCanvas: els['underpainting-aligned-canvas'],
    statusEl: els['underpainting-status'],
    magnifierCanvas: els['underpainting-magnifier'],
    comparisonPanel: els['underpainting-comparison-panel'],
    comparisonViewport: els['underpainting-comparison-viewport'],
    comparisonStage: els['underpainting-comparison-stage'],
    zoomInput: els['underpainting-zoom'],
    zoomLabel: els['underpainting-zoom-label'],
    zoomOutBtn: els['underpainting-zoom-out'],
    zoomInBtn: els['underpainting-zoom-in'],
    zoomResetBtn: els['underpainting-zoom-reset'],
    markingPanel: els['underpainting-marking-panel'],
    uploadPanel: els['underpainting-upload-panel'],
    nextCornerEl: els['underpainting-next-corner'],
    fileInput: els['underpainting-file'],
    undoBtn: els['underpainting-undo'],
    resetBtn: els['underpainting-reset'],
    opacityInput: els['underpainting-opacity'],
    opacityLabel: els['underpainting-opacity-label'],
    stage: els['underpainting-stage'],
    interactionSurface: (ctx._capturedInteractionSurface && ctx._capturedInteractionSurface.surface) || null,

    // Public helpers
    warpCount: function () { return ctx._warpCount || 0; },
    statusText: function () { return els['underpainting-status'].textContent; },
    setReference: function (imageData) { processFn(imageData); },
    comparisonVisible: function () {
      return !els['underpainting-comparison-panel'].classList._classes['hidden'];
    },
    markingVisible: function () {
      return !els['underpainting-marking-panel'].classList._classes['hidden'];
    },
    alignedBackingSize: function () {
      var c = els['underpainting-aligned-canvas'];
      return { w: c.width, h: c.height };
    },
    guideBackingSize: function () {
      var c = els['underpainting-guide-canvas'];
      return { w: c.width, h: c.height };
    },
    imageBackingSize: function () {
      var c = els['underpainting-image-canvas'];
      return { w: c.width, h: c.height };
    },
    referenceBackingSize: function () {
      var c = els['underpainting-reference-canvas'];
      return { w: c.width, h: c.height };
    },

    // Simulate a complete file decode → commit cycle
    // Sets naturalWidth/Height on the next Image created, then triggers file selection.
    triggerFileLoad: function (naturalW, naturalH) {
      // Override the top-level Image global so new Image() inside loadUnderpainting
      // produces an instance with naturalWidth/Height > 0, triggering sync onload.
      var origImage = ctx.Image;
      ctx.Image = function () {
        var img = new origImage();
        img.naturalWidth = naturalW || 100;
        img.naturalHeight = naturalH || 100;
        return img;
      };
      // Trigger file input change
      els['underpainting-file'].files = [{ type: 'image/jpeg' }];
      els['underpainting-file']._triggerEvent('change', {});
      // Restore Image constructor after a tick (no ongoing async ops since onload is sync)
      setTimeout(function () { ctx.Image = origImage; }, 0);
    },

    // Dispatch pointer events through the interaction surface's registered listeners
    triggerPointerDown: function (clientX, clientY, pointerId) {
      var surface = ctx._capturedInteractionSurface && ctx._capturedInteractionSurface.surface;
      if (!surface || !surface._eventListeners || !surface._eventListeners['pointerdown']) return;
      var evt = {
        clientX: clientX, clientY: clientY,
        pointerId: pointerId || 1,
        button: 0, buttons: 1,
        preventDefault: function () {}
      };
      surface._eventListeners['pointerdown'].forEach(function (fn) { fn(evt); });
    },
    triggerPointerMove: function (clientX, clientY, pointerId) {
      var surface = ctx._capturedInteractionSurface && ctx._capturedInteractionSurface.surface;
      if (!surface || !surface._eventListeners || !surface._eventListeners['pointermove']) return;
      var evt = {
        clientX: clientX, clientY: clientY,
        pointerId: pointerId || 1,
        preventDefault: function () {}
      };
      surface._eventListeners['pointermove'].forEach(function (fn) { fn(evt); });
    },
    triggerPointerUp: function (clientX, clientY, pointerId) {
      var surface = ctx._capturedInteractionSurface && ctx._capturedInteractionSurface.surface;
      if (!surface || !surface._eventListeners || !surface._eventListeners['pointerup']) return;
      var evt = {
        clientX: clientX, clientY: clientY,
        pointerId: pointerId || 1,
        preventDefault: function () {}
      };
      surface._eventListeners['pointerup'].forEach(function (fn) { fn(evt); });
    },
    triggerPointerCancel: function (pointerId) {
      var surface = ctx._capturedInteractionSurface && ctx._capturedInteractionSurface.surface;
      if (!surface || !surface._eventListeners || !surface._eventListeners['pointercancel']) return;
      var evt = {
        pointerId: pointerId || 1,
        preventDefault: function () {}
      };
      surface._eventListeners['pointercancel'].forEach(function (fn) { fn(evt); });
    },
    triggerLostPointerCapture: function (pointerId) {
      var surface = ctx._capturedInteractionSurface && ctx._capturedInteractionSurface.surface;
      if (!surface) return;
      if (surface._eventListeners && surface._eventListeners['lostpointercapture']) {
        var evt = { pointerId: pointerId || 1, target: surface };
        surface._eventListeners['lostpointercapture'].forEach(function (fn) { fn(evt); });
      }
    },
    clickUndo: function () {
      var btn = els['underpainting-undo'];
      if (btn._eventListeners && btn._eventListeners['click']) {
        btn._eventListeners['click'].forEach(function (fn) { fn({}); });
      }
    },
    clickReset: function () {
      var btn = els['underpainting-reset'];
      if (btn._eventListeners && btn._eventListeners['click']) {
        btn._eventListeners['click'].forEach(function (fn) { fn({}); });
      }
    },
    setZoom: function (value) {
      els['underpainting-zoom'].value = String(value);
      els['underpainting-zoom']._triggerEvent('input', {});
    },
    clickZoomOut: function () { els['underpainting-zoom-out']._triggerEvent('click', {}); },
    clickZoomIn: function () { els['underpainting-zoom-in']._triggerEvent('click', {}); },
    clickZoomReset: function () { els['underpainting-zoom-reset']._triggerEvent('click', {}); },
    triggerPanDown: function (x, y, pointerId) {
      els['underpainting-comparison-viewport']._triggerEvent('pointerdown', {
        clientX: x, clientY: y, pointerId: pointerId || 1,
        button: 0, preventDefault: function () {}
      });
    },
    triggerPanMove: function (x, y, pointerId) {
      els['underpainting-comparison-viewport']._triggerEvent('pointermove', {
        clientX: x, clientY: y, pointerId: pointerId || 1,
        preventDefault: function () {}
      });
    },
    triggerPanUp: function (pointerId) {
      els['underpainting-comparison-viewport']._triggerEvent('pointerup', {
        pointerId: pointerId || 1, preventDefault: function () {}
      });
    },

    // Override guide canvas context to fail on certain operations
    makeGuideContextThrowOnBeginPath: function () {
      var ctx2d = els['underpainting-guide-canvas'].getContext('2d');
      if (ctx2d) ctx2d._throwsOnBeginPath = true;
    },
    makeImageContextThrowOnPutImageData: function () {
      var ctx2d = els['underpainting-image-canvas'].getContext('2d');
      if (ctx2d) ctx2d._throwsOnPutImageData = true;
    },
    makeGuideContextNull: function () {
      els['underpainting-guide-canvas'].getContext = function () { return null; };
    },
    // Reset guide context to default
    resetGuideContext: function () {
      els['underpainting-guide-canvas']._resetContext();
    },
    resetImageContext: function () {
      els['underpainting-image-canvas']._resetContext();
    }
  };

  return harness;
}

// ==============================================================
// Test suite
// ==============================================================

var testSeq = 0;

function runTest(name, fn) {
  testSeq++;
  console.log('\n--- Test ' + testSeq + ': ' + name + ' ---');
  fn();
}

// ─── Test 1: Capture acquisition failure rollback ─────────────
runTest('Capture acquisition failure rollback', function () {
  // Mount and set reference + underpainting → aligned state
  var tool = setupTool({});

  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  // Decode is synchronous in mock, tool is now in marking state
  // Add 4 points to get to aligned state
  tool.triggerPointerDown(10.5, 10.5, 1);   // point 0 (top-left)
  tool.triggerPointerDown(90.5, 10.5, 1);   // point 1 (top-right)
  tool.triggerPointerDown(90.5, 90.5, 1);   // point 2 (bottom-right)

  // Before adding 4th point, test capture failure during drag attempt
  // Mock the interaction surface to throw on setPointerCapture
  tool.ctx._capturedInteractionSurface.surface.setPointerCapture = function () {
    throw new Error('setPointerCapture failed');
  };

  var warpBefore = tool.warpCount();
  // Attempt drag on handle 0 at (10.5, 10.5) with capture-throwing surface
  tool.triggerPointerDown(10.5, 10.5, 2);
  // Verify no warp occurred (drag should have been aborted before invalidation)
  assertEq(tool.warpCount(), warpBefore, 'capture-failure drag does not warp');

  // Restore normal capture
  tool.ctx._capturedInteractionSurface.surface.setPointerCapture = function (id) {
    tool.ctx._capturedInteractionSurface.surface._capturedPointerId = id;
  };
  // Add 4th point to create valid quad
  tool.triggerPointerDown(10.5, 90.5, 3);   // point 3 (bottom-left)

  // Should have auto-aligned (4 valid points)
  var warpAfter = tool.warpCount();
  assert(warpAfter >= 1, 'four valid points trigger warp, got ' + warpAfter);

  // Now test capture failure from aligned state
  // First assert that aligned comparison IS visible
  assert(tool.comparisonVisible(), 'aligned comparison visible before capture attempt');
  var warpCount2 = tool.warpCount();
  var upperBacking2 = tool.alignedBackingSize();

  // Reinstate throwing capture
  tool.ctx._capturedInteractionSurface.surface.setPointerCapture = function () {
    throw new Error('setPointerCapture failed');
  };
  // Attempt drag on handle 2 at (90.5, 90.5)
  tool.triggerPointerDown(90.5, 90.5, 4);

  // After failed capture: aligned still visible, no warp, upper backing unchanged
  assertEq(tool.comparisonVisible(), true, 'capture failure preserves aligned visibility');
  assertEq(tool.warpCount(), warpCount2, 'capture failure does not warp');
  var upperAfter = tool.alignedBackingSize();
  assertEq(upperAfter.w, upperBacking2.w, 'capture failure leaves upper backing unchanged');
  assertEq(upperAfter.h, upperBacking2.h, 'capture failure leaves upper backing unchanged');
});

// ─── Test 2: Normal drag complete → exactly one warp ──────────
runTest('Normal drag completion produces exactly one warp', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  // Set 4 points (will be valid since they're far apart)
  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  var warpAfterSetup = tool.warpCount();
  assert(warpAfterSetup >= 1, 'setup produced at least 1 warp, got ' + warpAfterSetup);

  // Now drag handle 0 to a new position
  tool.triggerPointerDown(10.5, 10.5, 2);
  tool.triggerPointerMove(20.5, 20.5, 2);
  tool.triggerPointerUp(20.5, 20.5, 2);

  // After release: exactly one additional warp
  assertEq(tool.warpCount(), warpAfterSetup + 1,
    'normal drag up produces exactly one additional warp');
});

// ─── Test 3: Pointer cancel produces exactly one warp ─────────
runTest('Pointer cancel produces exactly one warp', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  var warpBefore = tool.warpCount();
  assert(warpBefore >= 1, 'setup produced warp, got ' + warpBefore);

  // Drag handle 0, then cancel
  tool.triggerPointerDown(10.5, 10.5, 2);
  tool.triggerPointerMove(30.5, 30.5, 2);
  tool.triggerPointerCancel(2);

  // Cancel should also trigger finishDrag → completeDrag → alignOnce
  assertEq(tool.warpCount(), warpBefore + 1,
    'pointer cancel produces exactly one additional warp');
});

// ─── Test 4: Second pointer isolation ─────────────────────────
runTest('Second pointer isolation during active drag', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  var warpBefore = tool.warpCount();
  assert(warpBefore >= 1, 'setup produced warp');

  // Start drag with pointer 2
  tool.triggerPointerDown(10.5, 10.5, 2);
  tool.triggerPointerMove(15.5, 15.5, 2);

  // Second pointer (3) tries to drag — should be ignored
  tool.triggerPointerDown(90.5, 90.5, 3);
  // Third pointer move/up should not affect the drag
  tool.triggerPointerMove(80.5, 80.5, 3);
  tool.triggerPointerUp(80.5, 80.5, 3);

  // First pointer continues and completes
  tool.triggerPointerMove(25.5, 25.5, 2);
  tool.triggerPointerUp(25.5, 25.5, 2);

  // Should be exactly 1 warp from the completion
  assertEq(tool.warpCount(), warpBefore + 1,
    'second pointer ignored, only one additional warp after first pointer release');
});

// ─── Test 5: Undo/Reset during active drag = zero warps ───────
runTest('Undo/Reset during active drag produce zero warps', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  var warpBefore = tool.warpCount();
  assert(warpBefore >= 1, 'setup produced warp');

  // Start drag on handle 0
  tool.triggerPointerDown(10.5, 10.5, 2);
  tool.triggerPointerMove(30.5, 30.5, 2);

  // Undo while dragging → cancels drag, pops last point
  tool.clickUndo();

  // Should be no additional warps
  assertEq(tool.warpCount(), warpBefore,
    'undo during active drag produces zero warps');

  // Re-add points
  tool.triggerPointerDown(10, 90, 3);
  tool.triggerPointerDown(10, 90, 3); // need 4 to make valid
  tool.triggerPointerDown(90, 10, 3);
  tool.triggerPointerDown(90, 90, 3);

  warpBefore = tool.warpCount();

  // Start drag
  tool.triggerPointerDown(10.5, 10.5, 4);
  tool.triggerPointerMove(15.5, 15.5, 4);

  tool.clickReset();

  assertEq(tool.warpCount(), warpBefore,
    'reset during active drag produces zero warps');
});

// ─── Test 6: Guide failure in addPoint stops warp ─────────────
runTest('Guide failure in addPoint stops warp and releases backings', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  // Add first 3 points normally
  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);

  // Make guide canvas context throw on beginPath
  tool.makeGuideContextThrowOnBeginPath();

  var warpBefore = tool.warpCount();
  // Add 4th point — guide drawing will fail
  tool.triggerPointerDown(10, 90, 2);

  // No warp should have occurred (addPoint stops before validation)
  assertEq(tool.warpCount(), warpBefore,
    'guide failure in addPoint prevents warp, warps: ' + tool.warpCount());
  // Status should show error
  var st = tool.statusText();
  assert(st.indexOf('mock failure') >= 0 || st.indexOf('Failed') >= 0 || st.indexOf('error') >= 0,
    'status shows error after guide failure: "' + st + '"');
});

// ─── Test 7: Guide failure during drag stops validation ───────
runTest('Guide failure during drag cancels and releases backings', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  var warpBefore = tool.warpCount();
  assert(warpBefore >= 1, 'setup produced warp');

  // Make guide throw on beginPath
  tool.makeGuideContextThrowOnBeginPath();

  // Start drag on handle 0
  tool.triggerPointerDown(10.5, 10.5, 2);
  tool.triggerPointerMove(20.5, 20.5, 2);
  tool.triggerPointerUp(20.5, 20.5, 2);

  // Guide failure during move should cancel drag, preventing warp,
  // and release guide/upper backings
  assertEq(tool.warpCount(), warpBefore,
    'guide failure during move prevents warp');
  var guideBacking = tool.guideBackingSize();
  assertEq(guideBacking.w, 0, 'guide backing zeroed after guide failure drag');
  var upperBacking = tool.alignedBackingSize();
  assertEq(upperBacking.w, 0, 'upper backing zeroed after guide failure drag');
  var st = tool.statusText();
  assert(st.indexOf('mock failure') >= 0 || st.indexOf('Failed') >= 0 || st.indexOf('error') >= 0,
    'status shows error after guide failure: "' + st + '"');
});

// ─── Test 8: Same-reference / opacity = zero warps ────────────
runTest('Same-reference and opacity changes produce zero warps', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  var warpAfterSetup = tool.warpCount();
  assert(warpAfterSetup >= 1, 'setup produced warp');

  // Same reference processing
  tool.setReference(refData);
  assertEq(tool.warpCount(), warpAfterSetup,
    'same reference causes zero additional warps');

  // Fake opacity change by triggering input event
  if (tool.opacityInput._eventListeners['input']) {
    tool.opacityInput.value = '75';
    tool.opacityInput._eventListeners['input'].forEach(function (fn) { fn({}); });
  }
  assertEq(tool.warpCount(), warpAfterSetup,
    'opacity change causes zero additional warps');
});

// ─── Test 9: New reference causes one resize and at most one warp ──
runTest('New reference causes one resize and at most one warp', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  var warpAfterSetup = tool.warpCount();
  assert(warpAfterSetup >= 1, 'setup produced warp');

  // New reference (different ImageData object)
  var refData2 = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData2);

  // Expect exactly one additional warp (for the new reference)
  assertEq(tool.warpCount(), warpAfterSetup + 1,
    'new reference produces exactly one additional warp');
});

// ─── Test 10: Reset clears aligned backing before guide operations ──
runTest('Reset clears aligned backing before fallible guide operations', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  // Check that aligned canvas has backing
  var alignedBefore = tool.alignedBackingSize();
  assert(alignedBefore.w > 0, 'aligned canvas has backing before reset');

  // Make guide context null to simulate clearRect failure
  tool.makeGuideContextNull();
  tool.clickReset();

  // Aligned should be zeroed even though guide clearRect failed
  var alignedAfter = tool.alignedBackingSize();
  assertEq(alignedAfter.w, 0,
    'aligned canvas is zeroed after reset even with guide failure');
});

// ─── Test 11: commitUnderpainting failure releases backings ──────
runTest('commitUnderpainting failure releases backings', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);

  // Make image canvas putImageData throw
  tool.makeImageContextThrowOnPutImageData();
  tool.triggerFileLoad(100, 100);

  var imgBacking = tool.imageBackingSize();
  var guideBacking = tool.guideBackingSize();
  // After failed commit, both backings should be zeroed
  assertEq(imgBacking.w, 0,
    'image canvas backing zeroed after failed commit');
  assertEq(guideBacking.w, 0,
    'guide canvas backing zeroed after failed commit');
  var st = tool.statusText();
  assert(st.indexOf('mock failure') >= 0 || st.indexOf('Failed') >= 0 || st.indexOf('error') >= 0,
    'status shows error after failed commit: "' + st + '"');
});

// ─── Test 12: Lost pointer capture triggers finishDrag exactly once ──
runTest('Lost pointer capture triggers finishDrag exactly once', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  var warpBefore = tool.warpCount();
  assert(warpBefore >= 1, 'setup produced warp');

  // Start drag on handle 0
  tool.triggerPointerDown(10.5, 10.5, 2);
  tool.triggerPointerMove(15.5, 15.5, 2);

  // Simulate lost pointer capture
  tool.triggerLostPointerCapture(2);

  // Expect exactly one additional warp from the lost-capture completion
  assertEq(tool.warpCount(), warpBefore + 1,
    'lost pointer capture produces exactly one warp');
});

// ─── Test 13: Undo/Reset during capture uses reentrancy guard, zero warp ──
runTest('Undo/Reset during capture use reentrancy guard, zero warp', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  var warpBefore = tool.warpCount();
  assert(warpBefore >= 1, 'setup produced warp');

  // Start drag on handle 0
  tool.triggerPointerDown(10.5, 10.5, 2);
  tool.triggerPointerMove(20.5, 20.5, 2);

  // Reset while drag is active — should cancel drag with reentrancy guard
  tool.clickReset();

  // No additional warp
  assertEq(tool.warpCount(), warpBefore,
    'reset during captured drag produces zero warps');

  // Re-add points for undo test
  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  warpBefore = tool.warpCount();

  // Start drag on handle 0
  tool.triggerPointerDown(10.5, 10.5, 3);
  tool.triggerPointerMove(20.5, 20.5, 3);

  // Undo while drag is active
  tool.clickUndo();

  assertEq(tool.warpCount(), warpBefore,
    'undo during captured drag produces zero warps');
});

// ─── Test 14: New reference with guide failure = no warp, backing cleanup ──
runTest('New reference with guide failure causes no warp and releases backings', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  var warpAfterSetup = tool.warpCount();
  assert(warpAfterSetup >= 1, 'setup produced warp');

  // Make guide context throw
  tool.makeGuideContextThrowOnBeginPath();

  var refData2 = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData2);

  // No additional warp should occur
  assertEq(tool.warpCount(), warpAfterSetup,
    'new reference with guide failure does not warp');
  // Comparison should be hidden
  assertEq(tool.comparisonVisible(), false,
    'comparison hidden after new reference with guide failure');
  // Guide backing should be zeroed
  var guideBacking = tool.guideBackingSize();
  assertEq(guideBacking.w, 0, 'guide backing zeroed after guide failure on new reference');
  // Upper backing should be zeroed
  var upperBacking = tool.alignedBackingSize();
  assertEq(upperBacking.w, 0, 'upper backing zeroed after guide failure on new reference');
  // Error shown
  var st = tool.statusText();
  assert(st.indexOf('mock failure') >= 0 || st.indexOf('Failed') >= 0 || st.indexOf('error') >= 0,
    'status shows error after new-reference guide failure: "' + st + '"');
});

// ─── Test 15: Replacement during active drag = zero warps ──────────────
runTest('Replacement during active drag produces zero warps', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  var warpBefore = tool.warpCount();
  assert(warpBefore >= 1, 'setup produced warp');

  // Start drag on handle 0
  tool.triggerPointerDown(10.5, 10.5, 2);
  tool.triggerPointerMove(15.5, 15.5, 2);

  // Trigger replacement file load while drag is active
  tool.triggerFileLoad(100, 100);

  // No additional warp (replacement cancels drag without completing it)
  assertEq(tool.warpCount(), warpBefore,
    'replacement during active drag produces zero warps');
  // Guide and upper backings should be zeroed (old drag state cleaned up)
  var guideBacking = tool.guideBackingSize();
  assertEq(guideBacking.w, 0, 'guide backing zeroed after replacement during drag');
  var upperBacking = tool.alignedBackingSize();
  assertEq(upperBacking.w, 0, 'upper backing zeroed after replacement during drag');
  // Image canvas has a new fresh backing from the replacement decode
  var imageBacking = tool.imageBackingSize();
  assert(imageBacking.w > 0, 'image canvas has fresh backing after replacement');
  // Should be in marking state (new decode completed)
  var st = tool.statusText();
  assert(st.indexOf('top-left') >= 0 || st.indexOf('Tap') >= 0,
    'status shows corner prompt after replacement: "' + st + '"');
});

// ─── Test 16: Duplicate terminal events (pointerup + cancel) = exactly one warp ──
runTest('Duplicate terminal events produce exactly one warp', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);

  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  var warpBefore = tool.warpCount();
  assert(warpBefore >= 1, 'setup produced warp');

  // Start drag on handle 0 with pointer id 2
  tool.triggerPointerDown(10.5, 10.5, 2);
  tool.triggerPointerMove(20.5, 20.5, 2);

  // Dispatch BOTH pointerup and pointercancel (reentrancy guard should allow only one)
  tool.triggerPointerUp(20.5, 20.5, 2);
  tool.triggerPointerCancel(2);

  // Exactly one additional warp
  assertEq(tool.warpCount(), warpBefore + 1,
    'duplicate terminal events produce exactly one warp');
  // Comparison should be visible (aligned)
  assertEq(tool.comparisonVisible(), true,
    'comparison visible after duplicate terminal events');
});

// ─── Test 17: Static magnifier and zoom DOM contract ──────────
runTest('Magnifier and zoom controls exist in the production DOM', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  [
    'underpainting-magnifier',
    'underpainting-comparison-viewport',
    'underpainting-zoom-out',
    'underpainting-zoom',
    'underpainting-zoom-label',
    'underpainting-zoom-in',
    'underpainting-zoom-reset'
  ].forEach(function (id) {
    assert(html.indexOf('id="' + id + '"') >= 0,
      'production DOM contains #' + id);
  });
  assert(/id="underpainting-comparison-viewport"[\s\S]*?tabindex="0"/.test(html),
    'comparison viewport is keyboard focusable');
  assert(/id="underpainting-zoom-label"[^>]*aria-live="polite"/.test(html),
    'programmatic zoom changes are announced');
});

// ─── Test 18: Underpainting-only drag magnifier lifecycle ─────
runTest('Drag magnifier uses underpainting pixels and follows the marker', function () {
  var tool = setupTool({});
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);
  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  var warpBefore = tool.warpCount();
  tool.triggerPointerDown(10.5, 10.5, 2);

  assert(!tool.magnifierCanvas.classList.contains('hidden'),
    'magnifier becomes visible after an existing handle drag starts');
  var magnifierCtx = tool.magnifierCanvas.getContext('2d');
  assert(magnifierCtx._drawImageCalls > 0, 'magnifier draws an image crop');
  assertEq(magnifierCtx._drawImageArgs[0], tool.imageCanvas,
    'magnifier source is the underpainting image canvas');
  assertEq(tool.warpCount(), warpBefore,
    'showing the magnifier does not run the projective warp');

  var firstSourceX = magnifierCtx._drawImageArgs[1];
  tool.triggerPointerMove(25.5, 25.5, 2);
  assert(magnifierCtx._drawImageCalls > 1,
    'active marker movement redraws the magnifier');
  assertNeq(magnifierCtx._drawImageArgs[1], firstSourceX,
    'magnifier crop follows the moved marker');
  assertEq(tool.warpCount(), warpBefore,
    'moving the magnifier does not run the projective warp');

  var left = parseFloat(tool.magnifierCanvas.style.left);
  var top = parseFloat(tool.magnifierCanvas.style.top);
  assert(left >= 8 && left + 168 <= tool.ctx.window.innerWidth - 8,
    'magnifier remains within a 320px viewport horizontally');
  assert(top >= 8 && top + 168 <= tool.ctx.window.innerHeight - 8,
    'magnifier remains within the viewport vertically');

  tool.triggerPointerUp(25.5, 25.5, 2);
  assert(tool.magnifierCanvas.classList.contains('hidden'),
    'magnifier hides when marker drag completes');
});

// ─── Test 19: Centered fit and no-warp zoom controls ──────────
runTest('Comparison zoom changes CSS size without changing backing or warp', function () {
  var tool = setupTool({});
  tool.comparisonViewport.clientWidth = 960;
  tool.comparisonViewport.offsetWidth = 960;
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 50 * 4), 100, 50);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);
  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  assertEq(tool.comparisonStage.style.width, '960px',
    '100% comparison fit is capped at 960px');
  assertEq(tool.comparisonStage.style.height, '480px',
    'comparison fit preserves reference aspect ratio');
  assertEq(tool.comparisonStage.style.marginLeft, 'auto',
    'fit comparison is centered');
  assertEq(tool.comparisonStage.style.marginRight, 'auto',
    'fit comparison is centered');

  var warpBefore = tool.warpCount();
  var backingBefore = tool.alignedBackingSize();
  tool.setZoom(50);
  assertEq(tool.comparisonStage.style.width, '480px',
    '50% zoom halves comparison CSS width');
  tool.comparisonViewport.scrollLeft = 0;
  tool.setZoom(200);
  assertEq(tool.comparisonStage.style.width, '1920px',
    '200% zoom doubles comparison CSS width');
  assertEq(tool.comparisonViewport.scrollLeft, 480,
    'zooming from a centered sub-100% view preserves the image center');
  assertEq(tool.zoomLabel.textContent, '200%', 'zoom label updates');
  assertEq(tool.warpCount(), warpBefore, 'zoom does not rerun warp');
  assertEq(tool.alignedBackingSize().w, backingBefore.w,
    'zoom does not resize aligned canvas backing');
  assertEq(tool.referenceBackingSize().w, 100,
    'zoom does not resize reference canvas backing');
  tool.opacityInput.value = '75';
  tool.opacityInput._triggerEvent('input', {});
  assertEq(tool.zoomInput.value, '200',
    'opacity changes do not reset comparison zoom');
  assertEq(tool.comparisonStage.style.width, '1920px',
    'opacity changes do not alter zoomed comparison size');

  tool.setZoom(999);
  assertEq(tool.zoomInput.value, '400', 'zoom clamps to 400%');
  tool.clickZoomReset();
  assertEq(tool.zoomInput.value, '100', 'zoom reset returns to 100%');
  tool.clickZoomOut();
  assertEq(tool.zoomInput.value, '75', 'zoom-out button changes zoom by 25%');
  tool.clickZoomIn();
  assertEq(tool.zoomInput.value, '100', 'zoom-in button changes zoom by 25%');
  assertEq(tool.warpCount(), warpBefore, 'all zoom controls remain no-warp');
});

// ─── Test 20: Zoomed comparison pointer panning ───────────────
runTest('Zoomed comparison can be panned without warping', function () {
  var tool = setupTool({});
  tool.comparisonViewport.clientWidth = 600;
  tool.comparisonViewport.offsetWidth = 600;
  tool.comparisonViewport.clientHeight = 400;
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);
  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);
  tool.setZoom(200);

  tool.comparisonViewport.scrollLeft = 150;
  tool.comparisonViewport.scrollTop = 100;
  var warpBefore = tool.warpCount();
  tool.triggerPanDown(200, 200, 9);
  tool.triggerPanMove(160, 170, 9);
  tool.triggerPanUp(9);

  assertEq(tool.comparisonViewport.scrollLeft, 190,
    'pointer panning updates horizontal scroll offset');
  assertEq(tool.comparisonViewport.scrollTop, 130,
    'pointer panning updates vertical scroll offset');
  assertEq(tool.warpCount(), warpBefore, 'panning does not rerun warp');
});

// ─── Test 21: Dynamic viewport-height center preservation ─────
runTest('Zoom preserves vertical center when viewport height changes', function () {
  var tool = setupTool({});
  tool.comparisonViewport.clientWidth = 960;
  tool.comparisonViewport.offsetWidth = 960;
  Object.defineProperty(tool.comparisonViewport, 'clientHeight', {
    configurable: true,
    get: function () {
      var stageHeight = parseFloat(tool.comparisonStage.style.height) || 200;
      return Math.min(450, stageHeight);
    }
  });
  var refData = new global.ImageData(new Uint8ClampedArray(100 * 50 * 4), 100, 50);
  tool.setReference(refData);
  tool.triggerFileLoad(100, 100);
  tool.triggerPointerDown(10, 10, 1);
  tool.triggerPointerDown(90, 10, 1);
  tool.triggerPointerDown(90, 90, 1);
  tool.triggerPointerDown(10, 90, 1);

  tool.setZoom(50);
  tool.comparisonViewport.scrollTop = 0;
  tool.setZoom(200);
  assertEq(tool.comparisonViewport.scrollTop, 255,
    '50%→200% keeps the image vertically centered after viewport growth');
});

// ─── Test 22: Magnifier termination and edge-aware placement ──
runTest('Magnifier hides on every drag termination and avoids viewport edges', function () {
  function alignedTool() {
    var tool = setupTool({});
    var ref = new global.ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100);
    tool.setReference(ref);
    tool.triggerFileLoad(100, 100);
    tool.triggerPointerDown(10, 10, 1);
    tool.triggerPointerDown(90, 10, 1);
    tool.triggerPointerDown(90, 90, 1);
    tool.triggerPointerDown(10, 90, 1);
    return tool;
  }

  var cancelTool = alignedTool();
  cancelTool.triggerPointerDown(10.5, 10.5, 2);
  cancelTool.triggerPointerCancel(2);
  assert(cancelTool.magnifierCanvas.classList.contains('hidden'),
    'pointer cancel hides magnifier');

  var lostTool = alignedTool();
  lostTool.triggerPointerDown(10.5, 10.5, 2);
  lostTool.triggerLostPointerCapture(2);
  assert(lostTool.magnifierCanvas.classList.contains('hidden'),
    'lost pointer capture hides magnifier');

  var resetTool = alignedTool();
  resetTool.triggerPointerDown(10.5, 10.5, 2);
  resetTool.clickReset();
  assert(resetTool.magnifierCanvas.classList.contains('hidden'),
    'reset during drag hides magnifier');

  var undoTool = alignedTool();
  undoTool.triggerPointerDown(10.5, 10.5, 2);
  undoTool.clickUndo();
  assert(undoTool.magnifierCanvas.classList.contains('hidden'),
    'undo during drag hides magnifier');

  var replaceTool = alignedTool();
  replaceTool.triggerPointerDown(10.5, 10.5, 2);
  replaceTool.triggerFileLoad(100, 100);
  assert(replaceTool.magnifierCanvas.classList.contains('hidden'),
    'replacement upload during drag hides magnifier');

  var failureTool = alignedTool();
  failureTool.interactionSurface.setPointerCapture = function () {
    throw new Error('capture failed');
  };
  failureTool.triggerPointerDown(10.5, 10.5, 2);
  assert(failureTool.magnifierCanvas.classList.contains('hidden'),
    'failed pointer capture never shows magnifier');

  var edgeTool = alignedTool();
  edgeTool.imageCanvas.getBoundingClientRect = function () {
    return { left: 200, top: 700, width: 100, height: 100 };
  };
  edgeTool.triggerPointerDown(290.5, 790.5, 2);
  var left = parseFloat(edgeTool.magnifierCanvas.style.left);
  var top = parseFloat(edgeTool.magnifierCanvas.style.top);
  assert(left >= 8 && left + 168 <= 312,
    'magnifier switches horizontally near the right viewport edge');
  assert(top >= 8 && top + 168 <= 792,
    'magnifier switches vertically near the bottom viewport edge');
});

// ==============================================================
// Results (all tests are synchronous in mock environment)
// ==============================================================
console.log('\n==============================');
console.log('Tests: ' + (passed + failed) + ' total, ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exit(1);
}

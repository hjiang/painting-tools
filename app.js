// app.js
// Painting Value Study — UI wiring.
// Handles file input, canvas rendering, controls, and download.

(function () {
  'use strict';

  // ── DOM references ─────────────────────────────────
  const fileInput = document.getElementById('file-input');
  const dropZone = document.getElementById('drop-zone');
  const uploadSection = document.getElementById('upload-section');
  const canvasSection = document.getElementById('canvas-section');
  const originalCanvas = document.getElementById('original-canvas');
  const resultCanvas = document.getElementById('result-canvas');
  const histogramCanvas = document.getElementById('histogram-canvas');
  const valueSlider = document.getElementById('value-slider');
  const valueLabel = document.getElementById('value-label');
  const downloadBtn = document.getElementById('download-btn');
  const modeRadios = document.getElementsByName('mode');
  const sketchToggle = document.getElementById('sketch-toggle');
  const sketchContent = document.getElementById('sketch-content');
  const sketchSection = document.querySelector('.sketch-section');
  const sketchCanvas = document.getElementById('sketch-canvas');
  const edgeThreshold = document.getElementById('edge-threshold');
  const edgeThresholdLabel = document.getElementById('edge-threshold-label');
  const edgeInvert = document.getElementById('edge-invert');
  const downloadSketchBtn = document.getElementById('download-sketch-btn');

  // ── State ─────────────────────────────────────────
  let sourceImage = null;        // HTMLImageElement (original, decoded)
  let sourceImageData = null;    // ImageData (original pixels, full res)
  let posterizedResult = null;   // { imageData, histogram } from last call
  let sketchImageData = null;    // ImageData from edge detection

  // ── Helpers ───────────────────────────────────────
  function getN() {
    return parseInt(valueSlider.value, 10);
  }

  function getMode() {
    for (const radio of modeRadios) {
      if (radio.checked) return radio.value;
    }
    return 'grayscale';
  }

  // Extract ImageData from an HTMLImageElement via offscreen canvas
  function imageToImageData(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  // Draw ImageData to a canvas, scaling to fit its CSS size
  function drawImageDataToCanvas(imageData, canvas) {
    // Set canvas resolution to match image data
    canvas.width = imageData.width;
    canvas.height = imageData.height;

    // Scale canvas display size to fit container, preserving aspect ratio
    const maxW = Math.min(canvas.parentElement.clientWidth - 16, 540);
    const scale = Math.min(1, maxW / imageData.width);
    canvas.style.width = Math.round(imageData.width * scale) + 'px';
    canvas.style.height = Math.round(imageData.height * scale) + 'px';

    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
  }

  // ── Core render pipeline ──────────────────────────
  function render() {
    if (!sourceImageData) return;

    const N = getN();
    const mode = getMode();
    valueLabel.textContent = N;

    // Posterize
    posterizedResult = posterize(sourceImageData, N, mode);

    // Draw to canvases
    drawImageDataToCanvas(sourceImageData, originalCanvas);
    drawImageDataToCanvas(posterizedResult.imageData, resultCanvas);

    // Draw histogram
    drawHistogram(histogramCanvas, posterizedResult.histogram, N);
  }

  // ── Edge detection pipeline ──────────────────────
  function renderSketch() {
    if (!sourceImageData) return;

    var threshold = parseInt(edgeThreshold.value, 10);
    var invert = edgeInvert.checked;
    edgeThresholdLabel.textContent = threshold;

    sketchImageData = detectEdges(sourceImageData, {
      threshold: threshold,
      invert: invert
    });

    drawImageDataToCanvas(sketchImageData, sketchCanvas);
  }

  // ── Event: file loaded ────────────────────────────
  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        sourceImage = img;
        sourceImageData = imageToImageData(img);

        // Show canvas section, hide upload
        uploadSection.classList.add('hidden');
        canvasSection.classList.remove('hidden');

        render();

        // If sketch section is open, also render the sketch
        if (!sketchContent.classList.contains('hidden')) {
          renderSketch();
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ── Event listeners ───────────────────────────────
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  // Drag and drop
  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', function () {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // Allow clicking anywhere on the drop zone label
  dropZone.addEventListener('click', function () {
    fileInput.click();
  });

  // Slider
  valueSlider.addEventListener('input', render);

  // Mode toggle
  for (const radio of modeRadios) {
    radio.addEventListener('change', render);
  }

  // Sketch section toggle
  sketchToggle.addEventListener('click', function () {
    var isOpen = !sketchContent.classList.contains('hidden');
    if (isOpen) {
      sketchContent.classList.add('hidden');
      sketchSection.classList.remove('open');
    } else {
      sketchContent.classList.remove('hidden');
      sketchSection.classList.add('open');
      // Render sketch on first open, or re-render if already computed
      if (!sketchImageData || sketchImageData.width !== sourceImageData.width) {
        renderSketch();
      }
    }
  });

  // Edge threshold slider
  edgeThreshold.addEventListener('input', function () {
    if (!sketchContent.classList.contains('hidden')) {
      renderSketch();
    }
  });

  // Edge invert checkbox
  edgeInvert.addEventListener('change', function () {
    if (!sketchContent.classList.contains('hidden')) {
      renderSketch();
    }
  });

  // Download sketch
  downloadSketchBtn.addEventListener('click', function () {
    if (!sketchImageData) return;

    var canvas = document.createElement('canvas');
    canvas.width = sketchImageData.width;
    canvas.height = sketchImageData.height;
    var ctx = canvas.getContext('2d');
    ctx.putImageData(sketchImageData, 0, 0);

    canvas.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'sketch.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  });

  // Download
  downloadBtn.addEventListener('click', function () {
    if (!posterizedResult) return;

    // Draw posterized result to a full-resolution offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = posterizedResult.imageData.width;
    canvas.height = posterizedResult.imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(posterizedResult.imageData, 0, 0);

    // Trigger download
    canvas.toBlob(function (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'posterized.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  });

  // ── Window resize: re-scale canvases ──────────────
  let resizeTimeout;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function () {
      if (sourceImageData && posterizedResult) {
        drawImageDataToCanvas(sourceImageData, originalCanvas);
        drawImageDataToCanvas(posterizedResult.imageData, resultCanvas);
      }
    }, 150);
  });
})();

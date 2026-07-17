// underpaintingAccuracyTool.js
// Tool module for the Underpainting Check — upload, mark corners,
// rectify via homography, and compare with opacity.
// Depends on: underpaintingAlignment.js (pure geometry)
//             app.js (ImageManager, ToolShell, createPromoteButton)

ToolShell.register({
  id: 'underpainting-accuracy',
  name: 'Underpainting Check',
  icon: '\uD83D\uDD0D', // 🔍

  mount: function (container) {
    'use strict';

    // ── DOM references (scoped to container) ──────────
    var fileInput = container.querySelector('#underpainting-file');
    var statusEl = container.querySelector('#underpainting-status');
    var uploadPanel = container.querySelector('#underpainting-upload-panel');
    var markingPanel = container.querySelector('#underpainting-marking-panel');
    var stage = container.querySelector('#underpainting-stage');
    var imageCanvas = container.querySelector('#underpainting-image-canvas');
    var guideCanvas = container.querySelector('#underpainting-guide-canvas');
    var magnifierCanvas = container.querySelector('#underpainting-magnifier');
    var nextCornerEl = container.querySelector('#underpainting-next-corner');
    var undoBtn = container.querySelector('#underpainting-undo');
    var resetBtn = container.querySelector('#underpainting-reset');
    var comparisonPanel = container.querySelector('#underpainting-comparison-panel');
    var comparisonViewport = container.querySelector('#underpainting-comparison-viewport');
    var comparisonStage = container.querySelector('#underpainting-comparison-stage');
    var referenceCanvas = container.querySelector('#underpainting-reference-canvas');
    var alignedCanvas = container.querySelector('#underpainting-aligned-canvas');
    var opacityInput = container.querySelector('#underpainting-opacity');
    var opacityLabel = container.querySelector('#underpainting-opacity-label');
    var zoomOutBtn = container.querySelector('#underpainting-zoom-out');
    var zoomInput = container.querySelector('#underpainting-zoom');
    var zoomLabel = container.querySelector('#underpainting-zoom-label');
    var zoomInBtn = container.querySelector('#underpainting-zoom-in');
    var zoomResetBtn = container.querySelector('#underpainting-zoom-reset');

    // ── State ─────────────────────────────────────────
    var referenceIdentity = null;
    var referenceSize = null;           // { width, height }
    var underpaintingPixels = null;     // owned capped ImageData
    var points = [];                    // capped underpainting pixel coords
    var state = 'needs-upload';

    // Decode generation token
    var loadGeneration = 0;
    var activeDecode = null;

    // Pointer state
    var dragIndex = -1;                 // -1 = not dragging
    var hasCapture = false;
    var activePointerId = -1;           // the pointer id currently captured
    var dragCleanup = false;            // guard against re-entrance from lostpointercapture

    // Comparison zoom/pan state. Zoom is CSS-only and never changes backing sizes.
    var zoomPercent = 100;
    var comparisonFitWidth = 0;
    var comparisonFitHeight = 0;
    var panPointerId = -1;
    var panStartX = 0;
    var panStartY = 0;
    var panStartScrollLeft = 0;
    var panStartScrollTop = 0;

    var MAGNIFIER_SIZE = 168;
    var MAGNIFIER_ZOOM = 4;
    var MAGNIFIER_GAP = 28;

    var cornerPrompts = [
      'Tap top-left corner of the canvas',
      'Tap top-right corner of the canvas',
      'Tap bottom-right corner of the canvas',
      'Tap bottom-left corner of the canvas'
    ];

    // ── setCanvasBackingSize ──────────────────────────
    function setCanvasBackingSize(canvas, w, h) {
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    // ── setState ──────────────────────────────────────
    function setState(newState) {
      state = newState;

      // Keep upload/replacement chooser and status visible in all mounted states
      uploadPanel.classList.remove('hidden');

      switch (state) {
        case 'needs-upload':
          markingPanel.classList.add('hidden');
          comparisonPanel.classList.add('hidden');
          statusEl.textContent = 'Upload an underpainting photo.';
          break;
        case 'loading':
          markingPanel.classList.add('hidden');
          comparisonPanel.classList.add('hidden');
          statusEl.textContent = 'Loading image…';
          break;
        case 'marking':
          markingPanel.classList.remove('hidden');
          comparisonPanel.classList.add('hidden');
          // Publish current corner/refinement prompt to visible text and live region
          updateCornerPrompt();
          statusEl.textContent = nextCornerEl.textContent;
          break;
        case 'aligning':
          markingPanel.classList.remove('hidden');
          statusEl.textContent = 'Computing alignment…';
          break;
        case 'aligned':
          markingPanel.classList.remove('hidden');
          comparisonPanel.classList.remove('hidden');
          statusEl.textContent = 'Aligned. Drag corners to refine or adjust opacity below.';
          break;
        case 'error':
          comparisonPanel.classList.add('hidden');
          if (underpaintingPixels) {
            markingPanel.classList.remove('hidden');
          } else {
            markingPanel.classList.add('hidden');
          }
          break;
      }
    }

    function showRecoverableError(msg) {
      statusEl.textContent = msg || 'An error occurred. Try again.';
      setState('error');
    }

    function showValidationMessage(msg) {
      // The state transition must happen first so the live region update
      // from setState does not overwrite this message.
      statusEl.textContent = msg || '';
    }

    function clearStatus() {
      statusEl.textContent = '';
    }

    // ── Comparison fit, zoom, and layout ───────────────
    function clampZoom(value) {
      if (!Number.isFinite(value)) return 100;
      return Math.max(50, Math.min(400, Math.round(value / 25) * 25));
    }

    function applyComparisonZoom(value, preserveCenter) {
      zoomPercent = clampZoom(value);
      zoomInput.value = String(zoomPercent);
      zoomLabel.textContent = zoomPercent + '%';
      if (!comparisonFitWidth || !comparisonFitHeight) return;

      var viewportWidth = comparisonViewport.clientWidth ||
        comparisonViewport.offsetWidth || comparisonFitWidth;
      var viewportHeight = comparisonViewport.clientHeight ||
        comparisonViewport.offsetHeight || comparisonFitHeight;
      var oldWidth = parseFloat(comparisonStage.style.width) || comparisonFitWidth;
      var oldHeight = parseFloat(comparisonStage.style.height) || comparisonFitHeight;
      // Auto margins center a stage narrower than the viewport. Subtract that
      // visual offset before converting the viewport center to image space.
      var oldMarginLeft = Math.max(0, (viewportWidth - oldWidth) / 2);
      var centerX = oldWidth > 0
        ? (comparisonViewport.scrollLeft + viewportWidth / 2 - oldMarginLeft) /
          oldWidth : 0.5;
      centerX = Math.max(0, Math.min(1, centerX));
      var centerY = oldHeight > 0
        ? (comparisonViewport.scrollTop + viewportHeight / 2) / oldHeight : 0.5;
      centerY = Math.max(0, Math.min(1, centerY));

      var renderedWidth = Math.round(comparisonFitWidth * zoomPercent / 100);
      var renderedHeight = Math.round(comparisonFitHeight * zoomPercent / 100);
      comparisonStage.style.width = renderedWidth + 'px';
      comparisonStage.style.height = renderedHeight + 'px';
      comparisonStage.style.marginLeft = 'auto';
      comparisonStage.style.marginRight = 'auto';
      referenceCanvas.style.width = '100%';
      referenceCanvas.style.height = '100%';
      alignedCanvas.style.width = '100%';
      alignedCanvas.style.height = '100%';

      // The viewport has a max-height rather than a fixed height, so changing
      // the stage can change its client dimensions. Re-read them before
      // restoring the image-space center.
      var newViewportWidth = comparisonViewport.clientWidth ||
        comparisonViewport.offsetWidth || viewportWidth;
      var newViewportHeight = comparisonViewport.clientHeight ||
        comparisonViewport.offsetHeight || viewportHeight;
      var maxScrollLeft = Math.max(0, renderedWidth - newViewportWidth);
      var maxScrollTop = Math.max(0, renderedHeight - newViewportHeight);
      var newMarginLeft = Math.max(0, (newViewportWidth - renderedWidth) / 2);
      if (preserveCenter) {
        comparisonViewport.scrollLeft = Math.max(0,
          Math.min(maxScrollLeft,
            newMarginLeft + centerX * renderedWidth - newViewportWidth / 2));
        comparisonViewport.scrollTop = Math.max(0,
          Math.min(maxScrollTop,
            centerY * renderedHeight - newViewportHeight / 2));
      } else {
        comparisonViewport.scrollLeft = maxScrollLeft / 2;
        comparisonViewport.scrollTop = maxScrollTop / 2;
      }
    }

    function updateComparisonFit() {
      if (!referenceSize) return;
      var availableWidth = comparisonViewport.clientWidth ||
        comparisonViewport.offsetWidth || comparisonPanel.offsetWidth ||
        container.clientWidth || Math.max(1, window.innerWidth - 32);
      comparisonFitWidth = Math.max(1, Math.min(960, availableWidth));
      comparisonFitHeight = comparisonFitWidth *
        referenceSize.height / referenceSize.width;
      applyComparisonZoom(zoomPercent, true);
    }

    function updateCssLayoutAndGuides() {
      if (!referenceSize || !referenceCanvas) return true;
      updateComparisonFit();
      if (state === 'marking' || state === 'aligned' || state === 'error') {
        return drawGuides();
      }
      return true;
    }

    // ── Update guide prompts ──────────────────────────
    function updateCornerPrompt() {
      var len = points.length;
      if (len < 4) {
        nextCornerEl.textContent = cornerPrompts[len];
      } else {
        nextCornerEl.textContent = 'Drag a corner to refine';
      }
    }

    // ── Invalidate alignment ──────────────────────────
    function invalidateAlignedComparison() {
      comparisonPanel.classList.add('hidden');
      // Resize to 0×0 to release backing storage (per plan ownership rules)
      if (alignedCanvas.width > 0 || alignedCanvas.height > 0) {
        alignedCanvas.width = 0;
        alignedCanvas.height = 0;
      }
    }

    // ── Clear underpainting and related storage ───────
    function clearUnderpaintingAndComparison() {
      hideMagnifier();
      underpaintingPixels = null;
      points = [];
      // Release image canvas backing (replace/failure path)
      setCanvasBackingSize(imageCanvas, 0, 0);
      // Release guide canvas backing (per plan: resize to 0×0 on replacement/failure)
      setCanvasBackingSize(guideCanvas, 0, 0);
      // Clear aligned canvas
      invalidateAlignedComparison();
      // Reset corner prompt
      updateCornerPrompt();
      clearStatus();
    }

    // ── Commit underpainting pixels (atomic) ──────────
    function commitUnderpainting(pixels) {
      try {
        // All canvas sizing, context acquisition, and drawing inside one
        // try/catch so any failure releases backings.
        setCanvasBackingSize(imageCanvas, pixels.width, pixels.height);
        var ctx = imageCanvas.getContext('2d');
        if (!ctx) throw new Error('Image canvas 2D context unavailable.');
        ctx.putImageData(pixels, 0, 0);
      } catch (error) {
        // Release both backings on any failure
        setCanvasBackingSize(imageCanvas, 0, 0);
        setCanvasBackingSize(guideCanvas, 0, 0);
        showRecoverableError(error.message || 'Failed to draw underpainting.');
        return;
      }

      // Atomic commit: only assign after successful draw
      underpaintingPixels = pixels;
      points = [];
      updateCornerPrompt();
      setState('marking');
    }

    // ── File decode ────────────────────────────────────
    function releaseDecodeJob(job, cancelImage) {
      if (!job || job.released) return;
      job.released = true;
      job.img.onload = null;
      job.img.onerror = null;
      if (cancelImage) job.img.src = '';
      URL.revokeObjectURL(job.url);
      if (activeDecode === job) activeDecode = null;
    }

    function loadUnderpainting(file) {
      var generation = ++loadGeneration;
      cancelActiveDrag();
      releaseDecodeJob(activeDecode, true);
      clearUnderpaintingAndComparison();
      if (!file || !file.type.startsWith('image/')) {
        showRecoverableError('Choose an image file.');
        return;
      }
      setState('loading');

      var url;
      try {
        url = URL.createObjectURL(file);
      } catch (error) {
        showRecoverableError('The image could not be opened.');
        return;
      }

      var img = new Image();
      var job = {
        generation: generation,
        img: img,
        url: url,
        released: false
      };
      activeDecode = job;

      img.onload = function () {
        var temporaryCanvas = null;
        try {
          if (job.released || generation !== loadGeneration) return;
          if (img.naturalWidth < 2 || img.naturalHeight < 2) {
            throw new RangeError('Image must be at least 2\u00a0\u00d7\u00a02 pixels.');
          }
          var size = computeWorkingSize(img.naturalWidth, img.naturalHeight,
            2000000, 2048);
          temporaryCanvas = document.createElement('canvas');
          temporaryCanvas.width = size.width;
          temporaryCanvas.height = size.height;
          var context = temporaryCanvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('Canvas 2D is unavailable.');
          context.drawImage(img, 0, 0, size.width, size.height);
          var pixels = context.getImageData(0, 0, size.width, size.height);
          if (job.released || generation !== loadGeneration) return;
          commitUnderpainting(pixels);
        } catch (error) {
          if (!job.released && generation === loadGeneration) {
            showRecoverableError(error.message);
          }
        } finally {
          if (temporaryCanvas) {
            temporaryCanvas.width = 0;
            temporaryCanvas.height = 0;
          }
          releaseDecodeJob(job, false);
        }
      };

      img.onerror = function () {
        var isCurrent = !job.released && generation === loadGeneration;
        releaseDecodeJob(job, false);
        if (isCurrent) showRecoverableError('The image could not be decoded.');
      };

      try {
        img.src = url;
      } catch (error) {
        releaseDecodeJob(job, true);
        if (generation === loadGeneration) {
          showRecoverableError('The image could not be opened.');
        }
      }
    }

    // ── Coordinate conversion ─────────────────────────
    function cssToBitmap(clientX, clientY) {
      if (!underpaintingPixels) return null;
      var rect = imageCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      var relCssX = clientX - rect.left;
      var relCssY = clientY - rect.top;
      var bmpW = underpaintingPixels.width;
      var bmpH = underpaintingPixels.height;
      var bmpX = relCssX * bmpW / rect.width - 0.5;
      var bmpY = relCssY * bmpH / rect.height - 0.5;
      // Preserve floating-point pixel-center coordinates (do not round)
      bmpX = Math.max(0, Math.min(bmpW - 1, bmpX));
      bmpY = Math.max(0, Math.min(bmpH - 1, bmpY));
      return { x: bmpX, y: bmpY, cssX: relCssX, cssY: relCssY };
    }

    // ── Drag magnifier ────────────────────────────────
    function hideMagnifier() {
      magnifierCanvas.classList.add('hidden');
      magnifierCanvas.setAttribute('aria-hidden', 'true');
    }

    function positionMagnifier(clientX, clientY) {
      var viewportWidth = window.innerWidth || 320;
      var viewportHeight = window.innerHeight || 568;
      var left = clientX + MAGNIFIER_GAP;
      var top = clientY - MAGNIFIER_SIZE - MAGNIFIER_GAP;
      if (left + MAGNIFIER_SIZE > viewportWidth - 8) {
        left = clientX - MAGNIFIER_SIZE - MAGNIFIER_GAP;
      }
      if (top < 8) top = clientY + MAGNIFIER_GAP;
      left = Math.max(8, Math.min(viewportWidth - MAGNIFIER_SIZE - 8, left));
      top = Math.max(8, Math.min(viewportHeight - MAGNIFIER_SIZE - 8, top));
      magnifierCanvas.style.left = left + 'px';
      magnifierCanvas.style.top = top + 'px';
    }

    function drawMagnifier(clientX, clientY) {
      if (dragIndex < 0 || !underpaintingPixels) return false;
      var rect = imageCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      try {
        setCanvasBackingSize(magnifierCanvas, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
        var ctx = magnifierCanvas.getContext('2d');
        if (!ctx) throw new Error('Magnifier canvas 2D context unavailable.');
        var point = points[dragIndex];
        var cropWidth = MAGNIFIER_SIZE * underpaintingPixels.width /
          (MAGNIFIER_ZOOM * rect.width);
        var cropHeight = MAGNIFIER_SIZE * underpaintingPixels.height /
          (MAGNIFIER_ZOOM * rect.height);
        var rawLeft = point.x + 0.5 - cropWidth / 2;
        var rawTop = point.y + 0.5 - cropHeight / 2;
        var sourceLeft = Math.max(0, rawLeft);
        var sourceTop = Math.max(0, rawTop);
        var sourceRight = Math.min(underpaintingPixels.width, rawLeft + cropWidth);
        var sourceBottom = Math.min(underpaintingPixels.height, rawTop + cropHeight);
        var destLeft = (sourceLeft - rawLeft) * MAGNIFIER_SIZE / cropWidth;
        var destTop = (sourceTop - rawTop) * MAGNIFIER_SIZE / cropHeight;
        var destWidth = (sourceRight - sourceLeft) * MAGNIFIER_SIZE / cropWidth;
        var destHeight = (sourceBottom - sourceTop) * MAGNIFIER_SIZE / cropHeight;

        ctx.clearRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
        if (sourceRight > sourceLeft && sourceBottom > sourceTop) {
          ctx.drawImage(imageCanvas,
            sourceLeft, sourceTop, sourceRight - sourceLeft, sourceBottom - sourceTop,
            destLeft, destTop, destWidth, destHeight);
        }
        var center = MAGNIFIER_SIZE / 2;
        ctx.beginPath();
        ctx.moveTo(center - 14, center);
        ctx.lineTo(center + 14, center);
        ctx.moveTo(center, center - 14);
        ctx.lineTo(center, center + 14);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.stroke();

        positionMagnifier(clientX, clientY);
        magnifierCanvas.classList.remove('hidden');
        // The loupe duplicates visible image content and is intentionally
        // excluded from the accessibility tree.
        magnifierCanvas.setAttribute('aria-hidden', 'true');
        return true;
      } catch (error) {
        hideMagnifier();
        return false;
      }
    }

    // ── Hit test ──────────────────────────────────────
    function findHandle(clientX, clientY) {
      if (!underpaintingPixels) return -1;
      var rect = imageCanvas.getBoundingClientRect();
      var cssX = clientX - rect.left;
      var cssY = clientY - rect.top;
      var imgW = rect.width;
      var imgH = rect.height;
      var bmpW = underpaintingPixels.width;
      var bmpH = underpaintingPixels.height;

      // Search from last to first
      for (var i = points.length - 1; i >= 0; i--) {
        var hCssX = (points[i].x + 0.5) * imgW / bmpW;
        var hCssY = (points[i].y + 0.5) * imgH / bmpH;
        if (Math.hypot(cssX - hCssX, cssY - hCssY) <= 22) {
          return i;
        }
      }
      return -1;
    }

    // ── Draw guides ────────────────────────────────────
    function drawGuides() {
      if (!underpaintingPixels) return true;
      var bmpW = underpaintingPixels.width;
      var bmpH = underpaintingPixels.height;
      var rect = imageCanvas.getBoundingClientRect();
      var dispW = rect.width;
      var dispH = rect.height;

      if (dispW <= 0 || dispH <= 0) return true;

      try {
        setCanvasBackingSize(guideCanvas, Math.round(dispW), Math.round(dispH));
        var guideW = guideCanvas.width;
        var guideH = guideCanvas.height;
        var ctx = guideCanvas.getContext('2d');
        if (!ctx) throw new Error('Guide canvas 2D context unavailable.');
        ctx.clearRect(0, 0, guideW, guideH);

        if (points.length === 0) return true;

        // Draw polygon in backing-pixel coordinates. The backing dimensions
        // may differ fractionally from the CSS rect after integer rounding.
        ctx.beginPath();
        for (var i = 0; i < points.length; i++) {
          var px = (points[i].x + 0.5) * guideW / bmpW;
          var py = (points[i].y + 0.5) * guideH / bmpH;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        // Close if 4 points
        if (points.length === 4) {
          var p0x = (points[0].x + 0.5) * guideW / bmpW;
          var p0y = (points[0].y + 0.5) * guideH / bmpH;
          ctx.lineTo(p0x, p0y);
        }
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw handles
        var colors = ['#ff4444', '#44ff44', '#4444ff', '#ffcc00'];
        for (var j = 0; j < points.length; j++) {
          var cx = (points[j].x + 0.5) * guideW / bmpW;
          var cy = (points[j].y + 0.5) * guideH / bmpH;

          // Outer circle
          ctx.beginPath();
          ctx.arc(cx, cy, 12, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fill();

          // Inner circle
          ctx.beginPath();
          ctx.arc(cx, cy, 8, 0, Math.PI * 2);
          ctx.fillStyle = colors[j % colors.length];
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Number label
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(j + 1), cx, cy);
        }
        return true;
      } catch (error) {
        // On failure: release guide backing, invalidate upper aligned backing,
        // show error, and report failure to caller.
        setCanvasBackingSize(guideCanvas, 0, 0);
        invalidateAlignedComparison();
        showRecoverableError(error.message || 'Failed to draw guides.');
        return false;
      }
    }

    // ── Align ──────────────────────────────────────────
    function alignOnce() {
      if (!referenceSize || !underpaintingPixels) return;
      var validation = validateCornerQuad(points,
        underpaintingPixels.width, underpaintingPixels.height);
      if (!validation.valid) {
        invalidateAlignedComparison();
        setState('marking');
        showValidationMessage(validation.message);
        return;
      }

      // Verify guide canvas can be drawn before proceeding with expensive warp.
      // On failure, drawGuides already zeroed guide/upper backings and showed error.
      if (!drawGuides()) return;

      setState('aligning');
      var warped = null;
      try {
        warped = warpPerspective(underpaintingPixels, points,
          referenceSize.width, referenceSize.height);
        setCanvasBackingSize(alignedCanvas,
          referenceSize.width, referenceSize.height);
        var alignedContext = alignedCanvas.getContext('2d');
        if (!alignedContext) {
          throw new Error('Aligned canvas 2D context unavailable.');
        }
        alignedContext.putImageData(warped, 0, 0);
        alignedCanvas.style.opacity = String(Number(opacityInput.value) / 100);
        comparisonPanel.classList.remove('hidden');
        setState('aligned');
        updateCssLayoutAndGuides();
      } catch (error) {
        invalidateAlignedComparison();
        showRecoverableError(error.message);
      } finally {
        warped = null;
      }
    }

    // ── Process reference ──────────────────────────────
    function processReference(imageData) {
      if (imageData === referenceIdentity) {
        updateCssLayoutAndGuides();
        return;
      }

      referenceIdentity = imageData;
      invalidateAlignedComparison();
      if (!imageData || imageData.width < 2 || imageData.height < 2) {
        referenceSize = null;
        setCanvasBackingSize(referenceCanvas, 0, 0);
        showRecoverableError('Reference image is unavailable or too small.');
        return;
      }

      var nextReferenceSize = null;
      var resizedReference = null;
      try {
        nextReferenceSize = computeWorkingSize(imageData.width, imageData.height,
          2000000, 2048);
        resizedReference = resizeImageData(imageData,
          nextReferenceSize.width, nextReferenceSize.height);
        setCanvasBackingSize(referenceCanvas,
          nextReferenceSize.width, nextReferenceSize.height);
        var referenceContext = referenceCanvas.getContext('2d');
        if (!referenceContext) throw new Error('Canvas 2D is unavailable.');
        referenceContext.putImageData(resizedReference, 0, 0);
        referenceSize = nextReferenceSize;
      } catch (error) {
        referenceSize = null;
        setCanvasBackingSize(referenceCanvas, 0, 0);
        showRecoverableError(error.message);
        return;
      } finally {
        resizedReference = null;
      }

      if (underpaintingPixels && validateCornerQuad(
          points, underpaintingPixels.width, underpaintingPixels.height).valid) {
        alignOnce();
      } else if (underpaintingPixels) {
        setState('marking');
        updateCssLayoutAndGuides();
      } else if (state !== 'loading') {
        setState('needs-upload');
      }
      updateCssLayoutAndGuides();
    }

    // ── Central drag completion ───────────────────────
    // Called by finishDrag, lostpointercapture, and cancel-on-reset/undo.
    // Guarded by dragCleanup to prevent re-entrance from lostpointercapture.
    // Preserves dragIndex/state until validation/rewarp finishes.
    function completeDrag() {
      if (dragIndex < 0) return;
      dragIndex = -1;

      setState('marking');

      if (points.length === 4) {
        var validation = validateCornerQuad(points,
          underpaintingPixels.width, underpaintingPixels.height);
        if (validation.valid) {
          alignOnce();
        } else {
          invalidateAlignedComparison();
          showValidationMessage(validation.message);
        }
      } else {
        invalidateAlignedComparison();
      }
    }

    function finishDrag(e) {
      if (dragIndex < 0 || dragCleanup) return;
      hideMagnifier();
      dragCleanup = true;

      // Release capture safely — pass the stored active pointer id
      if (hasCapture) {
        hasCapture = false;
        if (activePointerId >= 0) {
          try { interactionSurface.releasePointerCapture(activePointerId); } catch (ex) { /* ignore */ }
        }
      }
      activePointerId = -1;

      completeDrag();
      dragCleanup = false;
    }

    function cancelActiveDrag() {
      hideMagnifier();
      // Called when an action (reset, undo, new file) should cancel dragging
      if (dragIndex < 0 && !hasCapture) return;
      // Set reentrancy guard BEFORE releasing pointer capture, because
      // releasing it can synchronously fire lostpointercapture
      // which would otherwise trigger an unwanted warp via finishDrag.
      dragCleanup = true;
      if (hasCapture) {
        hasCapture = false;
        if (activePointerId >= 0) {
          try { interactionSurface.releasePointerCapture(activePointerId); } catch (ex) { /* ignore */ }
        }
      }
      activePointerId = -1;
      dragIndex = -1;
      dragCleanup = false;
      invalidateAlignedComparison();
    }

    // ── Pointer event handling ────────────────────────

    function addPoint(clientX, clientY) {
      if (!underpaintingPixels || points.length >= 4) return;
      var bmp = cssToBitmap(clientX, clientY);
      if (!bmp) return;
      points.push({ x: bmp.x, y: bmp.y });
      // If guide drawing fails, pop the pushed point and stop (no validation/warp)
      if (!drawGuides()) {
        points.pop();
        return;
      }
      // Update prompt text for the next corner
      updateCornerPrompt();
      // After points 1–3, advance the visible prompt AND the live status
      if (points.length < 4) {
        statusEl.textContent = nextCornerEl.textContent;
      }

      if (points.length === 4) {
        // Validate and warp: enter marking first, then publish validation
        // so the live region is set before the validation message.
        setState('marking');
        var validation = validateCornerQuad(points,
          underpaintingPixels.width, underpaintingPixels.height);
        if (validation.valid) {
          alignOnce();
        } else {
          showValidationMessage(validation.message);
        }
      }
    }

    function onPointerDown(e) {
      if (state !== 'marking' && state !== 'aligned' && state !== 'error') return;
      if (!underpaintingPixels) return;
      // Ignore second pointer while dragging
      if (dragIndex >= 0 && e.pointerId !== activePointerId) return;

      var clientX = e.clientX;
      var clientY = e.clientY;

      // Check for hit on existing handle
      var idx = findHandle(clientX, clientY);
      if (idx >= 0) {
        // Acquire capture first. If it fails, leave the current aligned comparison
        // untouched and do not commit drag state.
        try {
          interactionSurface.setPointerCapture(e.pointerId);
        } catch (ex) {
          return;
        }
        // Only now invalidate the aligned comparison and enter marking
        invalidateAlignedComparison();
        setState('marking');
        dragIndex = idx;
        activePointerId = e.pointerId;
        hasCapture = true;
        drawMagnifier(clientX, clientY);
        e.preventDefault();
        return;
      }

      // Only add new point while < 4
      if (points.length < 4 && (state === 'marking' || state === 'error')) {
        addPoint(clientX, clientY);
        return;
      }
    }

    function onPointerMove(e) {
      if (dragIndex < 0) return;
      // Only respond to the active pointer
      if (e.pointerId !== activePointerId) return;
      if (!underpaintingPixels) return;
      var bmp = cssToBitmap(e.clientX, e.clientY);
      if (!bmp) return;

      // Clamp to image bounds (floating-point, do not round)
      var clampedX = Math.max(0, Math.min(underpaintingPixels.width - 1, bmp.x));
      var clampedY = Math.max(0, Math.min(underpaintingPixels.height - 1, bmp.y));

      points[dragIndex].x = clampedX;
      points[dragIndex].y = clampedY;
      if (!drawGuides()) {
        // Guide drawing failed — cancel drag without validation/warp
        cancelActiveDrag();
        return;
      }
      drawMagnifier(e.clientX, e.clientY);
    }

    function onPointerUp(e) {
      // Only respond to the active pointer
      if (e.pointerId !== activePointerId) return;
      finishDrag(e);
    }

    function onPointerCancel(e) {
      // Only respond to the active pointer
      if (e.pointerId !== activePointerId) return;
      finishDrag(e);
    }

    function onLostPointerCapture(e) {
      // May fire as a result of our own releasePointerCapture; guard with dragCleanup.
      if (dragIndex >= 0 && !dragCleanup && e.pointerId === activePointerId) {
        finishDrag(e);
      }
    }

    // ── Undo/Reset ─────────────────────────────────────
    function undoPoint() {
      cancelActiveDrag();
      if (points.length === 0) return;
      points.pop();
      invalidateAlignedComparison();
      if (!drawGuides()) {
        updateCornerPrompt();
        return;
      }
      updateCornerPrompt();
      clearStatus();
      setState('marking');
    }

    function resetPoints() {
      cancelActiveDrag();
      points = [];
      // Release aligned backing BEFORE fallible guide operations
      // so that the aligned canvas is zeroed even if the guide draw throws.
      invalidateAlignedComparison();
      try {
        var guideCtx = guideCanvas.getContext('2d');
        if (!guideCtx) throw new Error('Guide canvas context unavailable.');
        guideCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
      } catch (error) {
        // Release guide backing on failure
        setCanvasBackingSize(guideCanvas, 0, 0);
        showRecoverableError(error.message);
        return;
      }
      updateCornerPrompt();
      clearStatus();
      setState('marking');
    }

    // ── Opacity ────────────────────────────────────────
    function onOpacityChange() {
      var val = Number(opacityInput.value);
      opacityLabel.textContent = val + '%';
      alignedCanvas.style.opacity = String(val / 100);
    }

    function onZoomInput() {
      applyComparisonZoom(Number(zoomInput.value), true);
    }

    function changeZoom(delta) {
      applyComparisonZoom(zoomPercent + delta, true);
    }

    function onPanPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (panPointerId >= 0) return;
      panPointerId = e.pointerId;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartScrollLeft = comparisonViewport.scrollLeft;
      panStartScrollTop = comparisonViewport.scrollTop;
      try { comparisonViewport.setPointerCapture(e.pointerId); } catch (error) {
        panPointerId = -1;
        return;
      }
      comparisonViewport.classList.add('is-panning');
      e.preventDefault();
    }

    function onPanPointerMove(e) {
      if (e.pointerId !== panPointerId) return;
      var renderedWidth = parseFloat(comparisonStage.style.width) || 0;
      var renderedHeight = parseFloat(comparisonStage.style.height) || 0;
      var maxLeft = Math.max(0, renderedWidth - comparisonViewport.clientWidth);
      var maxTop = Math.max(0, renderedHeight - comparisonViewport.clientHeight);
      comparisonViewport.scrollLeft = Math.max(0,
        Math.min(maxLeft, panStartScrollLeft - (e.clientX - panStartX)));
      comparisonViewport.scrollTop = Math.max(0,
        Math.min(maxTop, panStartScrollTop - (e.clientY - panStartY)));
      e.preventDefault();
    }

    function finishPan(e) {
      if (e.pointerId !== panPointerId) return;
      var pointerId = panPointerId;
      panPointerId = -1;
      try { comparisonViewport.releasePointerCapture(pointerId); } catch (error) { /* ignore */ }
      comparisonViewport.classList.remove('is-panning');
    }

    function onPanKeyDown(e) {
      var step = e.shiftKey ? 120 : 40;
      var dx = 0;
      var dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;

      var oldLeft = comparisonViewport.scrollLeft;
      var oldTop = comparisonViewport.scrollTop;
      comparisonViewport.scrollLeft = Math.max(0, oldLeft + dx);
      comparisonViewport.scrollTop = Math.max(0, oldTop + dy);
      if (comparisonViewport.scrollLeft !== oldLeft ||
          comparisonViewport.scrollTop !== oldTop) {
        e.preventDefault();
      }
    }

    // ── Interaction surface ────────────────────────────
    // Create an invisible overlay extending 22px beyond the image canvas
    // so boundary handles retain a full ≥44-CSS-pixel touch/pointer target.
    var interactionSurface = document.createElement('div');
    interactionSurface.style.cssText = [
      'position: absolute',
      'top: -22px',
      'left: -22px',
      'right: -22px',
      'bottom: -22px',
      'touch-action: none',
      'z-index: 1',
      'border-radius: 4px'
    ].join(';') + ';';
    stage.insertBefore(interactionSurface, stage.firstChild);

    // ── Wire up events ────────────────────────────────
    fileInput.addEventListener('change', function () {
      if (fileInput.files.length > 0) {
        loadUnderpainting(fileInput.files[0]);
      }
    });

    // Attach pointer events to the interaction surface so boundary hits work.
    // Coordinate conversion uses imageCanvas.getBoundingClientRect(),
    // which remains correct because clientX/clientY are viewport-relative.
    interactionSurface.addEventListener('pointerdown', onPointerDown);
    interactionSurface.addEventListener('pointermove', onPointerMove);
    interactionSurface.addEventListener('pointerup', onPointerUp);
    interactionSurface.addEventListener('pointercancel', onPointerCancel);
    interactionSurface.addEventListener('lostpointercapture', onLostPointerCapture);

    undoBtn.addEventListener('click', undoPoint);
    resetBtn.addEventListener('click', resetPoints);

    opacityInput.addEventListener('input', onOpacityChange);
    zoomInput.addEventListener('input', onZoomInput);
    zoomOutBtn.addEventListener('click', function () { changeZoom(-25); });
    zoomInBtn.addEventListener('click', function () { changeZoom(25); });
    zoomResetBtn.addEventListener('click', function () {
      applyComparisonZoom(100, true);
    });
    comparisonViewport.addEventListener('pointerdown', onPanPointerDown);
    comparisonViewport.addEventListener('pointermove', onPanPointerMove);
    comparisonViewport.addEventListener('pointerup', finishPan);
    comparisonViewport.addEventListener('pointercancel', finishPan);
    comparisonViewport.addEventListener('lostpointercapture', finishPan);
    comparisonViewport.addEventListener('keydown', onPanKeyDown);

    hideMagnifier();
    applyComparisonZoom(100, false);

    // ── Return process function ───────────────────────
    return processReference;
  }
});

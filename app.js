// app.js
// Painting Tools — UI wiring.
// Shared infrastructure: ImageManager, ToolShell, canvas helpers.
// Tools self-register via ToolShell.register().

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════
  //  ImageManager — loads and shares the source image
  // ═══════════════════════════════════════════════════════

  var ImageManager = {
    _imageData: null,   // ImageData at original resolution
    _listeners: [],     // callbacks called when a new image is loaded

    /**
     * Load an image file, decode it to ImageData, and notify listeners.
     * @param {File} file
     */
    load: function (file) {
      if (!file || !file.type.startsWith('image/')) return;

      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          ImageManager._imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          // Notify all listeners
          for (var i = 0; i < ImageManager._listeners.length; i++) {
            ImageManager._listeners[i](ImageManager._imageData);
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    },

    /** @returns {ImageData|null} */
    getImageData: function () {
      return ImageManager._imageData;
    },

    /**
     * Register a callback for new image loads.
     * @param {function(ImageData)} fn
     */
    onLoad: function (fn) {
      ImageManager._listeners.push(fn);
    }
  };

  // ═══════════════════════════════════════════════════════
  //  ToolShell — registry + tab switching
  // ═══════════════════════════════════════════════════════

  var ToolShell = {
    _tools: {},         // id → { id, name, icon, mount, process, unmount }
    _activeId: null,
    _tabBar: null,
    _viewsContainer: null,

    /**
     * Initialize the shell with the tab bar and views container elements.
     * Call once at startup.
     */
    init: function (tabBarEl, viewsContainerEl) {
      ToolShell._tabBar = tabBarEl;
      ToolShell._viewsContainer = viewsContainerEl;

      // Listen for new images → run active tool's process()
      ImageManager.onLoad(function (imageData) {
        // Show the UI
        document.getElementById('upload-section').classList.add('hidden');
        tabBarEl.classList.remove('hidden');
        viewsContainerEl.classList.remove('hidden');

        if (ToolShell._activeId && ToolShell._tools[ToolShell._activeId]) {
          ToolShell._tools[ToolShell._activeId].process(imageData);
        }
      });

      // Re-process on window resize (canvas rescaling)
      var resizeTimeout;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function () {
          if (ToolShell._activeId && ToolShell._tools[ToolShell._activeId]) {
            var idata = ImageManager.getImageData();
            if (idata) {
              ToolShell._tools[ToolShell._activeId].process(idata);
            }
          }
        }, 150);
      });
    },

    /**
     * Register a tool. Creates a tab button.
     * @param {{ id: string, name: string, icon?: string,
     *           mount: function(HTMLElement),
     *           process: function(ImageData),
     *           unmount?: function() }} config
     */
    register: function (config) {
      ToolShell._tools[config.id] = config;

      // Create tab button
      var btn = document.createElement('button');
      btn.className = 'tab-btn';
      btn.textContent = (config.icon ? config.icon + ' ' : '') + config.name;
      btn.addEventListener('click', function () {
        ToolShell.activate(config.id);
      });
      btn.dataset.toolId = config.id;
      ToolShell._tabBar.appendChild(btn);
    },

    /**
     * Switch to the given tool. Mounts it on first activation.
     * @param {string} id
     */
    activate: function (id) {
      var prev = ToolShell._tools[ToolShell._activeId];
      var next = ToolShell._tools[id];
      if (!next || id === ToolShell._activeId) return;

      // Deactivate previous
      if (prev) {
        if (prev.unmount) prev.unmount();
      }

      // Update tab button styles
      var buttons = ToolShell._tabBar.querySelectorAll('.tab-btn');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove('active');
      }
      var activeBtn = ToolShell._tabBar.querySelector('[data-tool-id="' + id + '"]');
      if (activeBtn) activeBtn.classList.add('active');

      // Hide all views
      var views = ToolShell._viewsContainer.querySelectorAll('.tool-view');
      for (var j = 0; j < views.length; j++) {
        views[j].classList.add('hidden');
      }

      // Show target view
      var viewEl = document.getElementById('tool-' + id);
      if (viewEl) viewEl.classList.remove('hidden');

      // Mount (first time only)
      if (!next._mounted) {
        next._mounted = true;
        next.mount(viewEl);
      }

      ToolShell._activeId = id;

      // If image already loaded, process for this tool
      var imageData = ImageManager.getImageData();
      if (imageData) {
        next.process(imageData);
      }
    }
  };

  // ═══════════════════════════════════════════════════════
  //  Canvas helpers (used by tools)
  // ═══════════════════════════════════════════════════════

  /**
   * Draw ImageData to a canvas, scaling to fit its container.
   * @param {ImageData} imageData
   * @param {HTMLCanvasElement} canvas
   */
  function drawImageDataToCanvas(imageData, canvas) {
    canvas.width = imageData.width;
    canvas.height = imageData.height;

    var maxW = Math.min(canvas.parentElement.clientWidth - 16, 540);
    var scale = Math.min(1, maxW / imageData.width);
    canvas.style.width = Math.round(imageData.width * scale) + 'px';
    canvas.style.height = Math.round(imageData.height * scale) + 'px';

    var ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Export ImageData to a PNG download.
   * @param {ImageData} imageData
   * @param {string} filename
   */
  function downloadImageData(imageData, filename) {
    var canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    var ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    canvas.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  // Expose shell objects globally (used by tool modules)
  window.ImageManager = ImageManager;
  window.ToolShell = ToolShell;
  window.drawImageDataToCanvas = drawImageDataToCanvas;
  window.downloadImageData = downloadImageData;

  // ═══════════════════════════════════════════════════════
  //  Initialize shell
  // ═══════════════════════════════════════════════════════

  var tabBar = document.getElementById('tab-bar');
  var viewsContainer = document.getElementById('tool-views');
  ToolShell.init(tabBar, viewsContainer);

  // ═══════════════════════════════════════════════════════
  //  File input — triggers ImageManager
  // ═══════════════════════════════════════════════════════

  var fileInput = document.getElementById('file-input');
  var dropZone = document.getElementById('drop-zone');

  fileInput.addEventListener('change', function () {
    if (fileInput.files.length > 0) {
      ImageManager.load(fileInput.files[0]);
      // Activate first tool after image load
      ToolShell.activate('posterize');
    }
  });

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
      ImageManager.load(e.dataTransfer.files[0]);
      ToolShell.activate('posterize');
    }
  });


})();

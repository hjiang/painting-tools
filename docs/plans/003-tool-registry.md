# Plan 003: Tool Registry & Modular Architecture

## Goal

Refactor the app from a monolithic single-page app into a **tab-based tool system**
where each image-processing tool self-registers with a shared shell. Adding a new
tool should require only a new JS file and one `<script>` tag — zero changes to
`app.js`, `index.html`, or `style.css`.

## Motivation

Current state: all tool UI is hardcoded in `index.html`, all wiring is in one
`app.js` IIFE. Adding a third tool means touching 3+ files. The painter wants to
add more tools over time (layer isolation, grid overlay, color picker, etc.).

## Architecture

```
index.html          → Minimal shell: tab bar + content area + file input
app.js              → Shared infrastructure:
                       - ImageManager (load once, share across tools)
                       - ToolShell (registry, tab switching)
posterize.js        → Pure function (unchanged)
edgeDetect.js       → Pure function (unchanged)
histogram.js        → Pure function (unchanged)
posterizeTool.js    → NEW: Tool wiring — registers with ToolShell
sketchTool.js       → NEW: Tool wiring for edge detection
style.css           → Shared styles + minor additions for tab bar
```

### Tool Contract

Each tool module exports a config object:

```js
ToolShell.register({
  id: 'posterize',            // unique string ID
  name: 'Value Posterizer',   // display name in tab
  icon: '🎨',                 // emoji icon for tab (optional)
  
  // Build this tool's UI inside the given container element.
  // Called once when the tool is first activated.
  mount(container) { /* create canvases, sliders, buttons */ },
  
  // Called when a new image is loaded (or re-selected).
  // Run the tool's algorithm and update its canvases.
  process(imageData) { /* compute, render */ },
  
  // Called when switching away from this tool.
  // Optional — cleanup if needed.
  unmount() { }
});
```

### Data Flow

```
File Input
  → ImageManager.load(file)
    → ImageManager stores imageData
    → Notifies ToolShell
      → ToolShell calls activeTool.process(imageData)
      → Tool also calls newTool.mount() if switching tabs

Slider / controls changed (within a tool)
  → Tool directly re-runs its algorithm
  → No shell involvement needed
```

## Implementation Phases

### Phase 1: ImageManager
Extract image loading into a shared `ImageManager` object inside `app.js`.
- `load(file)` — reads file, decodes to ImageData, notifies listeners
- `getImageData()` — returns current ImageData (or null)
- `onLoad(callback)` — register a listener for new images
- Existing render pipeline stays wired, now consumes from ImageManager

### Phase 2: ToolShell Registry
Add `ToolShell` to `app.js`:
- `register(config)` — stores tool config, creates tab button
- `activate(id)` — switches to tool, calls mount/process as needed
- `getImageData()` — proxy to ImageManager
- Tab bar dynamically populated from registered tools

### Phase 3–4: Migrate Existing Tools ✅ DONE
- Extract posterization wiring into `posterizeTool.js`
- Extract sketch wiring into `sketchTool.js`
- App.js now only contains infrastructure (ImageManager, ToolShell, helpers)

### Phase 5: Future Tools
New tools follow the pattern — no shell changes needed.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `app.js` | MODIFY | Add ImageManager + ToolShell, expose helpers globally |
| `style.css` | MODIFY | Add tab bar styles, remove sketch toggle styles |
| `index.html` | MODIFY | Add tab bar + tool view containers, load new tool scripts |
| `posterizeTool.js` | NEW | Posterization tool module (ToolShell.register) |
| `sketchTool.js` | NEW | Sketch tool module (ToolShell.register) |
| `docs/ARCHITECTURE.md` | MODIFY | Document new modular architecture |
| `docs/plans/003-tool-registry.md` | NEW | This plan |

## Testing

- Manual: load a photo, verify posterization + sketch both work
- Manual: verify slider/mode changes re-render correctly
- Existing unit tests continue to pass (no changes to pure functions)

## Acceptance Criteria

- [x] ImageManager loads and shares image across the app
- [x] ToolShell registry works — tools can register, activate
- [x] Existing posterization, sketch, and histogram functionality unchanged
- [x] Tab bar renders with registered tools
- [x] Adding a new tool requires only: tool JS file + `<script>` tag + view `<div>`
- [x] All 193 unit tests pass

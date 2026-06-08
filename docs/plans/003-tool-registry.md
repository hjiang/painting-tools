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

### Phase 3–4: Migrate Existing Tools (later)
- Extract posterization wiring into `posterizeTool.js`
- Extract sketch wiring into `sketchTool.js`
- Remove hardcoded tool UI from `index.html` (replace with tab bar + container)

### Phase 5: Future Tools (later)
New tools follow the pattern — no shell changes needed.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `app.js` | MODIFY | Add ImageManager + ToolShell, keep existing wiring |
| `style.css` | MODIFY | Add tab bar styles |
| `index.html` | MODIFY | Add tab bar container, content container |
| `docs/ARCHITECTURE.md` | MODIFY | Document new modular architecture |

## Testing

- Manual: load a photo, verify posterization + sketch both work
- Manual: verify slider/mode changes re-render correctly
- Existing unit tests continue to pass (no changes to pure functions)

## Acceptance Criteria

- [ ] ImageManager loads and shares image across the app
- [ ] ToolShell registry works — tools can register, activate
- [ ] Existing posterization, sketch, and histogram functionality unchanged
- [ ] Tab bar renders with registered tools
- [ ] Adding a new tool requires only: tool JS file + `<script>` tag

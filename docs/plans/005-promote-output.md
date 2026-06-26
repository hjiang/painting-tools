# Plan 005: Promote Tool Output to New Reference Image

## Problem
Each tool processes the original uploaded image independently. Users can't chain
operations — e.g., lighten → posterize, or posterize → grid.

## Design

### ImageManager additions (`app.js`)
- `_originalImageData` — preserved copy of the initially uploaded image
- `setImageData(imageData, label)` — replaces source, notifies listeners
- `reset()` — restores original, notifies listeners
- `isModified()` — has the source been replaced?
- `getModifiedLabel()` — description of what was applied (e.g. "Posterized (5 values)")

### Tool convention
Each tool that produces a processed image sets `this.getResultImageData` on its
registered config object, returning the current processed output as `ImageData`.

### UI
- **Shared banner** between tab bar and tool views: "Source: Posterized (5 values)" with a "Reset" button. Appears when `isModified()`.
- **Per-tool "Use as Reference" button** in each tool's download section. Calls `ImageManager.setImageData(result, label)`.

### Tools affected
- `posterizeTool.js` — expose `_lastResult.imageData`, add promote button
- `lightenTool.js` — expose `_lastResult.imageData`, add promote button
- `sketchTool.js` — expose `_sketchImageData`, add promote button
- `gridTool.js` — expose `_offscreenCanvas` as ImageData, add promote button
- `colorTool.js` — no changes (doesn't produce image output)

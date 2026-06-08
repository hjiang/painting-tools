# Plan 004: Grid Overlay Tool

## Motivation

Painters often draw a grid on their reference photo and a matching grid on
their canvas or paper. This breaks the image into manageable squares — the
painter draws each square's contents one at a time, resulting in a more
accurate initial sketch.

## Decisions

1. **Canvas 2D compositing, not pixel manipulation.** The grid is drawn with
   `moveTo`/`lineTo`/`stroke` on top of the source image. This is simpler,
   faster, and cleaner than modifying ImageData pixel by pixel.

2. **Square cells auto-compute companion dimension.** When square cells is
   enabled, adjusting rows auto-computes columns (and vice versa) to match
   the image aspect ratio. The auto-computed slider shows "(auto)" and the
   user can override by touching it.

3. **Margins are dimmed.** In square-cells mode, the region outside the grid
   is covered with a semi-transparent dark overlay so the painter can clearly
   see what's inside vs. outside the transferable grid.

4. **Labels use letter/number scheme.** Columns are numbered 1–N, rows are
   lettered A–M. Labels have a semi-transparent background pill for
   readability against any photo.

## Files

| File | Type | Purpose |
|------|------|---------|
| `gridOverlay.js` | New (pure function) | `computeGridLayout()` + `drawGrid()` |
| `gridTool.js` | New (tool module) | UI wiring, ToolShell registration |
| `index.html` | Edit | Grid tool view DOM + `<script>` tags |
| `style.css` | Edit | `.grid-canvas-box` CSS rule |
| `tests/gridOverlay.test.js` | New (unit tests) | 50 tests for `computeGridLayout` |
| `docs/REQUIREMENTS.md` | Edit | Added F6: Grid Overlay |
| `docs/ARCHITECTURE.md` | Edit | Added grid tool to all sections |
| `AGENTS.md` | Edit | Updated file structure + design decisions |

## Zero changes to app.js

The tool registry pattern means the grid tool is fully self-contained —
`app.js`, `posterizeTool.js`, and `sketchTool.js` are untouched.

## Testing

50 unit tests cover:
- Normal mode: landing, square, tall, wide images
- Square-cells mode: natural fit, height-constrained, width-constrained,
  square images, tall images, wide images
- Offset and cell dimension verification

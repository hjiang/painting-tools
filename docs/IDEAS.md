# Enhancement Ideas Backlog

Captured 2026-07-20. Ordered within each category by expected value/effort ratio.
Ideas with a plan document link to it; the rest are unscheduled.

**Top 4 (planned):** #6 (plan 012) · #8 (plan 013) · #7 (plan 014) · #14 (plan 015).

## Quick Wins

1. **Flip / mirror view** — horizontal-flip toggle on the reference so painters
   can spot drawing errors the way they do by flipping a physical canvas.
   → `docs/plans/011-flip-squint-view-tool.md` ✅
2. **Squint mode (Gaussian-style blur)** — slider that blurs the reference to
   simulate squinting; the standard way to judge value masses.
   → `docs/plans/011-flip-squint-view-tool.md` ✅
3. **Value-only grayscale view** — one-click desaturate to judge values
   independent of hue. Ships in the same View tool as #1/#2.
   → `docs/plans/011-flip-squint-view-tool.md` ✅
4. **Paste / drag-and-drop image loading** — accept clipboard paste and
   file drops anywhere on the page, not just the file picker.
5. **Keyboard shortcuts** — number keys switch tools, `B` toggles
   before/after where supported.

## Enhancements to Existing Tools

6. **Value band isolation (F8 stretch goal)** — click a histogram bin in
   Posterize to show only the pixels in that band (black on white for
   tracing). Completes the posterize/histogram story.
   → `docs/plans/012-value-isolation.md`
7. **Simplify-before-posterize** — optional smoothing pass before
   posterization so noisy photos produce clean, paintable value masses
   instead of speckled bands.
   → `docs/plans/014-simplify-before-posterize.md`
8. **Crop & canvas aspect ratios** — crop the reference to standard canvas
   proportions (8×10, 11×14, golden ratio, …) with a rule-of-thirds overlay;
   promote the crop as the new reference for all other tools.
   → `docs/plans/013-crop-to-canvas-aspect.md`
9. **Grid: print grid-only sheet** — export a labeled blank grid sized for
   the physical canvas so it can be transferred to the real surface.
10. **Sketch: line weight + tracing-print mode** — adjustable line thickness
    and pure black-on-white output optimized for printing/tracing.
11. **Lighten → Tone tool** — generalize "blend toward white" to blend toward
    any paper tone (mid-gray, ochre), simulating a toned ground.
12. **Color mixer: saved recipes & more brands** — persist matched recipes
    with names, export as text/JSON; support additional paint brands via a
    small pigment JSON format (the KM engine already handles custom palettes).
13. **Underpainting: undo/redo + session persistence** — marks live only in
    memory; persist to IndexedDB and add undo/redo so refreshes are safe.

## Bigger Features

14. **Palette extraction → paint recipe list** — median-cut the reference
    into N dominant colors, run each through `matchColor`, and produce a
    "paint shopping list" (recipes + coverage score). Connects the color
    mixer to the actual reference image.
    → `docs/plans/015-palette-extraction-paint-recipes.md`
15. **Gamut map** — given the paints the user owns, highlight regions of the
    reference that are out of gamut (reuses ΔE scoring) so compromises are
    known upfront.
16. **Reference sheet export** — one printable page combining color
    reference, posterized value map, sketch, and grid.
17. **Progress check mode** — photograph the in-progress painting, sample
    corresponding points on both images, compare values (a simpler sibling
    of the underpainting tool).

## Infrastructure / UX

18. **PWA (manifest + service worker)** — the app already works offline;
    making it installable matters for tablets in the studio.
19. **Web Workers for heavy ops** — Canny, homography warp, and full-res
    posterize can jank the UI on large photos; move them off the main thread
    (still zero-dependency).
20. **Session persistence (IndexedDB)** — remember the last image and tool
    settings across visits.
21. **Pinch-zoom on mobile** for all tool canvases, not just underpainting.

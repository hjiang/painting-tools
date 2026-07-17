# Plan 009: Underpainting Accuracy Overlay

## Goal

Add an offline, mobile-friendly tool that lets a painter photograph an
underpainting, mark the four corners of its canvas, rectify the photographed
canvas to the current reference image, and adjust the underpainting's opacity
to inspect drawing and edge alignment visually.

## Instructions for the Implementing Agent

Work serially; do not attempt the entire feature in one pass:

1. Read **Approved Scope**, **Function Contracts**, and the **Normative
   Implementation Appendix** before writing tests.
2. Complete Milestone 1 using strict red/green TDD. Do not create UI code until
   the Milestone 1 stop gate passes.
3. Complete Milestone 2 using the exact DOM IDs, state table, and pseudocode.
   Do not improvise alternate states or coordinate conventions.
4. Exercise the Milestone 2 browser stop gate before styling/documentation.
5. Complete Milestone 3 and its validation gate.
6. If the plan and a test disagree, stop and ask; do not weaken tests, change
   constants, add dependencies, or substitute affine stretching.

The word **must** and all code/constants in normative sections are binding.
Explanatory prose elsewhere provides context but does not override them.

## Approved Scope

1. The image already managed by `ImageManager` is the reference.
2. The tool owns a second, in-memory underpainting upload. `ImageManager` will
   remain a single-reference manager.
3. The entire reference image is assumed to match the entire physical canvas,
   including crop and aspect ratio.
4. The user marks corners in semantic order:
   **top-left → top-right → bottom-right → bottom-left**.
5. Markers remain draggable so the user can refine the alignment. Because the
   points identify semantic canvas corners rather than screen positions, rotated
   and upside-down photographs are supported without automatic point sorting.
6. Rectification uses a four-point projective homography, not an affine stretch.
7. The result is a visual overlay only. The reference is the bottom layer, the
   rectified underpainting is the top layer, and a 0–100% opacity slider defaults
   to 50%.
8. Preserve the underpainting photograph's decoded color, brightness, and
   contrast. Do not normalize lighting or color.
9. Process at a capped working resolution for mobile performance. Do not create
   a full-resolution aligned result.
10. The MVP has no score, edge/difference mode, blink/wipe view, download, or
    “Use as New Reference” action.

## User Flow

1. Upload a reference through the app's existing upload screen.
2. Open the **Underpainting Check** tab.
3. Upload or photograph the underpainting using the tool-local file input.
4. Follow the guided prompts to mark TL, TR, BR, and BL. The tool displays
   numbered handles and connects them with a polygon.
5. Use **Undo Last** or **Reset Corners** if necessary. Drag any completed handle
   to refine its position.
6. After the fourth valid point, the tool rectifies the marked quadrilateral and
   displays the comparison automatically.
7. Move the opacity slider: 0% shows only the reference, 100% only the aligned
   underpainting, and intermediate values show both.
8. Drag any handle to refine the corners; recompute after pointer release rather
   than during every pointer move.

The UI must state that the reference must represent the whole canvas and that
corner-placement errors can look like painting errors.

## Architecture

### Modules

- `underpaintingAlignment.js`: pure geometry, validation, working-size math,
  low-peak reference resizing, homography solving, coordinate mapping, and
  bilinear perspective warping.
- `underpaintingAccuracyTool.js`: tool registration, second-image decoding,
  interaction state, pointer handling, and layered canvas rendering.
- `index.html`: static tool view and script tags, following the repository's
  actual tool convention.
- `style.css`: scoped responsive/touch styles for marking and comparison stages.

### Data Flow

```text
ImageManager current ImageData ── resize to working reference ─┐
                                                               ├─ layered comparison
underpainting file ── decode/downscale ── mark four corners ──┤
                                         │                     │
                                         └─ homography + warp ─┘
```

The tool keeps the capped underpainting and corner coordinates in capped-image
pixel space inside its mounted closure. State survives tab switches but not a
page reload. Uploading a replacement underpainting clears its points and
alignment.

Cache the last reference `ImageData` object identity. Calls to `process()` with
the same object (including tab activation and window resize) update only CSS
layout and guides; they must not resize or warp again. A genuinely new reference
immediately hides and marks the old comparison stale, rebuilds the capped
reference, and recomputes once if the four underpainting corners remain valid.
The corners remain valid because they describe the underpainting, not the
reference.

### Working Resolution

Use an initial cap calculated as:

```text
scale = min(1, 2048 / max(width, height), sqrt(2_000_000 / (width * height)))
```

Round output dimensions to integers of at least two pixels while retaining the
source aspect ratio as closely as possible. Reject source images narrower or
shorter than two pixels. The warped output dimensions are the capped reference
dimensions. Retain no full-resolution underpainting `ImageData` after
downscaling. Treat these limits as measurable defaults: change them only with
benchmark evidence and update tests and documentation together.

The tool's full-resolution reference is owned by `ImageManager` and is not
copied. Resize it directly from the existing source buffer into one capped
buffer, draw that buffer to the lower comparison canvas, then release it. At a
two-megapixel cap, each full working RGBA buffer is about 8 MB. During alignment,
the tool may have at most five such buffers/backings: capped underpainting,
marking canvas, lower comparison canvas, temporary warped output, and upper
comparison canvas (about 40 MB total beyond the shared reference). Release the
temporary warp after drawing it and replace rather than accumulate canvases.
A replacement or decode failure clears obsolete underpainting, marking, guide,
and upper-aligned storage but preserves the still-current lower reference
canvas. An alignment error releases only temporary output and keeps the capped
underpainting and handles so the user can correct them.

### Homography and Rasterization

All geometry uses pixel-center coordinates. Underpainting points are stored in
`[0, sourceWidth-1] × [0, sourceHeight-1]`. Map destination rectangle corners
`(0,0)`, `(W-1,0)`, `(W-1,H-1)`, and `(0,H-1)` to the four marked source points.
The matrix direction is always **destination/reference → source/underpainting**.
Do not invert it again inside the raster loop.

Normalize both point sets, solve the eight homography coefficients with Gaussian
elimination and partial pivoting, and denormalize the result. For every
destination pixel, map back into the underpainting and sample RGBA bilinearly.
This inverse mapping avoids holes produced by forward projection.

Canvas 2D does not provide a projective transform primitive, so the exact warp
is computed into `ImageData`. Opacity adjustments only change the top layer's
CSS opacity and must never rerun the warp.

## Function Contracts

### `computeWorkingSize(width, height, maxPixels, maxEdge)`

- **Preconditions:** dimensions are finite integers of at least two pixels;
  limits are finite and positive.
- **Postconditions:** returns integer dimensions of at least two pixels and no
  larger than the source; both limits are satisfied; aspect-ratio error is at
  most that caused by integer rounding.
- **Failure:** throw `TypeError` for non-numeric/non-finite values and
  `RangeError` for non-integers, dimensions below two, `maxPixels < 4`, or
  `maxEdge < 2`.

### `resizeImageData(source, outputWidth, outputHeight)`

- **Preconditions:** source width/height are at least two and `source.data` is a
  `Uint8ClampedArray` of exactly `width * height * 4` bytes; target dimensions
  are integers of at least two pixels and do not exceed the working caps.
- **Postconditions:** returns a newly allocated, bilinearly resampled RGBA
  `ImageData`; does not mutate the source and allocates no source-sized
  intermediate buffer.
- This is the low-peak path for the full-resolution reference already held by
  `ImageManager`. The underpainting decoder draws directly to a capped canvas
  and never first extracts full-resolution pixels.
- **Failure:** throw `TypeError` for malformed source data and `RangeError` for
  invalid/unsafe output dimensions before allocating.

### `validateCornerQuad(points, width, height)`

- Ordinary incomplete or invalid user input returns a structured result rather
  than throwing: `{ valid, code, message }`.
- A valid quadrilateral has exactly four finite pixel-center points in
  `[0,width-1] × [0,height-1]`, in the stated semantic order.
- Use these constants:
  - `MIN_POINT_DISTANCE_RATIO = 0.005` of the image diagonal;
  - `MIN_QUAD_AREA_RATIO = 0.005` of `(width-1) * (height-1)`;
  - `TURN_EPSILON_RATIO = 1e-8` times the squared image diagonal.
- Reject duplicate/near-duplicate points, crossing sides, an adjacent triple
  whose absolute cross product is at most the turn epsilon, inconsistent turn
  signs, or a quadrilateral below the area threshold. Accept either consistent
  winding sign.
- Run checks in this exact order so error codes are deterministic:
  `incomplete`, `non-finite`, `out-of-bounds`, `too-close`,
  `self-intersecting`, `collinear`, `non-convex`, `too-small`, then `valid`.
- Invalid points are ordinary user input and return a code. Invalid image
  dimensions are programmer errors and throw `TypeError`/`RangeError`.

### `solveHomography(destinationPoints, sourcePoints)`

- **Preconditions:** both arrays contain four validated point correspondences.
- **Postconditions:** returns a row-major finite 3×3 destination-to-source
  matrix; every destination corner maps to its paired source corner within
  `1e-6 * max(1, sourceDiagonal)` pixels, where `sourceDiagonal` is the
  diagonal of the source points' axis-aligned bounding box.
- Normalize both point sets before solving. Use partial pivoting with
  `LINEAR_SOLVE_EPSILON = 1e-12` and reject when either a normalized pivot is at
  or below that epsilon or `minAbsPivot / maxAbsPivot <= 1e-12`.
- **Failure:** throw `TypeError` for malformed arrays/points and `RangeError` for
  degenerate, singular, ill-conditioned, or excessive-residual input; never
  return a partial or non-finite matrix.

### `mapHomographyPoint(matrix, x, y)`

- Uses row-major coefficients as specified in the normative pseudocode below.
- Throw `TypeError` unless the matrix has exactly nine finite numbers and `x/y`
  are finite numbers.
- Returns a finite mapped point.
- Returns `null` when the denominator or its scale is non-finite, the scale is
  zero, or `abs(denominator) <= 1e-12 * denominatorScale`. This relative check
  makes mapping invariant when every matrix coefficient is multiplied by the
  same non-zero scalar.

### `warpPerspective(source, sourceCorners, outputWidth, outputHeight)`

- **Preconditions:** valid `ImageData`, validated source corners, and capped
  integer output dimensions of at least two pixels.
- **Postconditions:** returns newly allocated `ImageData` with the requested
  dimensions and orientation; the input is unchanged.
- Use `BOUNDARY_EPSILON = 1e-7`. A mapped coordinate outside
  `[-epsilon,width-1+epsilon] × [-epsilon,height-1+epsilon]` is transparent.
  Otherwise clamp it to the exact source bounds before sampling.
- Interpolate premultiplied RGB and alpha, then unpremultiply. This avoids color
  fringes next to transparent pixels. If interpolated alpha is zero, output
  `[0,0,0,0]`.
- Validate geometry and dimensions before allocating the output.
- **Failure:** throw `TypeError` for malformed source/corners and `RangeError`
  for invalid dimensions, invalid geometry, a failed homography, or unsafe
  allocation size.

Declare the six functions at script top level for browser use and export exactly
these names for Node tests:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeWorkingSize: computeWorkingSize,
    resizeImageData: resizeImageData,
    validateCornerQuad: validateCornerQuad,
    solveHomography: solveHomography,
    mapHomographyPoint: mapHomographyPoint,
    warpPerspective: warpPerspective
  };
}
```

## Normative Implementation Appendix

This appendix removes algorithmic choices from the implementation task. Follow
it unless a failing test demonstrates an error in the plan; do not substitute a
different matrix direction, coordinate convention, solver, or sampler without
human approval.

### Matrix Layout and Point Mapping

Store a homography as this row-major array:

```text
H = [h00, h01, h02,
     h10, h11, h12,
     h20, h21, h22]
```

Map `(x,y)` exactly as follows:

```js
function mapHomographyPoint(H, x, y) {
  if (!H || H.length !== 9 || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError('Invalid homography or point.');
  }
  for (var i = 0; i < 9; i++) {
    if (!Number.isFinite(H[i])) throw new TypeError('Invalid homography.');
  }
  var denominator = H[6] * x + H[7] * y + H[8];
  var denominatorScale = Math.abs(H[6] * x) +
    Math.abs(H[7] * y) + Math.abs(H[8]);
  if (!Number.isFinite(denominator) ||
      !Number.isFinite(denominatorScale) || denominatorScale === 0 ||
      Math.abs(denominator) <= 1e-12 * denominatorScale) {
    return null;
  }
  var mappedX = (H[0] * x + H[1] * y + H[2]) / denominator;
  var mappedY = (H[3] * x + H[4] * y + H[5]) / denominator;
  return Number.isFinite(mappedX) && Number.isFinite(mappedY)
    ? { x: mappedX, y: mappedY }
    : null;
}
```

### Point Normalization and Denormalization

For each four-point set independently:

```text
centroidX = average(point.x)
centroidY = average(point.y)
meanDistance = average(hypot(point.x-centroidX, point.y-centroidY))
scale = sqrt(2) / meanDistance

T = [scale, 0,     -scale*centroidX,
     0,     scale, -scale*centroidY,
     0,     0,      1]
```

Reject `meanDistance <= 1e-12`. Transform each point with `T`. Keep both `T`
and its exact inverse:

```text
inverseT = [1/scale, 0,         centroidX,
            0,       1/scale,   centroidY,
            0,       0,         1]
```

Let `Td` normalize destination points and `Ts` normalize source points. Solve
`Hn` from normalized destination to normalized source, then denormalize with
ordinary 3×3 multiplication in this order:

```text
H = inverse(Ts) * Hn * Td
```

Divide every coefficient by the largest absolute coefficient. Reject a zero or
non-finite maximum. If `H[8] < 0`, negate every coefficient so equivalent
matrices have a consistent sign.

### Exact 8×8 Linear System

For every normalized correspondence `(x,y) → (u,v)`, append these two rows to an
8×8 matrix `A` and right-hand vector `b`:

```text
[x, y, 1, 0, 0, 0, -u*x, -u*y]   b = u
[0, 0, 0, x, y, 1, -v*x, -v*y]   b = v
```

Solve `A*q=b` with Gaussian elimination and partial pivoting. At column `k`,
choose the remaining row with largest `abs(A[row][k])`, swap it into row `k`,
and record that absolute pivot. Reject a pivot at or below `1e-12`. Eliminate
rows below it, then back-substitute. Reject non-finite intermediate or result
values and reject `minAbsPivot / maxAbsPivot <= 1e-12`.

Construct:

```text
Hn = [q0, q1, q2,
      q3, q4, q5,
      q6, q7, 1]
```

After denormalization, map all four original destination points through `H` and
reject if any point is `null` or differs from its paired source point by more
than `1e-6 * max(1, sourceDiagonal)`.

### Quadrilateral Validation Pseudocode

```text
validate length, numbers, and bounds
minimumDistance = 0.005 * hypot(width-1, height-1)
reject if any pair is closer than minimumDistance
turnEpsilon = 1e-8 * (hypot(width-1, height-1) ^ 2)
reject if segment(p0,p1) intersects segment(p2,p3)
reject if segment(p1,p2) intersects segment(p3,p0)
turn[i] = cross(p[i+1]-p[i], p[i+2]-p[i+1]) with indices modulo 4
reject collinear if any abs(turn[i]) <= turnEpsilon
reject non-convex unless all four turns have the same sign
area = abs(shoelace(points)) / 2
reject if area < 0.005 * (width-1) * (height-1)
return valid
```

Segment intersection must treat touching non-adjacent segments as intersecting,
using the same `turnEpsilon`. Point-pair distance is checked first, so shared or
nearly shared endpoints report `too-close` rather than `self-intersecting`.

### Bilinear Sampling Pseudocode

Use one helper for resize and warp. The helper receives already-clamped source
coordinates:

```text
x0 = floor(sx); x1 = min(x0 + 1, sourceWidth - 1); tx = sx - x0
y0 = floor(sy); y1 = min(y0 + 1, sourceHeight - 1); ty = sy - y0
weights = [(1-tx)*(1-ty), tx*(1-ty), (1-tx)*ty, tx*ty]

For each neighbor:
  alpha = A / 255
  accumulatedAlpha += weight * alpha
  accumulatedPremultipliedR += weight * R * alpha
  accumulatedPremultipliedG += weight * G * alpha
  accumulatedPremultipliedB += weight * B * alpha

if accumulatedAlpha <= 1e-12: output [0,0,0,0]
else:
  R = round(accumulatedPremultipliedR / accumulatedAlpha)
  G = round(accumulatedPremultipliedG / accumulatedAlpha)
  B = round(accumulatedPremultipliedB / accumulatedAlpha)
  A = round(255 * accumulatedAlpha)
  clamp every output channel to [0,255]
```

For `resizeImageData`, use the same align-corners pixel-center convention as the
homography:

```text
sx = x * (sourceWidth - 1) / (outputWidth - 1)
sy = y * (sourceHeight - 1) / (outputHeight - 1)
```

All dimensions are at least two, so the denominators cannot be zero. This makes
a resized reference and a full-quad warp sample the same geometric locations
when their source content is equivalent but their raster dimensions differ.
Clamp resize coordinates to source bounds before sampling. For
`warpPerspective`, map integer destination pixel centers `(x,y)` through the
homography. Apply the warp boundary epsilon rule from the function contract;
only then clamp and sample.

### Working-Size Pseudocode

Require `width >= 2`, `height >= 2`, `maxPixels >= 4`, and `maxEdge >= 2`.

```text
scale = min(1, maxEdge/max(width,height), sqrt(maxPixels/(width*height)))
outWidth = max(2, floor(width*scale))
outHeight = max(2, floor(height*scale))
if outWidth*outHeight > maxPixels:
  correction = sqrt(maxPixels/(outWidth*outHeight))
  outWidth = max(2, floor(outWidth*correction))
  outHeight = max(2, floor(outHeight*correction))
while outWidth*outHeight > maxPixels:
  decrement the dimension above 2 whose ratio to its source dimension is larger
reject if neither dimension can be decremented
```

Return `scale = min(outWidth/width, outHeight/height)` for reporting; callers
must use the returned width and height rather than recomputing them from scale.

## UI and State Contracts

Register the module with this outer shape. Bind all DOM references once inside
`mount`, attach listeners once, and return `processReference` so `ToolShell`
uses the reference-identity cache on image loads, tab activation, and resize.

```js
ToolShell.register({
  id: 'underpainting-accuracy',
  name: 'Underpainting Check',
  icon: '\uD83D\uDD0D', // 🔍
  mount: function (container) {
    // Bind the required IDs from container, initialize state/listeners,
    // define the closure functions from this plan, then:
    return processReference;
  }
});
```

Load order in `index.html` is mandatory:

```text
... existing pure modules ...
underpaintingAlignment.js
settings.js
app.js
... existing tool modules ...
underpaintingAccuracyTool.js
```

- Explicit states: `needs-upload`, `loading`, `marking`, `aligning`, `aligned`,
  and recoverable `error`.
- Report state and errors through visible text and an `aria-live` region.
- Guard asynchronous loading with a generation token so an older decode cannot
  overwrite a newer selection.
- Reject non-image files and handle read/decode, zero-dimension, missing-context,
  and allocation failures without breaking the tab.
- Convert pointer coordinates using the current `getBoundingClientRect()` and
  canvas backing dimensions; do not rely on a cached CSS scale. Convert to
  pixel-center coordinates and clamp to `[0,width-1] × [0,height-1]`.
- Use pointer capture while dragging and a minimum 44-CSS-pixel handle target.
- Clamp dragged points to the image bounds.
- Redraw guides during drag but perform the expensive warp only after the fourth
  point or a valid drag completes.
- If edited points become invalid, hide the comparison and mark it stale until a
  valid edit triggers recomputation; never leave an obsolete result visible as
  though it matches the current handles.
- Both comparison canvases have identical backing and CSS dimensions. After
  their pixels are drawn, release temporary capped-reference and warped
  `ImageData` buffers; the canvas backings become the retained display copies.

### Required DOM Structure and IDs

Use these IDs exactly so the tool module and manual checks share one contract:

| ID | Element and responsibility |
|----|----------------------------|
| `tool-underpainting-accuracy` | Root `.tool-view` matching the registered tool ID |
| `underpainting-file` | Tool-local file input; `accept="image/jpeg,image/png,image/webp"`; do not force `capture` |
| `underpainting-status` | Visible `role="status"` and `aria-live="polite"` message |
| `underpainting-upload-panel` | Upload instructions and whole-canvas assumption |
| `underpainting-marking-panel` | Corner prompt, marking stage, and Undo/Reset controls |
| `underpainting-stage` | `position: relative` wrapper for the marking canvases |
| `underpainting-image-canvas` | Capped underpainting pixels |
| `underpainting-guide-canvas` | Transparent pointer/marker layer above the image |
| `underpainting-next-corner` | “Mark top-left”, “Mark top-right”, etc. |
| `underpainting-undo` | Removes the most recently added point |
| `underpainting-reset` | Removes all points and hides comparison |
| `underpainting-comparison-panel` | Hidden until alignment is current and valid |
| `underpainting-comparison-stage` | `position: relative` wrapper for equal-size comparison canvases |
| `underpainting-reference-canvas` | Bottom reference layer |
| `underpainting-aligned-canvas` | Absolute top aligned-underpainting layer |
| `underpainting-opacity` | Range input, min 0, max 100, step 1, default 50 |
| `underpainting-opacity-label` | Text value such as `50%` |

The guide canvas may use display-resolution backing pixels to save memory, but
marker positions remain stored in capped-image pixel coordinates. On every draw,
convert stored points to guide pixels using the current guide/image dimensions.
The two comparison canvases must use capped-reference backing dimensions and the
same CSS width/height.

### Exact State Transitions

| Event | Required transition and side effects |
|-------|--------------------------------------|
| First mount, no underpainting | `needs-upload`; hide marking and comparison panels |
| `process(reference)` with same object identity | Keep current state; update CSS sizes/guides only; never resize or warp |
| `process(reference)` with new identity | Hide comparison immediately; clear the upper aligned canvas; resize or reuse and fully overwrite the lower reference canvas once; if four valid points exist, `aligning → aligned`; otherwise remain `marking`, preserve an active `loading`, or use `needs-upload` |
| User selects a file | Increment generation; clear old underpainting pixels, points, marking/guide canvases, upper aligned canvas, and comparison; preserve the current lower reference canvas; enter `loading` |
| Current generation decodes successfully | Store capped pixels, set `points=[]`, draw marking image, enter `marking` |
| Current generation fails | Release partial resources, show recoverable message, enter `error`; next valid selection starts `loading` |
| Stale generation completes/fails | Release only its local resources and return without changing UI/state |
| Tap while fewer than four points | Append the next semantic point, redraw guides, remain `marking` |
| Fourth point makes a valid quad | Hide comparison, enter `aligning`, warp once, draw top layer, release temporary warp, enter `aligned` |
| Fourth point is invalid | Keep all four draggable points, hide comparison, show validation message, remain `marking` |
| Pointer down on a handle | Capture pointer, hide comparison immediately, mark alignment stale, enter `marking` |
| Pointer move while captured | Clamp and update only that point; redraw guides; do not warp |
| Pointer up/cancel after drag | Release capture; validate; if valid run `aligning → aligned`, otherwise remain `marking` with comparison hidden |
| Undo Last | Remove final point; hide comparison; enter `marking` |
| Reset Corners | Set `points=[]`; `clearRect` the guide without changing its backing size; hide comparison; enter `marking` |
| Opacity input while aligned | Update label and top-canvas CSS opacity only; state stays `aligned` |

If synchronous warp throws, catch it at the tool boundary, hide the comparison,
show the error, and enter recoverable `error`. A corner edit or replacement file
may retry; do not leave the tab permanently disabled.

### File Decode and Generation-Token Pseudocode

Use an object URL and `Image`, matching the project's browser baseline. Browser
decoding supplies oriented `naturalWidth`/`naturalHeight`; do not manually apply
EXIF rotation.

```js
var loadGeneration = 0;
var activeDecode = null;

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
        throw new RangeError('Image must be at least 2 × 2 pixels.');
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
```

The implementation must also zero and release a stale temporary canvas before
returning. A new selection actively cancels the prior `Image`, removes its
handlers, and revokes its URL before starting another decode.
`clearUnderpaintingAndComparison()` increments no token itself; only a new
selection increments `loadGeneration`.

### Tool Rendering Pseudocode

Keep these closure variables; do not introduce a second global image manager:

```js
var referenceIdentity = null;       // borrowed, never copied
var referenceSize = null;           // { width, height }
var underpaintingPixels = null;     // owned capped ImageData
var points = [];                    // capped underpainting pixel coordinates
var state = 'needs-upload';
```

Reference processing must distinguish data changes from layout-only calls:

```js
function processReference(imageData) {
  if (imageData === referenceIdentity) {
    updateCssLayoutAndGuides();
    return;
  }

  referenceIdentity = imageData;
  invalidateAlignedComparison();
  if (!imageData || imageData.width < 2 || imageData.height < 2) {
    referenceSize = null;
    referenceCanvas.width = 0;
    referenceCanvas.height = 0;
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
    referenceCanvas.width = 0;
    referenceCanvas.height = 0;
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
  } else if (state !== 'loading') {
    setState('needs-upload');
  }
}
```

`setCanvasBackingSize` changes `canvas.width`/`height` only when the dimensions
actually differ; assigning the same values clears pixels and reallocates backing
storage unnecessarily.

Alignment has one entry point:

```js
function alignOnce() {
  if (!referenceSize || !underpaintingPixels) return;
  var validation = validateCornerQuad(points,
    underpaintingPixels.width, underpaintingPixels.height);
  if (!validation.valid) {
    invalidateAlignedComparison();
    showValidationMessage(validation.message);
    setState('marking');
    return;
  }

  setState('aligning');
  var warped = null;
  try {
    warped = warpPerspective(underpaintingPixels, points,
      referenceSize.width, referenceSize.height);
    setCanvasBackingSize(alignedCanvas,
      referenceSize.width, referenceSize.height);
    alignedCanvas.getContext('2d').putImageData(warped, 0, 0);
    alignedCanvas.style.opacity = String(Number(opacityInput.value) / 100);
    comparisonPanel.classList.remove('hidden');
    setState('aligned');
  } catch (error) {
    invalidateAlignedComparison();
    showRecoverableError(error.message);
  } finally {
    warped = null;
  }
}
```

`invalidateAlignedComparison()` hides the comparison and zeros only the upper
aligned canvas when the reference canvas is still current. The new-file path
also zeros the marking and guide canvases but preserves the current lower
reference canvas. The new-reference path may reuse the lower canvas backing when
dimensions match, but it must fully overwrite every pixel before showing the
comparison again.

Pointer conversion and hit testing use CSS pixels for the hit radius but bitmap
pixels for stored geometry:

```text
relativeCssX = event.clientX - imageRect.left
relativeCssY = event.clientY - imageRect.top
bitmapX = clamp(relativeCssX * underpaintingWidth / imageRect.width - 0.5,
                0, underpaintingWidth - 1)
bitmapY = clamp(relativeCssY * underpaintingHeight / imageRect.height - 0.5,
                0, underpaintingHeight - 1)

For each handle:
  handleCssX = (handle.x + 0.5) * imageRect.width / underpaintingWidth
  handleCssY = (handle.y + 0.5) * imageRect.height / underpaintingHeight
  hit when hypot(relativeCssX-handleCssX,
                 relativeCssY-handleCssY) <= 22 CSS pixels
```

Search handles from last to first so the most recently placed overlapping handle
wins. A pointer down outside all existing handles adds the next point only while
`points.length < 4`; after four points, it does nothing.

### Buffer Ownership Checklist

At every commit/replacement, assign one owner and clear obsolete references:

| Resource | Owner | Release rule |
|----------|-------|--------------|
| Full reference `ImageData` | `ImageManager` | Never copy or release in this tool |
| Temporary resized reference | Local `process()` call | Draw lower canvas, then set local reference to `null` |
| Capped underpainting `ImageData` | Tool closure | Replace/clear on new file; needed for future rewarps |
| Marking canvas backing | DOM/tool | Resize to `0×0` before replacing/clearing |
| Guide canvas backing | DOM/tool | Resize to `0×0` on a new file; recreate only at display dimensions when capped pixels commit; Reset Corners uses `clearRect` and preserves the backing for new taps |
| Lower comparison canvas backing | DOM/tool | Reuse or resize and fully overwrite on a new reference; zero only when no valid reference exists |
| Temporary warped `ImageData` | Local alignment call | Draw upper canvas, then set local reference to `null` |
| Upper comparison canvas backing | DOM/tool | Reuse; resize to `0×0` when alignment becomes stale |
| Object URL / `Image` handlers | Active decode job | Cancel, revoke, and remove handlers immediately on replacement; also release idempotently on success/error |

JavaScript has no explicit `ImageData.free()`: “release” means remove every
application reference and, for disposable canvases, set width and height to zero
so the browser can reclaim backing storage.

## TDD and Implementation Sequence

### Milestone 1: Prove the geometry

1. Create `tests/underpaintingAlignment.test.js` using the repository's inline
   test runner and Node-compatible `ImageData` fallback.
2. Add failing tests for working-size caps, quadrilateral validation,
   homography solving/mapping, bilinear sampling, and perspective warping.
3. Run the new tests and explicitly report **“test failed as expected.”**
4. Implement `underpaintingAlignment.js` until the tests pass, then refactor.
5. Run every existing `tests/*.test.js` file to catch regressions.

Required cases include:

- identity and affine-as-a-subset mappings;
- a known projective transform and corner correspondence;
- semantic 90° and 180° rotations without mirroring;
- destination/source round trips and finite coefficients;
- incomplete, duplicate, tiny, collinear, concave, crossed, and singular quads;
- exact source boundaries and transparent out-of-bounds behavior;
- bilinear interpolation of color and alpha;
- programmer-invalid arguments and dimensions narrower/shorter than two pixels;
- reference resizing, including exact boundaries, bilinear RGBA/alpha, cap-sized
  output, no source mutation, and no source-sized intermediate allocation;
- requested dimensions, cap rounding, and aspect preservation;
- near-singular/ill-conditioned systems, both accepted winding signs, and exact
  `[0,width-1] × [0,height-1]` boundaries;
- no mutation of source points or pixels;
- browser-global declarations plus guarded CommonJS exports.

### Required Numeric Test Fixtures

Use these fixtures rather than inventing only qualitative assertions:

1. **Working size:**
   - `computeWorkingSize(4000, 3000, 2_000_000, 2048)` returns `1632 × 1224`.
   - `computeWorkingSize(6000, 1000, 2_000_000, 2048)` returns `2048 × 341`.
   - Inputs `1 × 100`, `maxPixels < 4`, and `maxEdge < 2` throw.
2. **Validation on a 100 × 100 image:**
   - `[(0,0),(99,0),(99,99),(0,99)]` is valid.
   - `[(99,0),(0,0),(0,99),(99,99)]` is also valid (opposite winding).
   - `[(0,0),(99,99),(99,0),(0,99)]` reports `self-intersecting`.
   - A point at `(100,50)` reports `out-of-bounds`.
3. **Identity homography:** destination and source corners both
   `[(0,0),(9,0),(9,9),(0,9)]`. All four corners and `(4.5,4.5)` map to
   themselves within `1e-9`.
4. **Matrix scale invariance:** `mapHomographyPoint()` maps `(4,7)` to `(4,7)`
   for both identity `[1,0,0,0,1,0,0,0,1]` and its equivalent
   `[1e-15,0,0,0,1e-15,0,0,0,1e-15]`.
5. **Known projective mapping:** begin with
   `H=[1,0,0, 0,1,0, 0.001,0.002,1]`. Destination corners
   `[(0,0),(100,0),(100,50),(0,50)]` map approximately to
   `[(0,0),(90.9090909,0),(83.3333333,41.6666667),(0,45.4545455)]`.
   Solving from those pairs and mapping `(50,25)` must produce
   `(45.4545455,22.7272727)` within `1e-6`. Compare mapped points, not raw matrix
   coefficients, because homographies are scale-equivalent.
6. **Identity pixels:** warping an opaque 2 × 2 image with identity corners
   returns byte-for-byte identical pixels.
7. **180° semantic correction:** source pixels `[A B; C D]`, source corners
   `[(1,1),(0,1),(0,0),(1,0)]`, and output `2 × 2` produce `[D C; B A]`.
8. **90° semantic correction:** use the 3 × 2 photographed pixels
   `[E C A; F D B]`, source corners `[(2,0),(2,1),(0,1),(0,0)]`, and output
   `2 × 3`; expect `[A B; C D; E F]` exactly.
9. **Opaque bilinear center:** resize this 2 × 2 RGB grid to 3 × 3:
   top row `[(0,0,0),(255,0,0)]`, bottom row
   `[(0,255,0),(255,255,255)]`, all alpha 255. The center pixel is
   `[128,128,64,255]` using `Math.round`.
10. **Premultiplied alpha:** resize a 2 × 2 image whose left column is transparent
   red `[255,0,0,0]` and right column opaque blue `[0,0,255,255]` to 3 × 2.
   Each middle-column pixel is `[0,0,255,128]`, not purple.
11. **Cross-resolution consistency:** create a 4 × 4 opaque coordinate-gradient
    image. Compare `resizeImageData(source, 2, 2)` with
    `warpPerspective(source, [(0,0),(3,0),(3,3),(0,3)], 2, 2)` and require
    byte-for-byte equality. This locks the shared align-corners convention.
12. **Mutation:** snapshot source bytes and point arrays before every resize/warp
    fixture and assert deep equality afterward.

For symbolic `A`–`F` fixtures, assign distinct opaque grayscale bytes (for
example A=10, B=20, …, F=60) so equality is unambiguous.

The test file must provide this Node fallback before requiring or invoking code
that constructs `ImageData`:

```js
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
```

The implementation must always allocate with
`new ImageData(new Uint8ClampedArray(width * height * 4), width, height)` so the
same path works in browsers and this test fallback.

### Milestone 1 Stop Gate

Do not start UI work until:

- the new test initially exits non-zero and the work log says
  **“test failed as expected”**;
- every required numeric fixture passes;
- every mapped coefficient/coordinate is finite;
- identity and rotated fixtures prove the matrix direction is correct; and
- all pre-existing tests still pass.

If a numeric fixture appears inconsistent with the formulas, stop and request
human clarification instead of weakening the assertion.

### Milestone 2: Build the interaction

1. Add the static `#tool-underpainting-accuracy` view to `index.html`.
2. Load `underpaintingAlignment.js` before the tool module and load
   `underpaintingAccuracyTool.js` after `app.js`.
3. Implement guarded underpainting upload/decode and immediate downscaling.
4. Implement the guided TL/TR/BR/BL marker overlay, labels, polygon, undo/reset,
   draggable handles, pointer capture, and validation messages.
5. Warp after four valid points and after valid drag completion.
6. Render reference plus aligned underpainting and wire the opacity slider
   without recomputation.

### Milestone 2 Stop Gate

Do not continue to release polishing until a browser run demonstrates all of the
following with a synthetic labeled rectangle:

- normal, 90°, and 180° photographs produce upright labels;
- moving opacity never calls `warpPerspective` (temporarily instrument a counter);
- dragging a handle hides the old comparison immediately and warps exactly once
  after a valid pointer release;
- tab activation and window resize with the same reference object cause zero
  resizes and zero warps; and
- a new reference object causes one reference resize and at most one warp.

Stop on mirrored output, swapped corners, stale visible comparison, repeated
warp, or an uncaught load/alignment error. Fix these before styling polish.

### Milestone 3: Make it release-ready

1. Add scoped responsive, focus, error, stacked-canvas, and touch styles.
2. Make the enlarged tab bar usable on narrow screens via wrapping or horizontal
   scrolling.
3. Update `docs/REQUIREMENTS.md` with the exact feature assumptions and
   visual-only scope.
4. Update `docs/ARCHITECTURE.md` with the two-image data flow, projective warp,
   working-resolution policy, module contracts, script order, and testing
   strategy. Correct the nearby claim that a new tool needs only one script tag,
   since tools currently also require static HTML.
5. Independently review correctness, tests, simplicity, memory ownership,
   accessibility, documentation, and scope before completion.

### Milestone 3 Stop Gate

Completion requires all automated tests, the manual browser/mobile checklist,
the buffer budget, and the performance target to pass or to have an explicitly
recorded release risk. Do not claim untested browsers/devices as passing. Do not
add a fallback mode, dependency, worker, or lower-quality affine transform to
work around a failed gate without approval.

## Expected File Changes

| File | Change |
|------|--------|
| `underpaintingAlignment.js` | New pure alignment/warp module |
| `underpaintingAccuracyTool.js` | New upload, marking, and overlay tool module |
| `tests/underpaintingAlignment.test.js` | New zero-dependency unit tests |
| `index.html` | Add tool view and script tags |
| `style.css` | Add scoped responsive/touch styles |
| `docs/REQUIREMENTS.md` | Add underpainting accuracy requirement |
| `docs/ARCHITECTURE.md` | Document algorithm, flow, files, and tests |

No `app.js` or dependency/build changes are planned.

## Validation Contract

### Automated

- Run `node tests/underpaintingAlignment.test.js` during the red and green TDD
  phases.
- Run every `node tests/*.test.js` file after implementation.
- Assert no NaN or Infinity reaches a mapped coordinate or output buffer.
- Benchmark a capped two-megapixel warp. Initial goals are under 500 ms on a
  current desktop browser and under two seconds on a representative supported
  phone; record unavailable phone validation as a release risk rather than
  claiming success.
- Verify by buffer dimensions and repeated replacement runs that the tool never
  retains more than four full capped RGBA buffers/backings after alignment and
  never peaks above five, excluding the shared `ImageManager` reference and the
  display-resolution guide overlay. Repeated uploads must not grow that count.

### Manual Browser and Mobile

Verify:

- normal, 90°-rotated, and 180°-rotated underpainting photographs;
- accurate alignment of a synthetic photographed rectangle with known landmarks;
- opacity at 0%, 50%, and 100%, with no warp during slider movement;
- handle dragging beyond canvas bounds while pointer capture remains active;
- invalid quadrilaterals and recovery via undo/reset;
- rapid replacement uploads, corrupt files, and non-image files;
- EXIF orientations 1, 6, and 8 without double rotation;
- tab switching, window resizing, reference promotion/reset, and reprocessing;
- large source images without retained duplicate full-resolution buffers;
- keyboard labels, focus visibility, status announcements, and touch targets;
- a 320-CSS-pixel viewport without horizontal page overflow;
- available Chrome, Firefox, Safari, Android Chrome, and iOS Safari, recording
  unavailable platforms explicitly;
- no console errors and no regressions in existing tools.

## Non-Goals

- Automatic canvas/corner detection or feature registration.
- Marking or cropping a separate matching region on the reference.
- Lens-distortion, curved-canvas, or non-planar correction.
- Lighting, white-balance, contrast, or color normalization.
- Edge extraction, heatmaps, blink, wipe, zoom/pan, numerical scores, or pass/fail
  thresholds.
- Downloading, printing, persistence, history, or promoting the result.
- Full-resolution rectification, WebGL, workers, external libraries, or a build
  step for the MVP.

## Risks and Mitigations

- **Incorrect crop/aspect assumption:** State it before corner marking; future
  reference-region selection is separate scope.
- **Corner error mistaken for painting error:** Keep labeled draggable handles
  available, provide Undo/Reset, and make no objective accuracy claim.
- **Degenerate geometry:** Use relative validation thresholds, normalized
  solving, finite checks, and fail-closed behavior.
- **Main-thread latency:** Cap pixels, avoid warp during dragging or opacity
  changes, measure on a phone, and lower the documented cap if necessary.
- **Mobile memory pressure:** Enforce the five-buffer peak/four-buffer retained
  budget, release temporary resized/warped buffers after drawing, replace rather
  than accumulate canvases, and verify repeated uploads do not increase retained
  working storage.
- **Browser image orientation differences:** Rely on decoded dimensions, never
  apply EXIF orientation twice, and validate representative orientation files.
- **No DOM test harness:** Cover pure math thoroughly and require disciplined
  manual pointer, accessibility, responsive, and browser testing.

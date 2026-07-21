# Plan 016: Crop Tool Startup Regression

## Problem

Selecting Crop shows an unrendered default canvas and its controls do nothing.
Browser reproduction found `TypeError: Settings.get is not a function` while
`cropTool.js` mounts. `ToolShell` marks the tool mounted before calling
`mount()`, so that exception also prevents any later recovery in the page.

## Contract

- `Settings.getString(key, fallback)` returns the stored string, or `fallback`
  when the key is absent or storage is unavailable.
- Crop reads its string preset with `getString` and its orientation with
  `getBool`; it must use only the public typed Settings API.
- Selecting Crop after an image is loaded mounts, renders the overlay, and
  leaves `ToolShell._tools.crop.process` callable.

## TDD and Validation

1. Add `getString` success, missing-key, and storage-failure tests.
2. Run the test; it fails with `Settings.getString is not a function` as
   expected.
3. Add the typed accessor and update Crop to use it.
4. Run all Node tests.
5. Browser smoke test: upload an image, select Crop, move the crop rectangle,
   select an aspect, and apply the crop.

## Scope

This fixes only the startup error. ToolShell's general mount-exception recovery
is outside this targeted regression fix.

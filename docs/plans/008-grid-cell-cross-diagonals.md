# Plan: Cross Diagonals in Grid Cells

## Requirement
When the Grid Overlay tool's **Diagonals** option is enabled, draw both corner-to-corner diagonals in every grid cell.

## Approach
1. Add a canvas-context mock test that asserts a single cell produces the two opposing diagonal paths.
2. Confirm the test fails against the current single-diagonal behavior.
3. Draw the second path in `drawGrid` and run the test suite.
4. Update requirements and architecture documentation, then review the change.

## Contract
- **Precondition:** `showDiagonals` is truthy and row/column counts describe the grid.
- **Postcondition:** Each cell has an `\` path from top-left to bottom-right and a `/` path from bottom-left to top-right.
- **Invariant:** Diagonals retain the existing opacity, solid style, and line-width behavior; all other overlay features are unchanged.

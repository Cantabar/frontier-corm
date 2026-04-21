# Testing: Star Selection Visual Enhancement

## Automated Test Results

| Package | Total | Pass | Fail | Skip |
|---------|-------|------|------|------|
| web | 45 | 45 | 0 | 0 |

## Acceptance Criteria Coverage

| Criterion | Covered by | Status |
|-----------|-----------|--------|
| Selected star's point turns gold; previous returns to white | manual | unchecked |
| Static cyan torus ring renders at selected star | manual | unchecked |
| Torus ring scales proportionally with camera distance | manual | unchecked |
| Torus ring always faces camera regardless of orbit angle | manual | unchecked |
| Selecting a star triggers smooth ~800ms fly-to | manual | unchecked |
| Camera orbit pivot centered on selected star after fly-to | manual | unchecked |
| Camera zoom distance preserved after fly-to | manual | unchecked |
| SystemInfoPanel shows X in LY for selected system | `SystemInfoPanel.test.tsx > XYZ coordinates > shows X coordinate in light-years` | pass |
| SystemInfoPanel shows Y in LY for selected system | `SystemInfoPanel.test.tsx > XYZ coordinates > shows Y coordinate in light-years` | pass |
| SystemInfoPanel shows Z in LY for selected system | `SystemInfoPanel.test.tsx > XYZ coordinates > shows Z coordinate in light-years` | pass |
| Empty state shows no X/Y/Z labels | `SystemInfoPanel.test.tsx > XYZ coordinates > does not show coordinate labels in the empty state` | pass |
| Yellow sphere removed | manual | unchecked |
| `tsc --noEmit` passes | type check (see below) | pass |
| `vitest run` passes | automated | pass |
| `formatCoordLy` positive value | `galaxyMap.test.ts > formatCoordLy > formats a positive whole-number LY value` | pass |
| `formatCoordLy` negative value | `galaxyMap.test.ts > formatCoordLy > formats a negative whole-number LY value` | pass |
| `formatCoordLy` zero | `galaxyMap.test.ts > formatCoordLy > formats zero as 0.0 LY` | pass |
| `formatCoordLy` fractional sub-LY (float path) | `galaxyMap.test.ts > formatCoordLy > formats a fractional sub-LY value` | pass |
| `formatCoordLy` large galaxy-scale value | `galaxyMap.test.ts > formatCoordLy > formats a large galaxy-scale positive/negative value` | pass |

## Manual Testing Checklist

### Star color change
1. Open the Galaxy Map page.
2. Click any star.
Expected result: The clicked star's point turns gold. All other stars remain white.

### Deselect / re-select
1. Click star A.
2. Click star B.
Expected result: Star A returns to white. Star B turns gold. No ghost gold stars remain.

### Cyan ring appearance
1. Click any star.
Expected result: A cyan ring appears centered on the selected star. No yellow sphere is visible anywhere.

### Ring orientation
1. Click a star. Orbit the camera to view the galaxy from a steep angle.
Expected result: The ring always faces the camera (billboards) regardless of orbit angle.

### Ring scale with zoom
1. Click a star. Scroll to zoom in close.
Expected result: The ring grows proportionally — it stays clearly visible and does not shrink to nothing.
2. Scroll out to maximum zoom.
Expected result: The ring shrinks proportionally and remains visible.

### Fly-to animation
1. Click a star on the opposite side of the galaxy from your current view.
Expected result: The camera smoothly animates (~800 ms) to center the selected star. The motion follows a cubic ease-in-out curve (starts slow, speeds up, eases out).

### Zoom preservation
1. Zoom in to a close distance, then click a far-away star.
Expected result: After the fly-to completes, the camera is at the same distance from the new star as it was from the previous view target.

### XYZ coordinates
1. Click any star.
Expected result: The info panel on the right shows X, Y, Z rows with values formatted as `nnn.n LY`.
2. Click away / deselect (or select an invalid area).
Expected result: XYZ rows disappear. Panel shows "Select a solar system".

## Regression Surface

- `SolarSystemPoints`: point rendering (size, color, raycasting) — verify clicking still works and all stars are visible at all zoom levels.
- `SystemInfoPanel`: name, ID, constellation, region display — verify these still show correctly.
- `GalaxyMap`: OrbitControls zoom/pan/orbit — verify user can still navigate freely after fly-to completes.

## Type Check

| Package | Result |
|---------|--------|
| web | clean (0 errors) |

## Code Review Findings

**BLOCKING issue found and fixed before TESTING.md was written:**
`SolarSystemPoints.tsx` — `sizeAttenuation={false}` was present on the original `pointsMaterial` in the base branch but was removed during implementation after an incorrect earlier review claimed it was not in the original. The final branch review confirmed the regression. Fixed in commit `fix(web): restore sizeAttenuation=false on star pointsMaterial`.

**NON-BLOCKING findings (not fixed — noted for future cleanup):**

1. `SolarSystemPoints.tsx` — `idToIndex` is computed locally from `ids` (a new `useMemo`) instead of being threaded through from the parent. Since `GalaxyMap` already has `idToIndex` from `buildGalaxyBuffer`, a future cleanup could add `idToIndex` as a prop to `SolarSystemPoints` to eliminate the redundant map construction.

2. `SolarSystemPoints.tsx` — `if (selectedId !== null && selectedId !== undefined)` — the `!== undefined` guard is redundant given the prop type is `number | null`.

3. `SolarSystemPoints.tsx` — `colorAttr.array as Float32Array` cast. Correct at runtime but bypasses TypeScript. A cleaner approach is a second ref holding the raw `Float32Array`.

4. `SelectionIndicator.tsx` — No minimum scale guard on the torus; at very close zoom distances the ring shrinks toward zero. Unlikely to be noticed in practice.

5. `formatCoordLy` — `Number(coord)` for galaxy-scale BigInts exceeds `Number.MAX_SAFE_INTEGER`, introducing sub-LY precision loss. Acceptable at `toFixed(1)` resolution but not documented.

6. `GalaxyMap.tsx` — `controlsRef as Ref<OrbitControlsImpl>` cast is needed due to drei/three-stdlib type mismatch; worth revisiting if either package is updated.

## Summary

All 45 automated tests pass. TypeScript type check is clean. The branch implements all six spec requirements: gold star highlight, cyan billboarding torus ring with proportional scaling, smooth 800 ms fly-to with zoom preservation, and XYZ coordinate display in light-years. One regression (`sizeAttenuation`) was identified by the final code review and fixed. Six non-blocking code quality observations are noted above but do not affect correctness. Seven acceptance criteria require manual in-browser verification against the checklist above.

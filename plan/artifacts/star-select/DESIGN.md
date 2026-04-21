# Design: Star Selection Visual Enhancement

## File Plan

| File | Action | Purpose |
|------|--------|---------|
| `web/src/lib/galaxyMap.ts` | modify | Export `formatCoordLy(coord: bigint): string` — converts BigInt meters to a LY string (e.g. `"540.2 LY"`). Encapsulates the conversion and avoids duplicating `METERS_PER_LY`. |
| `web/src/lib/galaxyMap.test.ts` | modify | Add unit tests for `formatCoordLy`: positive, negative, zero, fractional (< 1 LY), and large values. |
| `web/src/components/map/SystemInfoPanel.tsx` | modify | Import and call `formatCoordLy`; add X/Y/Z rows below Region using the selected entry's `x`, `y`, `z` BigInt fields. |
| `web/src/components/map/SystemInfoPanel.test.tsx` | modify | Extend existing tests: assert X/Y/Z rows render with correct formatted values for a known system; assert rows are absent in the empty state. |
| `web/src/components/map/SolarSystemPoints.tsx` | modify | Add `selectedId?: number \| null` prop (optional, defaults to `null`). Add a per-vertex `Float32Array` color attribute to `BufferGeometry` (default white). Populate a `colorAttributeRef` inside the same `useMemo` as the geometry. On `selectedId` change (`useEffect`), update previous and next star's RGB slot and set `colorAttributeRef.current.needsUpdate = true`. Enable `vertexColors` on `PointsMaterial`. |
| `web/src/components/map/SelectionIndicator.tsx` | modify | Replace yellow sphere with a cyan (`#00e5ff`) `<torusGeometry>`. Use `useThree` to access `camera`. Use `useFrame` to billboard the mesh (`mesh.quaternion.copy(camera.quaternion)`) and scale it (`mesh.scale.setScalar(camera.position.distanceTo(starWorldPos) * RING_SCALE_FACTOR)`). |
| `web/src/components/map/CameraController.tsx` | create | New r3f component (no geometry). Props: `selectedId`, `positions`, `idToIndex`, `controlsRef`. On `selectedId` change: disables `controls.enableDamping`, records `startTarget`, `endTarget`, `startOffset` (camera–target vector), `startTime`. `useFrame` lerps `controls.target` and repositions camera at `endTarget + startOffset` using cubic ease-in-out over `FLY_DURATION_MS = 800`. On completion, re-enables `controls.enableDamping`. Guards `controlsRef.current` null before any access. |
| `web/src/components/map/GalaxyMap.tsx` | modify | Add `useRef<OrbitControlsImpl>()` and pass via `ref={controlsRef as React.Ref<OrbitControlsImpl>}` (typed cast, not `@ts-expect-error`). Render `<CameraController>` inside `Canvas`. Forward `selectedId` to both `SolarSystemPoints` and `CameraController`. Import `OrbitControlsImpl` from `three-stdlib`. |

## Execution Order

1. **`lib/galaxyMap.ts`** — add and export `formatCoordLy`. No dependencies on other changes.
2. **`lib/galaxyMap.test.ts`** — extend tests for `formatCoordLy`. Validates the helper before UI consumes it.
3. **`SystemInfoPanel.tsx`** — consume `formatCoordLy`; add coordinate rows. Depends on step 1.
4. **`SystemInfoPanel.test.tsx`** — extend tests for coordinates. Depends on step 3.
5. **`SolarSystemPoints.tsx`** — add per-vertex colors and optional `selectedId` prop. `selectedId` is optional (`null` default) so `GalaxyMap` does not need simultaneous update — no TS error gap.
6. **`SelectionIndicator.tsx`** — replace sphere with billboarding torus. No dependencies on other in-plan changes.
7. **`CameraController.tsx`** — new file. Guards `controlsRef.current` null so it is inert until `GalaxyMap` wires it up in step 8.
8. **`GalaxyMap.tsx`** — wire `OrbitControls` ref, render `CameraController`, forward `selectedId` to `SolarSystemPoints`. Depends on steps 5, 6, 7.

## Data Flow

```
User clicks star
  └─► SolarSystemPoints.onClick(intersect.index)
        └─► ids[intersect.index] → onSelect(systemId)
              └─► MapPage.setSelectedSystemId(systemId)   [React state]
                    │
                    ├─► SolarSystemPoints (selectedId prop)
                    │     useEffect([selectedId]):
                    │       colorBuf[prevIdx * 3 .. +2] = [1, 1, 1]  (reset prev)
                    │       colorBuf[newIdx  * 3 .. +2] = [1, 0.84, 0] (gold)
                    │       colorAttributeRef.current.needsUpdate = true
                    │       prevIdRef.current = selectedId
                    │
                    ├─► SelectionIndicator (selectedId prop)
                    │     positions lookup → starWorldPos (THREE.Vector3)
                    │     useFrame (every frame):
                    │       mesh.quaternion.copy(camera.quaternion)     [billboard]
                    │       dist = camera.position.distanceTo(starWorldPos)
                    │       mesh.scale.setScalar(dist * RING_SCALE_FACTOR)
                    │
                    ├─► CameraController (selectedId prop)
                    │     useEffect([selectedId]):
                    │       if controlsRef.current is null → return
                    │       controls.enableDamping = false
                    │       startTarget = controls.target.clone()
                    │       endTarget = starWorldPos
                    │       startOffset = camera.position.clone().sub(startTarget)
                    │       startTime = performance.now()
                    │     useFrame (while animating):
                    │       if controlsRef.current is null → return
                    │       t = easeInOut(elapsed / FLY_DURATION_MS), clamped [0,1]
                    │       controls.target.lerpVectors(startTarget, endTarget, t)
                    │       camera.position.copy(controls.target).add(startOffset)
                    │       controls.update()
                    │       if t >= 1 → controls.enableDamping = true; stop animation
                    │
                    └─► SystemInfoPanel (selectedSystemId prop)
                          SOLAR_SYSTEMS.get(id) → entry
                          formatCoordLy(entry.x) → "540.2 LY"
                          formatCoordLy(entry.y) → "-12.1 LY"
                          formatCoordLy(entry.z) → "-305.8 LY"
                          render: Name, ID, Constellation, Region, X, Y, Z
```

## Implementation Notes

### `formatCoordLy` conversion precision

Convert via `Number(coord) / Number(METERS_PER_LY)` — **not** BigInt integer division `Number(coord / METERS_PER_LY)`. BigInt division truncates toward zero before conversion, so any star within 1 LY of an axis origin displays `"0.0 LY"`. Galaxy-scale coordinates reach ~500 LY = ~4.7 × 10¹⁸ m, which exceeds float64's exact integer range (2⁵³ ≈ 9 × 10¹⁵), introducing ~sub-meter rounding — acceptable for display. `METERS_PER_LY` itself (`9_460_730_472_580_800n = ~9.46 × 10¹⁵`) is representable exactly as float64.

### Per-vertex color update (`SolarSystemPoints`)

The color `Float32Array` and `BufferAttribute` are created inside the existing `useMemo([positions])` alongside the position attribute — both buffers live on the same memoized geometry. A `colorAttributeRef` (`useRef<THREE.BufferAttribute>`) is populated synchronously within the same memo, ensuring it is never null when `useEffect([selectedId])` fires. If `positions` ever changes (new array reference), the memo re-runs, recreating both geometry and color buffer simultaneously — no stale-ref window.

`useEffect([selectedId])` reads `prevIdRef.current` to find the previous star's buffer index, resets that star to white, writes gold to the new star, sets `needsUpdate = true`, then updates `prevIdRef.current = selectedId`. Reset and write happen in a single synchronous effect — no ordering split between effects.

### Fly-to animation and damping (`CameraController`)

`controls.enableDamping` is disabled at animation start and re-enabled at completion. This sidesteps the `useFrame` subscriber ordering uncertainty between `CameraController` and drei's `OrbitControls` (r3f v9 processes subscribers in mount order, which is non-deterministic for sibling components registered in `useEffect`). It also prevents the double `controls.update()` call from applying damping twice per frame.

Drei's `OrbitControls` syncs JSX props to the imperative instance only when prop values change (via `useEffect` dependencies). Since `<OrbitControls enableDamping />` passes a static `true`, drei sets `controls.enableDamping = true` once on mount and does not re-set it during animation — the direct mutation is safe.

Camera zoom preservation: `startOffset = camera.position.clone().sub(startTarget)` at animation start encodes both distance and viewing angle. Applying `camera.position.copy(controls.target).add(startOffset)` each frame translates the same offset to the animated target. The user arrives at the new star from the same relative angle they were viewing before — intentional behavior.

### OrbitControls ref TypeScript

`OrbitControls` from drei is a `ForwardRefComponent<OrbitControlsProps, OrbitControlsImpl>`. The `ref` prop is absent from `OrbitControlsProps` because React's forwardRef model treats `ref` as special (not in the props type). Passing a ref works at runtime; the typed cast `ref={controlsRef as React.Ref<OrbitControlsImpl>}` is the narrowest safe suppression.

### Billboard torus scale constant

`RING_SCALE_FACTOR = 0.035` — at the default camera distance of 15 000 LY-scale units this produces a ring radius of ~525 units, rendering as a clear halo without crowding neighbours. Tune at implementation time if needed. The mesh position is set declaratively by React (via the `position` prop); `useFrame` writes only `quaternion` and `scale` — there is one-frame split ownership but the 16 ms gap is imperceptible.

## Test File Plan

| Test File | Covers |
|-----------|--------|
| `web/src/lib/galaxyMap.test.ts` | `formatCoordLy`: positive value, negative value, zero, fractional (< 1 LY using float path), large galaxy-scale value |
| `web/src/components/map/SystemInfoPanel.test.tsx` | X/Y/Z rows render with correct formatted values for a known system; X/Y/Z rows absent in empty state |
| Canvas components (`GalaxyMap`, `SolarSystemPoints`, `SelectionIndicator`, `CameraController`) | No unit tests — require WebGL/r3f infrastructure absent from this repo. Covered by manual testing checklist below. |

### Manual Testing Checklist

These DoD items have no automated test and must be verified by hand after implementation:

- [ ] Click a star — its point turns gold; all others remain white
- [ ] Click a second star — the first returns to white, the second turns gold
- [ ] A cyan ring appears around the selected star
- [ ] Zoom in and out — the ring maintains consistent apparent size on screen
- [ ] The ring always faces the camera regardless of orbit angle
- [ ] Selecting a star triggers a smooth ~800 ms fly-to
- [ ] After the fly-to, the selected star is centered in the viewport
- [ ] Camera zoom distance is the same before and after the fly-to
- [ ] The yellow sphere is gone (no yellow geometry visible at any selection)

## Risks and Unknowns

- **`positions` array identity:** `buildGalaxyBuffer` is called in `MapPage` inside `useMemo([], [])`. As long as that dependency array stays empty, `positions` never changes reference and the color buffer is never re-created. If a future change adds dependencies (e.g. live data), the color reset logic will need to also re-apply gold to the selected star after the memo re-runs.
- **Rapid selection:** `useEffect([selectedId])` with a `prevIdRef` handles the common case. If a user clicks faster than one frame (unlikely but possible with keyboard navigation in future), the effect fires synchronously in commit order so each intermediate selection is correctly reset before the next is applied.
- **`controlsRef.current` during animation completion:** If the Canvas is unmounted while a fly-to is in progress, `controlsRef.current` becomes null mid-animation. The null guard at the top of `useFrame` handles this gracefully.

---

## Test Plan

| # | Test | File | DoD Item | Status |
|---|------|------|----------|--------|
| 1 | `formatCoordLy` — positive whole-number LY | `lib/galaxyMap.test.ts` | XYZ shown in LY | stub failing ✓ |
| 2 | `formatCoordLy` — negative whole-number LY | `lib/galaxyMap.test.ts` | XYZ shown in LY | stub failing ✓ |
| 3 | `formatCoordLy` — zero | `lib/galaxyMap.test.ts` | XYZ shown in LY | stub failing ✓ |
| 4 | `formatCoordLy` — fractional sub-LY value (float path, not BigInt division) | `lib/galaxyMap.test.ts` | XYZ shown in LY | stub failing ✓ |
| 5 | `formatCoordLy` — large positive galaxy-scale value | `lib/galaxyMap.test.ts` | XYZ shown in LY | stub failing ✓ |
| 6 | `formatCoordLy` — large negative galaxy-scale value | `lib/galaxyMap.test.ts` | XYZ shown in LY | stub failing ✓ |
| 7 | SystemInfoPanel shows X in LY for known system | `SystemInfoPanel.test.tsx` | XYZ shown in LY | stub failing ✓ |
| 8 | SystemInfoPanel shows Y in LY for known system | `SystemInfoPanel.test.tsx` | XYZ shown in LY | stub failing ✓ |
| 9 | SystemInfoPanel shows Z in LY for known system | `SystemInfoPanel.test.tsx` | XYZ shown in LY | stub failing ✓ |
| 10 | SystemInfoPanel empty state shows no X/Y/Z labels | `SystemInfoPanel.test.tsx` | Empty state correct | regression guard (passes now, must keep passing) |
| — | Gold star color, cyan ring, ring scale, fly-to, zoom preservation, yellow sphere removed | manual | see Manual Testing Checklist | no automated test (no WebGL infra) |

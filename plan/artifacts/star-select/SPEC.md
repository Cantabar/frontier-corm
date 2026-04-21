# Spec: Star Selection Visual Enhancement

## API Contracts

N/A — no backend or API changes.

## Data Model Changes

N/A — no new stores or schema changes. Existing `SolarSystemEntry.{x,y,z}` (BigInt meters) are used read-only for coordinate display.

## UI Specification

### Routes / Pages

- `/map` (`MapPage`) — only affected page. No route changes.

### State Changes

- `MapPage`: no new state. `selectedSystemId: number | null` is sufficient.
- `GalaxyMap`: add an `OrbitControls` ref (`useRef<OrbitControlsImpl>()`) so the new `CameraController` child component can read and mutate the controls target.

### Component Changes

#### `SolarSystemPoints.tsx` — per-vertex gold highlight for selected star

- Add a `selectedId: number | null` prop (forwarded from `GalaxyMap`).
- Add a `Float32Array` color attribute to the `BufferGeometry` (3 floats per star, default `[1, 1, 1]` white).
- Set `vertexColors={true}` on `PointsMaterial`; remove the static `color` prop.
- On `selectedId` change (via `useEffect`): reset the previously selected star's color to white, set the newly selected star's color to gold (`[1, 0.84, 0]`), and mark the color `BufferAttribute` as `needsUpdate = true`.

#### `SelectionIndicator.tsx` — replace yellow sphere with a camera-proportional cyan torus ring

- Remove the `<sphereGeometry>` / yellow `<meshBasicMaterial>`.
- Render a `<mesh>` containing a `<torusGeometry>` with a fixed aspect ratio and a `<meshBasicMaterial color="#00e5ff" />` (cyan).
- The torus is oriented to face the camera each frame: use `useFrame` to call `mesh.quaternion.copy(camera.quaternion)` so the ring always billboards toward the viewer.
- Scale the torus each frame: compute `distance = camera.position.distanceTo(starPosition)`, then set `mesh.scale.setScalar(distance * RING_SCALE_FACTOR)` where `RING_SCALE_FACTOR` is a fixed constant (tuned so the ring is visible but not overwhelming — approximately `0.04`).
- Requires a `ref` to the mesh and access to `camera` via `useThree()`.

#### `CameraController.tsx` — new component (rendered inside `Canvas`)

- A r3f component (no visible geometry) that handles the fly-to animation.
- Props: `selectedId: number | null`, `positions: Float32Array`, `idToIndex: Map<number, number>`, `controlsRef: React.RefObject<OrbitControlsImpl>`.
- On `selectedId` change: record animation start state (`startTarget = controls.target.clone()`) and end state (`endTarget` = selected star's world position from `positions`). Store `startTime` and a fixed `FLY_DURATION_MS` (e.g. 800 ms).
- In `useFrame`: if an animation is in progress, compute `t = easeInOut(elapsed / FLY_DURATION_MS)`, lerp `controls.target` from `startTarget` to `endTarget`, then reposition `camera` by maintaining the current `camera → target` offset vector (preserving zoom/distance). Call `controls.update()` each frame.
- Camera distance (zoom level) is preserved: the offset vector `camera.position - controls.target` is computed at animation start and translated in full to the new target at each frame step.
- Animation uses a standard cubic ease-in-out curve.

#### `GalaxyMap.tsx` — wire up new components

- Import and render `CameraController` inside `Canvas`.
- Pass `orbitControlsRef` to both `OrbitControls` (via `ref`) and `CameraController`.
- Forward `selectedId` to `SolarSystemPoints`.
- No layout or camera initialisation changes.

#### `SystemInfoPanel.tsx` — add XYZ coordinates in light-years

- Import `METERS_PER_LY` constant (or inline the same value: `9_460_730_472_580_800n`).
- When `entry` is available, compute display coordinates:
  ```
  xLy = Number(entry.x / METERS_PER_LY)   // one decimal place
  yLy = Number(entry.y / METERS_PER_LY)
  zLy = Number(entry.z / METERS_PER_LY)
  ```
- Render a new `<Detail>` block below Region:
  ```
  X: 540.2 LY
  Y: -12.1 LY
  Z: -305.8 LY
  ```
- No new props — `selectedSystemId` is sufficient; entry is already looked up inside the component.

### Inter-App Messaging

N/A — no postMessage events or cross-app communication.

## Cross-Package Checklist

| Item | Answer |
|------|--------|
| New shared types needed | No — all changes are internal to `web` |
| New shared components needed | No |
| Consuming packages to update after shared pkg bump | N/A |
| Auth changes | None |
| Data passing strategy | N/A — static local data only (`SOLAR_SYSTEMS` map) |
| Data store decision | No new stores; read-only access to existing in-memory `SOLAR_SYSTEMS` |

## Definition of Done

- [ ] Selecting any star turns its point gold; deselecting (selecting a different star) returns the previous star to white
- [ ] A static cyan torus ring renders at the selected star and billboards to face the camera
- [ ] The torus ring maintains a visually consistent screen size as the user zooms in and out
- [ ] Selecting a star smoothly animates the camera orbit pivot to the star's position over ~800 ms
- [ ] Camera distance from the orbit pivot is unchanged after the fly-to completes
- [ ] SystemInfoPanel shows X, Y, Z in light-years (one decimal place) when a star is selected
- [ ] SystemInfoPanel shows "Select a solar system" (no coordinates) when nothing is selected
- [ ] Yellow sphere is gone
- [ ] No TypeScript errors (`tsc --noEmit` passes)
- [ ] Existing map vitest tests pass (`vitest run`)

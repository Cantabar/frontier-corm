# Design: React 19 Upgrade

## File Plan

| File | Action | Purpose |
|---|---|---|
| `web/package.json` | modify | Bump `react`, `react-dom`, `@types/react`, `@types/react-dom`, `@react-three/fiber` (v8→v9), `@react-three/drei` (v9→v10), `@mysten/dapp-kit`, `@vitejs/plugin-react` |
| `web/package-lock.json` | regenerate | Produced by `npm install`; not hand-edited |
| `web/src/components/map/GalaxyMap.tsx` | modify (conditional) | Remove `StrictSafeCanvas` wrapper if React 19's changed StrictMode behaviour means the canvas renders cleanly without it (verified in dev mode, see step 7) |
| `web/src/components/map/SolarSystemPoints.tsx` | modify (conditional) | Fix `ThreeEvent` import if it moves in r3f v9 |
| `web/src/main.tsx` | modify (conditional) | `createRoot` signature changes in `@types/react-dom` v19; likely fine but must be confirmed by `tsc` |
| `web/src/App.tsx` | modify (conditional) | `MapErrorBoundary` uses `componentDidCatch` — `ErrorInfo` type changes in `@types/react` v19; confirm by `tsc` |
| *(any file surfaced by `tsc --noEmit` or `tsc -b`)* | modify | Fix any further `@types/react` v19 breakage (e.g. `styled-components ThemeProvider` JSX children, forge canvas files with direct `React.*` type usage) |

**Note:** `@testing-library/react` v16 already declares `react: "^18.0.0 || ^19.0.0"` — no bump needed. It is not in the file plan.

## Execution Order

1. **Update `web/package.json`** — set all target versions. Pin `react`/`react-dom` to `19.2.5` exactly; use `^` for everything else.

2. **`npm install` inside `web/`** — resolve the new dependency graph. r3f v8 declares `react: ">=18 <19"` as a peer dep, so this step will error without the v9 bump; drei v9 declares `@react-three/fiber: "^8"`, so drei must also move to v10 for resolution to succeed. If `@mysten/dapp-kit` v0.14.x declares `react: "^18"`, find a newer version with `react: ">=18 || ^19"` first; use `--legacy-peer-deps` only as a documented last resort.

3. **`npm run typecheck`** (`tsc --noEmit`) **and `npm run build`** to surface type errors. Run `typecheck` first for a fast scan (uses root tsconfig only). Then run `tsc -b` (part of the `build` script) since the project uses composite project references — errors may appear in `tsc -b` that `--noEmit` misses. Note: `skipLibCheck: true` is set, so third-party type errors inside node_modules are suppressed; only your own code calling into changed types will surface errors.

4. **Fix TypeScript errors** — work through compiler output file by file. Likely hot-spots: `ThreeEvent` import in `SolarSystemPoints.tsx`, `componentDidCatch`/`ErrorInfo` in `App.tsx`, `createRoot` options in `main.tsx`, any forge canvas file using `React.FC`/`React.VFC`/`React.ReactChild`/`React.ReactFragment`.

5. **`npm run test`** (vitest) — verify unit and component tests pass; fix any failures.

6. **`npm run build`** — confirm production build exits 0.

7. **Verify `StrictSafeCanvas` in dev mode** — start dev server (`npm run dev`), navigate to the Galaxy Map, and confirm: (a) canvas is visible, (b) OrbitControls respond to mouse drag, (c) system selection works. This *must* be tested in dev mode (where React 19 StrictMode double-invokes effects) to confirm whether the workaround is still necessary. React 19 changes StrictMode's unmount/remount simulation, which is the root cause of the original bug — not r3f version alone. Define explicit pass criteria: canvas renders without blank screen within 2 seconds; no "forceContextLoss" or WebGL context lost errors in console.

8. **Remove `StrictSafeCanvas` (conditional)** — if step 7 passes cleanly, delete the `StrictSafeCanvas` function and replace its call-site with `<Canvas>` directly. Re-run step 7 *without* the wrapper to confirm. If there is any doubt, leave the wrapper in place; it is harmless.

9. **`npm run test:e2e`** (Playwright) — runs against a production build (no StrictMode effects). All specs including `e2e/map.spec.ts` must pass. Note: E2E cannot serve as the primary guard for `StrictSafeCanvas` regression — it must remain step 7/8's manual dev-mode check.

10. **Manual smoke** — wallet connect, dashboard, map, continuity engine iframe, one contract flow.

## Data Flow

This is a dependency upgrade; there is no new data flow. The happy path is:

```
package.json (new versions)
  → npm install → resolved node_modules (r3f v9 + drei v10 + React 19)
    → tsc --noEmit + tsc -b → 0 errors
      → vitest → 0 failures
        → vite build → dist/
          → dev server (React 19 StrictMode) → browser
            → React 19 StrictMode double-invoke does NOT blank the canvas
              → r3f v9 Canvas mounts cleanly
                → OrbitControls (drei v10) respond
                  → SolarSystemPoints raycaster threshold fires on click
```

## Test File Plan

| Test File | Covers | Notes |
|---|---|---|
| `web/src/lib/galaxyMap.test.ts` | Galaxy map utility logic | Pure TS — regression guard for utility functions |
| `web/src/lib/oreOptimizer.test.ts` | Ore optimizer logic | Pure TS — unaffected by React bump |
| `web/src/components/map/SystemInfoPanel.test.tsx` | RTL component test under React 19 | Confirms `@testing-library/react` v16 render path works with React 19 |
| `web/e2e/map.spec.ts` | Playwright — map interaction (canvas render, system selection, orbit drag) | Primary regression guard for r3f behaviour; runs against production build (no StrictMode effects) |

**Coverage gap (acknowledged, not fixed in this upgrade):** There is no component-level test that renders `GalaxyMap` under React `StrictMode` in a jsdom/happy-dom environment. Such a test would be the right long-term guard for the `StrictSafeCanvas` workaround. However: (a) happy-dom does not support WebGL, so a canvas render test would require either a canvas mock or switching the test environment for that file; (b) this is out of scope for a dependency upgrade. Manual dev-mode verification in step 7 is the substitute.

## Risks and Unknowns

1. **r3f v8 hard peer dep block on React 19** — `@react-three/fiber` v8 declares `react: ">=18 <19"`. npm will refuse to install without `--legacy-peer-deps` unless r3f is upgraded to v9. The r3f v9 upgrade is mandatory, not optional. Similarly, drei v9 requires `@react-three/fiber: "^8"`, so drei must move to v10 as a forced consequence.

2. **`@mysten/dapp-kit` React 19 peer dep** — v0.14.x may pin `react: "^18"`. Resolution: check for a newer `@mysten/dapp-kit` at npm install time; bump to the first version that declares React 19 compat. If none exists at upgrade time, `--legacy-peer-deps` with a documented TODO is the fallback.

3. **`StrictSafeCanvas` root cause is React 19 StrictMode change, not r3f version** — the original bug was r3f v8's `forceContextLoss()` call being triggered by React StrictMode's simulated unmount. React 19 changes how StrictMode unmount/remount simulation works, so the bug may disappear under React 19 regardless of r3f version. The wrapper removal must be validated in dev mode explicitly (step 7).

4. **r3f v9 `ThreeEvent` / `useThree` API changes** — not yet verified against v9 source. Will surface at step 3 (tsc).

5. **drei v10 `OrbitControls` props** — `enableDamping` and related props may have changed. Will surface at step 3 (tsc). Playwright covers runtime crash; silent prop no-ops (e.g. damping disabled but no error) won't be caught by tests.

6. **`skipLibCheck: true` limits type error coverage** — the tsconfig skips type checking inside node_modules. Breakage in JSX children typing through third-party providers (`styled-components ThemeProvider`, drei components) will only appear where your own code calls into them, not inside the library. The `tsc` gate is necessary but not sufficient.

7. **`happy-dom` has no WebGL support** — the vitest environment uses happy-dom. Any test that inadvertently exercises r3f code paths will silently swallow WebGL errors rather than failing noisily. This is a pre-existing condition not introduced by this upgrade.

8. **Fast Refresh / HMR** — `@vitejs/plugin-react` v4 with React 19 may change HMR behaviour. No automated test covers this; manual dev server smoke in step 7 is the only check. A degraded HMR (full reload vs. component swap) is a developer-experience regression but not a functional blocker.

---

## Test Plan

| Test | File | Type | DoD item mapped |
|---|---|---|---|
| React is version 19.x | `src/lib/upgrade.test.ts` | vitest (unit) | `package.json` at target versions |
| @react-three/fiber is version 9.x | `src/lib/upgrade.test.ts` | vitest (unit) | `package.json` at target versions |
| @react-three/drei is version 10.x | `src/lib/upgrade.test.ts` | vitest (unit) | `package.json` at target versions |
| React.use() is available (React 19 addition) | `src/lib/upgrade.test.ts` | vitest (unit) | React 19 runtime API surface |
| Galaxy map utility logic (existing) | `src/lib/galaxyMap.test.ts` | vitest (unit) | No logic regression from bump |
| Ore optimizer logic (existing) | `src/lib/oreOptimizer.test.ts` | vitest (unit) | No logic regression from bump |
| SystemInfoPanel renders under React 19 + RTL (existing) | `src/components/map/SystemInfoPanel.test.tsx` | vitest + RTL | `@testing-library/react` compat, component render |
| Map page loads, canvas visible, system selection works (existing) | `e2e/map.spec.ts` | Playwright | r3f v9 runtime, GalaxyMap render, OrbitControls |

**Not covered by automated tests (manual only):**
- `StrictSafeCanvas` removal correctness — requires dev-mode (`npm run dev`) StrictMode observation; happy-dom has no WebGL
- Fast Refresh / HMR behaviour — dev-server manual check

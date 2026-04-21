# Spec: React 19 Upgrade

## API Contracts

N/A — no new or modified backend endpoints. This is a client-side dependency upgrade only.

## Data Model Changes

N/A — no data store changes.

## UI Specification

### Routes / Pages

No new routes or pages. All existing pages remain structurally unchanged.

### State Changes

No new Redux / Zustand / context state. No new query keys.

### Component Changes

All changes are confined to `web/` and are compatibility fixes, not new features.

#### `web/package.json` — dependency version targets

| Package | From | To |
|---|---|---|
| `react` | `^18.3.1` | `19.2.5` (exact or `^19.2.0`) |
| `react-dom` | `^18.3.1` | `19.2.5` |
| `@types/react` | `^18.3.0` | `^19.0.0` |
| `@types/react-dom` | `^18.3.0` | `^19.0.0` |
| `@react-three/fiber` | `^8.18.0` | `^9.0.0` |
| `@react-three/drei` | `^9.122.0` | `^10.0.0` |
| `@mysten/dapp-kit` | `^0.14.0` | latest compatible with React 19 peer dep |
| `@vitejs/plugin-react` | `^4.3.0` | latest `^4.x` (React 19 support landed in 4.x) |

Packages confirmed already React-19-compatible at current version (no bump required unless peer-dep resolution forces it):
- `styled-components ^6.1.0`
- `react-router-dom ^6.28.0`
- `@testing-library/react ^16.3.2`
- `vitest ^4.1.4`
- `@playwright/test ^1.59.1`

#### `web/src/components/map/GalaxyMap.tsx` — potential `StrictSafeCanvas` removal

The `StrictSafeCanvas` wrapper (lines 7–24) was introduced specifically to work around an r3f v8 / React 18 StrictMode bug where `unmountComponentAtNode` called `forceContextLoss()` after 500 ms, leaving the canvas blank on simulated remount. r3f v9 fixes this double-effect behaviour. If manual testing confirms the canvas renders correctly without the wrapper, `StrictSafeCanvas` should be removed and `Canvas` used directly. If any doubt remains, the wrapper is harmless and can stay.

#### `web/src/components/map/SolarSystemPoints.tsx` — verify `ThreeEvent` import

In r3f v9, confirm that `ThreeEvent` remains importable from `@react-three/fiber`. If the type has moved, update the import accordingly. The runtime usage (`useThree`, `raycaster.params.Points`) is unchanged.

#### TypeScript compilation errors

After bumping `@types/react` to v19, run `tsc -b` and fix any errors surfaced. Known candidates (none confirmed by codebase scan, all pre-emptive):
- `useRef()` with no argument → add `null` or `undefined` (scan found zero instances, so likely none)
- `FC<>` implicit `children` removal (scan found zero `FC<>` usages, so likely none)
- Any third-party type definitions that re-export old React types

### Inter-App Messaging

N/A — no postMessage or cross-frame messaging changes.

## Cross-Package Checklist

| Item | Answer |
|---|---|
| New shared TypeScript types needed | No |
| New shared UI components needed | No |
| Consuming packages to update after shared pkg bump | None — `web/` is the only React package |
| Auth changes | None |
| Data passing strategy changes | None |
| Data store changes | None |
| Background processing changes | None |

## Test Plan

### Automated

| Test | Command | Pass condition |
|---|---|---|
| Vitest unit + component tests | `cd web && npm run test` | Zero failures |
| TypeScript compilation | `cd web && npm run typecheck` | Zero errors |
| Vite production build | `cd web && npm run build` | Exits 0, no errors |
| Playwright E2E (incl. map) | `cd web && npm run test:e2e` | All specs pass, including `e2e/map.spec.ts` |

### Manual verification checklist

- [ ] Dev server starts (`npm run dev`) without console errors
- [ ] Wallet connect flow works end-to-end
- [ ] Dashboard page loads
- [ ] Galaxy Map renders (canvas visible, OrbitControls respond to mouse)
- [ ] Solar system selection works (click a point, SystemInfoPanel appears)
- [ ] Continuity Engine iframe loads
- [ ] Tribes, Contracts, Events, Locations, Settings pages load without errors

## Definition of Done

- [ ] `web/package.json` updated to target versions listed in the Component Changes table; `package-lock.json` / `node_modules` reflect the new versions
- [ ] `npm run typecheck` exits 0 in `web/`
- [ ] `npm run build` exits 0 in `web/`
- [ ] `npm run test` exits 0 in `web/` (vitest)
- [ ] `npm run test:e2e` exits 0 in `web/` (playwright, including `e2e/map.spec.ts`)
- [ ] Galaxy Map canvas renders in the dev server (manual)
- [ ] No React or r3f deprecation warnings appear in the browser console on the map page (manual)
- [ ] PR is branched from `post-hackathon`; commit type `chore(web):`

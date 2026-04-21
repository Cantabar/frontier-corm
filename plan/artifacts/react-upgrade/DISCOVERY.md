# Discovery: React 19 Upgrade

## Problem Statement

The `web` package is pinned to React 18.3.1 and `@react-three/fiber` v8. React 19.2.5 (latest stable) ships concurrent rendering improvements, the new `use()` hook, ref-as-prop, and other features. The r3f v8 / React 18 downgrade was an intentional temporary regression to unblock the map feature E2E tests; this upgrade reverses that regression and brings the full stack up to React 19.

## User Story

As a frontend developer, I want the web app to run on React 19 with compatible r3f/drei versions so that I can use modern React APIs and the stack no longer carries a known downgrade debt.

## Acceptance Criteria

- [ ] `react` and `react-dom` are at `19.2.5`; `@types/react` and `@types/react-dom` are at their React-19-compatible versions
- [ ] `@react-three/fiber` is upgraded to v9.x (React 19 compatible); `@react-three/drei` is upgraded to v10.x (r3f v9 compatible)
- [ ] All other React-peer-dependent packages (`@mysten/dapp-kit`, `styled-components`, `react-router-dom`, `@testing-library/react`) are at versions that declare React 19 peer-dep compatibility
- [ ] `vitest run` passes with zero failures
- [ ] `playwright test` (E2E — including the GalaxyMap tests that triggered the original downgrade) passes
- [ ] `vite build` completes without errors
- [ ] App starts and core flows are manually verified (wallet connect, dashboard, map, continuity engine iframe)
- [ ] TypeScript compilation (`tsc -b`) passes with no new errors

## Out of Scope

- Migrating callers to new React 19 APIs (e.g. replacing `forwardRef`, adopting `use()`) — compatibility shims and deprecated-but-still-working paths are acceptable
- Upgrading non-web packages (indexer, continuity-engine, contracts, infra)
- Adopting React Server Components or any architectural changes

## Package Scope

- [x] `web/` — all dependency changes, any required code fixes

## Known Breaking-Change Surface

These React 19 removals/changes are likely to require code fixes:

| Change | Risk |
|---|---|
| `useRef` now requires an initial argument | Medium — bare `useRef()` calls → `useRef(null)` |
| `@types/react` v19 removes implicit `children` prop from `FC` | Medium — components typed as `FC` may need explicit `children: ReactNode` |
| r3f v8 → v9 API changes (render loop, `useFrame` signatures, `extend`) | Medium — GalaxyMap and related 3D components |
| `forwardRef` deprecated (still works, no removal yet) | Low — no action required unless TypeScript errors surface |
| Legacy string refs / legacy context | Low — project unlikely to use these |

## Open Questions

- None — requirements are fully captured above.

# Design: Structures UI — Power Display, Type Contrast, Collapsible Summary

## File Plan

| File | Action | Purpose |
|------|--------|---------|
| `web/src/hooks/useEnergyMap.ts` | create | TanStack Query hook: fetches typeId→energy map from Sui RPC, caches in localStorage, exposes `clearCache()` and `formatEnergyDisplay()` |
| `web/src/components/structures/CollapsibleSummary.tsx` | create | Isolated summary card grid with its own localStorage collapse state; receives summary values as props |
| `web/src/pages/MyStructuresPage.tsx` | modify | Consume `useEnergyMap` and `CollapsibleSummary`; replace EnergyIndicator text; fix TypeBadge color |
| `web/src/components/structures/NetworkNodeGroup.tsx` | modify | Fix TypeBadge color |
| `web/src/pages/SettingsPage.tsx` | modify | Add "Energy Data" card with `clearCache()` button |
| `web/src/hooks/useEnergyMap.test.ts` | create | Unit tests: hook cache hit/miss/clearCache/pagination/malformed; `formatEnergyDisplay` pure function |
| `web/src/components/structures/CollapsibleSummary.test.tsx` | create | Component tests: default expanded, toggle hides grid, localStorage persistence |

## Execution Order

1. `useEnergyMap.ts` — no dependencies on other new files; must exist before consumers
2. `CollapsibleSummary.tsx` — no external new dependencies; must exist before `MyStructuresPage` imports it
3. `NetworkNodeGroup.tsx` — standalone TypeBadge color fix, no new dependencies
4. `MyStructuresPage.tsx` — imports `useEnergyMap` and `CollapsibleSummary`; EnergyIndicator text and TypeBadge color changes
5. `SettingsPage.tsx` — imports `useEnergyMap` for `clearCache`
6. `useEnergyMap.test.ts` — written after the hook is stable
7. `CollapsibleSummary.test.tsx` — written after the component is stable

## Data Flow

```
MyStructuresPage mounts
  └─► useEnergyMap()
        ├─ check localStorage['frontier-corm:energy-map']
        │   ├─ HIT  → return parsed Record<string,number> as initial TanStack data
        │   │          queryFn short-circuits; no RPC call; staleTime=Infinity
        │   └─ MISS → TanStack queryFn fires:
        │               1. suiClient.getDynamicFields({ parentId: ASSEMBLY_ENERGY_TABLE_ID, limit: 50 })
        │                  assert hasNextPage === false (table has 19 entries; guard against growth)
        │               2. extract objectIds from each entry
        │               3. suiClient.multiGetObjects({ ids: objectIds, options: { showContent: true } })
        │               4. zip: typeId (entry.name.value as string) + energy (content.fields.value as string→number)
        │               5. write Record<string,number> to localStorage['frontier-corm:energy-map']
        │               6. return map
        └─► energyMap: Map<number,number> (keyed by numeric typeId)

EnergyIndicator render (per structure)
  └─► energyMap.get(structure.typeId) → number | undefined
        ├─ defined  → `⚡ {N} GJ`
        └─ undefined → `⚡ — GJ`
      $connected prop unchanged → styling (color) unchanged

User visits /settings
  └─► SettingsPage mounts → useEnergyMap() returns same TanStack cache (shared QueryClient)
        "Clear energy cache" click
          └─► clearCache()
                ├─ localStorage.removeItem('frontier-corm:energy-map')
                └─ queryClient.removeQueries({ queryKey: ['energy-map'] })
                   (removeQueries, not resetQueries — fully evicts so next useQuery refetches)

User returns to /structures
  └─► useEnergyMap() — cache miss in TanStack + localStorage → fires fresh RPC fetch
```

## Implementation Notes

### `useEnergyMap.ts`

- `ASSEMBLY_ENERGY_TABLE_ID = "0x885c80a9c99b4fd24a0026981cceb73ebdc519b59656adfbbcce0061a87a1ed9"` (constant at top of file)
- localStorage read/write wrapped in try-catch (private browsing mode, quota errors)
- `queryKey: ['energy-map']`; `staleTime: Infinity`; `gcTime: Infinity`
- After `getDynamicFields` returns, check `result.hasNextPage`: if `true`, log `console.warn("useEnergyMap: energy table has more than 50 entries — implement cursor pagination")` and proceed with partial data (do not throw; partial data is better than an error state)
- Hook returns `{ energyMap: Map<number, number>; isLoading: boolean; error: Error | null; clearCache: () => void }`
- `energyMap` is derived from the raw `Record<string, number>` via `useMemo` (keys are strings in JSON; convert to number for lookup)
- `clearCache` uses `useQueryClient()` to call `queryClient.removeQueries({ queryKey: ['energy-map'] })`
- Export `formatEnergyDisplay(typeId: number, energyMap: Map<number, number>): string` — pure function, no React dependency; returns `"⚡ {N} GJ"` for known typeIds, `"⚡ — GJ"` for unknown

### `CollapsibleSummary.tsx`

- Props: `totalCount`, `onlineCount`, `offlineCount`, `nodeCount`, `energyReserved`, `energyMax`, `cormEnabledCount`, `totalSsuCount` (all `number`)
- Manages `collapsed` boolean state, initialised from `localStorage['frontier-corm:structures-summary-collapsed']` (absent → `false`)
- Writes to localStorage on every toggle via try-catch
- Renders: `SummaryHeader` (title + `▾`/`▸` toggle button) and `SummaryBody` (`$open` prop drives `display: flex/none`)
- `SummaryBody` contains the existing six `SummaryCard` elements unchanged
- `data-testid="summary-body"` on `SummaryBody` to enable selector-free test assertions

### TypeBadge color fix

Change `color` from `theme.colors.secondary.accent` (`#7C4DFF`) to `theme.colors.text.primary` (cool white, ~`#F0F4F8`) in both:
- `MyStructuresPage.tsx` ~line 278
- `NetworkNodeGroup.tsx` ~line 164

Do not hardcode `#ffffff` — use the theme token so the fix respects future theme changes.

### Collapsible summary

- New styled component: `SummaryHeader` — flex row, space-between, aligns title text and toggle button
- New styled component: `SummaryToggle` — unstyled button, Unicode arrow `▾` / `▸` (matches `NetworkNodeGroup` pattern)
- New styled component: `SummaryBody` with `$open` prop → `display: ${({ $open }) => $open ? "block" : "none"}`
- localStorage key: `frontier-corm:structures-summary-collapsed` (page-scoped to avoid future collisions)
- Default: `false` (expanded) when key is absent
- Read on mount via try-catch; write on every toggle via try-catch

### SettingsPage "Energy Data" card

Model exactly after the "Tribe Name Cache" card (lines 191–209):
- `CardTitle`: "Energy Data"
- `CardDescription`: "Structure energy costs are fetched from the Sui blockchain and cached locally. Clear the cache to force a fresh fetch on your next visit to the Structures page."
- `ActionButton` (not `DangerButton` — clearing a small cache is not destructive): "Clear energy cache"
- After click: show inline `"Cache cleared."` confirmation (same pattern as tribe cache reload)

## Test File Plan

| Test File | Covers |
|-----------|--------|
| `web/src/hooks/useEnergyMap.test.ts` | Cache hit (no RPC); cache miss (RPC fires, localStorage written); `clearCache` (key removed, query evicted); `hasNextPage` guard (console.warn); malformed RPC response (entry skipped, not NaN); `formatEnergyDisplay` known typeId; `formatEnergyDisplay` unknown typeId |
| `web/src/components/structures/CollapsibleSummary.test.tsx` | Renders summary cards expanded by default (no localStorage key); toggle button hides the summary body; pre-set localStorage key causes initial collapsed state |

**Files with no test coverage requirement:**
- `MyStructuresPage.tsx` — EnergyIndicator text and TypeBadge color changes; display logic delegated to `formatEnergyDisplay` (tested) and `CollapsibleSummary` (tested). No residual logic units.
- `NetworkNodeGroup.tsx` — single-line color change; no logic.
- `SettingsPage.tsx` — button wiring to `clearCache`; covered by `useEnergyMap` tests and manual DoD checklist.

## Risks and Unknowns

1. **Pagination guard** — `getDynamicFields` with `limit: 50` silently drops entries if the table grows beyond 50. The hook must assert `hasNextPage === false` and log a warning (or throw) if the guard fires. Currently 19 entries; safe for now.

2. **`multiGetObjects` content shape** — the Sui SDK types `content` as `SuiParsedData | null`. The path `.fields.value` assumes `dataType: "moveObject"` with a string-encoded u64. A type cast is required; if the shape changes (e.g., after a contract upgrade), energy lookups silently return `undefined` and display `⚡ —`. Acceptable degradation.

3. **TanStack Query deduplication across pages** — both `MyStructuresPage` and `SettingsPage` call `useEnergyMap`. TanStack Query deduplicates on `queryKey: ['energy-map']` within the shared `QueryClient`. `clearCache` in `SettingsPage` calls `queryClient.removeQueries` (not `invalidateQueries`), which fully evicts the in-memory cache so the next mount triggers a real refetch. Using `invalidateQueries` would mark it stale but keep the data in memory — incorrect for this use case.

4. **Theme token verification** — `theme.colors.text.primary` is assumed to be near-white. Confirmed via explorer (`#F0F4F8`), but should be validated visually in the browser before closing the PR.

5. **`useEnergyMap` in `SettingsPage` — hook mount timing** — `SettingsPage` may be the first page a user visits (direct URL). If so, `useEnergyMap` fires the RPC fetch there before the user navigates to Structures. This is acceptable (the data is small and the fetch is cheap), but it means the cache may already be populated when Structures loads. No behavioral issue.

---

## Test Plan

| Test | File | Type | DoD Item |
|------|------|------|----------|
| Returns cached map from localStorage without RPC calls | `useEnergyMap.test.ts` | Unit | Cache hit; no second RPC fetch on refresh |
| Fetches from Sui RPC and writes to localStorage on cache miss | `useEnergyMap.test.ts` | Unit | Cache miss flow; localStorage written |
| `clearCache` removes localStorage key and triggers fresh RPC fetch | `useEnergyMap.test.ts` | Unit | Clear energy cache; re-fetch on next visit |
| Logs console warning when energy table has more pages than fetch limit | `useEnergyMap.test.ts` | Unit | Pagination guard (Risk #1) |
| Skips entries with missing RPC content without producing NaN values | `useEnergyMap.test.ts` | Unit | Malformed response edge case |
| `formatEnergyDisplay` returns `⚡ {N} GJ` for a known typeId | `useEnergyMap.test.ts` | Unit | EnergyIndicator text for connected/unconnected structures |
| `formatEnergyDisplay` returns `⚡ — GJ` for an unknown typeId | `useEnergyMap.test.ts` | Unit | EnergyIndicator fallback for Network Nodes |
| Summary cards are visible by default (no localStorage key) | `CollapsibleSummary.test.tsx` | Component | Summary defaults to expanded on first visit |
| Clicking the toggle button hides the summary cards | `CollapsibleSummary.test.tsx` | Component | Toggle control hides `SummaryGrid` |
| Pre-set localStorage key causes summary to render collapsed | `CollapsibleSummary.test.tsx` | Component | Collapsed/expanded state survives page refresh |
| `TypeBadge` text is legible on purple background | Manual (browser) | UI | Both `MyStructuresPage` and `NetworkNodeGroup` |

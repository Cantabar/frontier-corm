# Testing: Structures UI — Power Display, Type Contrast, Collapsible Summary

## Automated Test Results

| Package | Total | Pass | Fail | Skip |
|---------|-------|------|------|------|
| web | 55 | 55 | 0 | 0 |

## Acceptance Criteria Coverage

| Criterion | Covered by | Status |
|-----------|-----------|--------|
| On first load, queries `assembly_energy` table on Sui testnet | `useEnergyMap` — "fetches from the Sui RPC and writes the result to localStorage on a cache miss" | pass |
| Fetched energy map cached in localStorage indefinitely | `useEnergyMap` — "fetches from the Sui RPC…" (localStorage write assertion) | pass |
| "Connected" text replaced with `⚡ {N} GJ` in both connection states | `formatEnergyDisplay` — "returns '⚡ {N} GJ' for a typeId present in the energy map" | pass |
| No RPC call on subsequent loads (cache hit) | `useEnergyMap` — "returns cached map from localStorage without making any RPC calls" | pass |
| Unknown typeIds display `⚡ — GJ` | `formatEnergyDisplay` — "returns '⚡ — GJ' for a typeId absent from the energy map" | pass |
| Settings "Clear energy cache" removes localStorage key and triggers refetch | `useEnergyMap` — "clearCache removes the localStorage key and triggers a fresh RPC fetch" | pass |
| `hasNextPage` guard logs warning and proceeds with partial data | `useEnergyMap` — "logs a console warning when the energy table has more pages" | pass |
| Malformed RPC entries skipped without NaN | `useEnergyMap` — "skips entries with missing content without producing NaN values" | pass |
| TypeBadge text legible on purple background (NetworkNodeGroup) | Manual — visual check in browser | unchecked |
| TypeBadge text legible on purple background (MyStructuresPage) | Manual — visual check in browser | unchecked |
| Summary body visible by default (no localStorage key) | `CollapsibleSummary` — "renders the summary body visible by default" | pass |
| Toggle button hides summary cards | `CollapsibleSummary` — "hides the summary body after the toggle button is clicked" | pass |
| Collapsed/expanded state survives page refresh | `CollapsibleSummary` — "renders the summary body hidden when localStorage key is pre-set" | pass |

## Manual Testing Checklist

### Power display
1. Navigate to `/structures/:characterId` with structures present
2. Open DevTools → Application → Local Storage — confirm `frontier-corm:energy-map` key is absent before first load
3. Reload the page
Expected result: key is present with 19 entries; structure rows show `⚡ {N} GJ` (e.g. `⚡ 100 GJ` for a Printer, `⚡ 950 GJ` for a Heavy Gate)

4. Check a structure with no entry in the energy map (e.g. a Network Node)
Expected result: displays `⚡ — GJ`

5. Check both a connected structure (energySourceId set) and an unconnected structure
Expected result: both show the same `⚡ {N} GJ` format; EnergyIndicator colour still differs (green vs muted) based on connection state

6. Reload the page a second time; monitor the Network tab
Expected result: no request to the Sui RPC for the energy table (cache hit)

### Clear energy cache
7. Navigate to `/settings`
8. Locate the "Energy Data" card
Expected result: card is present with "Clear energy cache" button

9. Click "Clear energy cache"
Expected result: button label changes to "Cache cleared."

10. Navigate to DevTools → Application → Local Storage — confirm `frontier-corm:energy-map` is gone
11. Navigate back to `/structures/:characterId`
Expected result: Network tab shows a fresh request to the Sui RPC for the energy table; key is re-populated in localStorage

### TypeBadge contrast
12. On the Structures page, inspect a structure type label (e.g. "Storage", "Industry")
Expected result: label text is white/near-white and clearly legible against the purple badge background

13. Expand a Network Node group; inspect the type badge on the node header
Expected result: same white text, same improved contrast

### Collapsible summary
14. Clear localStorage (DevTools → Application → Clear site data) and navigate to `/structures/:characterId`
Expected result: summary cards are visible (expanded by default)

15. Click the collapse toggle (▾)
Expected result: summary cards are hidden; toggle shows ▸

16. Reload the page
Expected result: summary remains collapsed (▸ shown)

17. Click the toggle again (▸ → ▾); reload
Expected result: summary is expanded after reload

## Regression Surface

- `MyStructuresPage` — structure list rendering, filter/sort, group-by-node mode, SSU inventory panel, edit-name flow; none of these were modified
- `NetworkNodeGroup` — energy/fuel bars, connected count, node metadata; only TypeBadge color changed
- `SettingsPage` — tribe cache reload, CORM management, environment config display; new card added, no existing cards changed
- `useNetworkNodes`, `useStructures`, `useIdentity` — not touched

## Type Check

| Package | Result |
|---------|--------|
| web | clean (0 errors) |

## Codex Review

Two blocking issues and five non-blocking findings were identified.

### BLOCKING

**1. `useEnergyMap` called per-row in `StructureRow` — N hook calls for N structures**

`StructureRow` (line 811, `MyStructuresPage.tsx`) calls `useEnergyMap()` individually. With `staleTime: Infinity` TanStack Query deduplicates the underlying network fetch, but each call still runs `useMemo` and creates a fresh `Map<number,number>` per row. On a page with 50 structures that is 50 `useMemo` evaluations and 50 `Map` constructions on every re-render of any row.

The fix is to call `useEnergyMap()` once in the parent `MyStructuresPage` and thread `energyMap` down as a prop to `StructureRow`, exactly as `characterId`, `isOwner`, etc. are already threaded.

**2. `readCache` does an unchecked cast — poisoned localStorage can cause silent bad data**

```ts
return JSON.parse(raw) as Record<string, number>;
```

`JSON.parse` can return any value (array, string, number, null). If another tab or malicious script writes a non-object to `"frontier-corm:energy-map"`, the cast succeeds at the TypeScript level but subsequent `Object.entries(data)` in `useMemo` will still iterate (arrays have `entries`), and `Number.isNaN` guards only NaN, not strings. A minimal guard is needed:

```ts
const parsed = JSON.parse(raw);
if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
return parsed as Record<string, number>;
```

### NON-BLOCKING

**3. `clearCache` not wrapped in `useCallback`** — every `useEnergyMap()` call produces a new reference; inconsistent with how other hooks in the codebase stabilise callbacks.

**4. `CollapsibleSummary` loses the `margin-bottom` that `SummaryGrid` had** — the deleted `SummaryGrid` had `margin-bottom: ${theme.spacing.lg}`; the replacement component has no margin, shrinking the gap between the summary and the filter row below it.

**5. `EnergyIndicator $connected` prop is semantically stale** — the green/muted colour still fires on `!!structure.energySourceId`, but the displayed text is always the on-chain energy cost regardless of connection. A connected structure with a missing on-chain entry shows `⚡ — GJ` in green, which is misleading.

**6. `CollapsibleSummary` toggle aria-label could be state-aware** — `aria-label="Toggle summary"` is static; `collapsed ? "Expand summary" : "Collapse summary"` would be better for screen readers.

**7. `SettingsPage` Energy Data card lacks reset/notification pattern** — the "Cache cleared." label is set permanently for the session and never resets. The adjacent Tribe Cache card uses a `$busy` spinner and a notification push; a consistent pattern would reset the label after a timeout or push a notification.

## Summary

All 55 automated tests pass and the TypeScript type check is clean. The two blocking findings from the code review — per-row `useEnergyMap` calls and an unchecked `JSON.parse` cast in `readCache` — must be addressed before merge. Five non-blocking findings were recorded; the most impactful are the missing `margin-bottom` on `CollapsibleSummary` (visible layout regression) and the semantically stale `$connected` colour on `EnergyIndicator`. The one remaining manual check is the TypeBadge contrast in both `MyStructuresPage` and `NetworkNodeGroup`.

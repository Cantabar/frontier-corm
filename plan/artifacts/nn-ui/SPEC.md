# Spec: Structures UI — Power Display, Type Contrast, Collapsible Summary

## API Contracts

### Sui RPC — `suix_getDynamicFields` (public, Sui testnet)
- **Purpose:** List all entries in the `assembly_energy` table to get (typeId, fieldObjectId) pairs
- **Request:** POST `https://fullnode.testnet.sui.io` (proxied via `/sui-rpc`)
  ```json
  {
    "jsonrpc": "2.0", "id": 1,
    "method": "suix_getDynamicFields",
    "params": ["0x885c80a9c99b4fd24a0026981cceb73ebdc519b59656adfbbcce0061a87a1ed9", null, 50]
  }
  ```
- **Response (200):** `{ result: { data: [{ name: { value: "<typeId>" }, objectId: "<fieldId>" }] } }`
- **Response (error):** RPC error object with `code` and `message`; hook must surface a fetch-failed state
- **Auth:** None — public Sui RPC read
- **Side effects:** None

### Sui RPC — `sui_multiGetObjects` (public, Sui testnet)
- **Purpose:** Resolve fieldObjectIds → energy values
- **Request:** POST `https://fullnode.testnet.sui.io` (proxied via `/sui-rpc`)
  ```json
  {
    "jsonrpc": "2.0", "id": 2,
    "method": "sui_multiGetObjects",
    "params": [["<fieldId>", ...], { "showContent": true }]
  }
  ```
- **Response (200):** Array of objects; each has `.data.content.fields.value` = energy units (string-encoded u64)
- **Response (error):** RPC error object; hook must surface a fetch-failed state
- **Auth:** None — public Sui RPC read
- **Side effects:** None

---

## Data Model Changes

### `localStorage` (web client, new key)

| Key | Value | Owner |
|-----|-------|-------|
| `frontier-corm:energy-map` | JSON-serialised `Record<string, number>` (typeId string → energy units) | `useEnergyMap` hook |
| `frontier-corm:summary-collapsed` | `"true"` \| `"false"` | `MyStructuresPage` |

`frontier-corm:energy-map` is written once after a successful RPC fetch and read on all subsequent loads. It has no TTL. It is cleared only by the user via the Settings page action.

`frontier-corm:summary-collapsed` is written on every toggle and read on mount. Absence defaults to expanded (`false`).

No changes to Postgres, indexer, or any server-side data store.

---

## UI Specification

### Routes / Pages

| Route | Component | Change |
|-------|-----------|--------|
| `/structures/:characterId` | `MyStructuresPage` | Power display, summary collapse, TypeBadge contrast |
| `/settings` | `SettingsPage` | New "Clear energy data cache" action card |

### State Changes

**New hook: `useEnergyMap`** (`web/src/hooks/useEnergyMap.ts`)
- On mount, reads `frontier-corm:energy-map` from localStorage
- If present, returns the cached map immediately (no fetch)
- If absent, fires the two-step Sui RPC sequence; on success, writes to localStorage and returns the map
- Exposes: `energyMap: Map<number, number>`, `isLoading: boolean`, `error: string | null`
- Exposes: `clearCache(): void` — removes `frontier-corm:energy-map` from localStorage and resets hook state to "not loaded"

**`MyStructuresPage` additions:**
- Consumes `useEnergyMap()`
- Adds `summaryCollapsed` state (boolean), initialised from `frontier-corm:summary-collapsed` in localStorage (default `false`)
- On toggle: updates state and writes new value to localStorage

### Component Changes

#### `EnergyIndicator` — `MyStructuresPage.tsx` (line ~1024)

Current:
```tsx
<EnergyIndicator $connected={!!structure.energySourceId}>
  {structure.energySourceId ? "⚡ Connected" : "— No energy"}
</EnergyIndicator>
```

After:
```tsx
<EnergyIndicator $connected={!!structure.energySourceId}>
  {energyMap.has(structure.typeId)
    ? `⚡ ${energyMap.get(structure.typeId)} GJ`
    : "⚡ — GJ"}
</EnergyIndicator>
```

- The `$connected` prop and all associated styling remain unchanged
- Both connection states (connected / not connected) display the same power value derived from typeId lookup
- Structures not present in the energy map (e.g., Network Nodes) display `⚡ —`

#### `TypeBadge` — `MyStructuresPage.tsx` (line ~270) and `NetworkNodeGroup.tsx` (line ~156)

Current:
```tsx
color: ${({ theme }) => theme.colors.secondary.accent};  /* #7C4DFF on #4A2D99 */
```

After:
```tsx
color: #ffffff;
```

Both files define their own `TypeBadge` styled component with identical styling — both must be updated.

#### Summary section — `MyStructuresPage.tsx`

- Wrap the existing `SummaryGrid` in a collapsible container
- Add a header row containing the section title and a chevron toggle button
- When `summaryCollapsed` is `true`, `SummaryGrid` is hidden (`display: none` or unmounted); the header row remains visible
- Chevron icon rotates 180° when collapsed (CSS transform transition)
- No change to the card content or layout within `SummaryGrid`

#### `SettingsPage.tsx` — new cache management card

- Add a new `Card` section titled "Energy Data"
- `CardDescription`: "Energy consumption values are fetched from the Sui blockchain and cached locally. Clear the cache to force a fresh fetch on the next page load."
- `DangerButton` labelled "Clear energy cache" — calls `clearCache()` from `useEnergyMap`
- After clearing, display an inline confirmation message ("Cache cleared. Data will be re-fetched on next visit.")

### Inter-App Messaging

N/A — no postMessage events or cross-iframe communication involved.

---

## Cross-Package Checklist

| Item | Answer |
|------|--------|
| New shared TypeScript types needed | No — `useEnergyMap` returns `Map<number, number>`, internal to `web` |
| New shared UI components needed | No — uses existing `Card`, `DangerButton`, chevron pattern already in `web` |
| Consuming packages to update after shared pkg bump | N/A |
| Auth changes | None — Sui RPC reads are unauthenticated |
| Data passing strategy | Two-step direct Sui RPC fetch (getDynamicFields → multiGetObjects), proxied via `/sui-rpc`; result stored in localStorage |
| Data store decision | `localStorage` — consistent with existing pattern (tribe name cache, location session token); appropriate for rarely-changing public on-chain reference data |
| Background processing | None |

---

## Definition of Done

- [ ] `useEnergyMap` returns a populated `Map<number, number>` after first load; DevTools → Application → Local Storage shows `frontier-corm:energy-map` key with 19 entries
- [ ] Refreshing the page does not trigger a second Sui RPC fetch (Network tab shows no request to the energy table object)
- [ ] Structure cards on `/structures/:characterId` display `⚡ {N} GJ` (e.g., `⚡ 100 GJ`) instead of `⚡ Connected` or `— No energy` for both connected and unconnected structures
- [ ] Structures whose typeId is absent from the energy map display `⚡ — GJ`
- [ ] Settings page has an "Energy Data" card with a "Clear energy cache" button; clicking it removes `frontier-corm:energy-map` from localStorage (confirmed in DevTools); navigating back to Structures triggers a fresh RPC fetch
- [ ] `TypeBadge` text is white (`#ffffff`) in both `MyStructuresPage` and `NetworkNodeGroup` — legible on the purple badge background
- [ ] Summary section has a visible collapse toggle; clicking it hides/shows the `SummaryGrid`
- [ ] Summary defaults to expanded on first visit (no localStorage key present)
- [ ] After collapsing, refreshing the page keeps the summary collapsed; after expanding, refreshing keeps it expanded

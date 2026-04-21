# Discovery: Structures UI — Power Display, Type Contrast, Collapsible Summary

## Problem Statement

The Structures page has three readability and usability gaps: (1) per-structure power consumption is not visible, forcing players to cross-reference game knowledge to understand energy budgets; (2) structure type labels are difficult to read due to low contrast (light purple text on a purple background); (3) the Structures summary cards at the top of the page permanently consume vertical space, which is painful on smaller viewports or when the user wants to focus on the structure list.

## User Story

As a player managing a base, I want to see how much energy each structure consumes, read structure type labels clearly, and collapse the summary panel when I don't need it, so that I can manage my power grid efficiently without visual friction.

## Acceptance Criteria

### Power consumption display
- [ ] On first load, the web app queries the `assembly_energy` table on Sui testnet and fetches the typeId → energy-units map (19 entries, see `plan/on-chain-data.md`)
- [ ] The fetched energy map is cached in `localStorage` indefinitely (no TTL)
- [ ] The "Connected" text label on structure cards/rows is replaced with the structure's power consumption value (e.g., `⚡ 100 GJ`) in **both** the connected-to-node and unconnected states
- [ ] All other details of the connected state (node name, energy bars, etc.) remain unchanged
- [ ] Structures with no entry in the energy map (e.g., Network Nodes, unconfigured types) display a fallback (e.g., `⚡ — GJ`)
- [ ] Settings screen gains a "Clear energy data cache" action that removes the cached energy map from `localStorage`; the next page load re-fetches from chain

### Structure type label contrast
- [ ] The structure type label text color is changed from light purple to white (or equivalent high-contrast light color) so it is legible against its purple badge background

### Collapsible summary
- [ ] The Structures summary card grid has a toggle control (e.g., chevron or collapse button) to show/hide the card grid
- [ ] The summary defaults to **expanded** on first visit
- [ ] The collapsed/expanded state persists in `localStorage` across page visits and refreshes

## Out of Scope

- Fetching energy data from the indexer or adding a server-side cache — client-side `localStorage` is sufficient given the data changes rarely
- Displaying energy consumption in the network node group energy bar or modifying the existing energy budget math
- Modifying power consumption values or the on-chain `EnergyConfig` object
- Responsive/breakpoint-driven auto-collapse of the summary (user controls it manually)

## Package Scope

- [x] `web` — `MyStructuresPage.tsx`, `NetworkNodeGroup.tsx`, Settings page, new `useEnergyMap` hook (Sui RPC fetch + localStorage cache)

## Open Questions

- None — all clarifying questions resolved.

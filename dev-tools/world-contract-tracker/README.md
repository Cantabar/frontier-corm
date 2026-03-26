# World Contract Tracker

Local dev tool that compares on-chain world-contract deployments (Stillness / Utopia) against the [evefrontier/world-contracts](https://github.com/evefrontier/world-contracts) GitHub repo.

## What it shows

- **Per-environment cards** for Stillness and Utopia showing:
  - On-chain version (read from `UpgradeCap` via SUI testnet RPC)
  - Repo version (parsed from `Published.toml`)
  - Status badge: In Sync / Upgrade Pending / Published.toml Stale
  - Package IDs, UpgradeCap links, upgrade policy
  - Recent deploy commits and pending source changes
- **GitHub releases** with changelogs

## Usage

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## How it works

1. Fetches `contracts/world/Published.toml` from GitHub raw
2. Queries SUI testnet JSON-RPC for each environment's `UpgradeCap` object
3. Compares repo version vs on-chain version
4. Fetches GitHub commits and releases to show what changed

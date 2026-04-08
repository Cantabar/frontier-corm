#!/usr/bin/env bash
# Frontier Corm — Start local dev environment against Stillness testnet
#
# Usage:  make local-stillness
#   — or — bash scripts/start-stillness-local.sh
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# ── Prerequisite checks ────────────────────────────────────────────

fail() { echo "ERROR: $1" >&2; exit 1; }

# .env.stillness must exist with populated package IDs
[ -f .env.stillness ] || fail "No .env.stillness found. Run: cp .env.stillness.example .env.stillness && make publish-contracts ENV=stillness"
grep -q '^PACKAGE_TRIBE=0x' .env.stillness || fail ".env.stillness is missing PACKAGE_TRIBE. Run: make publish-contracts ENV=stillness"

# Required CLIs
command -v sui   >/dev/null 2>&1 || fail "'sui' CLI not found. Install: https://docs.sui.io/guides/developer/getting-started/sui-install"
command -v mprocs >/dev/null 2>&1 || fail "'mprocs' not found. Install: cargo install mprocs (or: brew install mprocs)"
command -v docker >/dev/null 2>&1 || fail "'docker' not found."
command -v jq     >/dev/null 2>&1 || fail "'jq' not found."

# Verify Sui CLI is pointed at testnet
ACTIVE_ENV=$(sui client active-env 2>/dev/null || echo "unknown")
if [ "$ACTIVE_ENV" != "testnet" ]; then
  echo "WARNING: Active Sui environment is '$ACTIVE_ENV', expected 'testnet'."
  echo "         Switch with: sui client switch --env testnet"
  read -p "Continue anyway? [y/N] " -r
  [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

ACTIVE_ADDR=$(sui client active-address 2>/dev/null || echo "none")
echo "Sui address: $ACTIVE_ADDR (env: $ACTIVE_ENV)"

# ── Install npm dependencies if needed ─────────────────────────────

for svc in indexer web; do
  if [ ! -d "$svc/node_modules" ]; then
    echo "Installing $svc dependencies..."
    npm --prefix "$svc" ci
  fi
done

# ── Launch ─────────────────────────────────────────────────────────

echo ""
echo "Starting local dev environment against Stillness testnet..."
echo "  Postgres:            localhost:5432"
echo "  Indexer API:         http://localhost:3100"
echo "  Web UI:              http://localhost:5173"
echo "  Continuity Engine:   http://localhost:3300"
echo ""

exec mprocs --config mprocs.stillness.yaml

#!/usr/bin/env bash
set -euo pipefail

# Recover missing shared object IDs from already-published corm_state package.
#
# Use this when publish-contracts.sh succeeded but failed to extract
# COIN_AUTHORITY_OBJECT_ID or CORM_CONFIG_OBJECT_ID.
#
# Usage:
#   ./scripts/recover-object-ids.sh stillness
#   ./scripts/recover-object-ids.sh utopia

VALID_ENVS=("utopia" "stillness")

if [ $# -lt 1 ]; then
  echo "Usage: $0 <environment>"
  echo "  Environments: ${VALID_ENVS[*]}"
  exit 1
fi

ENV="$1"
VALID=false
for e in "${VALID_ENVS[@]}"; do
  if [ "$e" = "$ENV" ]; then VALID=true; break; fi
done
if [ "$VALID" = false ]; then
  echo "ERROR: Invalid environment '$ENV'." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.${ENV}"
SUI_RPC="https://fullnode.testnet.sui.io:443"

write_env_var() {
  local var="$1" val="$2" file="$3"
  if grep -q "^${var}=" "$file" 2>/dev/null; then
    sed -i "s|^${var}=.*|${var}=${val}|" "$file"
  else
    [ -s "$file" ] && [ -n "$(tail -c1 "$file")" ] && echo >> "$file"
    echo "${var}=${val}" >> "$file"
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found." >&2
  exit 1
fi

CORM_STATE_PKG=$(grep '^PACKAGE_CORM_STATE=' "$ENV_FILE" | cut -d= -f2)
if [ -z "$CORM_STATE_PKG" ]; then
  CORM_STATE_PKG=$(grep '^VITE_CORM_STATE_PACKAGE_ID=' "$ENV_FILE" | cut -d= -f2)
fi
if [ -z "$CORM_STATE_PKG" ]; then
  echo "ERROR: No corm_state package ID found in $ENV_FILE." >&2
  exit 1
fi

echo "=== Recovering object IDs for $ENV ==="
echo "corm_state package: $CORM_STATE_PKG"

# ── 1. Find CoinAuthority from the publish transaction ─────────────
echo ""
echo "Looking up CoinAuthority..."
PUBLISH_TX=$(curl -s "$SUI_RPC" -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"sui_getObject\",\"params\":[\"$CORM_STATE_PKG\",{\"showPreviousTransaction\":true}]}" \
  | jq -r '.result.data.previousTransaction')

if [ -z "$PUBLISH_TX" ] || [ "$PUBLISH_TX" = "null" ]; then
  echo "  ERROR: Could not find publish transaction for $CORM_STATE_PKG" >&2
else
  echo "  Publish TX: $PUBLISH_TX"
  TX_RESULT=$(curl -s "$SUI_RPC" -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"sui_getTransactionBlock\",\"params\":[\"$PUBLISH_TX\",{\"showObjectChanges\":true}]}")

  COIN_AUTHORITY_ID=$(echo "$TX_RESULT" | jq -r '(.result.objectChanges // [])[] | select(.type == "created") | select(.objectType | contains("CoinAuthority")) | .objectId // empty')
  if [ -n "$COIN_AUTHORITY_ID" ] && [ "$COIN_AUTHORITY_ID" != "null" ]; then
    echo "  COIN_AUTHORITY_OBJECT_ID=$COIN_AUTHORITY_ID"
    write_env_var "COIN_AUTHORITY_OBJECT_ID" "$COIN_AUTHORITY_ID" "$ENV_FILE"
  else
    echo "  WARNING: CoinAuthority not found in publish transaction." >&2
    echo "  All created objects:" >&2
    echo "$TX_RESULT" | jq -r '(.result.objectChanges // [])[] | select(.type == "created") | "\(.objectId) \(.objectType)"' >&2
  fi
fi

# ── 2. Find CormConfig from owned objects or events ────────────────
echo ""
echo "Looking up CormConfig..."

# Search for CormConfig as a shared object created by any transaction
# involving the corm_state package. Try querying events first.
CORM_CONFIG_ID=""

# Method 1: query for CormConfigCreatedEvent (if the contract emits one)
CORM_CONFIG_ID=$(curl -s "$SUI_RPC" -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"suix_queryEvents\",\"params\":[{\"MoveEventType\":\"${CORM_STATE_PKG}::corm_state::CormConfigCreatedEvent\"},null,1,false]}" \
  | jq -r '.result.data[0].parsedJson.config_id // empty' 2>/dev/null)

if [ -z "$CORM_CONFIG_ID" ] || [ "$CORM_CONFIG_ID" = "null" ]; then
  # Method 2: scan recent transactions from the publisher for CormConfig creation
  PUBLISHER_ADDR=$(sui client active-address 2>/dev/null)
  if [ -n "$PUBLISHER_ADDR" ]; then
    echo "  Scanning recent transactions from $PUBLISHER_ADDR..."
    RECENT_TXS=$(curl -s "$SUI_RPC" -X POST \
      -H 'Content-Type: application/json' \
      -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"suix_queryTransactionBlocks\",\"params\":[{\"filter\":{\"FromAddress\":\"$PUBLISHER_ADDR\"},\"options\":{\"showObjectChanges\":true}},null,20,true]}" \
      | jq -c '.result.data[]')

    while IFS= read -r tx; do
      CONFIG_ID=$(echo "$tx" | jq -r '(.objectChanges // [])[] | select(.type == "created") | select(.objectType | contains("CormConfig")) | .objectId // empty')
      if [ -n "$CONFIG_ID" ] && [ "$CONFIG_ID" != "null" ]; then
        CORM_CONFIG_ID="$CONFIG_ID"
        break
      fi
    done <<< "$RECENT_TXS"
  fi
fi

if [ -n "$CORM_CONFIG_ID" ] && [ "$CORM_CONFIG_ID" != "null" ]; then
  echo "  CORM_CONFIG_OBJECT_ID=$CORM_CONFIG_ID"
  write_env_var "CORM_CONFIG_OBJECT_ID" "$CORM_CONFIG_ID" "$ENV_FILE"
  write_env_var "VITE_CORM_CONFIG_ID" "$CORM_CONFIG_ID" "$ENV_FILE"
else
  echo "  WARNING: CormConfig not found. It may not have been created yet." >&2
  echo "  Run: make publish-contracts ENV=$ENV  (and provide the brain address when prompted)" >&2
fi

# ── 3. Find WitnessRegistry from corm_auth publish transaction ──────
echo ""
echo "Looking up WitnessRegistry..."
CORM_AUTH_PKG=$(grep '^PACKAGE_CORM_AUTH=' "$ENV_FILE" | cut -d= -f2)
if [ -z "$CORM_AUTH_PKG" ]; then
  CORM_AUTH_PKG=$(grep '^VITE_CORM_AUTH_PACKAGE_ID=' "$ENV_FILE" | cut -d= -f2)
fi

if [ -z "$CORM_AUTH_PKG" ]; then
  echo "  WARNING: No corm_auth package ID found. Skipping WitnessRegistry recovery." >&2
else
  AUTH_PUBLISH_TX=$(curl -s "$SUI_RPC" -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"sui_getObject\",\"params\":[\"$CORM_AUTH_PKG\",{\"showPreviousTransaction\":true}]}" \
    | jq -r '.result.data.previousTransaction')

  WITNESS_REGISTRY_ID=""
  if [ -n "$AUTH_PUBLISH_TX" ] && [ "$AUTH_PUBLISH_TX" != "null" ]; then
    echo "  corm_auth publish TX: $AUTH_PUBLISH_TX"
    WITNESS_REGISTRY_ID=$(curl -s "$SUI_RPC" -X POST \
      -H 'Content-Type: application/json' \
      -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"sui_getTransactionBlock\",\"params\":[\"$AUTH_PUBLISH_TX\",{\"showObjectChanges\":true}]}" \
      | jq -r '(.result.objectChanges // [])[] | select(.type == "created") | select(.objectType | contains("WitnessRegistry")) | .objectId // empty')
  fi

  if [ -n "$WITNESS_REGISTRY_ID" ] && [ "$WITNESS_REGISTRY_ID" != "null" ]; then
    echo "  WITNESS_REGISTRY_OBJECT_ID=$WITNESS_REGISTRY_ID"
    write_env_var "WITNESS_REGISTRY_OBJECT_ID" "$WITNESS_REGISTRY_ID" "$ENV_FILE"
  else
    echo "  WARNING: WitnessRegistry not found in corm_auth publish transaction." >&2
  fi
fi

# ── 4. Check CORM_CHARACTER_ID ─────────────────────────────────────
echo ""
EXISTING_CHAR=$(grep '^CORM_CHARACTER_ID=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)
if [ -z "$EXISTING_CHAR" ]; then
  echo "CORM_CHARACTER_ID is not set in $ENV_FILE."
  echo "  This must be set to the brain's on-chain Character object ID."
  echo "  The Character is created when the brain wallet registers with the"
  echo "  world contract. Check the brain wallet's owned objects for a Character."
  echo ""
  read -rp "Enter CORM_CHARACTER_ID (0x..., or press Enter to skip): " CHAR_ID
  if [ -n "$CHAR_ID" ]; then
    write_env_var "CORM_CHARACTER_ID" "$CHAR_ID" "$ENV_FILE"
    echo "  Set CORM_CHARACTER_ID=$CHAR_ID"
  fi
else
  echo "CORM_CHARACTER_ID=$EXISTING_CHAR (already set)"
fi

# ── Summary ────────────────────────────────────────────────────────
echo ""
echo "=== Current state of $ENV_FILE ==="
for var in CORM_STATE_PACKAGE_ID COIN_AUTHORITY_OBJECT_ID CORM_CONFIG_OBJECT_ID WITNESS_REGISTRY_OBJECT_ID WITNESSED_CONTRACTS_PACKAGE_ID CORM_CHARACTER_ID; do
  val=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "(not set)")
  [ -z "$val" ] && val="(empty)"
  echo "  $var=$val"
done

echo ""
echo "After populating all values, redeploy with:"
echo "  make deploy-infra ENV=$ENV"
echo "  make deploy-continuity ENV=$ENV"

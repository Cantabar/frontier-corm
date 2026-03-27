#!/usr/bin/env bash
set -euo pipefail
# DGX Spark — SSH tunnel forwarding model ports 8000/8001 to localhost.
# Waits for both models to be healthy before opening the tunnel.
# Usage:  bash scripts/dgx-tunnel.sh

source "$(dirname "${BASH_SOURCE[0]}")/dgx-common.sh"
dgx_check_ssh

echo "Waiting for Super (port 8000) on $DGX_HOST..."
until dgx_ssh "curl -sf http://localhost:8000/health" 2>/dev/null; do
  sleep 5
done
echo "Super is healthy."

echo "Waiting for Nano (port 8001) on $DGX_HOST..."
until dgx_ssh "curl -sf http://localhost:8001/health" 2>/dev/null; do
  sleep 5
done
echo "Nano is healthy."

echo "Both models healthy — opening SSH tunnel (8000 + 8001)"
ssh "${SSH_OPTS[@]}" -N \
  -L 8000:localhost:8000 \
  -L 8001:localhost:8001 \
  "$DGX_TARGET"

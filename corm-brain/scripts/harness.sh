#!/usr/bin/env bash
# Start the corm-brain test harness (impersonates puzzle-service).
# The harness listens on :3300 by default and provides an interactive CLI
# to send player events and observe corm-brain responses.
#
# Usage:
#   bash scripts/harness.sh
#   HARNESS_PORT=3301 bash scripts/harness.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building harness..."
go build -o ./harness ./cmd/harness/

echo "Starting harness on :${HARNESS_PORT:-3300}"
exec ./harness

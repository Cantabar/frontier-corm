#!/usr/bin/env bash
# Shared helpers for DGX Spark SSH scripts.
# Source this file — do not execute directly.
#
# Provides:
#   DGX_HOST, DGX_USER, DGX_WORK_DIR, DGX_TARGET (user@host)
#   SSH_OPTS  — common ssh/rsync options (BatchMode, keepalive, host-key accept)
#   dgx_ssh() — wrapper: dgx_ssh "remote command"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env if present
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a && . "$PROJECT_ROOT/.env" && set +a
fi

# Validate
: "${DGX_HOST:?DGX_HOST is not set — add it to .env (e.g. DGX_HOST=spark-7440.local)}"
DGX_USER="${DGX_USER:-$USER}"
DGX_WORK_DIR="${DGX_WORK_DIR:-~/frontier-corm}"
DGX_TARGET="$DGX_USER@$DGX_HOST"

# SSH options:
#   BatchMode=yes           — fail immediately if key auth fails (no password prompt)
#   StrictHostKeyChecking=accept-new — auto-accept on first connect, reject changes
#   ServerAliveInterval/CountMax — keepalive (detect dead connections)
SSH_OPTS=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=3
)

dgx_ssh() {
  ssh "${SSH_OPTS[@]}" "$DGX_TARGET" "$@"
}

# Quick connectivity check with a clear error message
dgx_check_ssh() {
  if ! dgx_ssh "true" 2>/dev/null; then
    echo "ERROR: SSH key auth failed for $DGX_TARGET" >&2
    echo "" >&2
    echo "  Fix: copy your SSH key to the DGX Spark:" >&2
    echo "    ssh-copy-id $DGX_TARGET" >&2
    echo "" >&2
    echo "  Then verify:" >&2
    echo "    ssh $DGX_TARGET hostname" >&2
    echo "" >&2
    exit 1
  fi
  echo "SSH connection OK → $DGX_TARGET"
}

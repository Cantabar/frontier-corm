#!/usr/bin/env bash
set -euo pipefail
# DGX Spark — one-shot setup: sync TRT-LLM configs and pull container image.
# Usage:  bash scripts/dgx-setup.sh

source "$(dirname "${BASH_SOURCE[0]}")/dgx-common.sh"
dgx_check_ssh

echo "Creating remote work dir: $DGX_WORK_DIR"
dgx_ssh "mkdir -p $DGX_WORK_DIR/configs"

echo "Syncing TRT-LLM configs..."
rsync -avz -e "ssh ${SSH_OPTS[*]}" \
  "$PROJECT_ROOT/corm-brain/configs/" \
  "$DGX_TARGET:$DGX_WORK_DIR/configs/"

echo "Pulling TRT-LLM image (if not cached)..."
dgx_ssh "docker pull nvcr.io/nvidia/tensorrt-llm/release:1.3.0rc8"

echo "DGX setup complete."

#!/usr/bin/env bash
set -euo pipefail
# DGX Spark — start Nemotron 3 Nano (TRT-LLM, port 8001).
# Usage:  bash scripts/dgx-nano.sh

source "$(dirname "${BASH_SOURCE[0]}")/dgx-common.sh"
dgx_check_ssh

CONTAINER=corm-trtllm-nano

echo "Starting Nemotron 3 Nano on $DGX_HOST..."
dgx_ssh "
  docker rm -f $CONTAINER 2>/dev/null || true
  docker run --name $CONTAINER --rm \\
    --runtime nvidia --gpus all --ipc host \\
    -p 8001:8001 \\
    -v hf-cache:/root/.cache \\
    -v $DGX_WORK_DIR/configs/trtllm-spark-nano.yaml:/data/config-spark-nano.yaml:ro \\
    nvcr.io/nvidia/tensorrt-llm/release:1.3.0rc8 \\
    trtllm-serve nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4 \\
      --host 0.0.0.0 --port 8001 \\
      --max_batch_size 8 \\
      --trust_remote_code \\
      --reasoning_parser nano-v3 \\
      --tool_parser qwen3_coder \\
      --config /data/config-spark-nano.yaml
"

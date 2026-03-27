#!/usr/bin/env bash
set -euo pipefail
# DGX Spark — start Nemotron 3 Super (TRT-LLM, port 8000).
# Usage:  bash scripts/dgx-super.sh

source "$(dirname "${BASH_SOURCE[0]}")/dgx-common.sh"
dgx_check_ssh

CONTAINER=corm-trtllm-super

echo "Starting Nemotron 3 Super on $DGX_HOST..."
dgx_ssh "
  docker rm -f $CONTAINER 2>/dev/null || true
  docker run --name $CONTAINER --rm \\
    --runtime nvidia --gpus all --ipc host \\
    -p 8000:8000 \\
    -v hf-cache:/root/.cache \\
    -v $DGX_WORK_DIR/configs/trtllm-spark.yaml:/data/config-spark.yaml:ro \\
    nvcr.io/nvidia/tensorrt-llm/release:1.3.0rc8 \\
    trtllm-serve nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4 \\
      --host 0.0.0.0 --port 8000 \\
      --max_batch_size 4 \\
      --trust_remote_code \\
      --reasoning_parser nano-v3 \\
      --tool_parser qwen3_coder \\
      --config /data/config-spark.yaml
"

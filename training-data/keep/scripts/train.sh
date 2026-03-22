#!/usr/bin/env bash
set -euo pipefail

#
# train.sh — Fine-tune a local LLM on Eve Frontier Keep lore data.
#
# Prerequisites:
#   - Curated JSONL datasets in ../datasets/
#   - One of: Unsloth (GPU) or llama.cpp (CPU)
#
# Usage:
#   ./train.sh [--backend unsloth|llamacpp] [--model <model_name_or_path>]
#
# Defaults:
#   --backend unsloth
#   --model  unsloth/Phi-3.5-mini-instruct
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATASETS_DIR="${SCRIPT_DIR}/../datasets"
OUTPUT_DIR="${SCRIPT_DIR}/../output"

BACKEND="unsloth"
MODEL="unsloth/Phi-3.5-mini-instruct"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend)
      BACKEND="$2"
      shift 2
      ;;
    --model)
      MODEL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

DATASET="${DATASETS_DIR}/lore-instruct.jsonl"

if [[ ! -f "${DATASET}" ]]; then
  echo "Error: Dataset not found at ${DATASET}"
  echo "Run the curation script first: python ${SCRIPT_DIR}/curate.py"
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"

echo "=== Eve Frontier Keep Lore Fine-Tuning ==="
echo "Backend:  ${BACKEND}"
echo "Model:    ${MODEL}"
echo "Dataset:  ${DATASET}"
echo "Output:   ${OUTPUT_DIR}"
echo ""

case "${BACKEND}" in
  unsloth)
    echo "Starting Unsloth LoRA fine-tuning..."
    python3 - <<'PYTHON_SCRIPT'
import sys
import os

script_dir = os.path.dirname(os.path.abspath("__file__"))
datasets_dir = os.environ.get("DATASETS_DIR", "datasets")
output_dir = os.environ.get("OUTPUT_DIR", "output")
model_name = os.environ.get("MODEL", "unsloth/Phi-3.5-mini-instruct")
dataset_path = os.environ.get("DATASET", "lore-instruct.jsonl")

try:
    from unsloth import FastLanguageModel
    from trl import SFTTrainer
    from transformers import TrainingArguments
    from datasets import load_dataset
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install with: pip install unsloth trl transformers datasets")
    sys.exit(1)

# Load model with 4-bit quantization
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=model_name,
    max_seq_length=2048,
    load_in_4bit=True,
)

# Apply LoRA
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
)

# Load dataset
dataset = load_dataset("json", data_files=dataset_path, split="train")

def format_chat(example):
    """Format ChatML messages into a single training string."""
    text = ""
    for msg in example["messages"]:
        role = msg["role"]
        content = msg["content"]
        text += f"<|{role}|>\n{content}\n"
    text += "<|end|>"
    return {"text": text}

dataset = dataset.map(format_chat)

# Training
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=2048,
    args=TrainingArguments(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=5,
        max_steps=60,
        learning_rate=2e-4,
        fp16=True,
        logging_steps=1,
        output_dir=output_dir,
        seed=42,
    ),
)

print("Training...")
trainer.train()

# Save LoRA adapter
adapter_path = os.path.join(output_dir, "lora-adapter")
model.save_pretrained(adapter_path)
tokenizer.save_pretrained(adapter_path)
print(f"LoRA adapter saved to: {adapter_path}")

# Optionally export to GGUF
gguf_path = os.path.join(output_dir, "model.gguf")
try:
    model.save_pretrained_gguf(gguf_path, tokenizer, quantization_method="q4_k_m")
    print(f"GGUF model saved to: {gguf_path}")
except Exception as e:
    print(f"GGUF export skipped: {e}")
    print("You can manually convert with: python llama.cpp/convert.py")

PYTHON_SCRIPT
    ;;

  llamacpp)
    echo "Starting llama.cpp fine-tuning (CPU)..."
    echo ""
    echo "Note: llama.cpp finetune requires a GGUF model file."
    echo "Provide the path via --model flag."
    echo ""

    if [[ ! -f "${MODEL}" ]]; then
      echo "Error: Model file not found: ${MODEL}"
      echo "Download a GGUF model first, e.g.:"
      echo "  huggingface-cli download TheBloke/Phi-3-mini-4k-instruct-GGUF"
      exit 1
    fi

    # Convert JSONL to plain text for llama.cpp
    TRAIN_TXT="${OUTPUT_DIR}/train.txt"
    python3 -c "
import json, sys
with open('${DATASET}') as f:
    for line in f:
        rec = json.loads(line)
        for msg in rec['messages']:
            print(f'<|{msg[\"role\"]}|>')
            print(msg['content'])
        print('<|end|>')
        print()
" > "${TRAIN_TXT}"

    echo "Converted dataset to: ${TRAIN_TXT}"
    echo "Running llama.cpp finetune..."

    llama-finetune \
      --model-base "${MODEL}" \
      --train-data "${TRAIN_TXT}" \
      --save-every 10 \
      --threads 4 \
      --adam-iter 60 \
      --batch 4 \
      --ctx 2048 \
      --lora-out "${OUTPUT_DIR}/lora-adapter.bin"

    echo "LoRA adapter saved to: ${OUTPUT_DIR}/lora-adapter.bin"
    ;;

  *)
    echo "Unknown backend: ${BACKEND}"
    echo "Supported: unsloth, llamacpp"
    exit 1
    ;;
esac

echo ""
echo "=== Training complete ==="

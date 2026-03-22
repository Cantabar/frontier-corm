# Training Data

This directory contains tools and data for fine-tuning local LLMs on Eve Frontier domain knowledge.

## Directory Structure

```
training-data/
├── AGENTS.md              # Agent instructions for this directory
├── README.md              # This file
└── keep/                  # Data sourced from The Keep (evefrontier.com/en/thekeep)
    ├── scraper/           # Playwright-based web scraper
    │   ├── package.json
    │   ├── keep-urls.json # Manifest of all Keep entry URLs
    │   └── scrape-keep.js # Scraper script
    ├── raw/               # Scraped lore as markdown (one file per entry)
    ├── scripts/
    │   ├── curate.py      # Transforms raw markdown → JSONL datasets
    │   └── train.sh       # Fine-tuning wrapper script
    ├── datasets/          # Curated JSONL training data
    └── output/            # Fine-tuned model artifacts (gitignored)
```

## Workflow

### 1. Scrape lore from The Keep

The Keep is a JS-rendered SPA, so a headless browser (Playwright) is used.

```bash
cd training-data/keep/scraper
npm install
npx playwright install chromium
npm run scrape
```

This produces one markdown file per lore entry in `keep/raw/`, with YAML frontmatter (title, slug, category, source URL, timestamp).

To add new entries, edit `keep-urls.json` and re-run.

### 2. Curate training datasets

```bash
cd training-data/keep/scripts
python3 curate.py
```

Produces two JSONL files in `keep/datasets/`:

- **lore-qa.jsonl** — Template-generated Q&A pairs (2-3 per entry). Questions vary by category (Keepedia → "Explain the concept of…", Stories → "Tell me the story of…", Fragments → "What does the fragment reveal…").
- **lore-instruct.jsonl** — Full lore text as instruct-tuning pairs with a system prompt establishing the Eve Frontier lore expert persona.

Both use the ChatML schema: `{"messages": [{"role": "system"|"user"|"assistant", "content": "..."}]}`

**Terminology note:** The curation script automatically replaces "Organization" with "Tribe" to match Eve Frontier's in-game terminology.

### 3. Fine-tune a local LLM

#### Option A: Unsloth (GPU — recommended)

Requires a CUDA-capable GPU. Unsloth provides fast QLoRA fine-tuning.

```bash
# Install dependencies
pip install unsloth trl transformers datasets

# Run training (defaults to Phi-3.5 Mini)
cd training-data/keep/scripts
./train.sh --backend unsloth --model unsloth/Phi-3.5-mini-instruct
```

#### Option B: llama.cpp (CPU)

For machines without a GPU. Requires a pre-downloaded GGUF model.

```bash
# Download a base model
huggingface-cli download microsoft/Phi-3.5-mini-instruct-GGUF

# Run training
./train.sh --backend llamacpp --model /path/to/phi-3.5-mini-instruct.Q4_K_M.gguf
```

### 4. Use the fine-tuned model

After training, artifacts are saved in `keep/output/`:

- **Unsloth**: `lora-adapter/` (LoRA weights) and optionally `model.gguf` (merged GGUF)
- **llama.cpp**: `lora-adapter.bin`

To run inference with the LoRA adapter:

```bash
# With llama.cpp
llama-cli -m /path/to/base-model.gguf --lora keep/output/lora-adapter.bin \
  -p "<|system|>\nYou are an Eve Frontier lore expert.\n<|user|>\nWhat is the Trinary?\n<|assistant|>\n"
```

## Recommended Base Models

| Use Case | Model | Size |
|---|---|---|
| Best quality (GPU) | Llama 3 8B Instruct | ~4.5 GB (4-bit) |
| Fast iteration (GPU) | Phi-3.5 Mini Instruct | ~2.4 GB (4-bit) |
| CPU-only | Phi-3.5 Mini GGUF Q4_K_M | ~2.4 GB |
| Minimal resources | Qwen2.5 1.5B Instruct | ~1 GB (4-bit) |

## Notes

- Lore content is copyrighted by CCP Games. Scraped data is for personal/research fine-tuning only.
- The `raw/`, `datasets/`, and `output/` directories contain generated artifacts and should be gitignored.
- The scraper is re-runnable; new Keep entries can be added to `keep-urls.json`.

#!/usr/bin/env python3
"""
curate.py

Reads raw scraped markdown files from training-data/keep/raw/ and produces
fine-tuning datasets in ChatML / OpenAI JSONL format.

Outputs:
  - training-data/keep/datasets/lore-qa.jsonl      (Q&A pairs)
  - training-data/keep/datasets/lore-instruct.jsonl (instruct pairs)

Usage:
  python curate.py
"""

import json
import os
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
KEEP_DIR = SCRIPT_DIR.parent
RAW_DIR = KEEP_DIR / "raw"
DATASETS_DIR = KEEP_DIR / "datasets"

SYSTEM_PROMPT = (
    "You are a knowledgeable lore expert for Eve Frontier, "
    "a space survival simulation set in a post-collapse future. "
    "Answer questions about the Frontier's history, factions, technology, "
    "and lore accurately and in-character."
)

# Terminology normalization: "Organization" -> "Tribe" per project convention
TERM_REPLACEMENTS = {
    "Organization": "Tribe",
    "organization": "tribe",
    "Organizations": "Tribes",
    "organizations": "tribes",
}


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Extract YAML-like frontmatter and body from a markdown file."""
    meta = {}
    body = text

    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            for line in parts[1].strip().split("\n"):
                if ":" in line:
                    key, val = line.split(":", 1)
                    meta[key.strip()] = val.strip().strip('"')
            body = parts[2].strip()

    return meta, body


def normalize_terms(text: str) -> str:
    """Apply terminology replacements."""
    for old, new in TERM_REPLACEMENTS.items():
        text = text.replace(old, new)
    return text


def slug_to_title(slug: str) -> str:
    """Convert a slug like 'the-ferals' to 'The Ferals'."""
    return slug.replace("-", " ").title()


def generate_qa_pairs(meta: dict, body: str) -> list[dict]:
    """
    Generate Q&A training pairs from a lore entry.
    Uses template-based heuristics per category.
    """
    title = meta.get("title", slug_to_title(meta.get("slug", "unknown")))
    category = meta.get("category", "unknown")
    pairs = []

    # Truncate very long bodies for Q&A context
    body_excerpt = body[:3000] if len(body) > 3000 else body

    # -- General "what is" question --
    pairs.append({
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"What is {title} in Eve Frontier?"},
            {"role": "assistant", "content": body_excerpt},
        ]
    })

    # -- Category-specific questions --
    if category == "keepedia":
        pairs.append({
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Explain the concept of {title} in the Frontier universe."},
                {"role": "assistant", "content": body_excerpt},
            ]
        })
    elif category == "stories":
        pairs.append({
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Tell me the story of {title} from the Frontier."},
                {"role": "assistant", "content": body_excerpt},
            ]
        })
    elif category == "fragments":
        pairs.append({
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"What does the fragment '{title}' reveal about the Frontier?"},
                {"role": "assistant", "content": body_excerpt},
            ]
        })

    # -- Summary question --
    if len(body) > 200:
        pairs.append({
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Give me a brief overview of {title}."},
                {"role": "assistant", "content": body_excerpt},
            ]
        })

    return pairs


def generate_instruct_pairs(meta: dict, body: str) -> list[dict]:
    """
    Generate instruct-tuning pairs (system prompt + full lore text).
    """
    title = meta.get("title", slug_to_title(meta.get("slug", "unknown")))

    return [{
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Provide the full lore entry for {title}.",
            },
            {"role": "assistant", "content": body},
        ]
    }]


def write_jsonl(path: Path, records: list[dict]):
    """Write records as JSONL."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


def main():
    if not RAW_DIR.exists():
        print(f"Error: Raw data directory not found: {RAW_DIR}", file=sys.stderr)
        print("Run the scraper first: cd ../scraper && npm run scrape", file=sys.stderr)
        sys.exit(1)

    md_files = sorted(RAW_DIR.glob("*.md"))
    if not md_files:
        print(f"Error: No .md files found in {RAW_DIR}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(md_files)} raw lore files.")

    qa_records = []
    instruct_records = []

    for md_file in md_files:
        print(f"  Processing: {md_file.name}")
        raw_text = md_file.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(raw_text)

        # Apply terminology normalization
        body = normalize_terms(body)

        if len(body.strip()) < 50:
            print(f"    ⚠ Skipping (body too short: {len(body.strip())} chars)")
            continue

        qa_records.extend(generate_qa_pairs(meta, body))
        instruct_records.extend(generate_instruct_pairs(meta, body))

    # Write datasets
    qa_path = DATASETS_DIR / "lore-qa.jsonl"
    instruct_path = DATASETS_DIR / "lore-instruct.jsonl"

    write_jsonl(qa_path, qa_records)
    write_jsonl(instruct_path, instruct_records)

    print(f"\nDatasets written:")
    print(f"  Q&A pairs:     {qa_path} ({len(qa_records)} records)")
    print(f"  Instruct pairs: {instruct_path} ({len(instruct_records)} records)")


if __name__ == "__main__":
    main()

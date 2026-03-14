"""
EVE Frontier structure/smart-assembly icon extractor.

Extracts pre-rendered SOF icons (128 px PNGs) for all published Deployable
(category 22) types from the game client.  These icons use the graphicID →
graphicids.json → iconInfo.folder pipeline, NOT the standard iconID pipeline
handled by extract_icons.py.

Output files follow the same naming convention as the item icon extractor:
    type-{typeID}.png

Special cases:
  - Mini Turret (graphicID 28243) and Heavy Turret (28245) have no pre-rendered
    icons.  The mid-size Turret icon (graphicID 28244) is used as a fallback.
  - Construction-site duplicates (group 5021) share graphicIDs with their
    active counterparts and are extracted the same way.

Example usage:
    python3 extract_structure_icons.py \
        --output="/path/to/static-data/data/icons" \
        --eve="/media/djones/Games/CCP/EVE Frontier" \
        --phobos="/path/to/static-data/data/phobos"
"""

import argparse
import json
import os
import shutil
from pathlib import Path


# graphicIDs that lack pre-rendered icons → fallback graphicID
GRAPHIC_ID_FALLBACKS = {
    28243: 28244,  # Mini Turret  → Turret
    28245: 28244,  # Heavy Turret → Turret
}

DEPLOYABLE_CATEGORY_ID = 22


def parse_json(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_resfile_index(index_path: str) -> dict[str, str]:
    """Parse resfileindex.txt into a dict of virtual_path → physical_subpath."""
    mapping: dict[str, str] = {}
    with open(index_path, encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split(",")
            if len(parts) >= 2:
                mapping[parts[0]] = parts[1]
    return mapping


def main():
    parser = argparse.ArgumentParser(
        description="Extract EVE Frontier structure icon files from the game client."
    )
    parser.add_argument("-e", "--eve", required=True, help="Path to EVE client folder")
    parser.add_argument("-p", "--phobos", required=True, help="Phobos JSON folder")
    parser.add_argument("-o", "--output", required=True, help="Output folder for icons")
    parser.add_argument(
        "-s", "--server", default="stillness",
        help='Server name for resfileindex.txt (default: "stillness")',
    )
    args = parser.parse_args()

    path_eve = os.path.expanduser(args.eve)
    path_phobos = os.path.expanduser(args.phobos)
    path_output = os.path.expanduser(args.output)
    path_res = os.path.join(path_eve, "ResFiles")

    # -- Load static data --
    types_json = parse_json(os.path.join(path_phobos, "fsd_built", "types.json"))
    groups_json = parse_json(os.path.join(path_phobos, "fsd_built", "groups.json"))
    graphic_ids_json = parse_json(
        os.path.join(path_phobos, "fsd_built", "graphicids.json")
    )

    # -- Identify deployable types --
    deployable_types: list[tuple[int, int]] = []  # (typeID, graphicID)
    for type_id_str, tdata in types_json.items():
        if not tdata.get("published"):
            continue
        group_id = tdata.get("groupID")
        if group_id is None:
            continue
        group = groups_json.get(str(group_id), {})
        if group.get("categoryID") != DEPLOYABLE_CATEGORY_ID:
            continue
        graphic_id = tdata.get("graphicID")
        if graphic_id is None:
            continue
        deployable_types.append((int(type_id_str), int(graphic_id)))

    print(f"Found {len(deployable_types)} published deployable types")

    # -- Resolve graphicID → SOF icon virtual path --
    # Pattern: {iconInfo.folder}/{graphicID}_128.png
    # Multiple types can share the same graphicID (turret fallback,
    # construction-site duplicates), so map vpath → list of typeIDs.
    targets: dict[str, list[int]] = {}  # virtual_path (lowered) → [typeID, ...]

    for type_id, graphic_id in deployable_types:
        effective_gid = GRAPHIC_ID_FALLBACKS.get(graphic_id, graphic_id)
        gfx = graphic_ids_json.get(str(effective_gid), {})
        folder = gfx.get("iconInfo", {}).get("folder")
        if not folder:
            print(f"  SKIP type {type_id}: graphicID {effective_gid} has no iconInfo.folder")
            continue
        vpath = f"{folder}/{effective_gid}_128.png".lower()
        targets.setdefault(vpath, []).append(type_id)

    total_types = sum(len(ids) for ids in targets.values())
    print(f"Expecting {total_types} icons from {len(targets)} unique source images")

    # -- Parse resfileindex and copy matching icons --
    resfile_index_path = os.path.join(path_eve, args.server, "resfileindex.txt")
    resindex = build_resfile_index(resfile_index_path)

    Path(path_output).mkdir(parents=True, exist_ok=True)

    copied = 0
    for vpath, type_ids in targets.items():
        physical = resindex.get(vpath)
        if not physical:
            print(f"  MISS {vpath} (types {type_ids})")
            continue
        src = os.path.join(path_res, *physical.split("/"))
        if not os.path.isfile(src):
            print(f"  FILE NOT FOUND {src}")
            continue
        for type_id in type_ids:
            dst = os.path.join(path_output, f"type-{type_id}.png")
            shutil.copy(src, dst)
            copied += 1
            print(f"  OK type-{type_id}.png ← {vpath}")

    print(f"\nDone! Copied {copied} structure icon(s) to {path_output}")


if __name__ == "__main__":
    main()

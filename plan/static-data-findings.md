# Static Data Findings

## Overview
The EVE Frontier static data lives in `static-data/data/phobos/`, extracted via the
[Phobos](https://github.com/pyfa-org/Phobos) project from the game client.

Key files:
- `fsd_built/types.json` — all item types (typeID, typeName, graphicID, iconID, groupID, …)
- `fsd_built/industry_blueprints.json` — 221 blueprints (inputs, outputs, runTime)
- `fsd_built/graphicids.json` — graphic metadata (SOF hull names, icon folder paths)
- `fsd_built/iconids.json` — standard icon file mappings (iconID → `res:/ui/texture/icons/…`)

## Icon Extraction

### Two icon pipelines
Items in `types.json` reference icons via **two different systems**:

1. **Standard icons** (`iconID` field) — most modules, materials, ammo, etc.
   - `iconID` → `iconids.json` → `iconFile` path (e.g. `res:/ui/texture/icons/5_64_11.png`)
   - Extracted by `static-data/working-dir/extract_icons.py`

2. **SOF render icons** (`graphicID` field) — ships and vehicles with 3D models.
   - `graphicID` → `graphicids.json` → `iconInfo.folder` path
     (e.g. `res:/dx9/model/SpaceObjectFactory/icons/data_frig_mine_01`)
   - Pre-rendered PNGs exist at `{folder}/{graphicID}_{size}.png` (sizes: 64, 128, 512)
   - These are **not** extracted by the existing `extract_icons.py` script, which only
     handles `iconID`-based lookups.

### Extraction from game client
Both pipelines resolve to files inside the game client's `ResFiles` directory. The
`resfileindex.txt` maps virtual resource paths to physical file locations:

```
Game client:   /media/djones/Games/CCP/EVE Frontier/
ResFiles:      /media/djones/Games/CCP/EVE Frontier/ResFiles/
Index:         /media/djones/Games/CCP/EVE Frontier/stillness/resfileindex.txt
```

Format of resfileindex.txt:
```
<virtual_path>,<physical_subpath>,<hash>,<size1>,<size2>
```

Physical file = `ResFiles/<physical_subpath>`

## Ship & Vehicle Type Mapping

### Frontier-specific ships (craftable from frames)

| typeID | Name    | Frame Used                  | graphicID | SOF Hull              |
|--------|---------|-----------------------------|-----------|-----------------------|
| 81609  | USV     | Archangel Protocol Frame    | 27372     | data_frig_mine_01     |
| 81611  | Chumaq  | Equilibrium Program Frame   | 27370     | trad_bcr_haul_01      |
| 81808  | TADES   | Apocalypse Protocol Frame   | 27401     | data_dest_assa_01     |
| 81904  | MCF     | Exterminata Protocol Frame  | 27373     | data_frig_heavy_01    |
| 82424  | HAF     | Exterminata Protocol Frame  | 27377     | data_frig_assa_01     |
| 82425  | LAI     | Exterminata Protocol Frame  | 27407     | data_frig_light_01    |
| 82426  | LORHA   | Bastion Program Frame       | 27375     | data_frig_haul_01     |
| 82430  | MAUL    | Apocalypse Protocol Frame   | 27405     | data_cr_assa_01       |
| 85156  | Forager | (no blueprint)              | 28005     | syn_corv_mine_01      |
| 87698  | Wend    | Nomad Program Frame         | 28382     | data_kayak_01         |
| 87846  | Recurve | Nomad Program Frame         | 28380     | data_longbow_01       |
| 87847  | Reflex  | Nomad Program Frame         | 28320     | data_shortbow_01      |
| 87848  | Reiver  | Nomad Program Frame         | 26977     | ship_data_corv_01     |
| 91106  | Stride  | Nomad Program Frame         | 28931     | trad_corv_01          |
| 91107  | Carom   | Nomad Program Frame         | 28934     | trad_corv_02          |

### Starter ships (already had icons)

| typeID | Name      |
|--------|-----------|
| 77728  | Sophrogon |
| 77753  | Embark    |

### Ship frames (already had icons)

| typeID | Name                        | Blueprint inputs                               |
|--------|-----------------------------|------------------------------------------------|
| 78416  | Apocalypse Protocol Frame   | Still Knot ×1, Echo Chamber ×1, Kerogen Tar ×128 |
| 78417  | Bastion Program Frame       | Still Knot ×1, Echo Chamber ×1, Kerogen Tar ×38  |
| 78418  | Nomad Program Frame         | Fossilized Exotronics ×5                         |
| 78420  | Archangel Protocol Frame    | Still Knot ×1, Echo Chamber ×1, Kerogen Tar ×38  |
| 78421  | Exterminata Protocol Frame  | Still Knot ×1, Echo Chamber ×1, Kerogen Tar ×38  |
| 78422  | Equilibrium Program Frame   | Still Knot ×1, Echo Chamber ×1, Aromatic Carbon Weave ×1347 |

### Shells (craftable from frames, already had icons)

| typeID | Name             | Frame Used                  |
|--------|------------------|-----------------------------|
| 91749  | Reaping Shell    | Exterminata Protocol Frame  |
| 91967  | Aggressive Shell | Nomad Program Frame         |
| 91968  | Rugged Shell     | Apocalypse Protocol Frame   |

## Giveitem Helper Coverage
After this update, `dev-tools/giveitem-helper/public/items.json` contains 114 items
covering all blueprint inputs/outputs plus ships. Icons are stored in
`dev-tools/giveitem-helper/public/icons/` and sourced from `static-data/data/icons/`.

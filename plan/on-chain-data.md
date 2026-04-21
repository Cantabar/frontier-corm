# On-Chain Data

This document describes game data that lives on Sui rather than in the Phobos-extracted
static files in `static-data/data/phobos/fsd_built/`. For each dataset, the source
object and how to query it are noted.

---

## Energy (Power) Requirements

### Source

| Field | Value |
|---|---|
| Contract | `world::energy` |
| World package | `0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75` |
| `EnergyConfig` object | `0x9285364e8104c04380d9cc4a001bbdfc81a554aad441c2909c2d3bd52a0c9c62` |
| `assembly_energy` table | `0x885c80a9c99b4fd24a0026981cceb73ebdc519b59656adfbbcce0061a87a1ed9` |
| Network | Sui testnet (Utopia) |

### What it is

`EnergyConfig` holds `assembly_energy: Table<u64, u64>` — a map from structure type ID
to the energy units that structure consumes when online. This is the authoritative source;
the Phobos static data does not contain consumption values (only `powerOutput` on the
Network Node, which appears to be an unused data point).

A structure can only be brought online if the Network Node supplying its grid has
sufficient available energy (`current_energy_production - total_reserved_energy`).
Network Nodes produce a fixed 1000 energy units when online.

### How to query

```bash
# Read all entries from the assembly_energy table
curl -s -X POST https://fullnode.testnet.sui.io:443 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0","id":1,
    "method":"suix_getDynamicFields",
    "params":["0x885c80a9c99b4fd24a0026981cceb73ebdc519b59656adfbbcce0061a87a1ed9", null, 50]
  }'
# Each entry: { name: { value: "<typeId>" }, objectId: "<fieldId>" }
# Then sui_multiGetObjects on the fieldIds to get .content.fields.value (the energy cost)
```

### Energy requirements by structure (as of 2026-04-21)

19 structures are configured. Structures not listed (Refuge, Field Refinery, Field Printer,
Field Storage, Mini Gate) either produce energy, are free to run, or are not yet configured.

#### Industry

| typeID | Name          | Energy |
|--------|---------------|--------|
| 87119  | Mini Printer  | 50     |
| 88067  | Printer       | 100    |
| 87120  | Heavy Printer | 250    |
| 88063  | Refinery      | 100    |
| 88064  | Heavy Refinery| 200    |
| 88069  | Mini Berth    | 100    |
| 88070  | Berth         | 200    |
| 88071  | Heavy Berth   | 300    |
| 88068  | Assembler     | 200    |
| 90184  | Relay         | 1      |
| 91978  | Nursery       | 100    |

#### Storage

| typeID | Name          | Energy |
|--------|---------------|--------|
| 88082  | Mini Storage  | 50     |
| 88083  | Storage       | 100    |
| 77917  | Heavy Storage | 500    |

#### Gates

| typeID | Name       | Energy |
|--------|------------|--------|
| 84955  | Heavy Gate | 950    |

#### Defense

| typeID | Name         | Energy |
|--------|--------------|--------|
| 84556  | Smart Turret | 10     |
| 92279  | Mini Turret  | 10     |
| 92401  | Turret       | 20     |
| 92404  | Heavy Turret | 40     |

**Note on Smart Turret (84556):** This type is not present in the Phobos static data
(not in `types.json`) but does appear in the World API
(`/v2/types/84556` → "Smart Turret", categoryName "Deployable", groupName "Defense").
It is likely an internal or pre-release type.

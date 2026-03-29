# Puzzle Service

## Overview

The puzzle service is the player-facing game server for Frontier Corm's Continuity Engine. It serves an HTMX-driven UI where players interact with a corm through three phases: awakening (Phase 0), cryptographic word puzzles (Phase 1), and trustless contracts (Phase 2). It acts as a bidirectional relay between players' browsers and the corm-brain AI backend.

## Architecture

```
Browser (HTMX)                   puzzle-service                    corm-brain
┌───────────────┐   HTTP/SSE    ┌─────────────────────┐   WS     ┌──────────┐
│  Phase 0 UI   │ ◄──────────► │  Handlers           │ ◄──────► │  AI      │
│  Puzzle Grid  │               │    ├─ Phase0        │          │  Engine  │
│  Contracts    │               │    ├─ Puzzle        │          └──────────┘
│  Log Stream   │               │    ├─ Contracts     │
└───────────────┘               │    └─ Stream (SSE)  │
                                ├─────────────────────┤
                                │  Session Store      │
                                │    └─ In-memory map │
                                ├─────────────────────┤
                                │  Corm Relay         │
                                │    ├─ WS hub        │
                                │    └─ Event buffer  │
                                └─────────────────────┘
```

### Key Components

- **Session Store** (`internal/puzzle`) — in-memory concurrent map of player sessions. Each session tracks phase, puzzle state (grid, cipher params, target word, decrypted/garbled cells), AI hint state, click logs, stability/corruption meters, and a corm event ring buffer.
- **Corm Relay** (`internal/corm`) — WebSocket hub that accepts connections from corm-brain. Broadcasts player events to all connected brains and dispatches corm actions (log streams, difficulty adjustments, hint toggles, state syncs) back to the target session's action channel.
- **Handlers** (`internal/handlers`) — HTTP handlers for each game interaction, returning HTMX partial HTML fragments.
- **Puzzle Generator** (`internal/puzzle`) — creates cipher grids with configurable difficulty (grid size, cipher complexity, trap density), places a target word, and generates cipher parameters.

### Game Phases

- **Phase 0 (Awakening)** — player clicks UI elements; after a random threshold (3–5 clicks) the corm "awakens" and transitions to Phase 1.
- **Phase 1 (Puzzle)** — player decrypts cells in a cipher grid to find a hidden word. AI controls hint systems (heatmap, vectors, decode, signal) and adjusts difficulty dynamically. Trap cells can garble regions.
- **Phase 2 (Contracts)** — player interacts with on-chain trustless contracts through the corm.

## Tech Stack

- **Language:** Go
- **UI Framework:** HTMX + server-rendered HTML templates (`html/template`)
- **Transport:** HTTP (handlers) + SSE (log streaming) + WebSocket (corm relay)
- **Assets:** Embedded via `go:embed` (templates in `internal/templates/`, static files in `static/`)

## Configuration

- `PUZZLE_PORT` — HTTP listen port (default: 3300)

## API / Interface

### Player-facing (HTMX)

- `GET /health` — health check
- `GET /phase0` — Phase 0 awakening page
- `POST /phase0/interact` — record Phase 0 click, returns updated UI fragment
- `GET /puzzle` — Phase 1 puzzle page (generates new puzzle if needed)
- `POST /puzzle/decrypt` — decrypt a cell, returns updated grid fragment
- `POST /puzzle/submit` — submit a word guess
- `GET /puzzle/grid` — re-render current grid state
- `GET /contracts` — Phase 2 contracts page
- `GET /stream` — SSE endpoint for real-time corm log entries
- `GET /status` — current session status (phase, meters, hints)

### Corm-brain facing

- `WS /corm/ws` — WebSocket for bidirectional event/action relay
- `GET /corm/events?session_id=X` — HTTP fallback: poll buffered events for a session
- `POST /corm/action` — HTTP fallback: deliver a corm action to a session

## Data Model

All state is in-memory (no persistent storage). Key structures:

- **Session** — player address, context (browser/SSU), phase, puzzle state, hint state, click log, event buffer, action channel, stability/corruption meters
- **Grid** — 2D cell array with cipher text, plaintext, cell type (normal/trap/target), trap radius
- **CormEvent** — player event envelope (session ID, player address, event type, payload, significance, sequence number)
- **CormAction** — corm-brain command (action type, session ID, payload: log stream, difficulty mod, hint toggle, state sync, guided hint)

## Deployment

- **Local:** built and run via `mprocs.yaml` (`go build -o ./puzzle-service .`)
- **Production:** Dockerfile present for containerized deployment
- Stateless (sessions lost on restart) — designed for single-instance use per environment

## Open Questions / Future Work

- Session persistence (Redis or Postgres) for multi-instance deployment
- SSU context integration (in-game Smart Storage Unit iframe embedding)
- Puzzle variety beyond cipher grids

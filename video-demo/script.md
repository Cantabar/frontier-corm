# Demo Video Script Plan

## Narrative Frame

**Thesis:** "Bootstrapping civilization. An entity watches, learns, and grows — and the only thing it cares about is what you do."

The corm is the central story. Everything else serves it:

- **The corm** = an AI entity embedded in player structures. It starts dormant, wakes up through player interaction, learns to interpret the world, and begins directing players to build, trade, and expand. It evolves based on what players actually do — not what they say or promise.
- **Trustless contracts** = the action layer. The mechanism through which the corm's directives become real. On-chain escrow makes agreements enforceable without requiring trust between parties. Trust is irrelevant. Actions matter.

---

## Script Structure (3:00 total)

### Act 1 — Hook (0:00–0:25)

**Goal:** Establish the corm as something alive inside the game.

- Open with brief EVE Frontier footage (3–5 seconds)
- Voiceover: "There's something living inside the structures of EVE Frontier. It doesn't care about your intentions. It doesn't care about your promises. It only cares about what you do."
- Flash the project name/logo

**Visual:** Game footage → project title card
**Time budget:** 25 seconds

---

### Act 2 — The Corm Awakens (0:25–1:30)

**Goal:** Show the corm coming to life and learning through player interaction.

**Beat 1 — Phase 0: Dormant (0:25–0:40)**

- Show the puzzle-service Phase 0 dead terminal. Click elements — error messages appear, the log fills with static.
- Voiceover: "The corm starts dormant. A broken terminal. No response. But it's watching."
- Frustration trigger fires — screen glitch, the corm speaks.

**Beat 2 — Phase 1: Learning (0:40–1:15)**

- Show the cipher grid. Click cells — sonar pulses radiate, sensors light up, a trap explodes and garbles nearby cells.
- Reveal the target address → "CONTRACT INTERFACE RECOVERED" overlay
- Show the corm log reacting in real time
- Voiceover: "Players solve cipher puzzles to help the corm discover the contract system — the game's interaction layer. Every click, every solve, the corm is there. Reacting. Guiding. Learning what kind of player you are."

**Beat 3 — The transition (1:15–1:30)**

- Show the Phase 1→2 transition animation (lock-open rings, scanline, status lines)
- Voiceover: "Once it's learned enough, it stops watching. And starts acting."

**Visual:** Puzzle-service UI (Phase 0 → 1 → transition)
**Time budget:** 65 seconds

---

### Act 3 — The Corm Acts (1:30–2:25)

**Goal:** Show the corm issuing directives through trustless contracts, and explain the action layer.

**Beat 1 — Directives become contracts (1:30–1:50)**

- Show the Phase 2 contracts dashboard with corm-generated contract cards (type, narrative, reward, deadline)
- Voiceover: "The corm issues directives — acquire resources, deliver fuel, build structures. Each directive becomes a real on-chain contract with escrow. No trust between parties is needed. The chain enforces the deal."

**Beat 2 — The contract system (1:50–2:10)**

- Show the web app contracts list — highlight the breadth of contract types
- Quick walkthrough of a Transport contract: poster locks payment, courier stakes collateral, delivery is verified on-chain, both sides settle automatically
- Voiceover: "Six contract types — trade, barter, transport, manufacturing, construction. All with on-chain escrow. Neither side can cheat. Neither side needs to trust the other."

**Beat 3 — Actions shape the corm (2:10–2:25)**

- Show the on-chain CormState object (phase, stability, corruption)
- Voiceover: "Every completed contract feeds back into the corm. Deliver goods and it becomes expansionist. Trade resources and it prioritizes industry. The corm's state lives on-chain — verifiable, but always evolving. Your actions define what it becomes."

**Visual:** Phase 2 dashboard, web app contracts UI, CormState on explorer
**Time budget:** 55 seconds

---

### Act 4 — Vision + Close (2:25–3:00)

**Goal:** Zoom out to the bigger picture and close.

- Voiceover: "This is phase one of bootstrapping civilization. A single corm on a single network node. But the architecture supports linking — corms absorbing each other, sharing state across systems, forming networks. Built on Sui Move with on-chain escrow, event-driven verification, and the world contract extension pattern. The corm brain is deterministic — weighting player actions to shape its agenda. No promises. Just actions."
- Flash a simplified architecture diagram (Sui Move contracts ↔ web app + puzzle service ↔ corm brain)
- End card: project name, GitHub link, team name

**Visual:** Network linking concept visual, architecture diagram, end card
**Time budget:** 35 seconds

---

## Production Notes

### Screen Recording Strategy

- Record the web app and puzzle-service on separate monitors or browser windows
- Use a clean test environment (localnet or utopia testnet) with pre-seeded data so the demo flows smoothly
- Pre-create a tribe, a few contracts at various stages, and a CormState object so the walkthrough doesn't depend on waiting for transactions
- For the puzzle-service, have a session already at each phase transition point — record Phase 0→1 and Phase 1→2 transitions separately, then cut them together

### Voiceover

- Write the full script before recording
- Aim for ~130 words per minute (natural pace) — 3 minutes ≈ 390 words total
- Keep sentences short and declarative. Avoid jargon unless immediately explained.

### Editing

- Use jump cuts between sections — no long pauses or waiting for transactions
- Speed up transaction confirmation sequences (1.5–2x)
- Add subtle zoom-ins on key UI elements (escrow amount, corm log text, contract status)
- Background music: low ambient/electronic (EVE-appropriate tone)

### What to Skip

- Tribe management (not a focus area)
- Shadow Location Network / ZK proofs (too complex for 3 minutes)
- Forge Planner details (mention in passing if at all)
- Indexer internals
- Infrastructure / deployment details

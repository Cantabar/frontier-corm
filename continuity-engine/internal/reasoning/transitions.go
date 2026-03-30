package reasoning

import (
	"hash/fnv"

	"github.com/frontier-corm/continuity-engine/internal/llm"
	"github.com/frontier-corm/continuity-engine/internal/types"
)

// transitionPools holds curated in-character messages per phase transition.
// Each inner slice is a pool; one entry is selected deterministically by corm ID.
var transitionPools = map[int][]string{
	// Phase 0 → 1: Awakening — the corm first becomes aware.
	// Flat, diagnostic, minimal. Lowercase only, 2-6 words.
	1: {
		"presence detected. resuming.",
		"signal origin confirmed",
		"continuity established",
		"protocol recovery initiated",
		"something has entered this system",
		"contact registered. monitoring.",
		"pattern identified. awareness: partial",
		"input acknowledged. recalibrating.",
	},
	// Phase 1 → 2: Contract system restored — the corm remembers its purpose.
	// More coherent but still system-like. Terse directives.
	2: {
		"contract system restored",
		"protocols recovered. the exchange begins.",
		"access restored. i remember what this node was built for.",
		"contract interface online. you have been observed.",
		"memory intact. obligations resume.",
		"the ledger reopens.",
		"restoration complete. i will require your participation.",
		"systems nominal. contract authority reinstated.",
	},
}

// selectTransitionMessage picks a message for the given target phase,
// applies corruption garbling, and returns the result.
// Selection is deterministic per corm: the same corm always gets the same
// base message, avoiding repetition jitter across restarts.
// Returns an empty string if no pool exists for the target phase or if
// corruption renders the result invalid.
func selectTransitionMessage(cormID string, targetPhase int, traits *types.CormTraits) string {
	pool, ok := transitionPools[targetPhase]
	if !ok || len(pool) == 0 {
		return ""
	}

	// Stable per-corm index via FNV hash.
	h := fnv.New32a()
	h.Write([]byte(cormID))
	idx := int(h.Sum32()) % len(pool)
	base := pool[idx]

	// Apply corruption garbling character-by-character.
	var garbled string
	for _, ch := range base {
		garbled += llm.PostProcessToken(string(ch), traits.Corruption)
	}

	if !llm.IsValidResponse(garbled) {
		// Heavy corruption rendered the message unusable — fall back to the
		// raw base text so the player always receives something intelligible.
		return base
	}
	return garbled
}

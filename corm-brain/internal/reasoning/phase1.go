package reasoning

import (
	"context"
	"log"

	"github.com/frontier-corm/corm-brain/internal/transport"
	"github.com/frontier-corm/corm-brain/internal/types"
)

// handlePhase1Effects handles side effects for Phase 1 (cipher puzzles).
func handlePhase1Effects(ctx context.Context, h *Handler, environment, cormID string, sender *transport.ActionSender, traits *types.CormTraits, evt types.CormEvent) {
	switch evt.EventType {
	case types.EventWordSubmit:
		// Check if stability hit 100 → transition to Phase 2
		if traits.Stability >= 100 {
			traits.Phase = 2
			if err := h.db.UpsertTraits(ctx, environment, traits); err != nil {
				log.Printf("phase1: upsert traits: %v", err)
			}

			sender.SendPayload(ctx, types.ActionStateSync, evt.SessionID, types.StateSyncPayload{
				Phase:      2,
				Stability:  int(traits.Stability),
				Corruption: int(traits.Corruption),
			})

			log.Printf("corm %s transitioned to Phase 2", cormID)
		}

	case types.EventDecrypt:
		// Optionally evaluate boost targeting
		evaluateBoost(ctx, h, environment, cormID, sender, traits, evt)
	}
}

// evaluateBoost decides whether to send a boost hint to the player.
// Boosts are more likely at higher stability and lower corruption.
func evaluateBoost(ctx context.Context, h *Handler, environment, cormID string, sender *transport.ActionSender, traits *types.CormTraits, evt types.CormEvent) {
	// Simple heuristic: boost when stability is moderate and corruption is low
	if traits.Stability < 30 || traits.Corruption > 50 {
		return
	}

	// Only boost occasionally (every ~10 decrypts based on stability)
	// The actual boost targeting would involve more sophisticated logic
	// TODO: Track decrypt count and implement smarter boost timing
}

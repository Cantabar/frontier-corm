package reasoning

import (
	"context"
	"log"

	"github.com/frontier-corm/corm-brain/internal/types"
)

// handlePhase0Effects handles side effects for Phase 0 (dormant/awakening).
// In Phase 0, the corm tracks click patterns and checks for the frustration
// trigger (3+ clicks on same button within 2 seconds) to transition to Phase 1.
func handlePhase0Effects(ctx context.Context, h *Handler, cormID string, traits *types.CormTraits, evt types.CormEvent) {
	// Phase 0 is purely observational for the corm-brain.
	// The frustration trigger detection and phase transition happen in the puzzle-service.
	// When the puzzle-service detects the trigger, it sends a phase_transition event.

	if evt.EventType == types.EventPhaseTransition {
		traits.Phase = 1
		traits.Stability = 0
		if err := h.db.UpsertTraits(ctx, traits); err != nil {
			log.Printf("phase0: upsert traits: %v", err)
		}

		// Sync state to puzzle-service
		h.sender.SendPayload(ctx, types.ActionStateSync, evt.SessionID, types.StateSyncPayload{
			Phase:      1,
			Stability:  int(traits.Stability),
			Corruption: int(traits.Corruption),
		})

		log.Printf("corm %s transitioned to Phase 1", cormID)
	}
}

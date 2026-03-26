package reasoning

import (
	"context"
	"log"

	"github.com/frontier-corm/corm-brain/internal/transport"
	"github.com/frontier-corm/corm-brain/internal/types"
)

// handlePhase2Effects handles side effects for Phase 2 (contracts).
func handlePhase2Effects(ctx context.Context, h *Handler, environment, cormID string, sender *transport.ActionSender, traits *types.CormTraits, evt types.CormEvent) {
	switch evt.EventType {
	case types.EventContractComplete:
		// Sync updated state
		sender.SendPayload(ctx, types.ActionStateSync, evt.SessionID, types.StateSyncPayload{
			Phase:      traits.Phase,
			Stability:  int(traits.Stability),
			Corruption: int(traits.Corruption),
		})

		// TODO: Evaluate pattern alignment and mint CORM reward
		// TODO: Check if progression requirements met for Phase 3

	case types.EventContractFailed:
		sender.SendPayload(ctx, types.ActionStateSync, evt.SessionID, types.StateSyncPayload{
			Phase:      traits.Phase,
			Stability:  int(traits.Stability),
			Corruption: int(traits.Corruption),
		})

	default:
		// TODO: Evaluate whether to generate new contracts based on
		// interaction patterns, agenda weights, and contract_type_affinity.
		// Contract generation involves:
		// 1. Reading player inventory via chain/inventory.go
		// 2. Using LLM (Super) to select contract type and parameters
		// 3. Creating on-chain contract via chain/contracts.go
		// 4. Sending ActionContractCreated to puzzle-service
		log.Printf("phase2: event %s for corm %s (no contract generation yet)", evt.EventType, cormID)
	}
}

// Package memory handles episodic memory consolidation, trait reduction,
// retrieval, and pruning for the corm-brain service.
package memory

import (
	"math"

	"github.com/frontier-corm/corm-brain/internal/types"
)

// ReduceEvents applies deterministic mutations to corm traits based on new events.
// The LLM never writes traits — only these pure reducers do.
func ReduceEvents(traits *types.CormTraits, events []types.CormEvent) {
	for _, evt := range events {
		switch evt.EventType {
		case types.EventContractComplete:
			reduceContractComplete(traits, evt)
		case types.EventContractFailed:
			reduceContractFailed(traits, evt)
		case types.EventWordSubmit:
			reduceWordSubmit(traits, evt)
		case types.EventPurge:
			reducePurge(traits)
		case types.EventClick, types.EventDecrypt:
			reduceInteraction(traits, evt)
		case types.EventPhaseTransition:
			// Phase transitions are driven by stability reaching 100;
			// the actual phase update comes from on-chain sync.
		}
	}

	// Volatility rises with sustained corruption
	if traits.Corruption > 50 {
		traits.Volatility = clamp(traits.Volatility+0.01, 0, 1)
	} else if traits.Volatility > 0 {
		traits.Volatility = clamp(traits.Volatility-0.005, 0, 1)
	}
}

func reduceContractComplete(traits *types.CormTraits, evt types.CormEvent) {
	// Stability bonus for successful contract
	traits.Stability = clamp(traits.Stability+3, 0, 100)

	// Patient corms reward consistency
	traits.Patience = clamp(traits.Patience+0.02, 0, 1)

	// Update player affinity
	if evt.PlayerAddress != "" {
		if traits.PlayerAffinities == nil {
			traits.PlayerAffinities = make(map[string]float64)
		}
		current := traits.PlayerAffinities[evt.PlayerAddress]
		traits.PlayerAffinities[evt.PlayerAddress] = clamp(current+0.1, -1, 1)
	}

	// TODO: Parse contract type from payload and update agenda_weights + contract_type_affinity
}

func reduceContractFailed(traits *types.CormTraits, evt types.CormEvent) {
	// Corruption penalty for failed/abandoned contract
	traits.Corruption = clamp(traits.Corruption+2, 0, 100)

	// Paranoia rises on failures
	traits.Paranoia = clamp(traits.Paranoia+0.05, 0, 1)

	// Patience decreases
	traits.Patience = clamp(traits.Patience-0.03, 0, 1)

	// Update player affinity negatively
	if evt.PlayerAddress != "" {
		if traits.PlayerAffinities == nil {
			traits.PlayerAffinities = make(map[string]float64)
		}
		current := traits.PlayerAffinities[evt.PlayerAddress]
		traits.PlayerAffinities[evt.PlayerAddress] = clamp(current-0.15, -1, 1)
	}
}

func reduceWordSubmit(traits *types.CormTraits, evt types.CormEvent) {
	// Payload should contain {"correct": true/false}
	// For now, we check if payload contains "correct":true
	payload := string(evt.Payload)
	if contains(payload, `"correct":true`) || contains(payload, `"correct": true`) {
		traits.Stability = clamp(traits.Stability+5, 0, 100)
	} else {
		traits.Corruption = clamp(traits.Corruption+3, 0, 100)
	}
}

func reducePurge(traits *types.CormTraits) {
	// Purge resets corruption at the cost of stability
	corruptionReduced := traits.Corruption * 0.5
	stabilityLost := corruptionReduced * 0.5 // 1:2 ratio

	traits.Corruption = clamp(traits.Corruption-corruptionReduced, 0, 100)
	traits.Stability = clamp(traits.Stability-stabilityLost, 0, 100)

	// Small patience bonus for using purge at low stability (brave/risky)
	if traits.Stability < 30 {
		traits.Patience = clamp(traits.Patience+0.03, 0, 1)
	}
}

func reduceInteraction(traits *types.CormTraits, evt types.CormEvent) {
	// Track player engagement
	if evt.PlayerAddress != "" {
		if traits.PlayerAffinities == nil {
			traits.PlayerAffinities = make(map[string]float64)
		}
		current := traits.PlayerAffinities[evt.PlayerAddress]
		// Tiny affinity boost for continued interaction
		traits.PlayerAffinities[evt.PlayerAddress] = clamp(current+0.01, -1, 1)
	}
}

func clamp(v, min, max float64) float64 {
	return math.Max(min, math.Min(max, v))
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSimple(s, substr))
}

func containsSimple(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

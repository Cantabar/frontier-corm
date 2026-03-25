package tests

import (
	"encoding/json"
	"testing"

	"github.com/frontier-corm/corm-brain/internal/memory"
	"github.com/frontier-corm/corm-brain/internal/types"
)

func defaultTraits() *types.CormTraits {
	return &types.CormTraits{
		CormID:    "test-corm",
		Phase:     1,
		Stability: 50,
		Corruption: 20,
		AgendaWeights: types.AgendaWeights{
			Industry: 0.33, Expansion: 0.33, Defense: 0.33,
		},
		Patience:             0.5,
		Paranoia:             0.0,
		Volatility:           0.0,
		PlayerAffinities:     make(map[string]float64),
		ContractTypeAffinity: make(map[string]float64),
	}
}

func TestReduceContractComplete(t *testing.T) {
	traits := defaultTraits()
	events := []types.CormEvent{
		{EventType: types.EventContractComplete, PlayerAddress: "0xabc123"},
	}

	memory.ReduceEvents(traits, events)

	if traits.Stability != 53 {
		t.Errorf("expected stability 53, got %.0f", traits.Stability)
	}
	if traits.Patience <= 0.5 {
		t.Errorf("expected patience > 0.5, got %.3f", traits.Patience)
	}
	if traits.PlayerAffinities["0xabc123"] <= 0 {
		t.Errorf("expected positive affinity for player, got %.3f", traits.PlayerAffinities["0xabc123"])
	}
}

func TestReduceContractFailed(t *testing.T) {
	traits := defaultTraits()
	events := []types.CormEvent{
		{EventType: types.EventContractFailed, PlayerAddress: "0xdef456"},
	}

	memory.ReduceEvents(traits, events)

	if traits.Corruption != 22 {
		t.Errorf("expected corruption 22, got %.0f", traits.Corruption)
	}
	if traits.Paranoia <= 0 {
		t.Errorf("expected paranoia > 0, got %.3f", traits.Paranoia)
	}
	if traits.PlayerAffinities["0xdef456"] >= 0 {
		t.Errorf("expected negative affinity for player, got %.3f", traits.PlayerAffinities["0xdef456"])
	}
}

func TestReduceWordSubmitCorrect(t *testing.T) {
	traits := defaultTraits()
	payload, _ := json.Marshal(map[string]bool{"correct": true})
	events := []types.CormEvent{
		{EventType: types.EventWordSubmit, Payload: payload},
	}

	memory.ReduceEvents(traits, events)

	if traits.Stability != 55 {
		t.Errorf("expected stability 55, got %.0f", traits.Stability)
	}
}

func TestReduceWordSubmitIncorrect(t *testing.T) {
	traits := defaultTraits()
	payload, _ := json.Marshal(map[string]bool{"correct": false})
	events := []types.CormEvent{
		{EventType: types.EventWordSubmit, Payload: payload},
	}

	memory.ReduceEvents(traits, events)

	if traits.Corruption != 23 {
		t.Errorf("expected corruption 23, got %.0f", traits.Corruption)
	}
}

func TestReducePurge(t *testing.T) {
	traits := defaultTraits()
	traits.Corruption = 60
	traits.Stability = 20

	events := []types.CormEvent{
		{EventType: types.EventPurge},
	}

	memory.ReduceEvents(traits, events)

	if traits.Corruption >= 60 {
		t.Errorf("expected corruption < 60, got %.0f", traits.Corruption)
	}
	if traits.Stability >= 20 {
		t.Errorf("expected stability < 20, got %.0f", traits.Stability)
	}
}

func TestVolatilityRisesWithHighCorruption(t *testing.T) {
	traits := defaultTraits()
	traits.Corruption = 60
	traits.Volatility = 0.0

	// Multiple interactions with high corruption
	events := []types.CormEvent{
		{EventType: types.EventClick, PlayerAddress: "0xabc"},
		{EventType: types.EventClick, PlayerAddress: "0xabc"},
	}

	memory.ReduceEvents(traits, events)

	if traits.Volatility <= 0 {
		t.Errorf("expected volatility > 0 with high corruption, got %.3f", traits.Volatility)
	}
}

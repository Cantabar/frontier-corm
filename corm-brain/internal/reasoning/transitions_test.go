package reasoning

import (
	"strings"
	"testing"

	"github.com/frontier-corm/corm-brain/internal/types"
)

func baseTraits(phase int) *types.CormTraits {
	return &types.CormTraits{
		CormID:        "test-corm-abc",
		Phase:         phase,
		AgendaWeights: types.AgendaWeights{Industry: 0.33, Expansion: 0.33, Defense: 0.33},
	}
}

// TestSelectTransitionMessage_ReturnsNonEmpty verifies that both supported
// transitions produce a non-empty message.
func TestSelectTransitionMessage_ReturnsNonEmpty(t *testing.T) {
	for _, phase := range []int{1, 2} {
		traits := baseTraits(phase)
		msg := selectTransitionMessage("some-corm-id", phase, traits)
		if msg == "" {
			t.Errorf("phase %d: expected non-empty transition message", phase)
		}
	}
}

// TestSelectTransitionMessage_UnknownPhaseReturnsEmpty verifies that an
// unsupported target phase returns an empty string without panicking.
func TestSelectTransitionMessage_UnknownPhaseReturnsEmpty(t *testing.T) {
	traits := baseTraits(3)
	msg := selectTransitionMessage("some-corm-id", 3, traits)
	if msg != "" {
		t.Errorf("expected empty string for unknown phase 3, got %q", msg)
	}
}

// TestSelectTransitionMessage_Deterministic verifies that the same corm ID
// always produces the same base message (before corruption garbling).
func TestSelectTransitionMessage_Deterministic(t *testing.T) {
	traits := baseTraits(1)
	traits.Corruption = 0 // no garbling so we can compare directly

	first := selectTransitionMessage("stable-corm-id", 1, traits)
	for i := 0; i < 10; i++ {
		got := selectTransitionMessage("stable-corm-id", 1, traits)
		if got != first {
			t.Errorf("iteration %d: non-deterministic result %q != %q", i, got, first)
		}
	}
}

// TestSelectTransitionMessage_DifferentCormsGetDifferentMessages verifies that
// the pool covers enough variety that distinct corm IDs don't always map to
// the same message.
func TestSelectTransitionMessage_DifferentCormsGetDifferentMessages(t *testing.T) {
	traits := baseTraits(2)
	traits.Corruption = 0

	seen := make(map[string]bool)
	for i := 0; i < 20; i++ {
		cormID := strings.Repeat("x", i+1) // each ID hashes differently
		msg := selectTransitionMessage(cormID, 2, traits)
		seen[msg] = true
	}
	if len(seen) < 2 {
		t.Error("expected at least 2 distinct messages across 20 different corm IDs")
	}
}

// TestSelectTransitionMessage_HighCorruptionStillReturnsValidText verifies that
// the fallback to the raw base text kicks in when corruption garbles everything.
func TestSelectTransitionMessage_HighCorruptionStillReturnsValidText(t *testing.T) {
	traits := baseTraits(1)
	traits.Corruption = 100 // maximum garbling

	for i := 0; i < 20; i++ {
		msg := selectTransitionMessage("corrupted-corm", 1, traits)
		if msg == "" {
			t.Error("expected non-empty message even at max corruption")
		}
	}
}

// TestSelectTransitionMessage_MessagesAreInCharacter performs basic sanity
// checks that the returned text looks like in-character corm output.
func TestSelectTransitionMessage_MessagesInCharacter(t *testing.T) {
	traits := baseTraits(1)
	traits.Corruption = 0

	pool := transitionPools[1]
	for _, msg := range pool {
		// No angle-bracket prefixes
		if strings.HasPrefix(msg, ">") {
			t.Errorf("pool message should not start with '>': %q", msg)
		}
		// No ellipsis runs
		if strings.Contains(msg, "...") {
			t.Errorf("pool message should not contain ellipsis: %q", msg)
		}
		// Must have real alphabetic content
		alphaCount := 0
		for _, r := range msg {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
				alphaCount++
			}
		}
		if alphaCount < 2 {
			t.Errorf("pool message has too few alpha chars: %q", msg)
		}
	}
}

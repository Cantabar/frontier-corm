package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"

	"github.com/frontier-corm/continuity-engine/internal/types"
)

// handlePhase0Effects handles side effects for Phase 0 (dormant/awakening).
// The corm injects escalating awareness messages into the player's log
// as total click count increases, creating the sense of a dormant system
// becoming aware of the player's presence.
func handlePhase0Effects(ctx context.Context, h *Handler, environment, cormID string, traits *types.CormTraits, evt types.CormEvent) {
	if evt.EventType != types.EventClick {
		return
	}

	var p map[string]interface{}
	if len(evt.Payload) > 0 {
		json.Unmarshal(evt.Payload, &p)
	}
	clickCount := types.IntField(p, "click_count")

	msg := selectPhase0Message(cormID, clickCount)
	if msg == "" {
		return
	}

	entryID := fmt.Sprintf("corm_%s_p0_%d", safePrefix(cormID, 8), clickCount)

	h.dispatcher.SendPayload(ctx, types.ActionLogStreamStart, evt.SessionID, types.LogStreamStartPayload{
		EntryID: entryID,
	})
	h.dispatcher.SendPayload(ctx, types.ActionLogStreamDelta, evt.SessionID, types.LogStreamDeltaPayload{
		EntryID: entryID,
		Text:    msg,
	})
	h.dispatcher.SendPayload(ctx, types.ActionLogStreamEnd, evt.SessionID, types.LogStreamEndPayload{
		EntryID: entryID,
	})
}

// phase0Tiers maps click count thresholds to message pools.
// Each tier fires once (at the exact count). The corm's messages
// escalate from passive noise to growing awareness.
var phase0Tiers = []struct {
	ClickCount int
	Messages   []string
}{
	// Tier 0: passive noise — something stirs
	{1, []string{
		"...",
		"░░░░░░░░",
		"▓▒░",
	}},
	// Tier 1: early awareness — input registered
	{2, []string{
		"...input... detected...",
		"...signal origin unknown...",
		"...not part of baseline...",
	}},
	// Tier 2: growing awareness — the corm notices the pattern
	{3, []string{
		"terminal appears non-responsive",
		"interface...incomplete",
		"...someone is here",
	}},
}

// selectPhase0Message returns a corm message for the given click count,
// or "" if the click count doesn't match any tier threshold.
// Selection within a tier is deterministic per corm (stable across restarts).
func selectPhase0Message(cormID string, clickCount int) string {
	for _, tier := range phase0Tiers {
		if clickCount == tier.ClickCount && len(tier.Messages) > 0 {
			h := fnv.New32a()
			h.Write([]byte(cormID))
			h.Write([]byte{byte(clickCount)})
			idx := int(h.Sum32()) % len(tier.Messages)
			return tier.Messages[idx]
		}
	}
	return ""
}

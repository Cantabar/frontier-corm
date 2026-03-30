package handlers

import (
	"encoding/json"
	"time"

	"github.com/frontier-corm/continuity-engine/internal/puzzle"
	"github.com/frontier-corm/continuity-engine/internal/types"
)

// buildEvent constructs a CormEvent with all session-derived fields pre-filled,
// including the Environment tag required by the event processor.
func (h *Handlers) buildEvent(sess *puzzle.Session, eventType string, payload json.RawMessage) types.CormEvent {
	return types.CormEvent{
		Type:          "event",
		SessionID:     sess.ID,
		PlayerAddress: sess.PlayerAddress,
		NetworkNodeID: sess.NetworkNodeID,
		Context:       sess.Context,
		EventType:     eventType,
		Payload:       payload,
		Timestamp:     time.Now(),
		Environment:   h.defaultEnv,
	}
}

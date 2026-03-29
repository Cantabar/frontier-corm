package handlers

import (
	"encoding/json"
	"time"

	"github.com/frontier-corm/puzzle-service/internal/corm"
	"github.com/frontier-corm/puzzle-service/internal/puzzle"
)

// buildEvent constructs a CormEvent with all session-derived fields pre-filled.
// This ensures NetworkNodeID is always propagated when bound.
func buildEvent(sess *puzzle.Session, eventType string, payload json.RawMessage) corm.CormEvent {
	return corm.CormEvent{
		Type:          "event",
		SessionID:     sess.ID,
		PlayerAddress: sess.PlayerAddress,
		NetworkNodeID: sess.NetworkNodeID,
		Context:       sess.Context,
		EventType:     eventType,
		Payload:       payload,
		Timestamp:     time.Now(),
	}
}

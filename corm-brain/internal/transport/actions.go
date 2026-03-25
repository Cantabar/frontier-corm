package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"

	"github.com/frontier-corm/corm-brain/internal/types"
)

// ActionSender routes actions through the active transport (WS or HTTP fallback).
type ActionSender struct {
	ws       *WSClient
	fallback *FallbackClient
}

// NewActionSender creates an action sender that prefers WebSocket over HTTP fallback.
func NewActionSender(ws *WSClient, fallback *FallbackClient) *ActionSender {
	return &ActionSender{ws: ws, fallback: fallback}
}

// Send dispatches a CormAction via the best available transport.
func (a *ActionSender) Send(ctx context.Context, action types.CormAction) {
	if a.ws.IsConnected() {
		if err := a.ws.SendAction(ctx, action); err != nil {
			log.Printf("ws send failed, trying fallback: %v", err)
			if err := a.fallback.PostAction(ctx, action); err != nil {
				log.Printf("fallback send failed: %v", err)
			}
		}
		return
	}

	if err := a.fallback.PostAction(ctx, action); err != nil {
		log.Printf("fallback send failed: %v", err)
	}
}

// SendPayload is a convenience method that marshals a payload and sends an action.
func (a *ActionSender) SendPayload(ctx context.Context, actionType, sessionID string, payload interface{}) {
	data, err := json.Marshal(payload)
	if err != nil {
		log.Printf("marshal payload: %v", err)
		return
	}

	a.Send(ctx, types.CormAction{
		ActionType: actionType,
		SessionID:  sessionID,
		Payload:    data,
	})
}

// jsonReader wraps a byte slice as an io.Reader for HTTP request bodies.
func jsonReader(data []byte) io.Reader {
	return bytes.NewReader(data)
}

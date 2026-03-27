package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/coder/websocket"

	"github.com/frontier-corm/corm-brain/internal/types"
)

// Hub manages the WebSocket connection to a single corm-brain client.
type Hub struct {
	mu        sync.RWMutex
	conn      *websocket.Conn
	connected bool
	actionCh  chan types.CormAction // buffered channel of received actions
}

// NewHub creates a new connection hub.
func NewHub() *Hub {
	return &Hub{
		actionCh: make(chan types.CormAction, 256),
	}
}

// IsConnected returns whether a corm-brain is currently connected.
func (h *Hub) IsConnected() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.connected
}

// HandleWS is the HTTP handler for /corm/ws — upgrades to WebSocket and
// starts reading CormAction messages from the corm-brain.
func (h *Hub) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // accept any origin for testing
	})
	if err != nil {
		log.Printf("[ws] accept error: %v", err)
		return
	}

	h.mu.Lock()
	// Close any existing connection
	if h.conn != nil {
		h.conn.Close(websocket.StatusGoingAway, "new connection")
	}
	h.conn = conn
	h.connected = true
	h.mu.Unlock()

	log.Println("[ws] corm-brain connected")

	// Read loop — receives CormAction messages from corm-brain
	for {
		_, data, err := conn.Read(r.Context())
		if err != nil {
			h.mu.Lock()
			h.connected = false
			h.conn = nil
			h.mu.Unlock()
			log.Printf("[ws] corm-brain disconnected: %v", err)
			return
		}

		var action types.CormAction
		if err := json.Unmarshal(data, &action); err != nil {
			log.Printf("[ws] invalid action JSON: %v  raw=%s", err, string(data))
			continue
		}

		select {
		case h.actionCh <- action:
		default:
			log.Println("[ws] action channel full, dropping action")
		}
	}
}

// SendEvent writes a CormEvent to the connected corm-brain.
func (h *Hub) SendEvent(ctx context.Context, evt types.CormEvent) error {
	h.mu.RLock()
	conn := h.conn
	h.mu.RUnlock()

	if conn == nil {
		return errNotConnected
	}

	data, err := json.Marshal(evt)
	if err != nil {
		return err
	}

	log.Printf("[send] event seq=%d type=%s player=%s", evt.Seq, evt.EventType, evt.PlayerAddress)
	return conn.Write(ctx, websocket.MessageText, data)
}

// ReadLoop reads actions from the channel and renders them. Blocks until ctx is cancelled.
func (h *Hub) ReadLoop(ctx context.Context, renderer *Renderer) {
	for {
		select {
		case <-ctx.Done():
			return
		case action := <-h.actionCh:
			renderer.RenderAction(action)
		}
	}
}

var errNotConnected = &notConnectedError{}

type notConnectedError struct{}

func (e *notConnectedError) Error() string { return "corm-brain not connected" }

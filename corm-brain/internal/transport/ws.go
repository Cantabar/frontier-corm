// Package transport manages the outbound connection to the puzzle-service,
// including the persistent WebSocket and HTTP fallback.
package transport

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/frontier-corm/corm-brain/internal/types"
)

// WSClient maintains a persistent outbound WebSocket to the puzzle-service.
type WSClient struct {
	puzzleURL      string
	reconnectMax   time.Duration
	conn           *websocket.Conn
	mu             sync.RWMutex
	connected      bool
	eventChan      chan types.CormEvent
	onDisconnect   func() // called when WS drops, to enable fallback
	onReconnect    func() // called when WS reconnects
}

// NewWSClient creates a WebSocket client targeting the puzzle-service /corm/ws endpoint.
func NewWSClient(puzzleServiceURL string, reconnectMax time.Duration, eventChan chan types.CormEvent) *WSClient {
	return &WSClient{
		puzzleURL:    puzzleServiceURL,
		reconnectMax: reconnectMax,
		eventChan:    eventChan,
	}
}

// SetCallbacks sets disconnect/reconnect callbacks for fallback coordination.
func (w *WSClient) SetCallbacks(onDisconnect, onReconnect func()) {
	w.onDisconnect = onDisconnect
	w.onReconnect = onReconnect
}

// Run maintains the persistent WebSocket connection with automatic reconnection.
// It blocks until ctx is cancelled.
func (w *WSClient) Run(ctx context.Context) {
	backoff := time.Second
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := w.connectAndListen(ctx)
		if ctx.Err() != nil {
			return
		}

		w.mu.Lock()
		w.connected = false
		w.conn = nil
		w.mu.Unlock()

		if w.onDisconnect != nil {
			w.onDisconnect()
		}

		log.Printf("ws disconnected: %v — reconnecting in %v", err, backoff)
		select {
		case <-time.After(backoff):
		case <-ctx.Done():
			return
		}

		// Exponential backoff with cap
		backoff *= 2
		if backoff > w.reconnectMax {
			backoff = w.reconnectMax
		}
	}
}

// connectAndListen dials the WebSocket and reads messages until error.
func (w *WSClient) connectAndListen(ctx context.Context) error {
	wsURL := w.buildWSURL()
	log.Printf("connecting to %s", wsURL)

	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}

	w.mu.Lock()
	w.conn = conn
	w.connected = true
	w.mu.Unlock()

	if w.onReconnect != nil {
		w.onReconnect()
	}

	log.Printf("connected to puzzle-service WebSocket")

	// Reset backoff on successful connection (caller handles this implicitly)
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return fmt.Errorf("read: %w", err)
		}

		var evt types.CormEvent
		if err := json.Unmarshal(data, &evt); err != nil {
			log.Printf("ws: invalid event: %v", err)
			continue
		}

		select {
		case w.eventChan <- evt:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

// SendAction writes a CormAction to the WebSocket.
func (w *WSClient) SendAction(ctx context.Context, action types.CormAction) error {
	w.mu.RLock()
	conn := w.conn
	w.mu.RUnlock()

	if conn == nil {
		return fmt.Errorf("ws not connected")
	}

	data, err := json.Marshal(action)
	if err != nil {
		return fmt.Errorf("marshal action: %w", err)
	}

	return conn.Write(ctx, websocket.MessageText, data)
}

// IsConnected returns the current connection status.
func (w *WSClient) IsConnected() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.connected
}

// buildWSURL converts the puzzle service HTTP URL to a WebSocket URL.
func (w *WSClient) buildWSURL() string {
	u := w.puzzleURL
	u = strings.Replace(u, "https://", "wss://", 1)
	u = strings.Replace(u, "http://", "ws://", 1)

	parsed, err := url.Parse(u)
	if err != nil {
		return u + "/corm/ws"
	}
	parsed.Path = "/corm/ws"
	return parsed.String()
}

package transport

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/frontier-corm/corm-brain/internal/types"
)

// envTransport holds the transport components for a single environment.
type envTransport struct {
	WS       *WSClient
	Fallback *FallbackClient
	Sender   *ActionSender
}

// Manager manages per-environment transport connections (WS + HTTP fallback).
// All environments share a single eventChan — events are tagged with their
// source environment by the WSClient.
type Manager struct {
	envs      map[string]*envTransport
	eventChan chan types.CormEvent
}

// NewManager creates a transport manager. For each environment, it instantiates
// a WSClient, FallbackClient, and ActionSender targeting that environment's
// puzzle-service URL. All events flow into a shared eventChan.
func NewManager(
	environments []struct {
		Name             string
		PuzzleServiceURL string
	},
	wsReconnectMax time.Duration,
	fallbackPollInterval time.Duration,
	eventChan chan types.CormEvent,
) *Manager {
	m := &Manager{
		envs:      make(map[string]*envTransport, len(environments)),
		eventChan: eventChan,
	}

	for _, env := range environments {
		ws := NewWSClient(env.Name, env.PuzzleServiceURL, wsReconnectMax, eventChan)
		fb := NewFallbackClient(env.PuzzleServiceURL, fallbackPollInterval, eventChan)
		sender := NewActionSender(ws, fb)

		m.envs[env.Name] = &envTransport{
			WS:       ws,
			Fallback: fb,
			Sender:   sender,
		}

		log.Printf("transport: registered environment %q → %s", env.Name, env.PuzzleServiceURL)
	}

	return m
}

// Run starts all per-environment WebSocket connections. It blocks until ctx is
// cancelled. Each environment's WS reconnect and fallback coordination is
// handled independently.
func (m *Manager) Run(ctx context.Context) {
	var wg sync.WaitGroup

	for name, et := range m.envs {
		wg.Add(1)
		go func(envName string, t *envTransport) {
			defer wg.Done()

			// Coordinate WS/fallback per-environment
			var fallbackCancel context.CancelFunc
			var fallbackMu sync.Mutex

			t.WS.SetCallbacks(
				func() { // onDisconnect
					fallbackMu.Lock()
					defer fallbackMu.Unlock()
					log.Printf("transport [%s]: switching to HTTP fallback", envName)
					fbCtx, fbCancel := context.WithCancel(ctx)
					fallbackCancel = fbCancel
					go t.Fallback.Poll(fbCtx)
				},
				func() { // onReconnect
					fallbackMu.Lock()
					defer fallbackMu.Unlock()
					if fallbackCancel != nil {
						log.Printf("transport [%s]: WebSocket reconnected, stopping fallback", envName)
						fallbackCancel()
						fallbackCancel = nil
					}
				},
			)

			t.WS.Run(ctx)
		}(name, et)
	}

	wg.Wait()
}

// SenderFor returns the ActionSender for the given environment.
// Returns nil if the environment is not registered.
func (m *Manager) SenderFor(environment string) *ActionSender {
	if et, ok := m.envs[environment]; ok {
		return et.Sender
	}
	return nil
}

// Environments returns the names of all registered environments.
func (m *Manager) Environments() []string {
	names := make([]string, 0, len(m.envs))
	for name := range m.envs {
		names = append(names, name)
	}
	return names
}

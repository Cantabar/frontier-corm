// Command harness is a standalone test tool that impersonates the puzzle-service.
// It serves a WebSocket endpoint on /corm/ws so the corm-brain can connect to it
// unmodified, and provides an interactive CLI to inject player events and observe
// corm-brain responses in real time.
//
// Usage:
//
//	go run ./cmd/harness/
//
// Environment variables:
//
//	HARNESS_PORT           (default "3300")
//	HARNESS_SESSION_ID     (default: auto-generated UUID)
//	HARNESS_PLAYER_ADDRESS (default "0xTESTPLAYER0001")
//	HARNESS_CONTEXT        (default "browser")
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/google/uuid"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	port := envOrDefault("HARNESS_PORT", "3300")
	sessionID := envOrDefault("HARNESS_SESSION_ID", uuid.New().String())
	playerAddr := envOrDefault("HARNESS_PLAYER_ADDRESS", "0xTESTPLAYER0001")
	playerCtx := envOrDefault("HARNESS_CONTEXT", "browser")

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	hub := NewHub()
	renderer := NewRenderer(os.Stdout)

	mux := http.NewServeMux()
	mux.HandleFunc("/corm/ws", hub.HandleWS)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ok")
	})
	// Stub endpoints for HTTP fallback (corm-brain may poll these during reconnect)
	mux.HandleFunc("/corm/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "[]")
	})
	mux.HandleFunc("/corm/actions", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	})

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	// Start HTTP server
	go func() {
		log.Printf("[harness] listening on :%s  (session=%s player=%s context=%s)", port, sessionID, playerAddr, playerCtx)
		log.Printf("[harness] waiting for corm-brain to connect to ws://localhost:%s/corm/ws ...", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[harness] http server: %v", err)
		}
	}()

	// Start read loop (receives actions from corm-brain and renders them)
	go hub.ReadLoop(ctx, renderer)

	// Interactive CLI
	cli := NewCLI(hub, renderer, sessionID, playerAddr, playerCtx)
	cli.Run(ctx)

	// Shutdown
	cancel()
	srv.Close()
	log.Println("[harness] stopped")
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

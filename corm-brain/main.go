package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/frontier-corm/corm-brain/internal/chain"
	"github.com/frontier-corm/corm-brain/internal/config"
	"github.com/frontier-corm/corm-brain/internal/db"
	"github.com/frontier-corm/corm-brain/internal/embed"
	"github.com/frontier-corm/corm-brain/internal/llm"
	"github.com/frontier-corm/corm-brain/internal/memory"
	"github.com/frontier-corm/corm-brain/internal/reasoning"
	"github.com/frontier-corm/corm-brain/internal/transport"
	"github.com/frontier-corm/corm-brain/internal/types"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("corm-brain starting")

	cfg := config.Load()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	// --- Database ---
	database, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer database.Close()
	log.Println("database connected, migrations applied")

	// --- LLM Client ---
	llmClient := llm.NewClient(cfg.LLMSuperURL, cfg.LLMFastURL)

	// --- Embedder ---
	embedder := embed.NewEmbedder(cfg.EmbedModelPath)
	defer embedder.Close()

	// --- Chain Client ---
	chainClient := chain.NewClient(cfg.SUIRpcURL, cfg.CormStatePackageID, cfg.SUIPrivateKey)
	_ = chainClient // Used by reasoning package in future

	// --- Transport ---
	eventChan := make(chan types.CormEvent, 256)

	wsClient := transport.NewWSClient(cfg.PuzzleServiceURL, cfg.WSReconnectMax, eventChan)
	fallbackClient := transport.NewFallbackClient(cfg.PuzzleServiceURL, cfg.FallbackPollInterval, eventChan)
	sender := transport.NewActionSender(wsClient, fallbackClient)

	// Coordinate WS/fallback: start polling when WS drops, stop when reconnected
	var fallbackCancel context.CancelFunc
	var fallbackMu sync.Mutex

	wsClient.SetCallbacks(
		func() { // onDisconnect
			fallbackMu.Lock()
			defer fallbackMu.Unlock()
			log.Println("switching to HTTP fallback polling")
			fbCtx, fbCancel := context.WithCancel(ctx)
			fallbackCancel = fbCancel
			go fallbackClient.Poll(fbCtx)
		},
		func() { // onReconnect
			fallbackMu.Lock()
			defer fallbackMu.Unlock()
			if fallbackCancel != nil {
				log.Println("WebSocket reconnected, stopping fallback polling")
				fallbackCancel()
				fallbackCancel = nil
			}
		},
	)

	// --- Memory ---
	retriever := memory.NewRetriever(database, embedder)
	consolidator := memory.NewConsolidator(database, llmClient, embedder, cfg.MemoryCapPerCorm)

	// --- Reasoning ---
	handler := reasoning.NewHandler(database, llmClient, retriever, sender)

	// --- Start goroutines ---
	var wg sync.WaitGroup

	// Goroutine 1: WebSocket listener (persistent, reconnecting)
	wg.Add(1)
	go func() {
		defer wg.Done()
		wsClient.Run(ctx)
	}()

	// Goroutine 2: Event processor (reads from eventChan)
	wg.Add(1)
	go func() {
		defer wg.Done()
		runEventProcessor(ctx, cfg, database, chainClient, handler, eventChan)
	}()

	// Goroutine 3: Slow consolidation loop
	wg.Add(1)
	go func() {
		defer wg.Done()
		runConsolidationLoop(ctx, cfg.ConsolidationInterval, database, consolidator)
	}()

	log.Println("corm-brain running")

	// Wait for shutdown
	<-ctx.Done()
	log.Println("shutting down...")
	wg.Wait()
	log.Println("corm-brain stopped")
}

// runEventProcessor reads events from the channel and processes them.
func runEventProcessor(
	ctx context.Context,
	cfg config.Config,
	database *db.DB,
	chainClient *chain.Client,
	handler *reasoning.Handler,
	eventChan <-chan types.CormEvent,
) {
	// Brief coalescing window for batching rapid events
	coalesce := cfg.EventCoalesceWindow

	for {
		select {
		case <-ctx.Done():
			return
		case evt := <-eventChan:
			// Coalesce: collect events for a brief window
			batch := []types.CormEvent{evt}
			timer := time.NewTimer(coalesce)
		drain:
			for {
				select {
				case e := <-eventChan:
					batch = append(batch, e)
				case <-timer.C:
					break drain
				case <-ctx.Done():
					timer.Stop()
					return
				}
			}

			// Process each event
			for _, e := range batch {
				processEvent(ctx, database, chainClient, handler, e)
			}
		}
	}
}

// processEvent resolves the corm and delegates to the reasoning handler.
func processEvent(
	ctx context.Context,
	database *db.DB,
	chainClient *chain.Client,
	handler *reasoning.Handler,
	evt types.CormEvent,
) {
	// Resolve network_node_id → corm_id
	cormID, err := database.ResolveCormID(ctx, evt.NetworkNodeID)
	if err != nil {
		log.Printf("resolve corm: %v", err)
		return
	}

	if cormID == "" {
		// First contact with this network node — provision a new corm
		cormID, err = chainClient.CreateCormState(ctx, evt.NetworkNodeID)
		if err != nil {
			log.Printf("create corm state: %v", err)
			// Generate a local-only corm ID as fallback
			cormID = "local_" + evt.NetworkNodeID
		}

		if err := database.LinkNetworkNode(ctx, evt.NetworkNodeID, cormID); err != nil {
			log.Printf("link network node: %v", err)
		}
		log.Printf("new corm %s for node %s", cormID, evt.NetworkNodeID)
	}

	if err := handler.ProcessEvent(ctx, cormID, evt); err != nil {
		log.Printf("process event: %v", err)
	}
}

// runConsolidationLoop periodically consolidates events into memories and updates traits.
func runConsolidationLoop(
	ctx context.Context,
	interval time.Duration,
	database *db.DB,
	consolidator *memory.Consolidator,
) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cormIDs, err := database.ActiveCormIDs(ctx)
			if err != nil {
				log.Printf("consolidation: active corms: %v", err)
				continue
			}

			for _, cormID := range cormIDs {
				if err := consolidator.ConsolidateCorm(ctx, cormID); err != nil {
					log.Printf("consolidation: corm %s: %v", cormID, err)
				}
			}
		}
	}
}

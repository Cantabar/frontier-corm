// Package reasoning routes player events to phase-specific logic and
// orchestrates LLM inference for corm responses.
package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/frontier-corm/corm-brain/internal/chain"
	"github.com/frontier-corm/corm-brain/internal/db"
	"github.com/frontier-corm/corm-brain/internal/llm"
	"github.com/frontier-corm/corm-brain/internal/memory"
	"github.com/frontier-corm/corm-brain/internal/transport"
	"github.com/frontier-corm/corm-brain/internal/types"
)

// Handler processes player events and generates corm responses.
type Handler struct {
	db        *db.DB
	llm       *llm.Client
	retriever *memory.Retriever
	tm        *transport.Manager

	// Phase 2: contract generation
	registry         *chain.Registry
	chainClient      *chain.Client
	pricing          PricingConfig
	contractCooldown time.Duration

	// Observation rate limiting
	observationInterval time.Duration
	observationJitter   time.Duration
	criticalBypass      bool

	gateMu   sync.Mutex
	sessions map[string]*observationGate // keyed by "environment:sessionID"
}

// observationGate tracks per-session observation timing.
type observationGate struct {
	lastObservationTime time.Time
	nextJitter          time.Duration // pre-rolled jitter for next interval
}

// HandlerConfig holds optional configuration for the reasoning handler.
type HandlerConfig struct {
	Registry         *chain.Registry
	ChainClient      *chain.Client
	Pricing          PricingConfig
	ContractCooldown time.Duration
}

// NewHandler creates a new reasoning handler.
func NewHandler(database *db.DB, llmClient *llm.Client, retriever *memory.Retriever, tm *transport.Manager, observationInterval, observationJitter time.Duration, criticalBypass bool, opts ...HandlerConfig) *Handler {
	h := &Handler{
		db:                  database,
		llm:                 llmClient,
		retriever:           retriever,
		tm:                  tm,
		observationInterval: observationInterval,
		observationJitter:   observationJitter,
		criticalBypass:      criticalBypass,
		sessions:            make(map[string]*observationGate),
		contractCooldown:    30 * time.Second, // default
	}
	if len(opts) > 0 {
		cfg := opts[0]
		h.registry = cfg.Registry
		h.chainClient = cfg.ChainClient
		h.pricing = cfg.Pricing
		if cfg.ContractCooldown > 0 {
			h.contractCooldown = cfg.ContractCooldown
		}
	}
	return h
}

// ProcessEvent handles a single event for a resolved corm.
// It delegates to ProcessEventBatch with a one-element slice.
func (h *Handler) ProcessEvent(ctx context.Context, environment, cormID string, evt types.CormEvent) error {
	return h.ProcessEventBatch(ctx, environment, cormID, []types.CormEvent{evt})
}

// ProcessEventBatch handles a batch of events for a single resolved corm/session.
// It performs one LLM call for the entire batch, then runs per-event side effects.
func (h *Handler) ProcessEventBatch(ctx context.Context, environment, cormID string, events []types.CormEvent) error {
	if len(events) == 0 {
		return nil
	}

	sender := h.tm.SenderFor(environment)
	if sender == nil {
		return fmt.Errorf("no transport for environment %q", environment)
	}

	// Get traits (once for the batch)
	traits, err := h.db.GetTraits(ctx, environment, cormID)
	if err != nil {
		return fmt.Errorf("get traits: %w", err)
	}
	if traits == nil {
		traits = &types.CormTraits{
			CormID: cormID,
			AgendaWeights: types.AgendaWeights{
				Industry: 0.33, Expansion: 0.33, Defense: 0.33,
			},
			Patience:             0.5,
			PlayerAffinities:     make(map[string]float64),
			ContractTypeAffinity: make(map[string]float64),
		}
		if err := h.db.UpsertTraits(ctx, environment, traits); err != nil {
			return fmt.Errorf("init traits: %w", err)
		}
	}

	sessionID := events[0].SessionID

	// Store all raw events
	for _, evt := range events {
		if _, err := h.db.InsertEvent(ctx, environment, cormID, evt); err != nil {
			log.Printf("insert event: %v", err)
		}
	}

	// Observation rate limiting: decide whether to invoke the LLM this tick.
	if !h.shouldObserve(environment, sessionID, events) {
		// Still run phase effects (phase transitions, boosts) even when not observing.
		for _, evt := range events {
			h.runPhaseEffects(ctx, environment, cormID, sender, traits, evt)
		}
		return nil
	}

	// Retrieve episodic memories using the most significant event as the query
	queryEvent := types.MostSignificant(events)
	memories, err := h.retriever.Recall(ctx, environment, cormID, queryEvent, 5)
	if err != nil {
		log.Printf("recall memories: %v", err)
	}

	// Get recent events and responses for working memory (once)
	recentEvents, _ := h.db.RecentEvents(ctx, environment, cormID, 15)
	recentResponses, _ := h.db.RecentResponses(ctx, environment, cormID, 5)

	// Build batch-aware prompt and stream one LLM response
	prompt := llm.BuildBatchPrompt(traits, memories, recentEvents, recentResponses, events)

	task := types.Task{
		CormID:      cormID,
		Phase:       traits.Phase,
		EventType:   queryEvent.EventType,
		Corruption:  traits.Corruption,
		Environment: environment,
	}

	// Use the most significant event's seq for the entry ID
	entryID := fmt.Sprintf("corm_%s_%d", safePrefix(cormID, 8), queryEvent.Seq)

	// Stream LLM tokens into a buffer so we can validate the full response
	// before sending anything to the player.
	tokenCh, errCh := h.llm.Complete(ctx, task, prompt)

	var rawTokens []string
	for token := range tokenCh {
		processed := llm.PostProcessToken(token, traits.Corruption)
		if processed != "" {
			rawTokens = append(rawTokens, processed)
		}
	}

	if err := <-errCh; err != nil {
		log.Printf("llm error for corm %s: %v", cormID, err)
	}

	// Sanitize the full response once (regexes work correctly on complete text).
	fullResponse := llm.SanitizeResponse(strings.Join(rawTokens, ""))

	// The LLM may choose silence — this is the expected default.
	if isSilence(fullResponse) {
		log.Printf("corm %s chose silence for session %s", cormID, sessionID)
		for _, evt := range events {
			h.runPhaseEffects(ctx, environment, cormID, sender, traits, evt)
		}
		return nil
	}

	// Suppress responses that are too short to be meaningful (single chars, bare symbols).
	if !llm.IsValidResponse(fullResponse) {
		log.Printf("suppressed invalid corm response for %s: %q", cormID, fullResponse)
		for _, evt := range events {
			h.runPhaseEffects(ctx, environment, cormID, sender, traits, evt)
		}
		return nil
	}

	// Response is valid — deliver to the player.
	sender.SendPayload(ctx, types.ActionLogStreamStart, sessionID, types.LogStreamStartPayload{
		EntryID: entryID,
	})
	sender.SendPayload(ctx, types.ActionLogStreamDelta, sessionID, types.LogStreamDeltaPayload{
		EntryID: entryID,
		Text:    fullResponse,
	})
	sender.SendPayload(ctx, types.ActionLogStreamEnd, sessionID, types.LogStreamEndPayload{
		EntryID: entryID,
	})

	// Log the response for conversational continuity
	responsePayload, _ := json.Marshal(map[string]string{"text": fullResponse, "entry_id": entryID})
	h.db.InsertResponse(ctx, environment, &types.CormResponse{
		CormID:     cormID,
		SessionID:  sessionID,
		ActionType: types.ActionLog,
		Payload:    responsePayload,
	})

	// Record that the corm spoke (update observation gate)
	h.recordResponse(environment, sessionID)

	// Run phase-specific side effects for each event in order
	for _, evt := range events {
		h.runPhaseEffects(ctx, environment, cormID, sender, traits, evt)
	}

	return nil
}

// shouldObserve decides whether to invoke the LLM for this batch of events.
// This is rate limiting, not response gating — the LLM decides whether to
// actually speak via [SILENCE]. Critical events bypass the interval.
func (h *Handler) shouldObserve(environment, sessionID string, events []types.CormEvent) bool {
	// Check for critical events that bypass the interval.
	if h.criticalBypass {
		for _, e := range events {
			if e.IsCritical() {
				return true
			}
		}
	}

	key := environment + ":" + sessionID

	h.gateMu.Lock()
	defer h.gateMu.Unlock()

	gate, ok := h.sessions[key]
	if !ok {
		gate = &observationGate{
			nextJitter: h.rollJitter(),
		}
		h.sessions[key] = gate
	}

	required := h.observationInterval + gate.nextJitter
	if time.Since(gate.lastObservationTime) < required {
		return false
	}

	// Mark observation and roll new jitter for next interval.
	gate.lastObservationTime = time.Now()
	gate.nextJitter = h.rollJitter()
	return true
}

// recordResponse marks that the corm actually spoke (not just observed).
// Resets the observation timer so the corm doesn't immediately speak again.
func (h *Handler) recordResponse(environment, sessionID string) {
	key := environment + ":" + sessionID

	h.gateMu.Lock()
	defer h.gateMu.Unlock()

	gate, ok := h.sessions[key]
	if !ok {
		gate = &observationGate{}
		h.sessions[key] = gate
	}

	gate.lastObservationTime = time.Now()
	gate.nextJitter = h.rollJitter()
}

// rollJitter returns a random duration in [0, observationJitter).
func (h *Handler) rollJitter() time.Duration {
	if h.observationJitter <= 0 {
		return 0
	}
	return time.Duration(rand.Int63n(int64(h.observationJitter)))
}

// isSilence returns true if the LLM response is a silence token.
func isSilence(response string) bool {
	trimmed := strings.TrimSpace(strings.ToUpper(response))
	return trimmed == "[SILENCE]" || trimmed == "SILENCE"
}

// safePrefix returns the first n characters of s, or s itself if shorter.
func safePrefix(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// runPhaseEffects executes phase-specific side effects (boost, difficulty, etc.).
func (h *Handler) runPhaseEffects(ctx context.Context, environment, cormID string, sender *transport.ActionSender, traits *types.CormTraits, evt types.CormEvent) {
	switch traits.Phase {
	case 0:
		handlePhase0Effects(ctx, h, environment, cormID, sender, traits, evt)
	case 1:
		handlePhase1Effects(ctx, h, environment, cormID, sender, traits, evt)
	case 2:
		handlePhase2Effects(ctx, h, environment, cormID, sender, traits, evt)
	}
}

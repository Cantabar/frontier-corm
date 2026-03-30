// Package reasoning routes player events to phase-specific logic and
// orchestrates corm responses.
package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/frontier-corm/corm-brain/internal/chain"
	"github.com/frontier-corm/corm-brain/internal/db"
	"github.com/frontier-corm/corm-brain/internal/memory"
	"github.com/frontier-corm/corm-brain/internal/transport"
	"github.com/frontier-corm/corm-brain/internal/types"
)

// NewHandler creates a new reasoning handler.
func NewHandler(database *db.DB, tm *transport.Manager, opts ...HandlerConfig) *Handler {
	h := &Handler{
		db:               database,
		tm:               tm,
		contractCooldown: 30 * time.Second, // default
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

// Handler processes player events and generates corm responses.
type Handler struct {
	db *db.DB
	tm *transport.Manager

	// Phase 2: contract generation
	registry         *chain.Registry
	chainClient      *chain.Client
	pricing          PricingConfig
	contractCooldown time.Duration
}

// HandlerConfig holds optional configuration for the reasoning handler.
type HandlerConfig struct {
	Registry         *chain.Registry
	ChainClient      *chain.Client
	Pricing          PricingConfig
	ContractCooldown time.Duration
}

// ProcessEvent handles a single event for a resolved corm.
// It delegates to ProcessEventBatch with a one-element slice.
func (h *Handler) ProcessEvent(ctx context.Context, environment, cormID string, evt types.CormEvent) error {
	return h.ProcessEventBatch(ctx, environment, cormID, []types.CormEvent{evt})
}

// ProcessEventBatch handles a batch of events for a single resolved corm/session.
// It stores raw events, checks for phase transitions, and runs per-event side
// effects. The LLM is only invoked once per phase transition.
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

	// Reduce traits immediately from the event batch.
	memory.ReduceEvents(traits, events)
	if err := h.db.UpsertTraits(ctx, environment, traits); err != nil {
		log.Printf("upsert traits after reduction: %v", err)
	}

	// Detect phase transitions before running effects or the LLM.
	transitioned := detectPhaseTransition(events, traits)
	if transitioned {
		if err := h.db.UpsertTraits(ctx, environment, traits); err != nil {
			log.Printf("upsert traits after transition: %v", err)
		}
		sender.SendPayload(ctx, types.ActionStateSync, sessionID, h.buildStateSyncPayload(ctx, environment, cormID, traits))
		log.Printf("corm %s transitioned to Phase %d", cormID, traits.Phase)
	}

	// Deliver a transition message (deterministic, no LLM).
	if transitioned {
		h.deliverTransitionResponse(ctx, environment, cormID, sessionID, sender, traits, events)
	}

	// Run phase-specific side effects for each event in order.
	for _, evt := range events {
		h.runPhaseEffects(ctx, environment, cormID, sender, traits, evt)
	}

	return nil
}

// detectPhaseTransition checks whether the event batch triggers a phase
// transition. If so, it mutates traits in place and returns true.
func detectPhaseTransition(events []types.CormEvent, traits *types.CormTraits) bool {
	// Explicit phase_transition event from puzzle-service (e.g. 0→1).
	for _, e := range events {
		if e.EventType == types.EventPhaseTransition {
			traits.Phase = traits.Phase + 1
			if traits.Phase == 1 {
				traits.Stability = 0
			}
			return true
		}
	}

	// Internal 1→2 transition: stability reached 100 during Phase 1.
	if traits.Phase == 1 && traits.Stability >= 100 {
		for _, e := range events {
			if e.EventType == types.EventWordSubmit {
				traits.Phase = 2
				return true
			}
		}
	}

	return false
}

// deliverTransitionResponse selects a deterministic in-character message for
// the current phase transition and delivers it to the player.
func (h *Handler) deliverTransitionResponse(ctx context.Context, environment, cormID, sessionID string, sender *transport.ActionSender, traits *types.CormTraits, events []types.CormEvent) {
	queryEvent := types.MostSignificant(events)
	entryID := fmt.Sprintf("corm_%s_%d", safePrefix(cormID, 8), queryEvent.Seq)

	text := selectTransitionMessage(cormID, traits.Phase, traits)
	if text == "" {
		log.Printf("corm %s: no transition message for phase %d", cormID, traits.Phase)
		return
	}

	sender.SendPayload(ctx, types.ActionLogStreamStart, sessionID, types.LogStreamStartPayload{
		EntryID: entryID,
	})
	sender.SendPayload(ctx, types.ActionLogStreamDelta, sessionID, types.LogStreamDeltaPayload{
		EntryID: entryID,
		Text:    text,
	})
	sender.SendPayload(ctx, types.ActionLogStreamEnd, sessionID, types.LogStreamEndPayload{
		EntryID: entryID,
	})

	responsePayload, _ := json.Marshal(map[string]string{"text": text, "entry_id": entryID})
	h.db.InsertResponse(ctx, environment, &types.CormResponse{
		CormID:     cormID,
		SessionID:  sessionID,
		ActionType: types.ActionLog,
		Payload:    responsePayload,
	})
}

// buildStateSyncPayload constructs a StateSyncPayload with the corm's
// current traits and resolved primary network node.
func (h *Handler) buildStateSyncPayload(ctx context.Context, environment, cormID string, traits *types.CormTraits) types.StateSyncPayload {
	payload := types.StateSyncPayload{
		Phase:      traits.Phase,
		Stability:  int(traits.Stability),
		Corruption: int(traits.Corruption),
	}
	nodeID, err := h.db.ResolveNetworkNodeByCorm(ctx, environment, cormID)
	if err != nil {
		log.Printf("resolve network node for corm %s: %v", cormID, err)
	} else {
		payload.NetworkNodeID = nodeID
	}
	return payload
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
	// Handle phase2_load from any phase — always respond with current state.
	if evt.EventType == types.EventPhase2Load {
		sender.SendPayload(ctx, types.ActionStateSync, evt.SessionID, h.buildStateSyncPayload(ctx, environment, cormID, traits))
		return
	}

	switch traits.Phase {
	case 0:
		handlePhase0Effects(ctx, h, environment, cormID, sender, traits, evt)
	case 1:
		handlePhase1Effects(ctx, h, environment, cormID, sender, traits, evt)
	case 2:
		handlePhase2Effects(ctx, h, environment, cormID, sender, traits, evt)
	}
}

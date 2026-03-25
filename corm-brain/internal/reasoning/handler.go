// Package reasoning routes player events to phase-specific logic and
// orchestrates LLM inference for corm responses.
package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

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
	sender    *transport.ActionSender
}

// NewHandler creates a new reasoning handler.
func NewHandler(database *db.DB, llmClient *llm.Client, retriever *memory.Retriever, sender *transport.ActionSender) *Handler {
	return &Handler{
		db:        database,
		llm:       llmClient,
		retriever: retriever,
		sender:    sender,
	}
}

// ProcessEvent handles a single event for a resolved corm.
func (h *Handler) ProcessEvent(ctx context.Context, cormID string, evt types.CormEvent) error {
	// Get traits
	traits, err := h.db.GetTraits(ctx, cormID)
	if err != nil {
		return fmt.Errorf("get traits: %w", err)
	}
	if traits == nil {
		// New corm — initialize default traits
		traits = &types.CormTraits{
			CormID: cormID,
			AgendaWeights: types.AgendaWeights{
				Industry: 0.33, Expansion: 0.33, Defense: 0.33,
			},
			Patience:             0.5,
			PlayerAffinities:     make(map[string]float64),
			ContractTypeAffinity: make(map[string]float64),
		}
		if err := h.db.UpsertTraits(ctx, traits); err != nil {
			return fmt.Errorf("init traits: %w", err)
		}
	}

	// Store the raw event
	if _, err := h.db.InsertEvent(ctx, cormID, evt); err != nil {
		log.Printf("insert event: %v", err)
	}

	// Retrieve episodic memories
	memories, err := h.retriever.Recall(ctx, cormID, evt, 5)
	if err != nil {
		log.Printf("recall memories: %v", err)
	}

	// Get recent events and responses for working memory
	recentEvents, _ := h.db.RecentEvents(ctx, cormID, 15)
	recentResponses, _ := h.db.RecentResponses(ctx, cormID, 5)

	// Build prompt and stream LLM response
	prompt := llm.BuildPrompt(traits, memories, recentEvents, recentResponses, evt)

	task := types.Task{
		CormID:     cormID,
		Phase:      traits.Phase,
		EventType:  evt.EventType,
		Corruption: traits.Corruption,
	}

	// Generate a unique entry ID for this streaming response
	entryID := fmt.Sprintf("corm_%s_%d", cormID[:8], evt.Seq)

	// Send stream start
	h.sender.SendPayload(ctx, types.ActionLogStreamStart, evt.SessionID, types.LogStreamStartPayload{
		EntryID: entryID,
	})

	// Stream LLM tokens
	tokenCh, errCh := h.llm.Complete(ctx, task, prompt)

	var fullResponse string
	for token := range tokenCh {
		// Apply corruption garbling
		processed := llm.PostProcessToken(token, traits.Corruption)
		fullResponse += processed

		h.sender.SendPayload(ctx, types.ActionLogStreamDelta, evt.SessionID, types.LogStreamDeltaPayload{
			EntryID: entryID,
			Text:    processed,
		})
	}

	// Check for errors
	if err := <-errCh; err != nil {
		log.Printf("llm error for corm %s: %v", cormID, err)
	}

	// Send stream end
	h.sender.SendPayload(ctx, types.ActionLogStreamEnd, evt.SessionID, types.LogStreamEndPayload{
		EntryID: entryID,
	})

	// Log the response for conversational continuity
	responsePayload, _ := json.Marshal(map[string]string{"text": fullResponse, "entry_id": entryID})
	h.db.InsertResponse(ctx, &types.CormResponse{
		CormID:     cormID,
		SessionID:  evt.SessionID,
		ActionType: types.ActionLog,
		Payload:    responsePayload,
	})

	// Run phase-specific side effects
	h.runPhaseEffects(ctx, cormID, traits, evt)

	return nil
}

// runPhaseEffects executes phase-specific side effects (boost, difficulty, etc.).
func (h *Handler) runPhaseEffects(ctx context.Context, cormID string, traits *types.CormTraits, evt types.CormEvent) {
	switch traits.Phase {
	case 0:
		handlePhase0Effects(ctx, h, cormID, traits, evt)
	case 1:
		handlePhase1Effects(ctx, h, cormID, traits, evt)
	case 2:
		handlePhase2Effects(ctx, h, cormID, traits, evt)
	}
}

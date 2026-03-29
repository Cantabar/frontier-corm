package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/frontier-corm/corm-brain/internal/chain"
	"github.com/frontier-corm/corm-brain/internal/llm"
	"github.com/frontier-corm/corm-brain/internal/transport"
	"github.com/frontier-corm/corm-brain/internal/types"
)

// contractCooldowns tracks per-corm contract generation timestamps.
var (
	contractCooldownMu sync.Mutex
	contractCooldowns  = make(map[string]time.Time) // cormID → last generation attempt
)

// handlePhase2Effects handles side effects for Phase 2 (contracts).
func handlePhase2Effects(ctx context.Context, h *Handler, environment, cormID string, sender *transport.ActionSender, traits *types.CormTraits, evt types.CormEvent) {
	switch evt.EventType {
	case types.EventContractComplete:
		// Sync updated state
		sender.SendPayload(ctx, types.ActionStateSync, evt.SessionID, types.StateSyncPayload{
			Phase:      traits.Phase,
			Stability:  int(traits.Stability),
			Corruption: int(traits.Corruption),
		})

		// TODO: Evaluate pattern alignment and mint CORM reward
		// TODO: Check if progression requirements met for Phase 3

	case types.EventContractFailed:
		sender.SendPayload(ctx, types.ActionStateSync, evt.SessionID, types.StateSyncPayload{
			Phase:      traits.Phase,
			Stability:  int(traits.Stability),
			Corruption: int(traits.Corruption),
		})

	default:
		// Attempt contract generation (rate-limited)
		if h.registry != nil && h.chainClient != nil {
			attemptContractGeneration(ctx, h, environment, cormID, sender, traits, evt)
		}
	}
}

// attemptContractGeneration runs the two-stage contract generation pipeline.
func attemptContractGeneration(ctx context.Context, h *Handler, environment, cormID string, sender *transport.ActionSender, traits *types.CormTraits, evt types.CormEvent) {
	// Rate limit: skip if cooldown hasn't elapsed
	contractCooldownMu.Lock()
	lastAttempt, ok := contractCooldowns[cormID]
	if ok && time.Since(lastAttempt) < h.contractCooldown {
		contractCooldownMu.Unlock()
		return
	}
	contractCooldowns[cormID] = time.Now()
	contractCooldownMu.Unlock()

	// Step 1: Build world state snapshot
	playerAddr := evt.PlayerAddress
	networkNodeID := evt.NetworkNodeID
	snapshot := chain.BuildSnapshot(ctx, h.chainClient, cormID, playerAddr, networkNodeID)

	// Check contract cap
	if snapshot.ActiveContracts >= 5 {
		log.Printf("phase2: contract cap reached for corm %s (%d/5)", cormID, snapshot.ActiveContracts)
		return
	}

	// Step 2: Retrieve episodic memories for contract context
	memories, err := h.retriever.Recall(ctx, environment, cormID, evt, 5)
	if err != nil {
		log.Printf("phase2: recall memories: %v", err)
	}

	// Step 3: Build contract prompt
	prompt := llm.BuildContractPrompt(traits, memories, snapshot, h.registry)

	// Step 4: Call Super (non-streaming — contract generation is not player-facing)
	task := types.Task{
		CormID:      cormID,
		Phase:       2,
		EventType:   evt.EventType,
		Corruption:  traits.Corruption,
		Environment: environment,
	}

	response, err := h.llm.CompleteSync(ctx, task, prompt, 0, llm.WithDisableReasoning())
	if err != nil {
		log.Printf("phase2: contract LLM call failed: %v", err)
		return
	}

	// Step 5: Parse JSON response into ContractIntent
	var intent types.ContractIntent
	if err := json.Unmarshal([]byte(response), &intent); err != nil {
		log.Printf("phase2: failed to parse contract intent: %v (response: %s)", err, truncateStr(response, 200))
		return
	}

	// Step 6: Resolve intent to exact parameters
	params, err := ResolveIntent(intent, snapshot, h.registry, traits, h.pricing, playerAddr)
	if err != nil {
		log.Printf("phase2: resolve intent failed: %v", err)
		return
	}

	// Step 7: Validate
	if err := ValidateParams(params, snapshot, h.registry); err != nil {
		log.Printf("phase2: validation failed: %v", err)
		return
	}

	// Step 8: Create contract on-chain (stub)
	contractID, err := h.chainClient.CreateContract(ctx, cormID, *params)
	if err != nil {
		log.Printf("phase2: create contract failed: %v", err)
		return
	}

	// Step 9: Notify puzzle-service
	sender.SendPayload(ctx, types.ActionContractCreated, evt.SessionID, types.ContractCreatedPayload{
		ContractID:   contractID,
		ContractType: params.ContractType,
		Description:  intent.Narrative,
		Reward:       fmt.Sprintf("%d CORM", params.CORMEscrowAmount),
		Deadline:     time.UnixMilli(params.DeadlineMs).Format(time.RFC3339),
	})

	// Step 10: Log for memory continuity
	responsePayload, _ := json.Marshal(map[string]string{
		"text":          intent.Narrative,
		"contract_id":   contractID,
		"contract_type": params.ContractType,
	})
	h.db.InsertResponse(ctx, environment, &types.CormResponse{
		CormID:     cormID,
		SessionID:  evt.SessionID,
		ActionType: types.ActionContractCreated,
		Payload:    responsePayload,
	})

	log.Printf("phase2: created %s contract %s for corm %s → %s", params.ContractType, contractID, cormID, playerAddr)
}

func truncateStr(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

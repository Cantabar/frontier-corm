package handlers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/frontier-corm/continuity-engine/internal/chain"
	"github.com/frontier-corm/continuity-engine/internal/db"
)

// APIHandler holds dependencies for JSON API endpoints called by the web app.
type APIHandler struct {
	database     *db.DB
	chainClients map[string]*chain.Client
	defaultEnv   string
}

// NewAPIHandler creates a handler for JSON API endpoints.
func NewAPIHandler(database *db.DB, chainClients map[string]*chain.Client, defaultEnv string) *APIHandler {
	return &APIHandler{
		database:     database,
		chainClients: chainClients,
		defaultEnv:   defaultEnv,
	}
}

// resetPhaseRequest is the JSON body for POST /api/reset-phase.
type resetPhaseRequest struct {
	NetworkNodeID string `json:"network_node_id"`
	Phase         int    `json:"phase"`
}

// ResetPhase handles POST /api/reset-phase — resets a corm's phase in DB
// and on-chain. Called by the web UI settings page.
func (a *APIHandler) ResetPhase(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	env := a.defaultEnv

	var req resetPhaseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.NetworkNodeID == "" {
		jsonError(w, "network_node_id is required", http.StatusBadRequest)
		return
	}
	if req.Phase < 0 || req.Phase > 6 {
		jsonError(w, "phase must be 0-6", http.StatusBadRequest)
		return
	}

	// Resolve network node → corm
	cormID, err := a.database.ResolveCormID(ctx, env, req.NetworkNodeID)
	if err != nil {
		slog.Error(fmt.Sprintf("api/reset-phase: resolve corm for node %s: %v", req.NetworkNodeID, err))
		jsonError(w, "failed to resolve corm", http.StatusInternalServerError)
		return
	}
	if cormID == "" {
		jsonError(w, "no corm found for this network node", http.StatusNotFound)
		return
	}

	// Load traits to verify existence
	traits, err := a.database.GetTraits(ctx, env, cormID)
	if err != nil || traits == nil {
		slog.Error(fmt.Sprintf("api/reset-phase: get traits for corm %s: %v", cormID, err))
		jsonError(w, "failed to load corm traits", http.StatusInternalServerError)
		return
	}

	prevPhase := traits.Phase

	// Reset traits in DB
	traits.Phase = req.Phase
	traits.Stability = 0
	traits.Corruption = 0
	if err := a.database.UpsertTraits(ctx, env, traits); err != nil {
		slog.Error(fmt.Sprintf("api/reset-phase: upsert traits for corm %s: %v", cormID, err))
		jsonError(w, "failed to update DB", http.StatusInternalServerError)
		return
	}
	slog.Info(fmt.Sprintf("api/reset-phase: DB updated corm %s phase %d→%d", cormID, prevPhase, req.Phase))

	// Sync on-chain via reset_state (allows phase regression)
	chainClient := a.chainClients[env]
	chainMsg := "skipped"
	if chainClient != nil && chainClient.CanUpdateCormState() {
		chainStateID, err := a.database.ResolveChainStateID(ctx, env, cormID)
		if err != nil {
			slog.Error(fmt.Sprintf("api/reset-phase: resolve chain_state_id for corm %s: %v", cormID, err))
		}
		if chainStateID != "" && chain.IsValidChainStateID(chainStateID) {
			if err := chainClient.ResetCormState(ctx, chainStateID, req.Phase, 0, 0); err != nil {
				slog.Error(fmt.Sprintf("api/reset-phase: chain reset for corm %s: %v", cormID, err))
				chainMsg = "failed: " + err.Error()
			} else {
				chainMsg = "ok"
			}
		} else {
			chainMsg = "skipped: no valid chain_state_id"
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"ok":    true,
		"phase": req.Phase,
		"chain": chainMsg,
	})
}

func jsonError(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

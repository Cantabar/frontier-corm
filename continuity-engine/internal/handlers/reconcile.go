package handlers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/frontier-corm/continuity-engine/internal/chain"
	"github.com/frontier-corm/continuity-engine/internal/db"
)

// ReconcileHandler holds dependencies for the chain reconciliation endpoint.
type ReconcileHandler struct {
	database     *db.DB
	chainClients map[string]*chain.Client
	defaultEnv   string
}

// NewReconcileHandler creates a handler for chain state reconciliation.
func NewReconcileHandler(database *db.DB, chainClients map[string]*chain.Client, defaultEnv string) *ReconcileHandler {
	return &ReconcileHandler{
		database:     database,
		chainClients: chainClients,
		defaultEnv:   defaultEnv,
	}
}

// ReconcileChain handles POST /debug/reconcile-chain — reads all corms from
// corm_traits, compares each with its on-chain CormState, and syncs any drift.
// Returns a JSON summary of what was reconciled.
func (rh *ReconcileHandler) ReconcileChain(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	env := rh.defaultEnv

	chainClient := rh.chainClients[env]
	if chainClient == nil || !chainClient.CanUpdateCormState() {
		http.Error(w, "chain client not configured for environment "+env, http.StatusServiceUnavailable)
		return
	}

	traits, err := rh.database.ListAllCormTraits(ctx, env)
	if err != nil {
		slog.Error(fmt.Sprintf("reconcile: list traits: %v", err))
		http.Error(w, "failed to list corm traits", http.StatusInternalServerError)
		return
	}

	type result struct {
		CormID       string `json:"corm_id"`
		ChainStateID string `json:"chain_state_id"`
		DBPhase      int    `json:"db_phase"`
		ChainPhase   int    `json:"chain_phase"`
		Action       string `json:"action"`
	}
	var results []result

	for _, t := range traits {
		chainStateID, err := rh.database.ResolveChainStateID(ctx, env, t.CormID)
		if err != nil {
			results = append(results, result{CormID: t.CormID, Action: "error: " + err.Error()})
			continue
		}
		if chainStateID == "" || !chain.IsValidChainStateID(chainStateID) {
			results = append(results, result{CormID: t.CormID, ChainStateID: chainStateID, DBPhase: t.Phase, Action: "skipped: no valid chain_state_id"})
			continue
		}

		onChain, err := chainClient.GetCormState(ctx, chainStateID)
		if err != nil {
			results = append(results, result{CormID: t.CormID, ChainStateID: chainStateID, DBPhase: t.Phase, Action: "error: " + err.Error()})
			continue
		}
		if onChain == nil {
			results = append(results, result{CormID: t.CormID, ChainStateID: chainStateID, DBPhase: t.Phase, Action: "skipped: on-chain object not found"})
			continue
		}

		if onChain.Phase == t.Phase && onChain.Stability == int(t.Stability) && onChain.Corruption == int(t.Corruption) {
			results = append(results, result{CormID: t.CormID, ChainStateID: chainStateID, DBPhase: t.Phase, ChainPhase: onChain.Phase, Action: "ok: in sync"})
			continue
		}

		if err := chainClient.UpdateCormState(ctx, chainStateID, t.Phase, t.Stability, t.Corruption); err != nil {
			results = append(results, result{CormID: t.CormID, ChainStateID: chainStateID, DBPhase: t.Phase, ChainPhase: onChain.Phase, Action: "error: " + err.Error()})
			slog.Error(fmt.Sprintf("reconcile: update corm %s (chain_state=%s): %v", t.CormID, chainStateID, err))
		} else {
			results = append(results, result{CormID: t.CormID, ChainStateID: chainStateID, DBPhase: t.Phase, ChainPhase: onChain.Phase, Action: "synced"})
			slog.Info(fmt.Sprintf("reconcile: synced corm %s (phase %d→%d)", t.CormID, onChain.Phase, t.Phase))
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"environment": env,
		"total":       len(traits),
		"results":     results,
	})
}

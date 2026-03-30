package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/frontier-corm/continuity-engine/internal/puzzle"
)

// Phase2Data is the template data for the Phase 2 contracts dashboard.
type Phase2Data struct {
	Phase             int
	SessionID         string
	Stability         int
	Corruption        int
	Contracts         []puzzle.AIContract
	ActiveCount       int
	CompletedPatterns int
	MetersHidden      bool
	ShowEntrance      bool   // true when loaded via phase transition auto-load
	NetworkNodeID     string // bound network node (empty = show bind form)
}

// Phase2Transition serves GET /phase2/transition — renders the Phase 2 transition animation.
func (h *Handlers) Phase2Transition(w http.ResponseWriter, r *http.Request) {
	sess := getSession(r)
	if sess == nil {
		http.Error(w, "no session", http.StatusUnauthorized)
		return
	}

	// Ensure session is in Phase 2
	if sess.Phase < puzzle.PhaseContracts {
		sess.TransitionToPhase2()
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	h.templates.ExecuteTemplate(w, "transition-phase2.html", nil)
}

// Phase2Page serves GET /phase2 — renders the Phase 2 contracts dashboard.
func (h *Handlers) Phase2Page(w http.ResponseWriter, r *http.Request) {
	sess := getSession(r)
	if sess == nil {
		http.Error(w, "no session", http.StatusUnauthorized)
		return
	}

	// If not in Phase 2 yet, redirect to the appropriate phase
	if sess.Phase < puzzle.PhaseContracts {
		if sess.Phase == puzzle.PhaseAwakening {
			http.Redirect(w, r, "/phase0", http.StatusFound)
		} else {
			http.Redirect(w, r, "/puzzle", http.StatusFound)
		}
		return
	}

	active := sess.ActiveAIContracts()
	data := Phase2Data{
		Phase:             int(sess.Phase),
		SessionID:         sess.ID,
		Stability:         sess.Stability,
		Corruption:        sess.Corruption,
		Contracts:         active,
		ActiveCount:       len(active),
		CompletedPatterns: sess.CompletedPatterns,
		MetersHidden:      sess.Stability == 0 && sess.Corruption == 0,
		NetworkNodeID:     sess.GetNetworkNodeID(),
	}

	if r.URL.Query().Get("transition") == "1" {
		data.ShowEntrance = true
	}

	// HTMX partial request — return just the content
	if r.Header.Get("HX-Request") != "" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		h.templates.ExecuteTemplate(w, "phase2-content.html", data)
	} else {
		h.renderTemplate(w, "layout.html", data)
	}

	// Emit phase2_load so corm-brain sends back a state_sync with the
	// network node (resolves the binding for returning players).
	evt := buildEvent(sess, "phase2_load", nil)
	sess.EventBuffer.Push(evt)
	go h.dispatcher.EmitEvent(evt)
}

// Phase2BindNode handles POST /phase2/bind-node — binds a network node to the session.
func (h *Handlers) Phase2BindNode(w http.ResponseWriter, r *http.Request) {
	sess := getSession(r)
	if sess == nil {
		http.Error(w, "no session", http.StatusUnauthorized)
		return
	}

	nodeID := strings.TrimSpace(r.FormValue("network_node_id"))
	if nodeID == "" {
		http.Error(w, "missing network_node_id", http.StatusBadRequest)
		return
	}

	// Store on session
	sess.SetNetworkNodeID(nodeID)

	// Emit node_bind event to corm-brain
	payload, _ := json.Marshal(map[string]any{
		"network_node_id": nodeID,
	})
	evt := buildEvent(sess, "node_bind", payload)
	sess.EventBuffer.Push(evt)
	go h.dispatcher.EmitEvent(evt)

	// Return the bound-node indicator partial (replaces the bind form via HTMX)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	h.templates.ExecuteTemplate(w, "node-bound.html", map[string]string{
		"NetworkNodeID": nodeID,
	})
}

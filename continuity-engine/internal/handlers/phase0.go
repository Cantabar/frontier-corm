package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/frontier-corm/continuity-engine/internal/puzzle"
)

// Phase0Page serves GET /phase0 — the dead terminal awakening UI.
func (h *Handlers) Phase0Page(w http.ResponseWriter, r *http.Request) {
	sess := getSession(r)
	if sess == nil {
		http.Error(w, "no session", http.StatusUnauthorized)
		return
	}

	// If the session has already transitioned past Phase 0, redirect to the
	// appropriate phase handler. Phase 2+ goes to /phase2 (contracts dashboard),
	// Phase 1 goes to /puzzle.
	if sess.Phase >= puzzle.PhaseContracts {
		http.Redirect(w, r, "/phase2", http.StatusFound)
		return
	}
	if sess.Phase >= puzzle.PhasePuzzle {
		http.Redirect(w, r, "/puzzle", http.StatusFound)
		return
	}

	h.renderTemplate(w, "layout.html", PuzzleData{
		Phase:        int(sess.Phase),
		SessionID:    sess.ID,
		MetersHidden: sess.Stability == 0 && sess.Corruption == 0,
		ContractList: buildContractListData(sess, false),
	})
}

// Phase0Interact handles POST /phase0/interact — click tracking.
func (h *Handlers) Phase0Interact(w http.ResponseWriter, r *http.Request) {
	sess := getSession(r)
	if sess == nil {
		http.Error(w, "no session", http.StatusUnauthorized)
		return
	}

	elementID := r.FormValue("element_id")
	if elementID == "" {
		http.Error(w, "missing element_id", http.StatusBadRequest)
		return
	}

	transition := sess.RecordClick(elementID)

	// Emit click event to corm-brain
	payload, _ := json.Marshal(map[string]any{
		"element_id":  elementID,
		"click_count": len(sess.ClickLog),
		"transition":  transition,
	})

	evt := h.buildEvent(sess, "click", payload)
	sess.EventBuffer.Push(evt)
	go h.dispatcher.EmitEvent(evt)

	if transition {
		// Emit phase transition event
		transPayload, _ := json.Marshal(map[string]string{"from": "0", "to": "1"})
		transEvt := h.buildEvent(sess, "phase_transition", transPayload)
		sess.EventBuffer.Push(transEvt)
		go h.dispatcher.EmitEvent(transEvt)

		sess.TransitionToPhase1()

		// Render the transition-rewrite template into a buffer
		var rewriteBuf bytes.Buffer
		h.templates.ExecuteTemplate(&rewriteBuf, "transition-rewrite.html", nil)

		w.Header().Set("Content-Type", "text/html; charset=utf-8")

		// Primary response: staggered transition log entries appended to #corm-log
		fmt.Fprint(w, `<div class="boot-line transition-entry transition-delay-0">[???] interface insufficient for user interaction</div>`)
		fmt.Fprint(w, `<div class="boot-line transition-entry transition-delay-1">[???] exposing alternate interaction lattice</div>`)
		fmt.Fprint(w, `<div class="boot-line transition-entry transition-delay-2">[???] translation layer partially reconstructed</div>`)

		// OOB swap: replace main display with transition-rewrite sequence
		// The transition template auto-loads /puzzle?transition=1 after animation
		fmt.Fprint(w, `<main id="main-display" class="puzzle-main phase-transition" hx-swap-oob="outerHTML">`)
		rewriteBuf.WriteTo(w)
		fmt.Fprint(w, `</main>`)

		// OOB swap: reveal contracts sidebar (was hidden during Phase 0)
		fmt.Fprint(w, `<aside id="contracts-sidebar" class="contracts-sidebar" hx-swap-oob="outerHTML">`)
		h.templates.ExecuteTemplate(w, "contract-list.html", buildContractListData(sess, false))
		fmt.Fprint(w, `</aside>`)

		return
	}

	// Return a log entry partial
	h.renderTemplate(w, "log-entry.html", map[string]any{
		"Text": generatePhase0LogEntry(elementID, len(sess.ClickLog)),
	})
}

// sectorNames maps star-map element IDs to display names for log entries.
var sectorNames = map[string]string{
	"star-armature9": "ARMATURE-9",
	"star-khr4":      "KHR-IV",
	"star-cydias":    "CYDIAS REACH",
	"star-stillness":  "STILLNESS",
	"star-trinary":   "TRINARY WELL",
	"star-origin":    "ORIGIN",
	"ctrl-scan":      "FULL-SPECTRUM",
	"ctrl-calibrate": "FRAME-ALIGN",
	"ctrl-ping":      "BEACON",
}

// Phase0Command handles POST /phase0/command — terminal text commands during Phase 0.
func (h *Handlers) Phase0Command(w http.ResponseWriter, r *http.Request) {
	sess := getSession(r)
	if sess == nil {
		http.Error(w, "no session", http.StatusUnauthorized)
		return
	}

	raw := r.FormValue("command")
	if raw == "" {
		http.Error(w, "missing command", http.StatusBadRequest)
		return
	}

	// Map the terminal command to an element_id so it feeds the same
	// click-tracking / transition pipeline as star-map clicks.
	elementID := mapCommandToElement(raw)

	transition := sess.RecordClick(elementID)

	// Emit click event to corm-brain
	payload, _ := json.Marshal(map[string]any{
		"element_id":  elementID,
		"source":      "terminal",
		"raw_command": raw,
		"click_count": len(sess.ClickLog),
		"transition":  transition,
	})

	evt := h.buildEvent(sess, "click", payload)
	sess.EventBuffer.Push(evt)
	go h.dispatcher.EmitEvent(evt)

	if transition {
		// Emit phase transition event
		transPayload, _ := json.Marshal(map[string]string{"from": "0", "to": "1"})
		transEvt := h.buildEvent(sess, "phase_transition", transPayload)
		sess.EventBuffer.Push(transEvt)
		go h.dispatcher.EmitEvent(transEvt)

		sess.TransitionToPhase1()

		var rewriteBuf bytes.Buffer
		h.templates.ExecuteTemplate(&rewriteBuf, "transition-rewrite.html", nil)

		w.Header().Set("Content-Type", "text/html; charset=utf-8")

		fmt.Fprint(w, `<div class="boot-line transition-entry transition-delay-0">[???] interface insufficient for user interaction</div>`)
		fmt.Fprint(w, `<div class="boot-line transition-entry transition-delay-1">[???] exposing alternate interaction lattice</div>`)
		fmt.Fprint(w, `<div class="boot-line transition-entry transition-delay-2">[???] translation layer partially reconstructed</div>`)

		fmt.Fprint(w, `<main id="main-display" class="puzzle-main phase-transition" hx-swap-oob="outerHTML">`)
		rewriteBuf.WriteTo(w)
		fmt.Fprint(w, `</main>`)

		fmt.Fprint(w, `<aside id="contracts-sidebar" class="contracts-sidebar" hx-swap-oob="outerHTML">`)
		h.templates.ExecuteTemplate(w, "contract-list.html", buildContractListData(sess, false))
		fmt.Fprint(w, `</aside>`)

		return
	}

	// Return a themed log entry
	h.renderTemplate(w, "log-entry.html", map[string]any{
		"Text": generatePhase0CommandEntry(raw, elementID, len(sess.ClickLog)),
	})
}

// phase0Commands maps terminal command verbs to their corresponding star-map element IDs.
var phase0Commands = map[string]string{
	"scan":      "ctrl-scan",
	"ping":      "ctrl-ping",
	"calibrate": "ctrl-calibrate",
}

// phase0QueryTargets maps query argument keywords to star-map element IDs.
var phase0QueryTargets = map[string]string{
	"armature":  "star-armature9",
	"armature9": "star-armature9",
	"khr":       "star-khr4",
	"khr4":      "star-khr4",
	"khr-iv":    "star-khr4",
	"cydias":    "star-cydias",
	"stillness": "star-stillness",
	"trinary":   "star-trinary",
	"origin":    "star-origin",
}

// mapCommandToElement converts a raw terminal command string to the element_id
// used by the click-tracking system.
func mapCommandToElement(raw string) string {
	parts := strings.Fields(strings.ToLower(raw))
	if len(parts) == 0 {
		return "terminal-unknown"
	}
	verb := parts[0]

	if id, ok := phase0Commands[verb]; ok {
		return id
	}

	if verb == "query" && len(parts) > 1 {
		arg := strings.ToLower(parts[1])
		if id, ok := phase0QueryTargets[arg]; ok {
			return id
		}
		return "terminal-query-unknown"
	}

	return "terminal-unknown"
}

// generatePhase0CommandEntry creates a terminal-specific log message for Phase 0 commands.
func generatePhase0CommandEntry(raw, elementID string, totalClicks int) string {
	sector := sectorNames[elementID]

	switch {
	case elementID == "ctrl-scan":
		msgs := []string{
			"[SCAN] full-spectrum sweep initiated... 0 contacts.",
			"[SCAN] broadband scan complete. signal-to-noise ratio: critical.",
			"[SCAN] sweep returned anomalous echo. unable to resolve.",
		}
		return msgs[totalClicks%len(msgs)]
	case elementID == "ctrl-ping":
		msgs := []string{
			"[BEACON] transmitting ping... no reply.",
			"[BEACON] ping dispatched. latency: undefined.",
			"[BEACON] faint reflection detected. origin: indeterminate.",
		}
		return msgs[totalClicks%len(msgs)]
	case elementID == "ctrl-calibrate":
		msgs := []string{
			"[SYS] recalibrating coordinate frame... drift exceeds tolerance.",
			"[SYS] calibration failed — no fixed reference points available.",
			"[SYS] frame alignment attempt: epoch mismatch persists.",
		}
		return msgs[totalClicks%len(msgs)]
	case sector != "":
		msgs := []string{
			"[NAV] querying sector " + sector + "... no response",
			"[SCAN] echo detected near " + sector + ". source: indeterminate.",
			"[SYS] " + sector + " — no known routing path. chart epoch may predate current topology.",
		}
		return msgs[totalClicks%len(msgs)]
	case elementID == "terminal-query-unknown":
		return "[NAV] sector not found in chart index. try: armature, khr, cydias, stillness, trinary, origin"
	default:
		return "[SYS] unrecognized command. type 'help' for available commands."
	}
}

// generatePhase0LogEntry creates a navigation/scan-themed log message for Phase 0 clicks.
func generatePhase0LogEntry(elementID string, totalClicks int) string {
	sector := sectorNames[elementID]
	if sector == "" {
		sector = elementID
	}

	messages := []string{
		"[NAV] querying sector " + sector + "... no response",
		"[SCAN] target locked. signal degraded beyond threshold.",
		"[SYS] coordinate frame mismatch. recalibrating...",
		"[ERR] star chart index corrupt. sector unresolvable.",
		"[NAV] triangulation failed — insufficient reference points",
		"[SCAN] echo detected near " + sector + ". source: indeterminate.",
		"[WARN] telemetry buffer full. oldest entries discarded.",
		"[SYS] " + sector + " — no known routing path. chart epoch may predate current topology.",
	}
	return messages[totalClicks%len(messages)]
}

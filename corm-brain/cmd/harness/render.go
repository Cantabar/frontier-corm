package main

import (
	"encoding/json"
	"fmt"
	"io"
	"sync"

	"github.com/frontier-corm/corm-brain/internal/types"
)

// Renderer formats received CormAction messages for terminal output.
// It handles streaming log entries (start/delta/end) to produce a live
// typing effect, and prints non-streaming actions as formatted JSON.
type Renderer struct {
	w  io.Writer
	mu sync.Mutex

	// streaming state
	activeEntry string // entry_id of the in-progress streaming log
	streamBuf   string // accumulated text for the current stream
}

// NewRenderer creates a renderer writing to w (typically os.Stdout).
func NewRenderer(w io.Writer) *Renderer {
	return &Renderer{w: w}
}

// RenderAction dispatches a CormAction to the appropriate render method.
func (r *Renderer) RenderAction(action types.CormAction) {
	r.mu.Lock()
	defer r.mu.Unlock()

	switch action.ActionType {
	case types.ActionLogStreamStart:
		r.renderStreamStart(action)
	case types.ActionLogStreamDelta:
		r.renderStreamDelta(action)
	case types.ActionLogStreamEnd:
		r.renderStreamEnd(action)
	case types.ActionLog:
		r.renderLog(action)
	case types.ActionBoost:
		r.renderJSON("boost", action)
	case types.ActionDifficulty:
		r.renderJSON("difficulty", action)
	case types.ActionStateSync:
		r.renderStateSync(action)
	case types.ActionContractCreated:
		r.renderJSON("contract_created", action)
	case types.ActionContractUpdated:
		r.renderJSON("contract_updated", action)
	default:
		r.renderJSON(action.ActionType, action)
	}
}

func (r *Renderer) renderStreamStart(action types.CormAction) {
	var p types.LogStreamStartPayload
	json.Unmarshal(action.Payload, &p)

	r.activeEntry = p.EntryID
	r.streamBuf = ""
	fmt.Fprintf(r.w, "\n\033[36m[corm]\033[0m ")
}

func (r *Renderer) renderStreamDelta(action types.CormAction) {
	var p types.LogStreamDeltaPayload
	json.Unmarshal(action.Payload, &p)

	r.streamBuf += p.Text
	// Print inline — no newline, produces live typing effect
	fmt.Fprint(r.w, p.Text)
}

func (r *Renderer) renderStreamEnd(action types.CormAction) {
	var p types.LogStreamEndPayload
	json.Unmarshal(action.Payload, &p)

	if r.streamBuf != "" {
		fmt.Fprintln(r.w) // newline after the streamed text
	}
	r.activeEntry = ""
	r.streamBuf = ""
}

func (r *Renderer) renderLog(action types.CormAction) {
	var p struct {
		Text string `json:"text"`
	}
	json.Unmarshal(action.Payload, &p)
	fmt.Fprintf(r.w, "\n\033[36m[corm]\033[0m %s\n", p.Text)
}

func (r *Renderer) renderStateSync(action types.CormAction) {
	var p types.StateSyncPayload
	json.Unmarshal(action.Payload, &p)
	fmt.Fprintf(r.w, "\033[33m[state_sync]\033[0m phase=%d stability=%d corruption=%d\n", p.Phase, p.Stability, p.Corruption)
}

func (r *Renderer) renderJSON(label string, action types.CormAction) {
	pretty, _ := json.MarshalIndent(json.RawMessage(action.Payload), "  ", "  ")
	fmt.Fprintf(r.w, "\033[33m[%s]\033[0m session=%s\n  %s\n", label, action.SessionID, string(pretty))
}

// PrintStatus prints a separator to stdout (used between CLI interactions).
func (r *Renderer) PrintStatus(msg string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	fmt.Fprintf(r.w, "\033[90m--- %s ---\033[0m\n", msg)
}

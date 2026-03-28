// Package types defines the core domain types shared across the corm-brain service.
package types

import (
	"encoding/json"
	"time"
)

// --- Player Events (received from puzzle-service) ---

// CormEvent is a player action received over the WebSocket from puzzle-service.
type CormEvent struct {
	Type          string          `json:"type"`
	Seq           uint64          `json:"seq"`
	SessionID     string          `json:"session_id"`
	PlayerAddress string          `json:"player_address"`
	NetworkNodeID string          `json:"network_node_id"`
	Context       string          `json:"context"`
	EventType     string          `json:"event_type"`
	Payload       json.RawMessage `json:"payload"`
	Timestamp     time.Time       `json:"timestamp"`
	Environment   string          `json:"-"` // set by transport layer, not from wire
}

// Event type constants.
const (
	EventClick           = "click"
	EventDecrypt         = "decrypt"
	EventWordSubmit      = "word_submit"
	EventContractComplete = "contract_complete"
	EventContractFailed  = "contract_failed"
	EventPurge           = "purge"
	EventPhaseTransition = "phase_transition"
)

// Significance returns a priority score for the event type.
// Higher values indicate events that deserve more attention from the LLM.
func (e CormEvent) Significance() int {
	switch e.EventType {
	case EventPhaseTransition:
		return 100
	case EventContractComplete, EventContractFailed:
		return 80
	case EventWordSubmit:
		return 60
	case EventPurge:
		return 50
	case EventDecrypt:
		return 20
	case EventClick:
		return 10
	default:
		return 5
	}
}

// MostSignificant returns the event with the highest significance from the slice.
// Returns the first element if the slice has one entry.
func MostSignificant(events []CormEvent) CormEvent {
	best := events[0]
	for _, e := range events[1:] {
		if e.Significance() > best.Significance() {
			best = e
		}
	}
	return best
}

// --- Corm Actions (sent to puzzle-service) ---

// CormAction is a directive sent to the puzzle-service over WebSocket.
type CormAction struct {
	ActionType string          `json:"action_type"`
	SessionID  string          `json:"session_id"`
	Payload    json.RawMessage `json:"payload"`
}

// Action type constants.
const (
	ActionLog             = "log"
	ActionLogStreamStart  = "log_stream_start"
	ActionLogStreamDelta  = "log_stream_delta"
	ActionLogStreamEnd    = "log_stream_end"
	ActionBoost           = "boost"
	ActionDifficulty      = "difficulty"
	ActionStateSync       = "state_sync"
	ActionContractCreated = "contract_created"
	ActionContractUpdated = "contract_updated"
)

// --- Action Payloads ---

// LogStreamStartPayload initiates a streaming log entry.
type LogStreamStartPayload struct {
	EntryID string `json:"entry_id"`
}

// LogStreamDeltaPayload carries a token delta for a streaming log entry.
type LogStreamDeltaPayload struct {
	EntryID string `json:"entry_id"`
	Text    string `json:"text"`
}

// LogStreamEndPayload terminates a streaming log entry.
type LogStreamEndPayload struct {
	EntryID string `json:"entry_id"`
}

// StateSyncPayload carries updated corm state values.
type StateSyncPayload struct {
	Phase      int `json:"phase"`
	Stability  int `json:"stability"`
	Corruption int `json:"corruption"`
}

// BoostPayload carries boost effect data.
type BoostPayload struct {
	Cells  []CellRef `json:"cells"`
	Effect string    `json:"effect"`
}

// CellRef is a row/col pair used in boost payloads.
type CellRef struct {
	Row int `json:"row"`
	Col int `json:"col"`
}

// DifficultyPayload carries difficulty adjustment deltas.
type DifficultyPayload struct {
	TierDelta     int `json:"tier_delta"`
	DecoyDelta    int `json:"decoy_delta"`
	GridSizeDelta int `json:"grid_size_delta"`
}

// ContractCreatedPayload carries a new contract directive.
type ContractCreatedPayload struct {
	ContractID   string `json:"contract_id"`
	ContractType string `json:"contract_type"`
	Description  string `json:"description"`
	Reward       string `json:"reward"`
	Deadline     string `json:"deadline"`
}

// --- Per-Corm State ---

// CormTraits holds the learned state for a single corm (Layer 2).
type CormTraits struct {
	CormID                   string             `json:"corm_id"`
	Phase                    int                `json:"phase"`
	Stability                float64            `json:"stability"`
	Corruption               float64            `json:"corruption"`
	AgendaWeights            AgendaWeights      `json:"agenda_weights"`
	ContractTypeAffinity     map[string]float64 `json:"contract_type_affinity"`
	Patience                 float64            `json:"patience"`
	Paranoia                 float64            `json:"paranoia"`
	Volatility               float64            `json:"volatility"`
	PlayerAffinities         map[string]float64 `json:"player_affinities"`
	ConsolidationCheckpoint  int64              `json:"consolidation_checkpoint"`
	UpdatedAt                time.Time          `json:"updated_at"`
}

// AgendaWeights holds the corm's current agenda distribution.
type AgendaWeights struct {
	Industry  float64 `json:"industry"`
	Expansion float64 `json:"expansion"`
	Defense   float64 `json:"defense"`
}

// CormMemory is an episodic memory entry (Layer 3).
type CormMemory struct {
	ID             int64     `json:"id"`
	CormID         string    `json:"corm_id"`
	MemoryText     string    `json:"memory_text"`
	MemoryType     string    `json:"memory_type"`
	Importance     float64   `json:"importance"`
	SourceEvents   []int64   `json:"source_events"`
	Embedding      []float32 `json:"embedding,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	LastRecalledAt time.Time `json:"last_recalled_at"`
}

// Memory type constants.
const (
	MemoryObservation = "observation"
	MemoryBetrayal    = "betrayal"
	MemoryAchievement = "achievement"
	MemoryPattern     = "pattern"
	MemoryWarning     = "warning"
)

// CormResponse is a logged corm response for conversational continuity.
type CormResponse struct {
	ID         int64           `json:"id"`
	CormID     string          `json:"corm_id"`
	SessionID  string          `json:"session_id"`
	ActionType string          `json:"action_type"`
	Payload    json.RawMessage `json:"payload"`
	CreatedAt  time.Time       `json:"created_at"`
}

// --- LLM Types ---

// Message is an OpenAI-compatible chat message.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Task describes the context for an LLM inference request.
type Task struct {
	CormID      string
	Phase       int
	EventType   string
	Corruption  float64
	Environment string
}

// RequiresDeepReasoning returns true if the task should use the Super model.
func (t Task) RequiresDeepReasoning() bool {
	if t.Phase >= 2 {
		return true
	}
	if t.EventType == EventContractComplete || t.EventType == EventPhaseTransition {
		return true
	}
	return false
}

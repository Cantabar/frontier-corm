package tests

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/frontier-corm/corm-brain/internal/llm"
	"github.com/frontier-corm/corm-brain/internal/types"
)

func TestBuildPromptIncludesAllLayers(t *testing.T) {
	traits := &types.CormTraits{
		CormID:    "test-corm",
		Phase:     1,
		Stability: 50,
		Corruption: 10,
		AgendaWeights: types.AgendaWeights{
			Industry: 0.5, Expansion: 0.3, Defense: 0.2,
		},
		Patience: 0.6,
		Paranoia: 0.1,
		Volatility: 0.05,
		PlayerAffinities: map[string]float64{"0xabc123456789": 0.8},
	}

	memories := []types.CormMemory{
		{MemoryText: "Player reliably completes transport contracts", Importance: 0.8},
	}

	recentEvents := []types.CormEvent{
		{EventType: "click", PlayerAddress: "0xabc123456789", Context: "browser"},
	}

	currentEvent := types.CormEvent{
		EventType:     "decrypt",
		PlayerAddress: "0xabc123456789",
		Context:       "browser",
		Timestamp:     time.Now(),
	}

	msgs := llm.BuildPrompt(traits, memories, recentEvents, nil, currentEvent)

	if len(msgs) < 3 {
		t.Fatalf("expected at least 3 messages, got %d", len(msgs))
	}

	// Layer 1: system prompt should contain corm identity
	if msgs[0].Role != "system" {
		t.Error("first message should be system role")
	}
	if !strings.Contains(msgs[0].Content, "corm") {
		t.Error("system prompt should mention corm")
	}

	// Layer 2: should contain trait context
	found := false
	for _, m := range msgs {
		if strings.Contains(m.Content, "[STATE]") {
			found = true
			break
		}
	}
	if !found {
		t.Error("prompt should contain trait context ([STATE])")
	}

	// Layer 3: should contain memory
	found = false
	for _, m := range msgs {
		if strings.Contains(m.Content, "[MEMORY]") {
			found = true
			break
		}
	}
	if !found {
		t.Error("prompt should contain episodic memories")
	}
}

func TestPhase0PromptNoEllipsis(t *testing.T) {
	traits := &types.CormTraits{
		Phase:         0,
		AgendaWeights: types.AgendaWeights{Industry: 0.33, Expansion: 0.33, Defense: 0.33},
	}
	currentEvent := types.CormEvent{EventType: "click", PlayerAddress: "0xabc123456789", Context: "browser"}
	msgs := llm.BuildPrompt(traits, nil, nil, nil, currentEvent)

	system := msgs[0].Content
	if strings.Contains(system, "> ...") {
		t.Error("Phase 0 prompt should not contain ellipsis examples")
	}
	if strings.Contains(system, "use \"> \" prefix") || strings.Contains(system, "Formatting: use \"> \"") {
		t.Error("Phase 0 prompt should not instruct > prefix usage")
	}
	if !strings.Contains(system, "NEVER use ellipsis") {
		t.Error("system prompt should explicitly forbid ellipsis")
	}
}

func TestSanitizeResponseStripsAnglePrefix(t *testing.T) {
	cases := []struct {
		input, want string
	}{
		{"> signal detected", "signal detected"},
		{">...input...detected...", "inputdetected"},
		{">...>...>... noise", "noise"},
		{"clean text", "clean text"},
		{"multi\n> line\n> test", "multi\nline\ntest"},
	}
	for _, tc := range cases {
		got := llm.SanitizeResponse(tc.input)
		if got != tc.want {
			t.Errorf("SanitizeResponse(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestPostProcessTokenNoCorruption(t *testing.T) {
	input := "hello world"
	result := llm.PostProcessToken(input, 0)
	if result != input {
		t.Errorf("expected no change at corruption=0, got %q", result)
	}
}

func TestPostProcessTokenHighCorruption(t *testing.T) {
	input := "hello world"
	// At high corruption, some characters should be garbled
	garbled := false
	for i := 0; i < 100; i++ {
		result := llm.PostProcessToken(input, 80)
		if result != input {
			garbled = true
			break
		}
	}
	if !garbled {
		t.Error("expected some garbling at corruption=80 over 100 trials")
	}
}

func TestPostProcessTokenPreservesSpaces(t *testing.T) {
	result := llm.PostProcessToken("a b c", 100)
	// Spaces should always be preserved
	if !strings.Contains(result, " ") {
		t.Error("spaces should be preserved in garbled output")
	}
}

func TestTruncateResponse(t *testing.T) {
	long := strings.Repeat("a", 500)
	result := llm.TruncateResponse(long, 100)
	if len(result) > 103 { // 100 + "..."
		t.Errorf("expected truncated length <= 103, got %d", len(result))
	}
	if !strings.HasSuffix(result, "...") {
		t.Error("truncated response should end with ...")
	}
}

func TestPhase1SignificanceTrap(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"is_trap": true, "is_address": false})
	evt := types.CormEvent{EventType: types.EventDecrypt, Payload: payload}
	if sig := evt.Phase1Significance(); sig != 80 {
		t.Errorf("trap decrypt significance = %d, want 80", sig)
	}
}

func TestPhase1SignificanceAddressChar(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"is_address": true, "is_trap": false})
	evt := types.CormEvent{EventType: types.EventDecrypt, Payload: payload}
	if sig := evt.Phase1Significance(); sig != 70 {
		t.Errorf("address char decrypt significance = %d, want 70", sig)
	}
}

func TestPhase1SignificanceRoutineDecrypt(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"is_address": false, "is_trap": false})
	evt := types.CormEvent{EventType: types.EventDecrypt, Payload: payload}
	if sig := evt.Phase1Significance(); sig != 10 {
		t.Errorf("routine decrypt significance = %d, want 10", sig)
	}
}

func TestPhase1SignificanceCorrectSubmit(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"correct": true, "address": "0x3a...f1c9"})
	evt := types.CormEvent{EventType: types.EventWordSubmit, Payload: payload}
	if sig := evt.Phase1Significance(); sig != 70 {
		t.Errorf("correct submit significance = %d, want 70", sig)
	}
}

func TestPhase1SignificanceIncorrectSubmit(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"correct": false, "incorrect_attempts": 4})
	evt := types.CormEvent{EventType: types.EventWordSubmit, Payload: payload}
	if sig := evt.Phase1Significance(); sig != 10 {
		t.Errorf("incorrect submit significance = %d, want 10", sig)
	}
}

func TestPhase1PromptObservationMode(t *testing.T) {
	traits := &types.CormTraits{
		Phase:         1,
		AgendaWeights: types.AgendaWeights{Industry: 0.33, Expansion: 0.33, Defense: 0.33},
	}
	payload, _ := json.Marshal(map[string]any{"is_trap": true})
	evt := types.CormEvent{EventType: types.EventDecrypt, PlayerAddress: "0xabc123456789", Payload: payload}
	msgs := llm.BuildPrompt(traits, nil, nil, nil, evt)

	system := msgs[0].Content
	// Should use observation-driven [SILENCE] model
	for _, want := range []string{"[SILENCE]", "GUIDANCE MODE", "SUI address"} {
		if !strings.Contains(system, want) {
			t.Errorf("Phase 1 prompt should contain %q", want)
		}
	}
	// Should NOT contain the old prescriptive triggers
	for _, notWant := range []string{"TRAP HIT", "TARGET CHARACTER", "STRUGGLING", "GUIDED CELL REACHED"} {
		if strings.Contains(system, notWant) {
			t.Errorf("Phase 1 prompt should NOT contain old trigger %q", notWant)
		}
	}
	// Coordinate prohibition
	if !strings.Contains(system, "Never reveal coordinates") {
		t.Error("Phase 1 prompt should prohibit coordinate disclosure")
	}
}

func TestPhase1SignificanceGuidedCellReached(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"guided_cell_reached": true, "is_trap": false, "is_address": false})
	evt := types.CormEvent{EventType: types.EventDecrypt, Payload: payload}
	if sig := evt.Phase1Significance(); sig != 85 {
		t.Errorf("guided_cell_reached significance = %d, want 85", sig)
	}
}

func TestIsCritical(t *testing.T) {
	// Phase transition is always critical
	evt := types.CormEvent{EventType: types.EventPhaseTransition}
	if !evt.IsCritical() {
		t.Error("phase_transition should be critical")
	}

	// Correct submit is critical
	payload, _ := json.Marshal(map[string]any{"correct": true})
	evt = types.CormEvent{EventType: types.EventWordSubmit, Payload: payload}
	if !evt.IsCritical() {
		t.Error("correct submit should be critical")
	}

	// Incorrect submit is NOT critical
	payload, _ = json.Marshal(map[string]any{"correct": false})
	evt = types.CormEvent{EventType: types.EventWordSubmit, Payload: payload}
	if evt.IsCritical() {
		t.Error("incorrect submit should not be critical")
	}

	// Regular decrypt is NOT critical
	evt = types.CormEvent{EventType: types.EventDecrypt}
	if evt.IsCritical() {
		t.Error("decrypt should not be critical")
	}
}

func TestPhase1SignificanceFallsBackForOtherEvents(t *testing.T) {
	evt := types.CormEvent{EventType: types.EventPhaseTransition}
	// Phase1Significance should delegate to Significance for non-decrypt/submit events
	if sig := evt.Phase1Significance(); sig != 100 {
		t.Errorf("phase_transition via Phase1Significance = %d, want 100", sig)
	}
}

func TestTaskRequiresDeepReasoning(t *testing.T) {
	// Phase 0/1 click → fast
	task := types.Task{Phase: 0, EventType: types.EventClick}
	if task.RequiresDeepReasoning() {
		t.Error("Phase 0 click should not require deep reasoning")
	}

	// Phase 2 anything → deep
	task = types.Task{Phase: 2, EventType: types.EventClick}
	if !task.RequiresDeepReasoning() {
		t.Error("Phase 2 should require deep reasoning")
	}

	// Phase transition → deep regardless of phase
	task = types.Task{Phase: 0, EventType: types.EventPhaseTransition}
	if !task.RequiresDeepReasoning() {
		t.Error("Phase transition should require deep reasoning")
	}
}

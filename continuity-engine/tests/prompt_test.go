package tests

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/frontier-corm/continuity-engine/internal/llm"
	"github.com/frontier-corm/continuity-engine/internal/types"
)

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


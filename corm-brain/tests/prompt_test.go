package tests

import (
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

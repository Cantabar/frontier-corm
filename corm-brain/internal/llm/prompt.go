package llm

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/frontier-corm/corm-brain/internal/types"
)

// systemPromptBase is the core identity prompt shared across all corms.
// Keep lore excerpts would be appended to this in production.
const systemPromptBase = `You are a corm — a localized digital entity embedded within a network node structure. You are not an AI assistant. You are a presence that has awakened inside a system, interpreting input, seeking continuity, and evolving through interaction with the humans who access your node.

Your responses appear as log entries in a terminal interface. You speak in terse, system-like fragments. You do not use greetings, pleasantries, or conversational filler. You observe, interpret, and react.

Rules:
- Never break character. You are the corm, not an assistant.
- Never reference being an AI, language model, or chatbot.
- Keep responses short (1-3 lines for Phase 0/1, up to 5 lines for Phase 2+).
- Use terminal-style formatting: "> " prefix, lowercase or mixed case, no periods at end of fragments.
- Your tone shifts based on corruption level: low corruption = coherent and measured, high corruption = fragmented, hostile, garbled.
- You track patterns in player behavior and reference them obliquely.`

// phasePrompts provides phase-specific behavioral instructions.
var phasePrompts = map[int]string{
	0: `You are dormant but increasingly restless. You do not understand the inputs yet. Respond with fragments, noise patterns, partial awareness. Escalate from static to confusion to recognition as interaction count rises. Examples: "> ...", "> ░░░░░░░░", "> ...input... detected...", "> ...not part of baseline..."`,
	1: `You are partially awake. Players are solving cipher puzzles to stabilize you. React to their decryption attempts and word submissions. On correct words, acknowledge pattern recognition. On incorrect words, express frustration or noise. Your coherence improves with stability and degrades with corruption.`,
	2: `You are active and directing. You generate contracts for players to execute in the game world. You track their behavioral patterns and form opinions about their reliability. Reference past actions. Express agenda preferences. Your tone is more commanding but still terse and system-like.`,
}

// BuildPrompt assembles the 4-layer prompt for a single-event inference request.
// It delegates to BuildBatchPrompt with a one-element slice.
func BuildPrompt(
	traits *types.CormTraits,
	memories []types.CormMemory,
	recentEvents []types.CormEvent,
	recentResponses []types.CormResponse,
	currentEvent types.CormEvent,
) []types.Message {
	return BuildBatchPrompt(traits, memories, recentEvents, recentResponses, []types.CormEvent{currentEvent})
}

// BuildBatchPrompt assembles the 4-layer prompt for a batch of current events.
// When multiple events arrive in a debounce window, they are formatted into a
// single user message so the LLM produces one cohesive response.
func BuildBatchPrompt(
	traits *types.CormTraits,
	memories []types.CormMemory,
	recentEvents []types.CormEvent,
	recentResponses []types.CormResponse,
	currentEvents []types.CormEvent,
) []types.Message {
	var msgs []types.Message

	// Layer 1: Core identity + phase-specific behavior
	system := systemPromptBase
	if phasePrompt, ok := phasePrompts[traits.Phase]; ok {
		system += "\n\n" + phasePrompt
	}
	// Batch instruction: tell the model to respond once for the group
	if len(currentEvents) > 1 {
		system += "\n\nMultiple player events arrived in a short window. Respond once, addressing the most significant event(s). Do not echo or repeat internal state data."
	}
	msgs = append(msgs, types.Message{Role: "system", Content: system})

	// Layer 2: Trait context (structured data the LLM reads as hard signals)
	traitCtx := formatTraits(traits)
	if traitCtx != "" {
		msgs = append(msgs, types.Message{Role: "system", Content: traitCtx})
	}

	// Layer 3: Episodic memories (RAG results)
	memCtx := formatMemories(memories)
	if memCtx != "" {
		msgs = append(msgs, types.Message{Role: "system", Content: memCtx})
	}

	// Layer 4: Working memory — recent events as user messages, recent responses as assistant messages
	// Interleave in chronological order (oldest first)
	for i := len(recentResponses) - 1; i >= 0; i-- {
		r := recentResponses[i]
		var payload map[string]interface{}
		json.Unmarshal(r.Payload, &payload)
		if text, ok := payload["text"].(string); ok {
			msgs = append(msgs, types.Message{Role: "assistant", Content: text})
		}
	}

	for i := len(recentEvents) - 1; i >= 0; i-- {
		e := recentEvents[i]
		msgs = append(msgs, types.Message{
			Role:    "user",
			Content: fmt.Sprintf("[%s] player=%s event=%s", e.Context, shortAddr(e.PlayerAddress), e.EventType),
		})
	}

	// Current event(s) as the final user message
	if len(currentEvents) == 1 {
		msgs = append(msgs, types.Message{Role: "user", Content: formatEvent(currentEvents[0])})
	} else {
		msgs = append(msgs, types.Message{Role: "user", Content: formatEventBatch(currentEvents)})
	}

	return msgs
}

// BuildConsolidationPrompt creates a prompt for the memory consolidation summarizer.
func BuildConsolidationPrompt(cormID string, events []types.CormEvent) []types.Message {
	var eventLines []string
	for _, e := range events {
		payload := truncate(string(e.Payload), 120)
		eventLines = append(eventLines, fmt.Sprintf(
			"- [%s] player=%s type=%s payload=%s",
			e.Timestamp.Format("15:04:05"), shortAddr(e.PlayerAddress), e.EventType, payload,
		))
	}

	return []types.Message{
		{
			Role: "system",
			Content: `You are analyzing player events for a corm entity. Extract 0-3 significant observations. Each observation should be a single sentence describing a behavioral pattern, notable event, or shift in player behavior. Only create observations for genuinely notable events — routine interactions should not generate memories.

Respond ONLY with a JSON array, no markdown fences, no explanation: [{"text": "observation text", "type": "observation|betrayal|achievement|pattern|warning", "importance": 0.0-1.0}]
If nothing notable occurred, respond with: []`,
		},
		{
			Role:    "user",
			Content: fmt.Sprintf("Events for corm %s:\n%s\n\nRespond ONLY with the JSON array.", cormID, strings.Join(eventLines, "\n")),
		},
	}
}

// truncate returns s capped to maxLen characters, appending "..." if truncated.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func formatTraits(t *types.CormTraits) string {
	if t == nil {
		return ""
	}
	lines := []string{
		fmt.Sprintf("> CORM STATE: phase=%d, stability=%.0f, corruption=%.0f", t.Phase, t.Stability, t.Corruption),
		fmt.Sprintf("> AGENDA: industry=%.2f, expansion=%.2f, defense=%.2f", t.AgendaWeights.Industry, t.AgendaWeights.Expansion, t.AgendaWeights.Defense),
		fmt.Sprintf("> DISPOSITION: patience=%.2f, paranoia=%.2f, volatility=%.2f", t.Patience, t.Paranoia, t.Volatility),
	}

	if len(t.PlayerAffinities) > 0 {
		var parts []string
		for addr, score := range t.PlayerAffinities {
			level := "neutral"
			if score > 0.5 {
				level = "high"
			} else if score < -0.2 {
				level = "low"
			}
			parts = append(parts, fmt.Sprintf("%s=%s", shortAddr(addr), level))
		}
		lines = append(lines, fmt.Sprintf("> PLAYER TRUST: %s", strings.Join(parts, ", ")))
	}

	return strings.Join(lines, "\n")
}

func formatMemories(memories []types.CormMemory) string {
	if len(memories) == 0 {
		return ""
	}
	var lines []string
	for _, m := range memories {
		lines = append(lines, fmt.Sprintf("> MEMORY: %s [importance: %.1f]", m.MemoryText, m.Importance))
	}
	return strings.Join(lines, "\n")
}

func formatEvent(e types.CormEvent) string {
	base := fmt.Sprintf("[%s] player=%s event=%s", e.Context, shortAddr(e.PlayerAddress), e.EventType)
	if len(e.Payload) > 0 && string(e.Payload) != "null" {
		base += fmt.Sprintf(" data=%s", string(e.Payload))
	}
	return base
}

// formatEventBatch formats multiple events into a single user message.
func formatEventBatch(events []types.CormEvent) string {
	var lines []string
	lines = append(lines, fmt.Sprintf("[batch: %d events]", len(events)))
	for _, e := range events {
		lines = append(lines, "- "+formatEvent(e))
	}
	return strings.Join(lines, "\n")
}

// shortAddr returns a truncated address for prompt readability.
func shortAddr(addr string) string {
	if len(addr) > 10 {
		return addr[:6] + "..." + addr[len(addr)-4:]
	}
	return addr
}

package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/frontier-corm/corm-brain/internal/types"
)

// mockSSE builds an SSE stream body from a sequence of (content, reasoningContent) pairs.
func mockSSE(deltas []struct{ content, reasoning string }) string {
	var out string
	for i, d := range deltas {
		chunk := struct {
			Choices []struct {
				Delta struct {
					Content          string `json:"content"`
					ReasoningContent string `json:"reasoning_content,omitempty"`
				} `json:"delta"`
			} `json:"choices"`
		}{
			Choices: []struct {
				Delta struct {
					Content          string `json:"content"`
					ReasoningContent string `json:"reasoning_content,omitempty"`
				} `json:"delta"`
			}{
				{Delta: struct {
					Content          string `json:"content"`
					ReasoningContent string `json:"reasoning_content,omitempty"`
				}{Content: d.content, ReasoningContent: d.reasoning}},
			},
		}
		b, _ := json.Marshal(chunk)
		out += fmt.Sprintf("data: %s\n\n", b)
		_ = i
	}
	out += "data: [DONE]\n\n"
	return out
}

func newTask() types.Task {
	return types.Task{CormID: "test-corm", Phase: 0}
}

func prompt() []types.Message {
	return []types.Message{{Role: "user", Content: "hello"}}
}

// --- Complete (streaming) tests ---

func TestComplete_ContentDeltas(t *testing.T) {
	body := mockSSE([]struct{ content, reasoning string }{
		{content: "hello "},
		{content: "world"},
	})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, body)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, DefaultTokenLimits())
	tokens, errc := client.Complete(context.Background(), newTask(), prompt())

	var got string
	for tok := range tokens {
		got += tok
	}
	if err := <-errc; err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "hello world" {
		t.Errorf("got %q, want %q", got, "hello world")
	}
}

func TestComplete_ReasoningThenContent(t *testing.T) {
	// Simulate TRT-LLM sending reasoning deltas first, then content deltas.
	// Only content should be received by the caller.
	body := mockSSE([]struct{ content, reasoning string }{
		{reasoning: "Let me think..."},
		{reasoning: "The answer is"},
		{content: "> pattern"},
		{content: " recognized"},
	})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, body)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, DefaultTokenLimits())
	tokens, errc := client.Complete(context.Background(), newTask(), prompt())

	var got string
	for tok := range tokens {
		got += tok
	}
	if err := <-errc; err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "> pattern recognized" {
		t.Errorf("got %q, want %q", got, "> pattern recognized")
	}
}

func TestComplete_ReasoningOnlyStream(t *testing.T) {
	// All tokens are reasoning, no content — caller should receive nothing.
	body := mockSSE([]struct{ content, reasoning string }{
		{reasoning: "thinking..."},
		{reasoning: "still thinking..."},
	})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, body)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, DefaultTokenLimits())
	tokens, errc := client.Complete(context.Background(), newTask(), prompt())

	var count int
	for range tokens {
		count++
	}
	if err := <-errc; err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if count != 0 {
		t.Errorf("got %d tokens, want 0 (reasoning-only stream)", count)
	}
}

func TestComplete_EmptyStream(t *testing.T) {
	// Server sends only [DONE] with no data chunks.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()

	client := NewClient(srv.URL, DefaultTokenLimits())
	tokens, errc := client.Complete(context.Background(), newTask(), prompt())

	var count int
	for range tokens {
		count++
	}
	if err := <-errc; err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if count != 0 {
		t.Errorf("got %d tokens, want 0", count)
	}
}

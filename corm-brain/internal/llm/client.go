// Package llm provides an OpenAI-compatible streaming chat completion client
// targeting the Super TRT-LLM instance.
package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/frontier-corm/corm-brain/internal/types"
)

// TokenLimits holds the maximum generation tokens for each task tier.
type TokenLimits struct {
	Default int // Standard streaming
	Deep    int // Deep reasoning streaming (Phase 2 contracts, agenda)
}

// DefaultTokenLimits returns sensible defaults.
func DefaultTokenLimits() TokenLimits {
	return TokenLimits{
		Default: 150,
		Deep:    400,
	}
}

// Client wraps HTTP access to the local TRT-LLM inference server.
type Client struct {
	baseURL     string
	httpClient  *http.Client
	tokenLimits TokenLimits
}

// NewClient creates an LLM client targeting the given Super endpoint.
func NewClient(baseURL string, limits TokenLimits) *Client {
	return &Client{
		baseURL:     baseURL,
		httpClient:  &http.Client{},
		tokenLimits: limits,
	}
}

// chatCompletionRequest is the OpenAI-compatible request body.
type chatCompletionRequest struct {
	Model              string              `json:"model"`
	Messages           []types.Message     `json:"messages"`
	MaxTokens          int                 `json:"max_tokens"`
	Temperature        float64             `json:"temperature"`
	Stream             bool                `json:"stream"`
	ChatTemplateKwargs *chatTemplateKwargs `json:"chat_template_kwargs,omitempty"`
}

// chatTemplateKwargs controls per-request model behavior (e.g. thinking mode).
type chatTemplateKwargs struct {
	EnableThinking bool `json:"enable_thinking"`
}

// streamDelta is the parsed content from an SSE chunk.
type streamDelta struct {
	Choices []struct {
		Delta struct {
			Content          string `json:"content"`
			ReasoningContent string `json:"reasoning_content"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
}

// Complete starts a streaming inference request and returns a channel of token deltas.
// The caller reads deltas and forwards them to the puzzle-service WebSocket.
func (c *Client) Complete(ctx context.Context, task types.Task, prompt []types.Message) (<-chan string, <-chan error) {
	tokens := make(chan string, 64)
	errc := make(chan error, 1)

	go func() {
		defer close(tokens)
		defer close(errc)

		model := "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4"

		maxTokens := c.tokenLimits.Default
		if task.RequiresDeepReasoning() {
			maxTokens = c.tokenLimits.Deep
		}

		req := chatCompletionRequest{
			Model:       model,
			Messages:    prompt,
			MaxTokens:   maxTokens,
			Temperature: 0.7 + task.Corruption*0.005,
			Stream:      true,
			// Disable thinking — corm responses are short in-character log
			// fragments. With reasoning_parser enabled server-side, the model
			// consumes all tokens on <think> and produces no content tokens.
			ChatTemplateKwargs: &chatTemplateKwargs{EnableThinking: false},
		}

		body, err := json.Marshal(req)
		if err != nil {
			errc <- fmt.Errorf("marshal request: %w", err)
			return
		}

		httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/v1/chat/completions", bytes.NewReader(body))
		if err != nil {
			errc <- fmt.Errorf("create request: %w", err)
			return
		}
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := c.httpClient.Do(httpReq)
		if err != nil {
			errc <- fmt.Errorf("http request: %w", err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			respBody, _ := io.ReadAll(resp.Body)
			errc <- fmt.Errorf("llm returned %d: %s", resp.StatusCode, string(respBody))
			return
		}

		var hadContent bool
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				break
			}

			var delta streamDelta
			if err := json.Unmarshal([]byte(data), &delta); err != nil {
				continue
			}

		for _, choice := range delta.Choices {
				if choice.Delta.Content != "" {
					hadContent = true
					select {
					case tokens <- choice.Delta.Content:
					case <-ctx.Done():
						return
					}
				}
				if choice.FinishReason != nil && *choice.FinishReason == "length" {
					log.Printf("llm stream: generation truncated (finish_reason=length, max_tokens=%d, corm=%s)", maxTokens, task.CormID)
				}
			}
		}

		if !hadContent {
			log.Printf("llm stream: no content tokens received (reasoning may have consumed token budget)")
		}

		if err := scanner.Err(); err != nil {
			errc <- fmt.Errorf("read stream: %w", err)
		}
	}()

	return tokens, errc
}


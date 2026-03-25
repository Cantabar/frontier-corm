// Package llm provides an OpenAI-compatible streaming chat completion client
// that routes requests to either the Super or Nano TRT-LLM instances.
package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/frontier-corm/corm-brain/internal/types"
)

// Client wraps HTTP access to the local TRT-LLM inference servers.
type Client struct {
	superURL   string
	fastURL    string
	httpClient *http.Client
}

// NewClient creates an LLM client targeting the given Super and Nano endpoints.
func NewClient(superURL, fastURL string) *Client {
	return &Client{
		superURL:   superURL,
		fastURL:    fastURL,
		httpClient: &http.Client{},
	}
}

// chatCompletionRequest is the OpenAI-compatible request body.
type chatCompletionRequest struct {
	Model       string          `json:"model"`
	Messages    []types.Message `json:"messages"`
	MaxTokens   int             `json:"max_tokens"`
	Temperature float64         `json:"temperature"`
	Stream      bool            `json:"stream"`
}

// streamDelta is the parsed content from an SSE chunk.
type streamDelta struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
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

		var baseURL, model string
		if task.RequiresDeepReasoning() {
			baseURL = c.superURL
			model = "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4"
		} else {
			baseURL = c.fastURL
			model = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4"
		}

		maxTokens := 80
		if task.RequiresDeepReasoning() {
			maxTokens = 200
		}

		req := chatCompletionRequest{
			Model:       model,
			Messages:    prompt,
			MaxTokens:   maxTokens,
			Temperature: 0.7 + task.Corruption*0.005,
			Stream:      true,
		}

		body, err := json.Marshal(req)
		if err != nil {
			errc <- fmt.Errorf("marshal request: %w", err)
			return
		}

		httpReq, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/v1/chat/completions", bytes.NewReader(body))
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

		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				return
			}

			var delta streamDelta
			if err := json.Unmarshal([]byte(data), &delta); err != nil {
				continue
			}

			for _, choice := range delta.Choices {
				if choice.Delta.Content != "" {
					select {
					case tokens <- choice.Delta.Content:
					case <-ctx.Done():
						return
					}
				}
			}
		}

		if err := scanner.Err(); err != nil {
			errc <- fmt.Errorf("read stream: %w", err)
		}
	}()

	return tokens, errc
}

// CompleteSync performs a non-streaming inference and returns the full response.
// Used by the consolidation loop where streaming is not needed.
func (c *Client) CompleteSync(ctx context.Context, task types.Task, prompt []types.Message) (string, error) {
	var baseURL, model string
	if task.RequiresDeepReasoning() {
		baseURL = c.superURL
		model = "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4"
	} else {
		baseURL = c.fastURL
		model = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4"
	}

	req := chatCompletionRequest{
		Model:       model,
		Messages:    prompt,
		MaxTokens:   300,
		Temperature: 0.3,
		Stream:      false,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("llm returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}

	return result.Choices[0].Message.Content, nil
}

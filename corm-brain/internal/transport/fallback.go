package transport

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/frontier-corm/corm-brain/internal/types"
)

// FallbackClient polls the puzzle-service HTTP endpoints when WebSocket is unavailable.
type FallbackClient struct {
	puzzleURL    string
	pollInterval time.Duration
	eventChan    chan types.CormEvent
	httpClient   *http.Client
	lastSeq      uint64
}

// NewFallbackClient creates a fallback HTTP polling client.
func NewFallbackClient(puzzleServiceURL string, pollInterval time.Duration, eventChan chan types.CormEvent) *FallbackClient {
	return &FallbackClient{
		puzzleURL:    puzzleServiceURL,
		pollInterval: pollInterval,
		eventChan:    eventChan,
		httpClient:   &http.Client{Timeout: 10 * time.Second},
	}
}

// Poll starts the HTTP polling loop. It blocks until ctx is cancelled.
func (f *FallbackClient) Poll(ctx context.Context) {
	ticker := time.NewTicker(f.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			f.fetchEvents(ctx)
		}
	}
}

// fetchEvents polls GET /corm/events?after=N for new events.
func (f *FallbackClient) fetchEvents(ctx context.Context) {
	url := fmt.Sprintf("%s/corm/events?after=%d", f.puzzleURL, f.lastSeq)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return
	}

	resp, err := f.httpClient.Do(req)
	if err != nil {
		log.Printf("fallback poll error: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return
	}

	var events []types.CormEvent
	if err := json.NewDecoder(resp.Body).Decode(&events); err != nil {
		log.Printf("fallback decode error: %v", err)
		return
	}

	for _, evt := range events {
		if evt.Seq > f.lastSeq {
			f.lastSeq = evt.Seq
		}
		select {
		case f.eventChan <- evt:
		case <-ctx.Done():
			return
		}
	}
}

// PostAction sends a CormAction via POST /corm/actions.
func (f *FallbackClient) PostAction(ctx context.Context, action types.CormAction) error {
	data, err := json.Marshal(action)
	if err != nil {
		return fmt.Errorf("marshal action: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", f.puzzleURL+"/corm/actions", nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Body = http.NoBody

	// Re-create with body
	req, _ = http.NewRequestWithContext(ctx, "POST", f.puzzleURL+"/corm/actions", jsonReader(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := f.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("post action: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusOK {
		return fmt.Errorf("post action: status %d", resp.StatusCode)
	}
	return nil
}

package memory

import (
	"context"
	"fmt"
	"log"

	"github.com/frontier-corm/corm-brain/internal/db"
	"github.com/frontier-corm/corm-brain/internal/embed"
	"github.com/frontier-corm/corm-brain/internal/types"
)

// Retriever performs episodic memory recall via pgvector similarity search.
type Retriever struct {
	db       *db.DB
	embedder embed.Embedder
}

// NewRetriever creates a new memory retriever.
func NewRetriever(database *db.DB, embedder embed.Embedder) *Retriever {
	return &Retriever{db: database, embedder: embedder}
}

// Recall retrieves the top-k most relevant episodic memories for a corm
// given the current event context.
func (r *Retriever) Recall(ctx context.Context, environment, cormID string, event types.CormEvent, topK int) ([]types.CormMemory, error) {
	// Build query text from event context
	queryText := fmt.Sprintf("player %s %s", event.PlayerAddress, event.EventType)
	if len(event.Payload) > 0 {
		queryText += " " + string(event.Payload)
	}

	// Generate embedding for the query
	embedding, err := r.embedder.Embed(ctx, queryText)
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}

	// Search memories
	memories, err := r.db.SearchMemories(ctx, environment, cormID, embedding, topK)
	if err != nil {
		return nil, fmt.Errorf("search memories: %w", err)
	}

	// Touch recalled memories (update last_recalled_at for recency scoring)
	if len(memories) > 0 {
		ids := make([]int64, len(memories))
		for i, m := range memories {
			ids[i] = m.ID
		}
		if err := r.db.TouchMemories(ctx, ids); err != nil {
			log.Printf("touch memories: %v", err)
		}
	}

	return memories, nil
}

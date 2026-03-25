package memory

import (
	"context"
	"log"

	"github.com/frontier-corm/corm-brain/internal/db"
)

// Pruner enforces memory caps per corm.
type Pruner struct {
	db  *db.DB
	cap int
}

// NewPruner creates a memory pruner with the given per-corm cap.
func NewPruner(database *db.DB, cap int) *Pruner {
	return &Pruner{db: database, cap: cap}
}

// Prune removes the lowest-ranked memories if the corm exceeds its cap.
func (p *Pruner) Prune(ctx context.Context, cormID string) error {
	count, err := p.db.MemoryCount(ctx, cormID)
	if err != nil {
		return err
	}

	if count <= p.cap {
		return nil
	}

	pruned, err := p.db.PruneMemories(ctx, cormID, p.cap)
	if err != nil {
		return err
	}

	if pruned > 0 {
		log.Printf("pruned %d memories for corm %s (was %d, cap %d)", pruned, cormID, count, p.cap)
	}
	return nil
}

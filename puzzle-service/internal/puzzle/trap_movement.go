package puzzle

import "math"

// PulseStrength classifies the sonar pulse that triggers trap attraction.
type PulseStrength int

const (
	PulseWeak   PulseStrength = iota // regular decrypt — detection range 5
	PulseStrong                      // sonar sensor — detection range 8
)

// detectionRange returns the Euclidean distance within which traps are
// attracted to a pulse of the given strength.
func (s PulseStrength) detectionRange() float64 {
	switch s {
	case PulseStrong:
		return 8.0
	default:
		return 5.0
	}
}

// TrapMoveResult records a single trap cell that moved.
type TrapMoveResult struct {
	From CellCoord `json:"from"`
	To   CellCoord `json:"to"`
}

// MoveTrapsToPulse moves undecrypted trap nodes one cell toward the pulse
// source if they are within the detection range for the given strength.
// Traps swap positions with the destination noise/symbol cell.
// decrypted and garbled are maps keyed by CellKey(row, col).
func MoveTrapsToPulse(grid *Grid, pulseRow, pulseCol int, strength PulseStrength, decrypted, garbled map[string]bool) []TrapMoveResult {
	detRange := strength.detectionRange()
	var moves []TrapMoveResult

	// Collect eligible traps first (iterate a snapshot so moves don't
	// interfere with each other within the same pulse).
	type trapCandidate struct {
		row, col int
		dist     float64
	}
	var candidates []trapCandidate

	for r := range grid.Cells {
		for c := range grid.Cells[r] {
			cell := &grid.Cells[r][c]
			if cell.Type != CellTrap {
				continue
			}
			key := CellKey(r, c)
			if decrypted[key] || garbled[key] {
				continue
			}
			dx := float64(c - pulseCol)
			dy := float64(r - pulseRow)
			dist := math.Sqrt(dx*dx + dy*dy)
			if dist <= detRange && dist > 0 {
				candidates = append(candidates, trapCandidate{r, c, dist})
			}
		}
	}

	// Track cells that have already been claimed as destinations this pulse
	// so two traps don't try to move into the same cell.
	claimed := make(map[string]bool)

	for _, tc := range candidates {
		bestR, bestC := bestStepToward(grid, tc.row, tc.col, pulseRow, pulseCol, decrypted, garbled, claimed)
		if bestR == tc.row && bestC == tc.col {
			continue // no valid move
		}

		swapTrapWithCell(grid, tc.row, tc.col, bestR, bestC)
		claimed[CellKey(bestR, bestC)] = true

		moves = append(moves, TrapMoveResult{
			From: CellCoord{Row: tc.row, Col: tc.col},
			To:   CellCoord{Row: bestR, Col: bestC},
		})
	}

	return moves
}

// bestStepToward picks the adjacent cell (including diagonals) that minimises
// Euclidean distance to (targetRow, targetCol) and is a valid swap destination.
// Returns the trap's own position if no valid move exists.
func bestStepToward(grid *Grid, fromR, fromC, targetR, targetC int, decrypted, garbled, claimed map[string]bool) (int, int) {
	bestR, bestC := fromR, fromC
	bestDist := euclidean(fromR, fromC, targetR, targetC)

	for dr := -1; dr <= 1; dr++ {
		for dc := -1; dc <= 1; dc++ {
			if dr == 0 && dc == 0 {
				continue
			}
			nr, nc := fromR+dr, fromC+dc
			if !grid.InBounds(nr, nc) {
				continue
			}
			if !isValidTrapDestination(grid, nr, nc, decrypted, garbled, claimed) {
				continue
			}
			d := euclidean(nr, nc, targetR, targetC)
			if d < bestDist {
				bestDist = d
				bestR, bestC = nr, nc
			}
		}
	}
	return bestR, bestC
}

// isValidTrapDestination returns true if the cell can receive a trap swap.
// Only noise and symbol cells that are not decrypted, not garbled, and not
// already claimed by another trap move this pulse are valid.
func isValidTrapDestination(grid *Grid, r, c int, decrypted, garbled, claimed map[string]bool) bool {
	key := CellKey(r, c)
	if decrypted[key] || garbled[key] || claimed[key] {
		return false
	}
	cell := &grid.Cells[r][c]
	return cell.Type == CellNoise || cell.Type == CellSymbol
}

// swapTrapWithCell exchanges all cell data between the trap at (tr, tc) and
// the noise/symbol cell at (nr, nc).
func swapTrapWithCell(grid *Grid, tr, tc, nr, nc int) {
	trap := &grid.Cells[tr][tc]
	dest := &grid.Cells[nr][nc]

	// Swap content fields (preserve Row/Col identity).
	trap.Plaintext, dest.Plaintext = dest.Plaintext, trap.Plaintext
	trap.Encrypted, dest.Encrypted = dest.Encrypted, trap.Encrypted
	trap.Type, dest.Type = dest.Type, trap.Type
	trap.StringID, dest.StringID = dest.StringID, trap.StringID
	trap.HintType, dest.HintType = dest.HintType, trap.HintType
	trap.IsWord, dest.IsWord = dest.IsWord, trap.IsWord
	// Distance is relative to position, so recompute isn't needed for traps
	// (traps don't use distance), but swap to keep consistency.
	trap.Distance, dest.Distance = dest.Distance, trap.Distance
}

// CollectTrapPositions scans the grid and returns coordinates of all CellTrap cells.
func CollectTrapPositions(grid *Grid) []CellCoord {
	var positions []CellCoord
	for r := range grid.Cells {
		for c := range grid.Cells[r] {
			if grid.Cells[r][c].Type == CellTrap {
				positions = append(positions, CellCoord{Row: r, Col: c})
			}
		}
	}
	return positions
}

func euclidean(r1, c1, r2, c2 int) float64 {
	dx := float64(c1 - c2)
	dy := float64(r1 - r2)
	return math.Sqrt(dx*dx + dy*dy)
}

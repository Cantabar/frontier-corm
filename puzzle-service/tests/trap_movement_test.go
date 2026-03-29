package tests

import (
	"testing"

	"github.com/frontier-corm/puzzle-service/internal/puzzle"
)

// helper: build a small grid filled with noise and place a trap at (tr, tc).
func setupTrapGrid(rows, cols, tr, tc int) (*puzzle.Grid, map[string]bool, map[string]bool) {
	grid := puzzle.NewGrid(rows, cols)
	for r := range grid.Cells {
		for c := range grid.Cells[r] {
			grid.Cells[r][c].Plaintext = '#'
			grid.Cells[r][c].Encrypted = '#'
			grid.Cells[r][c].Type = puzzle.CellNoise
		}
	}
	grid.Cells[tr][tc].Type = puzzle.CellTrap
	grid.Cells[tr][tc].Plaintext = '$'
	grid.Cells[tr][tc].Encrypted = '$'
	return grid, make(map[string]bool), make(map[string]bool)
}

func TestTrapMovesTowardPulse(t *testing.T) {
	// 10x10 grid, trap at (5,5), pulse at (5,2) — trap should move left
	grid, dec, gar := setupTrapGrid(10, 10, 5, 5)

	moves := puzzle.MoveTrapsToPulse(grid, 5, 2, puzzle.PulseWeak, dec, gar)
	if len(moves) != 1 {
		t.Fatalf("expected 1 move, got %d", len(moves))
	}
	m := moves[0]
	if m.From.Row != 5 || m.From.Col != 5 {
		t.Errorf("expected from (5,5), got (%d,%d)", m.From.Row, m.From.Col)
	}
	// New position should be closer to (5,2) than (5,5)
	if m.To.Col >= 5 {
		t.Errorf("expected trap to move left (col < 5), got col=%d", m.To.Col)
	}
	// Verify grid state: old position is noise, new position is trap
	if grid.Cells[5][5].Type != puzzle.CellNoise {
		t.Errorf("old position should be noise, got %d", grid.Cells[5][5].Type)
	}
	if grid.Cells[m.To.Row][m.To.Col].Type != puzzle.CellTrap {
		t.Errorf("new position should be trap, got %d", grid.Cells[m.To.Row][m.To.Col].Type)
	}
}

func TestTrapBlockedByAddress(t *testing.T) {
	// Trap at (5,5), pulse at (5,4). Only move option toward pulse is (5,4).
	// Block (5,4) with a target address cell.
	grid, dec, gar := setupTrapGrid(10, 10, 5, 5)
	grid.Cells[5][4].Type = puzzle.CellTarget
	grid.Cells[5][4].StringID = "target_main"

	// Also block diagonal approaches with non-noise cells
	grid.Cells[4][4].Type = puzzle.CellDecoy
	grid.Cells[6][4].Type = puzzle.CellSensor

	moves := puzzle.MoveTrapsToPulse(grid, 5, 4, puzzle.PulseWeak, dec, gar)

	// The trap should not move onto the address/decoy/sensor cells.
	// It might move diagonally if an open noise cell is closer, or not move at all.
	for _, m := range moves {
		dest := grid.Cells[m.To.Row][m.To.Col]
		if dest.Type != puzzle.CellTrap {
			t.Errorf("trap moved to (%d,%d) which is type %d, expected trap", m.To.Row, m.To.Col, dest.Type)
		}
	}
}

func TestTrapOutOfRange(t *testing.T) {
	// Trap at (0,0), pulse at (9,9) — Euclidean distance ~12.7, beyond weak range 5
	grid, dec, gar := setupTrapGrid(10, 10, 0, 0)

	moves := puzzle.MoveTrapsToPulse(grid, 9, 9, puzzle.PulseWeak, dec, gar)
	if len(moves) != 0 {
		t.Errorf("expected 0 moves for out-of-range trap, got %d", len(moves))
	}
}

func TestStrongPulseLargerRange(t *testing.T) {
	// Trap at (0,0), pulse at (5,5) — Euclidean ~7.07, beyond weak (5) but within strong (8)
	grid, dec, gar := setupTrapGrid(10, 10, 0, 0)

	weakMoves := puzzle.MoveTrapsToPulse(grid, 5, 5, puzzle.PulseWeak, dec, gar)
	if len(weakMoves) != 0 {
		t.Errorf("expected 0 weak moves for trap at distance ~7.07, got %d", len(weakMoves))
	}

	// Reset trap position (it shouldn't have moved, but be explicit)
	grid.Cells[0][0].Type = puzzle.CellTrap

	strongMoves := puzzle.MoveTrapsToPulse(grid, 5, 5, puzzle.PulseStrong, dec, gar)
	if len(strongMoves) != 1 {
		t.Fatalf("expected 1 strong move for trap at distance ~7.07, got %d", len(strongMoves))
	}
}

func TestTrapDoesNotMoveOntoDecryptedCell(t *testing.T) {
	// Trap at (5,5), pulse at (5,3). Mark (5,4) and diagonals as decrypted.
	grid, dec, gar := setupTrapGrid(10, 10, 5, 5)
	dec[puzzle.CellKey(5, 4)] = true
	dec[puzzle.CellKey(4, 4)] = true
	dec[puzzle.CellKey(6, 4)] = true

	moves := puzzle.MoveTrapsToPulse(grid, 5, 3, puzzle.PulseWeak, dec, gar)
	for _, m := range moves {
		key := puzzle.CellKey(m.To.Row, m.To.Col)
		if dec[key] {
			t.Errorf("trap moved to decrypted cell (%d,%d)", m.To.Row, m.To.Col)
		}
	}
}

func TestTrapDoesNotMoveOntoGarbledCell(t *testing.T) {
	grid, dec, gar := setupTrapGrid(10, 10, 5, 5)
	// Surround the trap with garbled cells except (5,5) itself
	for dr := -1; dr <= 1; dr++ {
		for dc := -1; dc <= 1; dc++ {
			if dr == 0 && dc == 0 {
				continue
			}
			r, c := 5+dr, 5+dc
			gar[puzzle.CellKey(r, c)] = true
		}
	}

	moves := puzzle.MoveTrapsToPulse(grid, 5, 2, puzzle.PulseWeak, dec, gar)
	if len(moves) != 0 {
		t.Errorf("expected 0 moves when surrounded by garbled cells, got %d", len(moves))
	}
}

func TestCollectTrapPositions(t *testing.T) {
	grid, _, _ := setupTrapGrid(10, 10, 3, 3)
	grid.Cells[7][7].Type = puzzle.CellTrap

	positions := puzzle.CollectTrapPositions(grid)
	if len(positions) != 2 {
		t.Fatalf("expected 2 trap positions, got %d", len(positions))
	}

	found := map[string]bool{}
	for _, p := range positions {
		found[puzzle.CellKey(p.Row, p.Col)] = true
	}
	if !found[puzzle.CellKey(3, 3)] || !found[puzzle.CellKey(7, 7)] {
		t.Errorf("unexpected trap positions: %v", positions)
	}
}

func TestTrapPositionsSyncAfterMove(t *testing.T) {
	grid, dec, gar := setupTrapGrid(10, 10, 5, 5)

	moves := puzzle.MoveTrapsToPulse(grid, 5, 2, puzzle.PulseWeak, dec, gar)
	if len(moves) == 0 {
		t.Fatal("expected at least 1 move")
	}

	positions := puzzle.CollectTrapPositions(grid)
	if len(positions) != 1 {
		t.Fatalf("expected 1 trap position after move, got %d", len(positions))
	}
	if positions[0].Row != moves[0].To.Row || positions[0].Col != moves[0].To.Col {
		t.Errorf("trap position (%d,%d) doesn't match move destination (%d,%d)",
			positions[0].Row, positions[0].Col, moves[0].To.Row, moves[0].To.Col)
	}
}

func TestMultipleTrapsDoNotCollide(t *testing.T) {
	// Two traps side by side, both attracted to the same pulse
	grid, dec, gar := setupTrapGrid(10, 10, 5, 5)
	grid.Cells[5][6].Type = puzzle.CellTrap
	grid.Cells[5][6].Plaintext = '$'

	moves := puzzle.MoveTrapsToPulse(grid, 5, 2, puzzle.PulseWeak, dec, gar)

	// Verify no two moves have the same destination
	seen := map[string]bool{}
	for _, m := range moves {
		key := puzzle.CellKey(m.To.Row, m.To.Col)
		if seen[key] {
			t.Errorf("two traps moved to same cell (%d,%d)", m.To.Row, m.To.Col)
		}
		seen[key] = true
	}
}

package puzzle

// CellType classifies the content of a grid cell.
type CellType int

const (
	CellNoise   CellType = iota // random noise character
	CellTarget                  // part of the hidden target address
	CellDecoy                   // part of a decoy address
	CellTrap                    // trap node — explodes on reveal, garbles nearby cells
	CellSymbol                  // explicit symbol fill (non-alphabet noise)
	CellSensor                  // sensor node (sonar, thermal, or vector)
	CellGarbled                 // permanently corrupted by trap explosion
)

// Cell represents a single cell in the cipher grid.
type Cell struct {
	Row        int      `json:"row"`
	Col        int      `json:"col"`
	Plaintext  rune     `json:"-"` // never sent to client
	Encrypted  rune     `json:"encrypted"`
	Decrypted  bool     `json:"decrypted"`
	IsWord     bool     `json:"-"` // true if this cell is part of the target address
	Type       CellType `json:"-"` // classification of this cell's content
	Distance   int      `json:"-"` // Manhattan distance to nearest target word cell
	StringID   string   `json:"-"` // groups cells belonging to the same address (e.g. "target_main", "decoy_0")
	HintType   string   `json:"-"` // sensor subtype: "sonar", "thermal", "vector"; empty for non-sensors
	IsGarbled  bool     `json:"-"` // permanently corrupted by trap explosion
	GarbleChar rune     `json:"-"` // foreign-script glyph assigned when the cell is garbled
}

// CellCoord is a lightweight row/col pair.
type CellCoord struct {
	Row int `json:"row"`
	Col int `json:"col"`
}

// Grid holds the full puzzle grid state.
type Grid struct {
	Rows  int      `json:"rows"`
	Cols  int      `json:"cols"`
	Cells [][]Cell `json:"-"`
}

// NewGrid creates an empty grid of the given dimensions.
func NewGrid(rows, cols int) *Grid {
	cells := make([][]Cell, rows)
	for r := range cells {
		cells[r] = make([]Cell, cols)
		for c := range cells[r] {
			cells[r][c] = Cell{Row: r, Col: c}
		}
	}
	return &Grid{Rows: rows, Cols: cols, Cells: cells}
}

// InBounds checks whether (row, col) is within the grid.
func (g *Grid) InBounds(row, col int) bool {
	return row >= 0 && row < g.Rows && col >= 0 && col < g.Cols
}

// NoiseChars are non-alphabet printable ASCII characters used to fill the grid.
// All must be in the cipher range 0x21–0x7E so encryption produces a visible change.
var NoiseChars = []rune{'#', '@', '%', '&', '*', '~', '^', '|', '<', '>', '{', '}', '[', ']', '/', '!', '?', ':', ';', '='}

// TrapSymbols are printable ASCII characters used for trap nodes.
// All must be in the cipher range 0x21–0x7E.
var TrapSymbols = []rune{'$', '+', '`', '\\', '_'}

// GarbleChars are Unicode glyphs from mixed non-Latin scripts used for
// permanently corrupted cells. They evoke a foreign/alien language and are
// visually distinct from any cipher or noise character.
var GarbleChars = []rune{
	'ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚬ', 'ᚱ', 'ᚲ', 'ᛈ', 'ᛇ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛗ', 'ᛚ', 'ᛞ', 'ᛟ',
	'∴', '∇', '∂', '∞', '≋', '∀', '∃', '⊕', '⊗', '⊛',
	'⌬', '⏣', '☍', '⚶', '⚷',
}

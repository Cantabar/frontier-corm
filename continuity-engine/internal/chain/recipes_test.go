package chain

import (
	"testing"
)

func TestMaterialsNeeded_Reflex(t *testing.T) {
	r := NewRecipeRegistry()
	mats := r.MaterialsNeeded(87847, 1)

	// Reflex needs raw materials: Feldspar Crystals (77800), Silica Grains (89259),
	// Iron-Rich Nodules (89260), Palladium (99001), Fossilized Exotronics (83818).
	byID := make(map[uint64]int)
	for _, m := range mats {
		byID[m.TypeID] = m.Quantity
	}

	// Verify all expected raw materials are present.
	expected := map[uint64]string{
		77800: "Feldspar Crystals",
		89259: "Silica Grains",
		89260: "Iron-Rich Nodules",
		99001: "Palladium",
		83818: "Fossilized Exotronics",
	}
	for id, name := range expected {
		if byID[id] == 0 {
			t.Errorf("expected raw material %s (%d) in Reflex recipe, not found", name, id)
		}
	}

	// No intermediate IDs should appear.
	intermediates := []uint64{84182, 89258, 78418}
	for _, id := range intermediates {
		if byID[id] > 0 {
			t.Errorf("intermediate %d should not appear in flattened raw materials", id)
		}
	}
}

func TestMaterialsNeeded_Reiver(t *testing.T) {
	r := NewRecipeRegistry()
	mats := r.MaterialsNeeded(87848, 1)

	byID := make(map[uint64]int)
	for _, m := range mats {
		byID[m.TypeID] = m.Quantity
	}

	// Reiver needs: Feldspar Crystals, Silica Grains, Iron-Rich Nodules,
	// Palladium, Fossilized Exotronics.
	expected := []uint64{77800, 89259, 89260, 99001, 83818}
	for _, id := range expected {
		if byID[id] == 0 {
			t.Errorf("expected raw material %d in Reiver recipe, not found", id)
		}
	}
}

func TestMaterialsNeeded_UnknownItem(t *testing.T) {
	r := NewRecipeRegistry()
	mats := r.MaterialsNeeded(99999, 10)

	// Unknown item treated as raw material — returns itself.
	if len(mats) != 1 {
		t.Fatalf("expected 1 material for unknown item, got %d", len(mats))
	}
	if mats[0].TypeID != 99999 || mats[0].Quantity != 10 {
		t.Errorf("expected {99999, 10}, got {%d, %d}", mats[0].TypeID, mats[0].Quantity)
	}
}

func TestIsRawMaterial(t *testing.T) {
	r := NewRecipeRegistry()

	if !r.IsRawMaterial(77800) {
		t.Error("Feldspar Crystals (77800) should be raw material")
	}
	if !r.IsRawMaterial(89259) {
		t.Error("Silica Grains (89259) should be raw material")
	}
	if r.IsRawMaterial(84182) {
		t.Error("Reinforced Alloys (84182) should NOT be raw material")
	}
	if r.IsRawMaterial(87847) {
		t.Error("Reflex (87847) should NOT be raw material")
	}
}

func TestLookup(t *testing.T) {
	r := NewRecipeRegistry()

	if rec := r.Lookup(87847); rec == nil || rec.OutputName != "Reflex" {
		t.Error("expected to find Reflex recipe")
	}
	if rec := r.Lookup(99999); rec != nil {
		t.Error("expected nil for unknown type")
	}
}

func TestMaterialsNeeded_USV(t *testing.T) {
	r := NewRecipeRegistry()
	mats := r.MaterialsNeeded(81609, 1)

	byID := make(map[uint64]int)
	for _, m := range mats {
		byID[m.TypeID] = m.Quantity
	}

	// USV flattens through Batched intermediates, Archangel Protocol Frame,
	// down to raw ores. Check key raw materials appear.
	rawMats := []uint64{
		89259, // Silica Grains
		89260, // Iron-Rich Nodules
		99001, // Palladium
		77800, // Feldspar Crystals
		88783, // Kerogen Tar
	}
	for _, id := range rawMats {
		if byID[id] == 0 {
			t.Errorf("expected raw material %d in USV recipe, not found", id)
		}
	}

	// Intermediates should NOT appear.
	intermediates := []uint64{84204, 88841, 88843, 78420}
	for _, id := range intermediates {
		if byID[id] > 0 {
			t.Errorf("intermediate %d should not appear in flattened USV materials", id)
		}
	}
}

func TestMaterialsNeeded_TADES(t *testing.T) {
	r := NewRecipeRegistry()
	mats := r.MaterialsNeeded(81808, 1)

	byID := make(map[uint64]int)
	for _, m := range mats {
		byID[m.TypeID] = m.Quantity
	}

	// TADES needs Kerogen Tar (from Apocalypse Protocol Frame), plus base ores.
	if byID[88783] == 0 {
		t.Error("expected Kerogen Tar in TADES recipe")
	}
	// Also needs Brine and Tholin Nodules (from Still Kernel).
	if byID[92422] == 0 {
		t.Error("expected Brine in TADES recipe")
	}
}

func TestMaterialsNeeded_MAUL(t *testing.T) {
	r := NewRecipeRegistry()
	mats := r.MaterialsNeeded(82430, 1)

	byID := make(map[uint64]int)
	for _, m := range mats {
		byID[m.TypeID] = m.Quantity
	}

	// MAUL uses Packaged intermediates which flatten through Batched,
	// then through basic intermediates, down to raw ores.
	expected := []uint64{
		89259,  // Silica Grains
		89260,  // Iron-Rich Nodules
		77800,  // Feldspar Crystals
		88783,  // Kerogen Tar
		83839,  // Salt (Still Knot)
		88564,  // Feral Echo (Still Knot)
		77801,  // Nickel-Iron Veins (Echo Chamber)
	}
	for _, id := range expected {
		if byID[id] == 0 {
			t.Errorf("expected raw material %d in MAUL recipe, not found", id)
		}
	}

	// No Packaged or Batched intermediates should appear.
	intermediates := []uint64{84206, 88842, 88844, 84204, 88841, 88843}
	for _, id := range intermediates {
		if byID[id] > 0 {
			t.Errorf("intermediate %d should not appear in flattened MAUL materials", id)
		}
	}
}

func TestRecipe_FacilityField(t *testing.T) {
	r := NewRecipeRegistry()

	tests := []struct {
		typeID   uint64
		name     string
		facility string
	}{
		{87847, "Reflex", "Mini Berth"},
		{81609, "USV", "Berth"},
		{82426, "LORHA", "Berth"},
		{81808, "TADES", "Berth"},
		{82430, "MAUL", "Heavy Berth"},
		{84204, "Batched Reinforced Alloys", "Printer"},
		{84206, "Packaged Reinforced Alloys", "Heavy Printer"},
		{78416, "Apocalypse Protocol Frame", "Printer"},
	}
	for _, tt := range tests {
		rec := r.Lookup(tt.typeID)
		if rec == nil {
			t.Errorf("recipe not found for %s (%d)", tt.name, tt.typeID)
			continue
		}
		if rec.Facility != tt.facility {
			t.Errorf("%s: expected facility %q, got %q", tt.name, tt.facility, rec.Facility)
		}
	}
}

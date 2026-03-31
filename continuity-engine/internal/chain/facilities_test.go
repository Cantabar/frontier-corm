package chain

import (
	"testing"
)

func TestFacilityRequirements_Corvette(t *testing.T) {
	r := NewRecipeRegistry()

	// Reflex (corvette) — only needs Mini Berth + Field Printer (both starters).
	reqs := r.FacilityRequirements(87847)
	if len(reqs) != 0 {
		t.Errorf("Reflex should need no non-starter facilities, got %d: %v", len(reqs), reqs)
	}
}

func TestFacilityRequirements_Frigate(t *testing.T) {
	r := NewRecipeRegistry()

	// USV (frigate) — needs Berth + Printer (non-starter).
	reqs := r.FacilityRequirements(81609)
	reqMap := facReqMap(reqs)

	if !reqMap[FacilityBerth] {
		t.Error("USV should require Berth")
	}
	if !reqMap[FacilityPrinter] {
		t.Error("USV should require Printer")
	}
	// Should NOT require Heavy Printer or Heavy Berth.
	if reqMap[FacilityHeavyPrinter] {
		t.Error("USV should NOT require Heavy Printer")
	}
	if reqMap[FacilityHeavyBerth] {
		t.Error("USV should NOT require Heavy Berth")
	}
}

func TestFacilityRequirements_TADES(t *testing.T) {
	r := NewRecipeRegistry()

	// TADES (destroyer) — needs Berth + Printer.
	reqs := r.FacilityRequirements(81808)
	reqMap := facReqMap(reqs)

	if !reqMap[FacilityBerth] {
		t.Error("TADES should require Berth")
	}
	if !reqMap[FacilityPrinter] {
		t.Error("TADES should require Printer")
	}
	if reqMap[FacilityHeavyBerth] {
		t.Error("TADES should NOT require Heavy Berth")
	}
}

func TestFacilityRequirements_MAUL(t *testing.T) {
	r := NewRecipeRegistry()

	// MAUL (cruiser) — needs Heavy Berth + Heavy Printer + Printer.
	reqs := r.FacilityRequirements(82430)
	reqMap := facReqMap(reqs)

	if !reqMap[FacilityHeavyBerth] {
		t.Error("MAUL should require Heavy Berth")
	}
	if !reqMap[FacilityHeavyPrinter] {
		t.Error("MAUL should require Heavy Printer")
	}
	if !reqMap[FacilityPrinter] {
		t.Error("MAUL should require Printer")
	}
}

func TestCheckMissingFacilities_AllPresent(t *testing.T) {
	required := []FacilityRequirement{
		{TypeID: FacilityPrinter, Name: "Printer"},
		{TypeID: FacilityBerth, Name: "Berth"},
	}
	assemblies := []AssemblyInfo{
		{TypeID: FacilityPrinter, TypeName: "Printer"},
		{TypeID: FacilityBerth, TypeName: "Berth"},
	}

	missing := CheckMissingFacilities(required, assemblies)
	if len(missing) != 0 {
		t.Errorf("expected no missing facilities, got %d", len(missing))
	}
}

func TestCheckMissingFacilities_SomeMissing(t *testing.T) {
	required := []FacilityRequirement{
		{TypeID: FacilityPrinter, Name: "Printer"},
		{TypeID: FacilityBerth, Name: "Berth"},
		{TypeID: FacilityHeavyBerth, Name: "Heavy Berth"},
	}
	assemblies := []AssemblyInfo{
		{TypeID: FacilityPrinter, TypeName: "Printer"},
	}

	missing := CheckMissingFacilities(required, assemblies)
	if len(missing) != 2 {
		t.Fatalf("expected 2 missing facilities, got %d", len(missing))
	}
	missingMap := facReqMap(missing)
	if !missingMap[FacilityBerth] {
		t.Error("expected Berth to be missing")
	}
	if !missingMap[FacilityHeavyBerth] {
		t.Error("expected Heavy Berth to be missing")
	}
}

func facReqMap(reqs []FacilityRequirement) map[uint64]bool {
	m := make(map[uint64]bool)
	for _, r := range reqs {
		m[r.TypeID] = true
	}
	return m
}

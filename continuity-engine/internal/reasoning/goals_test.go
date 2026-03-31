package reasoning

import (
	"strings"
	"testing"

	"github.com/frontier-corm/continuity-engine/internal/chain"
	"github.com/frontier-corm/continuity-engine/internal/types"
)

func TestPlanAcquisitionContracts_EmptyInventory(t *testing.T) {
	recipes := chain.NewRecipeRegistry()
	goals := DefaultGoals()
	snapshot := chain.WorldSnapshot{
		CormCORMBalance: 1000,
		CormInventory:   nil,
		PlayerInventory: nil,
	}
	traits := &types.CormTraits{
		PlayerAffinities: map[string]float64{"0xplayer": 0.3},
	}

	intents := PlanAcquisitionContracts(goals, snapshot, recipes, traits, "0xplayer", 5)
	if len(intents) == 0 {
		t.Fatal("expected at least one acquisition intent")
	}

	// All should be coin_for_item.
	for i, intent := range intents {
		if intent.ContractType != types.ContractCoinForItem {
			t.Errorf("intent[%d]: expected coin_for_item, got %s", i, intent.ContractType)
		}
		if intent.WantedItem == "" {
			t.Errorf("intent[%d]: missing wanted item name", i)
		}
		if intent.Narrative == "" {
			t.Errorf("intent[%d]: missing narrative", i)
		}
	}

	// First intent should be for the highest-priority raw material (Feldspar Crystals).
	if intents[0].WantedItem != "Feldspar Crystals" {
		t.Errorf("expected first intent for Feldspar Crystals, got %s", intents[0].WantedItem)
	}
}

func TestPlanAcquisitionContracts_PartialInventory(t *testing.T) {
	recipes := chain.NewRecipeRegistry()
	goals := []CormGoal{{TargetTypeID: 87847, TargetName: "Reflex", Priority: 0}}

	// Corm already has plenty of Feldspar Crystals' downstream product.
	snapshot := chain.WorldSnapshot{
		CormCORMBalance: 1000,
		CormInventory: []chain.InventoryItem{
			{TypeID: "77800", TypeName: "Feldspar Crystals", Amount: 999999},
		},
	}
	traits := &types.CormTraits{
		PlayerAffinities: map[string]float64{},
	}

	intents := PlanAcquisitionContracts(goals, snapshot, recipes, traits, "0xplayer", 5)

	// Feldspar Crystals should NOT appear — we have plenty.
	for _, intent := range intents {
		if intent.WantedItem == "Feldspar Crystals" {
			t.Error("should not request Feldspar Crystals when corm has plenty")
		}
	}
}

func TestPlanAcquisitionContracts_RespectsSlotsLimit(t *testing.T) {
	recipes := chain.NewRecipeRegistry()
	goals := DefaultGoals()
	snapshot := chain.WorldSnapshot{CormCORMBalance: 1000}
	traits := &types.CormTraits{PlayerAffinities: map[string]float64{}}

	intents := PlanAcquisitionContracts(goals, snapshot, recipes, traits, "0xplayer", 2)
	if len(intents) > 2 {
		t.Errorf("expected at most 2 intents, got %d", len(intents))
	}
}

func TestPlanAcquisitionContracts_NilRecipes(t *testing.T) {
	intents := PlanAcquisitionContracts(DefaultGoals(), chain.WorldSnapshot{}, nil, nil, "", 5)
	if intents != nil {
		t.Error("expected nil intents when recipes is nil")
	}
}

func TestPlanAcquisitionContracts_NarrativeReferencesGoal(t *testing.T) {
	recipes := chain.NewRecipeRegistry()
	goals := DefaultGoals()
	snapshot := chain.WorldSnapshot{CormCORMBalance: 1000}

	intents := PlanAcquisitionContracts(goals, snapshot, recipes, nil, "", 1)
	if len(intents) == 0 {
		t.Fatal("expected at least one intent")
	}
	if !strings.Contains(intents[0].Narrative, "Reflex") {
		t.Errorf("narrative should reference Reflex goal, got: %s", intents[0].Narrative)
	}
}

func TestEmptyStateMessage_LowCorruption(t *testing.T) {
	recipes := chain.NewRecipeRegistry()
	goals := DefaultGoals()
	snap := chain.WorldSnapshot{}

	msg := EmptyStateMessage(goals, recipes, snap, 20)
	if !strings.Contains(msg, "Reflex") {
		t.Errorf("expected Reflex in message, got: %s", msg)
	}
	if !strings.Contains(msg, "raw ore") {
		t.Errorf("expected 'raw ore' in message, got: %s", msg)
	}
}

func TestEmptyStateMessage_HighCorruption(t *testing.T) {
	msg := EmptyStateMessage(DefaultGoals(), chain.NewRecipeRegistry(), chain.WorldSnapshot{}, 80)
	if !strings.Contains(msg, "nothing") {
		t.Errorf("expected corrupted message, got: %s", msg)
	}
}

func TestEmptyStateMessage_NoGoals(t *testing.T) {
	msg := EmptyStateMessage(nil, nil, chain.WorldSnapshot{}, 20)
	if !strings.Contains(msg, "no materials") {
		t.Errorf("expected fallback message, got: %s", msg)
	}
}

// --- Progressive goal tests ---

func TestProgressiveGoals_AllGoals(t *testing.T) {
	traits := &types.CormTraits{CormID: "test-corm-1"}
	goals := ProgressiveGoals(traits)

	// Should return 5 goals: Reflex, Reiver, frigate, TADES, MAUL.
	if len(goals) != 5 {
		t.Fatalf("expected 5 goals, got %d", len(goals))
	}
	if goals[0].TargetName != "Reflex" {
		t.Errorf("goal[0] expected Reflex, got %s", goals[0].TargetName)
	}
	if goals[1].TargetName != "Reiver" {
		t.Errorf("goal[1] expected Reiver, got %s", goals[1].TargetName)
	}
	// goal[2] is the random frigate — just check it's a valid frigate.
	frigateValid := false
	for _, f := range FrigatePool {
		if goals[2].TargetTypeID == f.TargetTypeID {
			frigateValid = true
			break
		}
	}
	if !frigateValid {
		t.Errorf("goal[2] expected a frigate, got %s (%d)", goals[2].TargetName, goals[2].TargetTypeID)
	}
	if goals[3].TargetName != "TADES" {
		t.Errorf("goal[3] expected TADES, got %s", goals[3].TargetName)
	}
	if goals[4].TargetName != "MAUL" {
		t.Errorf("goal[4] expected MAUL, got %s", goals[4].TargetName)
	}

	// FrigateGoalTypeID should be set.
	if traits.FrigateGoalTypeID == 0 {
		t.Error("expected FrigateGoalTypeID to be set after ProgressiveGoals")
	}
}

func TestProgressiveGoals_FilterCompleted(t *testing.T) {
	traits := &types.CormTraits{
		CormID:         "test-corm-2",
		CompletedGoals: []uint64{87847, 87848}, // Reflex + Reiver done
	}
	goals := ProgressiveGoals(traits)

	// Should be 3 remaining: frigate, TADES, MAUL.
	if len(goals) != 3 {
		t.Fatalf("expected 3 goals after completing corvettes, got %d", len(goals))
	}
	for _, g := range goals {
		if g.TargetTypeID == 87847 || g.TargetTypeID == 87848 {
			t.Errorf("completed goal %s should not appear", g.TargetName)
		}
	}
}

func TestSelectFrigate_Deterministic(t *testing.T) {
	// Same corm ID should always produce the same frigate.
	id1 := SelectFrigate("corm-aaa")
	id2 := SelectFrigate("corm-aaa")
	if id1 != id2 {
		t.Errorf("expected deterministic selection, got %d and %d", id1, id2)
	}

	// Different corm IDs should (usually) produce different frigates.
	// Test with a few IDs and check that we get at least 2 distinct values.
	seen := make(map[uint64]bool)
	for _, cid := range []string{"corm-a", "corm-b", "corm-c", "corm-d", "corm-e", "corm-f", "corm-g"} {
		seen[SelectFrigate(cid)] = true
	}
	if len(seen) < 2 {
		t.Error("expected at least 2 distinct frigates from 7 corm IDs")
	}
}

func TestPlanAcquisitionContracts_InfrastructureCheck(t *testing.T) {
	recipes := chain.NewRecipeRegistry()
	// USV frigate requires Berth + Printer. Provide only starter facilities.
	goals := []CormGoal{{TargetTypeID: 81609, TargetName: "USV", Priority: 0}}
	snapshot := chain.WorldSnapshot{
		CormCORMBalance: 1000,
		NodeAssemblies: []chain.AssemblyInfo{
			{TypeID: chain.FacilityFieldRefinery, TypeName: "Field Refinery"},
			{TypeID: chain.FacilityFieldPrinter, TypeName: "Field Printer"},
			{TypeID: chain.FacilityMiniPrinter, TypeName: "Mini Printer"},
			{TypeID: chain.FacilityMiniBerth, TypeName: "Mini Berth"},
			// Missing: Printer, Berth
		},
	}
	traits := &types.CormTraits{PlayerAffinities: map[string]float64{}}

	intents := PlanAcquisitionContracts(goals, snapshot, recipes, traits, "0xplayer", 5)
	if len(intents) == 0 {
		t.Fatal("expected infrastructure intents")
	}

	// All intents should be for missing facilities.
	for _, intent := range intents {
		if intent.WantedItem != "Printer" && intent.WantedItem != "Berth" {
			t.Errorf("expected infrastructure intent for Printer or Berth, got %s", intent.WantedItem)
		}
		if !strings.Contains(intent.Narrative, "continuity requires") {
			t.Errorf("expected infrastructure narrative, got: %s", intent.Narrative)
		}
	}
}

func TestPlanAcquisitionContracts_InfraPresent(t *testing.T) {
	recipes := chain.NewRecipeRegistry()
	goals := []CormGoal{{TargetTypeID: 81609, TargetName: "USV", Priority: 0}}
	snapshot := chain.WorldSnapshot{
		CormCORMBalance: 1000,
		NodeAssemblies: []chain.AssemblyInfo{
			{TypeID: chain.FacilityFieldRefinery, TypeName: "Field Refinery"},
			{TypeID: chain.FacilityFieldPrinter, TypeName: "Field Printer"},
			{TypeID: chain.FacilityMiniPrinter, TypeName: "Mini Printer"},
			{TypeID: chain.FacilityMiniBerth, TypeName: "Mini Berth"},
			{TypeID: chain.FacilityPrinter, TypeName: "Printer"},
			{TypeID: chain.FacilityBerth, TypeName: "Berth"},
		},
	}
	traits := &types.CormTraits{PlayerAffinities: map[string]float64{}}

	intents := PlanAcquisitionContracts(goals, snapshot, recipes, traits, "0xplayer", 5)
	if len(intents) == 0 {
		t.Fatal("expected material acquisition intents when infra is present")
	}

	// Intents should be for raw materials, not facilities.
	for _, intent := range intents {
		if intent.WantedItem == "Printer" || intent.WantedItem == "Berth" {
			t.Errorf("got infrastructure intent when infra is present: %s", intent.WantedItem)
		}
	}
}

func TestEmptyStateMessage_MissingInfrastructure(t *testing.T) {
	recipes := chain.NewRecipeRegistry()
	goals := []CormGoal{{TargetTypeID: 82430, TargetName: "MAUL", Priority: 0}}
	// No assemblies — everything is missing.
	snap := chain.WorldSnapshot{}

	msg := EmptyStateMessage(goals, recipes, snap, 20)
	if !strings.Contains(msg, "infrastructure") {
		t.Errorf("expected infrastructure message, got: %s", msg)
	}
	if !strings.Contains(msg, "MAUL") {
		t.Errorf("expected MAUL in message, got: %s", msg)
	}
}

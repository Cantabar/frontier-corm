package chain

// Facility type ID constants for manufacturing structures.
const (
	FacilityFieldRefinery uint64 = 87090
	FacilityFieldPrinter  uint64 = 87162
	FacilityMiniPrinter   uint64 = 87119
	FacilityMiniBerth     uint64 = 88069
	FacilityPrinter       uint64 = 88067
	FacilityBerth         uint64 = 88070
	FacilityHeavyPrinter  uint64 = 87120
	FacilityHeavyBerth    uint64 = 88071
)

// facilityNameToID maps the string Facility field in recipes to type IDs.
var facilityNameToID = map[string]uint64{
	"Field Refinery": FacilityFieldRefinery,
	"Field Printer":  FacilityFieldPrinter,
	"Mini Printer":   FacilityMiniPrinter,
	"Mini Berth":     FacilityMiniBerth,
	"Printer":        FacilityPrinter,
	"Berth":          FacilityBerth,
	"Heavy Printer":  FacilityHeavyPrinter,
	"Heavy Berth":    FacilityHeavyBerth,
}

// FacilityRequirement describes a manufacturing facility needed for a build.
type FacilityRequirement struct {
	TypeID uint64
	Name   string
}

// FacilityRequirements walks the recipe tree for a target item and returns
// the unique set of facilities needed to build it and all intermediates.
// Starter facilities (Field Refinery, Field Printer, Mini Printer, Mini Berth)
// are excluded since all players have them from the tutorial.
func (r *RecipeRegistry) FacilityRequirements(targetTypeID uint64) []FacilityRequirement {
	seen := make(map[uint64]bool)
	var result []FacilityRequirement

	r.collectFacilities(targetTypeID, seen, &result)
	return result
}

// starterFacilities are facilities every player has from the tutorial.
// These are excluded from infrastructure check results.
var starterFacilities = map[uint64]bool{
	FacilityFieldRefinery: true,
	FacilityFieldPrinter:  true,
	FacilityMiniPrinter:   true,
	FacilityMiniBerth:     true,
}

// collectFacilities recursively collects facility requirements from the recipe tree.
func (r *RecipeRegistry) collectFacilities(typeID uint64, seen map[uint64]bool, result *[]FacilityRequirement) {
	recipe := r.recipes[typeID]
	if recipe == nil {
		return // raw material — no facility needed
	}

	// Add this recipe's facility if it's not a starter and not already seen.
	if recipe.Facility != "" {
		facID, ok := facilityNameToID[recipe.Facility]
		if ok && !starterFacilities[facID] && !seen[facID] {
			seen[facID] = true
			*result = append(*result, FacilityRequirement{
				TypeID: facID,
				Name:   recipe.Facility,
			})
		}
	}

	// Recurse into inputs.
	for _, input := range recipe.Inputs {
		r.collectFacilities(input.TypeID, seen, result)
	}
}

// CheckMissingFacilities returns the subset of required facilities that are
// not present in the node's assembly list.
func CheckMissingFacilities(required []FacilityRequirement, assemblies []AssemblyInfo) []FacilityRequirement {
	present := make(map[uint64]bool)
	for _, a := range assemblies {
		present[a.TypeID] = true
	}

	var missing []FacilityRequirement
	for _, req := range required {
		if !present[req.TypeID] {
			missing = append(missing, req)
		}
	}
	return missing
}

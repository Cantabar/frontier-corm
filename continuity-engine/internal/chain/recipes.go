package chain

// RecipeInput is a single material requirement.
type RecipeInput struct {
	TypeID   uint64
	Name     string
	Quantity int
}

// Recipe describes how to produce an item from inputs.
type Recipe struct {
	OutputTypeID   uint64
	OutputName     string
	OutputQuantity int
	Inputs         []RecipeInput
	Facility       string
}

// RecipeRegistry holds the curated recipe graph for goal-directed contracts.
type RecipeRegistry struct {
	recipes map[uint64]*Recipe // outputTypeID → recipe
}

// NewRecipeRegistry builds the hardcoded recipe graph for target ships and
// their full dependency trees.
func NewRecipeRegistry() *RecipeRegistry {
	r := &RecipeRegistry{recipes: make(map[uint64]*Recipe)}

	// --- Raw ore refinement ---

	// Feldspar Crystals → Hydrocarbon Residue (Field Refinery)
	r.recipes[89258] = &Recipe{
		OutputTypeID: 89258, OutputName: "Hydrocarbon Residue", OutputQuantity: 5,
		Inputs:   []RecipeInput{{TypeID: 77800, Name: "Feldspar Crystals", Quantity: 20}},
		Facility: "Field Refinery",
	}

	// --- Intermediate components (Field Printer) ---

	// Reinforced Alloys: Silica Grains + Iron-Rich Nodules + Palladium
	r.recipes[84182] = &Recipe{
		OutputTypeID: 84182, OutputName: "Reinforced Alloys", OutputQuantity: 8,
		Inputs: []RecipeInput{
			{TypeID: 89259, Name: "Silica Grains", Quantity: 105},
			{TypeID: 89260, Name: "Iron-Rich Nodules", Quantity: 70},
			{TypeID: 99001, Name: "Palladium", Quantity: 70},
		},
		Facility: "Field Printer",
	}

	// Carbon Weave: Hydrocarbon Residue
	r.recipes[84210] = &Recipe{
		OutputTypeID: 84210, OutputName: "Carbon Weave", OutputQuantity: 14,
		Inputs:   []RecipeInput{{TypeID: 89258, Name: "Hydrocarbon Residue", Quantity: 350}},
		Facility: "Field Printer",
	}

	// Thermal Composites: Hydrocarbon Residue + Silica Grains
	r.recipes[88561] = &Recipe{
		OutputTypeID: 88561, OutputName: "Thermal Composites", OutputQuantity: 14,
		Inputs: []RecipeInput{
			{TypeID: 89258, Name: "Hydrocarbon Residue", Quantity: 140},
			{TypeID: 89259, Name: "Silica Grains", Quantity: 90},
		},
		Facility: "Field Printer",
	}

	// Nomad Program Frame: Fossilized Exotronics
	r.recipes[78418] = &Recipe{
		OutputTypeID: 78418, OutputName: "Nomad Program Frame", OutputQuantity: 1,
		Inputs:   []RecipeInput{{TypeID: 83818, Name: "Fossilized Exotronics", Quantity: 5}},
		Facility: "Field Printer",
	}

	// --- New raw-material-tier components ---

	// Still Kernel (BP 1482): Mini Printer / Printer
	r.recipes[92483] = &Recipe{
		OutputTypeID: 92483, OutputName: "Still Kernel", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 92422, Name: "Brine", Quantity: 50},
			{TypeID: 78449, Name: "Tholin Nodules", Quantity: 5},
		},
		Facility: "Mini Printer",
	}

	// Echo Chamber (BP 1022): Mini Printer / Printer
	r.recipes[88780] = &Recipe{
		OutputTypeID: 88780, OutputName: "Echo Chamber", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 77801, Name: "Nickel-Iron Veins", Quantity: 120},
			{TypeID: 88234, Name: "Troilite Sulfide Grains", Quantity: 45},
			{TypeID: 88235, Name: "Feldspar Crystal Shards", Quantity: 105},
		},
		Facility: "Mini Printer",
	}

	// Still Knot (BP 1023): Mini Printer / Printer
	r.recipes[88565] = &Recipe{
		OutputTypeID: 88565, OutputName: "Still Knot", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 83839, Name: "Salt", Quantity: 5},
			{TypeID: 88564, Name: "Feral Echo", Quantity: 5},
		},
		Facility: "Mini Printer",
	}

	// Kerogen Tar: raw material (no recipe, gathered directly)

	// --- Program Frames (Printer) ---

	// Apocalypse Protocol Frame (BP 1043): Printer
	r.recipes[78416] = &Recipe{
		OutputTypeID: 78416, OutputName: "Apocalypse Protocol Frame", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 88565, Name: "Still Knot", Quantity: 1},
			{TypeID: 88780, Name: "Echo Chamber", Quantity: 1},
			{TypeID: 88783, Name: "Kerogen Tar", Quantity: 128},
		},
		Facility: "Printer",
	}

	// Bastion Program Frame (BP 1044): Printer
	r.recipes[78417] = &Recipe{
		OutputTypeID: 78417, OutputName: "Bastion Program Frame", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 88565, Name: "Still Knot", Quantity: 1},
			{TypeID: 88780, Name: "Echo Chamber", Quantity: 1},
			{TypeID: 88783, Name: "Kerogen Tar", Quantity: 38},
		},
		Facility: "Printer",
	}

	// Archangel Protocol Frame (BP 1047): Printer
	r.recipes[78420] = &Recipe{
		OutputTypeID: 78420, OutputName: "Archangel Protocol Frame", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 88565, Name: "Still Knot", Quantity: 1},
			{TypeID: 88780, Name: "Echo Chamber", Quantity: 1},
			{TypeID: 88783, Name: "Kerogen Tar", Quantity: 38},
		},
		Facility: "Printer",
	}

	// Exterminata Protocol Frame (BP 1048): Printer
	r.recipes[78421] = &Recipe{
		OutputTypeID: 78421, OutputName: "Exterminata Protocol Frame", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 88565, Name: "Still Knot", Quantity: 1},
			{TypeID: 88780, Name: "Echo Chamber", Quantity: 1},
			{TypeID: 88783, Name: "Kerogen Tar", Quantity: 38},
		},
		Facility: "Printer",
	}

	// --- Batched intermediates (Printer) ---

	// Batched Reinforced Alloys (BP 1039): Printer
	r.recipes[84204] = &Recipe{
		OutputTypeID: 84204, OutputName: "Batched Reinforced Alloys", OutputQuantity: 1,
		Inputs:   []RecipeInput{{TypeID: 84182, Name: "Reinforced Alloys", Quantity: 10}},
		Facility: "Printer",
	}

	// Batched Carbon Weave (BP 1038): Printer
	r.recipes[88841] = &Recipe{
		OutputTypeID: 88841, OutputName: "Batched Carbon Weave", OutputQuantity: 1,
		Inputs:   []RecipeInput{{TypeID: 84210, Name: "Carbon Weave", Quantity: 10}},
		Facility: "Printer",
	}

	// Batched Thermal Composites (BP 1035): Printer
	r.recipes[88843] = &Recipe{
		OutputTypeID: 88843, OutputName: "Batched Thermal Composites", OutputQuantity: 1,
		Inputs:   []RecipeInput{{TypeID: 88561, Name: "Thermal Composites", Quantity: 10}},
		Facility: "Printer",
	}

	// --- Packaged intermediates (Heavy Printer) ---

	// Packaged Reinforced Alloys (BP 1059): Heavy Printer
	r.recipes[84206] = &Recipe{
		OutputTypeID: 84206, OutputName: "Packaged Reinforced Alloys", OutputQuantity: 1,
		Inputs:   []RecipeInput{{TypeID: 84204, Name: "Batched Reinforced Alloys", Quantity: 10}},
		Facility: "Heavy Printer",
	}

	// Packaged Carbon Weave (BP 1058): Heavy Printer
	r.recipes[88842] = &Recipe{
		OutputTypeID: 88842, OutputName: "Packaged Carbon Weave", OutputQuantity: 1,
		Inputs:   []RecipeInput{{TypeID: 88841, Name: "Batched Carbon Weave", Quantity: 10}},
		Facility: "Heavy Printer",
	}

	// Packaged Thermal Composites (BP 1055): Heavy Printer
	r.recipes[88844] = &Recipe{
		OutputTypeID: 88844, OutputName: "Packaged Thermal Composites", OutputQuantity: 1,
		Inputs:   []RecipeInput{{TypeID: 88843, Name: "Batched Thermal Composites", Quantity: 10}},
		Facility: "Heavy Printer",
	}

	// --- Ships: Corvettes ---

	// Reflex (BP 1009): Mini Berth / Field Printer
	r.recipes[87847] = &Recipe{
		OutputTypeID: 87847, OutputName: "Reflex", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 78418, Name: "Nomad Program Frame", Quantity: 1},
			{TypeID: 84182, Name: "Reinforced Alloys", Quantity: 28},
			{TypeID: 89258, Name: "Hydrocarbon Residue", Quantity: 40},
		},
		Facility: "Mini Berth",
	}

	// Reiver (BP 1224): Mini Berth
	r.recipes[87848] = &Recipe{
		OutputTypeID: 87848, OutputName: "Reiver", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 78418, Name: "Nomad Program Frame", Quantity: 2},
			{TypeID: 84210, Name: "Carbon Weave", Quantity: 33},
			{TypeID: 88561, Name: "Thermal Composites", Quantity: 33},
			{TypeID: 84182, Name: "Reinforced Alloys", Quantity: 78},
		},
		Facility: "Mini Berth",
	}

	// --- Ships: Frigates (Berth) ---

	// USV (BP 1232): Berth
	r.recipes[81609] = &Recipe{
		OutputTypeID: 81609, OutputName: "USV", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 78420, Name: "Archangel Protocol Frame", Quantity: 1},
			{TypeID: 84204, Name: "Batched Reinforced Alloys", Quantity: 56},
			{TypeID: 88841, Name: "Batched Carbon Weave", Quantity: 28},
			{TypeID: 88843, Name: "Batched Thermal Composites", Quantity: 28},
		},
		Facility: "Berth",
	}

	// LORHA (BP 1228): Berth
	r.recipes[82426] = &Recipe{
		OutputTypeID: 82426, OutputName: "LORHA", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 78417, Name: "Bastion Program Frame", Quantity: 1},
			{TypeID: 84204, Name: "Batched Reinforced Alloys", Quantity: 58},
			{TypeID: 88841, Name: "Batched Carbon Weave", Quantity: 29},
			{TypeID: 88843, Name: "Batched Thermal Composites", Quantity: 29},
		},
		Facility: "Berth",
	}

	// MCF (BP 1229): Berth
	r.recipes[81904] = &Recipe{
		OutputTypeID: 81904, OutputName: "MCF", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 78421, Name: "Exterminata Protocol Frame", Quantity: 1},
			{TypeID: 84204, Name: "Batched Reinforced Alloys", Quantity: 88},
			{TypeID: 88841, Name: "Batched Carbon Weave", Quantity: 48},
			{TypeID: 88843, Name: "Batched Thermal Composites", Quantity: 48},
			{TypeID: 92483, Name: "Still Kernel", Quantity: 3},
		},
		Facility: "Berth",
	}

	// HAF (BP 1231): Berth
	r.recipes[82424] = &Recipe{
		OutputTypeID: 82424, OutputName: "HAF", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 78421, Name: "Exterminata Protocol Frame", Quantity: 1},
			{TypeID: 84204, Name: "Batched Reinforced Alloys", Quantity: 160},
			{TypeID: 88841, Name: "Batched Carbon Weave", Quantity: 74},
			{TypeID: 88843, Name: "Batched Thermal Composites", Quantity: 74},
		},
		Facility: "Berth",
	}

	// LAI (BP 1483): Berth
	r.recipes[82425] = &Recipe{
		OutputTypeID: 82425, OutputName: "LAI", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 78421, Name: "Exterminata Protocol Frame", Quantity: 1},
			{TypeID: 84204, Name: "Batched Reinforced Alloys", Quantity: 80},
			{TypeID: 88841, Name: "Batched Carbon Weave", Quantity: 70},
			{TypeID: 88843, Name: "Batched Thermal Composites", Quantity: 70},
			{TypeID: 92483, Name: "Still Kernel", Quantity: 4},
		},
		Facility: "Berth",
	}

	// --- Ships: Destroyer (Berth) ---

	// TADES (BP 1230): Berth
	r.recipes[81808] = &Recipe{
		OutputTypeID: 81808, OutputName: "TADES", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 78416, Name: "Apocalypse Protocol Frame", Quantity: 1},
			{TypeID: 84204, Name: "Batched Reinforced Alloys", Quantity: 124},
			{TypeID: 88841, Name: "Batched Carbon Weave", Quantity: 72},
			{TypeID: 88843, Name: "Batched Thermal Composites", Quantity: 72},
			{TypeID: 92483, Name: "Still Kernel", Quantity: 4},
		},
		Facility: "Berth",
	}

	// --- Ships: Cruiser (Heavy Berth) ---

	// MAUL (BP 1233): Heavy Berth
	r.recipes[82430] = &Recipe{
		OutputTypeID: 82430, OutputName: "MAUL", OutputQuantity: 1,
		Inputs: []RecipeInput{
			{TypeID: 78416, Name: "Apocalypse Protocol Frame", Quantity: 1},
			{TypeID: 84206, Name: "Packaged Reinforced Alloys", Quantity: 46},
			{TypeID: 88842, Name: "Packaged Carbon Weave", Quantity: 30},
			{TypeID: 88844, Name: "Packaged Thermal Composites", Quantity: 30},
			{TypeID: 88780, Name: "Echo Chamber", Quantity: 7},
			{TypeID: 88565, Name: "Still Knot", Quantity: 2},
		},
		Facility: "Heavy Berth",
	}

	return r
}

// Lookup returns the recipe for a given output type ID, or nil.
func (r *RecipeRegistry) Lookup(typeID uint64) *Recipe {
	return r.recipes[typeID]
}

// MaterialsNeeded recursively flattens the recipe tree for a target item,
// scaling quantities appropriately. Returns the leaf-level raw materials
// (items with no recipe in the registry). Results are aggregated by TypeID.
func (r *RecipeRegistry) MaterialsNeeded(targetTypeID uint64, quantity int) []RecipeInput {
	agg := make(map[uint64]*RecipeInput)
	r.flatten(targetTypeID, quantity, agg)

	out := make([]RecipeInput, 0, len(agg))
	for _, m := range agg {
		out = append(out, *m)
	}
	return out
}

// flatten recursively walks the recipe tree, accumulating raw materials.
func (r *RecipeRegistry) flatten(typeID uint64, quantity int, agg map[uint64]*RecipeInput) {
	recipe := r.recipes[typeID]
	if recipe == nil {
		// Leaf node — this is a raw material.
		if existing, ok := agg[typeID]; ok {
			existing.Quantity += quantity
		} else {
			// We don't have a name here; caller should resolve via registry.
			agg[typeID] = &RecipeInput{TypeID: typeID, Quantity: quantity}
		}
		return
	}

	// How many batches of this recipe do we need?
	batches := (quantity + recipe.OutputQuantity - 1) / recipe.OutputQuantity

	for _, input := range recipe.Inputs {
		needed := input.Quantity * batches
		child := r.recipes[input.TypeID]
		if child == nil {
			// Raw material — accumulate.
			if existing, ok := agg[input.TypeID]; ok {
				existing.Quantity += needed
				// Preserve name if we have it.
			} else {
				agg[input.TypeID] = &RecipeInput{
					TypeID:   input.TypeID,
					Name:     input.Name,
					Quantity: needed,
				}
			}
		} else {
			// Intermediate — recurse.
			r.flatten(input.TypeID, needed, agg)
		}
	}
}

// IsRawMaterial returns true if the given type ID has no recipe in the
// registry (i.e. it must be gathered/mined directly).
func (r *RecipeRegistry) IsRawMaterial(typeID uint64) bool {
	_, hasRecipe := r.recipes[typeID]
	return !hasRecipe
}

// AllRecipes returns all recipes in the registry.
func (r *RecipeRegistry) AllRecipes() []*Recipe {
	out := make([]*Recipe, 0, len(r.recipes))
	for _, rec := range r.recipes {
		out = append(out, rec)
	}
	return out
}

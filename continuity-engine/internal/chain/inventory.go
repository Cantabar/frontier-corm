package chain

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"

	"github.com/pattonkan/sui-go/sui"
	"github.com/pattonkan/sui-go/suiclient"
)

// InventoryItem represents an item in a player's SSU inventory.
type InventoryItem struct {
	TypeID   string
	TypeName string
	Amount   uint64
}

// readSSUInventory reads all inventory items from a StorageUnit object by
// enumerating its dynamic fields via the Sui RPC getDynamicFields /
// getDynamicFieldObject calls.
//
// On-chain, each StorageUnit stores one or more Inventory objects as dynamic
// fields.  The key type for each inventory slot is an ID (either the
// owner_cap_id for the owner's private slot or the deterministic open-storage
// hash).  Each Inventory contains an `items` VecMap<u64, ItemEntry> where
// the key is the item type_id and the value holds {quantity, ...}.
//
// Items across all slots are merged; duplicate type IDs have their quantities
// summed.  RPC errors for individual fields are skipped (best-effort), matching
// the graceful-degradation pattern used elsewhere in this package.
func (c *Client) readSSUInventory(ctx context.Context, ssuID *sui.ObjectId) ([]InventoryItem, error) {
	// 1. List all dynamic fields on this SSU.
	dfPage, err := c.rpc.GetDynamicFields(ctx, &suiclient.GetDynamicFieldsRequest{
		ParentObjectId: ssuID,
	})
	if err != nil {
		return nil, fmt.Errorf("GetDynamicFields: %w", err)
	}

	// Accumulate {typeID → amount} across all inventory slots.
	totals := make(map[uint64]uint64)

	for i := range dfPage.Data {
		field := &dfPage.Data[i]

		// Inventory slot keys are ID/address types.  Skip non-address keys
		// (e.g. extension_freeze marker).
		nameType := field.Name.Type
		if !strings.Contains(nameType, "ID") && !strings.Contains(nameType, "address") {
			continue
		}

		// 2. Fetch the Inventory object for this slot.
		obj, err := c.rpc.GetDynamicFieldObject(ctx, &suiclient.GetDynamicFieldObjectRequest{
			ParentObjectId: ssuID,
			Name:           &field.Name,
		})
		if err != nil {
			slog.Debug(fmt.Sprintf("inventory: skip dynamic field %v on SSU %s: %v", field.Name.Value, ssuID, err))
			continue
		}
		if obj == nil || obj.Data == nil || obj.Data.Content == nil || obj.Data.Content.Data.MoveObject == nil {
			continue
		}

		// 3. Parse the outer fields JSON.
		var outer map[string]json.RawMessage
		if err := json.Unmarshal(obj.Data.Content.Data.MoveObject.Fields, &outer); err != nil {
			continue
		}

		// The dynamic field wraps the Inventory value in a `value` field.
		// Unwrap one level if present.
		fields := outer
		if raw, ok := outer["value"]; ok {
			var inner map[string]json.RawMessage
			if err := json.Unmarshal(raw, &inner); err == nil {
				// inner may itself be a {"fields": {...}} wrapper.
				if fieldsRaw, ok := inner["fields"]; ok {
					var innerFields map[string]json.RawMessage
					if err := json.Unmarshal(fieldsRaw, &innerFields); err == nil {
						fields = innerFields
					} else {
						fields = inner
					}
				} else {
					fields = inner
				}
			}
		} else if fieldsRaw, ok := outer["fields"]; ok {
			var innerFields map[string]json.RawMessage
			if err := json.Unmarshal(fieldsRaw, &innerFields); err == nil {
				fields = innerFields
			}
		}

		// Must look like an Inventory: needs both max_capacity and items.
		if _, ok := fields["max_capacity"]; !ok {
			continue
		}
		itemsRaw, ok := fields["items"]
		if !ok {
			continue
		}

		// 4. Parse the VecMap<u64, ItemEntry> stored under `items`.
		// RPC shape: {"type":"...","fields":{"contents":[{"fields":{"key":"77518","value":{"fields":{"quantity":500,...}}}}]}}
		contents := extractVecMapContents(itemsRaw)
		for _, entry := range contents {
			typeID, qty := parseVecMapEntry(entry)
			if typeID > 0 && qty > 0 {
				totals[typeID] += qty
			}
		}
	}

	if len(totals) == 0 {
		return nil, nil
	}

	// 5. Convert to []InventoryItem, looking up TypeName if registry is available.
	items := make([]InventoryItem, 0, len(totals))
	for typeID, amount := range totals {
		item := InventoryItem{
			TypeID: strconv.FormatUint(typeID, 10),
			Amount: amount,
		}
		if c.registry != nil {
			if regItem := c.registry.LookupByID(typeID); regItem != nil {
				item.TypeName = regItem.Name
			}
		}
		if item.TypeName == "" {
			item.TypeName = item.TypeID // fallback: use the numeric ID as name
		}
		items = append(items, item)
	}
	return items, nil
}

// extractVecMapContents unwraps the nested VecMap JSON representation and
// returns the raw contents slice.  Handles the {"fields":{"contents":[...]}}
// wrapper that the Sui RPC adds around Move struct fields.
func extractVecMapContents(raw json.RawMessage) []json.RawMessage {
	// Try direct array first.
	var arr []json.RawMessage
	if err := json.Unmarshal(raw, &arr); err == nil {
		return arr
	}

	// Unwrap {"type":...,"fields":{"contents":[...]}} or {"contents":[...]}.
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil
	}
	if contentsRaw, ok := obj["contents"]; ok {
		var arr []json.RawMessage
		if err := json.Unmarshal(contentsRaw, &arr); err == nil {
			return arr
		}
	}
	if fieldsRaw, ok := obj["fields"]; ok {
		var inner map[string]json.RawMessage
		if err := json.Unmarshal(fieldsRaw, &inner); err == nil {
			if contentsRaw, ok := inner["contents"]; ok {
				var arr []json.RawMessage
				if err := json.Unmarshal(contentsRaw, &arr); err == nil {
					return arr
				}
			}
		}
	}
	return nil
}

// parseVecMapEntry extracts (typeID, quantity) from a single VecMap entry.
// The RPC may represent the entry as:
//   - {"fields":{"key":"77518","value":{"fields":{"quantity":"500",...}}}}
//   - {"key":"77518","value":{"quantity":"500",...}}
func parseVecMapEntry(raw json.RawMessage) (typeID uint64, quantity uint64) {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return 0, 0
	}
	// Unwrap {"fields":{...}} if present.
	if fieldsRaw, ok := obj["fields"]; ok {
		var inner map[string]json.RawMessage
		if err := json.Unmarshal(fieldsRaw, &inner); err == nil {
			obj = inner
		}
	}

	// Parse key (type_id).
	if keyRaw, ok := obj["key"]; ok {
		typeID = parseU64JSON(keyRaw)
	}
	if typeID == 0 {
		return 0, 0
	}

	// Parse value.quantity — unwrap nested {"fields":{...}} or {"value":{...}}.
	valueRaw, ok := obj["value"]
	if !ok {
		return 0, 0
	}
	var valObj map[string]json.RawMessage
	if err := json.Unmarshal(valueRaw, &valObj); err != nil {
		return 0, 0
	}
	if fieldsRaw, ok := valObj["fields"]; ok {
		var inner map[string]json.RawMessage
		if err := json.Unmarshal(fieldsRaw, &inner); err == nil {
			valObj = inner
		}
	}
	if qRaw, ok := valObj["quantity"]; ok {
		quantity = parseU64JSON(qRaw)
	}
	return typeID, quantity
}

// parseU64JSON parses a JSON number or quoted string as a uint64.
func parseU64JSON(raw json.RawMessage) uint64 {
	// Try unquoted number.
	var n uint64
	if err := json.Unmarshal(raw, &n); err == nil {
		return n
	}
	// Try quoted string.
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		if v, err := strconv.ParseUint(s, 10, 64); err == nil {
			return v
		}
	}
	return 0
}

// GetCormInventory reads items held across all SSUs owned by the brain's
// Character.  It enumerates OwnerCap<StorageUnit> objects on the Character,
// extracts each SSU's object ID from the OwnerCap content, then reads each
// SSU's inventory via readSSUInventory.
//
// The cormID parameter is kept for call-site compatibility but is not used;
// the brain's Character ID (c.cormCharacterID) identifies the relevant SSUs.
func (c *Client) GetCormInventory(ctx context.Context, _ string) ([]InventoryItem, error) {
	if c.seedMode {
		return []InventoryItem{
			{TypeID: "77518", TypeName: "Crude Mineral", Amount: 500},
			{TypeID: "77523", TypeName: "Ferric Ore", Amount: 300},
			{TypeID: "77531", TypeName: "Coolant", Amount: 200},
		}, nil
	}
	if c.cormCharacterID == nil || c.worldPkg == nil {
		return nil, nil
	}

	// Query all OwnerCap<StorageUnit> objects owned by the brain's Character.
	ownerCapStructTag := &sui.StructTag{
		Address: sui.MustAddressFromHex(c.worldPkg.String()),
		Module:  "access",
		Name:    "OwnerCap",
		TypeParams: []sui.TypeTag{{
			Struct: &sui.StructTag{
				Address: sui.MustAddressFromHex(c.worldPkg.String()),
				Module:  "storage_unit",
				Name:    "StorageUnit",
			},
		}},
	}
	charAddr := sui.MustAddressFromHex(c.cormCharacterID.String())
	resp, err := c.rpc.GetOwnedObjects(ctx, &suiclient.GetOwnedObjectsRequest{
		Address: charAddr,
		Query: &suiclient.SuiObjectResponseQuery{
			Filter: &suiclient.SuiObjectDataFilter{
				StructType: ownerCapStructTag,
			},
			Options: &suiclient.SuiObjectDataOptions{
				ShowContent: true,
			},
		},
	})
	if err != nil {
		slog.Info(fmt.Sprintf("inventory: GetCormInventory query OwnerCaps: %v", err))
		return nil, nil
	}

	var merged []InventoryItem
	for _, obj := range resp.Data {
		if obj.Data == nil || obj.Data.Content == nil || obj.Data.Content.Data.MoveObject == nil {
			continue
		}
		// Parse the OwnerCap fields to find the SSU's object_id.
		ssuIDStr := parseOwnerCapObjectID(obj.Data.Content.Data.MoveObject.Fields)
		if ssuIDStr == "" {
			continue
		}
		ssuID, err := sui.ObjectIdFromHex(ssuIDStr)
		if err != nil {
			slog.Debug(fmt.Sprintf("inventory: invalid SSU ID from OwnerCap: %q: %v", ssuIDStr, err))
			continue
		}
		items, err := c.readSSUInventory(ctx, ssuID)
		if err != nil {
			slog.Info(fmt.Sprintf("inventory: readSSUInventory for corm SSU %s: %v", ssuIDStr, err))
			continue
		}
		merged = mergeInventory(merged, items)
	}

	slog.Info(fmt.Sprintf("inventory: GetCormInventory → %d item types", len(merged)))
	return merged, nil
}

// GetPlayerInventory reads items held across all SSUs that belong to the
// given player address, as identified by OwnerAddr in the provided nodeSSUs
// list.  nodeSSUs is the already-fetched result of GetNodeSSUs, making this
// call independent of an extra RPC round-trip to rediscover the node's
// connected assemblies.
//
// Falls back gracefully to nil if no SSU with the player's address is found
// (e.g. the player's SSU is a shared object without AddressOwner set).
func (c *Client) GetPlayerInventory(ctx context.Context, playerAddr string, nodeSSUs []SSUInfo) ([]InventoryItem, error) {
	if c.seedMode {
		return []InventoryItem{
			{TypeID: "77525", TypeName: "Refined Crystal", Amount: 150},
			{TypeID: "77518", TypeName: "Crude Mineral", Amount: 800},
			{TypeID: "77540", TypeName: "Fuel Cell", Amount: 50},
		}, nil
	}
	if playerAddr == "" {
		return nil, nil
	}

	var merged []InventoryItem
	for _, ssu := range nodeSSUs {
		if !strings.EqualFold(ssu.OwnerAddr, playerAddr) {
			continue
		}
		ssuID, err := sui.ObjectIdFromHex(ssu.ObjectID)
		if err != nil {
			continue
		}
		items, err := c.readSSUInventory(ctx, ssuID)
		if err != nil {
			slog.Info(fmt.Sprintf("inventory: readSSUInventory for player SSU %s: %v", ssu.ObjectID, err))
			continue
		}
		merged = mergeInventory(merged, items)
	}

	slog.Info(fmt.Sprintf("inventory: GetPlayerInventory(%s) → %d item types", playerAddr, len(merged)))
	return merged, nil
}

// mergeInventory adds items from src into dst, summing amounts for duplicate
// type IDs.  Returns the (possibly grown) dst slice.
func mergeInventory(dst, src []InventoryItem) []InventoryItem {
	if len(src) == 0 {
		return dst
	}
	// Build a lookup index into dst.
	idx := make(map[string]int, len(dst))
	for i, item := range dst {
		idx[item.TypeID] = i
	}
	for _, item := range src {
		if i, ok := idx[item.TypeID]; ok {
			dst[i].Amount += item.Amount
		} else {
			idx[item.TypeID] = len(dst)
			dst = append(dst, item)
		}
	}
	return dst
}

// parseOwnerCapObjectID extracts the `object_id` field value from a parsed
// OwnerCap MoveObject fields JSON.  The Eve Frontier OwnerCap<T> struct has
// an `object_id: ID` field pointing to the owned object (the SSU).  Returns
// an empty string if the field is absent or cannot be parsed.
func parseOwnerCapObjectID(fieldsJSON json.RawMessage) string {
	if len(fieldsJSON) == 0 {
		return ""
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(fieldsJSON, &fields); err != nil {
		return ""
	}
	raw, ok := fields["object_id"]
	if !ok {
		return ""
	}
	// The ID may be a plain string or wrapped in a {"id":"0x..."} object.
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var obj map[string]string
	if err := json.Unmarshal(raw, &obj); err == nil {
		if id, ok := obj["id"]; ok {
			return id
		}
	}
	return ""
}

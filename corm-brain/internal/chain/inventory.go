package chain

import (
	"context"
	"log"
)

// InventoryItem represents an item in a player's SSU inventory.
type InventoryItem struct {
	TypeID   string
	TypeName string
	Amount   uint64
}

// GetPlayerInventory reads a player's SSU inventory items and balances.
// TODO: Implement via suiclient.GetOwnedObjects + GetDynamicFields.
func (c *Client) GetPlayerInventory(ctx context.Context, playerAddress string) ([]InventoryItem, error) {
	log.Printf("chain: stub GetPlayerInventory for %s", playerAddress)
	return nil, nil
}

package chain

import (
	"context"
	"fmt"
	"log"
)

// ContractParams holds parameters for creating a trustless contract on-chain.
type ContractParams struct {
	ContractType      string // coin_for_coin, item_for_coin, transport, etc.
	PlayerAddress     string
	ItemTypes         []string
	ItemAmounts       []uint64
	RewardAmount      uint64
	DeadlineEpochMs   int64
}

// CreateContract creates a trustless contract on-chain.
// TODO: Implement via PTB calling the appropriate trustless_contracts module.
func (c *Client) CreateContract(ctx context.Context, cormID string, params ContractParams) (string, error) {
	if !c.HasSigner() {
		return "", fmt.Errorf("no signer configured")
	}

	contractID := fmt.Sprintf("contract_%s_%s", cormID[:8], params.ContractType)
	log.Printf("chain: stub CreateContract %s type=%s player=%s", contractID, params.ContractType, params.PlayerAddress)
	return contractID, nil
}

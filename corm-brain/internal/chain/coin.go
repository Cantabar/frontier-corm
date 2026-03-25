package chain

import (
	"context"
	"fmt"
	"log"
)

// MintCORM mints CORM tokens and transfers them to the player.
// TODO: Implement via PTB calling corm_coin::mint + transfer::public_transfer.
func (c *Client) MintCORM(ctx context.Context, cormID, playerAddress string, amount uint64) error {
	if !c.HasSigner() {
		return fmt.Errorf("no signer configured")
	}

	log.Printf("chain: stub MintCORM %d to %s (corm %s)", amount, playerAddress, cormID)
	return nil
}

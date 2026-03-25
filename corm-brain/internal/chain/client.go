// Package chain provides SUI blockchain interaction for the corm-brain service.
//
// This package wraps pattonkan/sui-go for JSON-RPC calls, PTB building,
// Ed25519 signing, and BCS decoding. The real implementation will be added
// once the CormState Move contracts are deployed.
package chain

import (
	"log"
)

// Client wraps SUI RPC access for reading and writing on-chain state.
type Client struct {
	rpcURL    string
	packageID string
	signer    *Signer
}

// NewClient creates a SUI chain client.
func NewClient(rpcURL, packageID, privateKey string) *Client {
	var signer *Signer
	if privateKey != "" {
		signer = NewSigner(privateKey)
		log.Printf("chain: initialized signer for address %s", signer.Address())
	} else {
		log.Println("chain: WARNING — no SUI_PRIVATE_KEY set, on-chain writes disabled")
	}

	return &Client{
		rpcURL:    rpcURL,
		packageID: packageID,
		signer:    signer,
	}
}

// HasSigner returns true if the client can sign transactions.
func (c *Client) HasSigner() bool {
	return c.signer != nil
}

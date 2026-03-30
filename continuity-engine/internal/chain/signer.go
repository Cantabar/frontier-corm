package chain

// Signer manages an Ed25519 keypair for signing SUI transactions.
// This is a stub — the real implementation will use pattonkan/sui-go's suisigner.
type Signer struct {
	privateKey string
	address    string
}

// NewSigner creates a signer from a private key string.
// TODO: Replace with actual Ed25519 keypair derivation via sui-go.
func NewSigner(privateKey string) *Signer {
	return &Signer{
		privateKey: privateKey,
		address:    "0x" + privateKey[:8] + "...", // placeholder
	}
}

// Address returns the SUI address derived from the keypair.
func (s *Signer) Address() string {
	return s.address
}

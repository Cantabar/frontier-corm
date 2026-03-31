package chain

import (
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/btcsuite/btcd/btcutil/bech32"
	"github.com/pattonkan/sui-go/sui"
	"github.com/pattonkan/sui-go/suisigner"
	"github.com/pattonkan/sui-go/suisigner/suicrypto"
)

// Signer manages an Ed25519 keypair for signing SUI transactions.
type Signer struct {
	inner *suisigner.Signer
}

// NewSigner creates a signer from a private key. Accepts two formats:
//   - bech32 "suiprivkey1..." (as exported by `sui keytool export`)
//   - hex-encoded 32-byte Ed25519 seed (with or without 0x prefix)
func NewSigner(privateKey string) (*Signer, error) {
	pk := strings.TrimSpace(privateKey)

	var seed []byte
	if strings.HasPrefix(pk, "suiprivkey") {
		// Bech32-encoded SUI private key: 1 byte flag + 32 bytes seed.
		hrp, data, err := bech32.DecodeToBase256(pk)
		if err != nil {
			return nil, fmt.Errorf("decode bech32 private key: %w", err)
		}
		if hrp != "suiprivkey" {
			return nil, fmt.Errorf("unexpected bech32 HRP %q (expected suiprivkey)", hrp)
		}
		if len(data) < 33 {
			return nil, fmt.Errorf("bech32 private key data too short: %d bytes (need 33)", len(data))
		}
		// data[0] is the key scheme flag (0x00 = Ed25519); data[1:33] is the seed.
		seed = data[1:33]
	} else {
		// Hex-encoded seed.
		pk = strings.TrimPrefix(pk, "0x")
		var err error
		seed, err = hex.DecodeString(pk)
		if err != nil {
			return nil, fmt.Errorf("decode hex private key: %w", err)
		}
		if len(seed) < 32 {
			return nil, fmt.Errorf("private key seed too short: %d bytes (need 32)", len(seed))
		}
		seed = seed[:32]
	}

	s := suisigner.NewSigner(seed, suicrypto.KeySchemeFlagEd25519)
	return &Signer{inner: s}, nil
}

// Address returns the SUI address derived from the keypair.
func (s *Signer) Address() *sui.Address {
	return s.inner.Address
}

// AddressString returns the SUI address as a hex string.
func (s *Signer) AddressString() string {
	return s.inner.Address.String()
}

// Inner returns the underlying suisigner.Signer for direct use with
// suiclient.SignAndExecuteTransaction.
func (s *Signer) Inner() *suisigner.Signer {
	return s.inner
}

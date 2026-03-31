// Command set-phase updates a corm's phase in both the database and on-chain.
//
// Usage:
//
//	go run ./cmd/set-phase -node=0x... -phase=2 [-env=default]
//
// Required environment variables: DATABASE_URL (or DB_HOST/DB_PORT/DB_NAME/
// DB_USERNAME/DB_PASSWORD), SUI_RPC_URL, SUI_PRIVATE_KEY, CORM_STATE_PACKAGE_ID.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/frontier-corm/continuity-engine/internal/chain"
	"github.com/frontier-corm/continuity-engine/internal/config"
	"github.com/frontier-corm/continuity-engine/internal/db"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	nodeID := flag.String("node", "", "Network node ID (required)")
	phase := flag.Int("phase", -1, "Target phase 0-6 (required)")
	envName := flag.String("env", "", "Environment name (default: first from config)")
	flag.Parse()

	if *nodeID == "" || *phase < 0 || *phase > 6 {
		fmt.Fprintln(os.Stderr, "Usage: set-phase -node=0x... -phase=N [-env=ENV]")
		flag.PrintDefaults()
		os.Exit(1)
	}

	cfg := config.Load()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// --- Database ---
	database, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "database: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	// --- Resolve environment ---
	environment := cfg.Environments[0].Name
	if *envName != "" {
		environment = *envName
	}
	var envCfg *config.EnvironmentConfig
	for i := range cfg.Environments {
		if cfg.Environments[i].Name == environment {
			envCfg = &cfg.Environments[i]
			break
		}
	}
	if envCfg == nil {
		fmt.Fprintf(os.Stderr, "unknown environment %q\n", environment)
		os.Exit(1)
	}

	// --- Chain client ---
	chainClient := chain.NewClient(chain.ClientConfig{
		RpcURL:             envCfg.SUIRpcURL,
		PackageID:          envCfg.CormStatePackageID,
		CormConfigObjectID: envCfg.CormConfigObjectID,
	}, envCfg.SUIPrivateKey)

	// --- Resolve corm ---
	cormID, err := database.ResolveCormID(ctx, environment, *nodeID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve corm for node %s: %v\n", *nodeID, err)
		os.Exit(1)
	}
	if cormID == "" {
		fmt.Fprintf(os.Stderr, "no corm found for node %s in environment %q\n", *nodeID, environment)
		os.Exit(1)
	}
	fmt.Printf("Corm ID: %s\n", cormID)

	// --- Update DB ---
	if err := database.SetPhase(ctx, environment, cormID, *phase); err != nil {
		fmt.Fprintf(os.Stderr, "DB update failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("DB: phase set to %d ✓\n", *phase)

	// --- Update on-chain ---
	chainStateID, err := database.ResolveChainStateID(ctx, environment, cormID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve chain_state_id: %v\n", err)
		os.Exit(1)
	}
	if chainStateID == "" || !chain.IsValidChainStateID(chainStateID) {
		fmt.Fprintf(os.Stderr, "Chain: no valid chain_state_id (got %q) — on-chain update skipped\n", chainStateID)
		os.Exit(0)
	}

	// Read current traits for stability/corruption values
	traits, err := database.GetTraits(ctx, environment, cormID)
	if err != nil || traits == nil {
		fmt.Fprintf(os.Stderr, "get traits: %v\n", err)
		os.Exit(1)
	}

	if !chainClient.CanUpdateCormState() {
		fmt.Fprintln(os.Stderr, "Chain: cannot update (missing signer or package ID) — on-chain update skipped")
		os.Exit(0)
	}

	if err := chainClient.UpdateCormState(ctx, chainStateID, *phase, traits.Stability, traits.Corruption); err != nil {
		fmt.Fprintf(os.Stderr, "Chain update failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Chain: phase set to %d (object %s) ✓\n", *phase, chainStateID)
}

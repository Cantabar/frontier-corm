// Package config handles environment variable parsing and configuration defaults.
package config

import (
	"encoding/json"
	"log"
	"os"
	"strconv"
	"time"
)

// EnvironmentConfig holds per-environment settings.
type EnvironmentConfig struct {
	Name               string `json:"name"`
	PuzzleServiceURL   string `json:"puzzle_service_url"`
	SUIRpcURL          string `json:"sui_rpc_url"`
	SUIPrivateKeyEnv   string `json:"sui_private_key_env"`   // env var name holding the key
	CormStatePackageID string `json:"corm_state_package_id"`

	// Resolved at load time from the env var referenced by SUIPrivateKeyEnv.
	SUIPrivateKey string `json:"-"`
}

// Config holds all corm-brain configuration.
type Config struct {
	// LLM inference endpoints (shared across environments)
	LLMSuperURL string
	LLMFastURL  string

	// Embedding model (shared)
	EmbedModelPath string

	// WebSocket reconnect
	WSReconnectMax time.Duration

	// HTTP fallback polling
	FallbackPollInterval time.Duration

	// Event coalescing window (debounce). Events arriving within this window
	// are grouped by session and processed as a single LLM call.
	EventCoalesceWindow time.Duration

	// Maximum events to collect per coalesce window before forcing a flush.
	EventBatchMax int

	// Memory consolidation interval
	ConsolidationInterval time.Duration

	// Max episodic memories per corm
	MemoryCapPerCorm int

	// Database (shared)
	DatabaseURL string

	// Per-environment configs
	Environments []EnvironmentConfig
}

// Load reads configuration from environment variables with sensible defaults.
// If ENVIRONMENTS_CONFIG is set (path to JSON file), per-environment configs
// are loaded from it. Otherwise, a single "default" environment is created
// from the legacy env vars.
func Load() Config {
	cfg := Config{
		LLMSuperURL:           envOrDefault("LLM_SUPER_URL", "http://localhost:8000"),
		LLMFastURL:            envOrDefault("LLM_FAST_URL", "http://localhost:8001"),
		EmbedModelPath:        envOrDefault("EMBED_MODEL_PATH", "./models/nomic-embed"),
		WSReconnectMax:        envDurationMs("WS_RECONNECT_MAX_MS", 30000),
		FallbackPollInterval:  envDurationMs("FALLBACK_POLL_INTERVAL_MS", 2000),
		EventCoalesceWindow:   envDurationMs("EVENT_COALESCE_MS", 300),
		EventBatchMax:         envInt("EVENT_BATCH_MAX", 20),
		ConsolidationInterval: envDurationMs("CONSOLIDATION_INTERVAL_MS", 60000),
		MemoryCapPerCorm:      envInt("MEMORY_CAP_PER_CORM", 500),
		DatabaseURL:           envOrDefault("DATABASE_URL", "postgresql://corm:corm@localhost:5432/frontier_corm"),
	}

	if path := os.Getenv("ENVIRONMENTS_CONFIG"); path != "" {
		cfg.Environments = loadEnvironments(path)
	} else {
		// Backward-compatible single-environment fallback
		cfg.Environments = []EnvironmentConfig{{
			Name:               "default",
			PuzzleServiceURL:   envOrDefault("PUZZLE_SERVICE_URL", "http://localhost:3300"),
			SUIRpcURL:          envOrDefault("SUI_RPC_URL", "http://127.0.0.1:9000"),
			SUIPrivateKey:      os.Getenv("SUI_PRIVATE_KEY"),
			CormStatePackageID: os.Getenv("CORM_STATE_PACKAGE_ID"),
		}}
	}

	log.Printf("loaded %d environment(s): %s", len(cfg.Environments), envNames(cfg.Environments))
	return cfg
}

// loadEnvironments reads per-environment configs from a JSON file and resolves
// secret env var references.
func loadEnvironments(path string) []EnvironmentConfig {
	data, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("read environments config %s: %v", path, err)
	}

	var envs []EnvironmentConfig
	if err := json.Unmarshal(data, &envs); err != nil {
		log.Fatalf("parse environments config: %v", err)
	}

	for i := range envs {
		if envs[i].Name == "" {
			log.Fatalf("environment at index %d has no name", i)
		}
		// Resolve the SUI private key from the referenced env var
		if envs[i].SUIPrivateKeyEnv != "" {
			envs[i].SUIPrivateKey = os.Getenv(envs[i].SUIPrivateKeyEnv)
		}
	}

	if len(envs) == 0 {
		log.Fatal("environments config is empty")
	}

	return envs
}

func envNames(envs []EnvironmentConfig) string {
	names := make([]string, len(envs))
	for i, e := range envs {
		names[i] = e.Name
	}
	return joinStrings(names, ", ")
}

func joinStrings(ss []string, sep string) string {
	if len(ss) == 0 {
		return ""
	}
	result := ss[0]
	for _, s := range ss[1:] {
		result += sep + s
	}
	return result
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envDurationMs(key string, defaultMs int) time.Duration {
	return time.Duration(envInt(key, defaultMs)) * time.Millisecond
}

func envInt(key string, defaultVal int) int {
	s := os.Getenv(key)
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return defaultVal
	}
	return v
}

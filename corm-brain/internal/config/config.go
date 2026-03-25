// Package config handles environment variable parsing and configuration defaults.
package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds all corm-brain configuration.
type Config struct {
	// LLM inference endpoints
	LLMSuperURL string
	LLMFastURL  string

	// Embedding model
	EmbedModelPath string

	// Puzzle service (WebSocket target)
	PuzzleServiceURL string

	// WebSocket reconnect
	WSReconnectMax time.Duration

	// HTTP fallback polling
	FallbackPollInterval time.Duration

	// Event coalescing window
	EventCoalesceWindow time.Duration

	// Memory consolidation interval
	ConsolidationInterval time.Duration

	// Max episodic memories per corm
	MemoryCapPerCorm int

	// Database
	DatabaseURL string

	// SUI chain
	SUIRpcURL           string
	SUIPrivateKey       string
	CormStatePackageID  string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() Config {
	return Config{
		LLMSuperURL:           envOrDefault("LLM_SUPER_URL", "http://localhost:8000"),
		LLMFastURL:            envOrDefault("LLM_FAST_URL", "http://localhost:8001"),
		EmbedModelPath:        envOrDefault("EMBED_MODEL_PATH", "./models/nomic-embed"),
		PuzzleServiceURL:      envOrDefault("PUZZLE_SERVICE_URL", "http://localhost:3300"),
		WSReconnectMax:        envDurationMs("WS_RECONNECT_MAX_MS", 30000),
		FallbackPollInterval:  envDurationMs("FALLBACK_POLL_INTERVAL_MS", 2000),
		EventCoalesceWindow:   envDurationMs("EVENT_COALESCE_MS", 50),
		ConsolidationInterval: envDurationMs("CONSOLIDATION_INTERVAL_MS", 60000),
		MemoryCapPerCorm:      envInt("MEMORY_CAP_PER_CORM", 500),
		DatabaseURL:           envOrDefault("DATABASE_URL", "postgresql://corm:corm@localhost:5432/frontier_corm"),
		SUIRpcURL:             envOrDefault("SUI_RPC_URL", "http://127.0.0.1:9000"),
		SUIPrivateKey:         os.Getenv("SUI_PRIVATE_KEY"),
		CormStatePackageID:    os.Getenv("CORM_STATE_PACKAGE_ID"),
	}
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

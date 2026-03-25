// Package embed provides in-process text embedding via nomic-embed-text ONNX model.
//
// In production, this uses onnxruntime-go to run the nomic-embed-text model on CPU.
// For now, the interface is defined and a stub implementation is provided that returns
// zero vectors. The real implementation will be added once onnxruntime-go is integrated.
package embed

import (
	"context"
	"log"
)

// EmbeddingDimension is the output dimension of nomic-embed-text-v1.5.
const EmbeddingDimension = 384

// Embedder generates text embeddings.
type Embedder interface {
	Embed(ctx context.Context, text string) ([]float32, error)
	EmbedBatch(ctx context.Context, texts []string) ([][]float32, error)
	Close() error
}

// StubEmbedder returns zero vectors. Replace with ONNXEmbedder for production.
type StubEmbedder struct{}

// NewStubEmbedder creates a stub embedder for development/testing.
func NewStubEmbedder() *StubEmbedder {
	log.Println("WARNING: using stub embedder — episodic memory search will not work")
	return &StubEmbedder{}
}

func (s *StubEmbedder) Embed(_ context.Context, _ string) ([]float32, error) {
	return make([]float32, EmbeddingDimension), nil
}

func (s *StubEmbedder) EmbedBatch(_ context.Context, texts []string) ([][]float32, error) {
	result := make([][]float32, len(texts))
	for i := range texts {
		result[i] = make([]float32, EmbeddingDimension)
	}
	return result, nil
}

func (s *StubEmbedder) Close() error { return nil }

// NewEmbedder creates the appropriate embedder based on model path availability.
// For now, always returns StubEmbedder. Will return ONNXEmbedder when onnxruntime-go
// is integrated and the model files are present at modelPath.
func NewEmbedder(modelPath string) Embedder {
	// TODO: Check if modelPath exists and contains ONNX model files.
	// If so, return ONNXEmbedder. For now, return stub.
	_ = modelPath
	return NewStubEmbedder()
}

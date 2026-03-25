package llm

import (
	"math/rand"
	"strings"
	"unicode/utf8"
)

// garbleChars are substitution characters used when corruption is high.
var garbleChars = []rune{'░', '▓', '█', '╳', '?', '#', '@', '%', '&', '!', '~'}

// PostProcessToken applies corruption garbling to a single token delta.
// corruption is 0-100. At corruption=0, text passes through unchanged.
// At corruption=100, most characters are replaced with noise.
func PostProcessToken(token string, corruption float64) string {
	if corruption < 10 {
		return token
	}

	// Probability of garbling any character: corruption/200 (max 50% at corruption=100)
	prob := corruption / 200.0
	var b strings.Builder
	b.Grow(len(token))

	for _, r := range token {
		if r == ' ' || r == '\n' {
			b.WriteRune(r)
			continue
		}
		if rand.Float64() < prob {
			b.WriteRune(garbleChars[rand.Intn(len(garbleChars))])
		} else {
			b.WriteRune(r)
		}
	}

	return b.String()
}

// TruncateResponse enforces a maximum character length on the full response.
func TruncateResponse(text string, maxChars int) string {
	if utf8.RuneCountInString(text) <= maxChars {
		return text
	}
	runes := []rune(text)
	return string(runes[:maxChars]) + "..."
}

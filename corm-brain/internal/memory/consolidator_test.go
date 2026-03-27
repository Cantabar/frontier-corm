package memory

import "testing"

func TestExtractJSON(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "clean array",
			input: `[{"text":"obs","type":"observation","importance":0.5}]`,
			want:  `[{"text":"obs","type":"observation","importance":0.5}]`,
		},
		{
			name:  "empty array",
			input: `[]`,
			want:  `[]`,
		},
		{
			name:  "markdown json fence",
			input: "```json\n[{\"text\":\"obs\",\"type\":\"observation\",\"importance\":0.5}]\n```",
			want:  `[{"text":"obs","type":"observation","importance":0.5}]`,
		},
		{
			name:  "markdown fence no language",
			input: "```\n[]\n```",
			want:  `[]`,
		},
		{
			name:  "preamble text before array",
			input: "Here are the observations:\n[{\"text\":\"obs\",\"type\":\"pattern\",\"importance\":0.7}]",
			want:  `[{"text":"obs","type":"pattern","importance":0.7}]`,
		},
		{
			name:  "trailing text after array",
			input: "[{\"text\":\"obs\",\"type\":\"observation\",\"importance\":0.5}]\nLet me know if you need more.",
			want:  `[{"text":"obs","type":"observation","importance":0.5}]`,
		},
		{
			name:  "whitespace padded",
			input: "  \n  []  \n  ",
			want:  `[]`,
		},
		{
			name:  "fence with preamble and trailing",
			input: "Sure, here you go:\n```json\n[{\"text\":\"a\",\"type\":\"warning\",\"importance\":0.9}]\n```\nDone.",
			want:  `[{"text":"a","type":"warning","importance":0.9}]`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractJSON(tt.input)
			if got != tt.want {
				t.Errorf("extractJSON() = %q, want %q", got, tt.want)
			}
		})
	}
}

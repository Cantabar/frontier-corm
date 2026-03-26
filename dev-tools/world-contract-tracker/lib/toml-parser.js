/**
 * Minimal TOML parser — only handles the flat key/value structure used by
 * Sui's Published.toml:
 *
 *   [published.testnet_stillness]
 *   chain-id = "4c78adac"
 *   version = 1
 *   published-at = "0x..."
 *   ...
 *
 * Returns: { "testnet_stillness": { "chain-id": "4c78adac", version: 1, ... }, ... }
 */
export function parsePublishedToml(text) {
  const sections = {};
  let current = null;

  for (const raw of text.split("\n")) {
    const line = raw.trim();

    // Skip blanks and comments
    if (!line || line.startsWith("#")) continue;

    // Section header: [published.testnet_stillness]
    const sectionMatch = line.match(/^\[published\.(\w+)\]$/);
    if (sectionMatch) {
      current = sectionMatch[1];
      sections[current] = {};
      continue;
    }

    if (!current) continue;

    // Key = value
    const kvMatch = line.match(/^([\w-]+)\s*=\s*(.+)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1];
    let value = kvMatch[2].trim();

    // Strip surrounding quotes
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    // Numeric values (version)
    else if (/^\d+$/.test(value)) {
      value = Number(value);
    }
    // Inline table: { flavor = "sui", edition = "2024" } — keep as string
    // (we don't need to parse these)

    sections[current][key] = value;
  }

  return sections;
}

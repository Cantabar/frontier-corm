import {
  PUBLISHED_TOML_RAW_URL,
  GITHUB_API_BASE,
  PUBLISHED_TOML_PATH,
  WORLD_SOURCES_PATH,
} from "./config.js";

/** Optional GitHub token — set via the UI input to raise rate limit. */
let githubToken = "";
export function setGithubToken(token) {
  githubToken = token;
}

function headers() {
  const h = { Accept: "application/vnd.github+json" };
  if (githubToken) h.Authorization = `Bearer ${githubToken}`;
  return h;
}

/**
 * Fetch the raw Published.toml content from the default branch.
 * Uses raw.githubusercontent.com (no auth needed, not rate-limited).
 */
export async function fetchPublishedToml() {
  const res = await fetch(PUBLISHED_TOML_RAW_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to fetch Published.toml: ${res.status}`);
  return res.text();
}

/**
 * Fetch the most recent GitHub releases (max 10).
 * @returns {Promise<Array<{ tag: string, name: string, body: string, date: string, url: string }>>}
 */
export async function fetchReleases() {
  const res = await fetch(`${GITHUB_API_BASE}/releases?per_page=10`, {
    headers: headers(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((r) => ({
    tag: r.tag_name,
    name: r.name || r.tag_name,
    body: r.body || "",
    date: r.published_at?.slice(0, 10) ?? "",
    url: r.html_url,
  }));
}

/**
 * Fetch recent commits that touch Published.toml (deploy commits).
 * @param {number} perPage
 * @returns {Promise<Array<{ sha: string, message: string, date: string, url: string }>>}
 */
export async function fetchPublishedTomlCommits(perPage = 15) {
  const res = await fetch(
    `${GITHUB_API_BASE}/commits?path=${encodeURIComponent(PUBLISHED_TOML_PATH)}&per_page=${perPage}`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map(mapCommit);
}

/**
 * Fetch recent commits that touch contract source files.
 * @param {string} [since] ISO date — only commits after this date
 * @param {number} perPage
 */
export async function fetchSourceCommits(since, perPage = 30) {
  let url = `${GITHUB_API_BASE}/commits?path=${encodeURIComponent(WORLD_SOURCES_PATH)}&per_page=${perPage}`;
  if (since) url += `&since=${since}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map(mapCommit);
}

/**
 * Fetch commits on main after a given SHA (exclusive).
 * The GitHub commits API doesn't support "after SHA" directly, so we fetch
 * by date: look up the anchor commit's date, then fetch commits since.
 * @param {string} anchorSha
 */
export async function fetchCommitsSinceAnchor(anchorSha) {
  // 1. Get the anchor commit to find its date
  const res = await fetch(`${GITHUB_API_BASE}/commits/${anchorSha}`, {
    headers: headers(),
  });
  if (!res.ok) return [];
  const anchor = await res.json();
  const anchorDate = anchor.commit?.committer?.date;
  if (!anchorDate) return [];

  // 2. Fetch source commits since that date
  const commits = await fetchSourceCommits(anchorDate, 50);

  // 3. Exclude commits at or before the anchor (anchor itself + older)
  const anchorIdx = commits.findIndex((c) => c.sha === anchorSha);
  return anchorIdx >= 0 ? commits.slice(0, anchorIdx) : commits;
}

/**
 * Fetch raw file content at a specific git ref (commit SHA, branch, tag).
 * @param {string} path — file path within the repo
 * @param {string} ref — git ref (SHA, branch name, tag)
 * @returns {Promise<string | null>}
 */
export async function fetchFileAtRef(path, ref) {
  const url = `https://raw.githubusercontent.com/evefrontier/world-contracts/${ref}/${path}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.text();
}

/**
 * Fetch a comparison (diff) between two commits.
 * @param {string} base — SHA or tag
 * @param {string} head — SHA or tag
 * @returns {Promise<{ files: Array<{ filename: string, status: string, patch: string }>, totalChanges: number, url: string } | null>}
 */
export async function fetchCompare(base, head) {
  const res = await fetch(
    `${GITHUB_API_BASE}/compare/${base}...${head}`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return {
    files: (data.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? "",
    })),
    totalChanges: data.files?.length ?? 0,
    commits: (data.commits ?? []).length,
    url: data.html_url,
  };
}

function mapCommit(c) {
  return {
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    message: c.commit?.message?.split("\n")[0] ?? "",
    date: c.commit?.committer?.date?.slice(0, 10) ?? "",
    url: c.html_url,
  };
}

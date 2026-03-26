import { ENVIRONMENTS, SUISCAN_BASE } from "./lib/config.js";
import { parsePublishedToml } from "./lib/toml-parser.js";
import { readUpgradeCap } from "./lib/sui-rpc.js";
import {
  fetchPublishedToml,
  fetchReleases,
  fetchPublishedTomlCommits,
  fetchCommitsSinceAnchor,
  fetchCompare,
  setGithubToken,
} from "./lib/github.js";

// ── DOM refs ────────────────────────────────────────────────────────
const $loading = document.getElementById("loading");
const $error = document.getElementById("error");
const $envGrid = document.getElementById("environments");
const $releasesSection = document.getElementById("releases-section");
const $releases = document.getElementById("releases");
const $lastUpdated = document.getElementById("last-updated");
const $refreshBtn = document.getElementById("refresh-btn");

// ── Bootstrap ───────────────────────────────────────────────────────
$refreshBtn.addEventListener("click", () => refresh());
refresh();

// ── Main refresh loop ───────────────────────────────────────────────
async function refresh() {
  $loading.classList.remove("hidden");
  $error.classList.add("hidden");
  $envGrid.innerHTML = "";
  $releasesSection.classList.add("hidden");

  try {
    // 1. Fetch Published.toml + parse
    const tomlText = await fetchPublishedToml();
    const published = parsePublishedToml(tomlText);

    // 2. Read on-chain UpgradeCap for each environment (in parallel)
    const chainData = await Promise.all(
      ENVIRONMENTS.map(async (env) => {
        const pub = published[env.key];
        if (!pub?.["upgrade-capability"]) return null;
        try {
          return await readUpgradeCap(pub["upgrade-capability"]);
        } catch (err) {
          console.warn(`Failed to read UpgradeCap for ${env.key}:`, err);
          return null;
        }
      }),
    );

    // 3. Find the deploy-anchor commit (most recent commit touching Published.toml)
    const tomlCommits = await fetchPublishedTomlCommits(5);
    const deployAnchorSha = tomlCommits[0]?.sha;

    // 4. Get pending source commits since that anchor
    let pendingCommits = [];
    if (deployAnchorSha) {
      try {
        pendingCommits = await fetchCommitsSinceAnchor(deployAnchorSha);
      } catch {
        /* non-critical */
      }
    }

    // 5. Fetch diffs between consecutive deploy commits (most recent first)
    const deployDiffs = [];
    for (let i = 0; i < tomlCommits.length - 1 && i < 3; i++) {
      try {
        const diff = await fetchCompare(tomlCommits[i + 1].sha, tomlCommits[i].sha);
        if (diff) {
          deployDiffs.push({
            from: tomlCommits[i + 1],
            to: tomlCommits[i],
            diff,
          });
        }
      } catch {
        /* non-critical */
      }
    }

    // 6. Fetch releases
    let releases = [];
    try {
      releases = await fetchReleases();
    } catch {
      /* non-critical */
    }

    // 7. Render everything
    ENVIRONMENTS.forEach((env, i) => {
      const pub = published[env.key];
      const chain = chainData[i];
      $envGrid.appendChild(renderEnvCard(env, pub, chain, tomlCommits, pendingCommits, deployDiffs));
    });

    renderReleases(releases);
    $lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    $error.textContent = err.message;
    $error.classList.remove("hidden");
    console.error(err);
  } finally {
    $loading.classList.add("hidden");
  }
}

// ── Field descriptions (shown as tooltips) ─────────────────────────
const FIELD_TIPS = {
  "Repo version":
    "The package version recorded in Published.toml on the main branch. " +
    "Increments by 1 each time a \"sui client upgrade\" is performed and committed.",
  "On-chain version":
    "The live version stored in the UpgradeCap object on SUI testnet. " +
    "Set by the chain itself when an upgrade transaction is executed. " +
    "If this differs from repo version, either an upgrade is pending or Published.toml is stale.",
  Toolchain:
    "The sui CLI version (e.g. 1.68.0) used to compile and publish/upgrade the package. " +
    "Mismatches between environments may indicate staggered rollouts.",
};

// ── Render: environment card ────────────────────────────────────────
function renderEnvCard(env, pub, chain, tomlCommits, pendingCommits, deployDiffs) {
  const card = el("div", "env-card");

  // Status
  const repoVersion = pub?.version ?? "?";
  const chainVersion = chain?.version ?? "?";
  const status = getStatus(repoVersion, chainVersion);

  // Header
  const header = el("div", "env-card-header");
  header.appendChild(elText("h2", env.label));
  header.appendChild(badge(status));
  card.appendChild(header);

  // Key-value grid
  const kv = el("div", "kv-table");
  addKV(kv, "Repo version", String(repoVersion), FIELD_TIPS["Repo version"]);
  addKV(kv, "On-chain version", String(chainVersion), FIELD_TIPS["On-chain version"]);
  addKV(kv, "Original ID", pub?.["original-id"] ?? "—");
  addKV(kv, "Published at", pub?.["published-at"] ?? "—");

  if (pub?.["upgrade-capability"]) {
    const capLink = document.createElement("a");
    capLink.href = `${SUISCAN_BASE}/object/${pub["upgrade-capability"]}`;
    capLink.target = "_blank";
    capLink.textContent = pub["upgrade-capability"];
    capLink.className = "kv-value";

    const capLabel = elText("span", "UpgradeCap");
    capLabel.className = "kv-label";
    kv.appendChild(capLabel);
    kv.appendChild(capLink);
  }

  if (chain) {
    addKV(kv, "Chain package", chain.package);
    const policyLabels = { 0: "compatible", 128: "additive", 192: "dep-only", 255: "immutable" };
    addKV(kv, "Upgrade policy", policyLabels[chain.policy] ?? String(chain.policy));
  }

  addKV(kv, "Toolchain", pub?.["toolchain-version"] ?? "—", FIELD_TIPS["Toolchain"]);
  card.appendChild(kv);

  // Deploy diffs
  if (deployDiffs.length > 0) {
    for (const { from, to, diff } of deployDiffs) {
      card.appendChild(renderDeployDiff(from, to, diff));
    }
  }

  // Deploy commits (most recent Published.toml touches)
  if (tomlCommits.length > 0) {
    card.appendChild(commitDetails("Recent deploy commits", tomlCommits));
  }

  // Pending source changes (commits after last deploy)
  if (pendingCommits.length > 0) {
    card.appendChild(commitDetails(
      `${pendingCommits.length} source commit${pendingCommits.length === 1 ? "" : "s"} since last deploy`,
      pendingCommits,
    ));
  }

  return card;
}

// ── Render: releases ────────────────────────────────────────────────
function renderReleases(releases) {
  if (releases.length === 0) return;
  $releasesSection.classList.remove("hidden");
  $releases.innerHTML = "";
  for (const r of releases) {
    const item = el("div", "release-item");
    const h3 = document.createElement("h3");
    const link = document.createElement("a");
    link.href = r.url;
    link.target = "_blank";
    link.textContent = `${r.name}`;
    h3.appendChild(link);
    item.appendChild(h3);
    item.appendChild(elText("div", r.date, "release-date"));
    if (r.body) {
      const body = el("div", "release-body");
      body.innerHTML = markdownToHtml(r.body);
      item.appendChild(body);
    }
    $releases.appendChild(item);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function getStatus(repoVersion, chainVersion) {
  if (repoVersion === "?" || chainVersion === "?") return "unknown";
  if (repoVersion === chainVersion) return "in-sync";
  if (repoVersion > chainVersion) return "repo-ahead";
  return "chain-ahead";
}

function badge(status) {
  const labels = {
    "in-sync": "In Sync",
    "repo-ahead": "Upgrade Pending",
    "chain-ahead": "Published.toml Stale",
    unknown: "Unknown",
  };
  const span = document.createElement("span");
  span.className = `badge badge-${status}`;
  span.textContent = labels[status];
  return span;
}

function commitDetails(summary, commits) {
  const details = document.createElement("details");
  details.appendChild(elText("summary", summary));
  const ul = el("ul", "commit-list");
  for (const c of commits) {
    const li = document.createElement("li");
    const shaLink = document.createElement("a");
    shaLink.href = c.url;
    shaLink.target = "_blank";
    shaLink.textContent = c.shortSha;
    shaLink.className = "commit-sha";
    li.appendChild(elText("span", c.date, "commit-date"));
    li.appendChild(shaLink);
    li.appendChild(elText("span", c.message));
    ul.appendChild(li);
  }
  details.appendChild(ul);
  return details;
}

// ── Render: deploy diff ─────────────────────────────────────────────
function renderDeployDiff(from, to, diff) {
  const sourceFiles = diff.files.filter((f) =>
    f.filename.startsWith("contracts/world/sources/"),
  );
  if (sourceFiles.length === 0 && diff.files.length === 0) return el("div");

  const label = sourceFiles.length > 0
    ? `Diff: ${from.shortSha} → ${to.shortSha} (${diff.commits} commits, ${sourceFiles.length} source files)`
    : `Diff: ${from.shortSha} → ${to.shortSha} (${diff.commits} commits, ${diff.totalChanges} files)`;

  const details = document.createElement("details");
  details.className = "diff-section";
  const summary = elText("summary", label);
  details.appendChild(summary);

  // Link to full diff on GitHub
  const ghLink = document.createElement("a");
  ghLink.href = diff.url;
  ghLink.target = "_blank";
  ghLink.textContent = "View full diff on GitHub ↗";
  ghLink.className = "diff-gh-link";
  details.appendChild(ghLink);

  // Render each file's patch
  const filesToShow = sourceFiles.length > 0 ? sourceFiles : diff.files;
  for (const file of filesToShow) {
    const fileBlock = el("div", "diff-file");

    const fileHeader = el("div", "diff-file-header");
    const statusBadge = elText("span", file.status, `diff-status diff-status-${file.status}`);
    const fileName = elText("span", file.filename, "diff-filename");
    const stats = elText("span", `+${file.additions} -${file.deletions}`, "diff-stats");
    fileHeader.appendChild(statusBadge);
    fileHeader.appendChild(fileName);
    fileHeader.appendChild(stats);
    fileBlock.appendChild(fileHeader);

    if (file.patch) {
      const pre = document.createElement("pre");
      pre.className = "diff-patch";
      const code = document.createElement("code");
      code.textContent = file.patch;
      pre.appendChild(code);
      fileBlock.appendChild(pre);
    }

    details.appendChild(fileBlock);
  }

  return details;
}

/** Minimal markdown → HTML (handles **bold**, `code`, - lists, [links](url)) */
function markdownToHtml(md) {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n/g, "<br>");
}

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function elText(tag, text, className) {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
}

function addKV(parent, label, value, tooltip) {
  const labelEl = elText("span", label, "kv-label");
  if (tooltip) {
    labelEl.title = tooltip;
    labelEl.classList.add("has-tip");
  }
  parent.appendChild(labelEl);
  parent.appendChild(elText("span", value, "kv-value"));
}

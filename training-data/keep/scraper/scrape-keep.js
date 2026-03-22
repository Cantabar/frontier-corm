#!/usr/bin/env node

/**
 * scrape-keep.js
 *
 * Uses Playwright to scrape lore entries from Eve Frontier's "The Keep".
 * The site is a JS SPA so a headless browser is required to render content.
 *
 * Usage:
 *   npm install
 *   npx playwright install chromium
 *   npm run scrape
 *
 * Output: ../raw/<slug>.md for each entry in keep-urls.json
 */

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(__dirname, "..", "raw");
const MANIFEST_PATH = resolve(__dirname, "keep-urls.json");

// Delay between page loads (ms) to be respectful to the server
const REQUEST_DELAY_MS = 2000;

// Max time to wait for content to render (ms)
const CONTENT_TIMEOUT_MS = 15000;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Attempts to extract the main article/lore content from a Keep entry page.
 * Tries several common selectors since the exact DOM structure may vary.
 */
async function extractContent(page) {
  // Wait for the page to finish loading JS-rendered content.
  // Try to find an article or main content container.
  const selectors = [
    "article",
    '[class*="content"]',
    '[class*="article"]',
    '[class*="story"]',
    '[class*="keep"]',
    "main",
  ];

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, {
        timeout: CONTENT_TIMEOUT_MS,
      });
      if (el) {
        const text = await el.evaluate((node) => {
          // Walk the DOM and convert to rough markdown
          function walk(el) {
            let result = "";
            for (const child of el.childNodes) {
              if (child.nodeType === Node.TEXT_NODE) {
                result += child.textContent;
              } else if (child.nodeType === Node.ELEMENT_NODE) {
                const tag = child.tagName.toLowerCase();
                if (tag === "br") {
                  result += "\n";
                } else if (tag.match(/^h[1-6]$/)) {
                  const level = parseInt(tag[1]);
                  result +=
                    "\n" + "#".repeat(level) + " " + child.textContent + "\n\n";
                } else if (tag === "p") {
                  result += walk(child) + "\n\n";
                } else if (tag === "li") {
                  result += "- " + walk(child) + "\n";
                } else if (tag === "ul" || tag === "ol") {
                  result += "\n" + walk(child) + "\n";
                } else if (tag === "blockquote") {
                  result +=
                    walk(child)
                      .split("\n")
                      .map((l) => "> " + l)
                      .join("\n") + "\n\n";
                } else if (tag === "em" || tag === "i") {
                  result += "*" + walk(child) + "*";
                } else if (tag === "strong" || tag === "b") {
                  result += "**" + walk(child) + "**";
                } else {
                  result += walk(child);
                }
              }
            }
            return result;
          }
          return walk(el);
        });

        const trimmed = text.trim();
        if (trimmed.length > 50) {
          return trimmed;
        }
      }
    } catch {
      // Selector not found, try next
    }
  }

  // Fallback: grab all visible text from body
  const bodyText = await page.evaluate(() => document.body.innerText);
  return bodyText.trim();
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const { baseUrl, entries } = manifest;

  mkdirSync(RAW_DIR, { recursive: true });

  console.log(`Launching browser...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  let successCount = 0;
  let failCount = 0;

  for (const entry of entries) {
    const url = `${baseUrl}/${entry.slug}`;
    const outPath = resolve(RAW_DIR, `${entry.slug}.md`);
    console.log(`\nScraping: ${entry.slug} (${entry.category})`);
    console.log(`  URL: ${url}`);

    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

      // Give extra time for JS rendering
      await sleep(2000);

      const content = await extractContent(page);

      // Build the markdown file with frontmatter
      const md = [
        "---",
        `title: "${entry.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}"`,
        `slug: "${entry.slug}"`,
        `category: "${entry.category}"`,
        `source: "${url}"`,
        `scraped_at: "${new Date().toISOString()}"`,
        "---",
        "",
        content,
        "",
      ].join("\n");

      writeFileSync(outPath, md, "utf-8");
      console.log(
        `  ✓ Saved ${outPath} (${content.length} chars)`
      );
      successCount++;

      await page.close();
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
      failCount++;
    }

    // Rate-limit
    await sleep(REQUEST_DELAY_MS);
  }

  await browser.close();
  console.log(
    `\nDone. ${successCount} succeeded, ${failCount} failed out of ${entries.length} entries.`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

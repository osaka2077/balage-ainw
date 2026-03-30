/**
 * Provider Auto-Detection Demo
 *
 * Shows how BALAGE automatically selects the right fetcher:
 *  - Firecrawl Cloud when BALAGE_FIRECRAWL_API_KEY is set + enabled
 *  - Playwright (local headless browser) as fallback
 *
 * This example works with or without a Firecrawl key. Without one,
 * it gracefully falls back to Playwright.
 *
 * Run (Playwright fallback):
 *   npx tsx examples/firecrawl-integration/with-playwright-fallback.ts
 *
 * Run (with Firecrawl):
 *   BALAGE_FIRECRAWL_API_KEY=fc-... BALAGE_FIRECRAWL_ENABLED=true \
 *     npx tsx examples/firecrawl-integration/with-playwright-fallback.ts
 *
 * Run (force specific provider):
 *   npx tsx examples/firecrawl-integration/with-playwright-fallback.ts --provider=playwright
 */

import { analyzeFromURL } from "../../src/core/index.js";
import type { AnalyzeFromURLOptions } from "../../src/core/index.js";

const TARGET_URL = "https://github.com/login";

// Parse --provider flag from command line
function parseProvider(): AnalyzeFromURLOptions["fetcherProvider"] {
  const providerArg = process.argv.find((arg) => arg.startsWith("--provider="));
  if (!providerArg) return "auto";

  const value = providerArg.split("=")[1];
  if (value === "firecrawl" || value === "playwright") return value;
  return "auto";
}

async function main(): Promise<void> {
  const provider = parseProvider();

  console.log("\n=== BALAGE Provider Auto-Detection Demo ===\n");
  console.log(`Target URL:   ${TARGET_URL}`);
  console.log(`Provider:     ${provider}`);

  // Show which env vars are configured
  const hasFirecrawlKey = !!process.env["BALAGE_FIRECRAWL_API_KEY"];
  const firecrawlEnabled = process.env["BALAGE_FIRECRAWL_ENABLED"] === "true";

  console.log(`\nEnvironment:`);
  console.log(`  BALAGE_FIRECRAWL_API_KEY:  ${hasFirecrawlKey ? "set" : "not set"}`);
  console.log(`  BALAGE_FIRECRAWL_ENABLED:  ${firecrawlEnabled ? "true" : "false (or not set)"}`);

  if (provider === "auto") {
    if (hasFirecrawlKey && firecrawlEnabled) {
      console.log(`\n  -> Auto-detection will use: Firecrawl Cloud`);
    } else {
      console.log(`\n  -> Auto-detection will use: Playwright (local)`);
    }
  }

  console.log(`\nFetching and analyzing...\n`);

  try {
    const result = await analyzeFromURL(TARGET_URL, {
      llm: false,
      fetcherProvider: provider,
      minConfidence: 0.5,
    });

    console.log("=== Result ===\n");
    console.log(`Fetcher used:  ${result.meta.fetcherType ?? "unknown"}`);
    console.log(`Fetch time:    ${result.meta.fetchTimingMs ?? 0}ms`);
    console.log(`Total time:    ${result.timing.totalMs}ms`);
    console.log(`Endpoints:     ${result.endpoints.length}`);

    if (result.endpoints.length > 0) {
      console.log("\nTop 5 endpoints:\n");
      for (const ep of result.endpoints.slice(0, 5)) {
        console.log(`  [${ep.type}] ${ep.label} — ${ep.selector ?? "(none)"} (${(ep.confidence * 100).toFixed(0)}%)`);
      }
    }

    console.log("\nDone.\n");
  } catch (err: unknown) {
    // Demonstrate graceful error handling
    if (err instanceof Error) {
      const errorCode = "code" in err ? (err as { code: string }).code : "UNKNOWN";

      switch (errorCode) {
        case "FETCH_CONFIG_ERROR":
          console.error(`Configuration error: ${err.message}`);
          console.error(`\nHint: If using Firecrawl, set BALAGE_FIRECRAWL_API_KEY and BALAGE_FIRECRAWL_ENABLED=true.`);
          console.error(`      If using Playwright, ensure 'playwright' is installed: npx playwright install chromium\n`);
          break;

        case "FETCH_TIMEOUT_ERROR":
          console.error(`Timeout: The page took too long to load. Try increasing the timeout.`);
          break;

        case "FETCH_RATE_LIMIT_ERROR":
          console.error(`Rate limited: Too many requests. Wait a moment and try again.`);
          break;

        case "BALAGE_INPUT_ERROR":
          console.error(`Invalid input: ${err.message}`);
          break;

        default:
          console.error(`Error (${errorCode}): ${err.message}`);
      }
    } else {
      console.error("Unexpected error:", err);
    }

    process.exit(1);
  }
}

main();

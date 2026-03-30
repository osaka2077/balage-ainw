/**
 * Basic Usage — analyzeFromURL
 *
 * Demonstrates the simplest way to analyze a web page by URL.
 * Works without any API keys in heuristic mode (llm: false).
 *
 * Run:
 *   npx tsx examples/firecrawl-integration/basic-usage.ts
 *
 * With a Firecrawl key:
 *   BALAGE_FIRECRAWL_API_KEY=fc-... BALAGE_FIRECRAWL_ENABLED=true \
 *     npx tsx examples/firecrawl-integration/basic-usage.ts
 */

import { analyzeFromURL } from "../../src/core/index.js";

const TARGET_URL = process.argv[2] ?? "https://github.com/login";

async function main(): Promise<void> {
  console.log(`\nAnalyzing: ${TARGET_URL}\n`);
  console.log("Provider: auto-detect (Firecrawl if configured, Playwright otherwise)\n");

  const startTime = performance.now();

  // --- Analyze the page ---
  // In heuristic mode (llm: false), no LLM API key is needed.
  // The fetcher provider is chosen automatically based on available config.
  const result = await analyzeFromURL(TARGET_URL, {
    llm: false,
    minConfidence: 0.5,
    maxEndpoints: 15,
  });

  const totalTime = Math.round(performance.now() - startTime);

  // --- Print results ---
  console.log("=== Analysis Result ===\n");
  console.log(`URL:            ${result.meta.url ?? TARGET_URL}`);
  console.log(`Mode:           ${result.meta.mode}`);
  console.log(`Fetcher:        ${result.meta.fetcherType ?? "unknown"}`);
  console.log(`Fetch time:     ${result.meta.fetchTimingMs ?? 0}ms`);
  console.log(`Analysis time:  ${result.timing.totalMs}ms`);
  console.log(`Total time:     ${totalTime}ms`);
  console.log(`Endpoints:      ${result.endpoints.length}`);

  if (result.framework) {
    console.log(`Framework:      ${result.framework.framework} (${(result.framework.confidence * 100).toFixed(0)}%)`);
  }

  console.log("\n--- Detected Endpoints ---\n");

  for (const ep of result.endpoints) {
    console.log(`  [${ep.type}] ${ep.label}`);
    console.log(`    Selector:    ${ep.selector ?? "(none)"}`);
    console.log(`    Confidence:  ${(ep.confidence * 100).toFixed(0)}%`);
    console.log(`    Affordances: ${ep.affordances.join(", ")}`);
    console.log();
  }

  // --- Example: filter by type ---
  const authEndpoints = result.endpoints.filter((ep) => ep.type === "auth");
  if (authEndpoints.length > 0) {
    console.log(`Found ${authEndpoints.length} auth endpoint(s) — ready for login automation.\n`);
  }

  const formEndpoints = result.endpoints.filter((ep) => ep.type === "form");
  if (formEndpoints.length > 0) {
    console.log(`Found ${formEndpoints.length} form endpoint(s) — ready for data entry.\n`);
  }
}

main().catch((err: unknown) => {
  console.error("\nAnalysis failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

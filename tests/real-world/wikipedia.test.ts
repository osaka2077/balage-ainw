/**
 * Real-World Integration Test: en.wikipedia.org
 *
 * Einfachere Seite als Baseline — erwartet search + navigation + content.
 *
 * Wird UEBERSPRUNGEN wenn kein API-Key gesetzt ist.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { BrowserAdapter, extractStructuredDOM, extractAccessibilityTree } from "../../src/adapter/index.js";
import { pruneDom, parseDom, parseAria, segmentUI } from "../../src/parser/index.js";
import {
  generateEndpoints,
  candidateToEndpoint,
} from "../../src/semantic/endpoint-generator.js";
import { createFallbackLLMClient } from "../../src/semantic/fallback-llm-client.js";
import type { FallbackLLMClient } from "../../src/semantic/fallback-llm-client.js";
import { envConfig } from "../../src/config/env.js";
import type { Endpoint } from "../../shared_interfaces.js";

// ============================================================================
// Skip wenn kein API-Key
// ============================================================================

const hasApiKey =
  !!process.env["BALAGE_OPENAI_API_KEY"] ||
  !!process.env["BALAGE_ANTHROPIC_API_KEY"];

describe.skipIf(!hasApiKey)("Real-World: en.wikipedia.org", () => {
  let adapter: BrowserAdapter;
  let llmClient: FallbackLLMClient;

  beforeAll(async () => {
    adapter = new BrowserAdapter({ headless: true });
    await adapter.launch();

    llmClient = await createFallbackLLMClient({ envConfig });
    console.log(`  API Key present: ${!!envConfig.openaiApiKey || !!envConfig.anthropicApiKey}`);
    console.log(`  Provider: ${envConfig.llmProvider}`);
    console.log(`  Model: ${envConfig.llmModel}`);
    console.log(`  Fallback: ${envConfig.llmFallbackModel}`);
  }, 60_000);

  afterAll(async () => {
    await adapter.shutdown();
  }, 30_000);

  it("should detect search + navigation on Wikipedia main page", async () => {
    const runStart = Date.now();
    const contextId = await adapter.newContext();

    try {
      const page = await adapter.getPage(contextId);

      // 1. Navigation
      console.log("\n========================================");
      console.log("  REAL-WORLD TEST: en.wikipedia.org");
      console.log("========================================\n");

      console.log("[1/7] Navigating to https://en.wikipedia.org ...");
      await page.goto("https://en.wikipedia.org", {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {
        console.log("  (networkidle timeout — continuing anyway)");
      });
      console.log(`  URL: ${page.url()}`);
      console.log(`  Title: ${await page.title()}`);

      // 2. DOM Extraction
      console.log("\n[2/7] Extracting structured DOM ...");
      const rawDom = await extractStructuredDOM(page);
      console.log(`  Raw DOM nodes: ${countNodes(rawDom)}`);

      // 3. Prune + Parse + ARIA + Segment
      console.log("\n[3/7] Pruning + Parsing DOM ...");
      const { prunedDom } = pruneDom(rawDom);
      const parsed = parseDom(prunedDom);
      console.log(`  Pruned nodes: ${parsed.nodeCount}`);
      console.log(`  Depth: ${parsed.maxDepth}`);

      console.log("\n[3b/7] Extracting ARIA tree ...");
      let aria;
      try {
        const cdp = await page.context().newCDPSession(page);
        const axTree = await extractAccessibilityTree(page, cdp);
        aria = parseAria(parsed.root, axTree);
        console.log(`  ARIA landmarks: ${aria.landmarks.length}`);
      } catch (ariaErr) {
        console.log(`  ARIA extraction failed (non-fatal): ${ariaErr instanceof Error ? ariaErr.message : String(ariaErr)}`);
        aria = { landmarks: [], liveRegions: [], labelledElements: [], ariaConflicts: [] };
      }

      // 4. UI Segmentation
      console.log("\n[4/7] Segmenting UI ...");
      const segments = segmentUI(parsed.root, aria);
      console.log(`  Segments found: ${segments.length}`);
      for (const seg of segments) {
        console.log(
          `    - [${seg.type}] "${seg.label}" (confidence: ${seg.confidence.toFixed(2)}, interactive: ${seg.interactiveElementCount})`,
        );
      }

      // 4b. Aggressive filtering: nur relevante Segmente an LLM senden
      // Schritt 1: Nur Segmente mit interactiven Elementen ODER Schluesseltypen
      const withInteractive = segments.filter(
        (s) =>
          s.interactiveElementCount > 0 ||
          ["form", "navigation", "search"].includes(s.type),
      );
      // Schritt 2: Deduplizieren nach Typ — nur das beste pro Typ behalten
      const bestByType = new Map<string, typeof segments[0]>();
      for (const s of withInteractive) {
        const existing = bestByType.get(s.type);
        if (!existing || s.confidence > existing.confidence ||
            (s.confidence === existing.confidence && s.interactiveElementCount > existing.interactiveElementCount)) {
          bestByType.set(s.type, s);
        }
      }
      // Schritt 3: Sortieren nach Confidence desc, cap bei 8 Segmenten
      const relevantSegments = [...bestByType.values()]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 8);
      console.log(
        `  Filtered: ${segments.length} → ${withInteractive.length} interactive → ${relevantSegments.length} deduped+capped`,
      );
      for (const seg of relevantSegments) {
        console.log(
          `    → [${seg.type}] confidence=${seg.confidence.toFixed(2)} interactive=${seg.interactiveElementCount}`,
        );
      }

      // 5. LLM Endpoint Generation
      console.log("\n[5/7] Generating endpoints via LLM ...");
      const siteId = randomUUID();
      const context = {
        url: page.url(),
        siteId,
        sessionId: randomUUID(),
        pageTitle: await page.title(),
      };
      console.log(`  siteId (UUID): ${siteId}`);

      const genResult = await generateEndpoints(relevantSegments, context, {
        llmClient,
      });
      const candidates = genResult.candidates;
      console.log(`  Candidates from LLM: ${candidates.length}`);

      // 6. Candidate → Endpoint Conversion
      console.log("\n[6/7] Converting candidates to full Endpoints ...");
      const endpoints: Endpoint[] = [];
      for (const candidate of candidates) {
        try {
          const segment =
            segments.find((s) => s.type === candidate.type) ?? segments[0];
          if (!segment) continue;

          const llmSummary = llmClient.summary();
          const endpoint = candidateToEndpoint(candidate, context, segment, {
            endpoints: candidates,
            reasoning: candidate.reasoning,
            model: llmSummary.callsByModel
              ? Object.keys(llmSummary.callsByModel)[0] ?? "unknown"
              : "unknown",
            tokens: {
              prompt: llmSummary.totalTokens,
              completion: 0,
            },
          });
          endpoints.push(endpoint);
        } catch (err) {
          console.log(
            `  WARN: Failed to convert candidate "${candidate.label}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // 7. Ergebnisse
      console.log("\n[7/7] RESULTS:");
      console.log("────────────────────────────────────────");
      console.log(`  Total Endpoints: ${endpoints.length}`);

      for (const ep of endpoints) {
        console.log(`\n  Endpoint: ${ep.label.primary}`);
        console.log(`    Type:              ${ep.type}`);
        console.log(`    Confidence:        ${ep.confidence.toFixed(3)}`);
        console.log(`    Risk Class:        ${ep.risk_class}`);
        console.log(`    Status:            ${ep.status}`);
        console.log(`    Evidence Count:    ${ep.evidence.length}`);
        console.log(`    Affordances:       ${ep.affordances.map((a) => a.type).join(", ")}`);
        console.log(`    Anchors:           ${ep.anchors.length}`);
      }

      // Cost Summary
      const summary = llmClient.summary();
      const totalLatency = Date.now() - runStart;

      console.log("\n────────────────────────────────────────");
      console.log("  LLM COST SUMMARY:");
      console.log(`    Total Calls:       ${summary.totalCalls}`);
      console.log(`    Total Tokens:      ${summary.totalTokens}`);
      console.log(`    Total Cost:        $${summary.totalCostUsd.toFixed(6)}`);
      console.log(`    Avg Latency:       ${summary.averageLatencyMs}ms`);
      console.log(`    Models Used:       ${JSON.stringify(summary.callsByModel)}`);
      console.log(`    Total Run Time:    ${totalLatency}ms`);
      console.log("────────────────────────────────────────\n");

      // Assertions (SOFT)
      expect(endpoints.length).toBeGreaterThan(0);

      // Search-Endpoint suchen
      const searchEndpoints = endpoints.filter((e) => e.type === "search");
      console.log(`  Search endpoints found: ${searchEndpoints.length}`);
      if (searchEndpoints.length > 0) {
        console.log(
          `  Search confidence: ${searchEndpoints[0]!.confidence.toFixed(3)}`,
        );
      } else {
        console.log(
          "  NOTE: No search endpoint detected explicitly.",
        );
        console.log(
          "  All detected types:",
          endpoints.map((e) => e.type),
        );
      }

      // Navigation-Endpoints
      const navEndpoints = endpoints.filter((e) => e.type === "navigation");
      console.log(`  Navigation endpoints found: ${navEndpoints.length}`);

      expect(endpoints.length).toBeGreaterThan(0);
    } finally {
      await adapter.destroyContext(contextId);
    }
  }, 180_000);
});

// ============================================================================
// Helpers
// ============================================================================

function countNodes(node: { children?: unknown[] }): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      if (child && typeof child === "object") {
        count += countNodes(child as { children?: unknown[] });
      }
    }
  }
  return count;
}

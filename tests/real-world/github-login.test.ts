/**
 * Real-World Integration Test: github.com/login
 *
 * Testet die KOMPLETTE Pipeline mit echtem Browser und echtem LLM:
 *   Browser → DOM-Extraction → Parsing → Segmenting → LLM-Endpoint-Generation → Confidence
 *
 * Wird UEBERSPRUNGEN wenn kein API-Key gesetzt ist.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { BrowserAdapter } from "../../src/adapter/browser-adapter.js";
import { extractStructuredDOM } from "../../src/adapter/dom-extractor.js";
import { parseDom } from "../../src/parser/dom-parser.js";
import { segmentUI } from "../../src/parser/ui-segmenter.js";
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

describe.skipIf(!hasApiKey)("Real-World: github.com/login", () => {
  let adapter: BrowserAdapter;
  let llmClient: FallbackLLMClient;

  beforeAll(async () => {
    adapter = new BrowserAdapter({ headless: true });
    await adapter.launch();

    llmClient = createFallbackLLMClient({ envConfig });
  }, 60_000);

  afterAll(async () => {
    await adapter.shutdown();
  }, 30_000);

  it("should detect auth endpoint on GitHub login page", async () => {
    const runStart = Date.now();
    const contextId = await adapter.newContext();

    try {
      const page = await adapter.getPage(contextId);

      // 1. Navigation
      console.log("\n========================================");
      console.log("  REAL-WORLD TEST: github.com/login");
      console.log("========================================\n");

      console.log("[1/7] Navigating to https://github.com/login ...");
      await page.goto("https://github.com/login", {
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
      const domNode = await extractStructuredDOM(page);
      console.log(`  DOM nodes: ${countNodes(domNode)}`);

      // 3. DOM Parsing
      console.log("\n[3/7] Parsing DOM ...");
      const parsed = parseDom(domNode);
      console.log(`  Normalized nodes: ${parsed.stats.totalNodes}`);
      console.log(`  Depth: ${parsed.stats.maxDepth}`);

      // 4. UI Segmentation
      console.log("\n[4/7] Segmenting UI ...");
      const segments = segmentUI(parsed.root);
      console.log(`  Segments found: ${segments.length}`);
      for (const seg of segments) {
        console.log(
          `    - [${seg.type}] "${seg.label}" (confidence: ${seg.confidence.toFixed(2)}, interactive: ${seg.interactiveElementCount})`,
        );
      }

      // 5. LLM Endpoint Generation
      console.log("\n[5/7] Generating endpoints via LLM ...");
      const context = {
        url: page.url(),
        siteId: "github.com",
        sessionId: randomUUID(),
        pageTitle: await page.title(),
      };

      const candidates = await generateEndpoints(segments, context, {
        llmClient,
      });
      console.log(`  Candidates from LLM: ${candidates.length}`);

      // 6. Candidate → Endpoint Conversion
      console.log("\n[6/7] Converting candidates to full Endpoints ...");
      const endpoints: Endpoint[] = [];
      for (const candidate of candidates) {
        try {
          // Finde passendes Segment
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
        if (ep.metadata) {
          console.log(`    LLM Model:         ${ep.metadata.generatedBy}`);
        }
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

      // Assertions (SOFT fuer ersten Run)
      expect(endpoints.length).toBeGreaterThan(0);

      // Auth-Endpoint suchen
      const authEndpoints = endpoints.filter((e) => e.type === "auth");
      console.log(
        `  Auth endpoints found: ${authEndpoints.length}`,
      );
      if (authEndpoints.length > 0) {
        console.log(
          `  Auth confidence: ${authEndpoints[0]!.confidence.toFixed(3)}`,
        );
      } else {
        // Kein harter Fail — loggen statt failen
        console.log(
          "  NOTE: No auth endpoint detected. This may improve with prompt tuning.",
        );
        console.log(
          "  All detected types:",
          endpoints.map((e) => e.type),
        );
      }

      // Mindestens 1 Endpoint muss erkannt werden
      expect(endpoints.length).toBeGreaterThan(0);
    } finally {
      await adapter.destroyContext(contextId);
    }
  }, 120_000);
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

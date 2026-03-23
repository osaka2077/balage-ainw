/**
 * analyzeFromHTML — High-Level API fuer @balage/core
 *
 * Nimmt raw HTML, gibt semantisch klassifizierte Endpoints zurueck.
 * Funktioniert ohne Browser (Playwright optional fuer analyzeFromPage).
 */

import pino from "pino";
import { htmlToDomNode } from "./html-to-dom.js";
import { detectFramework } from "./detect-framework.js";
import { pruneDom, segmentUI } from "../../src/parser/index.js";
import { generateEndpoints, candidateToEndpoint } from "../../src/semantic/endpoint-generator.js";
import { classifyEndpoint } from "../../src/semantic/endpoint-classifier.js";
import { createOpenAIClient, createAnthropicClient } from "../../src/semantic/llm-client.js";
import type { LLMClient } from "../../src/semantic/llm-client.js";
import type { AnalyzeOptions, AnalysisResult, DetectedEndpoint } from "./types.js";

const logger = pino({ name: "balage:core", level: process.env.LOG_LEVEL ?? "warn" });

/**
 * Analyze raw HTML and return detected endpoints.
 *
 * @param html - Raw HTML string of the page
 * @param options - Configuration options
 * @returns Analysis result with endpoints, framework detection, and timing
 */
export async function analyzeFromHTML(
  html: string,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const start = performance.now();
  const {
    url = "https://unknown",
    llm = true,
    minConfidence = 0.50,
    maxEndpoints = 10,
  } = options;

  // 1. HTML → DomNode
  const dom = htmlToDomNode(html);

  // 2. Framework Detection
  const framework = detectFramework(html) ?? undefined;

  // 3. DOM Pruning + Segmentation
  const pruned = pruneDom(dom);
  const segments = segmentUI(pruned);

  logger.debug({ segmentCount: segments.length, framework: framework?.framework }, "Segments created");

  let endpoints: DetectedEndpoint[] = [];
  let llmCalls = 0;
  const mode = llm ? "llm" : "heuristic";

  if (llm && typeof llm !== "boolean") {
    // LLM mode — full semantic analysis
    const llmClient = createLLMClient(llm);

    const candidates = await generateEndpoints(
      segments,
      { url, timestamp: new Date() },
      { llmClient, maxConcurrency: 6 },
    );

    llmCalls = candidates.length; // approximation

    endpoints = candidates
      .map((c) => {
        const classified = classifyEndpoint(c, segments.find(s => s.id === c.segmentId) ?? segments[0]!);
        return {
          type: classified.correctedType ?? c.type,
          label: c.label,
          description: c.description,
          confidence: classified.combinedConfidence,
          selector: c.anchors[0]?.selector,
          affordances: c.affordances.map(a => a.type),
          evidence: [`LLM classification: ${c.type}`, `Heuristic: ${classified.correctedType ?? "no correction"}`],
        } satisfies DetectedEndpoint;
      })
      .filter(e => e.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxEndpoints);
  } else {
    // Heuristic-only mode — no LLM calls, just DOM analysis
    endpoints = segments
      .filter(s => s.interactiveElementCount > 0)
      .map(s => ({
        type: s.type,
        label: s.label ?? s.type,
        description: `${s.type} segment with ${s.interactiveElementCount} interactive elements`,
        confidence: Math.min(0.7, 0.3 + s.interactiveElementCount * 0.1),
        selector: undefined,
        affordances: inferAffordancesFromSegment(s),
        evidence: [`Segment type: ${s.type}`, `Interactive elements: ${s.interactiveElementCount}`],
      }))
      .filter(e => e.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxEndpoints);
  }

  const totalMs = Math.round(performance.now() - start);

  return {
    endpoints,
    framework,
    timing: { totalMs, llmCalls },
    meta: {
      url,
      mode,
      version: "0.1.0-alpha.1",
    },
  };
}

function createLLMClient(config: { provider: string; apiKey: string; model?: string }): LLMClient {
  if (config.provider === "anthropic") {
    return createAnthropicClient({
      apiKey: config.apiKey,
      model: config.model ?? "claude-haiku-4-5-20251001",
    });
  }
  return createOpenAIClient({
    apiKey: config.apiKey,
    model: config.model ?? "gpt-4o-mini",
  });
}

function inferAffordancesFromSegment(segment: { type: string; nodes?: unknown[] }): string[] {
  const affordances: string[] = [];
  switch (segment.type) {
    case "form": affordances.push("fill", "submit"); break;
    case "auth": affordances.push("fill", "submit", "click"); break;
    case "search": affordances.push("fill", "submit"); break;
    case "navigation": affordances.push("click", "navigate"); break;
    case "checkout": affordances.push("click", "fill", "submit"); break;
    default: affordances.push("click");
  }
  return affordances;
}

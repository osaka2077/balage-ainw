/**
 * analyzeFromHTML — High-Level API fuer @balage/core
 *
 * Nimmt raw HTML, gibt semantisch klassifizierte Endpoints zurueck.
 * Funktioniert ohne Browser (Playwright optional).
 */

import pino from "pino";
import { htmlToDomNode } from "./html-to-dom.js";
import { detectFramework } from "./detect-framework.js";
import { pruneDom, parseAria, segmentUI } from "../parser/index.js";
import { generateEndpoints } from "../semantic/endpoint-generator.js";
import { classifyEndpoint } from "../semantic/endpoint-classifier.js";
import { createOpenAIClient, createAnthropicClient } from "../semantic/llm-client.js";
import type { LLMClient } from "../semantic/llm-client.js";
import type { UISegment } from "../../shared_interfaces.js";
import type { EndpointCandidate } from "../semantic/types.js";
import type { AnalyzeOptions, AnalysisResult, DetectedEndpoint, LLMConfig } from "./types.js";
import { randomUUID } from "node:crypto";

const logger = pino({ name: "balage:core", level: process.env["LOG_LEVEL"] ?? "warn" });

/**
 * Analyze raw HTML and return detected endpoints.
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
  const pruneResult = pruneDom(dom);
  const emptyAxTree = { role: "rootWebArea", name: "", children: [], disabled: false, required: false };
  const aria = parseAria(pruneResult.prunedDom, emptyAxTree);
  const segments = segmentUI(pruneResult.prunedDom, aria);

  logger.debug({ segmentCount: segments.length, framework: framework?.framework }, "Segments created");

  let endpoints: DetectedEndpoint[];
  let llmCalls = 0;
  const mode = llm ? "llm" as const : "heuristic" as const;

  if (llm && typeof llm !== "boolean") {
    endpoints = await runLLMAnalysis(segments, llm, url, minConfidence, maxEndpoints);
    llmCalls = segments.filter(s => s.interactiveElementCount >= 1).length;
  } else {
    endpoints = runHeuristicAnalysis(segments, minConfidence, maxEndpoints);
  }

  const totalMs = Math.round(performance.now() - start);

  return {
    endpoints,
    framework,
    timing: { totalMs, llmCalls },
    meta: { url, mode, version: "0.1.0-alpha.1" },
  };
}

async function runLLMAnalysis(
  segments: UISegment[],
  llmConfig: LLMConfig,
  url: string,
  minConfidence: number,
  maxEndpoints: number,
): Promise<DetectedEndpoint[]> {
  const llmClient = createLLMClient(llmConfig);

  const candidates: EndpointCandidate[] = await generateEndpoints(
    segments,
    { url, siteId: url, sessionId: randomUUID() },
    { llmClient, maxConcurrency: 6 },
  );

  return candidates
    .map((c: EndpointCandidate) => {
      const seg = segments[0]!;
      const classified = classifyEndpoint(c, seg);
      return {
        type: classified.correctedType ?? c.type,
        label: c.label,
        description: c.description,
        confidence: classified.combinedConfidence,
        selector: c.anchors[0]?.selector,
        affordances: c.affordances.map((a: { type: string }) => a.type),
        evidence: [
          `LLM: ${c.type} (conf ${c.confidence.toFixed(2)})`,
          classified.correctedType ? `Heuristic correction: ${classified.correctedType}` : "Heuristic: confirmed",
        ],
      } satisfies DetectedEndpoint;
    })
    .filter((e: DetectedEndpoint) => e.confidence >= minConfidence)
    .sort((a: DetectedEndpoint, b: DetectedEndpoint) => b.confidence - a.confidence)
    .slice(0, maxEndpoints);
}

function runHeuristicAnalysis(
  segments: UISegment[],
  minConfidence: number,
  maxEndpoints: number,
): DetectedEndpoint[] {
  return segments
    .filter((s: UISegment) => s.interactiveElementCount > 0)
    .map((s: UISegment) => ({
      type: s.type,
      label: s.label ?? s.type,
      description: `${s.type} segment with ${s.interactiveElementCount} interactive elements`,
      confidence: Math.min(0.7, 0.3 + s.interactiveElementCount * 0.1),
      selector: undefined,
      affordances: inferAffordances(s.type),
      evidence: [`Segment type: ${s.type}`, `Interactive elements: ${s.interactiveElementCount}`],
    }))
    .filter((e: DetectedEndpoint) => e.confidence >= minConfidence)
    .sort((a: DetectedEndpoint, b: DetectedEndpoint) => b.confidence - a.confidence)
    .slice(0, maxEndpoints);
}

function createLLMClient(config: LLMConfig): LLMClient {
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

function inferAffordances(type: string): string[] {
  switch (type) {
    case "form": return ["fill", "submit"];
    case "auth": return ["fill", "submit", "click"];
    case "search": return ["fill", "submit"];
    case "navigation": return ["click", "navigate"];
    case "checkout": return ["click", "fill", "submit"];
    default: return ["click"];
  }
}

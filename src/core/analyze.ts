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
import type { DomNode, UISegment, SemanticFingerprint } from "../../shared_interfaces.js";

// Lazy imports for LLM — only loaded when LLM mode is used.
// This prevents "Cannot find module 'openai'" for heuristic-only users.
async function loadLLMModules() {
  const { generateEndpoints } = await import("../semantic/endpoint-generator.js");
  const { classifyEndpoint } = await import("../semantic/endpoint-classifier.js");
  const { createOpenAIClient, createAnthropicClient } = await import("../semantic/llm-client.js");
  return { generateEndpoints, classifyEndpoint, createOpenAIClient, createAnthropicClient };
}

// Lazy import for cache module
async function loadCacheModule() {
  const { lookupCache, storeInCache } = await import("./fingerprint-cache.js");
  return { lookupCache, storeInCache };
}
import type { AnalyzeOptions, AnalysisResult, DetectedEndpoint, LLMConfig, EndpointType, AffordanceType } from "./types.js";
import type { EndpointCandidate } from "../semantic/types.js";
import { BalageInputError, BalageLLMError } from "./types.js";
import { VERSION } from "./index.js";
import { randomUUID } from "node:crypto";
import { runHeuristicAnalysis, classifySegmentHeuristically } from "./heuristic-analyzer.js";

const logger = pino({ name: "balage:core", level: process.env["LOG_LEVEL"] ?? "silent" });

/**
 * Analyze raw HTML and return detected endpoints.
 *
 * @param html - Raw HTML string of the page
 * @param options - Configuration options
 * @returns Analysis result with endpoints, framework detection, and timing
 *
 * @throws {BalageInputError} When html is not a string
 * @throws {BalageLLMError} When LLM provider returns an error
 */
export async function analyzeFromHTML(
  html: string,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  // --- Input Validation ---
  if (typeof html !== "string") {
    throw new BalageInputError(
      `Expected html to be a string, got ${typeof html}`,
    );
  }

  // Leeres / whitespace-only HTML: sofort leeres Ergebnis
  if (html.trim().length === 0) {
    return createEmptyResult(options);
  }

  const start = performance.now();
  const {
    url = "https://unknown",
    llm = false as false | LLMConfig,
    minConfidence = 0.53,
    maxEndpoints = 8,
    cache: cacheOption = true,
  } = options;

  const cacheEnabled = cacheOption !== false;
  const cacheOptions = typeof cacheOption === "object" ? cacheOption : {};

  // 1. HTML → DomNode (mit Fehlerbehandlung fuer kaputtes HTML)
  let dom: DomNode;
  try {
    dom = htmlToDomNode(html);
  } catch (err) {
    logger.warn({ err }, "HTML parsing failed, returning empty result");
    return createEmptyResult(options, performance.now() - start);
  }

  // 2. Framework Detection (darf nie crashen)
  let framework: AnalysisResult["framework"];
  try {
    framework = detectFramework(html) ?? undefined;
  } catch (err) {
    logger.warn({ err }, "Framework detection failed, continuing without");
    framework = undefined;
  }

  // 3. DOM Pruning + Segmentation
  const pruneResult = pruneDom(dom);
  const emptyAxTree = {
    role: "rootWebArea",
    name: "",
    children: [],
    disabled: false,
    required: false,
  };
  const aria = parseAria(pruneResult.prunedDom, emptyAxTree);
  const segments = segmentUI(pruneResult.prunedDom, aria);

  logger.debug(
    { segmentCount: segments.length, framework: framework?.framework },
    "Segments created",
  );

  // --- Cache Lookup ---
  let _cacheFingerprints: SemanticFingerprint[] | undefined;
  let _cachePageHash: string | undefined;

  if (cacheEnabled) {
    try {
      const { lookupCache } = await loadCacheModule();
      const cacheResult = await lookupCache(segments, url, cacheOptions);

      if (cacheResult.hit && cacheResult.result) {
        const totalMs = Math.round(performance.now() - start);
        return {
          ...cacheResult.result,
          endpoints: cacheResult.result.endpoints.slice(0, maxEndpoints),
          timing: { totalMs, llmCalls: 0 },
          meta: {
            ...cacheResult.result.meta,
            url, version: VERSION,
            cached: true,
            cacheSimilarity: cacheResult.similarity,
            fingerprintHash: cacheResult.fingerprintHash,
          },
        };
      }

      _cacheFingerprints = cacheResult.fingerprints;
      _cachePageHash = cacheResult.fingerprintHash;
    } catch (err) {
      logger.warn({ err }, "Cache lookup failed, continuing without cache");
    }
  }

  let endpoints: DetectedEndpoint[];
  let llmCalls = 0;
  const mode = llm ? "llm" as const : "heuristic" as const;

  if (llm) {
    const heuristicGateEnabled = process.env["BALAGE_HEURISTIC_GATE"] !== "0";

    let heuristicEndpoints: DetectedEndpoint[] = [];
    let segmentsForLLM = segments;

    if (heuristicGateEnabled) {
      const gated: DetectedEndpoint[] = [];
      const remaining: UISegment[] = [];

      for (const seg of segments) {
        const result = classifySegmentHeuristically(seg, dom);
        if (result) {
          gated.push(result);
        } else {
          remaining.push(seg);
        }
      }

      heuristicEndpoints = gated;
      segmentsForLLM = remaining;
      logger.debug(
        { gated: gated.length, remaining: remaining.length },
        "Heuristic gate applied",
      );
    }

    const llmResult = await runLLMAnalysis(
      segmentsForLLM, llm, url, minConfidence, maxEndpoints,
    );

    // Merge: Heuristic + LLM, dedup by type+label
    const allEndpoints = [...heuristicEndpoints, ...llmResult.endpoints];
    const seen = new Set<string>();
    endpoints = allEndpoints.filter(ep => {
      const key = `${ep.type}:${ep.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => b.confidence - a.confidence).slice(0, maxEndpoints);

    llmCalls = llmResult.llmCalls;
  } else {
    endpoints = runHeuristicAnalysis(
      segments, dom, minConfidence, maxEndpoints,
    );
  }

  const totalMs = Math.round(performance.now() - start);

  const result: AnalysisResult = {
    endpoints,
    framework,
    timing: { totalMs, llmCalls },
    meta: cacheEnabled
      ? { url, mode, version: VERSION, cached: false, fingerprintHash: _cachePageHash }
      : { url, mode, version: VERSION },
  };

  if (cacheEnabled && _cacheFingerprints?.length && _cachePageHash) {
    try {
      const { storeInCache } = await loadCacheModule();
      await storeInCache(result, _cacheFingerprints, _cachePageHash, url, cacheOptions);
    } catch (err) {
      logger.warn({ err }, "Cache store failed");
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// LLM Analysis
// ---------------------------------------------------------------------------

async function runLLMAnalysis(
  segments: UISegment[],
  llmConfig: LLMConfig,
  url: string,
  minConfidence: number,
  maxEndpoints: number,
): Promise<{ endpoints: DetectedEndpoint[]; llmCalls: number }> {
  // Lazy-load LLM modules (prevents "Cannot find module 'openai'" for heuristic-only users)
  const { generateEndpoints, classifyEndpoint, createOpenAIClient, createAnthropicClient } = await loadLLMModules();

  let llmClient;
  try {
    if (llmConfig.provider === "anthropic") {
      llmClient = await createAnthropicClient({ apiKey: llmConfig.apiKey, model: llmConfig.model ?? "claude-haiku-4-5-20251001" });
    } else if (llmConfig.provider === "openai") {
      llmClient = await createOpenAIClient({ apiKey: llmConfig.apiKey, model: llmConfig.model ?? "gpt-4o-mini" });
    } else {
      throw new BalageLLMError(`Unknown provider "${llmConfig.provider}". Supported: "openai", "anthropic".`, llmConfig.provider);
    }
  } catch (err) {
    if (err instanceof BalageLLMError) throw err;
    throw new BalageLLMError(
      `Failed to create ${llmConfig.provider} client: ${err instanceof Error ? err.message : String(err)}`,
      llmConfig.provider,
      err instanceof Error ? err : undefined,
    );
  }

  let candidates: EndpointCandidate[];
  let generatorLlmCalls = 0;
  try {
    const result = await generateEndpoints(
      segments,
      { url, siteId: url, sessionId: randomUUID() },
      { llmClient, maxConcurrency: 6 },
    );
    candidates = result.candidates;
    generatorLlmCalls = result.llmCalls;
  } catch (err) {
    throw new BalageLLMError(
      `LLM endpoint generation failed: ${err instanceof Error ? err.message : String(err)}`,
      llmConfig.provider,
      err instanceof Error ? err : undefined,
    );
  }

  // Warn if LLM returned 0 candidates for interactive segments
  const interactiveSegments = segments.filter(s => s.interactiveElementCount >= 1);
  if (candidates.length === 0 && interactiveSegments.length > 0) {
    logger.warn(
      { segmentCount: interactiveSegments.length, provider: llmConfig.provider },
      "LLM returned 0 endpoints despite interactive segments — check API key and model",
    );
  }

  const mapped: DetectedEndpoint[] = [];
  for (const c of candidates) {
    const matchedSegment = segments.find(s => s.id === c.segmentId)
      ?? segments.find(s => s.type === c.type)
      ?? segments[0];
    if (!matchedSegment) continue;
    const classified = classifyEndpoint(c, matchedSegment);
    mapped.push({
      type: (classified.correctedType ?? c.type) as EndpointType,
      label: c.label,
      description: c.description,
      confidence: classified.combinedConfidence,
      selector: c.anchors[0]?.selector,
      affordances: c.affordances.map((a: { type: string }) => a.type) as AffordanceType[],
      evidence: [
        `LLM: ${c.type} (conf ${c.confidence.toFixed(2)})`,
        classified.correctedType ? `Heuristic correction: ${classified.correctedType}` : "Heuristic: confirmed",
      ],
    });
  }
  const filtered = mapped
    .filter(e => e.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxEndpoints);
  return { endpoints: filtered, llmCalls: generatorLlmCalls };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyResult(
  options: AnalyzeOptions,
  elapsedMs: number = 0,
): AnalysisResult {
  return {
    endpoints: [],
    framework: undefined,
    timing: { totalMs: Math.round(elapsedMs), llmCalls: 0 },
    meta: {
      url: options.url,
      mode: options.llm ? "llm" : "heuristic",
      version: VERSION,
    },
  };
}

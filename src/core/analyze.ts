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
    maxEndpoints: maxEndpointsOption,
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

  // Dynamic maxEndpoints: scale with page complexity, default 8
  const maxEndpoints = maxEndpointsOption ?? Math.min(8, Math.max(5, Math.ceil(segments.length * 0.8)));

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
    // Ensemble-Modus: Heuristik + LLM laufen PARALLEL, Ergebnisse werden gemerged
    // Heuristik ist kostenlos (reines DOM-Walking, ~1ms) und liefert Typ-Anchors
    // LLM liefert Detail-Analyse und findet Sub-Endpoints die die Heuristik verpasst

    // Phase 1: Heuristik auf ALLEN Segmenten (kostenlos)
    const heuristicEndpoints: DetectedEndpoint[] = [];
    for (const seg of segments) {
      const result = classifySegmentHeuristically(seg, dom);
      if (result) {
        heuristicEndpoints.push(result);
      }
    }

    // Phase 2: LLM-Analyse (multiRun wird auf Segment-Level in endpoint-generator.ts gehandhabt)
    const multiRun = options.multiRun ?? parseInt(process.env["BALAGE_RUNS"] ?? "1", 10);
    const llmResult = await runLLMAnalysis(
      segments, llm, url, minConfidence, maxEndpoints, multiRun,
    );

    // Phase 3: Ensemble-Merge mit Confidence-Boost bei Uebereinstimmung
    endpoints = reconcileEnsembleResults(heuristicEndpoints, llmResult.endpoints, maxEndpoints);

    logger.debug(
      { heuristic: heuristicEndpoints.length, llm: llmResult.endpoints.length, merged: endpoints.length, multiRun },
      "Ensemble merge completed",
    );

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
// Ensemble Reconciler
// ---------------------------------------------------------------------------

/**
 * Merges heuristic + LLM results with confidence-boost on agreement.
 * - Both agree on type: confidence boosted (+0.05)
 * - Only heuristic found it: kept as-is (high confidence from DOM signals)
 * - Only LLM found it: kept as-is (LLM adds sub-endpoints the heuristic misses)
 * - Dedup by type:label similarity
 */
function reconcileEnsembleResults(
  heuristic: DetectedEndpoint[],
  llm: DetectedEndpoint[],
  maxEndpoints: number,
): DetectedEndpoint[] {
  const result: DetectedEndpoint[] = [];
  const usedLLM = new Set<number>();

  // Step 1: For each heuristic endpoint, find matching LLM endpoint
  for (const hep of heuristic) {
    let bestMatch: { idx: number; ep: DetectedEndpoint } | null = null;
    let bestSim = 0;

    for (let i = 0; i < llm.length; i++) {
      if (usedLLM.has(i)) continue;
      if (llm[i]!.type !== hep.type) continue;

      // Label similarity (word overlap)
      const hWords = new Set(hep.label.toLowerCase().split(/\s+/));
      const lWords = new Set(llm[i]!.label.toLowerCase().split(/\s+/));
      let overlap = 0;
      for (const w of hWords) if (lWords.has(w)) overlap++;
      const sim = overlap / Math.max(hWords.size, lWords.size);

      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = { idx: i, ep: llm[i]! };
      }
    }

    if (bestMatch && bestSim > 0.3) {
      // Agreement: boost confidence
      usedLLM.add(bestMatch.idx);
      result.push({
        ...bestMatch.ep, // Use LLM's richer labels/descriptions
        confidence: Math.min(0.98, Math.max(hep.confidence, bestMatch.ep.confidence) + 0.05),
      });
    } else {
      // Heuristic-only: keep as-is
      result.push(hep);
    }
  }

  // Step 2: Add LLM-only endpoints (sub-endpoints the heuristic missed)
  for (let i = 0; i < llm.length; i++) {
    if (usedLLM.has(i)) continue;
    // Check not a duplicate of something already in result
    const isDup = result.some(r =>
      r.type === llm[i]!.type &&
      r.label.toLowerCase() === llm[i]!.label.toLowerCase(),
    );
    if (!isDup) {
      result.push(llm[i]!);
    }
  }

  return result
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxEndpoints);
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
  multiRun: number = 1,
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
      { llmClient, maxConcurrency: 6, multiRun },
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

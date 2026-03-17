/**
 * Real-World Benchmark Runner
 *
 * Fuehrt die volle BALAGE-Pipeline gegen 10 echte Websites aus,
 * vergleicht mit Ground-Truth und berechnet Precision/Recall/F1.
 *
 * Ausfuehrung: npm run benchmark:real
 * Voraussetzung: API-Key in .env.local
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
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
import type { Endpoint, UISegment } from "../../shared_interfaces.js";

// ============================================================================
// Types
// ============================================================================

interface GroundTruthEndpoint {
  type: string;
  label: string;
  description: string;
  selector_hint: string;
  affordances: string[];
  risk_class: string;
  fields: string[];
  phase: number;
}

interface GroundTruth {
  url: string;
  captured_at: string;
  difficulty: "easy" | "medium" | "hard" | "extreme";
  notes: string;
  endpoints: GroundTruthEndpoint[];
  expected_metrics: {
    total_endpoints: number;
    phase1_endpoints: number;
    min_precision_target: number;
    min_recall_target: number;
  };
}

interface BenchmarkMetrics {
  precision: number;
  recall: number;
  f1: number;
  typeAccuracy: number;
}

interface BenchmarkResult {
  url: string;
  file: string;
  difficulty: string;
  status: "success" | "blocked" | "timeout" | "error";
  groundTruth: { total: number; phase1: number; types: string[] };
  detected: { total: number; types: string[] };
  metrics: {
    all: BenchmarkMetrics;
    phase1Only: BenchmarkMetrics;
  };
  timing: { totalMs: number; llmCalls: number; llmCostUsd: number };
  errors: string[];
  matchDetails: MatchDetail[];
}

interface MatchDetail {
  groundTruth: { type: string; label: string; phase: number };
  matched: { type: string; label: string; confidence: number } | null;
  typeMatch: boolean;
}

interface BenchmarkReport {
  runDate: string;
  config: {
    provider: string;
    model: string;
    fallbackModel: string;
  };
  results: BenchmarkResult[];
  aggregate: {
    totalWebsites: number;
    successful: number;
    skipped: number;
    allEndpoints: BenchmarkMetrics;
    phase1Endpoints: BenchmarkMetrics;
    totalLlmCalls: number;
    totalLlmCostUsd: number;
    totalTimeMs: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DIFFICULTY_ORDER: Record<string, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
  extreme: 3,
};

const WEBSITE_TIMEOUT_MS = 120_000;

// Typ-Aliase: welche Ground-Truth-Typen zu welchen Detected-Typen passen
const TYPE_ALIASES: Record<string, string[]> = {
  auth: ["auth", "form"],
  form: ["form", "search", "consent"],
  navigation: ["navigation", "content"],
  checkout: ["checkout", "commerce", "form"],
  search: ["search", "form"],
  support: ["support", "navigation"],
};

// Schluesseltypen fuer Segment-Filterung (aus den bestehenden Tests)
const KEY_SEGMENT_TYPES = ["form", "navigation", "auth", "search", "checkout"];

// ============================================================================
// Matching Logic
// ============================================================================

function typesMatch(gtType: string, detectedType: string): boolean {
  if (gtType === detectedType) return true;
  const aliases = TYPE_ALIASES[gtType];
  return aliases ? aliases.includes(detectedType) : false;
}

function computeMatches(
  groundTruth: GroundTruthEndpoint[],
  detected: Endpoint[],
): { matched: number; details: MatchDetail[] } {
  const usedDetected = new Set<number>();
  const details: MatchDetail[] = [];
  let matched = 0;

  for (const gt of groundTruth) {
    let bestIdx = -1;
    let bestConfidence = -1;
    let exactTypeMatch = false;

    for (let i = 0; i < detected.length; i++) {
      if (usedDetected.has(i)) continue;
      const det = detected[i]!;
      if (typesMatch(gt.type, det.type)) {
        // Bevorzuge exakten Type-Match, dann hoechste Confidence
        const isExact = gt.type === det.type;
        if (
          (isExact && !exactTypeMatch) ||
          (isExact === exactTypeMatch && det.confidence > bestConfidence)
        ) {
          bestIdx = i;
          bestConfidence = det.confidence;
          exactTypeMatch = isExact;
        }
      }
    }

    if (bestIdx >= 0) {
      usedDetected.add(bestIdx);
      const det = detected[bestIdx]!;
      matched++;
      details.push({
        groundTruth: { type: gt.type, label: gt.label, phase: gt.phase },
        matched: { type: det.type, label: det.label.primary, confidence: det.confidence },
        typeMatch: gt.type === det.type,
      });
    } else {
      details.push({
        groundTruth: { type: gt.type, label: gt.label, phase: gt.phase },
        matched: null,
        typeMatch: false,
      });
    }
  }

  return { matched, details };
}

function computeMetrics(
  groundTruth: GroundTruthEndpoint[],
  detected: Endpoint[],
): BenchmarkMetrics {
  if (groundTruth.length === 0 && detected.length === 0) {
    return { precision: 1, recall: 1, f1: 1, typeAccuracy: 1 };
  }
  if (detected.length === 0) {
    return { precision: 0, recall: 0, f1: 0, typeAccuracy: 0 };
  }
  if (groundTruth.length === 0) {
    return { precision: 0, recall: 0, f1: 0, typeAccuracy: 0 };
  }

  const { matched, details } = computeMatches(groundTruth, detected);
  const exactTypeMatches = details.filter((d) => d.matched && d.typeMatch).length;

  const precision = matched / detected.length;
  const recall = matched / groundTruth.length;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const typeAccuracy = matched > 0 ? exactTypeMatches / matched : 0;

  return {
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    typeAccuracy: round(typeAccuracy),
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ============================================================================
// Pipeline
// ============================================================================

async function runPipeline(
  adapter: BrowserAdapter,
  llmClient: FallbackLLMClient,
  url: string,
): Promise<{ endpoints: Endpoint[]; errors: string[] }> {
  const contextId = await adapter.newContext();
  const endpoints: Endpoint[] = [];
  const errors: string[] = [];

  try {
    const page = await adapter.getPage(contextId);

    // 1. Navigation
    log(`  [1/7] Navigating to ${url} ...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {
      log("    (networkidle timeout — continuing)");
    });
    log(`    URL: ${page.url()}`);
    log(`    Title: ${await page.title()}`);

    // 2. DOM Extraction
    log("  [2/7] Extracting structured DOM ...");
    const rawDom = await extractStructuredDOM(page);

    // 3. Prune + Parse
    log("  [3/7] Pruning + Parsing DOM ...");
    const { prunedDom } = pruneDom(rawDom);
    const parsed = parseDom(prunedDom);
    log(`    Pruned nodes: ${parsed.nodeCount}, Depth: ${parsed.maxDepth}`);

    // 3b. ARIA Tree
    log("  [3b/7] Extracting ARIA tree ...");
    let aria;
    try {
      const cdp = await page.context().newCDPSession(page);
      const axTree = await extractAccessibilityTree(page, cdp);
      aria = parseAria(parsed.root, axTree);
      log(`    ARIA landmarks: ${aria.landmarks.length}`);
    } catch (ariaErr) {
      const msg = ariaErr instanceof Error ? ariaErr.message : String(ariaErr);
      log(`    ARIA failed (non-fatal): ${msg}`);
      errors.push(`ARIA extraction failed: ${msg}`);
      aria = { landmarks: [], liveRegions: [], labelledElements: [], ariaConflicts: [] };
    }

    // 4. UI Segmentation
    log("  [4/7] Segmenting UI ...");
    const segments = segmentUI(parsed.root, aria);
    log(`    Raw segments: ${segments.length}`);

    // 4b. Aggressive filtering — confidence + interactivity threshold
    const MIN_SEGMENT_CONFIDENCE = 0.50;
    const MIN_INTERACTIVE_FOR_LOW_CONF = 3;
    const withInteractive = segments.filter(
      (s: UISegment) => {
        // Hohe Confidence-Segmente immer behalten
        if (s.confidence >= MIN_SEGMENT_CONFIDENCE && KEY_SEGMENT_TYPES.includes(s.type)) return true;
        // Niedrige Confidence nur bei genuegend interaktiven Elementen
        if (s.confidence < MIN_SEGMENT_CONFIDENCE && s.interactiveElementCount < MIN_INTERACTIVE_FOR_LOW_CONF) return false;
        // Mindestens 1 interaktives Element oder Schluesseltyp
        return s.interactiveElementCount > 0 || KEY_SEGMENT_TYPES.includes(s.type);
      },
    );
    const bestByType = new Map<string, UISegment>();
    for (const s of withInteractive) {
      const existing = bestByType.get(s.type);
      if (
        !existing ||
        s.confidence > existing.confidence ||
        (s.confidence === existing.confidence &&
          s.interactiveElementCount > existing.interactiveElementCount)
      ) {
        bestByType.set(s.type, s);
      }
    }
    const relevantSegments = [...bestByType.values()]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8);
    log(`    Filtered: ${segments.length} → ${withInteractive.length} → ${relevantSegments.length}`);

    if (relevantSegments.length === 0) {
      errors.push("No relevant segments found after filtering");
      return { endpoints, errors };
    }

    // 5. LLM Endpoint Generation
    log("  [5/7] Generating endpoints via LLM ...");
    const siteId = randomUUID();
    const context = {
      url: page.url(),
      siteId,
      sessionId: randomUUID(),
      pageTitle: await page.title(),
    };

    const candidates = await generateEndpoints(relevantSegments, context, {
      llmClient,
    });
    log(`    Candidates from LLM: ${candidates.length}`);

    // 6. Candidate → Endpoint
    log("  [6/7] Converting candidates ...");
    for (const candidate of candidates) {
      try {
        const segment =
          segments.find((s: UISegment) => s.type === candidate.type) ?? segments[0];
        if (!segment) continue;

        const llmSummary = llmClient.summary();
        const endpoint = candidateToEndpoint(candidate, context, segment, {
          endpoints: candidates,
          reasoning: candidate.reasoning,
          model: llmSummary.callsByModel
            ? Object.keys(llmSummary.callsByModel)[0] ?? "unknown"
            : "unknown",
          tokens: { prompt: llmSummary.totalTokens, completion: 0 },
        });
        endpoints.push(endpoint);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Candidate conversion failed (${candidate.label}): ${msg}`);
      }
    }

    log(`  [7/7] Done — ${endpoints.length} endpoints detected`);
  } finally {
    await adapter.destroyContext(contextId);
  }

  return { endpoints, errors };
}

// ============================================================================
// Ground-Truth Loader
// ============================================================================

function loadGroundTruths(): Array<{ file: string; data: GroundTruth }> {
  const dir = join(import.meta.dirname!, "ground-truth");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

  const results: Array<{ file: string; data: GroundTruth }> = [];
  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf-8");
    results.push({ file, data: JSON.parse(raw) as GroundTruth });
  }

  // Sortiere: easy → medium → hard → extreme
  results.sort(
    (a, b) => (DIFFICULTY_ORDER[a.data.difficulty] ?? 99) - (DIFFICULTY_ORDER[b.data.difficulty] ?? 99),
  );

  return results;
}

// ============================================================================
// Logging
// ============================================================================

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function printSeparator(char = "═", width = 72): void {
  console.log(char.repeat(width));
}

function printWebsiteHeader(idx: number, total: number, gt: GroundTruth): void {
  console.log("");
  printSeparator();
  console.log(
    `  [${idx + 1}/${total}] ${gt.url}  (${gt.difficulty.toUpperCase()})`,
  );
  console.log(`  Ground-Truth: ${gt.endpoints.length} endpoints (${gt.expected_metrics.phase1_endpoints} phase-1)`);
  printSeparator("─");
}

function printWebsiteResult(result: BenchmarkResult): void {
  printSeparator("─");
  if (result.status !== "success") {
    console.log(`  STATUS: ${result.status.toUpperCase()}`);
    if (result.errors.length > 0) {
      console.log(`  Error:  ${result.errors[0]}`);
    }
    printSeparator("─");
    return;
  }

  console.log(`  Detected: ${result.detected.total} endpoints  [${result.detected.types.join(", ")}]`);
  console.log(`  Ground-Truth: ${result.groundTruth.total} endpoints  [${result.groundTruth.types.join(", ")}]`);
  console.log("");
  console.log(`  ALL ENDPOINTS:`);
  console.log(`    Precision: ${(result.metrics.all.precision * 100).toFixed(1)}%`);
  console.log(`    Recall:    ${(result.metrics.all.recall * 100).toFixed(1)}%`);
  console.log(`    F1:        ${(result.metrics.all.f1 * 100).toFixed(1)}%`);
  console.log(`    TypeAcc:   ${(result.metrics.all.typeAccuracy * 100).toFixed(1)}%`);
  console.log("");
  console.log(`  PHASE-1 ONLY:`);
  console.log(`    Precision: ${(result.metrics.phase1Only.precision * 100).toFixed(1)}%`);
  console.log(`    Recall:    ${(result.metrics.phase1Only.recall * 100).toFixed(1)}%`);
  console.log(`    F1:        ${(result.metrics.phase1Only.f1 * 100).toFixed(1)}%`);
  console.log("");
  console.log(`  Timing: ${result.timing.totalMs}ms | LLM Calls: ${result.timing.llmCalls} | Cost: $${result.timing.llmCostUsd.toFixed(4)}`);

  // Match-Details
  if (result.matchDetails.length > 0) {
    console.log("");
    console.log("  Match Details:");
    for (const m of result.matchDetails) {
      const gtStr = `[${m.groundTruth.type}] "${m.groundTruth.label}" (P${m.groundTruth.phase})`;
      if (m.matched) {
        const matchStr = m.typeMatch ? "EXACT" : "ALIAS";
        console.log(`    ${matchStr} ${gtStr} → [${m.matched.type}] "${m.matched.label}" (${m.matched.confidence.toFixed(2)})`);
      } else {
        console.log(`    MISS  ${gtStr} → (not detected)`);
      }
    }
  }

  if (result.errors.length > 0) {
    console.log("");
    console.log(`  Warnings: ${result.errors.length}`);
    for (const e of result.errors) {
      console.log(`    - ${e}`);
    }
  }
  printSeparator("─");
}

function printFinalReport(report: BenchmarkReport): void {
  console.log("\n");
  printSeparator("═");
  console.log("  BENCHMARK FINAL REPORT");
  console.log(`  Date: ${report.runDate}`);
  console.log(`  Model: ${report.config.model} (fallback: ${report.config.fallbackModel})`);
  printSeparator("═");

  // Pro-Website-Tabelle
  console.log("");
  console.log(
    padRight("  Website", 42) +
    padRight("Diff", 9) +
    padRight("Status", 10) +
    padRight("P", 7) +
    padRight("R", 7) +
    padRight("F1", 7) +
    padRight("Cost", 10),
  );
  console.log("  " + "─".repeat(88));

  for (const r of report.results) {
    const shortUrl = r.url.replace("https://", "").replace("http://", "").slice(0, 36);
    if (r.status !== "success") {
      console.log(
        padRight(`  ${shortUrl}`, 42) +
        padRight(r.difficulty, 9) +
        padRight(r.status.toUpperCase(), 10) +
        padRight("-", 7) +
        padRight("-", 7) +
        padRight("-", 7) +
        padRight("-", 10),
      );
    } else {
      console.log(
        padRight(`  ${shortUrl}`, 42) +
        padRight(r.difficulty, 9) +
        padRight("OK", 10) +
        padRight(`${(r.metrics.all.precision * 100).toFixed(0)}%`, 7) +
        padRight(`${(r.metrics.all.recall * 100).toFixed(0)}%`, 7) +
        padRight(`${(r.metrics.all.f1 * 100).toFixed(0)}%`, 7) +
        padRight(`$${r.timing.llmCostUsd.toFixed(4)}`, 10),
      );
    }
  }

  // Aggregate
  console.log("");
  printSeparator("─");
  console.log("  AGGREGATE (successful websites only):");
  console.log(`    Websites: ${report.aggregate.successful}/${report.aggregate.totalWebsites} (${report.aggregate.skipped} skipped)`);
  console.log("");
  console.log("    ALL ENDPOINTS:");
  console.log(`      Precision: ${(report.aggregate.allEndpoints.precision * 100).toFixed(1)}%`);
  console.log(`      Recall:    ${(report.aggregate.allEndpoints.recall * 100).toFixed(1)}%`);
  console.log(`      F1:        ${(report.aggregate.allEndpoints.f1 * 100).toFixed(1)}%`);
  console.log(`      TypeAcc:   ${(report.aggregate.allEndpoints.typeAccuracy * 100).toFixed(1)}%`);
  console.log("");
  console.log("    PHASE-1 ONLY:");
  console.log(`      Precision: ${(report.aggregate.phase1Endpoints.precision * 100).toFixed(1)}%`);
  console.log(`      Recall:    ${(report.aggregate.phase1Endpoints.recall * 100).toFixed(1)}%`);
  console.log(`      F1:        ${(report.aggregate.phase1Endpoints.f1 * 100).toFixed(1)}%`);
  console.log("");
  console.log(`    Total LLM Calls: ${report.aggregate.totalLlmCalls}`);
  console.log(`    Total LLM Cost:  $${report.aggregate.totalLlmCostUsd.toFixed(4)}`);
  console.log(`    Total Time:      ${(report.aggregate.totalTimeMs / 1000).toFixed(1)}s`);
  printSeparator("═");
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

// ============================================================================
// Main
// ============================================================================

export async function main(): Promise<BenchmarkReport> {
  // API-Key pruefen
  if (!envConfig.hasAnyApiKey) {
    throw new Error("No API key found. Set BALAGE_OPENAI_API_KEY or BALAGE_ANTHROPIC_API_KEY in .env.local");
  }

  const runStart = Date.now();
  const runDate = new Date().toISOString().slice(0, 10);

  log("Loading ground-truth files ...");
  const groundTruths = loadGroundTruths();
  log(`Loaded ${groundTruths.length} websites`);
  for (const gt of groundTruths) {
    log(`  ${gt.data.difficulty.padEnd(8)} ${gt.data.url} (${gt.data.endpoints.length} endpoints)`);
  }

  // Ein Browser fuer alle Websites
  log("Launching browser ...");
  const adapter = new BrowserAdapter({ headless: true });
  await adapter.launch();

  // Ein LLM-Client fuer alle Websites (geteiltes Cost-Tracking)
  const llmClient = createFallbackLLMClient({
    envConfig,
    maxCostUsd: 5.0, // Budget fuer 10 Websites
  });
  log(`Provider: ${envConfig.llmProvider} | Model: ${envConfig.llmModel} | Fallback: ${envConfig.llmFallbackModel}`);

  const results: BenchmarkResult[] = [];
  let prevCalls = 0;
  let prevCost = 0;

  for (let i = 0; i < groundTruths.length; i++) {
    const { file, data: gt } = groundTruths[i]!;
    printWebsiteHeader(i, groundTruths.length, gt);

    const siteStart = Date.now();
    const callsBefore = llmClient.summary().totalCalls;
    const costBefore = llmClient.totalCostUsd();

    let result: BenchmarkResult;

    try {
      // Timeout-Wrapper
      const pipelineResult = await Promise.race([
        runPipeline(adapter, llmClient, gt.url),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), WEBSITE_TIMEOUT_MS),
        ),
      ]);

      const siteTime = Date.now() - siteStart;
      const siteCalls = llmClient.summary().totalCalls - callsBefore;
      const siteCost = llmClient.totalCostUsd() - costBefore;

      // Ground-Truth Endpoints
      const gtAll = gt.endpoints;
      const gtPhase1 = gt.endpoints.filter((e) => e.phase === 1);
      const detected = pipelineResult.endpoints;

      // Matching + Metriken
      const { details } = computeMatches(gtAll, detected);
      const metricsAll = computeMetrics(gtAll, detected);
      const metricsPhase1 = computeMetrics(gtPhase1, detected);

      result = {
        url: gt.url,
        file: basename(file, ".json"),
        difficulty: gt.difficulty,
        status: "success",
        groundTruth: {
          total: gtAll.length,
          phase1: gtPhase1.length,
          types: [...new Set(gtAll.map((e) => e.type))],
        },
        detected: {
          total: detected.length,
          types: [...new Set(detected.map((e) => e.type))],
        },
        metrics: { all: metricsAll, phase1Only: metricsPhase1 },
        timing: {
          totalMs: siteTime,
          llmCalls: siteCalls,
          llmCostUsd: round(siteCost),
        },
        errors: pipelineResult.errors,
        matchDetails: details,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg === "TIMEOUT";
      const isBlocked = /blocked|forbidden|403|captcha|challenge/i.test(msg);
      const siteTime = Date.now() - siteStart;
      const siteCalls = llmClient.summary().totalCalls - callsBefore;
      const siteCost = llmClient.totalCostUsd() - costBefore;

      result = {
        url: gt.url,
        file: basename(file, ".json"),
        difficulty: gt.difficulty,
        status: isTimeout ? "timeout" : isBlocked ? "blocked" : "error",
        groundTruth: {
          total: gt.endpoints.length,
          phase1: gt.endpoints.filter((e) => e.phase === 1).length,
          types: [...new Set(gt.endpoints.map((e) => e.type))],
        },
        detected: { total: 0, types: [] },
        metrics: {
          all: { precision: 0, recall: 0, f1: 0, typeAccuracy: 0 },
          phase1Only: { precision: 0, recall: 0, f1: 0, typeAccuracy: 0 },
        },
        timing: { totalMs: siteTime, llmCalls: siteCalls, llmCostUsd: round(siteCost) },
        errors: [msg],
        matchDetails: [],
      };

      log(`  ERROR: ${result.status.toUpperCase()} — ${msg}`);
    }

    results.push(result);
    printWebsiteResult(result);

    // Inkrementell speichern: nach jeder Website Zwischenergebnis sichern
    const partialReport = buildReport(results, runDate, runStart, llmClient);
    const outPath = join(import.meta.dirname!, `benchmark-results-${runDate}.json`);
    writeFileSync(outPath, JSON.stringify(partialReport, null, 2), "utf-8");
    log(`  (partial results saved — ${results.length}/${groundTruths.length} sites)`);

    prevCalls = llmClient.summary().totalCalls;
    prevCost = llmClient.totalCostUsd();
  }

  // Browser herunterfahren
  log("Shutting down browser ...");
  await adapter.shutdown();

  const report = buildReport(results, runDate, runStart, llmClient);
  printFinalReport(report);

  // Finales JSON speichern
  const outPath = join(import.meta.dirname!, `benchmark-results-${runDate}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
  log(`Results saved to ${outPath}`);

  return report;
}

function buildReport(
  results: BenchmarkResult[],
  runDate: string,
  runStart: number,
  llmClient: FallbackLLMClient,
): BenchmarkReport {
  const successResults = results.filter((r) => r.status === "success");
  const aggAll = aggregateMetrics(successResults, "all");
  const aggPhase1 = aggregateMetrics(successResults, "phase1Only");
  const totalTime = Date.now() - runStart;
  const finalSummary = llmClient.summary();

  return {
    runDate,
    config: {
      provider: envConfig.llmProvider,
      model: envConfig.llmModel,
      fallbackModel: envConfig.llmFallbackModel,
    },
    results,
    aggregate: {
      totalWebsites: results.length,
      successful: successResults.length,
      skipped: results.length - successResults.length,
      allEndpoints: aggAll,
      phase1Endpoints: aggPhase1,
      totalLlmCalls: finalSummary.totalCalls,
      totalLlmCostUsd: round(finalSummary.totalCostUsd),
      totalTimeMs: totalTime,
    },
  };
}

function aggregateMetrics(
  results: BenchmarkResult[],
  key: "all" | "phase1Only",
): BenchmarkMetrics {
  if (results.length === 0) {
    return { precision: 0, recall: 0, f1: 0, typeAccuracy: 0 };
  }

  // Macro-Average: Durchschnitt der Metriken ueber alle Websites
  let pSum = 0;
  let rSum = 0;
  let f1Sum = 0;
  let taSum = 0;
  let count = 0;

  for (const r of results) {
    const m = r.metrics[key];
    // Nur Websites mit relevanten Daten zaehlen
    const hasData = key === "all" ? r.groundTruth.total > 0 : r.groundTruth.phase1 > 0;
    if (hasData) {
      pSum += m.precision;
      rSum += m.recall;
      f1Sum += m.f1;
      taSum += m.typeAccuracy;
      count++;
    }
  }

  if (count === 0) {
    return { precision: 0, recall: 0, f1: 0, typeAccuracy: 0 };
  }

  return {
    precision: round(pSum / count),
    recall: round(rSum / count),
    f1: round(f1Sum / count),
    typeAccuracy: round(taSum / count),
  };
}

// Entry point for direct execution (npx tsx benchmark-runner.ts)
if (process.argv[1]?.endsWith("benchmark-runner.ts")) {
  main().catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  });
}

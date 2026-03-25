/**
 * Real-World Benchmark Runner
 *
 * Fuehrt die volle BALAGE-Pipeline gegen 10 echte Websites aus,
 * vergleicht mit Ground-Truth und berechnet Precision/Recall/F1.
 *
 * Ausfuehrung: npm run benchmark:real
 * Voraussetzung: API-Key in .env.local
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
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
import { CachedLLMClient } from "../../src/semantic/cached-llm-client.js";
import { envConfig } from "../../src/config/env.js";
import type { LLMClient } from "../../src/semantic/llm-client.js";
import type { Endpoint, UISegment } from "../../shared_interfaces.js";

// ============================================================================
// Types
// ============================================================================

export interface GroundTruthEndpoint {
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
  nearMisses?: NearMiss[];
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

const WEBSITE_TIMEOUT_MS: Record<string, number> = {
  easy: 120_000,
  medium: 180_000,
  hard: 180_000,
  extreme: 240_000,
};

const DEFAULT_TIMEOUT_MS = 120_000;

// Typ-Aliase: welche Ground-Truth-Typen zu welchen Detected-Typen passen
// TYPE_ALIASES: Welche GT-Typen zu welchen Detected-Typen passen
// "form" bleibt als Alias — auth detected als form ist ein Alias-Match, kein Miss
const TYPE_ALIASES: Record<string, string[]> = {
  auth: ["auth", "form"],
  form: ["form", "search", "consent"],
  navigation: ["navigation", "content", "settings"],
  checkout: ["checkout", "commerce"],
  search: ["search", "form"],
  support: ["support", "navigation"],
  content: ["content", "navigation"],
  consent: ["consent", "form", "settings"],
  commerce: ["commerce", "checkout"],
  settings: ["settings", "navigation", "consent"],
};

// Multi-run mode — activated via BALAGE_RUNS=N (N >= 2)
const BENCHMARK_RUNS = parseInt(process.env.BALAGE_RUNS ?? "1", 10);

// Diagnostic flags — activated via environment variables
const DIAG_ENABLED = process.env.BALAGE_DIAG === "1";
const SAVE_SNAPSHOTS = process.env.BALAGE_SAVE_SNAPSHOTS === "1";
const SNAPSHOTS_DIR = join(import.meta.dirname!, "snapshots");

// LLM response cache — activated via BALAGE_LLM_CACHE=1
const LLM_CACHE_ENABLED = process.env.BALAGE_LLM_CACHE === "1";
const LLM_CACHE_DIR = join(import.meta.dirname!, ".llm-cache");

// Fixture mode — opt-in via BALAGE_FIXTURE_MODE=1
// Loads HTML from local files instead of live fetching via Playwright
const FIXTURE_MODE = process.env.BALAGE_FIXTURE_MODE === "1";
const FIXTURES_DIR = join(import.meta.dirname!, "fixtures");

// Label-Patterns fuer semantische Zuordnung
const AUTH_LABEL_PATTERN = /login|sign.?in|auth|password|credential/i;
const SEARCH_LABEL_PATTERN = /search|find|query|lookup/i;

// Schluesseltypen fuer Segment-Filterung (aus den bestehenden Tests)
const KEY_SEGMENT_TYPES = ["form", "navigation", "auth", "search", "checkout", "table", "content", "list"];

// ============================================================================
// Matching Logic
// ============================================================================

/** Jaccard-Similarity zwischen GT-Label und Detected-Label (Wort-basiert) */
function matchLabelSimilarity(gtLabel: string, detLabel: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const wordsA = new Set(normalize(gtLabel));
  const wordsB = new Set(normalize(detLabel));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  return intersection / new Set([...wordsA, ...wordsB]).size;
}

export function typesMatch(gtType: string, detectedType: string): boolean {
  if (gtType === detectedType) return true;
  const aliases = TYPE_ALIASES[gtType];
  return aliases ? aliases.includes(detectedType) : false;
}

/** Label-basierte semantische Zuordnung als Fallback wenn Type-Aliases nicht greifen */
export function labelBasedMatch(gtType: string, detType: string, detLabel: string): boolean {
  const label = detLabel.toLowerCase();
  // detected "form" mit Auth-Keywords → matcht GT "auth"
  if (detType === "form" && gtType === "auth" && AUTH_LABEL_PATTERN.test(label)) return true;
  // detected "form" mit Search-Keywords → matcht GT "search"
  if (detType === "form" && gtType === "search" && SEARCH_LABEL_PATTERN.test(label)) return true;
  return false;
}

/** FIX 5: Near-miss info fuer unmatched GT endpoints */
interface NearMiss {
  detectedType: string;
  detectedLabel: string;
  confidence: number;
  reason: string;
}

export function findNearMisses(
  gt: GroundTruthEndpoint,
  detected: Endpoint[],
  usedIndices: Set<number>,
): NearMiss[] {
  const misses: Array<NearMiss & { score: number }> = [];
  for (let i = 0; i < detected.length; i++) {
    const det = detected[i]!;
    let reason = "";
    let score = 0;
    // Type-Match aber bereits vergeben
    if (usedIndices.has(i) && typesMatch(gt.type, det.type)) {
      reason = "type-match but already used";
      score = 0.5 + det.confidence * 0.3;
    }
    // Nicht-matchender Type
    else if (!typesMatch(gt.type, det.type) && !usedIndices.has(i)) {
      reason = `type-mismatch (gt=${gt.type}, det=${det.type})`;
      score = det.confidence * 0.3;
    }
    // Bereits verwendet, anderer Type
    else if (usedIndices.has(i)) {
      reason = "already matched to different GT";
      score = 0.2;
    }
    if (reason) {
      misses.push({
        detectedType: det.type,
        detectedLabel: det.label.primary,
        confidence: det.confidence,
        reason,
        score,
      });
    }
  }
  misses.sort((a, b) => b.score - a.score);
  return misses.slice(0, 3).map(({ score: _s, ...rest }) => rest);
}

export function computeMatches(
  groundTruth: GroundTruthEndpoint[],
  detected: Endpoint[],
): { matched: number; details: MatchDetail[] } {
  const usedDetected = new Set<number>();
  const details: MatchDetail[] = [];
  let matched = 0;

  for (const gt of groundTruth) {
    let bestIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < detected.length; i++) {
      if (usedDetected.has(i)) continue;
      const det = detected[i]!;

      const isExact = gt.type === det.type;
      const isAlias = !isExact && typesMatch(gt.type, det.type);
      const isSemantic = !isExact && !isAlias && labelBasedMatch(gt.type, det.type, det.label.primary);

      if (!isExact && !isAlias && !isSemantic) continue;

      // Scoring: type-priority (exact>alias>semantic), dann label-similarity, dann confidence
      const priority = isExact ? 2 : isAlias ? 1 : 0;
      const labelSim = matchLabelSimilarity(gt.label, det.label.primary);
      const score = priority * 1000 + labelSim * 10 + det.confidence;
      if (score > bestScore) {
        bestIdx = i;
        bestScore = score;
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
      // FIX 5: Near-miss Analyse fuer verpasste Endpoints
      const nearMisses = findNearMisses(gt, detected, usedDetected);
      details.push({
        groundTruth: { type: gt.type, label: gt.label, phase: gt.phase },
        matched: null,
        typeMatch: false,
        nearMisses,
      });
    }
  }

  return { matched, details };
}

export function computeMetrics(
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

/**
 * Phase-1-spezifische Metrik-Berechnung.
 *
 * Das Problem mit computeMetrics(gtPhase1, allDetected) ist, dass Precision
 * = matched / allDetected.length berechnet wird. Wenn 2 Phase-1-Matches in
 * 10 detected Endpoints stecken, ist Precision = 0.2 — obwohl die Pipeline
 * die Phase-1-Endpoints korrekt erkannt hat.
 *
 * Diese Funktion filtert den detected-Pool auf Endpoints, deren Typ
 * potentiell zu einem Phase-1-GT-Typ passt (via TYPE_ALIASES), und
 * berechnet Precision nur gegen diese relevante Teilmenge.
 */
export function computePhase1Metrics(
  phase1GroundTruth: GroundTruthEndpoint[],
  allDetected: Endpoint[],
): BenchmarkMetrics {
  if (phase1GroundTruth.length === 0) {
    return { precision: 0, recall: 0, f1: 0, typeAccuracy: 0 };
  }

  // Sammle alle GT-Typen die in Phase-1 vorkommen
  const phase1GtTypes = new Set(phase1GroundTruth.map((e) => e.type));

  // Reverse-Lookup: Welche detected-Typen koennten zu einem Phase-1-GT-Typ matchen?
  // Ein detected Typ D ist Phase-1-relevant, wenn es einen GT-Typ G gibt so dass
  // typesMatch(G, D) === true.
  const phase1RelevantDetectedTypes = new Set<string>();
  for (const gtType of phase1GtTypes) {
    // Der GT-Typ selbst
    phase1RelevantDetectedTypes.add(gtType);
    // Alle Aliases fuer diesen GT-Typ
    const aliases = TYPE_ALIASES[gtType];
    if (aliases) {
      for (const a of aliases) {
        phase1RelevantDetectedTypes.add(a);
      }
    }
  }

  // Filtere detected auf Phase-1-relevante Typen
  const phase1Detected = allDetected.filter((e) =>
    phase1RelevantDetectedTypes.has(e.type),
  );

  if (phase1Detected.length === 0) {
    return { precision: 0, recall: 0, f1: 0, typeAccuracy: 0 };
  }

  // Matche Phase-1 GT nur gegen Phase-1-relevante detected Endpoints
  const { matched, details } = computeMatches(phase1GroundTruth, phase1Detected);
  const exactTypeMatches = details.filter((d) => d.matched && d.typeMatch).length;

  const precision = matched / phase1Detected.length;
  const recall = matched / phase1GroundTruth.length;
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
// Diagnostic Helpers
// ============================================================================

function diag(msg: string): void {
  if (!DIAG_ENABLED) return;
  console.log(`[DIAG] ${msg}`);
}

/** Slug fuer Snapshot-Dateinamen: "gitlab.com/users/sign_in" → "gitlab-users-sign_in" */
function urlToSlug(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\.[a-z]{2,4}\//g, "-")
    .replace(/\.[a-z]{2,4}$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function saveSnapshot(slug: string, html: string): void {
  if (!SAVE_SNAPSHOTS) return;
  if (!existsSync(SNAPSHOTS_DIR)) {
    mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
  const path = join(SNAPSHOTS_DIR, `${slug}.html`);
  writeFileSync(path, html, "utf-8");
  log(`    [SNAPSHOT] Saved ${html.length} bytes → ${path}`);
}

// ============================================================================
// Fixture Helpers
// ============================================================================

/** Laedt eine HTML-Fixture-Datei fuer den Fixture-Modus. Gibt null zurueck wenn nicht vorhanden. */
function loadFixture(file: string): string | null {
  const fixturePath = join(FIXTURES_DIR, `${file}.html`);
  if (!existsSync(fixturePath)) return null;
  return readFileSync(fixturePath, "utf-8");
}

/** Loggt Fixture-Modus-Status beim Start: verfuegbare und fehlende Fixtures */
function logFixtureStatus(groundTruthFiles: string[]): void {
  if (!FIXTURE_MODE) return;

  log("[FIXTURE MODE] Loading HTML from local fixtures");
  log(`[FIXTURE MODE] Fixtures directory: ${FIXTURES_DIR}`);

  const available: string[] = [];
  const missing: string[] = [];

  for (const file of groundTruthFiles) {
    const fixturePath = join(FIXTURES_DIR, `${file}.html`);
    if (existsSync(fixturePath)) {
      available.push(`${file}.html`);
    } else {
      missing.push(`${file}.html`);
    }
  }

  if (available.length > 0) {
    log(`[FIXTURE MODE] Available fixtures: ${available.join(", ")} (${available.length} of ${groundTruthFiles.length})`);
  } else {
    log(`[FIXTURE MODE] No fixtures found — all sites will fall back to live fetch`);
  }

  if (missing.length > 0) {
    log(`[FIXTURE MODE] Missing fixtures (will fall back to live): ${missing.join(", ")}`);
  }
}

/** Log die komplette Filter-Kaskade fuer eine Site */
function logFilterDiagnostics(
  siteSlug: string,
  rawSegments: UISegment[],
  afterConfFilter: UISegment[],
  afterTopPerType: UISegment[],
  afterCap: UISegment[],
): void {
  if (!DIAG_ENABLED) return;

  diag(`Site: ${siteSlug}`);

  // Stage 0: Raw
  diag(`  Stage 0 (raw segmentation): ${rawSegments.length} segments`);
  for (const s of rawSegments) {
    const nodeInteractive = s.nodes.length > 0 ? s.nodes.some(n => n.isInteractive) : false;
    const textPreview = s.nodes
      .map(n => (n.textContent ?? "").trim())
      .filter(t => t.length > 0)
      .join(" ")
      .slice(0, 60);
    diag(
      `    - ${s.id.slice(0, 8)}: type=${s.type}, confidence=${s.confidence.toFixed(2)}, ` +
      `interactive=${s.interactiveElementCount}, isInteractive=${String(nodeInteractive)}, ` +
      `text="${textPreview}"`,
    );
  }

  // Stage 1: Confidence + interactivity filter
  const rejectedStage1 = rawSegments.filter(s => !afterConfFilter.includes(s));
  diag(`  Stage 1 (confidence+interactivity filter): ${rawSegments.length} → ${afterConfFilter.length} segments`);
  for (const s of rejectedStage1) {
    const reasons: string[] = [];
    if (s.confidence < 0.50) reasons.push(`confidence=${s.confidence.toFixed(2)} < 0.50`);
    if (s.interactiveElementCount < 1) reasons.push(`interactive=${s.interactiveElementCount} < 1`);
    if (!KEY_SEGMENT_TYPES.includes(s.type)) reasons.push(`type=${s.type} not in KEY_TYPES`);
    const nodeInteractive = s.nodes.some(n => n.isInteractive);
    reasons.push(`node.isInteractive=${String(nodeInteractive)}`);
    diag(`    REJECTED: ${s.id.slice(0, 8)} (${reasons.join(", ")})`);
  }
  for (const s of afterConfFilter) {
    let keepReason = "PASS";
    if (s.type === "form") keepReason = "ALWAYS_KEEP: type=form";
    else if (s.type === "navigation" && s.confidence >= 0.30) keepReason = `LOW_CONF_KEEP: type=navigation, confidence=${s.confidence.toFixed(2)} >= 0.30`;
    else if (s.confidence >= 0.50 && KEY_SEGMENT_TYPES.includes(s.type)) keepReason = `HIGH_CONF: confidence=${s.confidence.toFixed(2)} >= 0.50`;
    else keepReason = `OTHER: interactive=${s.interactiveElementCount}, type=${s.type}`;
    diag(`    KEPT: ${s.id.slice(0, 8)} (${keepReason})`);
  }

  // Stage 2: Top-N per type
  const rejectedStage2 = afterConfFilter.filter(s => !afterTopPerType.includes(s));
  diag(`  Stage 2 (top-N per type): ${afterConfFilter.length} → ${afterTopPerType.length} segments`);
  for (const s of rejectedStage2) {
    diag(`    REJECTED: ${s.id.slice(0, 8)} (exceeded MAX_PER_TYPE=${3} for type=${s.type})`);
  }

  // Stage 3: Segment cap
  const rejectedStage3 = afterTopPerType.filter(s => !afterCap.includes(s));
  diag(`  Stage 3 (segment cap): ${afterTopPerType.length} → ${afterCap.length} segments`);
  for (const s of rejectedStage3) {
    diag(`    REJECTED: ${s.id.slice(0, 8)} (exceeded segment cap)`);
  }

  diag(`  RESULT: ${afterCap.length} segments passed to LLM`);
}

// ============================================================================
// Pipeline
// ============================================================================

async function runPipeline(
  adapter: BrowserAdapter,
  llmClient: FallbackLLMClient,
  effectiveLlmClient: LLMClient,
  url: string,
  file: string,
): Promise<{ endpoints: Endpoint[]; errors: string[] }> {
  const contextId = await adapter.newContext();
  const endpoints: Endpoint[] = [];
  const errors: string[] = [];

  try {
    const page = await adapter.getPage(contextId);

    // 1. Navigation — fixture-first, live-fetch fallback
    const fixtureHtml = loadFixture(file);
    if (fixtureHtml) {
      log(`  [1/7] [FIXTURE] Loading ${file}.html (${fixtureHtml.length} bytes)`);
      await page.setContent(fixtureHtml, { waitUntil: "domcontentloaded" });
    } else if (FIXTURE_MODE) {
      log(`  [1/7] [FIXTURE] No fixture found for ${file} — SKIPPING (fixture-only mode)`);
      return { endpoints, errors: [`No fixture for ${file}`] };
    } else {
      log(`  [1/7] Navigating to ${url} ...`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {
        log("    (networkidle timeout — continuing)");
      });
    }
    log(`    URL: ${page.url()}`);
    log(`    Title: ${await page.title()}`);

    // 1b. HTML Snapshot Capture (diagnostic)
    const siteSlug = urlToSlug(url);
    if (SAVE_SNAPSHOTS || DIAG_ENABLED) {
      try {
        const htmlContent = await page.content();
        saveSnapshot(siteSlug, htmlContent);

        // Automatisch als Fixture speichern wenn SAVE_SNAPSHOTS aktiv und Live-Modus
        if (SAVE_SNAPSHOTS && !FIXTURE_MODE) {
          const fixturePath = join(FIXTURES_DIR, `${file}.html`);
          if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });
          writeFileSync(fixturePath, htmlContent, "utf-8");
          log(`    [FIXTURE] Updated fixture: ${fixturePath}`);
        }
      } catch (snapErr) {
        const snapMsg = snapErr instanceof Error ? snapErr.message : String(snapErr);
        log(`    [SNAPSHOT] Failed: ${snapMsg}`);
      }
    }

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
    const MIN_SEGMENT_CONFIDENCE = 0.35;
    const MIN_INTERACTIVE_FOR_LOW_CONF = 1;
    // FIX 1: Forms und Navigation weniger aggressiv filtern — fast immer echte Endpoints
    const ALWAYS_KEEP_TYPES = new Set(["form"]);
    const LOW_CONF_KEEP_TYPES = new Set(["navigation"]);
    const LOW_CONF_THRESHOLD = 0.30;
    const withInteractive = segments.filter(
      (s: UISegment) => {
        // Forms immer behalten (unabhaengig von Confidence/interactiveCount)
        if (ALWAYS_KEEP_TYPES.has(s.type)) return true;
        // Navigation mit Mindest-Confidence behalten
        if (LOW_CONF_KEEP_TYPES.has(s.type) && s.confidence >= LOW_CONF_THRESHOLD) return true;
        // Hohe Confidence-Segmente immer behalten
        if (s.confidence >= MIN_SEGMENT_CONFIDENCE && KEY_SEGMENT_TYPES.includes(s.type)) return true;
        // Niedrige Confidence nur bei genuegend interaktiven Elementen
        if (s.confidence < MIN_SEGMENT_CONFIDENCE && s.interactiveElementCount < MIN_INTERACTIVE_FOR_LOW_CONF) return false;
        // Mindestens 1 interaktives Element oder Schluesseltyp
        return s.interactiveElementCount > 0 || KEY_SEGMENT_TYPES.includes(s.type);
      },
    );
    const MAX_PER_TYPE = 3;
    const byType = new Map<string, UISegment[]>();
    for (const s of withInteractive) {
      const list = byType.get(s.type) ?? [];
      list.push(s);
      byType.set(s.type, list);
    }
    const topPerType: UISegment[] = [];
    for (const [_type, segs] of byType) {
      segs.sort((a, b) => b.confidence - a.confidence || b.interactiveElementCount - a.interactiveElementCount);
      topPerType.push(...segs.slice(0, MAX_PER_TYPE));
    }
    const segmentCap = parsed.nodeCount > 400 ? 8 : 12;
    const relevantSegments = topPerType
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, segmentCap);
    log(`    Filtered: ${segments.length} → ${withInteractive.length} → ${relevantSegments.length}`);

    // Fallback: wenn alle Segmente weggefiltert wurden, Top-3 nach Confidence durchlassen
    if (relevantSegments.length === 0 && segments.length > 0) {
      const fallbackSegments = [...segments]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);
      log(`    [FALLBACK] 0 segments after filter, forcing top-${fallbackSegments.length} by confidence`);
      relevantSegments.push(...fallbackSegments);
    }

    // Diagnostic: detailliertes Filter-Logging pro Stage
    logFilterDiagnostics(siteSlug, segments, withInteractive, topPerType, relevantSegments);

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

    const genResult = await generateEndpoints(relevantSegments, context, {
      llmClient: effectiveLlmClient,
    });
    const candidates = genResult.candidates;
    log(`    Candidates from LLM: ${candidates.length}`);

    // 6. Candidate → Endpoint
    log("  [6/7] Converting candidates ...");
    for (const candidate of candidates) {
      try {
        const segment =
          segments.find((s: UISegment) => s.id === candidate.segmentId)
          ?? segments.find((s: UISegment) => s.type === candidate.type)
          ?? segments[0];
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
        const matchStr = m.typeMatch
          ? "EXACT"
          : typesMatch(m.groundTruth.type, m.matched.type)
            ? "ALIAS"
            : "SEMANTIC";
        console.log(`    ${matchStr} ${gtStr} → [${m.matched.type}] "${m.matched.label}" (${m.matched.confidence.toFixed(2)})`);
      } else {
        console.log(`    MISS  ${gtStr} → (not detected)`);
        // FIX 5: Near-miss Details anzeigen
        if (m.nearMisses && m.nearMisses.length > 0) {
          for (const nm of m.nearMisses) {
            console.log(`          near: [${nm.detectedType}] "${nm.detectedLabel}" (${nm.confidence.toFixed(2)}) — ${nm.reason}`);
          }
        }
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

  // Phase-1 MVP Metriken — prominenter Block
  console.log("");
  printSeparator("*", 72);
  console.log("  ★ PHASE-1 MVP METRICS (auth, form, checkout, support)");
  printSeparator("*", 72);
  const p1 = report.aggregate.phase1Endpoints;
  const p1Targets = { precision: 0.80, recall: 0.60, f1: 0.68 };
  const p1PStr = `${(p1.precision * 100).toFixed(1)}%`;
  const p1RStr = `${(p1.recall * 100).toFixed(1)}%`;
  const p1F1Str = `${(p1.f1 * 100).toFixed(1)}%`;
  const checkP = p1.precision >= p1Targets.precision ? "PASS" : "MISS";
  const checkR = p1.recall >= p1Targets.recall ? "PASS" : "MISS";
  const checkF1 = p1.f1 >= p1Targets.f1 ? "PASS" : "MISS";
  console.log(`    Precision: ${p1PStr.padEnd(8)} (target >=${(p1Targets.precision * 100).toFixed(0)}%)  [${checkP}]`);
  console.log(`    Recall:    ${p1RStr.padEnd(8)} (target >=${(p1Targets.recall * 100).toFixed(0)}%)  [${checkR}]`);
  console.log(`    F1:        ${p1F1Str.padEnd(8)} (target >=${(p1Targets.f1 * 100).toFixed(0)}%)  [${checkF1}]`);
  console.log(`    TypeAcc:   ${(p1.typeAccuracy * 100).toFixed(1)}%`);

  // Pro-Website Phase-1 Aufschluesselung
  console.log("");
  console.log("    Per-Website Phase-1:");
  for (const r of report.results) {
    if (r.status !== "success" || r.groundTruth.phase1 === 0) continue;
    const shortUrl = r.url.replace("https://", "").replace("http://", "").slice(0, 30);
    const m = r.metrics.phase1Only;
    console.log(
      `      ${padRight(shortUrl, 32)} P=${(m.precision * 100).toFixed(0).padStart(3)}%  R=${(m.recall * 100).toFixed(0).padStart(3)}%  F1=${(m.f1 * 100).toFixed(0).padStart(3)}%`,
    );
  }
  printSeparator("*", 72);

  // Aggregate
  console.log("");
  printSeparator("─");
  console.log("  AGGREGATE (successful websites only):");
  const extremeTimeouts = report.results.filter((r) => r.status === "timeout" && r.difficulty === "extreme").length;
  console.log(`    Websites: ${report.aggregate.successful}/${report.aggregate.totalWebsites} (${report.aggregate.skipped} skipped${extremeTimeouts > 0 ? `, ${extremeTimeouts} extreme-timeout` : ""})`);
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

/**
 * Einzelner Benchmark-Durchlauf — extrahiert aus main() fuer Multi-Run-Support.
 * Startet Browser + LLM-Client, iteriert ueber alle Ground-Truth-Sites,
 * gibt einen BenchmarkReport zurueck.
 */
async function runSingleBenchmark(): Promise<BenchmarkReport> {
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
  const llmClient = await createFallbackLLMClient({
    envConfig,
    maxCostUsd: 5.0, // Budget fuer 10 Websites
  });
  log(`Provider: ${envConfig.llmProvider} | Model: ${envConfig.llmModel} | Fallback: ${envConfig.llmFallbackModel}`);

  // Optional: LLM-Response-Cache wrappen (spart Kosten bei wiederholten Runs)
  // WICHTIG: Bei Multi-Run-Modus wird der Cache NICHT aktiviert,
  // da sonst alle Runs dasselbe Ergebnis liefern wuerden.
  let effectiveLlmClient: LLMClient = llmClient;
  if (LLM_CACHE_ENABLED && BENCHMARK_RUNS <= 1) {
    effectiveLlmClient = new CachedLLMClient(llmClient, {
      cacheDir: LLM_CACHE_DIR,
      enabled: true,
    });
    log("[LLM CACHE] Enabled — responses will be cached/served from disk");
    log(`[LLM CACHE] Cache dir: ${LLM_CACHE_DIR}`);
  } else if (LLM_CACHE_ENABLED && BENCHMARK_RUNS > 1) {
    log("[LLM CACHE] Disabled — multi-run mode requires fresh LLM responses per run");
  }

  // Fixture-Modus-Status loggen
  const groundTruthFileIds = groundTruths.map((gt) => basename(gt.file, ".json"));
  logFixtureStatus(groundTruthFileIds);

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
      const fileId = basename(file, ".json");
      const pipelineResult = await Promise.race([
        runPipeline(adapter, llmClient, effectiveLlmClient, gt.url, fileId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), WEBSITE_TIMEOUT_MS[gt.difficulty] ?? DEFAULT_TIMEOUT_MS),
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
      const metricsPhase1 = computePhase1Metrics(gtPhase1, detected);

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

  // LLM-Cache-Statistiken loggen
  if (LLM_CACHE_ENABLED && effectiveLlmClient instanceof CachedLLMClient) {
    const stats = effectiveLlmClient.getStats();
    log(`\n  LLM Cache: ${stats.hits} hits, ${stats.misses} misses (${(stats.hitRate * 100).toFixed(0)}% hit rate)`);
  }

  // Finales JSON speichern
  const outPath = join(import.meta.dirname!, `benchmark-results-${runDate}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
  log(`Results saved to ${outPath}`);

  return report;
}

// ============================================================================
// Multi-Run Statistics
// ============================================================================

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function formatStat(label: string, values: number[]): string {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const med = median(values);
  const sd = stddev(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    `  ${padRight(label, 13)}` +
    `Mean=${(mean * 100).toFixed(1)}%  ` +
    `Median=${(med * 100).toFixed(1)}%  ` +
    `Stddev=${(sd * 100).toFixed(1)}pp  ` +
    `Min=${(min * 100).toFixed(1)}%  ` +
    `Max=${(max * 100).toFixed(1)}%`
  );
}

function printMultiRunSummary(allReports: BenchmarkReport[]): void {
  const n = allReports.length;
  console.log("");
  console.log("=".repeat(72));
  console.log(`  MULTI-RUN SUMMARY (${n} runs)`);
  console.log("=".repeat(72));

  // Sammle aggregierte Metriken aller Runs
  const overallF1 = allReports.map((r) => r.aggregate.allEndpoints.f1);
  const overallP = allReports.map((r) => r.aggregate.allEndpoints.precision);
  const overallR = allReports.map((r) => r.aggregate.allEndpoints.recall);
  const phase1F1 = allReports.map((r) => r.aggregate.phase1Endpoints.f1);
  const phase1P = allReports.map((r) => r.aggregate.phase1Endpoints.precision);
  const phase1R = allReports.map((r) => r.aggregate.phase1Endpoints.recall);

  console.log(formatStat("Overall F1:", overallF1));
  console.log(formatStat("Precision:", overallP));
  console.log(formatStat("Recall:", overallR));
  console.log(formatStat("Phase-1 F1:", phase1F1));
  console.log(formatStat("Phase-1 P:", phase1P));
  console.log(formatStat("Phase-1 R:", phase1R));

  // Kosten-Zusammenfassung
  const totalCost = allReports.reduce((s, r) => s + r.aggregate.totalLlmCostUsd, 0);
  const totalCalls = allReports.reduce((s, r) => s + r.aggregate.totalLlmCalls, 0);
  const totalTimeMs = allReports.reduce((s, r) => s + r.aggregate.totalTimeMs, 0);
  console.log("");
  console.log(`  Total LLM Calls: ${totalCalls} (${(totalCalls / n).toFixed(0)} avg/run)`);
  console.log(`  Total LLM Cost:  $${totalCost.toFixed(4)} ($${(totalCost / n).toFixed(4)} avg/run)`);
  console.log(`  Total Time:      ${(totalTimeMs / 1000).toFixed(1)}s (${(totalTimeMs / n / 1000).toFixed(1)}s avg/run)`);

  // Per-Site Stability: F1-Range pro URL ueber alle Runs
  console.log("");
  console.log("  Per-Site Stability:");

  // Sammle alle URLs (aus dem ersten Report als Referenz)
  const siteUrls = allReports[0]!.results.map((r) => r.url);
  for (const url of siteUrls) {
    const siteF1s: number[] = [];
    for (const report of allReports) {
      const siteResult = report.results.find((r) => r.url === url);
      if (siteResult && siteResult.status === "success") {
        siteF1s.push(siteResult.metrics.all.f1);
      }
    }

    const shortUrl = url.replace("https://", "").replace("http://", "").slice(0, 36);

    if (siteF1s.length === 0) {
      console.log(`    ${padRight(shortUrl, 38)} F1: n/a (no successful runs)`);
      continue;
    }

    const min = Math.min(...siteF1s);
    const max = Math.max(...siteF1s);
    const range = max - min;
    // Stabilitaetsbewertung: <5pp Schwankung = stabil, sonst instabil
    const stability = range < 0.05 ? "stable" : "unstable";
    const meanF1 = siteF1s.reduce((a, b) => a + b, 0) / siteF1s.length;
    console.log(
      `    ${padRight(shortUrl, 38)} ` +
      `F1: ${(min * 100).toFixed(0)}%-${(max * 100).toFixed(0)}%  ` +
      `mean=${(meanF1 * 100).toFixed(1)}%  ` +
      `(${stability})`,
    );
  }

  console.log("=".repeat(72));
}

// ============================================================================
// Main — Entry Point (Multi-Run oder Single-Run)
// ============================================================================

export async function main(): Promise<BenchmarkReport> {
  // API-Key pruefen
  if (!envConfig.hasAnyApiKey) {
    throw new Error("No API key found. Set BALAGE_OPENAI_API_KEY or BALAGE_ANTHROPIC_API_KEY in .env.local");
  }

  if (BENCHMARK_RUNS > 1) {
    log(`\n  MULTI-RUN MODE: ${BENCHMARK_RUNS} runs`);
    if (LLM_CACHE_ENABLED) {
      log("  WARNING: LLM cache will be disabled for multi-run mode");
    }

    const allReports: BenchmarkReport[] = [];
    for (let run = 1; run <= BENCHMARK_RUNS; run++) {
      console.log(`\n${"=".repeat(72)}`);
      console.log(`  RUN ${run}/${BENCHMARK_RUNS}`);
      console.log(`${"=".repeat(72)}\n`);
      const report = await runSingleBenchmark();
      allReports.push(report);
    }

    printMultiRunSummary(allReports);
    return allReports[allReports.length - 1]!;
  }

  return runSingleBenchmark();
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

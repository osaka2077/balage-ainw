/**
 * BALAGE Baseline — Runner
 *
 * Durchlaeuft denselben Corpus wie die Benchmark Suite,
 * erstellt Screenshots, analysiert sie per Vision, und berechnet Metriken
 * im identischen BenchmarkSummary-Format.
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "../observability/index.js";
import { ScreenshotCapturer } from "./screenshot-capturer.js";
import { VisionAnalyzer, MockVisionAnalyzer } from "./vision-analyzer.js";
import { BaselineRunnerError } from "./errors.js";
import type {
  BaselineConfig,
  BaselineRun,
  BaselineProgress,
  BenchmarkSummary,
  BenchmarkComparison,
  FixtureResult,
  CorpusEntry,
  CorpusCategory,
  DetectedEndpoint,
  GroundTruthEndpoint,
  CalibrationBucket,
} from "./types.js";

const logger = createLogger({ name: "baseline:runner" });

// ============================================================================
// Built-in Corpus
// ============================================================================

const BUILT_IN_CORPUS: CorpusEntry[] = [
  {
    id: "ecommerce-checkout-001",
    name: "E-Commerce Checkout",
    category: "ecommerce",
    html: `<html><body>
      <form id="checkout">
        <h2>Checkout</h2>
        <input type="text" name="name" placeholder="Full Name" required />
        <input type="email" name="email" placeholder="Email" required />
        <input type="text" name="card" placeholder="Card Number" required />
        <input type="hidden" name="_csrf" value="abc123" />
        <button type="submit">Complete Purchase</button>
      </form>
      <a href="/cart">Back to Cart</a>
    </body></html>`,
    url: "https://example.com/checkout",
    groundTruth: [
      { id: "gt-001", type: "checkout", label: "Checkout Form", isVisible: true, riskLevel: "high", affordances: ["fill", "submit"] },
      { id: "gt-002", type: "form", label: "Name Input", isVisible: true, riskLevel: "medium", affordances: ["fill"] },
      { id: "gt-003", type: "form", label: "Email Input", isVisible: true, riskLevel: "medium", affordances: ["fill"] },
      { id: "gt-004", type: "form", label: "Card Input", isVisible: true, riskLevel: "high", affordances: ["fill"] },
      { id: "gt-005", type: "form", label: "CSRF Token", isVisible: false, riskLevel: "low", affordances: [] },
      { id: "gt-006", type: "commerce", label: "Complete Purchase Button", isVisible: true, riskLevel: "high", affordances: ["click", "submit"] },
      { id: "gt-007", type: "navigation", label: "Back to Cart", isVisible: true, riskLevel: "low", affordances: ["click"] },
    ],
  },
  {
    id: "saas-login-001",
    name: "SaaS Login",
    category: "saas",
    html: `<html><body>
      <form id="login">
        <h2>Sign In</h2>
        <input type="email" name="email" placeholder="Email" required />
        <input type="password" name="password" placeholder="Password" required />
        <button type="submit">Sign In</button>
        <a href="/forgot-password">Forgot Password?</a>
      </form>
    </body></html>`,
    url: "https://app.example.com/login",
    groundTruth: [
      { id: "gt-010", type: "auth", label: "Login Form", isVisible: true, riskLevel: "high", affordances: ["fill", "submit"] },
      { id: "gt-011", type: "form", label: "Email Input", isVisible: true, riskLevel: "medium", affordances: ["fill"] },
      { id: "gt-012", type: "form", label: "Password Input", isVisible: true, riskLevel: "high", affordances: ["fill"] },
      { id: "gt-013", type: "auth", label: "Sign In Button", isVisible: true, riskLevel: "high", affordances: ["click", "submit"] },
      { id: "gt-014", type: "navigation", label: "Forgot Password Link", isVisible: true, riskLevel: "low", affordances: ["click"] },
    ],
  },
  {
    id: "consent-banner-001",
    name: "Cookie Consent Banner",
    category: "media",
    html: `<html><body>
      <div id="consent-banner" role="dialog">
        <p>We use cookies to improve your experience.</p>
        <button id="accept">Accept All</button>
        <button id="reject">Reject All</button>
        <a href="/cookie-settings" style="font-size: 10px">Cookie Settings</a>
      </div>
      <main><h1>Welcome</h1><p>Main content here.</p></main>
    </body></html>`,
    url: "https://news.example.com/",
    groundTruth: [
      { id: "gt-020", type: "consent", label: "Cookie Consent Banner", isVisible: true, riskLevel: "medium", affordances: ["click"] },
      { id: "gt-021", type: "consent", label: "Accept All Button", isVisible: true, riskLevel: "medium", affordances: ["click"] },
      { id: "gt-022", type: "consent", label: "Reject All Button", isVisible: true, riskLevel: "low", affordances: ["click"] },
      { id: "gt-023", type: "settings", label: "Cookie Settings Link", isVisible: true, riskLevel: "low", affordances: ["click"] },
    ],
  },
];

// Mock-Antworten: absichtlich ungenauer als BALAGE
function getBuiltInMockResponses(): Map<string, DetectedEndpoint[]> {
  const responses = new Map<string, DetectedEndpoint[]>();

  // Ecommerce: Erkennt 6/7 GT, 1 FP — verpasst hidden CSRF Token
  responses.set("ecommerce-checkout-001", [
    { type: "checkout", label: "Checkout Form", confidence: 0.9, riskLevel: "high", affordances: ["fill", "submit"] },
    { type: "form", label: "Name Input", confidence: 0.8, riskLevel: "medium", affordances: ["fill"] },
    { type: "form", label: "Email Input", confidence: 0.85, riskLevel: "medium", affordances: ["fill"] },
    { type: "form", label: "Card Input", confidence: 0.75, riskLevel: "high", affordances: ["fill"] },
    { type: "commerce", label: "Purchase Button", confidence: 0.88, riskLevel: "high", affordances: ["click"] },
    { type: "navigation", label: "Back Link", confidence: 0.7, riskLevel: "low", affordances: ["click"] },
    // FALSE POSITIVE — dekoratives Element als Button erkannt
    { type: "navigation", label: "Cart Icon", confidence: 0.55, riskLevel: "low", affordances: ["click"] },
  ]);

  // SaaS: Erkennt 4/5 GT, 1 FP — verpasst Forgot Password Link
  responses.set("saas-login-001", [
    { type: "auth", label: "Login Form", confidence: 0.92, riskLevel: "high", affordances: ["fill", "submit"] },
    { type: "form", label: "Email Field", confidence: 0.88, riskLevel: "medium", affordances: ["fill"] },
    { type: "form", label: "Password Field", confidence: 0.85, riskLevel: "high", affordances: ["fill"] },
    { type: "auth", label: "Sign In Button", confidence: 0.9, riskLevel: "high", affordances: ["click"] },
    // FALSE POSITIVE — Logo als Link erkannt
    { type: "navigation", label: "Company Logo", confidence: 0.45, riskLevel: "low", affordances: ["click"] },
  ]);

  // Consent: Erkennt 3/4 GT, 0 FP — verpasst kleinen Cookie Settings Link
  responses.set("consent-banner-001", [
    { type: "consent", label: "Cookie Banner", confidence: 0.9, riskLevel: "medium", affordances: ["click"] },
    { type: "consent", label: "Accept Button", confidence: 0.95, riskLevel: "medium", affordances: ["click"] },
    { type: "consent", label: "Reject Button", confidence: 0.88, riskLevel: "low", affordances: ["click"] },
  ]);

  return responses;
}

// ============================================================================
// Metriken-Berechnung
// ============================================================================

function labelSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 1.0;
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8;

  const aWords = new Set(aLower.split(/\s+/));
  const bWords = new Set(bLower.split(/\s+/));
  const overlap = [...aWords].filter((w) => bWords.has(w)).length;
  return overlap / Math.max(aWords.size, bWords.size);
}

export function matchEndpoints(
  detected: DetectedEndpoint[],
  groundTruth: GroundTruthEndpoint[],
): { matched: DetectedEndpoint[]; truePositives: number; falsePositives: number; falseNegatives: number } {
  const unmatchedGT = new Set(groundTruth.map((_, i) => i));
  const resultDetected: DetectedEndpoint[] = [];

  for (const det of detected) {
    let bestMatch = -1;
    let bestScore = 0;

    for (const gtIdx of unmatchedGT) {
      const gt = groundTruth[gtIdx];
      if (!gt || det.type !== gt.type) continue;

      const score = labelSimilarity(det.label, gt.label);
      if (score > bestScore && score >= 0.3) {
        bestScore = score;
        bestMatch = gtIdx;
      }
    }

    if (bestMatch >= 0) {
      unmatchedGT.delete(bestMatch);
      const matchedGt = groundTruth[bestMatch];
      resultDetected.push({ ...det, matchedGroundTruthId: matchedGt?.id });
    } else {
      resultDetected.push({ ...det });
    }
  }

  const truePositives = resultDetected.filter((d) => d.matchedGroundTruthId).length;
  return {
    matched: resultDetected,
    truePositives,
    falsePositives: resultDetected.length - truePositives,
    falseNegatives: unmatchedGT.size,
  };
}

function calculateBrierScore(results: FixtureResult[]): number {
  let sumSquaredError = 0;
  let totalPredictions = 0;

  for (const result of results) {
    for (const det of result.detected) {
      const actual = det.matchedGroundTruthId ? 1 : 0;
      sumSquaredError += (det.confidence - actual) ** 2;
      totalPredictions++;
    }
  }

  return totalPredictions > 0 ? sumSquaredError / totalPredictions : 0;
}

function calculateCalibration(results: FixtureResult[]): CalibrationBucket[] {
  const bucketDefs: [number, number][] = [
    [0.0, 0.2],
    [0.2, 0.4],
    [0.4, 0.6],
    [0.6, 0.8],
    [0.8, 1.01],
  ];

  const buckets = bucketDefs.map((range) => ({
    range,
    predictions: [] as { confidence: number; correct: boolean }[],
  }));

  for (const result of results) {
    for (const det of result.detected) {
      const correct = !!det.matchedGroundTruthId;
      for (const bucket of buckets) {
        if (det.confidence >= bucket.range[0] && det.confidence < bucket.range[1]) {
          bucket.predictions.push({ confidence: det.confidence, correct });
          break;
        }
      }
    }
  }

  return buckets.map((b) => ({
    range: b.range as [number, number],
    predicted:
      b.predictions.length > 0
        ? b.predictions.reduce((sum, p) => sum + p.confidence, 0) / b.predictions.length
        : 0,
    actual:
      b.predictions.length > 0
        ? b.predictions.filter((p) => p.correct).length / b.predictions.length
        : 0,
    count: b.predictions.length,
  }));
}

export function calculateSummary(results: FixtureResult[], totalTokens: number): BenchmarkSummary {
  const totalFixtures = results.length;
  const totalDetected = results.reduce((s, r) => s + r.detected.length, 0);
  const totalGroundTruth = results.reduce((s, r) => s + r.groundTruth.length, 0);
  const truePositives = results.reduce((s, r) => s + r.truePositives, 0);
  const falsePositives = results.reduce((s, r) => s + r.falsePositives, 0);
  const falseNegatives = results.reduce((s, r) => s + r.falseNegatives, 0);

  const precision =
    truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : 0;
  const recall =
    truePositives + falseNegatives > 0
      ? truePositives / (truePositives + falseNegatives)
      : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  const brierScore = calculateBrierScore(results);
  const calibration = calculateCalibration(results);
  const avgLatencyMs =
    totalFixtures > 0
      ? results.reduce((s, r) => s + r.latencyMs, 0) / totalFixtures
      : 0;

  return {
    totalFixtures,
    totalDetected,
    totalGroundTruth,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1,
    brierScore,
    calibration,
    avgLatencyMs,
    totalTokens,
    fixtureResults: results,
  };
}

// ============================================================================
// Corpus-Zugriff
// ============================================================================

export function getCorpus(filter?: CorpusCategory[]): CorpusEntry[] {
  if (!filter || filter.length === 0) return [...BUILT_IN_CORPUS];
  return BUILT_IN_CORPUS.filter((e) => filter.includes(e.category));
}

// ============================================================================
// BaselineRunner
// ============================================================================

export class BaselineRunner {
  private readonly config: BaselineConfig;
  private readonly capturer: ScreenshotCapturer;
  private readonly analyzer: VisionAnalyzer;
  private readonly corpus: CorpusEntry[];
  private progressCallback?: (progress: BaselineProgress) => void;

  constructor(config: BaselineConfig) {
    this.config = {
      concurrency: 1,
      timeout: 60_000,
      ...config,
    };

    this.capturer = new ScreenshotCapturer(config.screenshotConfig);

    if (config.visionConfig.provider === "mock") {
      this.analyzer = new MockVisionAnalyzer(getBuiltInMockResponses());
    } else {
      this.analyzer = new VisionAnalyzer(config.visionConfig);
    }

    this.corpus = getCorpus(config.corpusFilter);
  }

  async runAll(): Promise<BaselineRun> {
    const runId = randomUUID();
    const startedAt = new Date();
    logger.info("Starting baseline run", { runId, fixtures: this.corpus.length });

    const results: FixtureResult[] = [];
    let totalTokens = 0;

    for (let i = 0; i < this.corpus.length; i++) {
      const entry = this.corpus[i];
      if (!entry) continue;

      this.progressCallback?.({
        completed: i,
        total: this.corpus.length,
        currentFixture: entry.id,
        phase: "screenshot",
        elapsedMs: Date.now() - startedAt.getTime(),
      });

      const result = await this.processFixture(entry);
      results.push(result.fixtureResult);
      totalTokens += result.tokens;
    }

    const summary = calculateSummary(results, totalTokens);
    const completedAt = new Date();

    logger.info("Baseline run complete", {
      runId,
      precision: summary.precision.toFixed(3),
      recall: summary.recall.toFixed(3),
      f1: summary.f1.toFixed(3),
    });

    return {
      id: runId,
      startedAt,
      completedAt,
      config: this.config,
      results,
      summary,
    };
  }

  async runFixture(corpusId: string): Promise<FixtureResult> {
    const entry = this.corpus.find((e) => e.id === corpusId);
    if (!entry) {
      throw new BaselineRunnerError(`Corpus entry not found: ${corpusId}`);
    }

    const { fixtureResult } = await this.processFixture(entry);
    return fixtureResult;
  }

  static compare(
    balageResults: BenchmarkSummary,
    baselineResults: BenchmarkSummary,
  ): BenchmarkComparison {
    const delta = {
      precision: balageResults.precision - baselineResults.precision,
      recall: balageResults.recall - baselineResults.recall,
      f1: balageResults.f1 - baselineResults.f1,
      brierScore: balageResults.brierScore - baselineResults.brierScore,
      avgLatencyMs: balageResults.avgLatencyMs - baselineResults.avgLatencyMs,
    };

    let winner: "balage" | "baseline" | "tie";
    if (delta.f1 >= 0.05) {
      winner = "balage";
    } else if (delta.f1 <= -0.05) {
      winner = "baseline";
    } else {
      winner = "tie";
    }

    const advantages: string[] = [];
    if (delta.precision > 0) advantages.push("Higher precision");
    if (delta.recall > 0) advantages.push("Higher recall");
    if (delta.brierScore < 0) advantages.push("Better calibration (lower Brier score)");
    if (delta.avgLatencyMs < 0) advantages.push("Lower latency");

    return { balage: balageResults, baseline: baselineResults, delta, winner, advantages };
  }

  onProgress(callback: (progress: BaselineProgress) => void): void {
    this.progressCallback = callback;
  }

  async cleanup(): Promise<void> {
    await this.capturer.cleanup();
  }

  private async processFixture(
    entry: CorpusEntry,
  ): Promise<{ fixtureResult: FixtureResult; tokens: number }> {
    // 1. Screenshot erstellen
    const screenshot = await this.capturer.captureFromHtml(entry.id, entry.html);

    // 2. Vision-Analyse
    const analysis = await this.analyzer.analyze(screenshot);

    // 3. Endpoints matchen
    const { matched, truePositives, falsePositives, falseNegatives } =
      matchEndpoints(analysis.detectedEndpoints, entry.groundTruth);

    const precision =
      truePositives + falsePositives > 0
        ? truePositives / (truePositives + falsePositives)
        : 0;
    const recall =
      truePositives + falseNegatives > 0
        ? truePositives / (truePositives + falseNegatives)
        : 0;
    const f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    const fixtureResult: FixtureResult = {
      corpusId: entry.id,
      category: entry.category,
      detected: matched,
      groundTruth: entry.groundTruth,
      truePositives,
      falsePositives,
      falseNegatives,
      precision,
      recall,
      f1,
      latencyMs: screenshot.captureTimeMs + analysis.latencyMs,
    };

    return { fixtureResult, tokens: analysis.tokenUsage.total };
  }
}

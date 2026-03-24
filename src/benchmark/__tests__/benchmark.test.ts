/**
 * BALAGE Benchmark Suite — Tests
 *
 * 12 Tests: Corpus (2), Ground Truth (2), Metriken (3),
 * Runner (2), Reporter (2), Matching (1 Bonus).
 */

import { describe, expect, it, vi } from "vitest";
import { getCorpus, getCorpusByCategory } from "../corpus.js";
import { getGroundTruth, getGroundTruthForCorpus } from "../ground-truth.js";
import {
  calculateBrierScore,
  calculateDetectionMetrics,
  calculateLatencyPercentiles,
  calculateMetrics,
} from "../metrics.js";
import { generateJsonReport, generateMarkdownReport } from "../reporter.js";
import { BenchmarkRunner } from "../runner.js";
import type {
  BenchmarkProgress,
  BenchmarkRun,
  CorpusCategory,
  DetectedEndpoint,
  EndpointDetector,
  FixtureResult,
  GroundTruthEndpoint,
} from "../types.js";

// Gueltige EndpointType-Werte
const VALID_ENDPOINT_TYPES = [
  "form", "checkout", "support", "navigation", "auth",
  "search", "commerce", "content", "consent", "media",
  "social", "settings",
] as const;

const ALL_CATEGORIES: CorpusCategory[] = [
  "ecommerce", "saas", "healthcare", "finance", "government",
  "blog", "spa", "wordpress", "shopify", "framework",
];

// ============================================================================
// Corpus Tests (2)
// ============================================================================

describe("Corpus", () => {
  it("hat genau 50 Eintraege", () => {
    const corpus = getCorpus();
    expect(corpus).toHaveLength(50);
  });

  it("deckt alle Kategorien mit je 5 Fixtures ab", () => {
    for (const category of ALL_CATEGORIES) {
      const fixtures = getCorpusByCategory(category);
      expect(fixtures).toHaveLength(5);
      for (const f of fixtures) {
        expect(f.category).toBe(category);
        expect(f.html).toBeTruthy();
        expect(f.html.length).toBeGreaterThan(100);
        expect(f.url).toMatch(/^https?:\/\//);
      }
    }
  });
});

// ============================================================================
// Ground Truth Tests (2)
// ============================================================================

describe("Ground Truth", () => {
  it("existiert fuer alle 50 Corpus-Fixtures", () => {
    const corpus = getCorpus();
    const groundTruth = getGroundTruth();

    expect(groundTruth).toHaveLength(50);

    for (const entry of corpus) {
      const gt = getGroundTruthForCorpus(entry.id);
      expect(gt).toBeDefined();
      expect(gt!.endpoints.length).toBeGreaterThanOrEqual(3);
      expect(gt!.endpoints.length).toBeLessThanOrEqual(12);
    }
  });

  it("verwendet nur gueltige EndpointType-Werte", () => {
    const groundTruth = getGroundTruth();

    for (const entry of groundTruth) {
      for (const ep of entry.endpoints) {
        expect(VALID_ENDPOINT_TYPES).toContain(ep.type);
        expect(ep.confidence).toBeGreaterThanOrEqual(0.6);
        expect(ep.confidence).toBeLessThanOrEqual(0.99);
        expect(["low", "medium", "high", "critical"]).toContain(ep.riskLevel);
        expect(ep.affordances.length).toBeGreaterThan(0);
        expect(ep.evidence.length).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================================
// Metriken Tests (3)
// ============================================================================

describe("Metriken", () => {
  it("berechnet Precision/Recall/F1 korrekt", () => {
    // 3 Detected, 3 Ground Truth, 2 Matches → TP=2, FP=1, FN=1
    const detected: DetectedEndpoint[] = [
      { type: "form", label: "Login Form", selector: "#login-form", confidence: 0.9, riskLevel: "high", affordances: ["fill", "submit"], evidence: [] },
      { type: "search", label: "Search Bar", selector: "#search", confidence: 0.85, riskLevel: "low", affordances: ["fill"], evidence: [] },
      { type: "navigation", label: "Side Menu", selector: "#sidebar", confidence: 0.7, riskLevel: "low", affordances: ["click"], evidence: [] },
    ];

    const groundTruth: GroundTruthEndpoint[] = [
      { type: "form", label: "Login Form", selector: "#login-form", confidence: 0.9, riskLevel: "high", affordances: ["fill", "submit"], evidence: ["semantic_label"] },
      { type: "search", label: "Search Bar", selector: "#search", confidence: 0.88, riskLevel: "low", affordances: ["fill"], evidence: ["aria_role"] },
      { type: "commerce", label: "Add to Cart", selector: "#add-cart", confidence: 0.95, riskLevel: "medium", affordances: ["click"], evidence: ["text_content"] },
    ];

    const result = calculateDetectionMetrics(detected, groundTruth);

    // TP=2 (Login Form + Search Bar match), FP=1 (Side Menu), FN=1 (Add to Cart)
    expect(result.tp).toBe(2);
    expect(result.fp).toBe(1);
    expect(result.fn).toBe(1);
    expect(result.precision).toBeCloseTo(2 / 3, 5);
    expect(result.recall).toBeCloseTo(2 / 3, 5);
    expect(result.f1).toBeCloseTo(2 / 3, 5);
  });

  it("berechnet Brier Score korrekt", () => {
    // Perfekte Predictions → Brier Score = 0
    const perfectPredictions = [
      { confidence: 1.0, correct: true },
      { confidence: 0.0, correct: false },
    ];
    expect(calculateBrierScore(perfectPredictions)).toBeCloseTo(0, 5);

    // Schlechte Predictions → Brier Score = 1
    const worstPredictions = [
      { confidence: 0.0, correct: true },
      { confidence: 1.0, correct: false },
    ];
    expect(calculateBrierScore(worstPredictions)).toBeCloseTo(1, 5);

    // Gemischte Predictions
    const mixedPredictions = [
      { confidence: 0.8, correct: true },   // (0.8 - 1)^2 = 0.04
      { confidence: 0.6, correct: false },   // (0.6 - 0)^2 = 0.36
      { confidence: 0.9, correct: true },    // (0.9 - 1)^2 = 0.01
    ];
    // Mean: (0.04 + 0.36 + 0.01) / 3 = 0.41 / 3 ≈ 0.1367
    expect(calculateBrierScore(mixedPredictions)).toBeCloseTo(0.41 / 3, 4);
  });

  it("berechnet Latency Percentiles korrekt", () => {
    const latencies = [100, 200, 300, 400, 500];
    const result = calculateLatencyPercentiles(latencies);

    expect(result.p50).toBe(300);
    expect(result.p95).toBe(500);
    expect(result.p99).toBe(500);
    expect(result.mean).toBe(300);
    expect(result.min).toBe(100);
    expect(result.max).toBe(500);
  });
});

// ============================================================================
// Runner Tests (2)
// ============================================================================

describe("BenchmarkRunner", () => {
  function createMockDetector(endpoints: DetectedEndpoint[] = []): EndpointDetector {
    return {
      detect: vi.fn().mockResolvedValue(endpoints),
    };
  }

  it("durchlaeuft alle 50 Fixtures", async () => {
    const mockEndpoints: DetectedEndpoint[] = [
      { type: "navigation", label: "Main Nav", confidence: 0.9, riskLevel: "low", affordances: ["click"], evidence: [] },
    ];

    const detector = createMockDetector(mockEndpoints);
    const runner = new BenchmarkRunner(detector, { concurrency: 5 });
    const run = await runner.runAll();

    expect(run.results).toHaveLength(50);
    expect(run.completedAt).toBeDefined();
    expect(run.summary).toBeDefined();
    expect(run.id).toBeTruthy();
    expect(detector.detect).toHaveBeenCalledTimes(50);
  });

  it("meldet Fortschritt fuer jede Fixture", async () => {
    const detector = createMockDetector([]);
    const runner = new BenchmarkRunner(detector, { concurrency: 1 });

    const progressUpdates: BenchmarkProgress[] = [];
    runner.onProgress((p) => progressUpdates.push({ ...p }));

    await runner.runAll();

    expect(progressUpdates).toHaveLength(50);

    // Erster Fortschritt
    expect(progressUpdates[0]!.completed).toBe(1);
    expect(progressUpdates[0]!.total).toBe(50);

    // Letzter Fortschritt
    const last = progressUpdates[progressUpdates.length - 1]!;
    expect(last.completed).toBe(50);
    expect(last.total).toBe(50);
    expect(last.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Reporter Tests (2)
// ============================================================================

describe("Reporter", () => {
  function createMockRun(): BenchmarkRun {
    const mockResults: FixtureResult[] = [
      {
        corpusId: "test-001",
        category: "ecommerce",
        detectedEndpoints: [
          { type: "commerce", label: "Add to Cart", confidence: 0.9, riskLevel: "medium", affordances: ["click"], evidence: [] },
        ],
        groundTruth: [
          { type: "commerce", label: "Add to Cart", selector: "#add-cart", confidence: 0.9, riskLevel: "medium", affordances: ["click"], evidence: ["text_content"] },
        ],
        latencyMs: 150,
        tokenUsage: { prompt: 1000, completion: 500, total: 1500 },
        errors: [],
      },
    ];

    const summary = calculateMetrics(mockResults);

    return {
      id: "test-run-001",
      startedAt: new Date("2026-03-17T10:00:00Z"),
      completedAt: new Date("2026-03-17T10:00:45Z"),
      config: {},
      results: mockResults,
      summary,
    };
  }

  it("generiert valides JSON", () => {
    const run = createMockRun();
    const json = generateJsonReport(run);

    // Muss parsbares JSON sein
    const parsed = JSON.parse(json);
    expect(parsed).toBeDefined();
    expect(parsed.summary).toBeDefined();
    expect(parsed.summary.precision).toBeDefined();
    expect(parsed.summary.recall).toBeDefined();
    expect(parsed.summary.f1Score).toBeDefined();
    expect(parsed.id).toBe("test-run-001");
  });

  it("generiert Markdown mit Tabellen", () => {
    const run = createMockRun();
    const md = generateMarkdownReport(run);

    expect(md).toContain("# BALAGE Benchmark Report");
    expect(md).toContain("| Metric | Value |");
    expect(md).toContain("| Precision |");
    expect(md).toContain("| Recall |");
    expect(md).toContain("| F1 Score |");
    expect(md).toContain("## Per-Category Results");
    expect(md).toContain("## Calibration");
    expect(md).toContain("## Token Usage");
  });
});

// ============================================================================
// Matching Bonus Test (1)
// ============================================================================

describe("Endpoint Matching", () => {
  it("erkennt True Positives korrekt bei gleichem Type und Selector", () => {
    const detected: DetectedEndpoint[] = [
      { type: "form", label: "Contact Form", selector: "#contact-form", confidence: 0.92, riskLevel: "medium", affordances: ["fill", "submit"], evidence: [] },
      { type: "auth", label: "Login Form", selector: "#login-form", confidence: 0.95, riskLevel: "high", affordances: ["fill", "submit"], evidence: [] },
    ];

    const groundTruth: GroundTruthEndpoint[] = [
      { type: "form", label: "Contact Form", selector: "#contact-form", confidence: 0.90, riskLevel: "medium", affordances: ["fill", "submit"], evidence: ["structural_pattern"] },
      { type: "auth", label: "Login Form", selector: "#login-form", confidence: 0.93, riskLevel: "high", affordances: ["fill", "submit"], evidence: ["semantic_label"] },
    ];

    const result = calculateDetectionMetrics(detected, groundTruth);

    expect(result.tp).toBe(2);
    expect(result.fp).toBe(0);
    expect(result.fn).toBe(0);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
  });
});

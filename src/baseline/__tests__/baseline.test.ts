/**
 * BALAGE Baseline — Tests
 *
 * Playwright gemockt (kein echter Browser).
 * VisionAnalyzer nutzt MockVisionAnalyzer (keine echten API-Calls).
 * Alle Tests deterministisch.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks (vi.hoisted laeuft vor vi.mock Factories) ───────────────────────

const { mockPage, mockBrowser } = vi.hoisted(() => {
  const mockPage = {
    setViewportSize: vi.fn(),
    setContent: vi.fn(),
    screenshot: vi.fn(),
    close: vi.fn(),
  };
  const mockBrowser = {
    newPage: vi.fn(),
    close: vi.fn(),
  };
  return { mockPage, mockBrowser };
});

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

vi.mock("../../observability/index.js", () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  }),
}));

// ── Imports (nach Mocks) ───────────────────────────────────────────────────

import { ScreenshotCapturer } from "../screenshot-capturer.js";
import { MockVisionAnalyzer } from "../vision-analyzer.js";
import { BaselineRunner, getCorpus, matchEndpoints, calculateSummary } from "../baseline-runner.js";
import { ScreenshotTimeoutError } from "../errors.js";
import type {
  DetectedEndpoint,
  ScreenshotResult,
  BenchmarkSummary,
  FixtureResult,
} from "../types.js";

// ── Helpers ────────────────────────────────────────────────────────────────

const FAKE_PNG = Buffer.from("fake-png-data");

function makeMockSummary(overrides: Partial<BenchmarkSummary>): BenchmarkSummary {
  return {
    totalFixtures: 0,
    totalDetected: 0,
    totalGroundTruth: 0,
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
    precision: 0,
    recall: 0,
    f1: 0,
    brierScore: 0,
    calibration: [],
    avgLatencyMs: 0,
    totalTokens: 0,
    fixtureResults: [],
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockPage.setViewportSize.mockResolvedValue(undefined);
  mockPage.setContent.mockResolvedValue(undefined);
  mockPage.screenshot.mockResolvedValue(FAKE_PNG);
  mockPage.close.mockResolvedValue(undefined);
  mockBrowser.newPage.mockResolvedValue(mockPage);
  mockBrowser.close.mockResolvedValue(undefined);
});

// ============================================================================
// ScreenshotCapturer (2 Tests)
// ============================================================================

describe("ScreenshotCapturer", () => {
  it("erstellt Screenshot von HTML-String", async () => {
    const capturer = new ScreenshotCapturer();
    const result = await capturer.captureFromHtml("test-001", "<html><body>Hello</body></html>");

    expect(result.corpusId).toBe("test-001");
    expect(Buffer.isBuffer(result.imageBuffer)).toBe(true);
    expect(result.format).toBe("png");
    expect(result.dimensions).toEqual({ width: 1280, height: 720 });
    expect(result.captureTimeMs).toBeGreaterThan(0);
    expect(mockPage.setContent).toHaveBeenCalledWith(
      "<html><body>Hello</body></html>",
      { waitUntil: "load" },
    );

    await capturer.cleanup();
  });

  it("erstellt Corpus-Batch Screenshots", async () => {
    const corpus = getCorpus();
    const capturer = new ScreenshotCapturer();
    const results = await capturer.captureCorpus(corpus);

    expect(results).toHaveLength(corpus.length);
    for (const result of results) {
      expect(result.corpusId).toBeDefined();
      expect(Buffer.isBuffer(result.imageBuffer)).toBe(true);
    }

    // Browser wird wiederverwendet — launch nur einmal
    const { chromium } = await import("playwright");
    expect(chromium.launch).toHaveBeenCalledTimes(1);

    await capturer.cleanup();
  });
});

// ============================================================================
// VisionAnalyzer (2 Tests)
// ============================================================================

describe("MockVisionAnalyzer", () => {
  it("gibt vordefinierte Endpoints zurueck", async () => {
    const mockResponses = new Map<string, DetectedEndpoint[]>();
    mockResponses.set("test-fixture", [
      { type: "form", label: "Contact Form", confidence: 0.9, riskLevel: "medium", affordances: ["fill", "submit"] },
      { type: "navigation", label: "Home Link", confidence: 0.8, riskLevel: "low", affordances: ["click"] },
    ]);

    const analyzer = new MockVisionAnalyzer(mockResponses);
    const screenshot: ScreenshotResult = {
      corpusId: "test-fixture",
      imageBuffer: FAKE_PNG,
      format: "png",
      dimensions: { width: 1280, height: 720 },
      captureTimeMs: 50,
    };

    const result = await analyzer.analyze(screenshot);

    expect(result.corpusId).toBe("test-fixture");
    expect(result.detectedEndpoints).toHaveLength(2);
    expect(result.detectedEndpoints[0]?.type).toBe("form");
    expect(result.detectedEndpoints[0]?.label).toBe("Contact Form");
    expect(result.detectedEndpoints[1]?.type).toBe("navigation");
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(result.tokenUsage.total).toBeGreaterThan(0);
    expect(result.rawResponse).toContain("Contact Form");
  });

  it("ist absichtlich ungenauer als BALAGE Ground Truth", async () => {
    // Built-in corpus: ecommerce-checkout-001 hat 7 Ground-Truth-Endpoints
    const corpus = getCorpus();
    const ecommerceEntry = corpus.find((e) => e.id === "ecommerce-checkout-001");
    expect(ecommerceEntry).toBeDefined();

    // Mock mit built-in Responses
    const mockResponses = new Map<string, DetectedEndpoint[]>();
    // 6 TPs + 1 FP (Cart Icon), verpasst hidden CSRF Token
    mockResponses.set("ecommerce-checkout-001", [
      { type: "checkout", label: "Checkout Form", confidence: 0.9, riskLevel: "high", affordances: ["fill", "submit"] },
      { type: "form", label: "Name Input", confidence: 0.8, riskLevel: "medium", affordances: ["fill"] },
      { type: "form", label: "Email Input", confidence: 0.85, riskLevel: "medium", affordances: ["fill"] },
      { type: "form", label: "Card Input", confidence: 0.75, riskLevel: "high", affordances: ["fill"] },
      { type: "commerce", label: "Purchase Button", confidence: 0.88, riskLevel: "high", affordances: ["click"] },
      { type: "navigation", label: "Back Link", confidence: 0.7, riskLevel: "low", affordances: ["click"] },
      { type: "navigation", label: "Cart Icon", confidence: 0.55, riskLevel: "low", affordances: ["click"] },
    ]);

    const analyzer = new MockVisionAnalyzer(mockResponses);
    const screenshot: ScreenshotResult = {
      corpusId: "ecommerce-checkout-001",
      imageBuffer: FAKE_PNG,
      format: "png",
      dimensions: { width: 1280, height: 720 },
      captureTimeMs: 50,
    };

    const result = await analyzer.analyze(screenshot);
    const { truePositives, falsePositives, falseNegatives } = matchEndpoints(
      result.detectedEndpoints,
      ecommerceEntry!.groundTruth,
    );

    // Weniger erkannt als Ground Truth
    expect(truePositives).toBeLessThan(ecommerceEntry!.groundTruth.length);
    // Hat False Positives (dekorative Elemente)
    expect(falsePositives).toBeGreaterThan(0);
    // Hat False Negatives (hidden fields nicht erkannt)
    expect(falseNegatives).toBeGreaterThan(0);

    // Precision < 1.0 (wegen FP)
    const precision = truePositives / (truePositives + falsePositives);
    expect(precision).toBeLessThan(1.0);
    expect(precision).toBeGreaterThan(0.5);
  });
});

// ============================================================================
// BaselineRunner (2 Tests)
// ============================================================================

describe("BaselineRunner", () => {
  it("durchlaeuft Corpus und erzeugt FixtureResults", async () => {
    const runner = new BaselineRunner({
      visionConfig: { provider: "mock" },
    });

    const run = await runner.runAll();

    expect(run.id).toBeDefined();
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.completedAt).toBeInstanceOf(Date);
    expect(run.results.length).toBe(getCorpus().length);

    for (const result of run.results) {
      expect(result.corpusId).toBeDefined();
      expect(result.detected.length).toBeGreaterThan(0);
      expect(result.groundTruth.length).toBeGreaterThan(0);
      expect(result.precision).toBeGreaterThanOrEqual(0);
      expect(result.precision).toBeLessThanOrEqual(1);
      expect(result.recall).toBeGreaterThanOrEqual(0);
      expect(result.recall).toBeLessThanOrEqual(1);
    }

    await runner.cleanup();
  });

  it("produziert BenchmarkSummary mit Precision, Recall, F1, Brier Score", async () => {
    const runner = new BaselineRunner({
      visionConfig: { provider: "mock" },
    });

    const run = await runner.runAll();

    expect(run.summary).toBeDefined();
    const summary = run.summary!;

    expect(summary.totalFixtures).toBe(getCorpus().length);
    expect(summary.precision).toBeGreaterThan(0);
    expect(summary.precision).toBeLessThanOrEqual(1);
    expect(summary.recall).toBeGreaterThan(0);
    expect(summary.recall).toBeLessThanOrEqual(1);
    expect(summary.f1).toBeGreaterThan(0);
    expect(summary.f1).toBeLessThanOrEqual(1);
    expect(summary.brierScore).toBeGreaterThanOrEqual(0);
    expect(summary.calibration.length).toBeGreaterThan(0);
    expect(summary.totalTokens).toBeGreaterThan(0);

    // Vision-Baseline sollte nicht perfekt sein
    expect(summary.precision).toBeLessThan(0.95);
    expect(summary.recall).toBeLessThan(0.90);

    await runner.cleanup();
  });
});

// ============================================================================
// Vergleich (2 Tests)
// ============================================================================

describe("BaselineRunner.compare", () => {
  it("berechnet Delta korrekt", () => {
    const balage = makeMockSummary({
      precision: 0.92,
      recall: 0.93,
      f1: 0.925,
      brierScore: 0.03,
      avgLatencyMs: 200,
    });

    const baseline = makeMockSummary({
      precision: 0.75,
      recall: 0.78,
      f1: 0.765,
      brierScore: 0.08,
      avgLatencyMs: 1200,
    });

    const comparison = BaselineRunner.compare(balage, baseline);

    expect(comparison.delta.precision).toBeCloseTo(0.17, 2);
    expect(comparison.delta.recall).toBeCloseTo(0.15, 2);
    expect(comparison.delta.f1).toBeCloseTo(0.16, 2);
    expect(comparison.delta.brierScore).toBeCloseTo(-0.05, 2);
    expect(comparison.delta.avgLatencyMs).toBeCloseTo(-1000, 0);
  });

  it("bestimmt Winner korrekt", () => {
    // BALAGE klar besser
    const balage = makeMockSummary({ f1: 0.90, precision: 0.92, brierScore: 0.03, avgLatencyMs: 200 });
    const baseline = makeMockSummary({ f1: 0.72, precision: 0.75, brierScore: 0.08, avgLatencyMs: 1200 });

    const result = BaselineRunner.compare(balage, baseline);
    expect(result.winner).toBe("balage");
    expect(result.advantages).toContain("Higher precision");
    expect(result.advantages).toContain("Better calibration (lower Brier score)");
    expect(result.advantages).toContain("Lower latency");

    // Tie: F1-Differenz < 0.05
    const tieBalage = makeMockSummary({ f1: 0.82 });
    const tieBaseline = makeMockSummary({ f1: 0.80 });
    const tieResult = BaselineRunner.compare(tieBalage, tieBaseline);
    expect(tieResult.winner).toBe("tie");

    // Baseline besser
    const weakBalage = makeMockSummary({ f1: 0.60 });
    const strongBaseline = makeMockSummary({ f1: 0.80 });
    const reverseResult = BaselineRunner.compare(weakBalage, strongBaseline);
    expect(reverseResult.winner).toBe("baseline");
  });
});

// ============================================================================
// Error Handling (1 Bonus Test)
// ============================================================================

describe("Error Handling", () => {
  it("wirft ScreenshotTimeoutError bei zu langem Capture", async () => {
    // setContent resolved nie → Timeout greift
    mockPage.setContent.mockImplementation(
      () => new Promise(() => {}),
    );

    const capturer = new ScreenshotCapturer({ timeout: 50 });

    await expect(
      capturer.captureFromHtml("timeout-test", "<html></html>"),
    ).rejects.toThrow(ScreenshotTimeoutError);

    await capturer.cleanup();
  });
});

/**
 * BALAGE Baseline — Type Definitions
 *
 * Benchmark-kompatible Typen lokal definiert (src/benchmark/ noch nicht verfuegbar).
 * Sobald src/benchmark/ existiert, koennen die Imports auf "../benchmark/types.js" umgestellt werden.
 */

import type { EndpointType, RiskLevel, BoundingBox } from "../../shared_interfaces.js";

// ============================================================================
// Benchmark-kompatible Typen
// ============================================================================

export type CorpusCategory =
  | "ecommerce"
  | "saas"
  | "media"
  | "government"
  | "healthcare"
  | "finance"
  | "education"
  | "social";

export interface CorpusEntry {
  id: string;
  name: string;
  category: CorpusCategory;
  html: string;
  url: string;
  description?: string;
  groundTruth: GroundTruthEndpoint[];
}

export interface GroundTruthEndpoint {
  id: string;
  type: EndpointType;
  label: string;
  selector?: string;
  isVisible: boolean;
  riskLevel: RiskLevel;
  affordances: string[];
}

export interface DetectedEndpoint {
  type: EndpointType;
  label: string;
  confidence: number;
  riskLevel: RiskLevel;
  affordances: string[];
  boundingBox?: BoundingBox;
  selector?: string;
  matchedGroundTruthId?: string;
}

export interface FixtureResult {
  corpusId: string;
  category: CorpusCategory;
  detected: DetectedEndpoint[];
  groundTruth: GroundTruthEndpoint[];
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  latencyMs: number;
}

export interface CalibrationBucket {
  range: [number, number];
  predicted: number;
  actual: number;
  count: number;
}

export interface BenchmarkSummary {
  totalFixtures: number;
  totalDetected: number;
  totalGroundTruth: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  brierScore: number;
  calibration: CalibrationBucket[];
  avgLatencyMs: number;
  totalTokens: number;
  fixtureResults: FixtureResult[];
}

export interface BenchmarkComparison {
  balage: BenchmarkSummary;
  baseline: BenchmarkSummary;
  delta: {
    precision: number;
    recall: number;
    f1: number;
    brierScore: number;
    avgLatencyMs: number;
  };
  winner: "balage" | "baseline" | "tie";
  advantages: string[];
}

// ============================================================================
// Baseline-spezifische Typen
// ============================================================================

export interface ScreenshotConfig {
  viewport?: { width: number; height: number };
  fullPage?: boolean;
  format?: "png" | "jpeg";
  quality?: number;
  timeout?: number;
}

export interface ScreenshotResult {
  corpusId: string;
  imageBuffer: Buffer;
  format: "png" | "jpeg";
  dimensions: { width: number; height: number };
  captureTimeMs: number;
}

export interface VisionAnalyzerConfig {
  provider: "openai" | "anthropic" | "mock";
  model?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface VisionAnalysisResult {
  corpusId: string;
  detectedEndpoints: DetectedEndpoint[];
  rawResponse: string;
  tokenUsage: { prompt: number; completion: number; total: number };
  latencyMs: number;
}

export interface BaselineConfig {
  visionConfig: VisionAnalyzerConfig;
  screenshotConfig?: ScreenshotConfig;
  corpusFilter?: CorpusCategory[];
  concurrency?: number;
  timeout?: number;
}

export interface BaselineRun {
  id: string;
  startedAt: Date;
  completedAt?: Date;
  config: BaselineConfig;
  results: FixtureResult[];
  summary?: BenchmarkSummary;
}

export interface BaselineProgress {
  completed: number;
  total: number;
  currentFixture: string;
  phase: "screenshot" | "analysis";
  elapsedMs: number;
}

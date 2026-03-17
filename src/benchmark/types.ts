/**
 * BALAGE Benchmark Suite — Type Definitions
 *
 * Lokale Typen fuer Corpus, Ground Truth, Runner, Metriken und Reporter.
 */

// Re-Exports aus shared_interfaces
export type {
  Endpoint,
  EndpointType,
  Evidence,
  ConfidenceScore,
  RiskLevel,
  SemanticFingerprint,
} from "../../shared_interfaces.js";

// ============================================================================
// Corpus Types
// ============================================================================

export type CorpusCategory =
  | "ecommerce"
  | "saas"
  | "healthcare"
  | "finance"
  | "government"
  | "blog"
  | "spa"
  | "wordpress"
  | "shopify"
  | "framework";

export interface CorpusEntry {
  id: string;
  name: string;
  category: CorpusCategory;
  url: string;
  html: string;
  metadata: {
    framework?: string;
    complexity: "simple" | "medium" | "complex";
    hasAuthentication: boolean;
    hasForms: boolean;
    hasNavigation: boolean;
    hasDynamicContent: boolean;
  };
}

// ============================================================================
// Ground Truth Types
// ============================================================================

export interface GroundTruthEndpoint {
  type: import("../../shared_interfaces.js").EndpointType;
  label: string;
  selector: string;
  confidence: number;
  riskLevel: import("../../shared_interfaces.js").RiskLevel;
  affordances: string[];
  evidence: string[];
}

export interface GroundTruthEntry {
  corpusId: string;
  endpoints: GroundTruthEndpoint[];
}

// ============================================================================
// Runner Types
// ============================================================================

export interface BenchmarkConfig {
  corpusFilter?: CorpusCategory[];
  concurrency?: number;
  timeout?: number;
  collectTokenUsage?: boolean;
  warmup?: boolean;
}

export interface DetectedEndpoint {
  type: import("../../shared_interfaces.js").EndpointType;
  label: string;
  selector?: string;
  confidence: number;
  riskLevel: import("../../shared_interfaces.js").RiskLevel;
  affordances: string[];
  evidence: import("../../shared_interfaces.js").Evidence[];
}

export interface FixtureResult {
  corpusId: string;
  category: CorpusCategory;
  detectedEndpoints: DetectedEndpoint[];
  groundTruth: GroundTruthEndpoint[];
  latencyMs: number;
  tokenUsage: { prompt: number; completion: number; total: number };
  errors: string[];
}

export interface BenchmarkRun {
  id: string;
  startedAt: Date;
  completedAt?: Date;
  config: BenchmarkConfig;
  results: FixtureResult[];
  summary?: BenchmarkSummary;
}

export interface BenchmarkProgress {
  completed: number;
  total: number;
  currentFixture: string;
  elapsedMs: number;
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface CalibrationBucket {
  bucketStart: number;
  bucketEnd: number;
  predictedConfidence: number;
  actualAccuracy: number;
  count: number;
}

export interface BenchmarkSummary {
  precision: number;
  recall: number;
  f1Score: number;

  perCategory: Record<CorpusCategory, {
    precision: number;
    recall: number;
    f1Score: number;
    fixtureCount: number;
  }>;

  brierScore: number;
  calibrationData: CalibrationBucket[];

  latency: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
    min: number;
    max: number;
  };

  tokenUsage: {
    totalPrompt: number;
    totalCompletion: number;
    totalTokens: number;
    avgPerFixture: number;
    costEstimateUsd: number;
  };

  totalFixtures: number;
  totalExpectedEndpoints: number;
  totalDetectedEndpoints: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

// ============================================================================
// Reporter Types
// ============================================================================

export interface ReportConfig {
  format: "json" | "markdown" | "both";
  includePerFixture?: boolean;
  includeCalibration?: boolean;
  title?: string;
}

// ============================================================================
// Comparison Interface
// ============================================================================

export interface BenchmarkComparison {
  balage: BenchmarkSummary;
  baseline: BenchmarkSummary;
  delta: {
    precision: number;
    recall: number;
    f1Score: number;
    brierScore: number;
    latencyP50: number;
  };
  winner: "balage" | "baseline" | "tie";
}

// ============================================================================
// Endpoint Detector (injectable for testing)
// ============================================================================

export interface EndpointDetector {
  detect(html: string, url: string): Promise<DetectedEndpoint[]>;
}

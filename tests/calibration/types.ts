/**
 * BALAGE Confidence Calibration — Type Definitions
 *
 * Lokale Typen fuer Platt Scaling, Brier Score Analyse,
 * Reliability Diagram und Grid Search Optimierung.
 */

// Re-Exports aus shared_interfaces
export type {
  ConfidenceScore,
  Evidence,
} from "../../shared_interfaces.js";

export type {
  BenchmarkRun,
  FixtureResult,
  DetectedEndpoint,
  GroundTruthEndpoint,
  BenchmarkSummary,
  CalibrationBucket,
} from "../../src/benchmark/types.js";

// ============================================================================
// Platt Scaling
// ============================================================================

export interface PlattScalingParams {
  a: number;
  b: number;
}

export interface PlattScalingConfig {
  maxIterations?: number;
  tolerance?: number;
  learningRate?: number;
}

export interface CalibrationDataPoint {
  rawConfidence: number;
  isCorrect: boolean;
}

// ============================================================================
// Brier Score
// ============================================================================

export interface BrierScoreAnalysis {
  brierScore: number;
  reliability: number;
  resolution: number;
  uncertainty: number;
  decomposition: {
    reliability: number;
    resolution: number;
    uncertainty: number;
  };
  isWellCalibrated: boolean;
  bucketsAboveThreshold: number;
}

// ============================================================================
// Reliability Diagram
// ============================================================================

export interface ReliabilityDiagramData {
  title: string;
  description: string;
  buckets: ReliabilityBucket[];
  perfectCalibrationLine: Array<{ x: number; y: number }>;
  brierScore: number;
  totalPredictions: number;
  metadata: {
    generatedAt: string;
    bucketCount: number;
    source: string;
  };
}

export interface ReliabilityBucket {
  bucketIndex: number;
  rangeStart: number;
  rangeEnd: number;
  meanPredictedConfidence: number;
  actualAccuracy: number;
  count: number;
  gap: number;
  isOverConfident: boolean;
  isUnderConfident: boolean;
}

// ============================================================================
// Grid Search
// ============================================================================

export interface WeightConfig {
  w1_semantic: number;
  w2_structural: number;
  w3_affordance: number;
  w4_evidence: number;
  w5_historical: number;
  w6_ambiguity: number;
}

export interface GridSearchConfig {
  stepSize?: number;
  minWeight?: number;
  maxWeight?: number;
  weightSumTarget?: number;
  weightSumTolerance?: number;
  metric?: "brier" | "f1";
  maxCombinations?: number;
}

export interface GridSearchResult {
  bestWeights: WeightConfig;
  bestScore: number;
  defaultScore: number;
  improvement: number;
  totalCombinations: number;
  evaluatedCombinations: number;
  topN: Array<{
    weights: WeightConfig;
    score: number;
  }>;
  searchDurationMs: number;
}

export interface GridSearchProgress {
  evaluated: number;
  total: number;
  currentBest: number;
  elapsedMs: number;
}

/**
 * BALAGE Benchmark Suite — Metrics Engine
 *
 * Berechnet Precision/Recall/F1, Brier Score, Latency Percentiles,
 * Token Usage und Calibration Buckets aus Benchmark-Rohdaten.
 */

import { createLogger } from "../observability/index.js";
import { MetricsCalculationError } from "./errors.js";
import type {
  BenchmarkSummary,
  CalibrationBucket,
  CorpusCategory,
  DetectedEndpoint,
  FixtureResult,
  GroundTruthEndpoint,
} from "./types.js";

const logger = createLogger({ name: "benchmark:metrics" });

// Kosten-Schaetzung pro Token (Claude Sonnet 4 Preise als Referenz)
const COST_PER_PROMPT_TOKEN = 0.000003;
const COST_PER_COMPLETION_TOKEN = 0.000015;

const ALL_CATEGORIES: CorpusCategory[] = [
  "ecommerce", "saas", "healthcare", "finance", "government",
  "blog", "spa", "wordpress", "shopify", "framework",
];

/**
 * Berechnet die Levenshtein-Distanz zwischen zwei Strings,
 * normalisiert auf [0, 1] (0 = identisch, 1 = komplett verschieden).
 */
function normalizedLevenshtein(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen === 0) return 0;

  const matrix: number[][] = [];
  for (let i = 0; i <= la.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lb.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= la.length; i++) {
    for (let j = 1; j <= lb.length; j++) {
      const cost = la[i - 1] === lb[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }

  return matrix[la.length]![lb.length]! / maxLen;
}

/**
 * Prueft ob ein Detected Endpoint zu einem Ground Truth Endpoint passt.
 * Match-Kriterien:
 * 1. type muss uebereinstimmen
 * 2. selector matcht ODER label-Aehnlichkeit > 0.7 (Levenshtein < 0.3)
 */
function isMatch(detected: DetectedEndpoint, gt: GroundTruthEndpoint): boolean {
  if (detected.type !== gt.type) return false;

  // Selector-Match
  if (detected.selector && detected.selector === gt.selector) return true;

  // Label-Aehnlichkeit
  const distance = normalizedLevenshtein(detected.label, gt.label);
  return distance < 0.3;
}

/**
 * Berechnet Precision/Recall/F1 fuer eine einzelne Fixture.
 */
export function calculateDetectionMetrics(
  detected: DetectedEndpoint[],
  groundTruth: GroundTruthEndpoint[],
): { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number } {
  const matchedGtIndices = new Set<number>();
  let tp = 0;

  for (const det of detected) {
    let found = false;
    for (let i = 0; i < groundTruth.length; i++) {
      if (matchedGtIndices.has(i)) continue;
      const gt = groundTruth[i]!;
      if (isMatch(det, gt)) {
        tp++;
        matchedGtIndices.add(i);
        found = true;
        break;
      }
    }
    if (!found) {
      // False Positive — kein passender Ground Truth
    }
  }

  const fp = detected.length - tp;
  const fn = groundTruth.length - tp;

  const precision = detected.length > 0 ? tp / detected.length : 0;
  const recall = groundTruth.length > 0 ? tp / groundTruth.length : 0;
  const f1 = precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

  return { precision, recall, f1, tp, fp, fn };
}

/**
 * Berechnet den Brier Score (Mean Squared Error der Wahrscheinlichkeiten).
 * Niedriger = besser kalibriert. Perfekte Kalibrierung = 0.
 */
export function calculateBrierScore(
  predictions: Array<{ confidence: number; correct: boolean }>,
): number {
  if (predictions.length === 0) return 0;

  const sumSquaredError = predictions.reduce((sum, p) => {
    const actual = p.correct ? 1 : 0;
    return sum + (p.confidence - actual) ** 2;
  }, 0);

  return sumSquaredError / predictions.length;
}

/**
 * Berechnet Latenz-Percentiles aus einer Liste von Latenzen.
 */
export function calculateLatencyPercentiles(
  latencies: number[],
): { p50: number; p95: number; p99: number; mean: number; min: number; max: number } {
  if (latencies.length === 0) {
    return { p50: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0 };
  }

  const sorted = [...latencies].sort((a, b) => a - b);

  const percentile = (p: number): number => {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))]!;
  };

  const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;

  return {
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
    mean,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

/**
 * Erzeugt Calibration Buckets fuer ein Reliability Diagram.
 */
export function calculateCalibrationBuckets(
  predictions: Array<{ confidence: number; correct: boolean }>,
  bucketCount = 10,
): CalibrationBucket[] {
  const bucketSize = 1 / bucketCount;
  const buckets: CalibrationBucket[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const start = i * bucketSize;
    const end = start + bucketSize;

    const inBucket = predictions.filter(
      (p) => p.confidence >= start && (i === bucketCount - 1 ? p.confidence <= end : p.confidence < end),
    );

    const predictedConfidence = inBucket.length > 0
      ? inBucket.reduce((sum, p) => sum + p.confidence, 0) / inBucket.length
      : (start + end) / 2;

    const actualAccuracy = inBucket.length > 0
      ? inBucket.filter((p) => p.correct).length / inBucket.length
      : 0;

    buckets.push({
      bucketStart: Math.round(start * 100) / 100,
      bucketEnd: Math.round(end * 100) / 100,
      predictedConfidence: Math.round(predictedConfidence * 1000) / 1000,
      actualAccuracy: Math.round(actualAccuracy * 1000) / 1000,
      count: inBucket.length,
    });
  }

  return buckets;
}

/**
 * Berechnet alle Metriken aus den Benchmark-Ergebnissen.
 */
export function calculateMetrics(results: FixtureResult[]): BenchmarkSummary {
  if (results.length === 0) {
    throw new MetricsCalculationError("No results to calculate metrics from");
  }

  logger.info("Calculating benchmark metrics", { fixtureCount: results.length });

  // Globale TP/FP/FN zaehlen
  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;

  // Predictions fuer Brier Score sammeln
  const allPredictions: Array<{ confidence: number; correct: boolean }> = [];

  // Per-Category Metriken
  const categoryResults = new Map<CorpusCategory, FixtureResult[]>();
  for (const result of results) {
    const existing = categoryResults.get(result.category) ?? [];
    existing.push(result);
    categoryResults.set(result.category, existing);
  }

  // Fixture-Level Metriken berechnen
  for (const result of results) {
    const metrics = calculateDetectionMetrics(result.detectedEndpoints, result.groundTruth);
    totalTp += metrics.tp;
    totalFp += metrics.fp;
    totalFn += metrics.fn;

    // Predictions fuer Brier Score: jede Detection ist eine Prediction
    for (const det of result.detectedEndpoints) {
      const matched = result.groundTruth.some((gt) => isMatch(det, gt));
      allPredictions.push({ confidence: det.confidence, correct: matched });
    }
  }

  // Globale Precision/Recall/F1
  const totalDetected = totalTp + totalFp;
  const totalExpected = totalTp + totalFn;
  const precision = totalDetected > 0 ? totalTp / totalDetected : 0;
  const recall = totalExpected > 0 ? totalTp / totalExpected : 0;
  const f1Score = precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

  // Per-Category Breakdown
  const perCategory = {} as BenchmarkSummary["perCategory"];
  for (const cat of ALL_CATEGORIES) {
    const catResults = categoryResults.get(cat) ?? [];
    let catTp = 0;
    let catFp = 0;
    let catFn = 0;

    for (const r of catResults) {
      const m = calculateDetectionMetrics(r.detectedEndpoints, r.groundTruth);
      catTp += m.tp;
      catFp += m.fp;
      catFn += m.fn;
    }

    const catDetected = catTp + catFp;
    const catExpected = catTp + catFn;
    const catPrecision = catDetected > 0 ? catTp / catDetected : 0;
    const catRecall = catExpected > 0 ? catTp / catExpected : 0;
    const catF1 = catPrecision + catRecall > 0
      ? (2 * catPrecision * catRecall) / (catPrecision + catRecall)
      : 0;

    perCategory[cat] = {
      precision: Math.round(catPrecision * 1000) / 1000,
      recall: Math.round(catRecall * 1000) / 1000,
      f1Score: Math.round(catF1 * 1000) / 1000,
      fixtureCount: catResults.length,
    };
  }

  // Brier Score
  const brierScore = calculateBrierScore(allPredictions);

  // Calibration Buckets
  const calibrationData = calculateCalibrationBuckets(allPredictions);

  // Latency
  const latencies = results.map((r) => r.latencyMs);
  const latency = calculateLatencyPercentiles(latencies);

  // Token Usage
  const totalPrompt = results.reduce((sum, r) => sum + r.tokenUsage.prompt, 0);
  const totalCompletion = results.reduce((sum, r) => sum + r.tokenUsage.completion, 0);
  const totalTokens = totalPrompt + totalCompletion;
  const avgPerFixture = results.length > 0 ? Math.round(totalTokens / results.length) : 0;
  const costEstimateUsd = Math.round(
    (totalPrompt * COST_PER_PROMPT_TOKEN + totalCompletion * COST_PER_COMPLETION_TOKEN) * 100,
  ) / 100;

  const summary: BenchmarkSummary = {
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    f1Score: Math.round(f1Score * 1000) / 1000,
    perCategory,
    brierScore: Math.round(brierScore * 10000) / 10000,
    calibrationData,
    latency: {
      p50: Math.round(latency.p50),
      p95: Math.round(latency.p95),
      p99: Math.round(latency.p99),
      mean: Math.round(latency.mean),
      min: Math.round(latency.min),
      max: Math.round(latency.max),
    },
    tokenUsage: {
      totalPrompt,
      totalCompletion,
      totalTokens,
      avgPerFixture,
      costEstimateUsd,
    },
    totalFixtures: results.length,
    totalExpectedEndpoints: totalExpected,
    totalDetectedEndpoints: totalDetected,
    truePositives: totalTp,
    falsePositives: totalFp,
    falseNegatives: totalFn,
  };

  logger.info("Metrics calculated", {
    precision: summary.precision,
    recall: summary.recall,
    f1Score: summary.f1Score,
    brierScore: summary.brierScore,
  });

  return summary;
}

/**
 * BALAGE Confidence Calibration — Brier Score Analyse
 *
 * Detaillierte Brier Score Berechnung mit Decomposition
 * in Reliability, Resolution und Uncertainty.
 */

import { createLogger } from "../../src/observability/index.js";
import type { BrierScoreAnalysis, CalibrationDataPoint } from "./types.js";

const logger = createLogger({ name: "calibration:brier-score" });

const DEFAULT_BUCKET_COUNT = 10;
const DEFAULT_BRIER_TARGET = 0.1;

/**
 * Detaillierte Brier Score Analyse mit Murphy-Decomposition.
 *
 * Brier Score = Reliability - Resolution + Uncertainty
 * - Reliability:  Wie gut kalibriert? (niedriger = besser)
 * - Resolution:   Wie gut unterscheidet das Modell? (hoeher = besser)
 * - Uncertainty:   Baseline-Unsicherheit der Daten (unveraenderlich)
 */
export function analyzeBrierScore(
  predictions: CalibrationDataPoint[],
  bucketCount?: number,
): BrierScoreAnalysis {
  const nBuckets = bucketCount ?? DEFAULT_BUCKET_COUNT;

  if (predictions.length === 0) {
    return {
      brierScore: 0,
      reliability: 0,
      resolution: 0,
      uncertainty: 0,
      decomposition: { reliability: 0, resolution: 0, uncertainty: 0 },
      isWellCalibrated: true,
      bucketsAboveThreshold: 0,
    };
  }

  const n = predictions.length;

  // Brier Score: (1/N) * sum((p_i - o_i)^2)
  const brierScore = predictions.reduce((sum, p) => {
    const actual = p.isCorrect ? 1 : 0;
    return sum + (p.rawConfidence - actual) ** 2;
  }, 0) / n;

  // Base Rate
  const oBar = predictions.filter((p) => p.isCorrect).length / n;

  // Uncertainty: o_bar * (1 - o_bar)
  const uncertainty = oBar * (1 - oBar);

  // Bucketisierung fuer Decomposition
  const bucketSize = 1 / nBuckets;
  let reliability = 0;
  let resolution = 0;
  let bucketsAboveThreshold = 0;

  for (let k = 0; k < nBuckets; k++) {
    const start = k * bucketSize;
    const end = start + bucketSize;

    const inBucket = predictions.filter(
      (p) =>
        p.rawConfidence >= start &&
        (k === nBuckets - 1 ? p.rawConfidence <= end : p.rawConfidence < end),
    );

    if (inBucket.length === 0) continue;

    const nk = inBucket.length;
    const fk =
      inBucket.reduce((sum, p) => sum + p.rawConfidence, 0) / nk;
    const ok = inBucket.filter((p) => p.isCorrect).length / nk;

    reliability += (nk / n) * (fk - ok) ** 2;
    resolution += (nk / n) * (ok - oBar) ** 2;

    if (Math.abs(fk - ok) > 0.1) {
      bucketsAboveThreshold++;
    }
  }

  logger.info("Brier Score analysis complete", {
    brierScore,
    reliability,
    resolution,
    uncertainty,
    bucketsAboveThreshold,
  });

  return {
    brierScore,
    reliability,
    resolution,
    uncertainty,
    decomposition: { reliability, resolution, uncertainty },
    isWellCalibrated: brierScore < DEFAULT_BRIER_TARGET,
    bucketsAboveThreshold,
  };
}

/**
 * Vergleich Brier Score vor und nach Kalibrierung.
 */
export function compareBrierScores(
  beforeCalibration: CalibrationDataPoint[],
  afterCalibration: CalibrationDataPoint[],
): {
  before: BrierScoreAnalysis;
  after: BrierScoreAnalysis;
  improvement: number;
  improvementPercent: number;
} {
  const before = analyzeBrierScore(beforeCalibration);
  const after = analyzeBrierScore(afterCalibration);

  const improvement = before.brierScore - after.brierScore;
  const improvementPercent =
    before.brierScore > 0 ? (improvement / before.brierScore) * 100 : 0;

  logger.info("Brier Score comparison", {
    before: before.brierScore,
    after: after.brierScore,
    improvement,
    improvementPercent,
  });

  return { before, after, improvement, improvementPercent };
}

/**
 * Pruefen ob Brier Score das Ziel erreicht.
 */
export function meetsBrierTarget(
  brierScore: number,
  target?: number,
): boolean {
  return brierScore < (target ?? DEFAULT_BRIER_TARGET);
}

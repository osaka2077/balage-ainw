/**
 * BALAGE Confidence Calibration — Reliability Diagram Generator
 *
 * Generiert JSON-Daten fuer Reliability Diagrams (Calibration Plots).
 */

import { createLogger } from "../../src/observability/index.js";
import { analyzeBrierScore } from "./brier-score.js";
import type {
  CalibrationDataPoint,
  ReliabilityBucket,
  ReliabilityDiagramData,
} from "./types.js";

const logger = createLogger({ name: "calibration:reliability-diagram" });

const DEFAULT_BUCKET_COUNT = 10;

/**
 * Reliability Diagram Daten generieren.
 *
 * Erzeugt Buckets mit Mean Predicted Confidence vs. Actual Accuracy
 * sowie eine perfekte Kalibrierungslinie (Diagonale).
 */
export function generateReliabilityDiagram(
  predictions: CalibrationDataPoint[],
  config?: {
    bucketCount?: number;
    title?: string;
    source?: string;
  },
): ReliabilityDiagramData {
  const bucketCount = config?.bucketCount ?? DEFAULT_BUCKET_COUNT;
  const title = config?.title ?? "Confidence Calibration — Reliability Diagram";
  const source = config?.source ?? "BALAGE Calibration Module";

  const bucketSize = 1 / bucketCount;
  const buckets: ReliabilityBucket[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const rangeStart = Math.round(i * bucketSize * 100) / 100;
    const rangeEnd = Math.round((i + 1) * bucketSize * 100) / 100;

    const inBucket = predictions.filter(
      (p) =>
        p.rawConfidence >= rangeStart &&
        (i === bucketCount - 1
          ? p.rawConfidence <= rangeEnd
          : p.rawConfidence < rangeEnd),
    );

    const count = inBucket.length;
    const meanPredictedConfidence =
      count > 0
        ? inBucket.reduce((sum, p) => sum + p.rawConfidence, 0) / count
        : (rangeStart + rangeEnd) / 2;

    const actualAccuracy =
      count > 0
        ? inBucket.filter((p) => p.isCorrect).length / count
        : 0;

    const gap = Math.abs(meanPredictedConfidence - actualAccuracy);
    const isOverConfident = meanPredictedConfidence > actualAccuracy;
    const isUnderConfident = meanPredictedConfidence < actualAccuracy;

    buckets.push({
      bucketIndex: i,
      rangeStart,
      rangeEnd,
      meanPredictedConfidence: Math.round(meanPredictedConfidence * 1000) / 1000,
      actualAccuracy: Math.round(actualAccuracy * 1000) / 1000,
      count,
      gap: Math.round(gap * 1000) / 1000,
      isOverConfident: count > 0 && isOverConfident,
      isUnderConfident: count > 0 && isUnderConfident,
    });
  }

  // Perfekte Kalibrierungslinie: Diagonale (0,0) bis (1,1)
  const perfectCalibrationLine: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= bucketCount; i++) {
    const val = Math.round((i / bucketCount) * 100) / 100;
    perfectCalibrationLine.push({ x: val, y: val });
  }

  const analysis = analyzeBrierScore(predictions, bucketCount);

  logger.info("Reliability diagram generated", {
    bucketCount,
    totalPredictions: predictions.length,
    brierScore: analysis.brierScore,
  });

  return {
    title,
    description: `Reliability diagram with ${bucketCount} buckets over ${predictions.length} predictions`,
    buckets,
    perfectCalibrationLine,
    brierScore: analysis.brierScore,
    totalPredictions: predictions.length,
    metadata: {
      generatedAt: new Date().toISOString(),
      bucketCount,
      source,
    },
  };
}

/**
 * Vergleichs-Diagram: Vor vs. Nach Kalibrierung.
 */
export function generateComparisonDiagram(
  before: CalibrationDataPoint[],
  after: CalibrationDataPoint[],
): {
  before: ReliabilityDiagramData;
  after: ReliabilityDiagramData;
} {
  return {
    before: generateReliabilityDiagram(before, {
      title: "Before Calibration",
      source: "raw-confidence",
    }),
    after: generateReliabilityDiagram(after, {
      title: "After Calibration",
      source: "platt-scaled",
    }),
  };
}

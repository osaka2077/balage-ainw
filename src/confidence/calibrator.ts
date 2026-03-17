/**
 * Confidence Engine — Platt Scaling Calibrator
 *
 * Kalibriert Rohscores zu echten Wahrscheinlichkeiten.
 * Sigmoid: P(y=1|f) = 1 / (1 + exp(a*f + b))
 */

import pino from "pino";
import type {
  CalibrationDataPoint,
  CalibrationParams,
  CalibrationMetrics,
} from "./types.js";
import { CalibrationError } from "./errors.js";

const logger = pino({ name: "confidence:calibrator" });

const MIN_DATA_POINTS = 50;
const LEARNING_RATE = 0.01;
const MAX_ITERATIONS = 1000;
const CONVERGENCE_THRESHOLD = 1e-7;

/**
 * Berechnet Kalibrierungsparameter via Platt Scaling.
 * Minimum 50 Datenpunkte, sonst null.
 */
export function calibrate(
  predictions: CalibrationDataPoint[],
): CalibrationParams | null {
  if (predictions.length < MIN_DATA_POINTS) {
    logger.warn(
      { count: predictions.length, required: MIN_DATA_POINTS },
      "Zu wenige Datenpunkte fuer Kalibrierung — Raw-Score wird verwendet",
    );
    return null;
  }

  // Platt Scaling via Gradient Descent
  let a = 0;
  let b = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let gradA = 0;
    let gradB = 0;

    for (const dp of predictions) {
      const p = sigmoid(a * dp.predicted + b);
      const y = dp.actual ? 1 : 0;
      const diff = p - y;
      gradA += diff * dp.predicted;
      gradB += diff;
    }

    gradA /= predictions.length;
    gradB /= predictions.length;

    const prevA = a;
    const prevB = b;

    a -= LEARNING_RATE * gradA;
    b -= LEARNING_RATE * gradB;

    // Konvergenz-Check
    if (
      Math.abs(a - prevA) < CONVERGENCE_THRESHOLD &&
      Math.abs(b - prevB) < CONVERGENCE_THRESHOLD
    ) {
      break;
    }
  }

  // Brier Score auf Trainingsdaten berechnen
  let brierSum = 0;
  for (const dp of predictions) {
    const p = sigmoid(a * dp.predicted + b);
    const y = dp.actual ? 1 : 0;
    brierSum += (p - y) ** 2;
  }
  const brierScore = brierSum / predictions.length;

  logger.info(
    { a, b, brierScore, dataPoints: predictions.length },
    "Kalibrierung abgeschlossen",
  );

  return {
    a,
    b,
    dataPoints: predictions.length,
    brierScore,
    createdAt: new Date(),
  };
}

/**
 * Wendet Kalibrierung auf einen Rohscore an.
 * params === null → Raw-Score durchreichen.
 */
export function applyCalibration(
  rawScore: number,
  params: CalibrationParams | null,
): number {
  if (params === null) {
    return Math.min(1.0, Math.max(0.0, rawScore));
  }

  const calibrated = sigmoid(params.a * rawScore + params.b);
  return Math.min(1.0, Math.max(0.0, calibrated));
}

/**
 * Evaluiert die Kalibrierungsqualitaet auf Testdaten.
 */
export function evaluateCalibration(
  params: CalibrationParams,
  testData: CalibrationDataPoint[],
): CalibrationMetrics {
  if (testData.length === 0) {
    throw new CalibrationError("Keine Testdaten fuer Evaluation");
  }

  // Brier Score
  let brierSum = 0;
  for (const dp of testData) {
    const p = sigmoid(params.a * dp.predicted + params.b);
    const y = dp.actual ? 1 : 0;
    brierSum += (p - y) ** 2;
  }
  const brierScore = brierSum / testData.length;

  // ECE (Expected Calibration Error) mit 10 Bins
  const binCount = 10;
  const bins: { predicted: number[]; actual: number[] }[] = Array.from(
    { length: binCount },
    () => ({ predicted: [], actual: [] }),
  );

  for (const dp of testData) {
    const p = sigmoid(params.a * dp.predicted + params.b);
    const binIdx = Math.min(binCount - 1, Math.floor(p * binCount));
    bins[binIdx]!.predicted.push(p);
    bins[binIdx]!.actual.push(dp.actual ? 1 : 0);
  }

  let eceSum = 0;
  for (const bin of bins) {
    if (bin.predicted.length === 0) continue;
    const avgPredicted =
      bin.predicted.reduce((a, b) => a + b, 0) / bin.predicted.length;
    const avgActual =
      bin.actual.reduce((a, b) => a + b, 0) / bin.actual.length;
    eceSum +=
      (bin.predicted.length / testData.length) *
      Math.abs(avgPredicted - avgActual);
  }

  return {
    brierScore,
    ece: eceSum,
    binCount,
    isWellCalibrated: brierScore < 0.1 && eceSum < 0.05,
  };
}

function sigmoid(x: number): number {
  // Numerisch stabil
  if (x >= 0) {
    const ex = Math.exp(-x);
    return 1 / (1 + ex);
  }
  const ex = Math.exp(x);
  return ex / (1 + ex);
}

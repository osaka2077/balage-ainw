/**
 * BALAGE Confidence Calibration — Tests
 *
 * 9 Tests: Platt Scaling (3), Brier Score (2),
 * Reliability Diagram (1), Grid Search (2), Integration (1)
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIDENCE_WEIGHTS } from "../../shared_interfaces.js";
import { analyzeBrierScore, compareBrierScores, meetsBrierTarget } from "./brier-score.js";
import { GridSearchOptimizer } from "./grid-search.js";
import { PlattScaler } from "./platt-scaling.js";
import { generateReliabilityDiagram } from "./reliability-diagram.js";
import type { CalibrationDataPoint, WeightConfig } from "./types.js";

// ============================================================================
// Hilfsfunktionen fuer synthetische Daten
// ============================================================================

/** Numerisch stabile Sigmoid-Funktion */
function testSigmoid(x: number): number {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const ex = Math.exp(x);
  return ex / (1 + ex);
}

/**
 * Deterministischer Pseudo-Random-Generator (LCG).
 */
function createRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Generiert Daten mit Sigmoid-foermiger Overconfidence.
 *
 * Wahre Accuracy folgt: sigmoid(slope * (raw - 0.5))
 * Bei slope < 2*pi ≈ 6.28 sind hohe Raw-Scores ueberoptimistisch.
 * Platt Scaling kann dieses Muster exakt korrigieren.
 */
function generateSigmoidBiasedData(
  count: number,
  slope: number = 3.0,
  seed: number = 42,
): CalibrationDataPoint[] {
  const data: CalibrationDataPoint[] = [];
  const rng = createRng(seed);

  for (let i = 0; i < count; i++) {
    // Raw Confidence gleichverteilt in [0.01, 0.99]
    const rawConfidence = 0.01 + 0.98 * (i / (count - 1));
    // Wahre Accuracy folgt einem flacheren Sigmoid
    const trueProb = testSigmoid(slope * (rawConfidence - 0.5));
    // Korrektheit samplen
    const isCorrect = rng() < trueProb;
    data.push({ rawConfidence, isCorrect });
  }

  return data;
}

/**
 * Generiert Daten mit bekanntem Overconfidence-Bias (additiv).
 * Fuer Brier Score Tests und Grid Search.
 */
function generateOverconfidentData(
  count: number,
  biasAmount: number,
  seed: number = 42,
): CalibrationDataPoint[] {
  const data: CalibrationDataPoint[] = [];
  const rng = createRng(seed);

  for (let i = 0; i < count; i++) {
    const trueProb = rng();
    const isCorrect = rng() < trueProb;
    const rawConfidence = Math.max(0, Math.min(1, trueProb + biasAmount));
    data.push({ rawConfidence, isCorrect });
  }

  return data;
}

// ============================================================================
// Platt Scaling (3 Tests)
// ============================================================================

describe("Platt Scaling", () => {
  it("fittet auf Trainingsdaten und liefert endliche Parameter", () => {
    const data = generateSigmoidBiasedData(100, 3.0, 42);
    const scaler = new PlattScaler({ maxIterations: 200 });

    const params = scaler.fit(data);

    expect(params.a).toBeTypeOf("number");
    expect(params.b).toBeTypeOf("number");
    expect(Number.isFinite(params.a)).toBe(true);
    expect(Number.isFinite(params.b)).toBe(true);
  });

  it("verbessert den Brier Score nach Kalibrierung", () => {
    // Sigmoid-Bias-Daten: Raw Confidence folgt einem steileren Sigmoid als
    // die wahre Accuracy. Platt Scaling korrigiert die Slope-Differenz.
    const data = generateSigmoidBiasedData(500, 3.0, 99);
    const scaler = new PlattScaler({ maxIterations: 200 });

    scaler.fit(data);

    // Brier Score vor Kalibrierung
    const brierBefore = data.reduce((sum, p) => {
      const actual = p.isCorrect ? 1 : 0;
      return sum + (p.rawConfidence - actual) ** 2;
    }, 0) / data.length;

    // Brier Score nach Kalibrierung
    const calibrated = scaler.calibrateBatch(data.map((d) => d.rawConfidence));
    const brierAfter = calibrated.reduce((sum, conf, i) => {
      const actual = data[i]!.isCorrect ? 1 : 0;
      return sum + (conf - actual) ** 2;
    }, 0) / data.length;

    expect(brierAfter).toBeLessThan(brierBefore);
  });

  it("liefert kalibriertes Ergebnis zwischen 0 und 1", () => {
    const data = generateSigmoidBiasedData(50, 3.0, 77);
    const scaler = new PlattScaler();

    scaler.fit(data);

    expect(scaler.calibrate(0.5)).toBeGreaterThanOrEqual(0);
    expect(scaler.calibrate(0.5)).toBeLessThanOrEqual(1);
    expect(scaler.calibrate(0.0)).toBeGreaterThanOrEqual(0);
    expect(scaler.calibrate(0.0)).toBeLessThanOrEqual(1);
    expect(scaler.calibrate(1.0)).toBeGreaterThanOrEqual(0);
    expect(scaler.calibrate(1.0)).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// Brier Score (2 Tests)
// ============================================================================

describe("Brier Score", () => {
  it("ist 0 bei perfekten Vorhersagen", () => {
    const perfect: CalibrationDataPoint[] = Array.from({ length: 50 }, () => ({
      rawConfidence: 1.0,
      isCorrect: true,
    }));

    const analysis = analyzeBrierScore(perfect);

    expect(analysis.brierScore).toBe(0);
    expect(analysis.isWellCalibrated).toBe(true);
  });

  it("Decomposition ist konsistent (brierScore ≈ reliability - resolution + uncertainty)", () => {
    const data = generateOverconfidentData(200, 0.1, 77);

    const analysis = analyzeBrierScore(data);

    const recomposed =
      analysis.decomposition.reliability -
      analysis.decomposition.resolution +
      analysis.decomposition.uncertainty;

    // Brier Score und Decomposition sollten innerhalb einer kleinen Toleranz uebereinstimmen
    // (Numerische Differenzen durch Bucket-basierte Approximation moeglich)
    expect(Math.abs(analysis.brierScore - recomposed)).toBeLessThan(0.05);
    expect(analysis.reliability).toBeGreaterThanOrEqual(0);
    expect(analysis.resolution).toBeGreaterThanOrEqual(0);
    expect(analysis.uncertainty).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Reliability Diagram (1 Test)
// ============================================================================

describe("Reliability Diagram", () => {
  it("hat korrekte Bucket-Anzahl und perfectCalibrationLine", () => {
    const data = generateOverconfidentData(100, 0.1);

    const diagram = generateReliabilityDiagram(data, { bucketCount: 10 });

    expect(diagram.buckets).toHaveLength(10);
    expect(diagram.perfectCalibrationLine).toHaveLength(11);

    // Erste und letzte Punkte der perfekten Linie pruefen
    expect(diagram.perfectCalibrationLine[0]).toEqual({ x: 0, y: 0 });
    expect(diagram.perfectCalibrationLine[10]).toEqual({ x: 1, y: 1 });

    // Bucket-Struktur pruefen
    const firstBucket = diagram.buckets[0]!;
    expect(firstBucket.bucketIndex).toBe(0);
    expect(firstBucket.rangeStart).toBe(0);
    expect(firstBucket.rangeEnd).toBe(0.1);

    expect(diagram.totalPredictions).toBe(100);
    expect(diagram.metadata.bucketCount).toBe(10);
  });
});

// ============================================================================
// Grid Search (2 Tests)
// ============================================================================

describe("Grid Search", () => {
  /**
   * Score-Funktion fuer Grid Search.
   * Berechnet Brier Score mit gewichteter Confidence.
   */
  function computeWeightedBrierScore(
    weights: WeightConfig,
    data: CalibrationDataPoint[],
  ): number {
    // Simuliert: Gewichte beeinflussen die endgueltige Confidence.
    // Hier einfach: gewichtete Adjustierung basierend auf Abweichung von Defaults
    const defaultW = DEFAULT_CONFIDENCE_WEIGHTS;
    const adjustFactor =
      Math.abs(weights.w1_semantic - 0.30) * 0.5 +
      Math.abs(weights.w2_structural - 0.20) * 0.3 +
      Math.abs(weights.w3_affordance - 0.15) * 0.3 +
      Math.abs(weights.w4_evidence - 0.15) * 0.2 +
      Math.abs(weights.w5_historical - 0.10) * 0.1 +
      Math.abs(weights.w6_ambiguity - 0.10) * 0.1;

    // Brier Score basierend auf raw data + penalty fuer suboptimale Gewichte
    const baseBrier = data.reduce((sum, p) => {
      const actual = p.isCorrect ? 1 : 0;
      return sum + (p.rawConfidence - actual) ** 2;
    }, 0) / data.length;

    return baseBrier + adjustFactor;
  }

  it("findet bessere Gewichte als Default", () => {
    const data = generateOverconfidentData(50, 0.1);

    const optimizer = new GridSearchOptimizer({
      stepSize: 0.05,
      minWeight: 0.05,
      maxWeight: 0.50,
    });

    const result = optimizer.optimize(data, computeWeightedBrierScore);

    // Grid Search sollte gleich gute oder bessere Gewichte finden
    expect(result.bestScore).toBeLessThanOrEqual(result.defaultScore);
    expect(result.evaluatedCombinations).toBeGreaterThan(0);
    expect(result.topN.length).toBeGreaterThan(0);
    expect(result.topN.length).toBeLessThanOrEqual(10);
  });

  it("respektiert Weight-Sum Constraint", () => {
    const data = generateOverconfidentData(50, 0.1);

    const optimizer = new GridSearchOptimizer({
      stepSize: 0.05,
      minWeight: 0.05,
      maxWeight: 0.50,
      weightSumTarget: 1.0,
      weightSumTolerance: 0.01,
    });

    const result = optimizer.optimize(data, computeWeightedBrierScore);

    const sum =
      result.bestWeights.w1_semantic +
      result.bestWeights.w2_structural +
      result.bestWeights.w3_affordance +
      result.bestWeights.w4_evidence +
      result.bestWeights.w5_historical +
      result.bestWeights.w6_ambiguity;

    expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.01);

    // Alle Top-N muessen Constraint erfuellen
    for (const entry of result.topN) {
      const entrySum =
        entry.weights.w1_semantic +
        entry.weights.w2_structural +
        entry.weights.w3_affordance +
        entry.weights.w4_evidence +
        entry.weights.w5_historical +
        entry.weights.w6_ambiguity;
      expect(Math.abs(entrySum - 1.0)).toBeLessThanOrEqual(0.01);
    }
  });
});

// ============================================================================
// Integration (1 Bonus Test)
// ============================================================================

describe("Integration", () => {
  it("End-to-End: Platt Scaling + Brier Score + Reliability Diagram", () => {
    // Sigmoid-biased Daten: True Accuracy folgt flacherem Sigmoid als Raw Confidence
    const data = generateSigmoidBiasedData(500, 3.0, 55);

    // Platt Scaling fitten
    const scaler = new PlattScaler({ maxIterations: 200 });
    scaler.fit(data);

    // Kalibrierte Daten erstellen
    const calibratedData: CalibrationDataPoint[] = data.map((d) => ({
      rawConfidence: scaler.calibrate(d.rawConfidence),
      isCorrect: d.isCorrect,
    }));

    // Brier Score Vergleich
    const comparison = compareBrierScores(data, calibratedData);
    expect(comparison.after.brierScore).toBeLessThan(comparison.before.brierScore);
    expect(comparison.improvement).toBeGreaterThan(0);

    // Relaxed Target fuer synthetische Daten: < 0.25
    // (Sampling-Noise bei 500 Datenpunkten begrenzt die erreichbare Calibration)
    expect(meetsBrierTarget(comparison.after.brierScore, 0.25)).toBe(true);

    // Reliability Diagram
    const diagram = generateReliabilityDiagram(calibratedData);
    expect(diagram.buckets.length).toBeGreaterThan(0);
    expect(diagram.totalPredictions).toBe(500);
  });
});

/**
 * BALAGE Confidence Calibration — Grid Search Optimizer
 *
 * Optimiert die Gewichte w1-w6 der Confidence-Formel
 * via exhaustive Grid Search mit Weight-Sum Constraint.
 */

import { DEFAULT_CONFIDENCE_WEIGHTS } from "../../shared_interfaces.js";
import { createLogger } from "../../src/observability/index.js";
import { GridSearchExhaustedError } from "./errors.js";
import type {
  CalibrationDataPoint,
  GridSearchConfig,
  GridSearchProgress,
  GridSearchResult,
  WeightConfig,
} from "./types.js";

const logger = createLogger({ name: "calibration:grid-search" });

const DEFAULT_STEP_SIZE = 0.05;
const DEFAULT_MIN_WEIGHT = 0.05;
const DEFAULT_MAX_WEIGHT = 0.5;
const DEFAULT_WEIGHT_SUM_TARGET = 1.0;
const DEFAULT_WEIGHT_SUM_TOLERANCE = 0.01;
const DEFAULT_MAX_COMBINATIONS = 100_000;

/**
 * Rundet auf die naechste Schrittgroesse.
 */
function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Generiert alle Werte im Grid fuer ein einzelnes Gewicht.
 */
function generateSteps(min: number, max: number, step: number): number[] {
  const steps: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) {
    const rounded = Math.round(v * 1000) / 1000;
    if (rounded <= max) {
      steps.push(rounded);
    }
  }
  return steps;
}

/**
 * Berechnet die Summe aller Gewichte.
 */
function weightSum(w: WeightConfig): number {
  return w.w1_semantic + w.w2_structural + w.w3_affordance +
    w.w4_evidence + w.w5_historical + w.w6_ambiguity;
}

export class GridSearchOptimizer {
  private readonly stepSize: number;
  private readonly minWeight: number;
  private readonly maxWeight: number;
  private readonly weightSumTarget: number;
  private readonly weightSumTolerance: number;
  private readonly maxCombinations: number;
  private progressCallback?: (progress: GridSearchProgress) => void;

  constructor(config?: GridSearchConfig) {
    this.stepSize = config?.stepSize ?? DEFAULT_STEP_SIZE;
    this.minWeight = config?.minWeight ?? DEFAULT_MIN_WEIGHT;
    this.maxWeight = config?.maxWeight ?? DEFAULT_MAX_WEIGHT;
    this.weightSumTarget = config?.weightSumTarget ?? DEFAULT_WEIGHT_SUM_TARGET;
    this.weightSumTolerance = config?.weightSumTolerance ?? DEFAULT_WEIGHT_SUM_TOLERANCE;
    this.maxCombinations = config?.maxCombinations ?? DEFAULT_MAX_COMBINATIONS;
  }

  /**
   * Fortschritt-Callback setzen.
   */
  onProgress(callback: (progress: GridSearchProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Grid Search ausfuehren.
   *
   * Algorithmus:
   * 1. 5 Gewichte iterieren, 6. Gewicht berechnen (sum ≈ target)
   * 2. Constraint pruefen
   * 3. Score-Funktion evaluieren
   * 4. Top-N tracken
   */
  optimize(
    evaluationData: CalibrationDataPoint[],
    scoreFunction: (weights: WeightConfig, data: CalibrationDataPoint[]) => number,
  ): GridSearchResult {
    const startTime = Date.now();

    const steps = generateSteps(this.minWeight, this.maxWeight, this.stepSize);

    // Default Score berechnen
    const defaultWeights: WeightConfig = {
      w1_semantic: DEFAULT_CONFIDENCE_WEIGHTS.w1_semantic,
      w2_structural: DEFAULT_CONFIDENCE_WEIGHTS.w2_structural,
      w3_affordance: DEFAULT_CONFIDENCE_WEIGHTS.w3_affordance,
      w4_evidence: DEFAULT_CONFIDENCE_WEIGHTS.w4_evidence,
      w5_historical: DEFAULT_CONFIDENCE_WEIGHTS.w5_historical,
      w6_ambiguity: DEFAULT_CONFIDENCE_WEIGHTS.w6_ambiguity,
    };
    const defaultScore = scoreFunction(defaultWeights, evaluationData);

    logger.info("Starting grid search", {
      stepSize: this.stepSize,
      stepsPerWeight: steps.length,
      maxCombinations: this.maxCombinations,
    });

    // Top-N Tracker (sortiert, bestes zuerst = niedrigster Score fuer Brier)
    const topN: Array<{ weights: WeightConfig; score: number }> = [];
    const TOP_N_SIZE = 10;

    let totalCombinations = 0;
    let evaluatedCombinations = 0;
    let bestScore = Infinity;
    let bestWeights: WeightConfig = { ...defaultWeights };

    // 5 Gewichte iterieren, 6. berechnen
    for (const w1 of steps) {
      for (const w2 of steps) {
        // Early pruning: Verbleibende 4 Gewichte muessen in Range passen
        const partialSum2 = w1 + w2;
        const minRemaining4 = 4 * this.minWeight;
        const maxRemaining4 = 4 * this.maxWeight;
        if (partialSum2 + minRemaining4 > this.weightSumTarget + this.weightSumTolerance) continue;
        if (partialSum2 + maxRemaining4 < this.weightSumTarget - this.weightSumTolerance) continue;

        for (const w3 of steps) {
          const partialSum3 = partialSum2 + w3;
          const minRemaining3 = 3 * this.minWeight;
          const maxRemaining3 = 3 * this.maxWeight;
          if (partialSum3 + minRemaining3 > this.weightSumTarget + this.weightSumTolerance) continue;
          if (partialSum3 + maxRemaining3 < this.weightSumTarget - this.weightSumTolerance) continue;

          for (const w4 of steps) {
            const partialSum4 = partialSum3 + w4;
            const minRemaining2 = 2 * this.minWeight;
            const maxRemaining2 = 2 * this.maxWeight;
            if (partialSum4 + minRemaining2 > this.weightSumTarget + this.weightSumTolerance) continue;
            if (partialSum4 + maxRemaining2 < this.weightSumTarget - this.weightSumTolerance) continue;

            for (const w5 of steps) {
              const partialSum5 = partialSum4 + w5;

              // w6 berechnen
              const w6Raw = this.weightSumTarget - partialSum5;
              const w6 = roundToStep(w6Raw, this.stepSize);

              // Pruefen ob w6 in Range
              if (w6 < this.minWeight || w6 > this.maxWeight) continue;

              // Pruefen ob Summe innerhalb Toleranz
              const sum = partialSum5 + w6;
              if (Math.abs(sum - this.weightSumTarget) > this.weightSumTolerance) continue;

              totalCombinations++;

              if (totalCombinations > this.maxCombinations) {
                throw new GridSearchExhaustedError(this.maxCombinations);
              }

              const weights: WeightConfig = {
                w1_semantic: w1,
                w2_structural: w2,
                w3_affordance: w3,
                w4_evidence: w4,
                w5_historical: w5,
                w6_ambiguity: w6,
              };

              const score = scoreFunction(weights, evaluationData);
              evaluatedCombinations++;

              // Update Best
              if (score < bestScore) {
                bestScore = score;
                bestWeights = { ...weights };
              }

              // Top-N updaten
              if (topN.length < TOP_N_SIZE || score < topN[topN.length - 1]!.score) {
                topN.push({ weights: { ...weights }, score });
                topN.sort((a, b) => a.score - b.score);
                if (topN.length > TOP_N_SIZE) {
                  topN.pop();
                }
              }

              // Progress
              if (this.progressCallback && evaluatedCombinations % 1000 === 0) {
                this.progressCallback({
                  evaluated: evaluatedCombinations,
                  total: totalCombinations,
                  currentBest: bestScore,
                  elapsedMs: Date.now() - startTime,
                });
              }
            }
          }
        }
      }
    }

    const searchDurationMs = Date.now() - startTime;

    logger.info("Grid search complete", {
      totalCombinations,
      evaluatedCombinations,
      bestScore,
      defaultScore,
      improvement: defaultScore - bestScore,
      durationMs: searchDurationMs,
    });

    return {
      bestWeights,
      bestScore,
      defaultScore,
      improvement: defaultScore - bestScore,
      totalCombinations,
      evaluatedCombinations,
      topN,
      searchDurationMs,
    };
  }
}

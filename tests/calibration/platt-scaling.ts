/**
 * BALAGE Confidence Calibration — Platt Scaling
 *
 * Logistische Regression fuer Confidence-Kalibrierung.
 * Transformiert Raw-Scores in kalibrierte Wahrscheinlichkeiten
 * via Sigmoid: P(correct | score) = 1 / (1 + exp(A * score + B))
 */

import { createLogger } from "../../src/observability/index.js";
import { InsufficientDataError, PlattScalingConvergenceError } from "./errors.js";
import type { CalibrationDataPoint, PlattScalingConfig, PlattScalingParams } from "./types.js";

const logger = createLogger({ name: "calibration:platt-scaling" });

const MIN_DATA_POINTS = 20;
const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_TOLERANCE = 1e-7;
const DEFAULT_LEARNING_RATE = 0.01;

/**
 * Sigmoid-Funktion
 */
function sigmoid(x: number): number {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  }
  // Numerisch stabil fuer negative Werte
  const expX = Math.exp(x);
  return expX / (1 + expX);
}

export class PlattScaler {
  private params: PlattScalingParams = { a: 0, b: 0 };
  private fitted = false;
  private readonly maxIterations: number;
  private readonly tolerance: number;
  private readonly learningRate: number;

  constructor(config?: PlattScalingConfig) {
    this.maxIterations = config?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.tolerance = config?.tolerance ?? DEFAULT_TOLERANCE;
    this.learningRate = config?.learningRate ?? DEFAULT_LEARNING_RATE;
  }

  /**
   * Platt Scaling Parameter aus Trainingsdaten fitten.
   *
   * Verwendet Newton's Method mit Gradient-Descent-Fallback.
   * Target-Werte werden nach Platt's Methode adjustiert:
   *   t+ = (N+ + 1) / (N+ + 2)  fuer korrekte Vorhersagen
   *   t- = 1 / (N- + 2)          fuer inkorrekte Vorhersagen
   */
  fit(data: CalibrationDataPoint[]): PlattScalingParams {
    if (data.length < MIN_DATA_POINTS) {
      throw new InsufficientDataError(MIN_DATA_POINTS, data.length);
    }

    for (const point of data) {
      if (point.rawConfidence < 0 || point.rawConfidence > 1) {
        throw new InsufficientDataError(MIN_DATA_POINTS, data.length);
      }
    }

    const nPos = data.filter((d) => d.isCorrect).length;
    const nNeg = data.length - nPos;

    // Binaere Labels: 1.0 fuer korrekt, 0.0 fuer inkorrekt.
    // Fuer kleine Datasets (< 100): Platt-Smoothing (t+ = (N++1)/(N++2), t- = 1/(N-+2))
    // verhindert Overfitting. Fuer groessere Datasets: raw Labels, besser fuer Brier Score.
    const useSmoothing = data.length < 100;
    const tPos = useSmoothing ? (nPos + 1) / (nPos + 2) : 1.0;
    const tNeg = useSmoothing ? 1 / (nNeg + 2) : 0.0;

    const targets = data.map((d) => (d.isCorrect ? tPos : tNeg));
    const scores = data.map((d) => d.rawConfidence);

    // Initialisierung
    let a = 0;
    let b = Math.log((nNeg + 1) / (nPos + 1));

    logger.info("Fitting Platt Scaling", {
      dataPoints: data.length,
      nPos,
      nNeg,
      initialB: b,
    });

    let prevLoss = Infinity;
    const eps = 1e-15;

    for (let iter = 0; iter < this.maxIterations; iter++) {
      // Berechne Predictions und Gradienten
      let gradA = 0;
      let gradB = 0;
      let hessAA = 0;
      let hessAB = 0;
      let hessBB = 0;
      let loss = 0;

      for (let i = 0; i < data.length; i++) {
        const f = scores[i]!;
        const t = targets[i]!;
        const p = sigmoid(-(a * f + b));

        // Negativer Log-Likelihood
        const pClamped = Math.max(eps, Math.min(1 - eps, p));
        loss += -(t * Math.log(pClamped) + (1 - t) * Math.log(1 - pClamped));

        // Gradienten der negativen Log-Likelihood fuer Platt-Sigmoid 1/(1+exp(af+b)).
        // Bei diesem Sigmoid ist dL/da = sum((t-P)*f), nicht sum((P-t)*f).
        const diff = t - p;
        gradA += diff * f;
        gradB += diff;

        // Hessian (mit Regularisierung fuer Stabilitaet)
        const pq = p * (1 - p) + eps;
        hessAA += pq * f * f;
        hessAB += pq * f;
        hessBB += pq;
      }

      // Newton's Method: Versuche Hessian-Inverse
      const det = hessAA * hessBB - hessAB * hessAB;
      let deltaA: number;
      let deltaB: number;

      if (Math.abs(det) > 1e-10) {
        // Newton-Update (kein Step-Size-Limit; Line Search regelt)
        deltaA = (hessBB * gradA - hessAB * gradB) / det;
        deltaB = (hessAA * gradB - hessAB * gradA) / det;
      } else {
        // Fallback: Gradient Descent mit skaliertem LR
        deltaA = this.learningRate * gradA;
        deltaB = this.learningRate * gradB;
        logger.debug("Hessian singular, falling back to gradient descent", { iter });
      }

      // Backtracking Line Search: Halbiert Step bis Loss abnimmt
      let stepScale = 1.0;
      let accepted = false;
      for (let ls = 0; ls < 20; ls++) {
        const candidateA = a - stepScale * deltaA;
        const candidateB = b - stepScale * deltaB;

        let candidateLoss = 0;
        for (let i = 0; i < data.length; i++) {
          const f = scores[i]!;
          const t = targets[i]!;
          const p = sigmoid(-(candidateA * f + candidateB));
          const pClamped = Math.max(eps, Math.min(1 - eps, p));
          candidateLoss += -(t * Math.log(pClamped) + (1 - t) * Math.log(1 - pClamped));
        }

        if (candidateLoss < loss) {
          a = candidateA;
          b = candidateB;
          loss = candidateLoss;
          accepted = true;
          break;
        }
        stepScale *= 0.5;
      }

      // Falls Line Search scheitert, kleinen GD-Schritt machen
      if (!accepted) {
        const gradNorm = Math.sqrt(gradA * gradA + gradB * gradB);
        if (gradNorm > eps) {
          a -= (this.learningRate / data.length) * gradA;
          b -= (this.learningRate / data.length) * gradB;
        }
      }

      // Konvergenz-Check
      const lossChange = Math.abs(prevLoss - loss);
      if (lossChange < this.tolerance && iter > 0) {
        logger.info("Platt Scaling converged", {
          iterations: iter + 1,
          finalLoss: loss,
          a,
          b,
        });
        this.params = { a, b };
        this.fitted = true;
        return { ...this.params };
      }

      prevLoss = loss;
    }

    // Falls nicht konvergiert, trotzdem Params setzen (oft gut genug)
    logger.warn("Platt Scaling did not fully converge, using last parameters", {
      maxIterations: this.maxIterations,
      a,
      b,
    });
    this.params = { a, b };
    this.fitted = true;
    return { ...this.params };
  }

  /**
   * Raw Confidence in kalibrierte Confidence transformieren.
   */
  calibrate(rawConfidence: number): number {
    const result = sigmoid(-(this.params.a * rawConfidence + this.params.b));
    return Math.max(0, Math.min(1, result));
  }

  /**
   * Batch-Kalibrierung.
   */
  calibrateBatch(rawConfidences: number[]): number[] {
    return rawConfidences.map((c) => this.calibrate(c));
  }

  /**
   * Aktuelle Parameter abrufen.
   */
  getParams(): PlattScalingParams {
    return { ...this.params };
  }

  /**
   * Parameter manuell setzen (z.B. aus gespeichertem Modell).
   */
  setParams(params: PlattScalingParams): void {
    this.params = { ...params };
    this.fitted = true;
  }
}

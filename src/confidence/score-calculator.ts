/**
 * Confidence Engine — Score Calculator
 *
 * Gewichtete Score-Berechnung: Alle 6 Faktoren auswerten,
 * gewichtet summieren, optional kalibrieren.
 */

import pino from "pino";
import { ConfidenceScoreSchema } from "../../shared_interfaces.js";
import type { Endpoint, Evidence, ConfidenceScore } from "./types.js";
import type { ScoreOptions } from "./types.js";
import { getWeights } from "./weight-config.js";
import { applyCalibration } from "./calibrator.js";
import { computeSemanticMatch } from "./factors/semantic-match.js";
import { computeStructuralStability } from "./factors/structural-stability.js";
import { computeAffordanceConsistency } from "./factors/affordance-consistency.js";
import { computeEvidenceQuality } from "./factors/evidence-quality.js";
import { computeHistoricalSuccess } from "./factors/historical-success.js";
import { computeAmbiguityPenalty } from "./factors/ambiguity-penalty.js";
import { ScoreCalculationError } from "./errors.js";

const logger = pino({ name: "confidence:score-calculator" });

/**
 * Berechnet den Confidence-Score fuer einen Endpoint.
 *
 * Formel:
 *   score = w1*semantic + w2*structural + w3*affordance
 *         + w4*evidence + w5*historical - w6*ambiguity
 */
export function calculateScore(
  endpoint: Endpoint,
  evidence: Evidence[],
  options?: ScoreOptions,
): ConfidenceScore {
  const weights = getWeights(options?.weights);
  const history = options?.fingerprintHistory ?? [];
  const allEndpoints = options?.allEndpoints ?? [];
  const calibrationParams = options?.calibrationParams ?? null;

  // Faktor-Berechnung (jeweils mit NaN-Handling)
  const semanticMatch = safeFactor("semanticMatch", () =>
    computeSemanticMatch(endpoint),
  );
  const structuralStability = safeFactor("structuralStability", () =>
    computeStructuralStability(endpoint, history),
  );
  const affordanceConsistency = safeFactor("affordanceConsistency", () =>
    computeAffordanceConsistency(endpoint),
  );
  const evidenceQuality = safeFactor("evidenceQuality", () =>
    computeEvidenceQuality(evidence),
  );
  const historicalSuccess = safeFactor("historicalSuccess", () =>
    computeHistoricalSuccess(endpoint),
  );
  const ambiguityPenalty = safeFactor("ambiguityPenalty", () =>
    computeAmbiguityPenalty(endpoint, allEndpoints),
  );

  // Gewichtete Summe (w6 wird subtrahiert)
  const rawScore =
    weights.w1_semantic * semanticMatch +
    weights.w2_structural * structuralStability +
    weights.w3_affordance * affordanceConsistency +
    weights.w4_evidence * evidenceQuality +
    weights.w5_historical * historicalSuccess -
    weights.w6_ambiguity * ambiguityPenalty;

  // Calibration anwenden
  const calibratedScore = applyCalibration(rawScore, calibrationParams);

  // Clamping
  const finalScore = Math.min(1.0, Math.max(0.0, calibratedScore));

  const result = ConfidenceScoreSchema.parse({
    score: finalScore,
    weights: {
      w1_semantic: weights.w1_semantic,
      w2_structural: weights.w2_structural,
      w3_affordance: weights.w3_affordance,
      w4_evidence: weights.w4_evidence,
      w5_historical: weights.w5_historical,
      w6_ambiguity: weights.w6_ambiguity,
    },
    breakdown: {
      semanticMatch,
      structuralStability,
      affordanceConsistency,
      evidenceQuality,
      historicalSuccess,
      ambiguityPenalty,
    },
    evidence,
  });

  logger.debug(
    {
      endpointId: endpoint.id,
      score: finalScore,
      rawScore,
      breakdown: result.breakdown,
    },
    "Confidence-Score berechnet",
  );

  return result;
}

/**
 * Batch-Berechnung fuer mehrere Endpoints.
 * Keine shared mutable State — parallel-sicher.
 */
export function calculateBatchScores(
  endpoints: Endpoint[],
  evidence: Map<string, Evidence[]>,
  options?: ScoreOptions,
): ConfidenceScore[] {
  return endpoints.map((endpoint) => {
    const endpointEvidence = evidence.get(endpoint.id) ?? [];
    return calculateScore(endpoint, endpointEvidence, {
      ...options,
      allEndpoints: endpoints,
    });
  });
}

/**
 * Fuehrt eine Faktor-Berechnung aus mit NaN-Handling.
 * NaN → 0.0 + Error-Log.
 */
function safeFactor(name: string, compute: () => number): number {
  try {
    const value = compute();
    if (Number.isNaN(value)) {
      logger.error({ factor: name }, "Faktor lieferte NaN — wird auf 0.0 gesetzt");
      return 0.0;
    }
    return Math.min(1.0, Math.max(0.0, value));
  } catch (err) {
    logger.error(
      { factor: name, error: err instanceof Error ? err.message : String(err) },
      "Faktor-Berechnung fehlgeschlagen — wird auf 0.0 gesetzt",
    );
    return 0.0;
  }
}

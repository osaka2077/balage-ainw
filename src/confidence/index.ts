/**
 * Confidence Engine — Public API
 *
 * BALAGE Layer 4a: Quantifizierte Konfidenz fuer jeden Endpoint.
 */

// Core
export { calculateScore, calculateBatchScores } from "./score-calculator.js";
export { collectEvidence, detectContradictions } from "./evidence-collector.js";
export { calibrate, applyCalibration, evaluateCalibration } from "./calibrator.js";
export { getWeights, validateWeights, ECOMMERCE_WEIGHTS, AUTH_WEIGHTS } from "./weight-config.js";

// Faktoren (fuer individuelle Nutzung)
export { computeSemanticMatch } from "./factors/semantic-match.js";
export { computeStructuralStability } from "./factors/structural-stability.js";
export { computeAffordanceConsistency } from "./factors/affordance-consistency.js";
export { computeEvidenceQuality } from "./factors/evidence-quality.js";
export { computeHistoricalSuccess } from "./factors/historical-success.js";
export { computeAmbiguityPenalty } from "./factors/ambiguity-penalty.js";

// Typen
export type {
  ScoreOptions,
  WeightOverrides,
  ValidatedWeights,
  CalibrationDataPoint,
  CalibrationParams,
  CalibrationMetrics,
  EvidenceContradiction,
} from "./types.js";

// Error-Klassen
export {
  ConfidenceError,
  ScoreCalculationError,
  FactorComputationError,
  CalibrationError,
  EvidenceCollectionError,
  WeightValidationError,
} from "./errors.js";

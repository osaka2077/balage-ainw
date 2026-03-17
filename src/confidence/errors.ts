/**
 * Confidence Engine — Error-Klassen
 */

export class ConfidenceError extends Error {
  readonly code: string;
  override readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = "ConfidenceError";
    this.code = code;
    this.cause = cause;
  }
}

export class ScoreCalculationError extends ConfidenceError {
  constructor(message: string, cause?: Error) {
    super(message, "SCORE_CALCULATION_ERROR", cause);
    this.name = "ScoreCalculationError";
  }
}

export class FactorComputationError extends ConfidenceError {
  readonly factorName: string;

  constructor(factorName: string, message: string, cause?: Error) {
    super(message, "FACTOR_COMPUTATION_ERROR", cause);
    this.name = "FactorComputationError";
    this.factorName = factorName;
  }
}

export class CalibrationError extends ConfidenceError {
  constructor(message: string, cause?: Error) {
    super(message, "CALIBRATION_ERROR", cause);
    this.name = "CalibrationError";
  }
}

export class EvidenceCollectionError extends ConfidenceError {
  constructor(message: string, cause?: Error) {
    super(message, "EVIDENCE_COLLECTION_ERROR", cause);
    this.name = "EvidenceCollectionError";
  }
}

export class WeightValidationError extends ConfidenceError {
  constructor(message: string, cause?: Error) {
    super(message, "WEIGHT_VALIDATION_ERROR", cause);
    this.name = "WeightValidationError";
  }
}

/**
 * Fingerprint-Engine-spezifische Error-Klassen
 *
 * Jede Fehlerklasse hat einen maschinenlesbaren `code` und
 * optionale `cause` fuer Error-Chaining.
 */

export class FingerprintError extends Error {
  readonly code: string;
  declare readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = cause;
  }
}

export class FeatureExtractionError extends FingerprintError {
  constructor(message: string, cause?: Error) {
    super(message, "FEATURE_EXTRACTION_ERROR", cause);
  }
}

export class HashCalculationError extends FingerprintError {
  constructor(message: string, cause?: Error) {
    super(message, "HASH_CALCULATION_ERROR", cause);
  }
}

export class SimilarityCalculationError extends FingerprintError {
  constructor(message: string, cause?: Error) {
    super(message, "SIMILARITY_CALCULATION_ERROR", cause);
  }
}

export class StoreError extends FingerprintError {
  constructor(message: string, cause?: Error) {
    super(message, "STORE_ERROR", cause);
  }
}

export class DriftDetectionError extends FingerprintError {
  constructor(message: string, cause?: Error) {
    super(message, "DRIFT_DETECTION_ERROR", cause);
  }
}

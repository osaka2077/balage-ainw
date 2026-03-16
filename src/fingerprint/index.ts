/**
 * Fingerprint Engine — Public API.
 * Exportiert nur was andere Layer brauchen.
 */

// Core-Funktionen
export {
  extractFeatures,
  extractFormFields,
  extractActionElements,
} from "./feature-extractor.js";
export {
  calculateFingerprint,
  hashFeatures,
  canonicalize,
} from "./fingerprint-calculator.js";
export {
  calculateSimilarity,
  cosineSimilarity,
  jaccardSimilarity,
} from "./similarity.js";
export { FingerprintStore } from "./fingerprint-store.js";
export {
  detectDrift,
  detectDelta,
  analyzeTrend,
} from "./drift-detector.js";

// Typen
export type {
  SimilarityOptions,
  SimilarityResult,
  StoredFingerprint,
  FingerprintStoreOptions,
  DriftResult,
  DeltaResult,
  TrendAnalysis,
} from "./types.js";

// Error-Klassen
export {
  FingerprintError,
  FeatureExtractionError,
  HashCalculationError,
  SimilarityCalculationError,
  StoreError,
  DriftDetectionError,
} from "./errors.js";

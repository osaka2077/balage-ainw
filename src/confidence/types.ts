/**
 * Confidence Engine — Lokale Typen + Re-Exports
 */

// Re-Exports aus shared_interfaces
export type {
  ConfidenceScore,
  Evidence,
  EvidenceType,
  Endpoint,
  SemanticFingerprint,
  FingerprintFeatures,
  Affordance,
  RiskLevel,
  UISegment,
} from "../../shared_interfaces.js";

/** Optionen fuer Score-Berechnung */
export interface ScoreOptions {
  weights?: Partial<WeightOverrides>;
  calibrationParams?: CalibrationParams | null;
  allEndpoints?: import("../../shared_interfaces.js").Endpoint[];
  fingerprintHistory?: import("../../shared_interfaces.js").SemanticFingerprint[];
}

/** Gewichte-Overrides (Partial, wird mit Defaults gemergt) */
export interface WeightOverrides {
  w1_semantic: number;
  w2_structural: number;
  w3_affordance: number;
  w4_evidence: number;
  w5_historical: number;
  w6_ambiguity: number;
}

/** Validierte Gewichte (Summe = 1.0) */
export interface ValidatedWeights extends WeightOverrides {
  _validated: true;
}

/** Datenpunkt fuer Platt Scaling Kalibrierung */
export interface CalibrationDataPoint {
  predicted: number;
  actual: boolean;
}

/** Kalibrierungsparameter (Sigmoid: 1 / (1 + exp(a*f + b))) */
export interface CalibrationParams {
  a: number;
  b: number;
  dataPoints: number;
  brierScore: number;
  createdAt: Date;
}

/** Kalibrierungsmetriken */
export interface CalibrationMetrics {
  brierScore: number;
  ece: number;
  binCount: number;
  isWellCalibrated: boolean;
}

/** Widerspruch in Evidence */
export interface EvidenceContradiction {
  signal1: { type: string; value: string };
  signal2: { type: string; value: string };
  severity: number;
  description: string;
}

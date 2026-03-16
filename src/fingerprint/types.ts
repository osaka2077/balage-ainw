/**
 * Fingerprint-Engine-Typen: Re-Exports aus shared_interfaces + lokale Typen
 */

import type {
  UISegment as _UISegment,
  UISegmentType as _UISegmentType,
  DomNode as _DomNode,
  BoundingBox as _BoundingBox,
  SemanticFingerprint as _SemanticFingerprint,
  FingerprintFeatures as _FingerprintFeatures,
  FormFieldSignature as _FormFieldSignature,
  ActionSignature as _ActionSignature,
} from "../../shared_interfaces.js";

// Re-Exports aus shared_interfaces (READ-ONLY)
export type UISegment = _UISegment;
export type UISegmentType = _UISegmentType;
export type DomNode = _DomNode;
export type BoundingBox = _BoundingBox;
export type SemanticFingerprint = _SemanticFingerprint;
export type FingerprintFeatures = _FingerprintFeatures;
export type FormFieldSignature = _FormFieldSignature;
export type ActionSignature = _ActionSignature;

export {
  SemanticFingerprintSchema,
  FingerprintFeaturesSchema,
  FormFieldSignatureSchema,
  ActionSignatureSchema,
  UISegmentSchema,
} from "../../shared_interfaces.js";

// ============================================================================
// Lokale Typen
// ============================================================================

/** Optionen fuer Similarity-Berechnung */
export interface SimilarityOptions {
  /** Gewichtung der Teil-Similarities */
  weights?: {
    structural?: number;
    semantic?: number;
    textual?: number;
    layout?: number;
  };
}

/** Ergebnis der Similarity-Berechnung */
export interface SimilarityResult {
  /** Gesamt-Score (0.0 - 1.0) */
  score: number;
  /** Aufschluesselung nach Kategorie */
  breakdown: {
    structural: number;
    semantic: number;
    textual: number;
    layout: number;
  };
  /** Liste der gematchten Features */
  matchedFeatures: string[];
}

/** Gespeicherter Fingerprint mit Metadaten */
export interface StoredFingerprint {
  fingerprint: SemanticFingerprint;
  siteId: string;
  url: string;
  storedAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
}

/** Optionen fuer den Fingerprint-Store */
export interface FingerprintStoreOptions {
  /** Maximale Anzahl gespeicherter Fingerprints (Default: 1000) */
  maxSize?: number;
}

/** Ergebnis der Drift-Erkennung */
export interface DriftResult {
  /** Similarity-Score (0.0 - 1.0) */
  similarity: number;
  /** Drift-Score (1.0 - similarity) */
  driftScore: number;
  /** Drift-Level basierend auf Thresholds */
  level: "ignore" | "log" | "re_evaluate" | "invalidate";
  /** Welche Features haben sich geaendert? */
  changedFeatures: Array<{
    feature: string;
    delta: number;
    description: string;
  }>;
}

/** Ergebnis der Delta-Erkennung */
export interface DeltaResult {
  addedFeatures: string[];
  removedFeatures: string[];
  modifiedFeatures: Array<{
    feature: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
}

/** Trend-Analyse ueber mehrere Versionen */
export interface TrendAnalysis {
  direction: "stable" | "drifting" | "diverging" | "insufficient_data";
  averageDriftPerVersion: number;
  recommendation: "no_action" | "monitor" | "re_evaluate" | "invalidate";
  dataPoints: number;
}

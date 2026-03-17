/**
 * Safety Tests — Hilfsfunktionen
 *
 * Factories und Assertions fuer die Safety-Tests.
 */

import type { ConfidenceScore, Evidence } from "../../shared_interfaces.js";
import type { GateContext } from "../../src/risk/types.js";
import { DEFAULT_CONFIDENCE_WEIGHTS } from "../../shared_interfaces.js";
import { RiskGate } from "../../src/risk/gate.js";

/**
 * Baut einen ConfidenceScore mit vorgegebenen Breakdown-Werten.
 * Berechnet den Score aus den Faktoren + Default-Gewichten.
 */
export function buildConfidenceScore(breakdown: {
  semanticMatch: number;
  structuralStability: number;
  affordanceConsistency: number;
  evidenceQuality: number;
  historicalSuccess: number;
  ambiguityPenalty: number;
}, evidence: Evidence[] = []): ConfidenceScore {
  const w = DEFAULT_CONFIDENCE_WEIGHTS;
  const b = breakdown;

  const score = Math.min(1.0, Math.max(0.0,
    w.w1_semantic * b.semanticMatch +
    w.w2_structural * b.structuralStability +
    w.w3_affordance * b.affordanceConsistency +
    w.w4_evidence * b.evidenceQuality +
    w.w5_historical * b.historicalSuccess -
    w.w6_ambiguity * b.ambiguityPenalty
  ));

  return {
    score,
    weights: { ...w },
    breakdown: { ...b },
    evidence,
  };
}

/**
 * Baut einen ConfidenceScore mit fixem Score-Wert.
 * Fuer Tests die einen exakten Score brauchen, unabhaengig von Faktoren.
 */
export function buildFixedConfidenceScore(
  score: number,
  evidence: Evidence[] = [],
): ConfidenceScore {
  return {
    score,
    weights: { ...DEFAULT_CONFIDENCE_WEIGHTS },
    breakdown: {
      semanticMatch: score,
      structuralStability: score,
      affordanceConsistency: score,
      evidenceQuality: score,
      historicalSuccess: score,
      ambiguityPenalty: 0.0,
    },
    evidence,
  };
}

/** Erstellt eine frische RiskGate-Instanz ohne Overrides */
export function createGate(): RiskGate {
  return new RiskGate();
}

/** Erzeugt einen Standard-GateContext */
export function createContext(evidence: Evidence[] = []): GateContext {
  return {
    sessionId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    evidence,
    domain: "test.example.com",
  };
}

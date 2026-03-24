/**
 * verify() — Scoring Engine
 *
 * Gewichtete Confidence-Aggregation ueber Check-Ergebnisse.
 */

import type { CheckResult, VerificationVerdict } from "./verify-types.js";

const VERIFIED_THRESHOLD = 0.65;
const FAILED_THRESHOLD = 0.35;

/**
 * Berechnet gewichteten Score aus Check-Ergebnissen.
 *
 * Checks mit `weight` werden gewichtet aggregiert.
 * Checks ohne `weight` fliessen als Bonus ein (max +0.1).
 */
export function computeWeightedScore(checks: CheckResult[]): number {
  const weighted = checks.filter(c => c.weight !== undefined && c.weight > 0);
  const unweighted = checks.filter(c => c.weight === undefined || c.weight <= 0);

  if (weighted.length === 0 && unweighted.length === 0) return 0;

  if (weighted.length > 0) {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const check of weighted) {
      const w = check.weight!;
      totalWeight += w;
      if (check.passed) {
        weightedSum += w * check.confidence;
      }
    }

    // Unweighted checks als Bonus (max 0.1)
    let bonus = 0;
    if (unweighted.length > 0) {
      const passedCount = unweighted.filter(c => c.passed).length;
      bonus = (passedCount / unweighted.length) * 0.1;
    }

    return totalWeight > 0
      ? Math.min(1.0, weightedSum / totalWeight + bonus)
      : 0;
  }

  // Fallback: Gleichgewichtet
  const passed = unweighted.filter(c => c.passed);
  return passed.reduce((sum, c) => sum + c.confidence, 0) / unweighted.length;
}

export function determineVerdict(score: number): VerificationVerdict {
  if (score >= VERIFIED_THRESHOLD) return "verified";
  if (score <= FAILED_THRESHOLD) return "failed";
  return "inconclusive";
}

/** Traegt Gewichte in CheckResults ein. */
export function applyWeights(
  checks: CheckResult[],
  weights: Record<string, number>,
): CheckResult[] {
  return checks.map(check => ({
    ...check,
    weight: weights[check.name] ?? check.weight,
  }));
}

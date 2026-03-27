/**
 * Post-Processing: Gap-basierter Confidence-Cutoff
 *
 * Findet die natuerliche Trennlinie zwischen echten und Noise-Endpoints
 * basierend auf Confidence-Gaps.
 */

import type { EndpointCandidate } from "../types.js";

/**
 * Dynamischer Safety-Cap: Maximum an Endpoints skaliert mit Candidate-Anzahl.
 *
 * Problem: Globaler Cap 8 trifft 13/20 Sites im Benchmark — Hauptquelle fuer
 * False Positives. Sites mit wenigen Candidates (5-6) brauchen keinen Cap 8,
 * Sites mit vielen (15+) sind trotzdem auf 8 begrenzt.
 *
 * Formel: cap = min(max(4, ceil(candidateCount * 0.6)), 8)
 * - Mindestens 4 (kleine Sites nicht beschneiden)
 * - Maximal 60% der Candidates ueberleben
 * - Absolutes Maximum bleibt 8 (95% GT-Abdeckung)
 *
 * Beispiele:
 * - 5 Candidates → cap = max(4, 3) = 4
 * - 8 Candidates → cap = max(4, 5) = 5
 * - 10 Candidates → cap = max(4, 6) = 6
 * - 15 Candidates → cap = min(9, 8) = 8
 */
export function calculateDynamicCap(candidateCount: number): number {
  return Math.min(Math.max(4, Math.ceil(candidateCount * 0.6)), 8);
}

/**
 * Mindestanzahl Endpoints die immer behalten werden (keine Cuts davor).
 * Garantiert dass kleine Sites (3-6 GT) nicht abgeschnitten werden.
 */
const MIN_ENDPOINTS = 3;

/**
 * Minimaler Confidence-Gap um als Trennlinie zu gelten.
 * 0.18 erfordert einen deutlichen Sprung — verhindert aggressive Schnitte
 * bei moderaten Confidence-Unterschieden (0.12 war zu niedrig).
 */
const GAP_THRESHOLD = 0.18;

/**
 * Wendet Gap-basierten Confidence-Cutoff an.
 *
 * Sortiert Candidates nach Confidence (absteigend), sucht den groessten Gap
 * nach MIN_ENDPOINTS, und schneidet dort ab wenn der Gap >= GAP_THRESHOLD.
 *
 * @returns Neue, gefilterte Liste (keine Mutation des Inputs)
 */
export function applyGapCutoff(
  candidates: EndpointCandidate[],
): EndpointCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);

  let cutoffIndex = sorted.length;
  if (sorted.length > MIN_ENDPOINTS) {
    let maxGap = 0;
    for (let i = MIN_ENDPOINTS; i < sorted.length; i++) {
      const gap = sorted[i - 1]!.confidence - sorted[i]!.confidence;
      if (gap > maxGap && gap >= GAP_THRESHOLD) {
        maxGap = gap;
        cutoffIndex = i;
      }
    }
  }

  const dynamicCap = calculateDynamicCap(candidates.length);
  return sorted.slice(0, Math.min(cutoffIndex, dynamicCap));
}

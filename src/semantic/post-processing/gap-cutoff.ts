/**
 * Post-Processing: Gap-basierter Confidence-Cutoff
 *
 * Findet die natuerliche Trennlinie zwischen echten und Noise-Endpoints
 * basierend auf Confidence-Gaps.
 */

import type { EndpointCandidate } from "../types.js";

/**
 * Safety-Cap: Absolutes Maximum an Endpoints (unabhaengig von Gap).
 *
 * Gesenkt von 10 auf 8: Die meisten Sites haben 5-8 echte Endpoints.
 * Cap 10 liess Over-Detection bei wikipedia (10), stripe (10), shopify (10)
 * durch wenn der Gap-Cutoff keinen klaren Gap fand.
 * Cap 8 deckt 95% der Ground-Truth-Verteilung ab (max GT ist 9 bei zalando).
 */
const SAFETY_CAP = 8;

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

  return sorted.slice(0, Math.min(cutoffIndex, SAFETY_CAP));
}

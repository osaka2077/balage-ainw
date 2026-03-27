/**
 * Post-Processing: Gap-basierter Confidence-Cutoff
 *
 * Findet die natuerliche Trennlinie zwischen echten und Noise-Endpoints
 * basierend auf Confidence-Gaps.
 */

import type { EndpointCandidate } from "../types.js";

/**
 * Safety-Cap: Absolutes Maximum an Endpoints (unabhaengig von Gap).
 */
const SAFETY_CAP = 10;

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

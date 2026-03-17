/**
 * Faktor 5 — Historical Success (w5 = 0.10)
 *
 * Basiert auf successCount und failureCount des Endpoints.
 * Keine Historie → 0.5 (neutral).
 * Min 3 Datenpunkte fuer zuverlaessigen Score, sonst Interpolation zu 0.5.
 * Pure Function.
 */

import type { Endpoint } from "../../../shared_interfaces.js";

const MIN_DATA_POINTS = 3;
const NEUTRAL_SCORE = 0.5;

/**
 * Berechnet den Historical Success Score.
 */
export function computeHistoricalSuccess(endpoint: Endpoint): number {
  const total = endpoint.successCount + endpoint.failureCount;

  if (total === 0) {
    return NEUTRAL_SCORE;
  }

  const rawRate = endpoint.successCount / total;

  // Bei weniger als MIN_DATA_POINTS: zum neutralen Score interpolieren
  if (total < MIN_DATA_POINTS) {
    const confidence = total / MIN_DATA_POINTS;
    return NEUTRAL_SCORE + (rawRate - NEUTRAL_SCORE) * confidence;
  }

  return Math.min(1.0, Math.max(0.0, rawRate));
}

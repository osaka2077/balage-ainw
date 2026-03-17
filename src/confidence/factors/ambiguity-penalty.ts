/**
 * Faktor 6 — Ambiguity Penalty (w6 = 0.10)
 *
 * Penalty fuer mehrdeutige Endpoints. Wird SUBTRAHIERT.
 * penalty = min(1.0, similar_count * 0.25)
 * Pure Function.
 */

import type { Endpoint } from "../../../shared_interfaces.js";

/**
 * Berechnet die Ambiguity Penalty.
 *
 * - Keine aehnlichen Endpoints → 0.0 (keine Penalty)
 * - Aehnliche Endpoints (gleicher Fingerprint-Hash oder gleicher Typ + aehnliche Position) → Penalty steigt
 */
export function computeAmbiguityPenalty(
  endpoint: Endpoint,
  allEndpoints: Endpoint[],
): number {
  // Nur andere Endpoints betrachten
  const others = allEndpoints.filter((e) => e.id !== endpoint.id);

  if (others.length === 0) {
    return 0.0;
  }

  let similarCount = 0;

  for (const other of others) {
    if (isSimilar(endpoint, other)) {
      similarCount++;
    }
  }

  return Math.min(1.0, similarCount * 0.25);
}

/** Prueft ob zwei Endpoints aehnlich genug sind fuer Ambiguitaet */
function isSimilar(a: Endpoint, b: Endpoint): boolean {
  // Gleicher Fingerprint-Hash → definitiv aehnlich
  if (
    a.fingerprint &&
    b.fingerprint &&
    a.fingerprint.hash === b.fingerprint.hash
  ) {
    return true;
  }

  // Gleicher Typ + gleiche URL → potentiell mehrdeutig
  if (a.type === b.type && a.url === b.url) {
    return true;
  }

  return false;
}

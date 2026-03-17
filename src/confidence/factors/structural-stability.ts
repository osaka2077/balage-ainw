/**
 * Faktor 2 — Structural Stability (w2 = 0.20)
 *
 * Vergleicht den aktuellen Fingerprint mit historischen.
 * Stabil ueber Zeit = hoher Score. Pure Function.
 */

import pino from "pino";
import type { Endpoint, SemanticFingerprint } from "../../../shared_interfaces.js";

const logger = pino({ name: "confidence:structural-stability" });

/**
 * Berechnet den Structural Stability Score.
 *
 * - Kein Fingerprint → 0.5 (neutral)
 * - Keine Historie → 0.5 (neutral)
 * - Gleicher Hash in Historie → 0.8-1.0 (stabil)
 * - Anderer Hash → 0.0-0.7 (instabil)
 */
export function computeStructuralStability(
  endpoint: Endpoint,
  history: SemanticFingerprint[],
): number {
  if (!endpoint.fingerprint) {
    logger.debug({ endpointId: endpoint.id }, "Kein Fingerprint vorhanden — neutraler Score");
    return 0.5;
  }

  if (history.length === 0) {
    logger.debug({ endpointId: endpoint.id }, "Keine Fingerprint-Historie — neutraler Score");
    return 0.5;
  }

  const currentHash = endpoint.fingerprint.hash;

  // Zaehle wie viele historische Fingerprints den gleichen Hash haben
  let exactMatches = 0;
  for (const fp of history) {
    if (fp.hash === currentHash) {
      exactMatches++;
    }
  }

  const matchRatio = exactMatches / history.length;

  if (matchRatio >= 1.0) {
    // Alle historischen Eintraege identisch → sehr stabil
    return Math.min(1.0, 0.8 + history.length * 0.05);
  }

  if (matchRatio >= 0.5) {
    // Mehr als die Haelfte identisch → leicht instabil
    return 0.5 + matchRatio * 0.4;
  }

  // Feature-basierter Vergleich mit dem letzten Eintrag als Fallback
  const lastFp = history[history.length - 1];
  if (lastFp) {
    const featureSimilarity = computeFeatureSimilarity(
      endpoint.fingerprint,
      lastFp,
    );
    return featureSimilarity * 0.7;
  }

  return matchRatio * 0.5;
}

/** Einfache Feature-Similarity basierend auf strukturellen Merkmalen */
function computeFeatureSimilarity(
  current: SemanticFingerprint,
  previous: SemanticFingerprint,
): number {
  const f1 = current.features;
  const f2 = previous.features;

  let score = 0;
  let factors = 0;

  // Semantische Rolle
  if (f1.semanticRole === f2.semanticRole) {
    score += 1;
  }
  factors++;

  // Layout-Region
  if (f1.layoutRegion === f2.layoutRegion) {
    score += 1;
  }
  factors++;

  // DOM-Tiefe (aehnlich wenn Differenz < 3)
  const depthDiff = Math.abs(f1.domDepth - f2.domDepth);
  score += Math.max(0, 1 - depthDiff / 5);
  factors++;

  // Interactive Element Count
  const interactiveDiff = Math.abs(
    f1.interactiveElementCount - f2.interactiveElementCount,
  );
  score += Math.max(0, 1 - interactiveDiff / 10);
  factors++;

  // Form Fields Anzahl
  const fieldDiff = Math.abs(f1.formFields.length - f2.formFields.length);
  score += Math.max(0, 1 - fieldDiff / 5);
  factors++;

  return factors > 0 ? score / factors : 0.5;
}

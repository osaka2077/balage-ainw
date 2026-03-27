/**
 * Post-Processing: Deduplizierung
 *
 * Entfernt doppelte Candidates basierend auf Typ + fuzzy Label-Similarity.
 * Wendet per-type Caps an um Typ-Dominanz zu verhindern.
 */

import type { EndpointCandidate } from "../types.js";

/** Commerce-Action-Pattern fuer Dedup */
const COMMERCE_ACTION_PATTERN = /add to cart|add to bag|in den warenkorb|zum warenkorb/i;

/**
 * Per-type cap: differenzierte Limits pro Typ.
 *
 * navigation: 5 → 3 — Die meisten Sites haben 1-2 Navigation-Endpoints.
 *   Cap 5 liess zu viele durch und war Haupttreiber fuer False Positives.
 * content: 3 → 2 — Content-Endpoints sind selten primaere Interaktionspunkte.
 *   Cap 3 erlaubte Over-Detection bei content-lastigen Sites.
 */
const TYPE_CAPS: Record<string, number> = {
  navigation: 3,
  auth: 4,
  search: 1,
  commerce: 2,
  checkout: 1,
  consent: 1,
  settings: 2,
  support: 2,
  content: 2,
  media: 2,
  social: 1,
  form: 2,
};

/**
 * Berechnet Jaccard-aehnliche Wort-Similarity zwischen zwei Labels.
 *
 * Wird auch extern benoetigt (z.B. Benchmark-Matching).
 */
export function labelSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

/**
 * Dedupliziert Candidates basierend auf Type + fuzzy Label-Similarity + per-type cap.
 *
 * Schritte:
 * 1. Fuzzy-Dedup: Gleicher Typ + labelSimilarity > 0.65 -> behalte hoechste Confidence
 * 2. Commerce-Dedup: Mehrere "Add to Cart" = 1 Endpoint
 * 3. Per-Type-Cap: Max Anzahl pro Typ begrenzt
 */
export function deduplicateCandidates(
  candidates: EndpointCandidate[],
): EndpointCandidate[] {
  const result: EndpointCandidate[] = [];

  // 1. Fuzzy-Dedup
  for (const candidate of candidates) {
    const duplicate = result.find(
      (existing) =>
        existing.type === candidate.type &&
        labelSimilarity(existing.label, candidate.label) > 0.65,
    );

    if (duplicate) {
      // Behalte den mit hoeherer Confidence
      if (candidate.confidence > duplicate.confidence) {
        const idx = result.indexOf(duplicate);
        result[idx] = candidate;
      }
    } else {
      result.push(candidate);
    }
  }

  // 2. Commerce-Dedup: Mehrere "Add to Cart" = 1 Endpoint
  const commerceDeduped = result.filter((candidate, index) => {
    if (candidate.type === "commerce" || candidate.type === "checkout") {
      if (COMMERCE_ACTION_PATTERN.test(candidate.label)) {
        const firstCommerce = result.findIndex(
          c => (c.type === "commerce" || c.type === "checkout") && COMMERCE_ACTION_PATTERN.test(c.label),
        );
        return index === firstCommerce;
      }
    }
    return true;
  });

  // 3. Per-type cap
  const typeCount = new Map<string, number>();
  return commerceDeduped.filter((c) => {
    const count = typeCount.get(c.type) ?? 0;
    if (count >= (TYPE_CAPS[c.type] ?? 2)) return false;
    typeCount.set(c.type, count + 1);
    return true;
  });
}

/**
 * Faktor 3 — Affordance Consistency (w3 = 0.20)
 *
 * Prueft ob die erkannten Affordances zum Endpoint-Typ passen.
 * Score = |gefundene ∩ erwartete| / |erwartete|
 * Pure Function.
 */

import type { Endpoint } from "../../../shared_interfaces.js";

/** Erwartete Affordance-Typen pro Endpoint-Typ */
const EXPECTED_AFFORDANCES: Record<string, string[]> = {
  auth: ["fill", "submit"],
  form: ["fill", "submit"],
  search: ["fill", "submit"],
  navigation: ["click", "navigate"],
  checkout: ["fill", "submit", "click"],
  commerce: ["fill", "submit", "click"],
  content: ["click", "navigate"],
  consent: ["click"],
  media: ["click"],
  social: ["click"],
  settings: ["fill", "click"],
  support: ["fill", "click"],
};

/**
 * Berechnet den Affordance Consistency Score.
 */
export function computeAffordanceConsistency(endpoint: Endpoint): number {
  const expected = EXPECTED_AFFORDANCES[endpoint.type];
  if (!expected || expected.length === 0) {
    // Kein erwartetes Set — neutraler Score
    return 0.5;
  }

  const foundTypes = new Set<string>(endpoint.affordances.map((a) => a.type));

  // Intersection: wie viele erwartete wurden gefunden?
  let matchCount = 0;
  for (const exp of expected) {
    if (foundTypes.has(exp)) {
      matchCount++;
    }
  }

  return matchCount / expected.length;
}

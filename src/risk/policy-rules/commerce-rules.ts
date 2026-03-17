/**
 * Commerce Policy Rules — Spezielle Regeln fuer Commerce-Aktionen.
 *
 * Diese Regeln werden VOR den Default-Regeln ausgewertet (hoehere Prioritaet).
 */

import { randomUUID } from "node:crypto";
import type { PolicyRule } from "../types.js";

/** Commerce-spezifische Regeln */
export function getCommerceRules(): PolicyRule[] {
  return [
    // Checkout-Formulare erfordern hoeheren Threshold als normale Formulare
    {
      id: randomUUID(),
      name: "commerce-form-fill",
      description: "Checkout-Formulare — erhoehte Anforderungen",
      action_class: "form_fill",
      min_confidence: 0.85,
      require_evidence: 3,
      max_contradiction: 0.15,
      allow_inferred_with_confirmation: false,
      endpoint_types: ["checkout", "commerce"],
      enabled: true,
      priority: 150,
      metadata: { scope: "commerce" },
    },

    // Submit auf Commerce-Seiten hat strengere Regeln
    {
      id: randomUUID(),
      name: "commerce-submit-data",
      description: "Checkout-Submit — strengere Contradiction-Limits",
      action_class: "submit_data",
      min_confidence: 0.90,
      require_evidence: 4,
      max_contradiction: 0.1,
      allow_inferred_with_confirmation: false,
      endpoint_types: ["checkout", "commerce"],
      enabled: true,
      priority: 140,
      metadata: { scope: "commerce" },
    },
  ];
}

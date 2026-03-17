/**
 * Auth Policy Rules — Spezielle Regeln fuer Authentifizierung.
 *
 * Auth-Aktionen erfordern erhoehte Sicherheit.
 */

import { randomUUID } from "node:crypto";
import type { PolicyRule } from "../types.js";

/** Auth-spezifische Regeln */
export function getAuthRules(): PolicyRule[] {
  return [
    // Login-Formulare: Etwas hoehere Anforderungen als normale Formulare
    {
      id: randomUUID(),
      name: "auth-form-fill",
      description: "Login/Register-Formulare — erhoehte Confidence fuer sensible Felder",
      action_class: "form_fill",
      min_confidence: 0.80,
      require_evidence: 2,
      max_contradiction: 0.2,
      allow_inferred_with_confirmation: false,
      endpoint_types: ["auth"],
      enabled: true,
      priority: 160,
      metadata: { scope: "auth" },
    },

    // Login-Submit: Strengere Regeln als normaler Submit
    {
      id: randomUUID(),
      name: "auth-submit",
      description: "Login/Register-Submit — strengerer Threshold",
      action_class: "submit_data",
      min_confidence: 0.88,
      require_evidence: 3,
      max_contradiction: 0.15,
      allow_inferred_with_confirmation: false,
      endpoint_types: ["auth"],
      enabled: true,
      priority: 155,
      metadata: { scope: "auth" },
    },
  ];
}

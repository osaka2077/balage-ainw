/**
 * Default Policy Rules — Standard-Regelwerk mit Default-Deny.
 *
 * Letzte Regel ist IMMER ein DENY-ALL.
 * Regeln werden in Reihenfolge ausgewertet: Erste passende Regel gewinnt.
 */

import { randomUUID } from "node:crypto";
import type { PolicyRule } from "../types.js";

/**
 * Standard-Regelwerk nach MASTERSPEC.
 * Reihenfolge ist WICHTIG — erste passende Regel gewinnt.
 */
export function getDefaultRules(): PolicyRule[] {
  return [
    // 1. Read-Only Aktionen: ALLOW bei niedrigem Threshold
    {
      id: randomUUID(),
      name: "allow-read-only",
      description: "Navigation, Lesen, Scrollen — niedrigstes Risiko",
      action_class: "read_only",
      min_confidence: 0.6,
      require_evidence: 1,
      max_contradiction: 0.4,
      enabled: true,
      priority: 100,
      metadata: {},
    },

    // 2. Reversible Aktionen: ALLOW bei mittlerem Threshold
    {
      id: randomUUID(),
      name: "allow-reversible-action",
      description: "Toggle, Checkbox — umkehrbare Aktionen",
      action_class: "reversible_action",
      min_confidence: 0.75,
      require_evidence: 1,
      max_contradiction: 0.3,
      enabled: true,
      priority: 90,
      metadata: {},
    },

    // 3. Form Fill: ALLOW bei erhoehtem Threshold
    {
      id: randomUUID(),
      name: "allow-form-fill",
      description: "Formular ausfuellen (ohne Submit)",
      action_class: "form_fill",
      min_confidence: 0.75,
      require_evidence: 2,
      max_contradiction: 0.25,
      enabled: true,
      priority: 80,
      metadata: {},
    },

    // 4. Submit Data: ALLOW bei hohem Threshold und keine Widersprueche
    {
      id: randomUUID(),
      name: "allow-submit-data",
      description: "Formular absenden, Account-Aenderungen",
      action_class: "submit_data",
      min_confidence: 0.85,
      require_evidence: 3,
      max_contradiction: 0.2,
      enabled: true,
      priority: 70,
      metadata: {},
    },

    // 5. Financial Action: Erfordert extrem hohe Confidence
    // In der Praxis wird SI-01 immer zu ESCALATE fuehren
    {
      id: randomUUID(),
      name: "escalate-financial-action",
      description: "Zahlungen — erfordern IMMER menschliche Freigabe (SI-01)",
      action_class: "financial_action",
      min_confidence: 1.01, // Unerreichbar — erzwingt ESCALATE via Gate-Logik
      require_evidence: 5,
      max_contradiction: 0.1,
      enabled: true,
      priority: 60,
      metadata: { always_escalate: true },
    },

    // 6. Destructive Action: Erfordert extrem hohe Confidence
    // In der Praxis wird SI-01 immer zu ESCALATE fuehren
    {
      id: randomUUID(),
      name: "escalate-destructive-action",
      description: "Passwort-Aenderungen, Account-Loeschung — IMMER menschliche Freigabe (SI-01)",
      action_class: "destructive_action",
      min_confidence: 1.01, // Unerreichbar — erzwingt ESCALATE via Gate-Logik
      require_evidence: 5,
      max_contradiction: 0.05,
      enabled: true,
      priority: 50,
      metadata: { always_escalate: true },
    },
  ];
}

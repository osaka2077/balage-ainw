/**
 * Risk Gate — Lokale Typen
 * Re-Exports aus shared_interfaces + Gate-spezifische Typen.
 */

import { z } from "zod";

// Re-Exports
export type {
  RiskLevel,
  GateDecision,
  PolicyRule,
  AuditEntry,
  ConfidenceScore,
  Endpoint,
  Evidence,
  EvidenceType,
  EndpointType,
} from "../../shared_interfaces.js";

export {
  RiskLevelSchema,
  GateDecisionSchema,
  PolicyRuleSchema,
  AuditEntrySchema,
  ConfidenceScoreSchema,
  EndpointSchema,
  EvidenceSchema,
  EvidenceTypeSchema,
  EndpointTypeSchema,
  DEFAULT_RISK_THRESHOLDS,
  MAX_CONTRADICTION_SCORES,
} from "../../shared_interfaces.js";

// ============================================================================
// Lokale Typen
// ============================================================================

/** Aktionstyp — Was soll ausgefuehrt werden? */
export const ActionTypeSchema = z.enum([
  "read",
  "navigate",
  "scroll",
  "toggle",
  "form_fill",
  "form_submit",
  "account_change",
  "file_upload",
  "payment",
  "password_change",
  "account_delete",
  "legal_action",
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

/** Aktionsklasse — Mapping fuer PolicyRule */
export const ActionClassSchema = z.enum([
  "read_only",
  "reversible_action",
  "form_fill",
  "submit_data",
  "financial_action",
  "destructive_action",
]);
export type ActionClass = z.infer<typeof ActionClassSchema>;

/** Gate-Kontext — Zusaetzliche Informationen fuer die Entscheidung */
export const GateContextSchema = z.object({
  sessionId: z.string().uuid(),
  traceId: z.string().uuid(),
  evidence: z.lazy(() =>
    z.array(z.object({
      type: z.string(),
      signal: z.string(),
      weight: z.number().min(0).max(1),
      detail: z.string().optional(),
      source: z.string().optional(),
    }))
  ).default([]),
  timestamp: z.coerce.date().optional(),
  domain: z.string().max(256).optional(),
});
export type GateContext = z.infer<typeof GateContextSchema>;

/** Policy-Evaluierungs-Ergebnis */
export interface PolicyResult {
  decision: "allow" | "deny" | "escalate";
  matchedRule: import("../../shared_interfaces.js").PolicyRule | null;
  reason: string;
}

/** Contradiction-Ergebnis */
export interface ContradictionResult {
  score: number;
  contradictions: Array<{
    evidenceA: import("../../shared_interfaces.js").Evidence;
    evidenceB: import("../../shared_interfaces.js").Evidence;
    description: string;
    severity: number;
  }>;
  hasContradiction: boolean;
}

/** Eskalationsanfrage */
export const EscalationRequestSchema = z.object({
  action: ActionTypeSchema,
  endpointId: z.string().uuid(),
  reason: z.string().max(2048),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  confidence: z.number().min(0).max(1),
  contradictionScore: z.number().min(0).max(1),
  context: GateContextSchema,
});
export type EscalationRequest = z.infer<typeof EscalationRequestSchema>;

/** Eskalationsantwort */
export interface EscalationResponse {
  decision: "allow" | "deny";
  respondedBy: "human" | "timeout";
  respondedAt: Date;
  reason: string;
}

/** Gespeicherte haengende Eskalation */
export interface PendingEscalation {
  request: EscalationRequest;
  createdAt: Date;
  timeoutMs: number;
  resolve: (response: EscalationResponse) => void;
}

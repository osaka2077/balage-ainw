/**
 * ============================================================================
 * BALAGE — Shared Interfaces & Zod Schemas
 * ============================================================================
 *
 * WICHTIG: Diese Datei wird VOR dem Start der Agents committet.
 * Kein Agent darf diese Datei aendern. Aenderungen erfolgen ausschliesslich
 * durch den Architekten (Mensch) oder durch expliziten MASTERSPEC-Update.
 *
 * Diese Datei definiert den Contract zwischen allen BALAGE-Komponenten:
 * - Browser Adapter (Layer 1)
 * - Parsing Engine (Layer 2)
 * - Semantic Engine (Layer 3)
 * - Decision Engine (Layer 4)
 * - Orchestration (Layer 5)
 * - Observability (Layer 6)
 * - Developer Experience (Layer 7)
 *
 * Quelle: MASTERSPEC/02_CORE_ARCHITECTURE.md
 * Version: 1.0.0
 * Erstellt: 2026-03-16
 * ============================================================================
 */

import { z } from "zod";

// ============================================================================
// 1. DOM & Accessibility — Layer 2 Basis-Typen
// ============================================================================

/** Bounding-Box eines DOM-Elements in Pixeln */
export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

/** Strukturierter DOM-Knoten — Minimale Repraesentation fuer Parsing */
export const DomNodeSchema: z.ZodType<DomNode, z.ZodTypeDef, any> = z.lazy(() =>
  z.object({
    tagName: z.string().min(1).max(64),
    attributes: z.record(z.string()),
    textContent: z.string().max(4096).optional(),
    isVisible: z.boolean(),
    isInteractive: z.boolean(),
    boundingBox: BoundingBoxSchema.optional(),
    computedStyles: z
      .object({
        display: z.string(),
        visibility: z.string(),
        opacity: z.number().min(0).max(1),
      })
      .optional(),
    domPath: z.string().max(2048).optional(),
    children: z.array(DomNodeSchema).default([]),
  })
);

export interface DomNode {
  tagName: string;
  attributes: Record<string, string>;
  textContent?: string;
  isVisible: boolean;
  isInteractive: boolean;
  boundingBox?: BoundingBox;
  computedStyles?: {
    display: string;
    visibility: string;
    opacity: number;
  };
  domPath?: string;
  children: DomNode[];
}

/** Accessibility-Tree-Knoten — ARIA-Informationen */
export const AccessibilityNodeSchema: z.ZodType<AccessibilityNode, z.ZodTypeDef, any> = z.lazy(
  () =>
    z.object({
      role: z.string().min(1).max(64),
      name: z.string().max(512).default(""),
      value: z.string().max(2048).optional(),
      description: z.string().max(1024).optional(),
      checked: z
        .enum(["true", "false", "mixed"])
        .optional(),
      disabled: z.boolean().default(false),
      required: z.boolean().default(false),
      expanded: z.boolean().optional(),
      selected: z.boolean().optional(),
      level: z.number().int().positive().optional(),
      boundingBox: BoundingBoxSchema.optional(),
      children: z.array(AccessibilityNodeSchema).default([]),
    })
);

export interface AccessibilityNode {
  role: string;
  name: string;
  value?: string;
  description?: string;
  checked?: "true" | "false" | "mixed";
  disabled: boolean;
  required: boolean;
  expanded?: boolean;
  selected?: boolean;
  level?: number;
  boundingBox?: BoundingBox;
  children: AccessibilityNode[];
}

// ============================================================================
// 2. State Change Events — DOM Mutation / Navigation Tracking
// ============================================================================

/** Typ eines State-Change-Events */
export const StateChangeTypeSchema = z.enum([
  "navigation",
  "dom_mutation",
  "spa_navigation",
  "dialog_opened",
  "dialog_closed",
  "frame_navigated",
  "content_loaded",
  "network_idle",
]);
export type StateChangeType = z.infer<typeof StateChangeTypeSchema>;

/** State-Change-Event — Navigation oder DOM-Aenderung */
export const StateChangeEventSchema = z.object({
  type: StateChangeTypeSchema,
  timestamp: z.coerce.date(),
  url: z.string().url().optional(),
  previousUrl: z.string().url().optional(),

  /** Betroffene DOM-Mutation (nur bei dom_mutation) */
  mutation: z
    .object({
      type: z.enum([
        "added",
        "removed",
        "modified",
        "attribute_changed",
      ]),
      target: z.string().max(2048),
      details: z.record(z.unknown()).default({}),
    })
    .optional(),

  /** Metadaten */
  sessionId: z.string().uuid(),
  frameId: z.string().optional(),
});
export type StateChangeEvent = z.infer<typeof StateChangeEventSchema>;

// ============================================================================
// 3. UI Segmentation — Erkannte UI-Bereiche
// ============================================================================

/** Typ eines UI-Segments */
export const UISegmentTypeSchema = z.enum([
  "form",
  "navigation",
  "content",
  "header",
  "footer",
  "sidebar",
  "modal",
  "overlay",
  "banner",
  "table",
  "list",
  "media",
  "unknown",
]);
export type UISegmentType = z.infer<typeof UISegmentTypeSchema>;

/** Segmentiertes UI-Fragment */
export const UISegmentSchema = z.object({
  id: z.string().uuid(),
  type: UISegmentTypeSchema,
  label: z.string().max(256).optional(),
  confidence: z.number().min(0).max(1),
  boundingBox: BoundingBoxSchema,
  nodes: z.array(DomNodeSchema).min(1),
  interactiveElementCount: z.number().int().nonnegative(),
  semanticRole: z.string().max(128).optional(),
  parentSegmentId: z.string().uuid().optional(),
});
export type UISegment = z.infer<typeof UISegmentSchema>;

// ============================================================================
// 4. Endpoint-Typen & Enums
// ============================================================================

/** Endpoint-Kategorie (aus MASTERSPEC 2.2) */
export const EndpointTypeSchema = z.enum([
  "form",
  "checkout",
  "support",
  "navigation",
  "auth",
  "search",
  "commerce",
  "content",
  "consent",
  "media",
  "social",
  "settings",
]);
export type EndpointType = z.infer<typeof EndpointTypeSchema>;

/** Risk-Level */
export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/** Endpoint-Status (Lifecycle) */
export const EndpointStatusSchema = z.enum([
  "discovered",
  "inferred",
  "verified",
  "deprecated",
  "broken",
  "suspended",
]);
export type EndpointStatus = z.infer<typeof EndpointStatusSchema>;

/** Adapter-Typ — plattformuebergreifend (MASTERSPEC Phase 8) */
export const AdapterTypeSchema = z.enum(["browser", "desktop", "mobile", "api"]);
export type AdapterType = z.infer<typeof AdapterTypeSchema>;

// ============================================================================
// 5. Evidence & Confidence — Begruendung und Bewertung
// ============================================================================

/** Evidence-Typ — Quelle der Begruendung */
export const EvidenceTypeSchema = z.enum([
  "semantic_label",
  "aria_role",
  "structural_pattern",
  "text_content",
  "layout_position",
  "historical_match",
  "fingerprint_similarity",
  "llm_inference",
  "user_confirmation",
  "verification_proof",
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

/** Einzelner Beweis fuer eine Endpoint-Interpretation */
export const EvidenceSchema = z.object({
  type: EvidenceTypeSchema,
  signal: z.string().min(1).max(512),
  weight: z.number().min(0).max(1),
  detail: z.string().max(2048).optional(),
  source: z
    .enum(["dom", "aria", "llm", "fingerprint", "history", "operator"])
    .optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// ============================================================================
// 5b. Endpoint Provenance & Trust — ADR-012 (SI-07 Enforcement)
// ============================================================================

/** Validation-Status — Vertrauensstufe eines Endpoints */
export const ValidationStatusSchema = z.enum([
  "unvalidated",
  "inferred",
  "validated_inferred",
  "fully_verified",
]);
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;

/** Endpoint-Provenance — Herkunft und Verifikationshistorie */
export const EndpointProvenanceSchema = z.object({
  discovery_method: z.enum([
    "llm_inference",
    "heuristic_match",
    "user_defined",
    "historical_replay",
    "api_import",
  ]),
  discovery_model: z.string().max(128).optional(),
  discovery_confidence: z.number().min(0).max(1),
  discovery_timestamp: z.coerce.date(),
  verification_evidence: z.array(EvidenceSchema).default([]),
  verification_timestamp: z.coerce.date().optional(),
  promoted_at: z.coerce.date().optional(),
  promoted_by: z
    .enum(["verification_service", "operator", "historical_match"])
    .optional(),
  trust_ceiling: z.number().min(0).max(1),
});
export type EndpointProvenance = z.infer<typeof EndpointProvenanceSchema>;

/** Trust-Level — Berechnetes Vertrauensniveau mit Ceiling */
export const TrustLevelSchema = z.object({
  score: z.number().min(0).max(1),
  ceiling: z.number().min(0).max(1),
  components: z.object({
    confidence_component: z.number().min(0).max(1),
    provenance_component: z.number().min(0).max(1),
  }),
  effective_score: z.number().min(0).max(1),
});
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

/** Trust-Ceiling pro Validation-Status (SI-07: inferred < verified) */
export const TRUST_CEILINGS = {
  unvalidated: 0.50,
  inferred: 0.70,
  validated_inferred: 0.85,
  fully_verified: 1.00,
} as const;

/** Provenance-Faktor pro Validation-Status */
export const PROVENANCE_FACTORS = {
  unvalidated: 0.70,
  inferred: 0.85,
  validated_inferred: 0.95,
  fully_verified: 1.00,
} as const;

/** Confidence-Score mit Gewichten und Breakdown */
export const ConfidenceScoreSchema = z.object({
  score: z.number().min(0).max(1),
  weights: z.object({
    w1_semantic: z.number().min(0).max(1).default(0.25),
    w2_structural: z.number().min(0).max(1).default(0.2),
    w3_affordance: z.number().min(0).max(1).default(0.2),
    w4_evidence: z.number().min(0).max(1).default(0.15),
    w5_historical: z.number().min(0).max(1).default(0.1),
    w6_ambiguity: z.number().min(0).max(1).default(0.1),
  }),
  breakdown: z.object({
    semanticMatch: z.number().min(0).max(1),
    structuralStability: z.number().min(0).max(1),
    affordanceConsistency: z.number().min(0).max(1),
    evidenceQuality: z.number().min(0).max(1),
    historicalSuccess: z.number().min(0).max(1),
    ambiguityPenalty: z.number().min(0).max(1),
  }),
  evidence: z.array(EvidenceSchema).default([]),
});
export type ConfidenceScore = z.infer<typeof ConfidenceScoreSchema>;

// ============================================================================
// 6. Semantic Fingerprint — Stabiler UI-Hash
// ============================================================================

/** Formularfeld-Signatur fuer Fingerprint */
export const FormFieldSignatureSchema = z.object({
  type: z.enum([
    "text",
    "email",
    "password",
    "number",
    "tel",
    "select",
    "checkbox",
    "radio",
    "textarea",
    "date",
    "file",
    "hidden",
    "unknown",
  ]),
  semanticPurpose: z.string().max(256),
  required: z.boolean(),
  position: z.number().int().nonnegative(),
});
export type FormFieldSignature = z.infer<typeof FormFieldSignatureSchema>;

/** Action-Signatur fuer Fingerprint */
export const ActionSignatureSchema = z.object({
  type: z.enum([
    "submit",
    "cancel",
    "navigate",
    "toggle",
    "delete",
    "download",
  ]),
  label: z.string().max(256),
  isPrimary: z.boolean(),
});
export type ActionSignature = z.infer<typeof ActionSignatureSchema>;

/** Feature-Vektor des Fingerprints */
export const FingerprintFeaturesSchema = z.object({
  // Semantische Features
  semanticRole: z.string().max(256),
  intentSignals: z.array(z.string().max(128)).max(32),
  formFields: z.array(FormFieldSignatureSchema).max(64),
  actionElements: z.array(ActionSignatureSchema).max(32),

  // Strukturelle Features
  domDepth: z.number().int().nonnegative(),
  childCount: z.number().int().nonnegative(),
  interactiveElementCount: z.number().int().nonnegative(),
  headingHierarchy: z.array(z.string().max(512)).max(16),

  // Visuelle Features
  layoutRegion: z.enum([
    "header",
    "main",
    "sidebar",
    "footer",
    "modal",
    "overlay",
  ]),
  approximatePosition: z.object({
    top: z.number().min(0).max(100),
    left: z.number().min(0).max(100),
  }),

  // Textuelle Features
  visibleTextHash: z.string().max(128),
  labelTexts: z.array(z.string().max(256)).max(64),
  buttonTexts: z.array(z.string().max(256)).max(32),
});
export type FingerprintFeatures = z.infer<typeof FingerprintFeaturesSchema>;

/** Semantischer Fingerprint — Stabiler Hash + Feature-Vektor */
export const SemanticFingerprintSchema = z.object({
  hash: z.string().min(64).max(128),
  features: FingerprintFeaturesSchema,
  version: z.number().int().positive(),
  createdAt: z.coerce.date(),
});
export type SemanticFingerprint = z.infer<typeof SemanticFingerprintSchema>;

// ============================================================================
// 7. DOM Anchor — Lokalisierung eines Endpoints im DOM
// ============================================================================

export const DomAnchorSchema = z.object({
  selector: z.string().max(1024).optional(),
  xpath: z.string().max(2048).optional(),
  ariaRole: z.string().max(64).optional(),
  ariaLabel: z.string().max(256).optional(),
  textContent: z.string().max(512).optional(),
  boundingBox: BoundingBoxSchema.optional(),
  fingerprint: z.string().max(256).optional(),
});
export type DomAnchor = z.infer<typeof DomAnchorSchema>;

// ============================================================================
// 8. Affordance — Was kann man mit einem Endpoint tun?
// ============================================================================

export const AffordanceSchema = z.object({
  type: z.enum([
    "click",
    "fill",
    "select",
    "toggle",
    "drag",
    "scroll",
    "upload",
    "submit",
    "navigate",
    "read",
  ]),
  inputSchema: z.record(z.unknown()).optional(),
  expectedOutcome: z.string().max(512),
  sideEffects: z.array(z.string()).max(16),
  reversible: z.boolean(),
  requiresConfirmation: z.boolean().default(false),
});
export type Affordance = z.infer<typeof AffordanceSchema>;

// ============================================================================
// 9. Semantic Label
// ============================================================================

export const SemanticLabelSchema = z.object({
  primary: z.string().min(1).max(128),
  display: z.string().min(1).max(256),
  synonyms: z.array(z.string()).max(16),
  language: z.string().length(2).default("en"),
});
export type SemanticLabel = z.infer<typeof SemanticLabelSchema>;

// ============================================================================
// 10. Endpoint — Semantischer Interaktionspunkt
// ============================================================================

/** Vollstaendiges Endpoint-Objekt (aus MASTERSPEC 2.2) */
export const EndpointSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  siteId: z.string().uuid(),
  url: z.string().url(),
  urlPattern: z.string().max(512).optional(),

  // Semantik
  type: EndpointTypeSchema,
  category: EndpointTypeSchema,
  label: SemanticLabelSchema,
  status: EndpointStatusSchema,
  validation_status: ValidationStatusSchema.default("unvalidated"),
  adapter_type: AdapterTypeSchema.default("browser"),
  provenance: EndpointProvenanceSchema.optional(),
  trust_level: TrustLevelSchema.optional(),

  // Lokalisierung
  anchors: z.array(DomAnchorSchema).min(1).max(32),
  affordances: z.array(AffordanceSchema).min(1).max(16),

  // Bewertung
  confidence: z.number().min(0).max(1),
  confidenceBreakdown: z.object({
    semanticMatch: z.number().min(0).max(1),
    structuralStability: z.number().min(0).max(1),
    affordanceConsistency: z.number().min(0).max(1),
    evidenceQuality: z.number().min(0).max(1),
    historicalSuccess: z.number().min(0).max(1),
    ambiguityPenalty: z.number().min(0).max(1),
  }),
  evidence: z.array(EvidenceSchema).default([]),

  // Risiko
  risk_class: RiskLevelSchema,

  // Fingerprint
  fingerprint: SemanticFingerprintSchema.optional(),

  // Aktionen
  actions: z.array(z.string().max(256)).max(32).default([]),

  // DOM-Anker (primaerer Anker)
  dom_anchor: DomAnchorSchema.optional(),

  // Hierarchie
  parentEndpointId: z.string().uuid().optional(),
  childEndpointIds: z
    .array(z.string().uuid())
    .max(64)
    .default([]),

  // Zeitstempel
  discoveredAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  lastInteractedAt: z.coerce.date().optional(),
  successCount: z.number().int().nonnegative().default(0),
  failureCount: z.number().int().nonnegative().default(0),

  metadata: z.record(z.unknown()).default({}),
});
export type Endpoint = z.infer<typeof EndpointSchema>;

// ============================================================================
// 11. Gate Decision — Risk-Gate-Entscheidung
// ============================================================================

export const GateDecisionSchema = z.object({
  decision: z.enum(["allow", "deny", "escalate"]),
  reason: z.string().max(1024),
  audit_id: z.string().uuid(),

  // Kontext der Entscheidung
  confidence: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  contradictionScore: z.number().min(0).max(1),
  contradictionLimit: z.number().min(0).max(1),

  // Eskalation (bei deny/escalate)
  escalation: z
    .object({
      type: z.enum(["human_review", "retry_with_more_data", "abort"]),
      message: z.string().max(2048),
    })
    .optional(),

  // Provenance-Kontext (ADR-012)
  endpoint_validation_status: ValidationStatusSchema.optional(),
  required_verification_for_action: z.boolean().default(false),

  timestamp: z.coerce.date(),
});
export type GateDecision = z.infer<typeof GateDecisionSchema>;

// ============================================================================
// 12. Policy Rule — Regel-Definition fuer Risk Gates
// ============================================================================

export const PolicyRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(256),
  description: z.string().max(1024).optional(),

  // Welche Aktionsklasse betrifft die Regel?
  action_class: z.enum([
    "read_only",
    "reversible_action",
    "form_fill",
    "submit_data",
    "financial_action",
    "destructive_action",
  ]),

  // Schwellwerte
  min_confidence: z.number().min(0).max(1),
  require_evidence: z.number().int().nonnegative().default(1),
  max_contradiction: z.number().min(0).max(1),

  // Provenance-Anforderungen (ADR-012)
  required_validation_status: ValidationStatusSchema.optional(),
  allow_inferred_with_confirmation: z.boolean().default(false),

  // Scope
  endpoint_types: z.array(EndpointTypeSchema).optional(),
  risk_levels: z.array(RiskLevelSchema).optional(),

  // Status
  enabled: z.boolean().default(true),
  priority: z.number().int().nonnegative().default(0),

  metadata: z.record(z.unknown()).default({}),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

// ============================================================================
// 13. Audit Entry — Audit-Log
// ============================================================================

export const AuditEntrySchema = z.object({
  id: z.string().uuid(),
  traceId: z.string().uuid(),
  timestamp: z.coerce.date(),

  // Wer?
  actor: z.enum(["system", "sub_agent", "human"]),
  actorId: z.string().max(256),

  // Was?
  action: z.string().max(256),
  endpoint_id: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),

  // Entscheidung
  decision: z.enum(["allowed", "denied", "escalated"]),
  confidence: z.number().min(0).max(1),
  riskGateResult: z.enum(["allowed", "denied", "escalated"]),

  // Evidence-Kette
  evidence_chain: z.array(EvidenceSchema).default([]),

  // Ergebnis
  input: z.record(z.unknown()).default({}),
  output: z.record(z.unknown()).default({}),
  duration: z.number().nonnegative(),
  success: z.boolean(),
  errorCode: z.string().max(128).optional(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

// ============================================================================
// 14. Sub-Agent — Agent-Definition
// ============================================================================

/** Sub-Agent-Typ */
export const SubAgentTypeSchema = z.enum([
  "navigator",
  "form_filler",
  "authenticator",
  "data_extractor",
  "action_executor",
  "verifier",
  "error_handler",
  "consent_manager",
]);
export type SubAgentType = z.infer<typeof SubAgentTypeSchema>;

/** Sub-Agent-Definition und Konfiguration */
export const SubAgentSchema = z.object({
  id: z.string().uuid(),
  type: SubAgentTypeSchema,

  // Capabilities und Einschraenkungen
  capabilities: z.object({
    canNavigate: z.boolean().default(false),
    canFill: z.boolean().default(false),
    canSubmit: z.boolean().default(false),
    canClick: z.boolean().default(false),
    canReadSensitive: z.boolean().default(false),
    canMakePayment: z.boolean().default(false),
  }),

  // Ressourcen-Limits
  action_budget: z.number().int().positive().default(50),
  timeout: z.number().int().positive().default(30_000),
  maxRetries: z.number().int().nonnegative().default(3),
  maxBudget: z.number().nonnegative().default(0.10),

  // Isolation
  isolation: z.enum(["shared_session", "own_context"]).default("shared_session"),

  // Status
  status: z
    .enum(["idle", "running", "completed", "failed", "timeout"])
    .default("idle"),
});
export type SubAgent = z.infer<typeof SubAgentSchema>;

// ============================================================================
// 15. Agent Task — Aufgabe fuer einen Sub-Agent
// ============================================================================

export const AgentTaskSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  workflowId: z.string().uuid(),
  stepId: z.string().min(1).max(64),

  // Aufgabe
  objective: z.string().min(1).max(1024),
  constraints: z.array(z.string().max(512)).max(16).default([]),
  acceptanceCriteria: z.array(z.string().max(512)).min(1).max(16),

  // Input/Output-Mapping
  inputMapping: z.record(z.string()).default({}),
  outputMapping: z.record(z.string()).default({}),
  inputData: z.record(z.unknown()).default({}),

  // Kontext
  endpointId: z.string().uuid().optional(),
  url: z.string().url().optional(),

  // Fehlerbehandlung
  onError: z
    .enum(["abort", "skip", "retry", "fallback", "escalate"])
    .default("abort"),
  fallbackStepId: z.string().optional(),
  maxRetries: z.number().int().nonnegative().default(2),

  // Timeout
  timeout: z.number().int().positive().default(30_000),

  // Abhaengigkeiten
  dependsOn: z.array(z.string()).default([]),

  // Status
  status: z
    .enum(["pending", "running", "completed", "failed", "skipped"])
    .default("pending"),
  createdAt: z.coerce.date(),
});
export type AgentTask = z.infer<typeof AgentTaskSchema>;

// ============================================================================
// 16. Agent Result — Ergebnis eines Sub-Agents
// ============================================================================

export const AgentResultSchema = z.object({
  taskId: z.string().uuid(),
  agentId: z.string().uuid(),
  agentType: SubAgentTypeSchema,

  // Ergebnis
  success: z.boolean(),
  output: z.record(z.unknown()).default({}),
  error: z
    .object({
      code: z.string().max(128),
      message: z.string().max(2048),
      recoverable: z.boolean(),
    })
    .optional(),

  // Metriken
  duration: z.number().nonnegative(),
  actionsPerformed: z.number().int().nonnegative(),
  llmTokensUsed: z.number().int().nonnegative().default(0),
  llmCost: z.number().nonnegative().default(0),

  // State-Aenderungen
  stateChanges: z.array(StateChangeEventSchema).default([]),
  endpointsDiscovered: z.array(z.string().uuid()).default([]),

  // Evidence
  evidence: z.array(EvidenceSchema).default([]),

  completedAt: z.coerce.date(),
});
export type AgentResult = z.infer<typeof AgentResultSchema>;

// ============================================================================
// 17. Workflow Definition — Workflow-Schema
// ============================================================================

/** Bedingungs-Definition fuer Workflow-Steps */
export const WorkflowStepConditionSchema = z.object({
  field: z.string(),
  operator: z.enum([
    "eq",
    "neq",
    "gt",
    "lt",
    "gte",
    "lte",
    "contains",
    "exists",
    "not_exists",
  ]),
  value: z.unknown(),
});
export type WorkflowStepCondition = z.infer<typeof WorkflowStepConditionSchema>;

/** Einzelner Workflow-Schritt */
export const WorkflowStepSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(256),
  description: z.string().max(1024).optional(),

  // Agent-Zuordnung
  agentType: SubAgentTypeSchema,
  agentConfigOverrides: z.record(z.unknown()).optional(),

  // Aufgabe
  task: z.object({
    objective: z.string().min(1).max(1024),
    constraints: z.array(z.string()).max(16).default([]),
    acceptanceCriteria: z.array(z.string()).min(1).max(16),
    inputMapping: z.record(z.string()).default({}),
    outputMapping: z.record(z.string()).default({}),
  }),

  // Bedingte Ausfuehrung
  condition: WorkflowStepConditionSchema.optional(),
  skipOnConditionFail: z.boolean().default(true),

  // Fehlerbehandlung
  onError: z
    .enum(["abort", "skip", "retry", "fallback", "escalate"])
    .default("abort"),
  fallbackStepId: z.string().optional(),
  maxRetries: z.number().int().nonnegative().default(2),

  // Timeout
  timeout: z.number().int().positive().default(30_000),

  // Abhaengigkeiten (DAG)
  dependsOn: z.array(z.string()).default([]),

  // Rollback
  rollbackStepId: z.string().optional(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

/** Vollstaendige Workflow-Definition */
export const WorkflowDefinitionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(256),
  description: z.string().max(2048).optional(),
  version: z.number().int().positive().default(1),

  // Target
  siteId: z.string().uuid().optional(),
  startUrl: z.string().url(),

  // Steps als DAG
  steps: z.array(WorkflowStepSchema).min(1).max(64),

  // Rollback Points
  rollback_points: z
    .array(
      z.object({
        stepId: z.string(),
        rollbackStepId: z.string(),
        description: z.string().max(512).optional(),
      })
    )
    .default([]),

  // Conditions (globale Bedingungen)
  conditions: z
    .array(
      z.object({
        name: z.string().max(128),
        condition: WorkflowStepConditionSchema,
        action: z.enum(["abort", "skip_remaining", "escalate"]),
      })
    )
    .default([]),

  // Globale Einstellungen
  settings: z
    .object({
      maxTotalDuration: z.number().int().positive().default(300_000),
      maxTotalBudget: z.number().nonnegative().default(1.0),
      continueOnStepFailure: z.boolean().default(false),
      parallelExecution: z.boolean().default(true),
      requireAllStepsSuccess: z.boolean().default(true),
    })
    .default({}),

  // Globale Error-Handler
  globalErrorHandlers: z
    .array(
      z.object({
        errorPattern: z.string(),
        action: z.enum([
          "retry_step",
          "spawn_error_handler",
          "spawn_consent_manager",
          "escalate",
          "abort",
        ]),
        maxOccurrences: z.number().int().positive().default(3),
      })
    )
    .default([]),

  // Metadata
  tags: z.array(z.string()).max(16).default([]),
  createdBy: z.string().optional(),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

// ============================================================================
// 18. BalageConfig — Globale Konfiguration
// ============================================================================

export const BalageConfigSchema = z.object({
  /** Eindeutiger Instanz-Name */
  instanceName: z.string().min(1).max(128).default("balage-default"),

  /** Version */
  version: z.string().default("1.0.0"),

  // --- Adapter Config (adapter-spezifisch, see src/adapter/config-schema.ts) ---
  adapter: z.record(z.unknown()).optional(),

  // --- LLM ---
  llm: z
    .object({
      defaultProvider: z.string().default("openai"),
      defaultModel: z.string().default("gpt-4o"),
      fallbackChain: z.array(z.string()).default(["gpt-4o", "gpt-4o-mini"]),
      temperature: z.number().min(0).max(2).default(0),
      maxTokensPerCall: z.number().int().positive().default(4096),
      budgetPerWorkflow: z.number().nonnegative().default(1.0),
      cacheEnabled: z.boolean().default(true),
      cacheTTL: z.number().int().positive().default(86_400),
    })
    .default({}),

  // --- Risk Gates ---
  riskGates: z
    .object({
      enabled: z.boolean().default(true),
      defaultDeny: z.boolean().default(true),
      thresholds: z
        .object({
          read_only: z.number().min(0).max(1).default(0.6),
          reversible_action: z.number().min(0).max(1).default(0.75),
          form_fill: z.number().min(0).max(1).default(0.8),
          submit_data: z.number().min(0).max(1).default(0.85),
          financial_action: z.number().min(0).max(1).default(0.92),
          destructive_action: z.number().min(0).max(1).default(0.95),
        })
        .default({}),
      maxContradiction: z
        .object({
          read_only: z.number().min(0).max(1).default(0.4),
          reversible_action: z.number().min(0).max(1).default(0.3),
          form_fill: z.number().min(0).max(1).default(0.25),
          submit_data: z.number().min(0).max(1).default(0.2),
          financial_action: z.number().min(0).max(1).default(0.1),
          destructive_action: z.number().min(0).max(1).default(0.05),
        })
        .default({}),
    })
    .default({}),

  // --- Observability ---
  observability: z
    .object({
      tracing: z.boolean().default(true),
      metricsEnabled: z.boolean().default(true),
      auditEnabled: z.boolean().default(true),
      logLevel: z
        .enum(["debug", "info", "warning", "error", "critical"])
        .default("info"),
      samplingRate: z.number().min(0).max(1).default(0.1),
    })
    .default({}),

  // --- Fingerprint ---
  fingerprint: z
    .object({
      schemaVersion: z.number().int().positive().default(2),
      driftThresholds: z
        .object({
          ignore: z.number().min(0).max(1).default(0.95),
          log: z.number().min(0).max(1).default(0.85),
          reEvaluate: z.number().min(0).max(1).default(0.7),
          invalidate: z.number().min(0).max(1).default(0.5),
        })
        .default({}),
    })
    .default({}),

  // --- Workflow Defaults ---
  workflow: z
    .object({
      maxTotalDuration: z.number().int().positive().default(300_000),
      maxTotalBudget: z.number().nonnegative().default(1.0),
      maxSteps: z.number().int().positive().default(64),
      parallelExecution: z.boolean().default(true),
    })
    .default({}),

  // --- Database ---
  database: z
    .object({
      connectionString: z.string().optional(),
      maxConnections: z.number().int().positive().default(10),
      enableRLS: z.boolean().default(true),
    })
    .default({}),
});
export type BalageConfig = z.infer<typeof BalageConfigSchema>;

// ============================================================================
// 20. Konstanten — Default-Werte aus MASTERSPEC
// ============================================================================

/** Default Risk-Gate Thresholds (MASTERSPEC 4.4) */
export const DEFAULT_RISK_THRESHOLDS = {
  read_only: 0.6,
  reversible_action: 0.75,
  form_fill: 0.8,
  submit_data: 0.85,
  financial_action: 0.92,
  destructive_action: 0.95,
} as const;

/** Max Contradiction Scores (MASTERSPEC 4.4) */
export const MAX_CONTRADICTION_SCORES = {
  read_only: 0.4,
  reversible_action: 0.3,
  form_fill: 0.25,
  submit_data: 0.2,
  financial_action: 0.1,
  destructive_action: 0.05,
} as const;

/** Default Confidence Weights (MASTERSPEC 1.2) */
export const DEFAULT_CONFIDENCE_WEIGHTS = {
  w1_semantic: 0.25,
  w2_structural: 0.2,
  w3_affordance: 0.2,
  w4_evidence: 0.15,
  w5_historical: 0.1,
  w6_ambiguity: 0.1,
} as const;

/** Fingerprint Drift Thresholds (MASTERSPEC 3.5) */
export const DRIFT_THRESHOLDS = {
  IGNORE: 0.95,
  LOG: 0.85,
  RE_EVALUATE: 0.7,
  INVALIDATE: 0.5,
} as const;

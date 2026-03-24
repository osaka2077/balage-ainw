import { z } from "zod";
import {
  EndpointTypeSchema,
  EvidenceSchema,
  RiskLevelSchema,
  ValidationStatusSchema,
} from "./endpoint.js";

// ============================================================================
// State Change Events — DOM Mutation / Navigation Tracking
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
// Gate Decision — Risk-Gate-Entscheidung
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
// Policy Rule — Regel-Definition fuer Risk Gates
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
// Audit Entry — Audit-Log
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
// Sub-Agent — Agent-Definition
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
// Agent Task — Aufgabe fuer einen Sub-Agent
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
// Agent Result — Ergebnis eines Sub-Agents
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
// Workflow Definition — Workflow-Schema
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
// BalageConfig — Globale Konfiguration
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
// Konstanten — Default-Werte aus MASTERSPEC
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

/** Fingerprint Drift Thresholds (MASTERSPEC 3.5) */
export const DRIFT_THRESHOLDS = {
  IGNORE: 0.95,
  LOG: 0.85,
  RE_EVALUATE: 0.7,
  INVALIDATE: 0.5,
} as const;

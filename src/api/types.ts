/**
 * API Module — Lokale Typen + Re-Exports
 */

// Re-Exports aus shared_interfaces
export type {
  WorkflowDefinition,
  Endpoint,
  Evidence,
  ConfidenceScore,
  GateDecision,
  AuditEntry,
  SemanticFingerprint,
} from "../../shared_interfaces.js";

// Re-Exports aus Orchestrator
export type {
  WorkflowResult,
  WorkflowState,
  WorkflowContext,
} from "../orchestrator/types.js";

// ============================================================================
// API-spezifische Typen
// ============================================================================

export type ApiPermission =
  | "workflows:read"
  | "workflows:write"
  | "endpoints:read"
  | "actions:execute"
  | "evidence:read"
  | "admin";

export interface ApiKeyConfig {
  key: string;
  name: string;
  rateLimit?: number;
  permissions: ApiPermission[];
}

export interface ApiServerConfig {
  host: string;
  port: number;
  apiKeys: ApiKeyConfig[];
  cors: {
    origins: string[];
    credentials: boolean;
  };
  rateLimit: {
    global: number;
    perKey: number;
  };
  idempotencyTtlMs: number;
}

export interface WorkflowRunRequest {
  workflow: import("../../shared_interfaces.js").WorkflowDefinition;
  options?: {
    dryRun?: boolean;
    timeout?: number;
    callbackUrl?: string;
  };
}

export interface WorkflowRunResponse {
  id: string;
  status: "accepted";
  traceId: string;
  estimatedDuration?: number;
}

export interface WorkflowStatusResponse {
  id: string;
  status: import("../orchestrator/types.js").WorkflowState;
  traceId: string;
  progress: {
    totalSteps: number;
    completedSteps: number;
    currentStep?: string;
  };
  result?: import("../orchestrator/types.js").WorkflowResult;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

export interface WorkflowSummary {
  id: string;
  status: import("../orchestrator/types.js").WorkflowState;
  traceId: string;
  totalSteps: number;
  completedSteps: number;
  startedAt: string;
}

export interface ActionExecuteRequest {
  endpointId: string;
  action: string;
  parameters?: Record<string, unknown>;
  options?: {
    dryRun?: boolean;
    timeout?: number;
  };
}

export interface ActionExecuteResponse {
  success: boolean;
  action: string;
  endpointId: string;
  result?: Record<string, unknown>;
  confidence: number;
  gateDecision: "allow" | "deny" | "escalate";
  evidence: import("../../shared_interfaces.js").Evidence[];
  duration: number;
}

export interface EvidenceChainResponse {
  traceId: string;
  chain: EvidenceChainEntry[];
  isComplete: boolean;
  totalEntries: number;
}

export interface EvidenceChainEntry {
  id: string;
  type: string;
  signal: string;
  weight: number;
  timestamp: string;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    orchestrator: "ok" | "error";
    browser: "ok" | "error" | "not_configured";
    database: "ok" | "error" | "not_configured";
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface WorkflowProgressEvent {
  type: "step_started" | "step_completed" | "step_failed" | "workflow_completed" | "workflow_failed";
  workflowId: string;
  stepId?: string;
  progress: { completed: number; total: number };
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface WebSocketMessage {
  type: "subscribe" | "unsubscribe" | "ping" | "pong" | "error" | "workflow_progress" | "auth";
  workflowId?: string;
  apiKey?: string;
  event?: WorkflowProgressEvent;
  code?: string;
  message?: string;
}

export interface IdempotencyEntry {
  key: string;
  requestHash: string;
  response: unknown;
  statusCode: number;
  createdAt: Date;
}

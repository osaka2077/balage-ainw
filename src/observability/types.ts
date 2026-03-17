// Re-export shared types needed by observability
export type {
  AuditEntry, Evidence, GateDecision, ConfidenceScore,
  Endpoint, AgentTask, AgentResult, WorkflowDefinition, WorkflowStep,
} from "../../shared_interfaces.js";

// --- Tracer ---
export interface TracerConfig {
  serviceName: string;
  samplingRate: number;      // 0.0 - 1.0
  exporter?: SpanExporter;
  maxSpansPerTrace: number;  // Default: 1000
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  status: SpanStatus;
  duration?: number;  // ms
}

export interface SpanOptions {
  parent?: TraceContext;
  attributes?: Record<string, string | number | boolean>;
}

export interface SpanEvent {
  name: string;
  timestamp: Date;
  attributes?: Record<string, unknown>;
}

export type SpanStatus = "unset" | "ok" | "error";

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  baggage: Record<string, string>;
}

export interface SpanExporter {
  export(spans: ReadonlyArray<Span>): Promise<void>;
  shutdown(): Promise<void>;
}

// --- Logger ---
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LoggerOptions {
  name: string;
  level: LogLevel;
  piiFilter: boolean;
  traceContext: boolean;
  destination?: string;
}

// --- PII Filter ---
export interface PiiFilterConfig {
  filterEmails: boolean;
  filterPhones: boolean;
  filterCreditCards: boolean;
  filterPasswords: boolean;
  filterApiKeys: boolean;
  filterIPs: boolean;
  filterIBANs: boolean;
  customPatterns: Array<{ name: string; pattern: RegExp; replacement: string }>;
}

export interface PiiDetection {
  type: string;
  start: number;
  length: number;
  original: string;
}

// --- Evidence Trail ---
export interface EvidenceTrailConfig {
  maxEntries: number;
  piiFilter: boolean;
}

export interface EvidenceTrailEntry {
  id: string;
  traceId: string;
  spanId: string;
  timestamp: Date;
  action: string;
  endpointId?: string;
  evidence: import("../../shared_interfaces.js").Evidence[];
  confidenceScore?: number;
  gateDecision?: "allow" | "deny" | "escalate";
  outcome: "success" | "failure" | "skipped" | "escalated";
  metadata: Record<string, unknown>;
}

export interface EvidenceChain {
  traceId: string;
  entries: EvidenceTrailEntry[];
  isComplete: boolean;
  gaps: string[];
}

export interface EvidenceVerification {
  traceId: string;
  isValid: boolean;
  isComplete: boolean;
  issues: Array<{ type: string; message: string; entryId?: string }>;
}

// --- Replay ---
export interface ReplayConfig {
  maxRecordingSize: number;
  maxEvents: number;
  piiFilter: boolean;
}

export type ReplayEventType =
  | "workflow_start" | "workflow_end"
  | "step_start" | "step_end"
  | "agent_dispatch" | "agent_result"
  | "pipeline_step" | "gate_decision"
  | "state_change" | "error";

export interface ReplayEvent {
  offsetMs: number;
  type: ReplayEventType;
  data: Record<string, unknown>;
  traceId: string;
  spanId?: string;
}

export interface ReplayRecording {
  id: string;
  workflowId: string;
  traceId: string;
  events: ReplayEvent[];
  workflow: import("../../shared_interfaces.js").WorkflowDefinition;
  startContext: Record<string, unknown>;
  totalDurationMs: number;
  eventCount: number;
  createdAt: Date;
}

export interface RecordingSummary {
  id: string;
  workflowId: string;
  traceId: string;
  eventCount: number;
  totalDurationMs: number;
  createdAt: Date;
}

export interface PlaybackOptions {
  speed: number;
  startFromEvent?: number;
  stopAtEvent?: number;
  filter?: ReplayEventType[];
}

export type PlaybackState = "idle" | "playing" | "paused" | "completed" | "stopped";

export type ReplayEventHandler = (event: ReplayEvent) => void | Promise<void>;

export interface ReplayPlaybackResult {
  recordingId: string;
  eventsPlayed: number;
  totalEvents: number;
  durationMs: number;
  state: PlaybackState;
}

export interface ReplayDiff {
  recording1Id: string;
  recording2Id: string;
  added: ReplayEvent[];
  removed: ReplayEvent[];
  modified: Array<{ index: number; event1: ReplayEvent; event2: ReplayEvent; differences: string[] }>;
  identical: boolean;
}

export interface ReplayPlayerConfig {
  defaultSpeed: number;
}

// --- Metrics ---
export interface MetricsConfig {
  prefix: string;
  defaultLabels: Record<string, string>;
  histogramBuckets: number[];
}

export interface MetricSnapshot {
  name: string;
  type: "counter" | "histogram" | "gauge";
  help?: string;
  values: Array<{
    labels: Record<string, string>;
    value: number;
    buckets?: Record<string, number>;
  }>;
}

export interface TimeRange {
  from: Date;
  to: Date;
}

export interface DashboardData {
  workflowsPerHour: number;
  averageDurationMs: number;
  successRate: number;
  topErrors: Array<{ code: string; count: number }>;
  confidenceDistribution: { buckets: number[]; counts: number[] };
  tokenUsage: { total: number; perWorkflow: number };
  activeWorkflows: number;
  activeAgents: number;
}

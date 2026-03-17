/**
 * Orchestrator — Lokale Typen + Re-Exports
 */

// Re-Exports aus shared_interfaces
export type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepCondition,
  AgentTask,
  AgentResult,
  SubAgent,
  SubAgentType,
  Endpoint,
  ConfidenceScore,
  GateDecision,
  AuditEntry,
  Evidence,
  StateChangeEvent,
  DomNode,
  AccessibilityNode,
  UISegment,
} from "../../shared_interfaces.js";

// ============================================================================
// Lokale Typen
// ============================================================================

/** State des Workflows */
export type WorkflowState =
  | "pending"
  | "running"
  | "waiting"
  | "completed"
  | "failed";

/** Globaler Workflow-Kontext */
export interface WorkflowContext {
  workflowId: string;
  traceId: string;
  startUrl: string;
  currentUrl?: string;
  state: WorkflowState;
  variables: Record<string, unknown>;
  discoveredEndpoints: import("../../shared_interfaces.js").Endpoint[];
  stateChanges: import("../../shared_interfaces.js").StateChangeEvent[];
  history: ContextHistoryEntry[];
  budget: BudgetTracker;
  startedAt: Date;
  settings: {
    maxTotalDuration: number;
    maxTotalBudget: number;
    continueOnStepFailure: boolean;
    parallelExecution: boolean;
    requireAllStepsSuccess: boolean;
  };
}

/** History-Eintrag im Context */
export interface ContextHistoryEntry {
  timestamp: Date;
  type:
    | "step_started"
    | "step_completed"
    | "step_failed"
    | "context_updated"
    | "agent_dispatched"
    | "result_received";
  stepId?: string;
  taskId?: string;
  details: Record<string, unknown>;
}

/** Budget-Tracking */
export interface BudgetTracker {
  maxTokens: number;
  usedTokens: number;
  maxCostUsd: number;
  usedCostUsd: number;
  maxDurationMs: number;
  elapsedMs: number;
  isExceeded: boolean;
}

/** Ergebnis eines Workflows */
export interface WorkflowResult {
  workflowId: string;
  traceId: string;
  success: boolean;
  state: WorkflowState;
  stepResults: StepResult[];
  discoveredEndpoints: import("../../shared_interfaces.js").Endpoint[];
  conflicts: ResultConflict[];
  metrics: WorkflowMetrics;
  startedAt: Date;
  completedAt: Date;
}

/** Ergebnis eines einzelnen Steps */
export interface StepResult {
  stepId: string;
  taskId: string;
  agentType: string;
  success: boolean;
  output: Record<string, unknown>;
  error?: { code: string; message: string; recoverable: boolean };
  duration: number;
  retries: number;
}

/** Konflikt zwischen Ergebnissen */
export interface ResultConflict {
  taskId1: string;
  taskId2: string;
  field: string;
  value1: unknown;
  value2: unknown;
  description: string;
  severity: "low" | "medium" | "high";
}

/** Workflow-Metriken */
export interface WorkflowMetrics {
  totalDuration: number;
  totalActions: number;
  totalLlmTokens: number;
  totalLlmCost: number;
  stepsCompleted: number;
  stepsFailed: number;
  stepsSkipped: number;
  endpointsDiscovered: number;
}

/** Pipeline-Aktion */
export interface PipelineAction {
  type: string;
  target?: string;
  data?: Record<string, unknown>;
}

/** Pipeline-Ergebnis */
export interface PipelineResult {
  success: boolean;
  gateDecision: import("../../shared_interfaces.js").GateDecision | null;
  endpoints: import("../../shared_interfaces.js").Endpoint[];
  stateChanges: import("../../shared_interfaces.js").StateChangeEvent[];
  error?: { step: string; code: string; message: string };
  timing: Record<string, number>;
}

/** Abhaengigkeiten des Orchestrators (Dependency Injection) */
export interface OrchestratorDependencies {
  dispatcher: DispatcherInterface;
  contextManager: ContextManagerInterface;
  taskDecomposer: TaskDecomposerInterface;
  pipeline: PipelineInterface;
  resultAggregator: ResultAggregatorInterface;
}

/** Interface fuer Agent-Registry (kommt aus src/agents/) */
export interface AgentRegistryInterface {
  getAgent(
    type: import("../../shared_interfaces.js").SubAgentType,
  ): Promise<import("../../shared_interfaces.js").SubAgent>;
  releaseAgent(agentId: string): Promise<void>;
  listAgents(): import("../../shared_interfaces.js").SubAgent[];
}

/** Interface fuer Pipeline (fuer Mocking) */
export interface PipelineInterface {
  execute(
    url: string,
    action: PipelineAction,
    context: WorkflowContext,
  ): Promise<PipelineResult>;
}

/** Interface fuer TaskDecomposer (fuer Mocking) */
export interface TaskDecomposerInterface {
  decomposeWorkflow(
    workflow: import("../../shared_interfaces.js").WorkflowDefinition,
    context: WorkflowContext,
  ): import("../../shared_interfaces.js").AgentTask[];
  decomposeStep(
    step: import("../../shared_interfaces.js").WorkflowStep,
    context: WorkflowContext,
  ): import("../../shared_interfaces.js").AgentTask;
}

/** Interface fuer ResultAggregator (fuer Mocking) */
export interface ResultAggregatorInterface {
  aggregateResults(
    results: import("../../shared_interfaces.js").AgentResult[],
    tasks: import("../../shared_interfaces.js").AgentTask[],
    context: WorkflowContext,
  ): WorkflowResult;
  detectConflicts(
    results: import("../../shared_interfaces.js").AgentResult[],
  ): ResultConflict[];
}

/** Interface fuer Dispatcher (fuer Mocking) */
export interface DispatcherInterface {
  dispatch(
    task: import("../../shared_interfaces.js").AgentTask,
  ): Promise<import("../../shared_interfaces.js").AgentResult>;
  dispatchParallel(
    tasks: import("../../shared_interfaces.js").AgentTask[],
  ): Promise<import("../../shared_interfaces.js").AgentResult[]>;
  cancel(taskId: string): Promise<void>;
}

/** Interface fuer ContextManager (fuer Mocking) */
export interface ContextManagerInterface {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  getSnapshot(): WorkflowContext;
  applyResult(
    taskId: string,
    result: import("../../shared_interfaces.js").AgentResult,
    outputMapping: Record<string, string>,
  ): void;
  prune(): void;
  getHistory(): ContextHistoryEntry[];
  addHistory(entry: ContextHistoryEntry): void;
  updateState(state: WorkflowState): void;
  updateBudget(
    tokens: number,
    cost: number,
    elapsedMs: number,
  ): void;
  isBudgetExceeded(): boolean;
}

/** Pipeline-Abhaengigkeiten (Interfaces fuer alle Layer) */
export interface BrowserAdapterInterface {
  navigate(url: string): Promise<void>;
  extractDOM(): Promise<import("../../shared_interfaces.js").DomNode>;
  extractAccessibilityTree(): Promise<
    import("../../shared_interfaces.js").AccessibilityNode
  >;
  close(): Promise<void>;
}

export interface ParserInterface {
  segmentUI(
    dom: import("../../shared_interfaces.js").DomNode,
    accessibility: import("../../shared_interfaces.js").AccessibilityNode,
  ): import("../../shared_interfaces.js").UISegment[];
}

export interface SemanticInterface {
  generateEndpoints(
    segments: import("../../shared_interfaces.js").UISegment[],
    url: string,
  ): Promise<import("../../shared_interfaces.js").Endpoint[]>;
}

export interface FingerprintInterface {
  calculateFingerprint(
    endpoint: import("../../shared_interfaces.js").Endpoint,
  ): import("../../shared_interfaces.js").SemanticFingerprint;
}

export interface ConfidenceInterface {
  calculateScore(
    endpoint: import("../../shared_interfaces.js").Endpoint,
    evidence: import("../../shared_interfaces.js").Evidence[],
  ): import("../../shared_interfaces.js").ConfidenceScore;
}

export interface RiskGateInterface {
  evaluate(
    action: string,
    endpoint: import("../../shared_interfaces.js").Endpoint,
    confidence: import("../../shared_interfaces.js").ConfidenceScore,
    context: unknown,
  ): import("../../shared_interfaces.js").GateDecision;
}

export interface PipelineDependencies {
  adapter: BrowserAdapterInterface;
  parser: ParserInterface;
  semantic: SemanticInterface;
  fingerprint: FingerprintInterface;
  confidence: ConfidenceInterface;
  riskGate: RiskGateInterface;
}

/**
 * E2E Test Helpers — Shared Factories und Builder fuer E2E-Tests.
 */
import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type {
  AgentResult,
  AgentTask,
  SubAgent,
  SubAgentType,
  Endpoint,
  Evidence,
  ConfidenceScore,
  GateDecision,
  EndpointType,
  RiskLevel,
} from "../../shared_interfaces.js";
import {
  DEFAULT_CONFIDENCE_WEIGHTS,
} from "../../shared_interfaces.js";
import type {
  AgentRegistryInterface,
  OrchestratorDependencies,
  PipelineDependencies,
  WorkflowContext,
  BudgetTracker,
} from "../../src/orchestrator/types.js";
import { WorkflowRunner } from "../../src/orchestrator/workflow-runner.js";
import { ContextManager } from "../../src/orchestrator/context-manager.js";
import { TaskDecomposer } from "../../src/orchestrator/task-decomposer.js";
import { ResultAggregator } from "../../src/orchestrator/result-aggregator.js";

// ============================================================================
// Agent Factories
// ============================================================================

export function createMockAgent(type: SubAgentType = "navigator"): SubAgent {
  return {
    id: randomUUID(),
    type,
    capabilities: {
      canNavigate: type === "navigator",
      canFill: type === "form_filler" || type === "authenticator",
      canSubmit: type === "authenticator" || type === "action_executor",
      canClick: true,
      canReadSensitive: type === "authenticator",
      canMakePayment: false,
    },
    action_budget: 50,
    timeout: 30_000,
    maxRetries: 3,
    maxBudget: 0.1,
    isolation: "shared_session",
    status: "idle",
  };
}

export function createMockRegistry(): AgentRegistryInterface {
  const agents = new Map<string, SubAgent>();
  return {
    getAgent: vi.fn(async (type: SubAgentType) => {
      const agent = createMockAgent(type);
      agents.set(agent.id, agent);
      return agent;
    }),
    releaseAgent: vi.fn(async () => {}),
    listAgents: vi.fn(() => [...agents.values()]),
  };
}

// ============================================================================
// Result Factories
// ============================================================================

export function createSuccessResult(
  taskId: string,
  agentType: SubAgentType = "navigator",
  output: Record<string, unknown> = {},
): AgentResult {
  return {
    taskId,
    agentId: randomUUID(),
    agentType,
    success: true,
    output,
    duration: 150,
    actionsPerformed: 3,
    llmTokensUsed: 500,
    llmCost: 0.01,
    stateChanges: [],
    endpointsDiscovered: [],
    evidence: [],
    completedAt: new Date(),
  };
}

export function createFailResult(
  taskId: string,
  errorCode: string = "STEP_FAILED",
  recoverable = false,
): AgentResult {
  return {
    taskId,
    agentId: randomUUID(),
    agentType: "navigator",
    success: false,
    output: {},
    error: { code: errorCode, message: "Step failed", recoverable },
    duration: 50,
    actionsPerformed: 0,
    llmTokensUsed: 100,
    llmCost: 0.002,
    stateChanges: [],
    endpointsDiscovered: [],
    evidence: [],
    completedAt: new Date(),
  };
}

// ============================================================================
// Endpoint Factory
// ============================================================================

export function createMockEndpoint(
  type: EndpointType = "form",
  confidence = 0.9,
  riskClass: RiskLevel = "low",
): Endpoint {
  const now = new Date();
  return {
    id: randomUUID(),
    version: 1,
    siteId: randomUUID(),
    url: "https://example.com",
    type,
    category: type,
    label: {
      primary: type,
      display: `${type} endpoint`,
      synonyms: [],
      language: "en",
    },
    status: "discovered",
    anchors: [{ selector: "form", ariaRole: "form" }],
    affordances: [{
      type: "click",
      expectedOutcome: "Interaction",
      sideEffects: [],
      reversible: true,
      requiresConfirmation: false,
    }],
    confidence,
    confidenceBreakdown: {
      semanticMatch: 0.9,
      structuralStability: 0.8,
      affordanceConsistency: 0.85,
      evidenceQuality: 0.9,
      historicalSuccess: 0.7,
      ambiguityPenalty: 0.1,
    },
    evidence: [
      { type: "semantic_label", signal: "form", weight: 0.8 },
      { type: "aria_role", signal: "form", weight: 0.9 },
    ],
    risk_class: riskClass,
    actions: [],
    childEndpointIds: [],
    discoveredAt: now,
    lastSeenAt: now,
    successCount: 0,
    failureCount: 0,
    metadata: {},
  };
}

// ============================================================================
// Confidence Score Factory
// ============================================================================

export function createMockConfidenceScore(score: number): ConfidenceScore {
  return {
    score,
    weights: { ...DEFAULT_CONFIDENCE_WEIGHTS },
    breakdown: {
      semanticMatch: score,
      structuralStability: score * 0.9,
      affordanceConsistency: score * 0.95,
      evidenceQuality: score,
      historicalSuccess: score * 0.8,
      ambiguityPenalty: Math.max(0, 1 - score) * 0.5,
    },
    evidence: [
      { type: "semantic_label", signal: "form detected", weight: 0.8 },
      { type: "aria_role", signal: "role=form", weight: 0.9 },
    ],
  };
}

// ============================================================================
// Gate Decision Factory
// ============================================================================

export function createAllowDecision(confidence = 0.9): GateDecision {
  return {
    decision: "allow",
    reason: "Confidence sufficient",
    audit_id: randomUUID(),
    confidence,
    threshold: 0.6,
    contradictionScore: 0.05,
    contradictionLimit: 0.4,
    timestamp: new Date(),
  };
}

export function createEscalateDecision(reason: string, confidence = 0.88): GateDecision {
  return {
    decision: "escalate",
    reason,
    audit_id: randomUUID(),
    confidence,
    threshold: 0.92,
    contradictionScore: 0.05,
    contradictionLimit: 0.1,
    escalation: { type: "human_review", message: reason },
    timestamp: new Date(),
  };
}

// ============================================================================
// E2E Runner Builder
// ============================================================================

export function buildE2ERunner(overrides?: {
  dispatchFn?: (task: AgentTask) => Promise<AgentResult>;
  dispatchParallelFn?: (tasks: AgentTask[]) => Promise<AgentResult[]>;
  budgetOverride?: Partial<BudgetTracker>;
}): {
  runner: WorkflowRunner;
  deps: OrchestratorDependencies;
  contextManager: ContextManager;
} {
  const contextManager = new ContextManager({
    workflowId: randomUUID(),
    traceId: randomUUID(),
    startUrl: "https://example.com",
    budget: {
      maxTokens: 100_000,
      usedTokens: 0,
      maxCostUsd: 1.0,
      usedCostUsd: 0,
      maxDurationMs: 300_000,
      elapsedMs: 0,
      isExceeded: false,
      ...overrides?.budgetOverride,
    },
  });

  const taskDecomposer = new TaskDecomposer();
  const resultAggregator = new ResultAggregator();

  const mockDispatcher = {
    dispatch: overrides?.dispatchFn ?? vi.fn(async (task: AgentTask) =>
      createSuccessResult(task.id),
    ),
    dispatchParallel: overrides?.dispatchParallelFn ?? vi.fn(async (tasks: AgentTask[]) =>
      tasks.map((t) => createSuccessResult(t.id)),
    ),
    cancel: vi.fn(async () => {}),
  };

  const mockPipeline = {
    execute: vi.fn(async () => ({
      success: true,
      gateDecision: null,
      endpoints: [],
      stateChanges: [],
      timing: { adapt: 10, parse: 20, semantic: 30 },
    })),
  };

  const deps: OrchestratorDependencies = {
    dispatcher: mockDispatcher,
    contextManager,
    taskDecomposer,
    pipeline: mockPipeline,
    resultAggregator,
  };

  const runner = new WorkflowRunner(deps);
  return { runner, deps, contextManager };
}

// ============================================================================
// Pipeline Dependencies Builder
// ============================================================================

export function buildMockPipelineDeps(overrides?: {
  endpoints?: Endpoint[];
  confidenceScore?: ConfidenceScore;
  gateDecision?: GateDecision;
}): PipelineDependencies {
  const endpoints = overrides?.endpoints ?? [createMockEndpoint()];
  const confidenceScore = overrides?.confidenceScore ?? createMockConfidenceScore(0.9);
  const gateDecision = overrides?.gateDecision ?? createAllowDecision();

  return {
    adapter: {
      navigate: vi.fn(async () => {}),
      extractDOM: vi.fn(async () => ({
        tagName: "div",
        attributes: {},
        isVisible: true,
        isInteractive: false,
        children: [],
      })),
      extractAccessibilityTree: vi.fn(async () => ({
        role: "main",
        name: "Main",
        disabled: false,
        required: false,
        children: [],
      })),
      close: vi.fn(async () => {}),
    },
    parser: {
      segmentUI: vi.fn(() => []),
    },
    semantic: {
      generateEndpoints: vi.fn(async () => endpoints),
    },
    fingerprint: {
      calculateFingerprint: vi.fn(() => ({
        hash: "a".repeat(64),
        features: {
          semanticRole: "form",
          intentSignals: [],
          formFields: [],
          actionElements: [],
          domDepth: 3,
          childCount: 5,
          interactiveElementCount: 3,
          headingHierarchy: [],
          layoutRegion: "main" as const,
          approximatePosition: { top: 50, left: 50 },
          visibleTextHash: "abc123",
          labelTexts: [],
          buttonTexts: [],
        },
        version: 1,
        createdAt: new Date(),
      })),
    },
    confidence: {
      calculateScore: vi.fn(() => confidenceScore),
    },
    riskGate: {
      evaluate: vi.fn(() => gateDecision),
    },
  };
}

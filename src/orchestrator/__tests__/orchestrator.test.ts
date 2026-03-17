/**
 * Orchestrator — Tests (12+ Tests, Vitest)
 *
 * Alle externen Abhaengigkeiten werden gemockt.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { WorkflowRunner } from "../workflow-runner.js";
import { ContextManager } from "../context-manager.js";
import { TaskDecomposer } from "../task-decomposer.js";
import { ResultAggregator } from "../result-aggregator.js";
import { Pipeline } from "../pipeline.js";
import { Dispatcher } from "../dispatcher.js";
import { detectConflicts } from "../result-aggregator.js";
import {
  DAGCycleError,
  BudgetExceededError,
  WorkflowValidationError,
} from "../errors.js";
import type {
  WorkflowDefinition,
  AgentTask,
  AgentResult,
  SubAgent,
  Endpoint,
} from "../../../shared_interfaces.js";
import type {
  AgentRegistryInterface,
  OrchestratorDependencies,
  PipelineDependencies,
  WorkflowContext,
} from "../types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockAgent(type: string = "navigator"): SubAgent {
  return {
    id: randomUUID(),
    type: type as SubAgent["type"],
    capabilities: {
      canNavigate: true,
      canFill: false,
      canSubmit: false,
      canClick: true,
      canReadSensitive: false,
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

function createMockRegistry(): AgentRegistryInterface {
  const agents = new Map<string, SubAgent>();
  return {
    getAgent: vi.fn(async (type) => {
      const agent = createMockAgent(type);
      agents.set(agent.id, agent);
      return agent;
    }),
    releaseAgent: vi.fn(async () => {}),
    listAgents: vi.fn(() => [...agents.values()]),
  };
}

function createSuccessResult(taskId: string, agentType: string = "navigator", output: Record<string, unknown> = {}): AgentResult {
  return {
    taskId,
    agentId: randomUUID(),
    agentType: agentType as AgentResult["agentType"],
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

function createFailResult(taskId: string, errorCode: string = "STEP_FAILED", recoverable = false): AgentResult {
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

function makeSimpleWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    name: "Simple Navigation",
    startUrl: "https://example.com",
    steps: [
      {
        id: "step-1",
        name: "Navigate to Page",
        agentType: "navigator",
        task: {
          objective: "Navigate to example.com",
          acceptanceCriteria: ["Page loaded"],
        },
        dependsOn: [],
      },
    ],
    ...overrides,
  };
}

function makeFormFillWorkflow(): WorkflowDefinition {
  return {
    name: "Form Fill Workflow",
    startUrl: "https://example.com/form",
    steps: [
      {
        id: "nav",
        name: "Navigate",
        agentType: "navigator",
        task: {
          objective: "Navigate to form page",
          acceptanceCriteria: ["Form page loaded"],
          outputMapping: { currentUrl: "pageUrl" },
        },
        dependsOn: [],
      },
      {
        id: "fill",
        name: "Fill Form",
        agentType: "form_filler",
        task: {
          objective: "Fill the contact form",
          acceptanceCriteria: ["All fields filled"],
          inputMapping: { url: "pageUrl" },
          outputMapping: { formData: "filledForm" },
        },
        dependsOn: ["nav"],
      },
      {
        id: "submit",
        name: "Submit Form",
        agentType: "action_executor",
        task: {
          objective: "Submit the form",
          acceptanceCriteria: ["Form submitted"],
          inputMapping: { form: "filledForm" },
        },
        dependsOn: ["fill"],
      },
    ],
    settings: {
      requireAllStepsSuccess: true,
      continueOnStepFailure: false,
      parallelExecution: true,
      maxTotalDuration: 60_000,
      maxTotalBudget: 0.5,
    },
  };
}

function makeParallelWorkflow(): WorkflowDefinition {
  return {
    name: "Parallel Workflow",
    startUrl: "https://example.com",
    steps: [
      {
        id: "task-a",
        name: "Extract Data A",
        agentType: "data_extractor",
        task: {
          objective: "Extract data from section A",
          acceptanceCriteria: ["Data A extracted"],
          outputMapping: { dataA: "resultA" },
        },
        dependsOn: [],
      },
      {
        id: "task-b",
        name: "Extract Data B",
        agentType: "data_extractor",
        task: {
          objective: "Extract data from section B",
          acceptanceCriteria: ["Data B extracted"],
          outputMapping: { dataB: "resultB" },
        },
        dependsOn: [],
      },
    ],
    settings: {
      parallelExecution: true,
      requireAllStepsSuccess: true,
      continueOnStepFailure: false,
      maxTotalDuration: 60_000,
      maxTotalBudget: 0.5,
    },
  };
}

// ============================================================================
// Helper: Builds a WorkflowRunner with mock dependencies
// ============================================================================

function buildRunner(overrides?: {
  dispatchFn?: (task: AgentTask) => Promise<AgentResult>;
  dispatchParallelFn?: (tasks: AgentTask[]) => Promise<AgentResult[]>;
  budgetOverride?: Partial<WorkflowContext["budget"]>;
}) {
  const registry = createMockRegistry();
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
    dispatch: overrides?.dispatchFn ?? vi.fn(async (task: AgentTask) => createSuccessResult(task.id)),
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
  return { runner, deps, contextManager, mockDispatcher, mockPipeline };
}

// ============================================================================
// Tests
// ============================================================================

describe("Orchestrator", () => {
  // ========================================================================
  // Happy Path (5 Tests)
  // ========================================================================

  describe("Happy Path", () => {
    it("1. Einfacher Navigation-Workflow — 1 Step, success", async () => {
      const { runner } = buildRunner();
      const workflow = makeSimpleWorkflow();

      const result = await runner.run(workflow);

      expect(result.success).toBe(true);
      expect(result.state).toBe("completed");
      expect(result.stepResults.length).toBe(1);
      expect(result.stepResults[0]!.success).toBe(true);
      expect(runner.getState()).toBe("completed");
    });

    it("2. Form-Fill-Workflow — 3 Steps sequentiell, alle erfolgreich", async () => {
      const { runner, mockDispatcher } = buildRunner({
        dispatchFn: vi.fn(async (task: AgentTask) => {
          if (task.stepId === "nav") {
            return createSuccessResult(task.id, "navigator", { currentUrl: "https://example.com/form" });
          }
          if (task.stepId === "fill") {
            return createSuccessResult(task.id, "form_filler", { formData: { name: "Test" } });
          }
          return createSuccessResult(task.id, "action_executor");
        }),
      });

      const workflow = makeFormFillWorkflow();
      const result = await runner.run(workflow);

      expect(result.success).toBe(true);
      expect(result.state).toBe("completed");
      expect(result.stepResults.length).toBe(3);
      expect(result.metrics.stepsCompleted).toBe(3);
      expect(result.metrics.stepsFailed).toBe(0);
    });

    it("3. Parallele Steps — 2 unabhaengige Steps gleichzeitig dispatcht", async () => {
      const dispatchParallelFn = vi.fn(async (tasks: AgentTask[]) =>
        tasks.map((t) => createSuccessResult(t.id, "data_extractor", { data: "extracted" })),
      );

      const { runner } = buildRunner({ dispatchParallelFn });
      const workflow = makeParallelWorkflow();

      const result = await runner.run(workflow);

      expect(result.success).toBe(true);
      expect(result.stepResults.length).toBe(2);
      expect(dispatchParallelFn).toHaveBeenCalledTimes(1);
      // Beide Tasks sollten in einem einzigen dispatchParallel-Aufruf sein
      expect(dispatchParallelFn.mock.calls[0]![0].length).toBe(2);
    });

    it("4. Context wird zwischen Steps propagiert", async () => {
      let capturedInput: Record<string, unknown> = {};

      const { runner } = buildRunner({
        dispatchFn: vi.fn(async (task: AgentTask) => {
          if (task.stepId === "fill") {
            capturedInput = task.inputData;
          }
          if (task.stepId === "nav") {
            return createSuccessResult(task.id, "navigator", { currentUrl: "https://example.com/form" });
          }
          return createSuccessResult(task.id);
        }),
      });

      const workflow = makeFormFillWorkflow();
      const result = await runner.run(workflow);

      expect(result.success).toBe(true);
      // Der "fill" Step sollte pageUrl aus dem Context erhalten haben
      expect(capturedInput["url"]).toBe("https://example.com/form");
    });

    it("5. Pipeline laeuft end-to-end — Adapter → Parser → Semantic → Confidence → Risk Gate", async () => {
      const mockEndpoint: Partial<Endpoint> = {
        id: randomUUID(),
        type: "form",
        confidence: 0.9,
        evidence: [],
      };

      const mockDeps: PipelineDependencies = {
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
          generateEndpoints: vi.fn(async () => [mockEndpoint as Endpoint]),
        },
        fingerprint: {
          calculateFingerprint: vi.fn(() => ({
            hash: "a".repeat(64),
            features: {} as never,
            version: 1,
            createdAt: new Date(),
          })),
        },
        confidence: {
          calculateScore: vi.fn(() => ({
            score: 0.9,
            weights: {
              w1_semantic: 0.25,
              w2_structural: 0.2,
              w3_affordance: 0.2,
              w4_evidence: 0.15,
              w5_historical: 0.1,
              w6_ambiguity: 0.1,
            },
            breakdown: {
              semanticMatch: 0.9,
              structuralStability: 0.8,
              affordanceConsistency: 0.85,
              evidenceQuality: 0.9,
              historicalSuccess: 0.7,
              ambiguityPenalty: 0.1,
            },
            evidence: [],
          })),
        },
        riskGate: {
          evaluate: vi.fn(() => ({
            decision: "allow" as const,
            reason: "Confidence sufficient",
            audit_id: randomUUID(),
            confidence: 0.9,
            threshold: 0.8,
            contradictionScore: 0.05,
            contradictionLimit: 0.3,
            timestamp: new Date(),
          })),
        },
      };

      const pipeline = new Pipeline(mockDeps);
      const context: WorkflowContext = {
        workflowId: randomUUID(),
        traceId: randomUUID(),
        startUrl: "https://example.com",
        state: "running",
        variables: {},
        discoveredEndpoints: [],
        stateChanges: [],
        history: [],
        budget: {
          maxTokens: 100_000,
          usedTokens: 0,
          maxCostUsd: 1.0,
          usedCostUsd: 0,
          maxDurationMs: 300_000,
          elapsedMs: 0,
          isExceeded: false,
        },
        startedAt: new Date(),
        settings: {
          maxTotalDuration: 300_000,
          maxTotalBudget: 1.0,
          continueOnStepFailure: false,
          parallelExecution: true,
          requireAllStepsSuccess: true,
        },
      };

      const result = await pipeline.execute(
        "https://example.com",
        { type: "click" },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.gateDecision?.decision).toBe("allow");
      expect(mockDeps.adapter.navigate).toHaveBeenCalledWith("https://example.com");
      expect(mockDeps.parser.segmentUI).toHaveBeenCalled();
      expect(mockDeps.semantic.generateEndpoints).toHaveBeenCalled();
      expect(mockDeps.riskGate.evaluate).toHaveBeenCalled();
      expect(result.timing).toHaveProperty("adapt");
      expect(result.timing).toHaveProperty("parse");
      expect(result.timing).toHaveProperty("semantic");
    });
  });

  // ========================================================================
  // Edge Cases (4 Tests)
  // ========================================================================

  describe("Edge Cases", () => {
    it("6. Step-Condition nicht erfuellt — Step wird geskippt", async () => {
      const { runner } = buildRunner();

      const workflow = makeSimpleWorkflow({
        steps: [
          {
            id: "conditional-step",
            name: "Conditional Step",
            agentType: "navigator",
            task: {
              objective: "Only if condition met",
              acceptanceCriteria: ["Page loaded"],
            },
            condition: {
              field: "shouldRun",
              operator: "eq",
              value: true,
            },
            skipOnConditionFail: true,
            dependsOn: [],
          },
        ],
      });

      const result = await runner.run(workflow);

      expect(result.success).toBe(true);
      expect(result.state).toBe("completed");
      // Step wurde geskippt, aber Workflow ist erfolgreich
      expect(result.stepResults.length).toBe(1);
    });

    it("7. Budget erschoepft — Workflow stoppt mit BudgetExceededError", async () => {
      const { runner } = buildRunner({
        budgetOverride: {
          maxTokens: 10,
          usedTokens: 0,
          isExceeded: false,
        },
        dispatchFn: vi.fn(async (task: AgentTask) => {
          // Erster Step verbraucht mehr als Budget
          return {
            ...createSuccessResult(task.id),
            llmTokensUsed: 50, // Ueber Budget
          };
        }),
      });

      const workflow: WorkflowDefinition = {
        name: "Multi Step",
        startUrl: "https://example.com",
        steps: [
          {
            id: "step-1",
            name: "Step 1",
            agentType: "navigator",
            task: {
              objective: "First step",
              acceptanceCriteria: ["Done"],
            },
            dependsOn: [],
          },
          {
            id: "step-2",
            name: "Step 2",
            agentType: "navigator",
            task: {
              objective: "Second step",
              acceptanceCriteria: ["Done"],
            },
            dependsOn: ["step-1"],
          },
        ],
      };

      await expect(runner.run(workflow)).rejects.toThrow(BudgetExceededError);
    });

    it("8. Context Pruning — Grosse Daten werden automatisch gekuerzt", () => {
      const ctx = new ContextManager({
        workflowId: randomUUID(),
        traceId: randomUUID(),
        startUrl: "https://example.com",
      });

      // Viele History-Eintraege einfuegen
      for (let i = 0; i < 150; i++) {
        ctx.addHistory({
          timestamp: new Date(),
          type: "context_updated",
          details: { index: i },
        });
      }

      // History sollte auf MAX begrenzt sein
      expect(ctx.getHistory().length).toBeLessThanOrEqual(100);

      // Grosse Variable einfuegen
      ctx.set("bigData", "x".repeat(50_000));
      ctx.prune();

      const snapshot = ctx.getSnapshot();
      const bigValue = snapshot.variables["bigData"] as string;
      // Nach Pruning sollte der Wert gekuerzt sein
      expect(bigValue.length).toBeLessThan(50_000);
      expect(bigValue).toContain("[pruned]");
    });

    it("9. DAG-Zyklus erkennen — Steps mit zyklischer Abhaengigkeit", async () => {
      const { runner } = buildRunner();

      const workflow: WorkflowDefinition = {
        name: "Cyclic Workflow",
        startUrl: "https://example.com",
        steps: [
          {
            id: "a",
            name: "Step A",
            agentType: "navigator",
            task: {
              objective: "Step A",
              acceptanceCriteria: ["Done"],
            },
            dependsOn: ["b"],
          },
          {
            id: "b",
            name: "Step B",
            agentType: "navigator",
            task: {
              objective: "Step B",
              acceptanceCriteria: ["Done"],
            },
            dependsOn: ["a"],
          },
        ],
      };

      await expect(runner.run(workflow)).rejects.toThrow(DAGCycleError);
    });
  });

  // ========================================================================
  // Error Cases (3+ Tests)
  // ========================================================================

  describe("Error Cases", () => {
    it("10. Sub-Agent Timeout — Dispatch gibt failure zurueck, Retry", async () => {
      let callCount = 0;
      const { runner } = buildRunner({
        dispatchFn: vi.fn(async (task: AgentTask) => {
          callCount++;
          if (callCount === 1) {
            return createFailResult(task.id, "TIMEOUT", true);
          }
          return createSuccessResult(task.id);
        }),
      });

      const workflow = makeSimpleWorkflow({
        steps: [
          {
            id: "step-1",
            name: "Step with retry",
            agentType: "navigator",
            task: {
              objective: "Navigate",
              acceptanceCriteria: ["Page loaded"],
            },
            onError: "retry",
            maxRetries: 2,
            dependsOn: [],
          },
        ],
      });

      const result = await runner.run(workflow);

      expect(result.success).toBe(true);
      expect(callCount).toBe(2); // Erster Versuch + 1 Retry
    });

    it("11. Retry mit Fallback — Step fehlschlaegt, Fallback wird ausgefuehrt", async () => {
      const executedSteps: string[] = [];

      const { runner } = buildRunner({
        dispatchFn: vi.fn(async (task: AgentTask) => {
          executedSteps.push(task.stepId);
          if (task.stepId === "primary") {
            return createFailResult(task.id, "STEP_FAILED", false);
          }
          return createSuccessResult(task.id, "navigator", { fallbackUsed: true });
        }),
      });

      const workflow: WorkflowDefinition = {
        name: "Fallback Workflow",
        startUrl: "https://example.com",
        settings: {
          continueOnStepFailure: false,
          requireAllStepsSuccess: true,
          parallelExecution: true,
          maxTotalDuration: 60_000,
          maxTotalBudget: 0.5,
        },
        steps: [
          {
            id: "primary",
            name: "Primary Step",
            agentType: "navigator",
            task: {
              objective: "Primary action",
              acceptanceCriteria: ["Done"],
            },
            onError: "fallback",
            fallbackStepId: "fallback",
            maxRetries: 0,
            dependsOn: [],
          },
          {
            id: "fallback",
            name: "Fallback Step",
            agentType: "navigator",
            task: {
              objective: "Fallback action",
              acceptanceCriteria: ["Done"],
            },
            dependsOn: [],
          },
        ],
      };

      const result = await runner.run(workflow);

      expect(executedSteps).toContain("primary");
      expect(executedSteps).toContain("fallback");
    });

    it("12. Workflow Abort — abort() waehrend laufendem Workflow", async () => {
      let runnerRef: WorkflowRunner;

      const { runner } = buildRunner({
        dispatchFn: vi.fn(async (task: AgentTask) => {
          if (task.stepId === "step-1") {
            // Abort waehrend Step 1
            runnerRef.abort("user_cancelled");
            return createSuccessResult(task.id);
          }
          return createSuccessResult(task.id);
        }),
      });

      runnerRef = runner;

      const workflow: WorkflowDefinition = {
        name: "Abortable Workflow",
        startUrl: "https://example.com",
        steps: [
          {
            id: "step-1",
            name: "Step 1",
            agentType: "navigator",
            task: {
              objective: "First",
              acceptanceCriteria: ["Done"],
            },
            dependsOn: [],
          },
          {
            id: "step-2",
            name: "Step 2",
            agentType: "navigator",
            task: {
              objective: "Second",
              acceptanceCriteria: ["Done"],
            },
            dependsOn: ["step-1"],
          },
        ],
      };

      const result = await runner.run(workflow);

      expect(result.success).toBe(false);
      expect(result.state).toBe("failed");
      expect(runner.getState()).toBe("failed");
    });

    it("13. Ungueltige Workflow-Definition — WorkflowValidationError", async () => {
      const { runner } = buildRunner();

      const invalidWorkflow = {
        name: "",
        // startUrl fehlt, steps fehlt
      } as unknown as WorkflowDefinition;

      await expect(runner.run(invalidWorkflow)).rejects.toThrow(
        WorkflowValidationError,
      );
    });

    it("14. ResultAggregator erkennt Konflikte zwischen Tasks", () => {
      const r1: AgentResult = {
        ...createSuccessResult(randomUUID()),
        output: { pageTitle: "Title A" },
        endpointsDiscovered: [randomUUID()],
      };

      const sharedEndpoint = r1.endpointsDiscovered[0]!;

      const r2: AgentResult = {
        ...createFailResult(randomUUID()),
        output: { pageTitle: "Title B" },
        endpointsDiscovered: [sharedEndpoint],
      };

      const conflicts = detectConflicts([r1, r2]);

      expect(conflicts.length).toBeGreaterThan(0);
      // Sollte Konflikt fuer success und output.pageTitle erkennen
      const successConflict = conflicts.find((c) => c.field === "success");
      expect(successConflict).toBeDefined();
      expect(successConflict!.severity).toBe("high");

      const outputConflict = conflicts.find((c) => c.field === "output.pageTitle");
      expect(outputConflict).toBeDefined();
    });
  });
});

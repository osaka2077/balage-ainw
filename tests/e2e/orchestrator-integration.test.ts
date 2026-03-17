/**
 * E2E Tests — Orchestrator Integration (Error Recovery + Edge Cases)
 *
 * Tests 6-8: Agent-Fehler mit Retry, Budget-Ueberschreitung, Leerer Workflow
 */
import { describe, it, expect, vi } from "vitest";
import type { AgentTask, WorkflowDefinition } from "../../shared_interfaces.js";
import { WorkflowDefinitionSchema } from "../../shared_interfaces.js";
import { BudgetExceededError, WorkflowValidationError } from "../../src/orchestrator/errors.js";
import {
  buildE2ERunner,
  createSuccessResult,
  createFailResult,
} from "./helpers.js";

// ============================================================================
// Test 6-7: Error Recovery
// ============================================================================

describe("E2E: Error Recovery", () => {

  it("6. Agent-Fehler mit Retry — FormFiller fehlschlaegt, dann Erfolg", async () => {
    let callCount = 0;

    const { runner } = buildE2ERunner({
      dispatchFn: vi.fn(async (task: AgentTask) => {
        callCount++;

        // Erster Versuch: Fehler (recoverable)
        if (callCount === 1) {
          return {
            ...createFailResult(task.id, "FIELD_NOT_FOUND", true),
            agentType: "form_filler" as const,
          };
        }

        // Zweiter Versuch: Erfolg
        return createSuccessResult(task.id, "form_filler", {
          filledFields: ["firstname", "lastname", "email"],
          fieldCount: 3,
        });
      }),
    });

    const retryWorkflow: WorkflowDefinition = {
      name: "Retry Workflow",
      startUrl: "https://example.com/contact",
      steps: [
        {
          id: "fill-form",
          name: "Fill contact form",
          agentType: "form_filler",
          task: {
            objective: "Fill the contact form fields",
            acceptanceCriteria: ["All fields filled"],
          },
          onError: "retry",
          maxRetries: 2,
          dependsOn: [],
        },
      ],
    };

    const result = await runner.run(retryWorkflow);

    // Workflow erfolgreich trotz erstem Fehlversuch
    expect(result.success).toBe(true);
    expect(result.state).toBe("completed");

    // Dispatcher wurde 2x aufgerufen (1 Fehler + 1 Erfolg)
    expect(callCount).toBe(2);

    // Step-Ergebnis ist erfolgreich
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]!.success).toBe(true);
  });

  it("7. Workflow Abort bei Budget-Ueberschreitung — BudgetExceededError", async () => {
    const { runner } = buildE2ERunner({
      budgetOverride: {
        maxTokens: 10,
        usedTokens: 0,
        isExceeded: false,
      },
      dispatchFn: vi.fn(async (task: AgentTask) => {
        // Erster Step verbraucht viel mehr als Budget
        return {
          ...createSuccessResult(task.id),
          llmTokensUsed: 50,
          llmCost: 0.1,
        };
      }),
    });

    const budgetWorkflow: WorkflowDefinition = {
      name: "Budget Test Workflow",
      startUrl: "https://example.com",
      steps: [
        {
          id: "step-1",
          name: "First step",
          agentType: "navigator",
          task: {
            objective: "First action",
            acceptanceCriteria: ["Done"],
          },
          dependsOn: [],
        },
        {
          id: "step-2",
          name: "Second step (should never run)",
          agentType: "navigator",
          task: {
            objective: "Second action",
            acceptanceCriteria: ["Done"],
          },
          dependsOn: ["step-1"],
        },
      ],
    };

    // BudgetExceededError wird geworfen
    await expect(runner.run(budgetWorkflow)).rejects.toThrow(BudgetExceededError);

    // State ist failed
    expect(runner.getState()).toBe("failed");
  });
});

// ============================================================================
// Test 8: Edge Case
// ============================================================================

describe("E2E: Edge Cases", () => {

  it("8. Leerer Workflow — 0 Steps → WorkflowValidationError", async () => {
    const { runner } = buildE2ERunner();

    const emptyWorkflow = {
      name: "Empty Workflow",
      startUrl: "https://example.com",
      steps: [],
    } as unknown as WorkflowDefinition;

    // WorkflowDefinitionSchema.parse() wirft Fehler (min 1 Step)
    expect(() =>
      WorkflowDefinitionSchema.parse(emptyWorkflow),
    ).toThrow();

    // WorkflowRunner.run() wirft WorkflowValidationError
    await expect(runner.run(emptyWorkflow)).rejects.toThrow(WorkflowValidationError);
  });

  it("9. Workflow State Machine — Zustandsuebergaenge korrekt", async () => {
    const stateTransitions: string[] = [];

    const { runner, contextManager } = buildE2ERunner({
      dispatchFn: vi.fn(async (task: AgentTask) => {
        // Zustand waehrend Dispatch erfassen
        stateTransitions.push(contextManager.getSnapshot().state);
        return createSuccessResult(task.id, "navigator", {
          currentUrl: "https://example.com/page",
        });
      }),
    });

    // Vor dem Start: pending
    expect(runner.getState()).toBe("pending");

    const result = await runner.run({
      name: "State Machine Test",
      startUrl: "https://example.com",
      steps: [
        {
          id: "step-1",
          name: "Navigate",
          agentType: "navigator",
          task: {
            objective: "Navigate",
            acceptanceCriteria: ["Done"],
          },
          dependsOn: [],
        },
      ],
    });

    // Nach Abschluss: completed
    expect(result.state).toBe("completed");
    expect(runner.getState()).toBe("completed");

    // Waehrend Dispatch war der State "waiting"
    expect(stateTransitions).toContain("waiting");
  });

  it("10. Parallele unabhaengige Steps — gleichzeitig dispatcht", async () => {
    const dispatchParallelFn = vi.fn(async (tasks: AgentTask[]) =>
      tasks.map((t) => createSuccessResult(t.id, "data_extractor", {
        data: `extracted-${t.stepId}`,
      })),
    );

    const { runner } = buildE2ERunner({ dispatchParallelFn });

    const parallelWorkflow: WorkflowDefinition = {
      name: "Parallel Workflow",
      startUrl: "https://example.com",
      steps: [
        {
          id: "extract-a",
          name: "Extract A",
          agentType: "data_extractor",
          task: {
            objective: "Extract data A",
            acceptanceCriteria: ["Data A extracted"],
            outputMapping: { data: "resultA" },
          },
          dependsOn: [],
        },
        {
          id: "extract-b",
          name: "Extract B",
          agentType: "data_extractor",
          task: {
            objective: "Extract data B",
            acceptanceCriteria: ["Data B extracted"],
            outputMapping: { data: "resultB" },
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

    const result = await runner.run(parallelWorkflow);

    expect(result.success).toBe(true);
    expect(result.stepResults).toHaveLength(2);

    // Beide Tasks in einem einzigen dispatchParallel-Aufruf
    expect(dispatchParallelFn).toHaveBeenCalledTimes(1);
    expect(dispatchParallelFn.mock.calls[0]![0]).toHaveLength(2);
  });
});

/**
 * Orchestrator — Workflow Runner
 *
 * Workflow State Machine: Treibt den gesamten Workflow voran.
 * Topologische Sortierung, Budget-Check, Condition-Evaluation,
 * parallele Step-Ausfuehrung, Error Recovery.
 */

import { randomUUID } from "node:crypto";
import pino from "pino";
import { WorkflowDefinitionSchema } from "../../shared_interfaces.js";
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepCondition,
  AgentTask,
  AgentResult,
} from "../../shared_interfaces.js";
import type {
  WorkflowState,
  WorkflowContext,
  WorkflowResult,
  StepResult,
  OrchestratorDependencies,
} from "./types.js";
import {
  WorkflowValidationError,
  WorkflowExecutionError,
  BudgetExceededError,
  DAGCycleError,
} from "./errors.js";

const logger = pino({ name: "orchestrator:workflow-runner" });

/** Topologische Sortierung der Steps (Kahn's Algorithm) */
function topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const step of steps) {
    inDegree.set(step.id, 0);
    adjacency.set(step.id, []);
  }

  for (const step of steps) {
    for (const dep of step.dependsOn) {
      const existing = adjacency.get(dep);
      if (existing) {
        existing.push(step.id);
      }
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const sorted: WorkflowStep[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const step = stepMap.get(current);
    if (step) {
      sorted.push(step);
    }

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== steps.length) {
    // Zyklus erkennen — verbleibende Steps sind im Zyklus
    const remaining = steps
      .filter((s) => !sorted.some((ss) => ss.id === s.id))
      .map((s) => s.id);
    throw new DAGCycleError(remaining);
  }

  return sorted;
}

/** Condition gegen den Context evaluieren */
function evaluateCondition(
  condition: WorkflowStepCondition,
  context: WorkflowContext,
): boolean {
  const fieldValue = context.variables[condition.field];

  switch (condition.operator) {
    case "eq":
      return fieldValue === condition.value;
    case "neq":
      return fieldValue !== condition.value;
    case "gt":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue > condition.value
      );
    case "lt":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue < condition.value
      );
    case "gte":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue >= condition.value
      );
    case "lte":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue <= condition.value
      );
    case "contains":
      return (
        typeof fieldValue === "string" &&
        typeof condition.value === "string" &&
        fieldValue.includes(condition.value)
      );
    case "exists":
      return fieldValue !== undefined && fieldValue !== null;
    case "not_exists":
      return fieldValue === undefined || fieldValue === null;
    default:
      return false;
  }
}

/** Gruppen paralleler Steps bestimmen (gleiche "Ebene" im DAG) */
function getParallelGroups(sortedSteps: WorkflowStep[]): WorkflowStep[][] {
  const completed = new Set<string>();
  const groups: WorkflowStep[][] = [];
  const remaining = [...sortedSteps];

  while (remaining.length > 0) {
    const group: WorkflowStep[] = [];
    const nextRemaining: WorkflowStep[] = [];

    for (const step of remaining) {
      const depsResolved = step.dependsOn.every((d) => completed.has(d));
      if (depsResolved) {
        group.push(step);
      } else {
        nextRemaining.push(step);
      }
    }

    if (group.length === 0) {
      // Sicherheitsnetz: sollte nicht passieren nach topo-sort
      break;
    }

    groups.push(group);
    for (const s of group) {
      completed.add(s.id);
    }

    remaining.length = 0;
    remaining.push(...nextRemaining);
  }

  return groups;
}

export class WorkflowRunner {
  private readonly deps: OrchestratorDependencies;
  private state: WorkflowState = "pending";
  private aborted = false;
  private abortReason?: string;

  constructor(deps: OrchestratorDependencies) {
    this.deps = deps;
  }

  async run(workflow: WorkflowDefinition): Promise<WorkflowResult> {
    // Schritt 1: Validierung
    let validatedWorkflow: WorkflowDefinition;
    try {
      validatedWorkflow = WorkflowDefinitionSchema.parse(workflow);
    } catch (err) {
      throw new WorkflowValidationError(
        `Invalid workflow: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined,
      );
    }

    // Schritt 2: State + traceId
    const traceId = randomUUID();
    const workflowId = validatedWorkflow.id ?? randomUUID();
    this.state = "running";

    logger.info({ workflowId, traceId, name: validatedWorkflow.name }, "Workflow started");

    // Schritt 3: Context initialisieren
    const settings = validatedWorkflow.settings;
    this.deps.contextManager.updateState("running");

    // Context-Felder direkt setzen
    const ctx = this.deps.contextManager.getSnapshot();
    this.deps.contextManager.set("_workflowId", workflowId);
    this.deps.contextManager.set("_traceId", traceId);

    // Budget konfigurieren
    this.deps.contextManager.updateBudget(0, 0, 0);

    const startedAt = new Date();
    this.deps.contextManager.addHistory({
      timestamp: startedAt,
      type: "step_started",
      details: { workflow: validatedWorkflow.name, traceId },
    });

    // Schritt 4: Topologische Sortierung (DAG-Validierung inkl.)
    // Fallback-Steps aus normaler Planung entfernen
    const fallbackStepIds = new Set(
      validatedWorkflow.steps
        .filter((s) => s.fallbackStepId)
        .map((s) => s.fallbackStepId!),
    );
    const schedulableSteps = validatedWorkflow.steps.filter(
      (s) => !fallbackStepIds.has(s.id),
    );
    const sortedSteps = topologicalSort(schedulableSteps);

    // Schritt 5: Steps ausfuehren
    const stepResults: StepResult[] = [];
    const allResults: AgentResult[] = [];
    const allTasks: AgentTask[] = [];

    // Context-Snapshot fuer TaskDecomposer
    const buildContext = (): WorkflowContext => ({
      workflowId,
      traceId,
      startUrl: validatedWorkflow.startUrl,
      currentUrl: validatedWorkflow.startUrl,
      state: this.state,
      variables: this.deps.contextManager.getSnapshot().variables,
      discoveredEndpoints: this.deps.contextManager.getSnapshot().discoveredEndpoints,
      stateChanges: this.deps.contextManager.getSnapshot().stateChanges,
      history: this.deps.contextManager.getHistory(),
      budget: this.deps.contextManager.getSnapshot().budget,
      startedAt,
      settings: {
        maxTotalDuration: settings.maxTotalDuration,
        maxTotalBudget: settings.maxTotalBudget,
        continueOnStepFailure: settings.continueOnStepFailure,
        parallelExecution: settings.parallelExecution,
        requireAllStepsSuccess: settings.requireAllStepsSuccess,
      },
    });

    const parallelGroups = settings.parallelExecution
      ? getParallelGroups(sortedSteps)
      : sortedSteps.map((s) => [s]);

    for (const group of parallelGroups) {
      if (this.aborted) break;

      // Budget-Check vor jeder Gruppe
      const elapsed = Date.now() - startedAt.getTime();
      this.deps.contextManager.updateBudget(0, 0, elapsed);
      if (this.deps.contextManager.isBudgetExceeded()) {
        const snapshot = this.deps.contextManager.getSnapshot();
        this.state = "failed";
        this.deps.contextManager.updateState("failed");
        throw new BudgetExceededError(
          "tokens_or_cost",
          snapshot.budget.maxTokens,
          snapshot.budget.usedTokens,
        );
      }

      // Tasks fuer diese Gruppe erzeugen
      const context = buildContext();
      const groupTasks: AgentTask[] = [];

      for (const step of group) {
        // Condition pruefen
        if (step.condition) {
          const condMet = evaluateCondition(step.condition, context);
          if (!condMet && step.skipOnConditionFail) {
            logger.info({ stepId: step.id }, "Step skipped: condition not met");
            stepResults.push({
              stepId: step.id,
              taskId: "",
              agentType: step.agentType,
              success: true,
              output: {},
              duration: 0,
              retries: 0,
            });
            continue;
          }
        }

        const task = this.deps.taskDecomposer.decomposeStep(step, context);
        // agentType im Task hinterlegen fuer den Dispatcher
        task.inputData["_agentType"] = step.agentType;
        groupTasks.push(task);
        allTasks.push(task);

        this.deps.contextManager.addHistory({
          timestamp: new Date(),
          type: "agent_dispatched",
          stepId: step.id,
          taskId: task.id,
          details: { agentType: step.agentType },
        });
      }

      if (groupTasks.length === 0) continue;

      // Dispatch
      this.state = "waiting";
      this.deps.contextManager.updateState("waiting");

      let groupResults: AgentResult[];
      if (groupTasks.length === 1) {
        const result = await this.executeWithRetry(
          groupTasks[0]!,
          group[0]!,
          validatedWorkflow,
          buildContext,
        );
        groupResults = [result];
      } else {
        groupResults = await this.deps.dispatcher.dispatchParallel(groupTasks);
      }

      this.state = "running";
      this.deps.contextManager.updateState("running");

      // Ergebnisse verarbeiten
      for (let i = 0; i < groupResults.length; i++) {
        const result = groupResults[i]!;
        const task = groupTasks[i]!;
        const step = group.find((s) => s.id === task.stepId) ?? group[i]!;

        allResults.push(result);

        // Context aktualisieren
        this.deps.contextManager.applyResult(
          task.id,
          result,
          step.task.outputMapping,
        );

        stepResults.push({
          stepId: step.id,
          taskId: task.id,
          agentType: step.agentType,
          success: result.success,
          output: result.output,
          error: result.error,
          duration: result.duration,
          retries: 0,
        });

        if (!result.success && !settings.continueOnStepFailure) {
          if (settings.requireAllStepsSuccess) {
            this.state = "failed";
            this.deps.contextManager.updateState("failed");
            logger.error(
              { stepId: step.id, taskId: task.id },
              "Step failed, aborting workflow",
            );
            break;
          }
        }

        this.deps.contextManager.addHistory({
          timestamp: new Date(),
          type: result.success ? "step_completed" : "step_failed",
          stepId: step.id,
          taskId: task.id,
          details: {
            success: result.success,
            duration: result.duration,
          },
        });
      }

      // Globale Conditions pruefen
      if (validatedWorkflow.conditions.length > 0) {
        const ctx = buildContext();
        for (const gc of validatedWorkflow.conditions) {
          if (evaluateCondition(gc.condition, ctx)) {
            logger.warn(
              { condition: gc.name, action: gc.action },
              "Global condition triggered",
            );
            if (gc.action === "abort") {
              this.aborted = true;
              this.abortReason = `Global condition: ${gc.name}`;
            }
          }
        }
      }

      if (this.state === "failed") break;
    }

    // Schritt 6+7: Aggregieren und finalisieren
    const finalContext = buildContext();
    const workflowResult = this.deps.resultAggregator.aggregateResults(
      allResults,
      allTasks,
      finalContext,
    );

    // Lokal getrackte stepResults uebernehmen (inkl. skipped Steps)
    workflowResult.stepResults = stepResults;
    const skippedCount = stepResults.filter(
      (r) => r.taskId === "" && r.success,
    ).length;
    workflowResult.metrics.stepsSkipped = skippedCount;

    if (this.aborted) {
      workflowResult.success = false;
      workflowResult.state = "failed";
    }

    this.state = workflowResult.state;
    this.deps.contextManager.updateState(workflowResult.state);

    logger.info(
      {
        workflowId,
        success: workflowResult.success,
        state: workflowResult.state,
        duration: workflowResult.metrics.totalDuration,
      },
      "Workflow completed",
    );

    return workflowResult;
  }

  getState(): WorkflowState {
    return this.state;
  }

  abort(reason: string): void {
    this.aborted = true;
    this.abortReason = reason;
    this.state = "failed";
    this.deps.contextManager.updateState("failed");
    logger.warn({ reason }, "Workflow aborted");
  }

  /** Step mit Retry und Fallback ausfuehren */
  private async executeWithRetry(
    task: AgentTask,
    step: WorkflowStep,
    workflow: WorkflowDefinition,
    buildContext: () => WorkflowContext,
  ): Promise<AgentResult> {
    let lastResult: AgentResult | undefined;
    const maxRetries = step.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (this.aborted) {
        return this.createAbortResult(task);
      }

      lastResult = await this.deps.dispatcher.dispatch(task);

      if (lastResult.success) {
        return lastResult;
      }

      // Retry bei recoverable Fehler
      if (
        lastResult.error?.recoverable &&
        attempt < maxRetries &&
        step.onError === "retry"
      ) {
        logger.info(
          { stepId: step.id, attempt: attempt + 1, maxRetries },
          "Retrying step",
        );
        continue;
      }

      // Fallback
      if (step.onError === "fallback" && step.fallbackStepId) {
        const fallbackStep = workflow.steps.find(
          (s) => s.id === step.fallbackStepId,
        );
        if (fallbackStep) {
          logger.info(
            { stepId: step.id, fallbackStepId: fallbackStep.id },
            "Executing fallback step",
          );
          const fallbackTask = this.deps.taskDecomposer.decomposeStep(
            fallbackStep,
            buildContext(),
          );
          fallbackTask.inputData["_agentType"] = fallbackStep.agentType;
          return this.deps.dispatcher.dispatch(fallbackTask);
        }
      }

      break;
    }

    return lastResult!;
  }

  private createAbortResult(task: AgentTask): AgentResult {
    return {
      taskId: task.id,
      agentId: task.agentId,
      agentType: "navigator",
      success: false,
      output: {},
      error: {
        code: "ABORTED",
        message: this.abortReason ?? "Workflow aborted",
        recoverable: false,
      },
      duration: 0,
      actionsPerformed: 0,
      llmTokensUsed: 0,
      llmCost: 0,
      stateChanges: [],
      endpointsDiscovered: [],
      evidence: [],
      completedAt: new Date(),
    };
  }
}

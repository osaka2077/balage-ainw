/**
 * Orchestrator — Task Decomposer
 *
 * Zerlegt Workflow-Steps in konkrete AgentTasks.
 */

import { randomUUID } from "node:crypto";
import pino from "pino";
import { AgentTaskSchema } from "../../shared_interfaces.js";
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepCondition,
  AgentTask,
} from "../../shared_interfaces.js";
import type { WorkflowContext, TaskDecomposerInterface } from "./types.js";
import { TaskDecompositionError } from "./errors.js";

const logger = pino({ name: "orchestrator:task-decomposer" });

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

/** InputMapping anwenden: Context-Variablen in inputData einsetzen */
function resolveInputMapping(
  mapping: Record<string, string>,
  context: WorkflowContext,
): Record<string, unknown> {
  const inputData: Record<string, unknown> = {};
  for (const [taskField, contextKey] of Object.entries(mapping)) {
    inputData[taskField] = context.variables[contextKey];
  }
  return inputData;
}

/** Einzelnen Step in AgentTask umwandeln */
export function decomposeStep(
  step: WorkflowStep,
  context: WorkflowContext,
): AgentTask {
  // Condition pruefen
  if (step.condition) {
    const conditionMet = evaluateCondition(step.condition, context);
    if (!conditionMet && step.skipOnConditionFail) {
      logger.info({ stepId: step.id }, "Step skipped: condition not met");
      const skippedTask = AgentTaskSchema.parse({
        id: randomUUID(),
        agentId: randomUUID(),
        workflowId: context.workflowId,
        stepId: step.id,
        objective: step.task.objective,
        constraints: step.task.constraints,
        acceptanceCriteria: step.task.acceptanceCriteria,
        inputMapping: step.task.inputMapping,
        outputMapping: step.task.outputMapping,
        inputData: {},
        onError: step.onError,
        maxRetries: step.maxRetries,
        timeout: step.timeout,
        dependsOn: step.dependsOn,
        status: "skipped",
        createdAt: new Date(),
      });
      return skippedTask;
    }
  }

  const inputData = resolveInputMapping(step.task.inputMapping, context);

  try {
    const task = AgentTaskSchema.parse({
      id: randomUUID(),
      agentId: randomUUID(), // Platzhalter, wird vom Dispatcher zugewiesen
      workflowId: context.workflowId,
      stepId: step.id,
      objective: step.task.objective,
      constraints: step.task.constraints,
      acceptanceCriteria: step.task.acceptanceCriteria,
      inputMapping: step.task.inputMapping,
      outputMapping: step.task.outputMapping,
      inputData,
      url: context.currentUrl ?? context.startUrl,
      onError: step.onError,
      fallbackStepId: step.fallbackStepId,
      maxRetries: step.maxRetries,
      timeout: step.timeout,
      dependsOn: step.dependsOn,
      status: "pending",
      createdAt: new Date(),
    });

    logger.debug({ stepId: step.id, taskId: task.id }, "Step decomposed to task");
    return task;
  } catch (err) {
    throw new TaskDecompositionError(
      `Failed to decompose step ${step.id}: ${err instanceof Error ? err.message : String(err)}`,
      step.id,
      err instanceof Error ? err : undefined,
    );
  }
}

/** Alle Workflow-Steps in AgentTasks umwandeln (topologische Reihenfolge) */
export function decomposeWorkflow(
  workflow: WorkflowDefinition,
  context: WorkflowContext,
): AgentTask[] {
  const tasks: AgentTask[] = [];

  for (const step of workflow.steps) {
    const task = decomposeStep(step, context);
    tasks.push(task);
  }

  logger.info(
    { workflowId: workflow.id, taskCount: tasks.length },
    "Workflow decomposed",
  );

  return tasks;
}

/** TaskDecomposer als Klasse (fuer DI) */
export class TaskDecomposer implements TaskDecomposerInterface {
  decomposeWorkflow(
    workflow: WorkflowDefinition,
    context: WorkflowContext,
  ): AgentTask[] {
    return decomposeWorkflow(workflow, context);
  }

  decomposeStep(step: WorkflowStep, context: WorkflowContext): AgentTask {
    return decomposeStep(step, context);
  }
}

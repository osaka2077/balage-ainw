/**
 * Orchestrator — Result Aggregator
 *
 * Fuehrt Ergebnisse aller Sub-Agents zusammen.
 */

import pino from "pino";
import type { AgentResult, AgentTask } from "../../shared_interfaces.js";
import type {
  WorkflowResult,
  WorkflowContext,
  ResultConflict,
  WorkflowMetrics,
  StepResult,
  ResultAggregatorInterface,
} from "./types.js";

const logger = pino({ name: "orchestrator:result-aggregator" });

/** Konflikte zwischen Ergebnissen erkennen */
export function detectConflicts(results: AgentResult[]): ResultConflict[] {
  const conflicts: ResultConflict[] = [];

  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const r1 = results[i]!;
      const r2 = results[j]!;

      // Gleicher Endpoint von zwei Agents unterschiedlich?
      const r1Endpoints = new Set(r1.endpointsDiscovered);
      const r2Endpoints = new Set(r2.endpointsDiscovered);
      const sharedEndpoints = [...r1Endpoints].filter((e) =>
        r2Endpoints.has(e),
      );

      if (sharedEndpoints.length > 0 && r1.success !== r2.success) {
        conflicts.push({
          taskId1: r1.taskId,
          taskId2: r2.taskId,
          field: "success",
          value1: r1.success,
          value2: r2.success,
          description: `Tasks disagree on success for shared endpoints: ${sharedEndpoints.join(", ")}`,
          severity: "high",
        });
      }

      // Output-Konflikte: gleiche Keys mit unterschiedlichen Werten
      for (const key of Object.keys(r1.output)) {
        if (
          key in r2.output &&
          JSON.stringify(r1.output[key]) !== JSON.stringify(r2.output[key])
        ) {
          conflicts.push({
            taskId1: r1.taskId,
            taskId2: r2.taskId,
            field: `output.${key}`,
            value1: r1.output[key],
            value2: r2.output[key],
            description: `Conflicting output for key "${key}"`,
            severity: "medium",
          });
        }
      }
    }
  }

  if (conflicts.length > 0) {
    logger.warn({ conflictCount: conflicts.length }, "Conflicts detected");
  }

  return conflicts;
}

/** Ergebnisse aller Tasks aggregieren */
export function aggregateResults(
  results: AgentResult[],
  tasks: AgentTask[],
  context: WorkflowContext,
): WorkflowResult {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const stepResults: StepResult[] = results.map((result) => {
    const task = taskMap.get(result.taskId);
    return {
      stepId: task?.stepId ?? "unknown",
      taskId: result.taskId,
      agentType: result.agentType,
      success: result.success,
      output: result.output,
      error: result.error,
      duration: result.duration,
      retries: 0,
    };
  });

  const completed = stepResults.filter((r) => r.success);
  const failed = stepResults.filter((r) => !r.success);
  const skipped = tasks.filter((t) => t.status === "skipped");

  // Alle Endpoints zusammenfuehren (dedupliziert)
  const endpointIds = new Set<string>();
  for (const result of results) {
    for (const epId of result.endpointsDiscovered) {
      endpointIds.add(epId);
    }
  }

  const metrics: WorkflowMetrics = {
    totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
    totalActions: results.reduce((sum, r) => sum + r.actionsPerformed, 0),
    totalLlmTokens: results.reduce((sum, r) => sum + r.llmTokensUsed, 0),
    totalLlmCost: results.reduce((sum, r) => sum + r.llmCost, 0),
    stepsCompleted: completed.length,
    stepsFailed: failed.length,
    stepsSkipped: skipped.length,
    endpointsDiscovered: endpointIds.size,
  };

  const conflicts = detectConflicts(results);

  const allSuccess = failed.length === 0;

  const workflowResult: WorkflowResult = {
    workflowId: context.workflowId,
    traceId: context.traceId,
    success: allSuccess,
    state: allSuccess ? "completed" : "failed",
    stepResults,
    discoveredEndpoints: context.discoveredEndpoints,
    conflicts,
    metrics,
    startedAt: context.startedAt,
    completedAt: new Date(),
  };

  logger.info(
    {
      workflowId: context.workflowId,
      success: allSuccess,
      completed: completed.length,
      failed: failed.length,
      skipped: skipped.length,
    },
    "Results aggregated",
  );

  return workflowResult;
}

/** ResultAggregator als Klasse (fuer DI) */
export class ResultAggregator implements ResultAggregatorInterface {
  aggregateResults(
    results: AgentResult[],
    tasks: AgentTask[],
    context: WorkflowContext,
  ): WorkflowResult {
    return aggregateResults(results, tasks, context);
  }

  detectConflicts(results: AgentResult[]): ResultConflict[] {
    return detectConflicts(results);
  }
}

/**
 * Orchestrator — Dispatcher
 *
 * Delegiert Tasks an Sub-Agents und sammelt Ergebnisse ein.
 */

import pino from "pino";
import { AgentResultSchema } from "../../shared_interfaces.js";
import type { AgentTask, AgentResult, SubAgentType } from "../../shared_interfaces.js";
import type { AgentRegistryInterface, DispatcherInterface } from "./types.js";
import { DispatchError, DispatchTimeoutError } from "./errors.js";

const logger = pino({ name: "orchestrator:dispatcher" });

export class Dispatcher implements DispatcherInterface {
  private readonly registry: AgentRegistryInterface;
  private readonly runningTasks = new Map<string, AbortController>();

  constructor(agentRegistry: AgentRegistryInterface) {
    this.registry = agentRegistry;
  }

  async dispatch(task: AgentTask): Promise<AgentResult> {
    const agentType = this.inferAgentType(task);
    logger.info(
      { taskId: task.id, agentType, stepId: task.stepId },
      "Dispatching task",
    );

    const abortController = new AbortController();
    this.runningTasks.set(task.id, abortController);

    try {
      const agent = await this.registry.getAgent(agentType);

      const resultPromise = this.executeWithAgent(agent.id, task);
      const timeoutPromise = this.createTimeout(
        task.id,
        agentType,
        task.timeout,
        abortController.signal,
      );

      const result = await Promise.race([resultPromise, timeoutPromise]);
      const validated = AgentResultSchema.parse(result);

      logger.info(
        { taskId: task.id, success: validated.success, duration: validated.duration },
        "Task completed",
      );

      return validated;
    } catch (err) {
      if (err instanceof DispatchTimeoutError) {
        return this.createFailureResult(task.id, agentType, "TIMEOUT", err.message);
      }

      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new DispatchError(
        `Dispatch failed for task ${task.id}: ${errorMsg}`,
        task.id,
        agentType,
        err instanceof Error ? err : undefined,
      );
    } finally {
      this.runningTasks.delete(task.id);
      const agentType2 = this.inferAgentType(task);
      try {
        const agent = await this.registry.getAgent(agentType2);
        await this.registry.releaseAgent(agent.id);
      } catch {
        // Ignorieren — Agent ist bereits released oder nicht verfuegbar
      }
    }
  }

  async dispatchParallel(tasks: AgentTask[]): Promise<AgentResult[]> {
    logger.info({ taskCount: tasks.length }, "Dispatching tasks in parallel");

    const settled = await Promise.allSettled(
      tasks.map((task) => this.dispatch(task)),
    );

    return settled.map((result, idx) => {
      if (result.status === "fulfilled") {
        return result.value;
      }

      const task = tasks[idx];
      if (!task) {
        return this.createFailureResult(
          "unknown",
          "navigator",
          "DISPATCH_FAILED",
          "Task not found",
        );
      }
      const agentType = this.inferAgentType(task);
      logger.error(
        { taskId: task.id, error: result.reason },
        "Parallel dispatch failed",
      );
      return this.createFailureResult(
        task.id,
        agentType,
        "DISPATCH_FAILED",
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
      );
    });
  }

  async cancel(taskId: string): Promise<void> {
    const controller = this.runningTasks.get(taskId);
    if (controller) {
      controller.abort();
      this.runningTasks.delete(taskId);
      logger.info({ taskId }, "Task cancelled");
    }
  }

  /** Agent-Typ aus Task ableiten (Fallback: step metadata oder default) */
  private inferAgentType(task: AgentTask): SubAgentType {
    // agentType kommt aus dem inputData wenn vom WorkflowRunner gesetzt
    const agentTypeFromInput = task.inputData["_agentType"];
    if (
      typeof agentTypeFromInput === "string" &&
      isValidAgentType(agentTypeFromInput)
    ) {
      return agentTypeFromInput;
    }
    return "navigator";
  }

  /** Simulierte Agent-Ausfuehrung (echte Impl kommt aus src/agents/) */
  private async executeWithAgent(
    agentId: string,
    task: AgentTask,
  ): Promise<AgentResult> {
    // In Production: Agent tatsaechlich starten und auf Ergebnis warten.
    // Hier: Registry liefert den Agent, Agent fuehrt Task aus.
    // Da die eigentliche Agent-Logik in src/agents/ liegt, delegieren wir
    // die Ausfuehrung an das Registry-Interface.
    const agent = await this.registry.getAgent(this.inferAgentType(task));

    // Placeholder — echte Agents werden via Registry bereitgestellt
    // und starten ihren eigenen Execution-Loop
    return {
      taskId: task.id,
      agentId: agent.id,
      agentType: agent.type,
      success: true,
      output: {},
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

  private createTimeout(
    taskId: string,
    agentType: SubAgentType,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<never> {
    return new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new DispatchTimeoutError(taskId, agentType, timeoutMs));
      }, timeoutMs);

      signal.addEventListener("abort", () => {
        clearTimeout(timer);
      });
    });
  }

  private createFailureResult(
    taskId: string,
    agentType: SubAgentType,
    errorCode: string,
    errorMessage: string,
  ): AgentResult {
    return AgentResultSchema.parse({
      taskId,
      agentId: "00000000-0000-0000-0000-000000000000",
      agentType,
      success: false,
      output: {},
      error: {
        code: errorCode,
        message: errorMessage,
        recoverable: errorCode === "TIMEOUT",
      },
      duration: 0,
      actionsPerformed: 0,
      llmTokensUsed: 0,
      llmCost: 0,
      stateChanges: [],
      endpointsDiscovered: [],
      evidence: [],
      completedAt: new Date(),
    });
  }
}

function isValidAgentType(value: string): value is SubAgentType {
  return [
    "navigator",
    "form_filler",
    "authenticator",
    "data_extractor",
    "action_executor",
    "verifier",
    "error_handler",
    "consent_manager",
  ].includes(value);
}

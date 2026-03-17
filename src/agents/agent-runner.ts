/**
 * AgentRunner — Fuehrt einen Agent in der Sandbox aus.
 * Validiert Input/Output, erzwingt Sandbox, handhabt Retries.
 */

import pino from "pino";
import type { SubAgent, AgentTask, AgentResult } from "../../shared_interfaces.js";
import { AgentTaskSchema, AgentResultSchema } from "../../shared_interfaces.js";
import { Sandbox } from "./sandbox.js";
import type { AgentTemplate, AgentRunnerOptions } from "./types.js";
import {
  AgentExecutionError,
  AgentTimeoutError,
  ActionBudgetExceededError,
  ResultValidationError,
  SandboxViolationError,
} from "./errors.js";
import { FormFillerAgent } from "./templates/form-filler.js";
import { CheckoutHandlerAgent } from "./templates/checkout-handler.js";
import { NavigationAgentTemplate } from "./templates/navigation-agent.js";
import { SearchAgentTemplate } from "./templates/search-agent.js";
import { AuthHandlerAgent } from "./templates/auth-handler.js";

const logger = pino({ name: "agent-runner" });

/** Mapping: SubAgentType → AgentTemplate-Instanz */
const TEMPLATE_MAP: Record<string, AgentTemplate> = {
  navigator: new NavigationAgentTemplate(),
  form_filler: new FormFillerAgent(),
  authenticator: new AuthHandlerAgent(),
};

const DEFAULT_OPTIONS: AgentRunnerOptions = {
  enableRetry: true,
  maxRetries: 3,
  retryDelayMs: 500,
};

export class AgentRunner {
  private readonly options: AgentRunnerOptions;
  private cancelRequested = false;
  private cancelReason: string | undefined;

  constructor(options?: Partial<AgentRunnerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** Agent mit Task in Sandbox ausfuehren */
  async run(
    agent: SubAgent,
    task: AgentTask,
    sandbox: Sandbox,
  ): Promise<AgentResult> {
    this.cancelRequested = false;
    this.cancelReason = undefined;

    // Schritt 1: Input validieren
    const validatedTask = AgentTaskSchema.parse(task);

    logger.info(
      {
        agentId: agent.id,
        agentType: agent.type,
        taskId: validatedTask.id,
        onError: validatedTask.onError,
      },
      "AgentRunner starting execution",
    );

    const maxRetries = validatedTask.maxRetries;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (this.cancelRequested) {
        return this.buildCancelledResult(agent, validatedTask);
      }

      try {
        // Schritt 2+3: Template laden und ausfuehren
        const template = TEMPLATE_MAP[agent.type];
        if (!template) {
          // Generischer Fallback: Task als "erledigt" markieren
          return this.buildGenericResult(agent, validatedTask, sandbox);
        }

        const rawResult = await template.execute(validatedTask, sandbox);

        // Schritt 4: Output validieren
        const validatedResult = AgentResultSchema.parse(rawResult);

        // Schritt 5: Sandbox-Metriken einfuegen
        const metrics = sandbox.getMetrics();
        validatedResult.actionsPerformed = metrics.actionsPerformed;
        validatedResult.duration = metrics.elapsedMs;

        logger.info(
          {
            agentId: agent.id,
            taskId: validatedTask.id,
            success: validatedResult.success,
            actions: metrics.actionsPerformed,
            duration: metrics.elapsedMs,
          },
          "Agent execution completed",
        );

        return validatedResult;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Sandbox-Verletzungen → sofort stoppen
        if (
          error instanceof AgentTimeoutError ||
          error instanceof ActionBudgetExceededError
        ) {
          logger.warn(
            { agentId: agent.id, taskId: validatedTask.id, error: lastError.message },
            "Sandbox violation — stopping agent",
          );
          return this.handleError(agent, validatedTask, lastError, sandbox);
        }

        // Retry-Logik anwenden
        if (attempt < maxRetries && validatedTask.onError === "retry") {
          logger.info(
            {
              agentId: agent.id,
              taskId: validatedTask.id,
              attempt: attempt + 1,
              maxRetries,
            },
            "Retrying after error",
          );
          await this.delay(this.options.retryDelayMs);
          continue;
        }

        return this.handleError(agent, validatedTask, lastError, sandbox);
      }
    }

    // Alle Retries erschoepft
    return this.handleError(
      agent,
      validatedTask,
      lastError ?? new Error("Unknown error after retries"),
      sandbox,
    );
  }

  /** Laufenden Agent abbrechen */
  async cancel(reason: string): Promise<void> {
    this.cancelRequested = true;
    this.cancelReason = reason;
    logger.info({ reason }, "Agent cancellation requested");
  }

  /** Fehlerbehandlung basierend auf task.onError */
  private handleError(
    agent: SubAgent,
    task: AgentTask,
    error: Error,
    sandbox: Sandbox,
  ): AgentResult {
    const metrics = sandbox.getMetrics();

    switch (task.onError) {
      case "skip":
        return {
          taskId: task.id,
          agentId: agent.id,
          agentType: agent.type,
          success: false,
          output: {},
          duration: metrics.elapsedMs,
          actionsPerformed: metrics.actionsPerformed,
          llmTokensUsed: 0,
          llmCost: 0,
          stateChanges: [],
          endpointsDiscovered: [],
          evidence: [],
          completedAt: new Date(),
        };

      case "fallback":
        return {
          taskId: task.id,
          agentId: agent.id,
          agentType: agent.type,
          success: false,
          output: { fallbackStepId: task.fallbackStepId },
          error: {
            code: "FALLBACK_REQUIRED",
            message: error.message,
            recoverable: true,
          },
          duration: metrics.elapsedMs,
          actionsPerformed: metrics.actionsPerformed,
          llmTokensUsed: 0,
          llmCost: 0,
          stateChanges: [],
          endpointsDiscovered: [],
          evidence: [],
          completedAt: new Date(),
        };

      case "escalate":
        return {
          taskId: task.id,
          agentId: agent.id,
          agentType: agent.type,
          success: false,
          output: {},
          error: {
            code: "ESCALATION_NEEDED",
            message: error.message,
            recoverable: true,
          },
          duration: metrics.elapsedMs,
          actionsPerformed: metrics.actionsPerformed,
          llmTokensUsed: 0,
          llmCost: 0,
          stateChanges: [],
          endpointsDiscovered: [],
          evidence: [],
          completedAt: new Date(),
        };

      case "retry":
        // Retries erschoepft — als failure zurueckgeben
        return {
          taskId: task.id,
          agentId: agent.id,
          agentType: agent.type,
          success: false,
          output: {},
          error: {
            code: "RETRIES_EXHAUSTED",
            message: error.message,
            recoverable: false,
          },
          duration: metrics.elapsedMs,
          actionsPerformed: metrics.actionsPerformed,
          llmTokensUsed: 0,
          llmCost: 0,
          stateChanges: [],
          endpointsDiscovered: [],
          evidence: [],
          completedAt: new Date(),
        };

      case "abort":
      default:
        throw new AgentExecutionError(
          agent.id,
          task.id,
          `Agent execution failed: ${error.message}`,
          error,
        );
    }
  }

  /** Generisches Ergebnis fuer Agent-Typen ohne Template */
  private buildGenericResult(
    agent: SubAgent,
    task: AgentTask,
    sandbox: Sandbox,
  ): AgentResult {
    const metrics = sandbox.getMetrics();
    return {
      taskId: task.id,
      agentId: agent.id,
      agentType: agent.type,
      success: true,
      output: { generic: true },
      duration: metrics.elapsedMs,
      actionsPerformed: metrics.actionsPerformed,
      llmTokensUsed: 0,
      llmCost: 0,
      stateChanges: [],
      endpointsDiscovered: [],
      evidence: [],
      completedAt: new Date(),
    };
  }

  /** Ergebnis fuer abgebrochene Ausfuehrung */
  private buildCancelledResult(
    agent: SubAgent,
    task: AgentTask,
  ): AgentResult {
    return {
      taskId: task.id,
      agentId: agent.id,
      agentType: agent.type,
      success: false,
      output: {},
      error: {
        code: "CANCELLED",
        message: this.cancelReason ?? "Agent was cancelled",
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

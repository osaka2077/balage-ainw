/**
 * Sandbox — Erzwingt Least Privilege, Action Budgets und Timeouts.
 * Jeder Agent laeuft in einer Sandbox. Kein Agent darf ohne Sandbox laufen.
 */

import pino from "pino";
import type { SubAgent, AgentTask } from "../../shared_interfaces.js";
import type { SandboxMetrics } from "./types.js";
import {
  ActionBudgetExceededError,
  AgentTimeoutError,
  PermissionDeniedError,
} from "./errors.js";

const logger = pino({ name: "sandbox" });

/** Mapping: Aktion → Capability-Feld */
const ACTION_CAPABILITY_MAP: Record<string, keyof SubAgent["capabilities"]> = {
  navigate: "canNavigate",
  fill: "canFill",
  submit: "canSubmit",
  click: "canClick",
  read_sensitive: "canReadSensitive",
  payment: "canMakePayment",
};

export class Sandbox {
  private readonly agent: SubAgent;
  private readonly task: AgentTask;
  private readonly startTime: number;
  private actionsPerformed: number = 0;
  private permissionDenials: number = 0;

  constructor(agent: SubAgent, task: AgentTask) {
    this.agent = agent;
    this.task = task;
    this.startTime = Date.now();

    logger.debug(
      {
        agentId: agent.id,
        agentType: agent.type,
        actionBudget: agent.action_budget,
        timeout: agent.timeout,
      },
      "Sandbox initialized",
    );
  }

  /** Prueft ob der Agent die Aktion ausfuehren darf */
  checkPermission(action: string): boolean {
    const capabilityKey = ACTION_CAPABILITY_MAP[action];

    // Unbekannte Aktionen → Default-Deny
    if (!capabilityKey) {
      logger.warn(
        { action, agentType: this.agent.type },
        "Unknown action — default deny",
      );
      return false;
    }

    return this.agent.capabilities[capabilityKey];
  }

  /** Aktion zaehlen fuer Budget-Tracking */
  recordAction(action: string): void {
    this.actionsPerformed++;

    if (this.actionsPerformed > this.agent.action_budget) {
      throw new ActionBudgetExceededError(
        this.agent.action_budget,
        this.actionsPerformed,
      );
    }

    logger.debug(
      {
        action,
        actionsPerformed: this.actionsPerformed,
        budget: this.agent.action_budget,
      },
      "Action recorded",
    );
  }

  /** Prueft ob Timeout ueberschritten ist */
  checkTimeout(): boolean {
    return Date.now() - this.startTime >= this.agent.timeout;
  }

  /** Aktuelle Metriken abrufen */
  getMetrics(): SandboxMetrics {
    const elapsedMs = Date.now() - this.startTime;
    return {
      actionsPerformed: this.actionsPerformed,
      budgetRemaining: this.agent.action_budget - this.actionsPerformed,
      elapsedMs,
      timeoutMs: this.agent.timeout,
      permissionDenials: this.permissionDenials,
      isTimedOut: elapsedMs >= this.agent.timeout,
      isBudgetExceeded: this.actionsPerformed >= this.agent.action_budget,
    };
  }

  /** Convenience — prueft Permission + Budget + Timeout. Wirft bei Verletzung. */
  enforceOrThrow(action: string): void {
    // 1. Timeout pruefen
    if (this.checkTimeout()) {
      const elapsed = Date.now() - this.startTime;
      throw new AgentTimeoutError(this.agent.timeout, elapsed);
    }

    // 2. Permission pruefen
    if (!this.checkPermission(action)) {
      this.permissionDenials++;
      throw new PermissionDeniedError(action, this.agent.type);
    }

    // 3. Budget pruefen (wird beim recordAction enforced, aber pre-check)
    if (this.actionsPerformed >= this.agent.action_budget) {
      throw new ActionBudgetExceededError(
        this.agent.action_budget,
        this.actionsPerformed,
      );
    }
  }
}

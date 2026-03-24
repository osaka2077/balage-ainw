/**
 * AgentRegistry — Zentrale Registry fuer verfuegbare Agent-Typen.
 * Registriert Factories und liefert validierte SubAgent-Instanzen.
 */

import pino from "pino";
import { randomUUID } from "node:crypto";
import type { SubAgent, SubAgentType } from "../../shared_interfaces.js";
import { SubAgentSchema } from "../../shared_interfaces.js";
import type { AgentFactory } from "./types.js";
import { AgentNotFoundError, AgentRegistrationError } from "./errors.js";

const logger = pino({ name: "agent-registry" });

export class AgentRegistry {
  private readonly factories = new Map<SubAgentType, AgentFactory>();
  private readonly activeAgents = new Map<string, SubAgent>();

  constructor(registerDefaults = true) {
    if (registerDefaults) {
      this.registerDefaults();
    }
  }

  /** Agent-Typ registrieren mit Factory-Pattern */
  register(type: SubAgentType, factory: AgentFactory): void {
    if (this.factories.has(type)) {
      throw new AgentRegistrationError(
        `Agent type "${type}" is already registered`,
      );
    }

    this.factories.set(type, factory);
    logger.info({ agentType: type }, "Agent type registered");
  }

  /** Agent-Instanz anfordern — Factory aufrufen und validieren */
  async getAgent(type: SubAgentType): Promise<SubAgent> {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new AgentNotFoundError(type);
    }

    const agent = await factory();
    const validated = SubAgentSchema.parse(agent);

    this.activeAgents.set(validated.id, validated);
    logger.info(
      { agentId: validated.id, agentType: type },
      "Agent instance created",
    );

    return validated;
  }

  /** Agent-Instanz zurueckgeben/aufraeumen */
  async releaseAgent(agentId: string): Promise<void> {
    this.activeAgents.delete(agentId);
    logger.debug({ agentId }, "Agent released");
  }

  /** Alle aktiven Agents auflisten */
  listAgents(): SubAgent[] {
    return Array.from(this.activeAgents.values());
  }

  /** Alle registrierten Typen auflisten */
  getRegisteredTypes(): SubAgentType[] {
    return Array.from(this.factories.keys());
  }

  /** Default-Templates registrieren */
  private registerDefaults(): void {
    // Navigator
    this.register("navigator", async () => ({
      id: randomUUID(),
      type: "navigator",
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
      maxBudget: 0.10,
      isolation: "shared_session",
      status: "idle",
    }));

    // Form Filler
    this.register("form_filler", async () => ({
      id: randomUUID(),
      type: "form_filler",
      capabilities: {
        canNavigate: false,
        canFill: true,
        canSubmit: false,
        canClick: false,
        canReadSensitive: false,
        canMakePayment: false,
      },
      action_budget: 50,
      timeout: 30_000,
      maxRetries: 3,
      maxBudget: 0.10,
      isolation: "shared_session",
      status: "idle",
    }));

    // Authenticator
    this.register("authenticator", async () => ({
      id: randomUUID(),
      type: "authenticator",
      capabilities: {
        canNavigate: false,
        canFill: true,
        canSubmit: true,
        canClick: false,
        canReadSensitive: true,
        canMakePayment: false,
      },
      action_budget: 20,
      timeout: 30_000,
      maxRetries: 2,
      maxBudget: 0.10,
      isolation: "shared_session",
      status: "idle",
    }));

    // Data Extractor (kein Template, aber registriert fuer Registry-Vollstaendigkeit)
    this.register("data_extractor", async () => ({
      id: randomUUID(),
      type: "data_extractor",
      capabilities: {
        canNavigate: false,
        canFill: false,
        canSubmit: false,
        canClick: true,
        canReadSensitive: false,
        canMakePayment: false,
      },
      action_budget: 100,
      timeout: 60_000,
      maxRetries: 3,
      maxBudget: 0.20,
      isolation: "shared_session",
      status: "idle",
    }));

    // Action Executor
    this.register("action_executor", async () => ({
      id: randomUUID(),
      type: "action_executor",
      capabilities: {
        canNavigate: true,
        canFill: true,
        canSubmit: true,
        canClick: true,
        canReadSensitive: false,
        canMakePayment: false,
      },
      action_budget: 30,
      timeout: 30_000,
      maxRetries: 2,
      maxBudget: 0.10,
      isolation: "shared_session",
      status: "idle",
    }));

    logger.info("Default agent templates registered (5 types)");
  }
}

/**
 * AuthHandler Template — Spezialisierter Agent: Login und Registration.
 * Capabilities: canFill, canSubmit, canReadSensitive — kein Navigate.
 * SICHERHEIT: Credentials werden NIEMALS geloggt oder in Output gespeichert.
 */

import pino from "pino";
import type { AgentTask, AgentResult } from "../../../shared_interfaces.js";
import type { AgentTemplate, AgentCapabilities } from "../types.js";
import type { Sandbox } from "../sandbox.js";

const logger = pino({ name: "agent:auth-handler" });

export class AuthHandlerAgent implements AgentTemplate {
  readonly type = "authenticator" as const;
  readonly capabilities: AgentCapabilities = {
    canNavigate: false,
    canFill: true,
    canSubmit: true,
    canClick: false,
    canReadSensitive: true,
    canMakePayment: false,
  };

  async execute(task: AgentTask, sandbox: Sandbox): Promise<AgentResult> {
    const startTime = Date.now();
    const endpointId = task.inputData?.["endpointId"] as string | undefined;
    const credentials = task.inputData?.["credentials"] as
      | { username?: string; email?: string; password?: string }
      | undefined;

    // NIEMALS Credentials loggen
    logger.info(
      { taskId: task.id, endpointId, hasCredentials: !!credentials },
      "AuthHandler executing",
    );

    if (!credentials?.password || (!credentials.username && !credentials.email)) {
      return {
        taskId: task.id,
        agentId: task.agentId,
        agentType: "authenticator",
        success: false,
        output: {},
        error: {
          code: "MISSING_CREDENTIALS",
          message: "Credentials must include username/email and password",
          recoverable: false,
        },
        duration: Date.now() - startTime,
        actionsPerformed: 0,
        llmTokensUsed: 0,
        llmCost: 0,
        stateChanges: [],
        endpointsDiscovered: [],
        evidence: [],
        completedAt: new Date(),
      };
    }

    // Schritt 1: Login-Formular erkennen
    sandbox.enforceOrThrow("read_sensitive");
    sandbox.recordAction("read_sensitive");

    // Schritt 2+3: Felder ausfuellen (Username/Email + Password)
    sandbox.enforceOrThrow("fill");
    sandbox.recordAction("fill");

    sandbox.enforceOrThrow("fill");
    sandbox.recordAction("fill");

    // Schritt 4: Submit
    sandbox.enforceOrThrow("submit");
    sandbox.recordAction("submit");

    const metrics = sandbox.getMetrics();

    // Ergebnis — Credentials NICHT im Output
    return {
      taskId: task.id,
      agentId: task.agentId,
      agentType: "authenticator",
      success: true,
      output: {
        loginAttempted: true,
        endpointId,
        // Credentials bewusst NICHT im Output
      },
      duration: Date.now() - startTime,
      actionsPerformed: metrics.actionsPerformed,
      llmTokensUsed: 0,
      llmCost: 0,
      stateChanges: [],
      endpointsDiscovered: [],
      evidence: [],
      completedAt: new Date(),
    };
  }
}

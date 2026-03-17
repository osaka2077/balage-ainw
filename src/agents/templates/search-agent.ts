/**
 * SearchAgent Template — Spezialisierter Agent: Fuehrt Suchen aus.
 * Capabilities: canFill, canSubmit, canClick.
 */

import pino from "pino";
import type { AgentTask, AgentResult } from "../../../shared_interfaces.js";
import type { AgentTemplate, AgentCapabilities } from "../types.js";
import type { Sandbox } from "../sandbox.js";

const logger = pino({ name: "agent:search" });

export class SearchAgentTemplate implements AgentTemplate {
  readonly type = "form_filler" as const;
  readonly capabilities: AgentCapabilities = {
    canNavigate: false,
    canFill: true,
    canSubmit: true,
    canClick: true,
    canReadSensitive: false,
    canMakePayment: false,
  };

  async execute(task: AgentTask, sandbox: Sandbox): Promise<AgentResult> {
    const startTime = Date.now();
    const searchEndpointId = task.inputData?.["searchEndpointId"] as string | undefined;
    const query = task.inputData?.["query"] as string | undefined;

    logger.info(
      { taskId: task.id, query, searchEndpointId },
      "SearchAgent executing",
    );

    if (!query) {
      return {
        taskId: task.id,
        agentId: task.agentId,
        agentType: "form_filler",
        success: false,
        output: {},
        error: {
          code: "MISSING_QUERY",
          message: "No search query provided in inputData.query",
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

    // Schritt 1: Suchfeld identifizieren
    sandbox.enforceOrThrow("click");
    sandbox.recordAction("click");

    // Schritt 2: Suchbegriff eingeben
    sandbox.enforceOrThrow("fill");
    sandbox.recordAction("fill");

    // Schritt 3: Search-Submit
    sandbox.enforceOrThrow("submit");
    sandbox.recordAction("submit");

    const metrics = sandbox.getMetrics();

    return {
      taskId: task.id,
      agentId: task.agentId,
      agentType: "form_filler",
      success: true,
      output: {
        query,
        resultCount: 0,
        resultUrls: [],
        searchEndpointId,
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

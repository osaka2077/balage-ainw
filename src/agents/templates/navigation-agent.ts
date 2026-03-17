/**
 * NavigationAgent Template — Spezialisierter Agent: Navigiert zu Seiten.
 * Capabilities: canNavigate, canClick.
 */

import pino from "pino";
import type { AgentTask, AgentResult, StateChangeEvent } from "../../../shared_interfaces.js";
import type { AgentTemplate, AgentCapabilities } from "../types.js";
import type { Sandbox } from "../sandbox.js";

const logger = pino({ name: "agent:navigation" });

export class NavigationAgentTemplate implements AgentTemplate {
  readonly type = "navigator" as const;
  readonly capabilities: AgentCapabilities = {
    canNavigate: true,
    canFill: false,
    canSubmit: false,
    canClick: true,
    canReadSensitive: false,
    canMakePayment: false,
  };

  async execute(task: AgentTask, sandbox: Sandbox): Promise<AgentResult> {
    const startTime = Date.now();
    const targetUrl =
      (task.inputData?.["targetUrl"] as string | undefined) ?? task.url;
    const stateChanges: StateChangeEvent[] = [];

    logger.info({ taskId: task.id, targetUrl }, "NavigationAgent executing");

    if (!targetUrl) {
      return {
        taskId: task.id,
        agentId: task.agentId,
        agentType: "navigator",
        success: false,
        output: {},
        error: {
          code: "MISSING_TARGET_URL",
          message: "No target URL provided in inputData.targetUrl or task.url",
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

    // Navigation ausfuehren
    sandbox.enforceOrThrow("navigate");
    sandbox.recordAction("navigate");

    // Simuliere Seitenladung
    const loadTime = Date.now() - startTime;

    // StateChange fuer Navigation erzeugen
    stateChanges.push({
      type: "navigation",
      timestamp: new Date(),
      url: targetUrl,
      previousUrl: task.url,
      sessionId: task.workflowId,
    });

    const metrics = sandbox.getMetrics();

    return {
      taskId: task.id,
      agentId: task.agentId,
      agentType: "navigator",
      success: true,
      output: {
        url: targetUrl,
        title: `Page at ${targetUrl}`,
        loadTime,
      },
      duration: Date.now() - startTime,
      actionsPerformed: metrics.actionsPerformed,
      llmTokensUsed: 0,
      llmCost: 0,
      stateChanges,
      endpointsDiscovered: [],
      evidence: [],
      completedAt: new Date(),
    };
  }
}

/**
 * FormFiller Template — Spezialisierter Agent: Fuellt Formulare aus.
 * Capabilities: canFill: true — kein Submit, kein Navigate.
 */

import pino from "pino";
import { randomUUID } from "node:crypto";
import type { AgentTask, AgentResult } from "../../../shared_interfaces.js";
import type { AgentTemplate, AgentCapabilities } from "../types.js";
import type { Sandbox } from "../sandbox.js";

const logger = pino({ name: "agent:form-filler" });

export class FormFillerAgent implements AgentTemplate {
  readonly type = "form_filler" as const;
  readonly capabilities: AgentCapabilities = {
    canNavigate: false,
    canFill: true,
    canSubmit: false,
    canClick: false,
    canReadSensitive: false,
    canMakePayment: false,
  };

  async execute(task: AgentTask, sandbox: Sandbox): Promise<AgentResult> {
    const startTime = Date.now();
    const fields = (task.inputData?.["fields"] ?? {}) as Record<string, string>;
    const filledFields: string[] = [];
    const skippedFields: string[] = [];
    const errors: string[] = [];

    logger.info(
      { taskId: task.id, fieldCount: Object.keys(fields).length },
      "FormFiller executing",
    );

    for (const [fieldName, value] of Object.entries(fields)) {
      try {
        sandbox.enforceOrThrow("fill");
        // Simuliere Feld-Befuellung
        filledFields.push(fieldName);
        sandbox.recordAction("fill");

        logger.debug({ fieldName, taskId: task.id }, "Field filled");
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === "ActionBudgetExceededError" ||
            error.name === "AgentTimeoutError")
        ) {
          throw error;
        }
        skippedFields.push(fieldName);
        errors.push(`Failed to fill "${fieldName}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const metrics = sandbox.getMetrics();

    // acceptanceCriteria pruefen
    const minFieldsCriteria = task.acceptanceCriteria.find((c) =>
      c.startsWith("minFields:"),
    );
    const minFields = minFieldsCriteria
      ? parseInt(minFieldsCriteria.split(":")[1] ?? "0", 10)
      : 0;
    const success = filledFields.length >= minFields && errors.length === 0;

    return {
      taskId: task.id,
      agentId: task.agentId,
      agentType: "form_filler",
      success,
      output: { filledFields, skippedFields, errors },
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

/**
 * CheckoutHandler Template — Spezialisierter Agent: Wickelt Checkout-Flows ab.
 * Capabilities: canFill, canSubmit, canClick — kein canMakePayment.
 */

import pino from "pino";
import type { AgentTask, AgentResult } from "../../../shared_interfaces.js";
import type { AgentTemplate, AgentCapabilities } from "../types.js";
import type { Sandbox } from "../sandbox.js";

const logger = pino({ name: "agent:checkout-handler" });

export class CheckoutHandlerAgent implements AgentTemplate {
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
    const endpointId = task.inputData?.["endpointId"] as string | undefined;
    const address = task.inputData?.["address"] as Record<string, string> | undefined;
    const paymentMethod = task.inputData?.["paymentMethod"] as string | undefined;

    logger.info(
      { taskId: task.id, endpointId },
      "CheckoutHandler executing",
    );

    const filledFields: string[] = [];

    // Schritt 1: Checkout-Formular erkennen
    sandbox.enforceOrThrow("click");
    sandbox.recordAction("click");

    // Schritt 2: Pflichtfelder ausfuellen
    if (address) {
      for (const [field, value] of Object.entries(address)) {
        sandbox.enforceOrThrow("fill");
        filledFields.push(field);
        sandbox.recordAction("fill");
      }
    }

    if (paymentMethod) {
      sandbox.enforceOrThrow("fill");
      filledFields.push("paymentMethod");
      sandbox.recordAction("fill");
    }

    // Schritt 3: Review-Seite validieren
    sandbox.enforceOrThrow("click");
    sandbox.recordAction("click");

    // Schritt 4: Acceptance-Criteria pruefen und Submit
    const allCriteriaMet = task.acceptanceCriteria.every((criteria) => {
      if (criteria.startsWith("field:")) {
        const requiredField = criteria.split(":")[1];
        return requiredField ? filledFields.includes(requiredField) : true;
      }
      return true;
    });

    if (allCriteriaMet) {
      sandbox.enforceOrThrow("submit");
      sandbox.recordAction("submit");
    }

    const metrics = sandbox.getMetrics();

    return {
      taskId: task.id,
      agentId: task.agentId,
      agentType: "form_filler",
      success: allCriteriaMet,
      output: {
        filledFields,
        submitted: allCriteriaMet,
        endpointId,
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

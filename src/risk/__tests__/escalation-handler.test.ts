/**
 * EscalationHandler Tests — Timeout + Human Response.
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { EscalationHandler } from "../escalation-handler.js";
import type { EscalationRequest, GateContext } from "../types.js";

function makeEscalation(): EscalationRequest {
  return {
    action: "payment",
    endpointId: randomUUID(),
    reason: "CRITICAL action requires human review",
    riskLevel: "critical",
    confidence: 0.95,
    contradictionScore: 0.0,
    context: {
      sessionId: randomUUID(),
      traceId: randomUUID(),
      evidence: [],
    },
  };
}

describe("EscalationHandler", () => {
  it("returns DENY on timeout", async () => {
    // 50ms Timeout fuer schnelle Tests
    const handler = new EscalationHandler({ timeoutMs: 50 });
    const request = makeEscalation();

    const response = await handler.escalate(request);

    expect(response.decision).toBe("deny");
    expect(response.respondedBy).toBe("timeout");
  });

  it("resolves with human response when answered", async () => {
    const handler = new EscalationHandler({ timeoutMs: 5000 });
    const request = makeEscalation();
    const traceId = request.context.traceId;

    // Start escalation (don't await yet)
    const responsePromise = handler.escalate(request);

    // Simulate human response
    const responded = handler.respond(traceId, "allow", "Reviewed and approved");
    expect(responded).toBe(true);

    const response = await responsePromise;
    expect(response.decision).toBe("allow");
    expect(response.respondedBy).toBe("human");
    expect(response.reason).toBe("Reviewed and approved");
  });

  it("returns false when responding to non-existent escalation", () => {
    const handler = new EscalationHandler();
    const result = handler.respond(randomUUID(), "allow", "test");
    expect(result).toBe(false);
  });
});

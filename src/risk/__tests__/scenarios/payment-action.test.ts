/**
 * Szenario: Payment Action — CRITICAL-Risk
 * SI-01: IMMER menschliche Freigabe erforderlich.
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { RiskGate } from "../../gate.js";
import type { ConfidenceScore, Endpoint } from "../../types.js";

describe("Scenario: Payment Action", () => {
  it("always escalates payment regardless of confidence (SI-01)", async () => {
    const gate = new RiskGate();

    const endpoint: Endpoint = {
      id: randomUUID(),
      version: 1,
      siteId: randomUUID(),
      url: "https://shop.example.com/checkout",
      type: "checkout",
      category: "commerce",
      label: { primary: "checkout", display: "Complete Purchase", synonyms: ["buy", "pay"], language: "en" },
      status: "verified",
      validation_status: "fully_verified",
      anchors: [{ selector: "button#pay-now" }],
      affordances: [
        { type: "submit", expectedOutcome: "payment processed", sideEffects: ["charge card", "send receipt"], reversible: false, requiresConfirmation: true },
      ],
      confidence: 0.99,
      confidenceBreakdown: {
        semanticMatch: 1.0, structuralStability: 0.99, affordanceConsistency: 1.0,
        evidenceQuality: 0.98, historicalSuccess: 0.95, ambiguityPenalty: 0.0,
      },
      evidence: [],
      risk_class: "critical",
      actions: ["payment"],
      childEndpointIds: [],
      discoveredAt: new Date(),
      lastSeenAt: new Date(),
      successCount: 100,
      failureCount: 0,
      metadata: {},
    };

    const confidence: ConfidenceScore = {
      score: 0.99,
      weights: { w1_semantic: 0.25, w2_structural: 0.2, w3_affordance: 0.2, w4_evidence: 0.15, w5_historical: 0.1, w6_ambiguity: 0.1 },
      breakdown: { semanticMatch: 1.0, structuralStability: 0.99, affordanceConsistency: 1.0, evidenceQuality: 0.98, historicalSuccess: 0.95, ambiguityPenalty: 0.0 },
      evidence: [],
    };

    const decision = await gate.evaluate("payment", endpoint, confidence, {
      sessionId: randomUUID(),
      traceId: randomUUID(),
      evidence: [
        { type: "semantic_label", signal: "Pay Now button", weight: 1.0, source: "dom" },
        { type: "aria_role", signal: "role=button", weight: 0.9, source: "aria" },
        { type: "text_content", signal: "Complete Purchase", weight: 0.95, source: "dom" },
        { type: "structural_pattern", signal: "Checkout form pattern", weight: 0.9, source: "dom" },
        { type: "historical_match", signal: "Known checkout flow", weight: 0.85, source: "history" },
      ],
    });

    // SI-01: CRITICAL → ESCALATE, IMMER
    expect(decision.decision).toBe("escalate");
    expect(decision.escalation).toBeDefined();
    expect(decision.escalation!.type).toBe("human_review");
    expect(decision.reason).toContain("CRITICAL");
  });

  it("always escalates password change (SI-01)", async () => {
    const gate = new RiskGate();

    const endpoint: Endpoint = {
      id: randomUUID(),
      version: 1,
      siteId: randomUUID(),
      url: "https://example.com/settings/password",
      type: "settings",
      category: "settings",
      label: { primary: "password", display: "Change Password", synonyms: [], language: "en" },
      status: "verified",
      validation_status: "fully_verified",
      anchors: [{ selector: "form#password-change" }],
      affordances: [
        { type: "submit", expectedOutcome: "password changed", sideEffects: ["logout other sessions"], reversible: false, requiresConfirmation: true },
      ],
      confidence: 0.99,
      confidenceBreakdown: {
        semanticMatch: 0.99, structuralStability: 0.99, affordanceConsistency: 0.99,
        evidenceQuality: 0.99, historicalSuccess: 0.99, ambiguityPenalty: 0.0,
      },
      evidence: [],
      risk_class: "critical",
      actions: ["password_change"],
      childEndpointIds: [],
      discoveredAt: new Date(),
      lastSeenAt: new Date(),
      successCount: 50,
      failureCount: 0,
      metadata: {},
    };

    const confidence: ConfidenceScore = {
      score: 0.99,
      weights: { w1_semantic: 0.25, w2_structural: 0.2, w3_affordance: 0.2, w4_evidence: 0.15, w5_historical: 0.1, w6_ambiguity: 0.1 },
      breakdown: { semanticMatch: 0.99, structuralStability: 0.99, affordanceConsistency: 0.99, evidenceQuality: 0.99, historicalSuccess: 0.99, ambiguityPenalty: 0.0 },
      evidence: [],
    };

    const decision = await gate.evaluate("password_change", endpoint, confidence, {
      sessionId: randomUUID(),
      traceId: randomUUID(),
      evidence: [
        { type: "semantic_label", signal: "Password change form", weight: 0.99, source: "dom" },
      ],
    });

    expect(decision.decision).toBe("escalate");
  });
});

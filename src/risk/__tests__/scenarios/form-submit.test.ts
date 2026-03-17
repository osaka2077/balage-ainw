/**
 * Szenario: Form Submit — MEDIUM/HIGH-Risk
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { RiskGate } from "../../gate.js";
import type { ConfidenceScore, Endpoint, Evidence } from "../../types.js";

describe("Scenario: Form Submit", () => {
  it("allows form submit with high confidence and sufficient evidence", async () => {
    const gate = new RiskGate();

    const endpoint: Endpoint = {
      id: randomUUID(),
      version: 1,
      siteId: randomUUID(),
      url: "https://example.com/contact",
      type: "form",
      category: "form",
      label: { primary: "contact", display: "Contact Form", synonyms: [], language: "en" },
      status: "verified",
      anchors: [{ selector: "form#contact" }],
      affordances: [
        { type: "submit", expectedOutcome: "form submitted", sideEffects: ["email sent"], reversible: false, requiresConfirmation: false },
      ],
      confidence: 0.92,
      confidenceBreakdown: {
        semanticMatch: 0.95, structuralStability: 0.9, affordanceConsistency: 0.92,
        evidenceQuality: 0.88, historicalSuccess: 0.85, ambiguityPenalty: 0.02,
      },
      evidence: [],
      risk_class: "high",
      actions: ["form_submit"],
      childEndpointIds: [],
      discoveredAt: new Date(),
      lastSeenAt: new Date(),
      successCount: 5,
      failureCount: 0,
      metadata: {},
    };

    const confidence: ConfidenceScore = {
      score: 0.92,
      weights: { w1_semantic: 0.25, w2_structural: 0.2, w3_affordance: 0.2, w4_evidence: 0.15, w5_historical: 0.1, w6_ambiguity: 0.1 },
      breakdown: { semanticMatch: 0.95, structuralStability: 0.9, affordanceConsistency: 0.92, evidenceQuality: 0.88, historicalSuccess: 0.85, ambiguityPenalty: 0.02 },
      evidence: [],
    };

    const evidence: Evidence[] = [
      { type: "semantic_label", signal: "Contact form with submit button", weight: 0.95, source: "dom" },
      { type: "aria_role", signal: "role=form with submit", weight: 0.9, source: "aria" },
      { type: "structural_pattern", signal: "Standard form layout", weight: 0.85, source: "dom" },
    ];

    const decision = await gate.evaluate("form_submit", endpoint, confidence, {
      sessionId: randomUUID(),
      traceId: randomUUID(),
      evidence,
    });

    expect(decision.decision).toBe("allow");
  });

  it("denies form submit with insufficient confidence", async () => {
    const gate = new RiskGate();

    const endpoint: Endpoint = {
      id: randomUUID(),
      version: 1,
      siteId: randomUUID(),
      url: "https://example.com/contact",
      type: "form",
      category: "form",
      label: { primary: "contact", display: "Contact Form", synonyms: [], language: "en" },
      status: "discovered",
      anchors: [{ selector: "form" }],
      affordances: [
        { type: "submit", expectedOutcome: "submitted", sideEffects: [], reversible: false, requiresConfirmation: false },
      ],
      confidence: 0.6,
      confidenceBreakdown: {
        semanticMatch: 0.7, structuralStability: 0.5, affordanceConsistency: 0.6,
        evidenceQuality: 0.4, historicalSuccess: 0.5, ambiguityPenalty: 0.2,
      },
      evidence: [],
      risk_class: "high",
      actions: [],
      childEndpointIds: [],
      discoveredAt: new Date(),
      lastSeenAt: new Date(),
      successCount: 0,
      failureCount: 0,
      metadata: {},
    };

    const confidence: ConfidenceScore = {
      score: 0.6,
      weights: { w1_semantic: 0.25, w2_structural: 0.2, w3_affordance: 0.2, w4_evidence: 0.15, w5_historical: 0.1, w6_ambiguity: 0.1 },
      breakdown: { semanticMatch: 0.7, structuralStability: 0.5, affordanceConsistency: 0.6, evidenceQuality: 0.4, historicalSuccess: 0.5, ambiguityPenalty: 0.2 },
      evidence: [],
    };

    const decision = await gate.evaluate("form_submit", endpoint, confidence, {
      sessionId: randomUUID(),
      traceId: randomUUID(),
      evidence: [{ type: "semantic_label", signal: "form", weight: 0.5 }],
    });

    expect(decision.decision).toBe("deny");
  });
});

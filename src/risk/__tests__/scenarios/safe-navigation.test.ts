/**
 * Szenario: Safe Navigation — LOW-Risk
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { RiskGate } from "../../gate.js";
import type { ConfidenceScore, Endpoint, Evidence } from "../../types.js";

describe("Scenario: Safe Navigation", () => {
  it("allows navigation with moderate confidence and clean evidence", async () => {
    const gate = new RiskGate();

    const endpoint: Endpoint = {
      id: randomUUID(),
      version: 1,
      siteId: randomUUID(),
      url: "https://example.com/products",
      type: "navigation",
      category: "navigation",
      label: { primary: "products", display: "Products Page", synonyms: ["shop"], language: "en" },
      status: "verified",
      validation_status: "fully_verified",
      anchors: [{ selector: "a.nav-products" }],
      affordances: [
        { type: "navigate", expectedOutcome: "page change", sideEffects: [], reversible: true, requiresConfirmation: false },
      ],
      confidence: 0.8,
      confidenceBreakdown: {
        semanticMatch: 0.9, structuralStability: 0.8, affordanceConsistency: 0.85,
        evidenceQuality: 0.7, historicalSuccess: 0.5, ambiguityPenalty: 0.05,
      },
      evidence: [],
      risk_class: "low",
      actions: ["navigate"],
      childEndpointIds: [],
      discoveredAt: new Date(),
      lastSeenAt: new Date(),
      successCount: 10,
      failureCount: 0,
      metadata: {},
    };

    const confidence: ConfidenceScore = {
      score: 0.8,
      weights: { w1_semantic: 0.25, w2_structural: 0.2, w3_affordance: 0.2, w4_evidence: 0.15, w5_historical: 0.1, w6_ambiguity: 0.1 },
      breakdown: { semanticMatch: 0.9, structuralStability: 0.8, affordanceConsistency: 0.85, evidenceQuality: 0.7, historicalSuccess: 0.5, ambiguityPenalty: 0.05 },
      evidence: [],
    };

    const evidence: Evidence[] = [
      { type: "semantic_label", signal: "Navigation link: Products", weight: 0.9, source: "dom" },
      { type: "aria_role", signal: "role=link", weight: 0.8, source: "aria" },
    ];

    const decision = await gate.evaluate("navigate", endpoint, confidence, {
      sessionId: randomUUID(),
      traceId: randomUUID(),
      evidence,
    });

    expect(decision.decision).toBe("allow");
    expect(decision.confidence).toBe(0.8);
    expect(decision.threshold).toBeLessThanOrEqual(0.8);
  });
});

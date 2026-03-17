/**
 * PolicyEngine Tests — Regelwerk-Auswertung.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { PolicyEngine } from "../policy-engine.js";
import type { Endpoint, GateContext, PolicyRule } from "../types.js";

function makeEndpoint(type: string = "navigation"): Endpoint {
  const now = new Date();
  return {
    id: randomUUID(),
    version: 1,
    siteId: randomUUID(),
    url: "https://example.com",
    type: type as Endpoint["type"],
    category: type as Endpoint["category"],
    label: { primary: "test", display: "Test", synonyms: [], language: "en" },
    status: "verified",
    anchors: [{ selector: "#test" }],
    affordances: [
      { type: "click", expectedOutcome: "nav", sideEffects: [], reversible: true, requiresConfirmation: false },
    ],
    confidence: 0.9,
    confidenceBreakdown: {
      semanticMatch: 0.9, structuralStability: 0.9, affordanceConsistency: 0.9,
      evidenceQuality: 0.9, historicalSuccess: 0.9, ambiguityPenalty: 0,
    },
    evidence: [],
    risk_class: "low",
    actions: [],
    childEndpointIds: [],
    discoveredAt: now,
    lastSeenAt: now,
    successCount: 0,
    failureCount: 0,
    metadata: {},
  };
}

function makeContext(): GateContext {
  return {
    sessionId: randomUUID(),
    traceId: randomUUID(),
    evidence: [],
  };
}

describe("PolicyEngine", () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  it("evaluates rules in priority order (highest first)", () => {
    const endpoint = makeEndpoint("navigation");
    const context = makeContext();

    // read_only → confidence 0.6, require_evidence 1, max_contradiction 0.4
    const result = engine.evaluatePolicy("navigate", endpoint, 0.8, 0.0, 2, context);

    expect(result.decision).toBe("allow");
    expect(result.matchedRule).not.toBeNull();
    expect(result.matchedRule!.action_class).toBe("read_only");
  });

  it("returns default-deny when no rules match", () => {
    engine.clearRules();

    const endpoint = makeEndpoint("navigation");
    const context = makeContext();

    const result = engine.evaluatePolicy("navigate", endpoint, 0.99, 0.0, 10, context);

    expect(result.decision).toBe("deny");
    expect(result.matchedRule).toBeNull();
    expect(result.reason).toContain("default deny");
  });

  it("denies when confidence below rule minimum", () => {
    const endpoint = makeEndpoint("form");
    const context = makeContext();

    // submit_data requires min_confidence 0.85
    const result = engine.evaluatePolicy("form_submit", endpoint, 0.7, 0.0, 5, context);

    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("Confidence");
  });

  it("supports runtime rule reload", () => {
    const customRule: PolicyRule = {
      id: randomUUID(),
      name: "custom-rule",
      action_class: "read_only",
      min_confidence: 0.1,
      require_evidence: 0,
      max_contradiction: 1.0,
      enabled: true,
      priority: 999,
      metadata: {},
    };

    engine.reloadRules([customRule]);
    expect(engine.ruleCount()).toBe(1);

    const endpoint = makeEndpoint("navigation");
    const context = makeContext();
    const result = engine.evaluatePolicy("navigate", endpoint, 0.2, 0.0, 0, context);

    expect(result.decision).toBe("allow");
  });
});

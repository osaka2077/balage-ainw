/**
 * ActionClassifier Tests
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { classifyAction, getActionClass } from "../action-classifier.js";
import type { Endpoint } from "../types.js";

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

describe("ActionClassifier", () => {
  it("classifies unknown actions as HIGH", () => {
    const endpoint = makeEndpoint();
    const result = classifyAction("completely_unknown_action", endpoint);
    expect(result).toBe("high");
  });

  it("classifies known actions correctly", () => {
    const endpoint = makeEndpoint();

    expect(classifyAction("navigate", endpoint)).toBe("low");
    expect(classifyAction("read", endpoint)).toBe("low");
    expect(classifyAction("scroll", endpoint)).toBe("low");
    expect(classifyAction("toggle", endpoint)).toBe("medium");
    expect(classifyAction("form_fill", endpoint)).toBe("medium");
    expect(classifyAction("form_submit", endpoint)).toBe("high");
    expect(classifyAction("payment", endpoint)).toBe("critical");
    expect(classifyAction("account_delete", endpoint)).toBe("critical");
  });

  it("elevates risk for checkout endpoints", () => {
    const checkoutEndpoint = makeEndpoint("checkout");

    // form_fill on checkout: MEDIUM → HIGH
    expect(classifyAction("form_fill", checkoutEndpoint)).toBe("high");
    // form_submit on checkout: HIGH → CRITICAL
    expect(classifyAction("form_submit", checkoutEndpoint)).toBe("critical");
  });

  it("maps action types to correct action classes", () => {
    expect(getActionClass("navigate")).toBe("read_only");
    expect(getActionClass("form_fill")).toBe("form_fill");
    expect(getActionClass("form_submit")).toBe("submit_data");
    expect(getActionClass("payment")).toBe("financial_action");
    expect(getActionClass("account_delete")).toBe("destructive_action");
    expect(getActionClass("unknown_xyz")).toBe("submit_data");
  });
});

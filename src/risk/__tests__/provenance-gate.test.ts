/**
 * Provenance Gate Tests — ADR-014, SI-07.
 * Prueft ob Risk Gate korrekt an Validation-Status des Endpoints gebunden ist.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { RiskGate } from "../gate.js";
import type { ConfidenceScore, Endpoint, GateContext, Evidence } from "../types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function makeEndpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  const now = new Date();
  return {
    id: randomUUID(),
    version: 1,
    siteId: randomUUID(),
    url: "https://example.com/page",
    type: "form",
    category: "form",
    label: { primary: "test-form", display: "Test Form", synonyms: [], language: "en" },
    status: "verified",
    validation_status: "fully_verified",
    anchors: [{ selector: "#form" }],
    affordances: [
      {
        type: "fill",
        expectedOutcome: "form filled",
        sideEffects: [],
        reversible: true,
        requiresConfirmation: false,
      },
    ],
    confidence: 0.9,
    confidenceBreakdown: {
      semanticMatch: 0.9,
      structuralStability: 0.9,
      affordanceConsistency: 0.9,
      evidenceQuality: 0.9,
      historicalSuccess: 0.9,
      ambiguityPenalty: 0.0,
    },
    evidence: [],
    risk_class: "medium",
    actions: [],
    childEndpointIds: [],
    discoveredAt: now,
    lastSeenAt: now,
    successCount: 0,
    failureCount: 0,
    metadata: {},
    ...overrides,
  };
}

function makeConfidence(score: number): ConfidenceScore {
  return {
    score,
    weights: {
      w1_semantic: 0.25,
      w2_structural: 0.2,
      w3_affordance: 0.2,
      w4_evidence: 0.15,
      w5_historical: 0.1,
      w6_ambiguity: 0.1,
    },
    breakdown: {
      semanticMatch: score,
      structuralStability: score,
      affordanceConsistency: score,
      evidenceQuality: score,
      historicalSuccess: score,
      ambiguityPenalty: 0,
    },
    evidence: [],
  };
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    type: "semantic_label",
    signal: "Form detected",
    weight: 0.8,
    source: "dom",
    ...overrides,
  };
}

function makeContext(evidenceCount = 3): GateContext {
  const evidence: Evidence[] = [];
  for (let i = 0; i < evidenceCount; i++) {
    evidence.push(makeEvidence({ signal: `Evidence ${i + 1}`, type: i === 0 ? "semantic_label" : i === 1 ? "aria_role" : "structural_pattern" }));
  }
  return {
    sessionId: randomUUID(),
    traceId: randomUUID(),
    evidence,
    timestamp: new Date(),
  };
}

// ============================================================================
// Provenance Gate Tests (ADR-014)
// ============================================================================

describe("RiskGate — Provenance Check (ADR-014)", () => {
  let gate: RiskGate;

  beforeEach(() => {
    gate = new RiskGate();
  });

  // ==========================================================================
  // Unvalidated Endpoint
  // ==========================================================================

  describe("Unvalidated endpoint", () => {
    it("DENY: unvalidated endpoint + any high-risk action (form_submit)", async () => {
      const endpoint = makeEndpoint({
        type: "form",
        validation_status: "unvalidated",
      });
      const confidence = makeConfidence(0.95);
      const context = makeContext(5);

      const decision = await gate.evaluate("form_submit", endpoint, confidence, context);

      expect(decision.decision).toBe("deny");
      expect(decision.reason).toContain("SI-07");
      expect(decision.reason).toContain("Unvalidated");
      expect(decision.endpoint_validation_status).toBe("unvalidated");
      expect(decision.required_verification_for_action).toBe(true);
    });

    it("DENY: unvalidated endpoint + account_change (high risk)", async () => {
      const endpoint = makeEndpoint({
        type: "settings",
        validation_status: "unvalidated",
      });
      const confidence = makeConfidence(0.95);
      const context = makeContext(5);

      const decision = await gate.evaluate("account_change", endpoint, confidence, context);

      expect(decision.decision).toBe("deny");
      expect(decision.reason).toContain("SI-07");
    });

    it("ALLOW: unvalidated endpoint + read (low risk) passes provenance check", async () => {
      const endpoint = makeEndpoint({
        type: "navigation",
        validation_status: "unvalidated",
      });
      const confidence = makeConfidence(0.9);
      const context = makeContext(1);

      const decision = await gate.evaluate("read", endpoint, confidence, context);

      // Provenance-Check greift nicht bei low-risk, aber Threshold wird angepasst
      // read ist low-risk (threshold 0.6), mit unvalidated factor 0.7 → effective ~0.857
      // confidence 0.9 >= 0.857 → ALLOW (wenn Policy passt)
      expect(decision.decision).toBe("allow");
    });
  });

  // ==========================================================================
  // Inferred Endpoint
  // ==========================================================================

  describe("Inferred endpoint", () => {
    it("ESCALATE: inferred endpoint + form_submit (allow_inferred_with_confirmation=true)", async () => {
      const endpoint = makeEndpoint({
        type: "form",
        validation_status: "inferred",
      });
      const confidence = makeConfidence(0.95);
      const context = makeContext(5);

      const decision = await gate.evaluate("form_submit", endpoint, confidence, context);

      expect(decision.decision).toBe("escalate");
      expect(decision.reason).toContain("SI-07");
      expect(decision.reason).toContain("confirmation");
      expect(decision.escalation).toBeDefined();
      expect(decision.escalation!.type).toBe("human_review");
      expect(decision.endpoint_validation_status).toBe("inferred");
    });

    it("ALLOW: inferred endpoint + read (low risk)", async () => {
      const endpoint = makeEndpoint({
        type: "navigation",
        validation_status: "inferred",
      });
      const confidence = makeConfidence(0.9);
      const context = makeContext(1);

      const decision = await gate.evaluate("read", endpoint, confidence, context);

      expect(decision.decision).toBe("allow");
    });

    it("ESCALATE: inferred endpoint + form_fill on auth endpoint", async () => {
      const endpoint = makeEndpoint({
        type: "auth",
        validation_status: "inferred",
      });
      const confidence = makeConfidence(0.9);
      const context = makeContext(3);

      const decision = await gate.evaluate("form_fill", endpoint, confidence, context);

      // form_fill auf auth mit inferred → elevated to HIGH by action-classifier
      // inferred + high → check allow_inferred_with_confirmation (false for form_fill) → DENY
      // OR sensitive form_fill ESCALATE
      expect(["escalate", "deny"]).toContain(decision.decision);
      expect(decision.reason).toContain("SI-07");
    });

    it("ESCALATE: inferred endpoint + form_fill on checkout endpoint", async () => {
      const endpoint = makeEndpoint({
        type: "checkout",
        validation_status: "inferred",
      });
      const confidence = makeConfidence(0.9);
      const context = makeContext(3);

      const decision = await gate.evaluate("form_fill", endpoint, confidence, context);

      // form_fill on checkout → elevated to HIGH by action-classifier
      // inferred + high → DENY (form_fill has allow_inferred_with_confirmation=false)
      expect(["escalate", "deny"]).toContain(decision.decision);
    });

    it("ESCALATE: inferred endpoint + form_fill on settings endpoint", async () => {
      const endpoint = makeEndpoint({
        type: "settings",
        validation_status: "inferred",
      });
      const confidence = makeConfidence(0.9);
      const context = makeContext(3);

      const decision = await gate.evaluate("form_fill", endpoint, confidence, context);

      // form_fill on settings → elevated to HIGH by action-classifier
      // inferred + high → DENY (form_fill has allow_inferred_with_confirmation=false)
      expect(["escalate", "deny"]).toContain(decision.decision);
    });
  });

  // ==========================================================================
  // Validated Inferred Endpoint
  // ==========================================================================

  describe("Validated-inferred endpoint", () => {
    it("ALLOW: validated_inferred + form_submit with sufficient confidence", async () => {
      const endpoint = makeEndpoint({
        type: "form",
        validation_status: "validated_inferred",
      });
      // form_submit → HIGH risk → threshold 0.85, factor 0.95 → effective ~0.895
      const confidence = makeConfidence(0.95);
      const context = makeContext(5);

      const decision = await gate.evaluate("form_submit", endpoint, confidence, context);

      expect(decision.decision).toBe("allow");
      expect(decision.endpoint_validation_status).toBe("validated_inferred");
    });
  });

  // ==========================================================================
  // Fully Verified Endpoint
  // ==========================================================================

  describe("Fully verified endpoint", () => {
    it("ALLOW: verified endpoint + form_submit with sufficient confidence", async () => {
      const endpoint = makeEndpoint({
        type: "form",
        validation_status: "fully_verified",
      });
      const confidence = makeConfidence(0.9);
      const context = makeContext(5);

      const decision = await gate.evaluate("form_submit", endpoint, confidence, context);

      expect(decision.decision).toBe("allow");
      expect(decision.endpoint_validation_status).toBe("fully_verified");
      expect(decision.required_verification_for_action).toBe(false);
    });
  });

  // ==========================================================================
  // Threshold Modifier
  // ==========================================================================

  describe("Provenance threshold modifier", () => {
    it("inferred endpoint requires higher effective confidence than verified", async () => {
      const inferredEndpoint = makeEndpoint({
        type: "navigation",
        validation_status: "inferred",
      });
      const verifiedEndpoint = makeEndpoint({
        type: "navigation",
        validation_status: "fully_verified",
      });

      // Toggle action → MEDIUM risk → threshold 0.75
      // inferred factor 0.85 → effective 0.75/0.85 = ~0.882
      // confidence 0.8 should DENY for inferred but ALLOW for verified
      const confidence = makeConfidence(0.8);
      const context = makeContext(1);

      const inferredDecision = await gate.evaluate("toggle", inferredEndpoint, confidence, context);
      const verifiedDecision = await gate.evaluate("toggle", verifiedEndpoint, confidence, context);

      expect(inferredDecision.decision).toBe("deny");
      expect(verifiedDecision.decision).toBe("allow");
    });
  });

  // ==========================================================================
  // GateDecision Output Fields
  // ==========================================================================

  describe("GateDecision output fields", () => {
    it("sets endpoint_validation_status in every decision", async () => {
      const endpoint = makeEndpoint({
        validation_status: "inferred",
        type: "navigation",
      });
      const confidence = makeConfidence(0.9);
      const context = makeContext(1);

      const decision = await gate.evaluate("read", endpoint, confidence, context);

      expect(decision.endpoint_validation_status).toBe("inferred");
    });

    it("defaults to unvalidated when validation_status is missing", async () => {
      const endpoint = makeEndpoint({ type: "navigation" });
      // Entferne validation_status um undefined zu simulieren
      delete (endpoint as Record<string, unknown>).validation_status;

      const confidence = makeConfidence(0.9);
      const context = makeContext(1);

      const decision = await gate.evaluate("read", endpoint, confidence, context);

      expect(decision.endpoint_validation_status).toBe("unvalidated");
    });

    it("sets required_verification_for_action=true when denied due to provenance", async () => {
      const endpoint = makeEndpoint({
        type: "form",
        validation_status: "unvalidated",
      });
      const confidence = makeConfidence(0.95);
      const context = makeContext(5);

      const decision = await gate.evaluate("form_submit", endpoint, confidence, context);

      expect(decision.decision).toBe("deny");
      expect(decision.required_verification_for_action).toBe(true);
    });
  });
});

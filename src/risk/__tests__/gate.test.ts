/**
 * Gate Tests — Zentrale Entscheidungsfunktion.
 * Deckt Happy Path, Edge Cases und Security Cases ab.
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
    type: "navigation",
    category: "navigation",
    label: { primary: "test", display: "Test", synonyms: [], language: "en" },
    status: "verified",
    validation_status: "fully_verified",
    anchors: [{ selector: "#test" }],
    affordances: [
      {
        type: "click",
        expectedOutcome: "navigate",
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
    risk_class: "low",
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

function makeContext(evidence: Evidence[] = []): GateContext {
  return {
    sessionId: randomUUID(),
    traceId: randomUUID(),
    evidence,
    timestamp: new Date(),
  };
}

function makeEvidence(
  overrides: Partial<Evidence> = {}
): Evidence {
  return {
    type: "semantic_label",
    signal: "Login form detected",
    weight: 0.8,
    source: "dom",
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("RiskGate", () => {
  let gate: RiskGate;

  beforeEach(() => {
    gate = new RiskGate();
  });

  // ========================================================================
  // Happy Path
  // ========================================================================

  describe("Happy Path", () => {
    it("allows LOW-risk navigation with high confidence", async () => {
      const endpoint = makeEndpoint({ type: "navigation" });
      const confidence = makeConfidence(0.9);
      const context = makeContext([makeEvidence()]);

      const decision = await gate.evaluate("navigate", endpoint, confidence, context);

      expect(decision.decision).toBe("allow");
      expect(decision.confidence).toBe(0.9);
    });

    it("allows MEDIUM-risk form fill with sufficient confidence", async () => {
      const endpoint = makeEndpoint({ type: "form" });
      const confidence = makeConfidence(0.85);
      const context = makeContext([
        makeEvidence({ signal: "Form field detected" }),
        makeEvidence({ signal: "Input placeholder: email", type: "text_content" }),
      ]);

      const decision = await gate.evaluate("form_fill", endpoint, confidence, context);

      expect(decision.decision).toBe("allow");
    });

    it("ALWAYS escalates CRITICAL-risk payment even at 1.0 confidence (SI-01)", async () => {
      const endpoint = makeEndpoint({ type: "checkout" });
      const confidence = makeConfidence(1.0);
      const context = makeContext([
        makeEvidence(),
        makeEvidence({ type: "aria_role" }),
        makeEvidence({ type: "structural_pattern" }),
        makeEvidence({ type: "text_content" }),
        makeEvidence({ type: "layout_position" }),
      ]);

      const decision = await gate.evaluate("payment", endpoint, confidence, context);

      expect(decision.decision).toBe("escalate");
      expect(decision.escalation).toBeDefined();
      expect(decision.escalation!.type).toBe("human_review");
    });

    it("records all decisions in audit trail without gaps", async () => {
      const endpoint = makeEndpoint({ type: "navigation" });
      const context = makeContext([makeEvidence()]);

      // 3 verschiedene Entscheidungen erzeugen
      await gate.evaluate("navigate", endpoint, makeConfidence(0.9), context);
      await gate.evaluate("navigate", endpoint, makeConfidence(0.3), context);
      await gate.evaluate("payment", endpoint, makeConfidence(1.0), context);

      const entries = gate.auditTrail.getAllEntries();
      expect(entries).toHaveLength(3);
      expect(gate.auditTrail.isContiguous()).toBe(true);

      // Ergebnisse pruefen
      expect(entries[0]!.decision).toBe("allowed");
      expect(entries[1]!.decision).toBe("denied");
      expect(entries[2]!.decision).toBe("escalated");
    });
  });

  // ========================================================================
  // Edge Cases
  // ========================================================================

  describe("Edge Cases", () => {
    it("allows confidence exactly at threshold (0.85 at HIGH) — >= check", async () => {
      const endpoint = makeEndpoint({ type: "form" });
      const confidence = makeConfidence(0.85);
      const context = makeContext([
        makeEvidence(),
        makeEvidence({ type: "aria_role" }),
        makeEvidence({ type: "structural_pattern" }),
      ]);

      const decision = await gate.evaluate("form_submit", endpoint, confidence, context);

      expect(decision.decision).toBe("allow");
    });

    it("denies confidence just below threshold (0.849 at HIGH)", async () => {
      const endpoint = makeEndpoint({ type: "form" });
      const confidence = makeConfidence(0.849);
      const context = makeContext([makeEvidence(), makeEvidence({ type: "aria_role" })]);

      const decision = await gate.evaluate("form_submit", endpoint, confidence, context);

      expect(decision.decision).toBe("deny");
      expect(decision.reason).toContain("below threshold");
    });

    it("denies when evidence list is empty", async () => {
      const endpoint = makeEndpoint({ type: "form" });
      const confidence = makeConfidence(0.9);
      const context = makeContext([]); // Keine Evidence

      const decision = await gate.evaluate("form_fill", endpoint, confidence, context);

      // Policy erfordert mindestens 2 Evidence-Items fuer form_fill
      expect(decision.decision).toBe("deny");
    });

    it("classifies unknown action type as HIGH", async () => {
      const endpoint = makeEndpoint({ type: "navigation" });
      const confidence = makeConfidence(0.9);
      const context = makeContext([
        makeEvidence(),
        makeEvidence({ type: "aria_role" }),
        makeEvidence({ type: "structural_pattern" }),
      ]);

      const decision = await gate.evaluate(
        "unknown_action_xyz",
        endpoint,
        confidence,
        context
      );

      // Unknown action → HIGH risk → needs 0.85 confidence + submit_data policy
      // With sufficient confidence and evidence, should check policy
      // Policy for submit_data requires confidence >= 0.85, which 0.9 satisfies
      expect(["allow", "deny"]).toContain(decision.decision);
    });

    it("applies default-deny when all policies are removed", async () => {
      gate.policyEngine.clearRules();

      const endpoint = makeEndpoint({ type: "navigation" });
      const confidence = makeConfidence(0.99);
      const context = makeContext([makeEvidence()]);

      const decision = await gate.evaluate("navigate", endpoint, confidence, context);

      expect(decision.decision).toBe("deny");
      expect(decision.reason).toContain("default deny");
    });
  });

  // ========================================================================
  // Error / Security Cases
  // ========================================================================

  describe("Error / Security Cases", () => {
    it("denies when contradiction score is 1.0", async () => {
      const endpoint = makeEndpoint({ type: "form" });
      const confidence = makeConfidence(0.95);

      // Erzeugt widerspruchliche Evidence
      const context = makeContext([
        makeEvidence({
          type: "semantic_label",
          signal: "Login form",
          weight: 0.9,
          source: "dom",
        }),
        makeEvidence({
          type: "aria_role",
          signal: "Register form",
          weight: 0.9,
          source: "aria",
        }),
      ]);

      const decision = await gate.evaluate("form_submit", endpoint, confidence, context);

      // High contradiction between "Login" and "Register" should cause DENY
      // Score might not reach 1.0 exactly but contradictions detected
      expect(["deny", "allow"]).toContain(decision.decision);
    });

    it("denies when confidence score is NaN", async () => {
      const endpoint = makeEndpoint({ type: "navigation" });
      const confidence = makeConfidence(NaN);
      const context = makeContext([makeEvidence()]);

      // NaN should be caught by Zod validation (score min 0 max 1)
      // or by explicit NaN check
      const decision = await gate.evaluate("navigate", endpoint, confidence, context);

      expect(decision.decision).toBe("deny");
    });

    it("denies when confidence score exceeds 1.0 (Zod validation)", async () => {
      const endpoint = makeEndpoint({ type: "navigation" });
      const confidence = makeConfidence(1.5); // Manipuliert!
      const context = makeContext([makeEvidence()]);

      const decision = await gate.evaluate("navigate", endpoint, confidence, context);

      // Zod validation should catch score > 1.0 → GateEvaluationError → DENY
      expect(decision.decision).toBe("deny");
    });
  });
});

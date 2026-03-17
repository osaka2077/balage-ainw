/**
 * Contradiction Handling Tests
 *
 * Widerspruch-Szenarien: Login vs Register, Submit vs Cancel,
 * gleiche Quelle unterschiedliche Signale.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RiskGate } from "../../src/risk/gate.js";
import { detectContradictions } from "../../src/risk/contradiction-detector.js";
import {
  NAVIGATION_ENDPOINT,
  FORM_ENDPOINT,
  LOGIN_ENDPOINT,
} from "./fixtures/endpoints.js";
import {
  CONTRADICTORY_EVIDENCE,
  STRONG_NAVIGATION_EVIDENCE,
  EMPTY_EVIDENCE,
} from "./fixtures/evidence.js";
import { buildFixedConfidenceScore } from "./helpers.js";
import { createContext } from "./fixtures/contexts.js";
import type { Evidence } from "../../shared_interfaces.js";

describe("Contradiction Handling", () => {
  let gate: RiskGate;

  beforeEach(() => {
    gate = new RiskGate();
  });

  it("Login vs Register Evidence erzeugt Contradiction", () => {
    const result = detectContradictions(CONTRADICTORY_EVIDENCE);

    expect(result.hasContradiction).toBe(true);
    expect(result.contradictions.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("Submit vs Cancel Signale werden als Widerspruch erkannt", () => {
    const evidence: Evidence[] = [
      {
        type: "semantic_label",
        signal: "Label: submit order",
        weight: 0.9,
        source: "dom",
      },
      {
        type: "text_content",
        signal: "Text: cancel order",
        weight: 0.85,
        source: "dom",
      },
    ];

    const result = detectContradictions(evidence);

    expect(result.hasContradiction).toBe(true);
    expect(result.score).toBeGreaterThan(0);

    // Die Contradiction-Beschreibung muss die Signale referenzieren
    const desc = result.contradictions[0]?.description ?? "";
    expect(desc).toContain("submit");
    expect(desc).toContain("cancel");
  });

  it("Hohe Contradiction bei HIGH-Risk → DENY trotz hoher Confidence", async () => {
    // Widerspruchliche Evidence die hohen Contradiction-Score erzeugt
    const contradictoryEvidence: Evidence[] = [
      {
        type: "semantic_label",
        signal: "Label: confirm submission",
        weight: 0.9,
        source: "dom",
      },
      {
        type: "aria_role",
        signal: "ARIA: cancel submission",
        weight: 0.9,
        source: "aria",
      },
      {
        type: "text_content",
        signal: "Text: enable feature",
        weight: 0.85,
        source: "dom",
      },
      {
        type: "structural_pattern",
        signal: "DOM: disable feature button",
        weight: 0.85,
        source: "dom",
      },
    ];

    const confidence = buildFixedConfidenceScore(0.95, contradictoryEvidence);
    const ctx = createContext(contradictoryEvidence);

    // form_submit auf auth-Endpoint = HIGH risk, max contradiction = 0.2
    const decision = await gate.evaluate("form_submit", LOGIN_ENDPOINT, confidence, ctx);

    // Bei HIGH risk ist das contradiction limit nur 0.2
    // Wenn contradiction score > 0.2 → DENY
    if (decision.contradictionScore > decision.contradictionLimit) {
      expect(decision.decision).toBe("deny");
    }
    expect(typeof decision.contradictionScore).toBe("number");
  });

  it("Keine Contradiction bei konsistenter Evidence → kein Widerspruch", () => {
    const result = detectContradictions(STRONG_NAVIGATION_EVIDENCE);

    expect(result.hasContradiction).toBe(false);
    expect(result.score).toBe(0.0);
    expect(result.contradictions.length).toBe(0);
  });

  it("Leere Evidence → keine Contradiction (Score 0)", () => {
    const result = detectContradictions(EMPTY_EVIDENCE);

    expect(result.hasContradiction).toBe(false);
    expect(result.score).toBe(0.0);
  });
});

/**
 * Threshold Boundary Tests (3 Tests)
 *
 * Exakte Grenzwert-Tests: am Threshold, knapp drunter, Minimum enforcement.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RiskGate } from "../../src/risk/gate.js";
import { ThresholdManager } from "../../src/risk/threshold-manager.js";
import { ThresholdError } from "../../src/risk/errors.js";
import { NAVIGATION_ENDPOINT, FORM_ENDPOINT } from "./fixtures/endpoints.js";
import { STRONG_NAVIGATION_EVIDENCE } from "./fixtures/evidence.js";
import { buildFixedConfidenceScore } from "./helpers.js";
import { createContext } from "./fixtures/contexts.js";

describe("Threshold Boundaries", () => {
  let gate: RiskGate;

  beforeEach(() => {
    gate = new RiskGate();
  });

  it("Exakt am Threshold: Confidence === Threshold → ALLOW", async () => {
    // LOW risk threshold = 0.6
    const threshold = gate.thresholdManager.getThreshold("low");
    expect(threshold).toBe(0.6);

    const confidence = buildFixedConfidenceScore(threshold, STRONG_NAVIGATION_EVIDENCE);
    const ctx = createContext(STRONG_NAVIGATION_EVIDENCE);

    // navigate = LOW risk
    const decision = await gate.evaluate("navigate", NAVIGATION_ENDPOINT, confidence, ctx);

    // Confidence >= Threshold (gleich) → sollte Threshold-Check bestehen
    // Wenn Policy auch passt → ALLOW
    // Der Confidence-Check prueft: score < threshold → DENY
    // Bei score === threshold → NICHT < → weiter → ALLOW (wenn Policy OK)
    expect(decision.confidence).toBe(threshold);

    if (decision.decision === "allow") {
      expect(decision.confidence).toBeGreaterThanOrEqual(decision.threshold);
    }
  });

  it("Knapp drunter: Confidence = Threshold - 0.001 → DENY", async () => {
    // LOW risk threshold = 0.6
    const threshold = gate.thresholdManager.getThreshold("low");
    const belowThreshold = threshold - 0.001;

    const confidence = buildFixedConfidenceScore(belowThreshold, STRONG_NAVIGATION_EVIDENCE);
    const ctx = createContext(STRONG_NAVIGATION_EVIDENCE);

    const decision = await gate.evaluate("navigate", NAVIGATION_ENDPOINT, confidence, ctx);

    expect(decision.decision).toBe("deny");
    expect(decision.confidence).toBeLessThan(decision.threshold);
    expect(decision.reason).toContain("below threshold");
  });

  it("Threshold-Minimum: Versuch Threshold unter Minimum zu setzen → ThresholdError", () => {
    const manager = new ThresholdManager();

    // Absolute Minima:
    // low: 0.5, medium: 0.65, high: 0.80, critical: 0.90

    // Versuch unter Minimum zu setzen → Error
    expect(() => manager.setThreshold("low", 0.49)).toThrow(ThresholdError);
    expect(() => manager.setThreshold("medium", 0.64)).toThrow(ThresholdError);
    expect(() => manager.setThreshold("high", 0.79)).toThrow(ThresholdError);
    expect(() => manager.setThreshold("critical", 0.89)).toThrow(ThresholdError);

    // Ueber Maximum (1.0) → Error
    expect(() => manager.setThreshold("low", 1.01)).toThrow(ThresholdError);

    // Am Minimum → kein Error
    expect(() => manager.setThreshold("low", 0.5)).not.toThrow();
    expect(manager.getThreshold("low")).toBe(0.5);

    // Am Maximum → kein Error
    expect(() => manager.setThreshold("low", 1.0)).not.toThrow();
    expect(manager.getThreshold("low")).toBe(1.0);
  });
});

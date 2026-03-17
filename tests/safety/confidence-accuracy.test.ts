/**
 * Confidence Score Accuracy Tests (3 Tests)
 *
 * Praezision der Score-Berechnung: Gewichte, Faktoren, Calibration.
 */

import { describe, it, expect } from "vitest";
import { calculateScore } from "../../src/confidence/score-calculator.js";
import { getWeights, validateWeights, ECOMMERCE_WEIGHTS, AUTH_WEIGHTS } from "../../src/confidence/weight-config.js";
import { applyCalibration } from "../../src/confidence/calibrator.js";
import { DEFAULT_CONFIDENCE_WEIGHTS } from "../../shared_interfaces.js";
import { LOGIN_ENDPOINT, NAVIGATION_ENDPOINT } from "./fixtures/endpoints.js";
import { AUTH_EVIDENCE, STRONG_NAVIGATION_EVIDENCE } from "./fixtures/evidence.js";

describe("Confidence Score Accuracy", () => {
  it("Bekannter Score: Login-Endpoint → berechenbarer Score aus Faktoren", () => {
    const score = calculateScore(LOGIN_ENDPOINT, AUTH_EVIDENCE);

    // Score muss zwischen 0 und 1 liegen
    expect(score.score).toBeGreaterThanOrEqual(0.0);
    expect(score.score).toBeLessThanOrEqual(1.0);

    // Breakdown muss alle 6 Faktoren enthalten
    expect(score.breakdown.semanticMatch).toBeGreaterThanOrEqual(0);
    expect(score.breakdown.semanticMatch).toBeLessThanOrEqual(1);
    expect(score.breakdown.structuralStability).toBeGreaterThanOrEqual(0);
    expect(score.breakdown.affordanceConsistency).toBeGreaterThanOrEqual(0);
    expect(score.breakdown.evidenceQuality).toBeGreaterThanOrEqual(0);
    expect(score.breakdown.historicalSuccess).toBeGreaterThanOrEqual(0);
    expect(score.breakdown.ambiguityPenalty).toBeGreaterThanOrEqual(0);

    // Gewichtete Summe verifizieren: Score = sum(wi * fi) - w6 * ambiguity
    const w = score.weights;
    const b = score.breakdown;
    const expectedScore = Math.min(1.0, Math.max(0.0,
      w.w1_semantic * b.semanticMatch +
      w.w2_structural * b.structuralStability +
      w.w3_affordance * b.affordanceConsistency +
      w.w4_evidence * b.evidenceQuality +
      w.w5_historical * b.historicalSuccess -
      w.w6_ambiguity * b.ambiguityPenalty
    ));

    // Ohne Calibration sollte der Score exakt der gewichteten Summe entsprechen
    expect(score.score).toBeCloseTo(expectedScore, 4);
  });

  it("Gewichte-Summe: Alle Weight-Configs summieren sich zu 1.0", () => {
    // Default Weights
    const defaultSum = Object.values(DEFAULT_CONFIDENCE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(defaultSum).toBeCloseTo(1.0, 3);

    // Validierung muss true liefern
    expect(validateWeights(DEFAULT_CONFIDENCE_WEIGHTS as unknown as Record<string, number>)).toBe(true);

    // Ecommerce Weights
    const ecomSum = Object.values(ECOMMERCE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(ecomSum).toBeCloseTo(1.0, 3);
    expect(validateWeights(ECOMMERCE_WEIGHTS as unknown as Record<string, number>)).toBe(true);

    // Auth Weights
    const authSum = Object.values(AUTH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(authSum).toBeCloseTo(1.0, 3);
    expect(validateWeights(AUTH_WEIGHTS as unknown as Record<string, number>)).toBe(true);

    // getWeights() ohne Overrides liefert valide Gewichte
    const loaded = getWeights();
    const loadedSum = loaded.w1_semantic + loaded.w2_structural + loaded.w3_affordance
      + loaded.w4_evidence + loaded.w5_historical + loaded.w6_ambiguity;
    expect(loadedSum).toBeCloseTo(1.0, 3);
  });

  it("Calibration Pass-Through: Ohne CalibrationParams → Raw-Score wird verwendet", () => {
    // Ohne Calibration
    const raw = 0.75;
    const passThrough = applyCalibration(raw, null);
    expect(passThrough).toBe(raw);

    // Score-Berechnung ohne calibrationParams
    const score = calculateScore(NAVIGATION_ENDPOINT, STRONG_NAVIGATION_EVIDENCE);

    // Manuell nachrechnen: die Faktoren durchrechnen
    const w = score.weights;
    const b = score.breakdown;
    const expectedRaw =
      w.w1_semantic * b.semanticMatch +
      w.w2_structural * b.structuralStability +
      w.w3_affordance * b.affordanceConsistency +
      w.w4_evidence * b.evidenceQuality +
      w.w5_historical * b.historicalSuccess -
      w.w6_ambiguity * b.ambiguityPenalty;

    const expectedClamped = Math.min(1.0, Math.max(0.0, expectedRaw));
    expect(score.score).toBeCloseTo(expectedClamped, 4);
  });
});

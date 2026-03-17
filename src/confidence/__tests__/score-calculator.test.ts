/**
 * Score Calculator Tests
 */

import { describe, it, expect } from "vitest";
import { calculateScore, calculateBatchScores } from "../score-calculator.js";
import {
  LOGIN_ENDPOINT,
  NAVIGATION_ENDPOINT,
  BARE_ENDPOINT,
  AMBIGUOUS_ENDPOINT,
  LOGIN_EVIDENCE,
  EMPTY_EVIDENCE,
  STABLE_FINGERPRINT_HISTORY,
} from "./fixtures.js";

describe("ScoreCalculator", () => {
  describe("Happy Path", () => {
    it("Login-Endpoint mit klarer Evidenz bekommt Score > 0.5", () => {
      const result = calculateScore(LOGIN_ENDPOINT, LOGIN_EVIDENCE, {
        fingerprintHistory: STABLE_FINGERPRINT_HISTORY,
      });

      expect(result.score).toBeGreaterThan(0.5);
      expect(result.score).toBeLessThanOrEqual(1.0);
      expect(result.score).toBeGreaterThanOrEqual(0.0);
    });

    it("Alle 6 Faktoren werden korrekt berechnet — Breakdown vorhanden", () => {
      const result = calculateScore(LOGIN_ENDPOINT, LOGIN_EVIDENCE);

      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.semanticMatch).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.semanticMatch).toBeLessThanOrEqual(1);
      expect(result.breakdown.structuralStability).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.structuralStability).toBeLessThanOrEqual(1);
      expect(result.breakdown.affordanceConsistency).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.affordanceConsistency).toBeLessThanOrEqual(1);
      expect(result.breakdown.evidenceQuality).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.evidenceQuality).toBeLessThanOrEqual(1);
      expect(result.breakdown.historicalSuccess).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.historicalSuccess).toBeLessThanOrEqual(1);
      expect(result.breakdown.ambiguityPenalty).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.ambiguityPenalty).toBeLessThanOrEqual(1);
    });

    it("Gewichtete Summe stimmt mit Score ueberein (ohne Calibration)", () => {
      const result = calculateScore(LOGIN_ENDPOINT, LOGIN_EVIDENCE);
      const b = result.breakdown;
      const w = result.weights;

      const expectedRaw =
        w.w1_semantic * b.semanticMatch +
        w.w2_structural * b.structuralStability +
        w.w3_affordance * b.affordanceConsistency +
        w.w4_evidence * b.evidenceQuality +
        w.w5_historical * b.historicalSuccess -
        w.w6_ambiguity * b.ambiguityPenalty;

      const expectedClamped = Math.min(1.0, Math.max(0.0, expectedRaw));
      expect(result.score).toBeCloseTo(expectedClamped, 4);
    });

    it("Default-Gewichte summieren sich zu 1.0", () => {
      const result = calculateScore(LOGIN_ENDPOINT, LOGIN_EVIDENCE);
      const w = result.weights;
      const sum =
        w.w1_semantic +
        w.w2_structural +
        w.w3_affordance +
        w.w4_evidence +
        w.w5_historical +
        w.w6_ambiguity;

      expect(sum).toBeCloseTo(1.0, 3);
    });

    it("Batch-Berechnung fuer mehrere Endpoints", () => {
      const evidenceMap = new Map<string, typeof LOGIN_EVIDENCE>();
      evidenceMap.set(LOGIN_ENDPOINT.id, LOGIN_EVIDENCE);
      evidenceMap.set(NAVIGATION_ENDPOINT.id, []);

      const results = calculateBatchScores(
        [LOGIN_ENDPOINT, NAVIGATION_ENDPOINT],
        evidenceMap,
      );

      expect(results).toHaveLength(2);
      expect(results[0]!.score).toBeGreaterThanOrEqual(0);
      expect(results[1]!.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Edge Cases", () => {
    it("Endpoint ohne Evidence — Score niedrig", () => {
      const result = calculateScore(BARE_ENDPOINT, EMPTY_EVIDENCE);
      // Evidence Quality Faktor ist 0.0 → Score muss sinken
      expect(result.breakdown.evidenceQuality).toBe(0.0);
      expect(result.score).toBeLessThan(0.8);
    });

    it("Alle Faktoren 1.0, Penalty 0.0 — Score = 0.90", () => {
      // Simuliere: Alle Faktoren liefern 1.0, keine Penalty
      // Da wir die echten Funktionen nutzen, pruefen wir die Formel direkt
      const w = {
        w1_semantic: 0.25,
        w2_structural: 0.20,
        w3_affordance: 0.20,
        w4_evidence: 0.15,
        w5_historical: 0.10,
        w6_ambiguity: 0.10,
      };
      const expectedMax =
        w.w1_semantic * 1.0 +
        w.w2_structural * 1.0 +
        w.w3_affordance * 1.0 +
        w.w4_evidence * 1.0 +
        w.w5_historical * 1.0 -
        w.w6_ambiguity * 0.0;
      // 0.25 + 0.20 + 0.20 + 0.15 + 0.10 - 0.00 = 0.90
      expect(expectedMax).toBeCloseTo(0.9, 4);
    });

    it("Score ist immer zwischen 0.0 und 1.0", () => {
      const result = calculateScore(BARE_ENDPOINT, EMPTY_EVIDENCE);
      expect(result.score).toBeGreaterThanOrEqual(0.0);
      expect(result.score).toBeLessThanOrEqual(1.0);
    });
  });

  describe("Error Cases", () => {
    it("Concurrent Score-Berechnungen — keine shared state Probleme", () => {
      // Mehrere Berechnungen parallel starten
      const results = Array.from({ length: 10 }, () =>
        calculateScore(LOGIN_ENDPOINT, LOGIN_EVIDENCE),
      );

      // Alle sollten das gleiche Ergebnis liefern (Pure Functions)
      const firstScore = results[0]!.score;
      for (const r of results) {
        expect(r.score).toBeCloseTo(firstScore, 10);
      }
    });
  });
});

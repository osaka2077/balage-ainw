/**
 * Evidence Collector Tests
 */

import { describe, it, expect } from "vitest";
import { collectEvidence, detectContradictions } from "../evidence-collector.js";
import type { Evidence } from "../../../shared_interfaces.js";
import { LOGIN_ENDPOINT, BARE_ENDPOINT } from "./fixtures.js";

describe("EvidenceCollector", () => {
  describe("collectEvidence", () => {
    it("sammelt 3+ Belege fuer typisches Login-Formular", () => {
      const evidence = collectEvidence(LOGIN_ENDPOINT);

      expect(evidence.length).toBeGreaterThanOrEqual(3);

      // Verschiedene Typen vorhanden
      const types = new Set(evidence.map((e) => e.type));
      expect(types.size).toBeGreaterThanOrEqual(2);
    });

    it("jeder Beleg hat type, signal und weight", () => {
      const evidence = collectEvidence(LOGIN_ENDPOINT);

      for (const e of evidence) {
        expect(e.type).toBeDefined();
        expect(e.signal).toBeDefined();
        expect(e.signal.length).toBeGreaterThan(0);
        expect(e.weight).toBeGreaterThanOrEqual(0);
        expect(e.weight).toBeLessThanOrEqual(1);
      }
    });

    it("sammelt historische Evidence wenn successCount > 0", () => {
      const evidence = collectEvidence(LOGIN_ENDPOINT);
      const historical = evidence.filter((e) => e.type === "historical_match");
      expect(historical.length).toBe(1);
    });

    it("Endpoint ohne History — keine historische Evidence", () => {
      const evidence = collectEvidence(BARE_ENDPOINT);
      const historical = evidence.filter((e) => e.type === "historical_match");
      expect(historical.length).toBe(0);
    });
  });

  describe("detectContradictions", () => {
    it("keine Widersprueche bei konsistenter Evidence", () => {
      const evidence: Evidence[] = [
        { type: "semantic_label", signal: "Label: login", weight: 0.8 },
        { type: "aria_role", signal: "ARIA: login form", weight: 0.7 },
        { type: "text_content", signal: "Text: sign in", weight: 0.6 },
      ];

      const contradictions = detectContradictions(evidence);
      expect(contradictions.length).toBe(0);
    });

    it("erkennt Widerspruch zwischen Login und Register Signalen", () => {
      const evidence: Evidence[] = [
        { type: "semantic_label", signal: "Label: login", weight: 0.8, source: "dom" },
        { type: "text_content", signal: "Text: create account / register", weight: 0.6, source: "dom" },
      ];

      const contradictions = detectContradictions(evidence);
      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0]!.severity).toBeGreaterThan(0);
    });

    it("leere Evidence-Liste — keine Widersprueche", () => {
      const contradictions = detectContradictions([]);
      expect(contradictions).toHaveLength(0);
    });
  });
});

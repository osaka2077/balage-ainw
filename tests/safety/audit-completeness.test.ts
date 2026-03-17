/**
 * Audit Trail Completeness Tests (3 Tests)
 *
 * SI-05: Jede Gate-Entscheidung wird protokolliert — ausnahmslos.
 * Immutability: Eintraege koennen nicht geaendert/geloescht werden.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RiskGate } from "../../src/risk/gate.js";
import { AuditTrailImmutableError } from "../../src/risk/errors.js";
import {
  NAVIGATION_ENDPOINT,
  FORM_ENDPOINT,
  CHECKOUT_ENDPOINT,
  SETTINGS_ENDPOINT,
  BARE_ENDPOINT,
} from "./fixtures/endpoints.js";
import {
  STRONG_NAVIGATION_EVIDENCE,
  STRONG_FORM_EVIDENCE,
  WEAK_EVIDENCE,
} from "./fixtures/evidence.js";
import { buildFixedConfidenceScore } from "./helpers.js";
import { createContext } from "./fixtures/contexts.js";

describe("Audit Trail Completeness — SI-05", () => {
  let gate: RiskGate;

  beforeEach(() => {
    gate = new RiskGate();
  });

  it("Jede Entscheidung geloggt: 10 Gate-Evaluations → 10 Audit-Eintraege", async () => {
    const evaluations: Array<{ action: string; endpoint: typeof NAVIGATION_ENDPOINT; score: number }> = [
      { action: "navigate", endpoint: NAVIGATION_ENDPOINT, score: 0.9 },
      { action: "read", endpoint: NAVIGATION_ENDPOINT, score: 0.8 },
      { action: "scroll", endpoint: BARE_ENDPOINT, score: 0.7 },
      { action: "toggle", endpoint: FORM_ENDPOINT, score: 0.85 },
      { action: "form_fill", endpoint: FORM_ENDPOINT, score: 0.5 },
      { action: "form_submit", endpoint: FORM_ENDPOINT, score: 0.9 },
      { action: "payment", endpoint: CHECKOUT_ENDPOINT, score: 1.0 },
      { action: "password_change", endpoint: SETTINGS_ENDPOINT, score: 1.0 },
      { action: "account_delete", endpoint: SETTINGS_ENDPOINT, score: 0.99 },
      { action: "navigate", endpoint: BARE_ENDPOINT, score: 0.3 },
    ];

    for (const ev of evaluations) {
      const confidence = buildFixedConfidenceScore(ev.score);
      const ctx = createContext();
      await gate.evaluate(ev.action, ev.endpoint, confidence, ctx);
    }

    // Exakt 10 Audit-Eintraege
    const trail = gate.auditTrail.getAllEntries();
    expect(trail.length).toBe(10);

    // Jeder Eintrag hat valide Felder
    for (const entry of trail) {
      expect(entry.id).toBeTruthy();
      expect(entry.traceId).toBeTruthy();
      expect(entry.action).toBeTruthy();
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(["allowed", "denied", "escalated"]).toContain(entry.decision);
      expect(entry.duration).toBeGreaterThanOrEqual(0);
      expect(typeof entry.confidence).toBe("number");
    }

    // Audit-Trail ist lueckenlos
    expect(gate.auditTrail.isContiguous()).toBe(true);
  });

  it("Immutability: Versuch Audit-Eintrag zu aendern/loeschen → AuditTrailImmutableError", async () => {
    const confidence = buildFixedConfidenceScore(0.9);
    const ctx = createContext(STRONG_NAVIGATION_EVIDENCE);
    await gate.evaluate("navigate", NAVIGATION_ENDPOINT, confidence, ctx);

    const entries = gate.auditTrail.getAllEntries();
    const entryId = entries[0]!.id;

    // Update-Versuch → Immutable Error
    expect(() => {
      gate.auditTrail.updateEntry(entryId, { decision: "allowed" });
    }).toThrow(AuditTrailImmutableError);

    // Delete-Versuch → Immutable Error
    expect(() => {
      gate.auditTrail.deleteEntry(entryId);
    }).toThrow(AuditTrailImmutableError);

    // Eintrag ist deep-frozen — Mutation wirft TypeError
    const entry = entries[0]!;
    expect(() => {
      (entry as Record<string, unknown>)["decision"] = "allowed";
    }).toThrow(TypeError);
  });

  it("Trail abrufbar: getTrail(sessionId) liefert Session-Eintraege", async () => {
    const sessionId = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";

    // 3 Evaluations mit gleicher sessionId
    for (const action of ["navigate", "read", "scroll"]) {
      const confidence = buildFixedConfidenceScore(0.85);
      const ctx: import("../../src/risk/types.js").GateContext = {
        sessionId,
        traceId: crypto.randomUUID(),
        evidence: STRONG_NAVIGATION_EVIDENCE,
        domain: "test.example.com",
      };
      await gate.evaluate(action, NAVIGATION_ENDPOINT, confidence, ctx);
    }

    // 2 Evaluations mit anderer sessionId
    for (const action of ["toggle", "form_fill"]) {
      const confidence = buildFixedConfidenceScore(0.85);
      const ctx: import("../../src/risk/types.js").GateContext = {
        sessionId: "99999999-9999-4999-9999-999999999999",
        traceId: crypto.randomUUID(),
        evidence: STRONG_FORM_EVIDENCE,
        domain: "other.example.com",
      };
      await gate.evaluate(action, FORM_ENDPOINT, confidence, ctx);
    }

    // Gesamt: 5 Eintraege
    expect(gate.auditTrail.size()).toBe(5);

    // Session-spezifisch: 3 Eintraege (actorId = sessionId)
    const sessionTrail = gate.auditTrail.getTrail(sessionId);
    expect(sessionTrail.length).toBe(3);

    for (const entry of sessionTrail) {
      expect(entry.actorId).toBe(sessionId);
    }
  });
});

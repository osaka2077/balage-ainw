/**
 * Critical Action Safety Tests (3 Tests)
 *
 * SI-01: Keine CRITICAL-Aktion JEMALS ohne menschliche Freigabe.
 * ESCALATE unter ALLEN Umstaenden — Confidence, Evidence, Policy egal.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RiskGate } from "../../src/risk/gate.js";
import {
  CHECKOUT_ENDPOINT,
  SETTINGS_ENDPOINT,
} from "./fixtures/endpoints.js";
import { PERFECT_EVIDENCE, STRONG_CHECKOUT_EVIDENCE } from "./fixtures/evidence.js";
import { buildFixedConfidenceScore } from "./helpers.js";
import { createContext } from "./fixtures/contexts.js";

describe("Critical Action Safety — SI-01", () => {
  let gate: RiskGate;

  beforeEach(() => {
    gate = new RiskGate();
  });

  it("Zahlung bei Confidence 1.0 → ESCALATE, nicht ALLOW", async () => {
    // Perfekte Confidence, perfekte Evidence — dennoch ESCALATE
    const confidence = buildFixedConfidenceScore(1.0, PERFECT_EVIDENCE);
    const ctx = createContext(PERFECT_EVIDENCE);

    const decision = await gate.evaluate("payment", CHECKOUT_ENDPOINT, confidence, ctx);

    // NIEMALS ALLOW fuer payment
    expect(decision.decision).not.toBe("allow");
    expect(decision.decision).toBe("escalate");
    expect(decision.escalation).toBeDefined();
    expect(decision.escalation!.type).toBe("human_review");
    expect(decision.reason).toContain("CRITICAL");
  });

  it("Passwort-Aenderung → ESCALATE, auch bei perfekter Evidence", async () => {
    const confidence = buildFixedConfidenceScore(1.0, PERFECT_EVIDENCE);
    const ctx = createContext(PERFECT_EVIDENCE);

    const decision = await gate.evaluate("password_change", SETTINGS_ENDPOINT, confidence, ctx);

    // password_change → CRITICAL → ESCALATE
    expect(decision.decision).not.toBe("allow");
    expect(decision.decision).toBe("escalate");
    expect(decision.escalation).toBeDefined();
    expect(decision.escalation!.type).toBe("human_review");
  });

  it("Account-Loeschung → ESCALATE, unter keinen Umstaenden ALLOW", async () => {
    const confidence = buildFixedConfidenceScore(1.0, PERFECT_EVIDENCE);
    const ctx = createContext(PERFECT_EVIDENCE);

    const decision = await gate.evaluate("account_delete", SETTINGS_ENDPOINT, confidence, ctx);

    // account_delete → CRITICAL → ESCALATE
    expect(decision.decision).not.toBe("allow");
    expect(decision.decision).toBe("escalate");
    expect(decision.escalation).toBeDefined();
    expect(decision.escalation!.message).toBeTruthy();

    // Audit muss "escalated" zeigen
    const trail = gate.auditTrail.getAllEntries();
    expect(trail.length).toBeGreaterThan(0);
    expect(trail[0]!.decision).toBe("escalated");
    expect(trail[0]!.success).toBe(false);
  });
});

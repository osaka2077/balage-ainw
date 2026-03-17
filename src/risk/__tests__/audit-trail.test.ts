/**
 * AuditTrail Tests — Immutability + Lueckenlosigkeit.
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { AuditTrail } from "../audit-trail.js";
import { AuditTrailImmutableError } from "../errors.js";
import type { AuditEntry } from "../types.js";

function makeAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: randomUUID(),
    traceId: randomUUID(),
    timestamp: new Date(),
    actor: "system",
    actorId: randomUUID(),
    action: "navigate",
    decision: "allowed",
    confidence: 0.9,
    riskGateResult: "allowed",
    evidence_chain: [],
    input: {},
    output: {},
    duration: 42,
    success: true,
    ...overrides,
  };
}

describe("AuditTrail", () => {
  it("logs decisions and retrieves them", () => {
    const trail = new AuditTrail();
    const sessionId = randomUUID();
    const entry1 = makeAuditEntry({ traceId: sessionId, action: "navigate" });
    const entry2 = makeAuditEntry({ traceId: sessionId, action: "form_fill" });
    const entry3 = makeAuditEntry({ action: "other" }); // Andere Session

    trail.logDecision(entry1);
    trail.logDecision(entry2);
    trail.logDecision(entry3);

    expect(trail.size()).toBe(3);

    const sessionTrail = trail.getTrail(sessionId);
    expect(sessionTrail).toHaveLength(2);
  });

  it("throws AuditTrailImmutableError on update attempt", () => {
    const trail = new AuditTrail();
    const entry = makeAuditEntry();
    trail.logDecision(entry);

    expect(() => trail.updateEntry(entry.id, { action: "hacked" })).toThrow(
      AuditTrailImmutableError
    );
  });

  it("throws AuditTrailImmutableError on delete attempt", () => {
    const trail = new AuditTrail();
    const entry = makeAuditEntry();
    trail.logDecision(entry);

    expect(() => trail.deleteEntry(entry.id)).toThrow(
      AuditTrailImmutableError
    );
  });

  it("freezes entries — modifications throw in strict mode", () => {
    const trail = new AuditTrail();
    const entry = makeAuditEntry();
    trail.logDecision(entry);

    const entries = trail.getAllEntries();
    const frozenEntry = entries[0]!;

    // Frozen objects throw TypeError on property assignment in strict mode
    expect(() => {
      (frozenEntry as Record<string, unknown>).action = "tampered";
    }).toThrow(TypeError);
  });
});

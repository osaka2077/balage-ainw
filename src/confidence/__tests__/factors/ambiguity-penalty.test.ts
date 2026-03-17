/**
 * Ambiguity Penalty Factor Tests
 */

import { describe, it, expect } from "vitest";
import { computeAmbiguityPenalty } from "../../factors/ambiguity-penalty.js";
import {
  LOGIN_ENDPOINT,
  NAVIGATION_ENDPOINT,
  AMBIGUOUS_ENDPOINT,
} from "../fixtures.js";

describe("AmbiguityPenalty", () => {
  it("Eindeutiger Endpoint — Penalty 0.0", () => {
    const penalty = computeAmbiguityPenalty(LOGIN_ENDPOINT, [LOGIN_ENDPOINT]);
    expect(penalty).toBe(0.0);
  });

  it("Keine anderen Endpoints — Penalty 0.0", () => {
    const penalty = computeAmbiguityPenalty(LOGIN_ENDPOINT, []);
    expect(penalty).toBe(0.0);
  });

  it("Endpoint mit gleichem Fingerprint-Hash — Penalty > 0", () => {
    const penalty = computeAmbiguityPenalty(
      LOGIN_ENDPOINT,
      [LOGIN_ENDPOINT, AMBIGUOUS_ENDPOINT],
    );
    // AMBIGUOUS_ENDPOINT hat gleichen Fingerprint-Hash
    expect(penalty).toBeGreaterThan(0.0);
    expect(penalty).toBe(0.25); // 1 similar * 0.25
  });

  it("Verschiedene Endpoints ohne Aehnlichkeit — Penalty 0.0", () => {
    const penalty = computeAmbiguityPenalty(
      LOGIN_ENDPOINT,
      [LOGIN_ENDPOINT, NAVIGATION_ENDPOINT],
    );
    expect(penalty).toBe(0.0);
  });

  it("Penalty ist maximal 1.0", () => {
    // 5 ambiguoese Endpoints → 5 * 0.25 = 1.25 → capped bei 1.0
    const manyAmbiguous = Array.from({ length: 5 }, (_, i) => ({
      ...AMBIGUOUS_ENDPOINT,
      id: `d4e5f6a7-b8c9-0123-defa-${String(i).padStart(12, "0")}`,
    }));
    const penalty = computeAmbiguityPenalty(
      LOGIN_ENDPOINT,
      [LOGIN_ENDPOINT, ...manyAmbiguous],
    );
    expect(penalty).toBe(1.0);
  });
});

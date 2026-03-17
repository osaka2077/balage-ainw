/**
 * Structural Stability Factor Tests
 */

import { describe, it, expect } from "vitest";
import { computeStructuralStability } from "../../factors/structural-stability.js";
import {
  LOGIN_ENDPOINT,
  NAVIGATION_ENDPOINT,
  STABLE_FINGERPRINT_HISTORY,
  UNSTABLE_FINGERPRINT_HISTORY,
} from "../fixtures.js";

describe("StructuralStability", () => {
  it("Stabiler Fingerprint ueber 3+ Besuche — hoher Score", () => {
    const score = computeStructuralStability(
      LOGIN_ENDPOINT,
      STABLE_FINGERPRINT_HISTORY,
    );
    expect(score).toBeGreaterThanOrEqual(0.8);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("Keine Historie — neutraler Score 0.5", () => {
    const score = computeStructuralStability(LOGIN_ENDPOINT, []);
    expect(score).toBe(0.5);
  });

  it("Instabiler Fingerprint — niedrigerer Score", () => {
    const score = computeStructuralStability(
      LOGIN_ENDPOINT,
      UNSTABLE_FINGERPRINT_HISTORY,
    );
    expect(score).toBeLessThan(0.8);
  });

  it("Endpoint ohne Fingerprint — neutraler Score 0.5", () => {
    const score = computeStructuralStability(
      NAVIGATION_ENDPOINT, // Hat keinen Fingerprint
      STABLE_FINGERPRINT_HISTORY,
    );
    expect(score).toBe(0.5);
  });
});

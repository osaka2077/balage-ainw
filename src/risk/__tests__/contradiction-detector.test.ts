/**
 * ContradictionDetector Tests
 */

import { describe, it, expect } from "vitest";
import { detectContradictions } from "../contradiction-detector.js";
import type { Evidence } from "../types.js";

describe("ContradictionDetector", () => {
  it("returns score 0 for empty or single evidence", () => {
    expect(detectContradictions([]).score).toBe(0);
    expect(detectContradictions([]).hasContradiction).toBe(false);

    const single: Evidence = {
      type: "semantic_label",
      signal: "Login form",
      weight: 0.9,
    };
    expect(detectContradictions([single]).score).toBe(0);
  });

  it("detects contradictory signals (login vs register)", () => {
    const evidence: Evidence[] = [
      {
        type: "semantic_label",
        signal: "Login form detected",
        weight: 0.9,
        source: "dom",
      },
      {
        type: "aria_role",
        signal: "Register form",
        weight: 0.9,
        source: "aria",
      },
    ];

    const result = detectContradictions(evidence);

    expect(result.hasContradiction).toBe(true);
    expect(result.contradictions.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("returns low score for non-contradictory evidence", () => {
    const evidence: Evidence[] = [
      {
        type: "semantic_label",
        signal: "Login form detected",
        weight: 0.9,
        source: "dom",
      },
      {
        type: "aria_role",
        signal: "Login button found",
        weight: 0.8,
        source: "aria",
      },
      {
        type: "text_content",
        signal: "Sign in heading",
        weight: 0.7,
        source: "dom",
      },
    ];

    const result = detectContradictions(evidence);
    expect(result.score).toBeLessThan(0.3);
  });
});

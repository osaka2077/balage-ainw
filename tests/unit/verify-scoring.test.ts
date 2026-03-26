/**
 * Tests fuer verify-scoring.ts — Gewichtete Confidence-Aggregation
 */
import { describe, it, expect } from "vitest";
import {
  computeWeightedScore,
  determineVerdict,
  applyWeights,
} from "../../src/core/verify-scoring.js";
import type { CheckResult } from "../../src/core/verify-types.js";

function makeCheck(
  name: string,
  passed: boolean,
  confidence: number,
  weight?: number,
): CheckResult {
  return {
    name,
    passed,
    confidence,
    evidence: `${name} evidence`,
    source: "strategy",
    weight,
  };
}

// ============================================================================
// computeWeightedScore
// ============================================================================

describe("computeWeightedScore", () => {
  it("returns 0 for empty checks array", () => {
    expect(computeWeightedScore([])).toBe(0);
  });

  it("computes weighted score for all-passing checks", () => {
    const checks = [
      makeCheck("url-change", true, 0.90, 0.50),
      makeCheck("dom-diff", true, 0.80, 0.30),
      makeCheck("cookie", true, 0.70, 0.20),
    ];
    const score = computeWeightedScore(checks);
    // (0.50*0.90 + 0.30*0.80 + 0.20*0.70) / 1.00 = 0.45+0.24+0.14 = 0.83
    expect(score).toBeCloseTo(0.83, 2);
  });

  it("returns 0 when all weighted checks fail", () => {
    const checks = [
      makeCheck("url-change", false, 0.90, 0.50),
      makeCheck("dom-diff", false, 0.80, 0.30),
    ];
    expect(computeWeightedScore(checks)).toBe(0);
  });

  it("handles mix of passing and failing checks", () => {
    const checks = [
      makeCheck("url-change", true, 0.90, 0.50),
      makeCheck("dom-diff", false, 0.80, 0.30),
      makeCheck("cookie", true, 0.70, 0.20),
    ];
    const score = computeWeightedScore(checks);
    // (0.50*0.90 + 0 + 0.20*0.70) / 1.00 = 0.45+0+0.14 = 0.59
    expect(score).toBeCloseTo(0.59, 2);
  });

  it("adds bonus from unweighted checks (max +0.1)", () => {
    const checks = [
      makeCheck("url-change", true, 0.90, 0.50),
      makeCheck("bonus-1", true, 0.80),     // unweighted
      makeCheck("bonus-2", true, 0.70),     // unweighted
    ];
    const score = computeWeightedScore(checks);
    // weighted: 0.50*0.90/0.50 = 0.90, bonus: 2/2 * 0.1 = 0.1 → 1.0 (capped)
    expect(score).toBeLessThanOrEqual(1.0);
    expect(score).toBeGreaterThan(0.90);
  });

  it("partial bonus when some unweighted checks fail", () => {
    const checks = [
      makeCheck("url-change", true, 0.80, 0.50),
      makeCheck("bonus-1", true, 0.80),
      makeCheck("bonus-2", false, 0.80),
    ];
    const score = computeWeightedScore(checks);
    // weighted: 0.80, bonus: 1/2 * 0.1 = 0.05 → 0.85
    expect(score).toBeCloseTo(0.85, 2);
  });

  it("falls back to equal-weight when no weighted checks exist", () => {
    const checks = [
      makeCheck("a", true, 0.80),
      makeCheck("b", true, 0.60),
      makeCheck("c", false, 0.90),
    ];
    const score = computeWeightedScore(checks);
    // Only passed count: (0.80 + 0.60) / 3 = 0.467
    expect(score).toBeCloseTo(0.467, 2);
  });

  it("score is always between 0 and 1", () => {
    const checks = [
      makeCheck("a", true, 1.0, 1.0),
      makeCheck("b", true, 1.0),
      makeCheck("c", true, 1.0),
    ];
    const score = computeWeightedScore(checks);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("handles weight=0 as unweighted", () => {
    const checks = [
      makeCheck("a", true, 0.80, 0),
      makeCheck("b", true, 0.60, 0.50),
    ];
    const score = computeWeightedScore(checks);
    // weighted: 0.60*0.50/0.50 = 0.60, bonus: 1/1*0.1 = 0.1 → 0.70
    expect(score).toBeCloseTo(0.70, 2);
  });
});

// ============================================================================
// determineVerdict
// ============================================================================

describe("determineVerdict", () => {
  it("returns 'verified' for score >= 0.65", () => {
    expect(determineVerdict(0.65)).toBe("verified");
    expect(determineVerdict(0.80)).toBe("verified");
    expect(determineVerdict(1.0)).toBe("verified");
  });

  it("returns 'failed' for score <= 0.35", () => {
    expect(determineVerdict(0.35)).toBe("failed");
    expect(determineVerdict(0.20)).toBe("failed");
    expect(determineVerdict(0.0)).toBe("failed");
  });

  it("returns 'inconclusive' for score between 0.35 and 0.65", () => {
    expect(determineVerdict(0.36)).toBe("inconclusive");
    expect(determineVerdict(0.50)).toBe("inconclusive");
    expect(determineVerdict(0.64)).toBe("inconclusive");
  });

  it("handles exact boundary values correctly", () => {
    expect(determineVerdict(0.649)).toBe("inconclusive");
    expect(determineVerdict(0.650)).toBe("verified");
    expect(determineVerdict(0.351)).toBe("inconclusive");
    expect(determineVerdict(0.350)).toBe("failed");
  });
});

// ============================================================================
// applyWeights
// ============================================================================

describe("applyWeights", () => {
  it("applies weights from record to matching checks", () => {
    const checks = [
      makeCheck("url-change", true, 0.90),
      makeCheck("dom-diff", true, 0.80),
    ];
    const weighted = applyWeights(checks, {
      "url-change": 0.50,
      "dom-diff": 0.30,
    });
    expect(weighted[0]!.weight).toBe(0.50);
    expect(weighted[1]!.weight).toBe(0.30);
  });

  it("preserves existing weight if not in record", () => {
    const checks = [makeCheck("url-change", true, 0.90, 0.99)];
    const weighted = applyWeights(checks, {});
    expect(weighted[0]!.weight).toBe(0.99);
  });

  it("does not mutate original array", () => {
    const checks = [makeCheck("a", true, 0.80)];
    const weighted = applyWeights(checks, { a: 0.50 });
    expect(checks[0]!.weight).toBeUndefined();
    expect(weighted[0]!.weight).toBe(0.50);
  });
});

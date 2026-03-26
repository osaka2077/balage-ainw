/**
 * Tests: Error Detection Strategy (runErrorStrategy)
 *
 * Prueft Error-Text, Error-CSS, aria-live, URL-stable, HTTP-4xx.
 * Gewichte: error-text 0.35, http-4xx 0.25, error-class 0.20, aria-live 0.10, url-stable 0.10
 */

import { describe, it, expect } from "vitest";
import { runErrorStrategy } from "../../src/core/verify-strategies/error.js";
import type {
  ActionSnapshot,
  DomDiffResult,
  CheckResult,
} from "../../src/core/verify-types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeSnapshot(
  overrides: Partial<ActionSnapshot> = {},
): ActionSnapshot {
  return {
    before: { html: "", url: "https://example.com/login", timestamp: 1000 },
    after: { html: "", url: "https://example.com/login", timestamp: 2000 },
    action: { type: "click" },
    ...overrides,
  };
}

function makeEmptyDiff(
  overrides: Partial<DomDiffResult> = {},
): DomDiffResult {
  return {
    addedElements: [],
    removedElements: [],
    textChanges: [],
    attributeChanges: [],
    significantChanges: 0,
    ...overrides,
  };
}

function findCheck(checks: CheckResult[], name: string): CheckResult {
  const found = checks.find((c) => c.name === name);
  if (!found) throw new Error(`Check "${name}" not found in results`);
  return found;
}

// ============================================================================
// Tests
// ============================================================================

describe("runErrorStrategy", () => {
  it('detects "Invalid password" as textChange', () => {
    const diff = makeEmptyDiff({
      textChanges: [
        { tagName: "div", before: "", after: "Invalid password" },
      ],
    });

    const checks = runErrorStrategy(makeSnapshot(), diff);
    const errorText = findCheck(checks, "error-text");

    expect(errorText.passed).toBe(true);
    expect(errorText.confidence).toBe(0.85);
  });

  it("detects error text in addedElement with textContent", () => {
    const diff = makeEmptyDiff({
      addedElements: [
        {
          tagName: "div",
          textContent: "Error: wrong credentials",
        },
      ],
    });

    const checks = runErrorStrategy(makeSnapshot(), diff);
    const errorText = findCheck(checks, "error-text");

    expect(errorText.passed).toBe(true);
  });

  it('detects error CSS class "alert-danger" in addedElement', () => {
    const diff = makeEmptyDiff({
      addedElements: [
        {
          tagName: "div",
          classes: ["alert-danger"],
          textContent: "Something went wrong",
        },
      ],
    });

    const checks = runErrorStrategy(makeSnapshot(), diff);
    const errorClass = findCheck(checks, "error-class");

    expect(errorClass.passed).toBe(true);
    expect(errorClass.confidence).toBe(0.8);
  });

  it('detects aria-live via role="alert" attributeChange', () => {
    const diff = makeEmptyDiff({
      attributeChanges: [
        {
          tagName: "div",
          attribute: "role",
          before: null,
          after: "alert",
        },
      ],
    });

    const checks = runErrorStrategy(makeSnapshot(), diff);
    const ariaLive = findCheck(checks, "aria-live");

    expect(ariaLive.passed).toBe(true);
  });

  it("detects url-stable when URL does not change", () => {
    const snapshot = makeSnapshot({
      before: { html: "", url: "https://example.com/login", timestamp: 1000 },
      after: { html: "", url: "https://example.com/login", timestamp: 2000 },
    });

    const checks = runErrorStrategy(snapshot, makeEmptyDiff());
    const urlStable = findCheck(checks, "url-stable");

    expect(urlStable.passed).toBe(true);
  });

  it("returns passed=false for all signal checks when no error signals present", () => {
    const checks = runErrorStrategy(makeSnapshot(), makeEmptyDiff());

    const errorText = findCheck(checks, "error-text");
    const errorClass = findCheck(checks, "error-class");
    const ariaLive = findCheck(checks, "aria-live");

    expect(errorText.passed).toBe(false);
    expect(errorClass.passed).toBe(false);
    expect(ariaLive.passed).toBe(false);

    // url-stable SOLL true sein (URL hat sich nicht geaendert)
    const urlStable = findCheck(checks, "url-stable");
    expect(urlStable.passed).toBe(true);
  });

  it("detects HTTP 4xx from networkRequests", () => {
    const snapshot = makeSnapshot({
      networkRequests: [
        { url: "/api/login", method: "POST", status: 401 },
      ],
    });

    const checks = runErrorStrategy(snapshot, makeEmptyDiff());
    const http4xx = findCheck(checks, "http-4xx");

    expect(http4xx.passed).toBe(true);
  });

  it("applies correct weights to all checks", () => {
    const snapshot = makeSnapshot({
      networkRequests: [
        { url: "/api/login", method: "POST", status: 401 },
      ],
    });

    const diff = makeEmptyDiff({
      textChanges: [
        { tagName: "div", before: "", after: "Invalid password" },
      ],
      addedElements: [
        { tagName: "div", classes: ["alert-danger"], textContent: "Error" },
      ],
      attributeChanges: [
        { tagName: "div", attribute: "role", before: null, after: "alert" },
      ],
    });

    const checks = runErrorStrategy(snapshot, diff);

    const expectedWeights: Record<string, number> = {
      "error-text": 0.35,
      "http-4xx": 0.25,
      "error-class": 0.20,
      "aria-live": 0.10,
      "url-stable": 0.10,
    };

    for (const [name, expectedWeight] of Object.entries(expectedWeights)) {
      const check = findCheck(checks, name);
      expect(check.weight).toBe(expectedWeight);
    }
  });
});

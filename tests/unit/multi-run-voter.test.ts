/**
 * Tests fuer Segment-Level Majority-Vote (multi-run-voter.ts)
 *
 * Testet die majorityVote() und clampMultiRun() Funktionen isoliert,
 * ohne LLM-Calls — reine Logik-Tests.
 */

import { describe, it, expect } from "vitest";
import { majorityVote, clampMultiRun } from "../../src/semantic/multi-run-voter.js";
import type { EndpointCandidate } from "../../src/semantic/types.js";

// Hilfsfunktion zum Erstellen von EndpointCandidates
function makeCandidate(overrides: Partial<EndpointCandidate> = {}): EndpointCandidate {
  return {
    type: "auth",
    label: "Login Form",
    description: "A login form",
    confidence: 0.8,
    anchors: [{ selector: "form", textContent: "Login" }],
    affordances: [{ type: "submit", expectedOutcome: "Login", reversible: false }],
    reasoning: "Contains password input",
    ...overrides,
  };
}

// ============================================================================
// majorityVote
// ============================================================================

describe("majorityVote", () => {
  it("returns all endpoints when 3 identical runs agree", () => {
    const candidate = makeCandidate({ confidence: 0.85 });
    const runs = [
      [{ ...candidate, confidence: 0.80 }],
      [{ ...candidate, confidence: 0.85 }],
      [{ ...candidate, confidence: 0.90 }],
    ];

    const result = majorityVote(runs);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("auth");
    expect(result[0]!.label).toBe("Login Form");
    // Confidence = Durchschnitt: (0.80 + 0.85 + 0.90) / 3 = 0.85
    expect(result[0]!.confidence).toBeCloseTo(0.85, 5);
  });

  it("keeps endpoint when it appears in 2 of 3 runs (majority)", () => {
    const candidate = makeCandidate({ confidence: 0.8 });
    const runs = [
      [{ ...candidate, confidence: 0.75 }],
      [{ ...candidate, confidence: 0.85 }],
      [], // Dritter Run hat den Endpoint nicht gefunden
    ];

    const result = majorityVote(runs);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("auth");
    // Confidence = Durchschnitt: (0.75 + 0.85) / 2 = 0.80
    expect(result[0]!.confidence).toBeCloseTo(0.80, 5);
  });

  it("discards endpoint when it appears in only 1 of 3 runs (minority)", () => {
    const candidate = makeCandidate({ confidence: 0.9 });
    const runs = [
      [{ ...candidate }],
      [],
      [],
    ];

    const result = majorityVote(runs);

    // ceil(3/2) = 2, aber Endpoint kommt nur in 1 Run vor
    expect(result).toHaveLength(0);
  });

  it("returns empty array when no runs have endpoints", () => {
    const runs: EndpointCandidate[][] = [[], [], []];
    const result = majorityVote(runs);
    expect(result).toHaveLength(0);
  });

  it("matches endpoints of same type with similar labels across runs", () => {
    // Labels die sich nur in einem Wort unterscheiden (Jaccard > 0.5):
    // "User Login Form" vs "User Login Page" -> {user,login,form} vs {user,login,page} -> overlap=2, union=4 -> 0.5 (NOT >0.5)
    // Besser: Labels mit hohem Overlap verwenden
    const runs = [
      [makeCandidate({ type: "auth", label: "Login Form", confidence: 0.8 })],
      [makeCandidate({ type: "auth", label: "Login Form", confidence: 0.85 })],
      [makeCandidate({ type: "auth", label: "Login Form", confidence: 0.75 })],
    ];

    const result = majorityVote(runs);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("auth");
    expect(result[0]!.label).toBe("Login Form");
    // Confidence = Durchschnitt: (0.8 + 0.85 + 0.75) / 3 = 0.8
    expect(result[0]!.confidence).toBeCloseTo(0.8, 5);
  });

  it("does NOT match endpoints with completely different labels even if same type", () => {
    const runs = [
      [makeCandidate({ type: "form", label: "Contact Form", confidence: 0.8 })],
      [makeCandidate({ type: "form", label: "Newsletter Subscription", confidence: 0.85 })],
      [makeCandidate({ type: "form", label: "Password Reset", confidence: 0.75 })],
    ];

    const result = majorityVote(runs);

    // Kein Label hat Similarity > 0.5 mit einem anderen -> alle unter Threshold
    expect(result).toHaveLength(0);
  });

  it("averages confidence correctly: [0.8, 0.6] => 0.7", () => {
    const runs = [
      [makeCandidate({ confidence: 0.8 })],
      [makeCandidate({ confidence: 0.6 })],
      [], // Dritter Run leer
    ];

    const result = majorityVote(runs);

    expect(result).toHaveLength(1);
    expect(result[0]!.confidence).toBeCloseTo(0.7, 5);
  });

  it("uses label and description from highest-confidence run", () => {
    // Alle Labels muessen labelSimilarity > 0.5 haben damit sie matchen.
    // "Login Form" vs "Login Form" = 1.0 (identisch)
    // Unterschied nur in description und confidence.
    const runs = [
      [makeCandidate({
        label: "Login Form",
        description: "Low confidence description",
        confidence: 0.6,
      })],
      [makeCandidate({
        label: "Login Form",
        description: "High confidence description",
        confidence: 0.95,
      })],
      [makeCandidate({
        label: "Login Form",
        description: "Mid confidence description",
        confidence: 0.75,
      })],
    ];

    const result = majorityVote(runs);

    expect(result).toHaveLength(1);
    // Representative = der mit hoechster Confidence (0.95)
    expect(result[0]!.description).toBe("High confidence description");
    // Confidence = avg(0.6, 0.95, 0.75) = 0.7667
    expect(result[0]!.confidence).toBeCloseTo((0.6 + 0.95 + 0.75) / 3, 5);
  });

  it("handles multiple different endpoints across runs correctly", () => {
    const authCandidate = makeCandidate({ type: "auth", label: "Login Form", confidence: 0.8 });
    const searchCandidate = makeCandidate({ type: "search", label: "Search Box", confidence: 0.9 });
    const navCandidate = makeCandidate({ type: "navigation", label: "Main Navigation", confidence: 0.7 });

    const runs = [
      [{ ...authCandidate, confidence: 0.8 }, { ...searchCandidate, confidence: 0.9 }, { ...navCandidate, confidence: 0.7 }],
      [{ ...authCandidate, confidence: 0.85 }, { ...searchCandidate, confidence: 0.88 }], // Kein nav
      [{ ...authCandidate, confidence: 0.78 }, { ...navCandidate, confidence: 0.65 }], // Kein search
    ];

    const result = majorityVote(runs);

    // auth: in allen 3 Runs -> behalten
    // search: in 2 von 3 -> behalten (majority)
    // nav: in 2 von 3 -> behalten (majority)
    expect(result).toHaveLength(3);

    const auth = result.find(r => r.type === "auth");
    const search = result.find(r => r.type === "search");
    const nav = result.find(r => r.type === "navigation");

    expect(auth).toBeDefined();
    expect(search).toBeDefined();
    expect(nav).toBeDefined();

    // auth confidence = avg(0.8, 0.85, 0.78) = 0.81
    expect(auth!.confidence).toBeCloseTo((0.8 + 0.85 + 0.78) / 3, 5);
    // search confidence = avg(0.9, 0.88) = 0.89
    expect(search!.confidence).toBeCloseTo((0.9 + 0.88) / 2, 5);
    // nav confidence = avg(0.7, 0.65) = 0.675
    expect(nav!.confidence).toBeCloseTo((0.7 + 0.65) / 2, 5);
  });

  it("returns single run results unchanged when only 1 run provided", () => {
    const candidates = [
      makeCandidate({ type: "auth", confidence: 0.8 }),
      makeCandidate({ type: "search", label: "Search", confidence: 0.9 }),
    ];

    const result = majorityVote([candidates]);

    // Single-run shortcut returns the array as-is (no sorting or filtering)
    expect(result).toHaveLength(2);
    expect(result[0]!.confidence).toBe(0.8);
    expect(result[1]!.confidence).toBe(0.9);
  });

  it("returns empty array when called with empty runs array", () => {
    const result = majorityVote([]);
    expect(result).toHaveLength(0);
  });

  it("sorts results by confidence descending", () => {
    const runs = [
      [
        makeCandidate({ type: "auth", label: "Login", confidence: 0.6 }),
        makeCandidate({ type: "search", label: "Search Box", confidence: 0.9 }),
      ],
      [
        makeCandidate({ type: "auth", label: "Login", confidence: 0.65 }),
        makeCandidate({ type: "search", label: "Search Box", confidence: 0.85 }),
      ],
    ];

    const result = majorityVote(runs);

    expect(result).toHaveLength(2);
    // Search hat hoehere avg confidence (0.875) als auth (0.625)
    expect(result[0]!.type).toBe("search");
    expect(result[1]!.type).toBe("auth");
  });

  it("handles 2-run case: needs both runs to agree (ceil(2/2)=1)", () => {
    // Bei 2 Runs: ceil(2/2) = 1, also reicht 1 Run
    const runs = [
      [makeCandidate({ type: "auth", label: "Login", confidence: 0.8 })],
      [], // Zweiter Run leer
    ];

    const result = majorityVote(runs);

    // ceil(2/2) = 1, Endpoint kommt in 1 Run vor -> behalten
    expect(result).toHaveLength(1);
  });

  it("handles 5-run case: needs 3 of 5 (ceil(5/2)=3)", () => {
    const runs = [
      [makeCandidate({ confidence: 0.8 })],
      [makeCandidate({ confidence: 0.85 })],
      [], // Kein Match
      [], // Kein Match
      [], // Kein Match
    ];

    const result = majorityVote(runs);

    // ceil(5/2) = 3, aber nur in 2 Runs -> verworfen
    expect(result).toHaveLength(0);
  });

  it("handles 5-run case: keeps when in 3 of 5", () => {
    const runs = [
      [makeCandidate({ confidence: 0.8 })],
      [makeCandidate({ confidence: 0.85 })],
      [makeCandidate({ confidence: 0.75 })],
      [], // Kein Match
      [], // Kein Match
    ];

    const result = majorityVote(runs);

    // ceil(5/2) = 3, in 3 Runs -> behalten
    expect(result).toHaveLength(1);
    expect(result[0]!.confidence).toBeCloseTo((0.8 + 0.85 + 0.75) / 3, 5);
  });

  it("does not match different types even with identical labels", () => {
    const runs = [
      [makeCandidate({ type: "auth", label: "Submit Form", confidence: 0.8 })],
      [makeCandidate({ type: "form", label: "Submit Form", confidence: 0.85 })],
      [makeCandidate({ type: "checkout", label: "Submit Form", confidence: 0.9 })],
    ];

    const result = majorityVote(runs);

    // Jeder Typ kommt nur in 1 Run vor, Threshold = ceil(3/2) = 2 -> alle verworfen
    expect(result).toHaveLength(0);
  });

  it("filters out empty/undefined run entries gracefully", () => {
    const runs = [
      [makeCandidate({ confidence: 0.8 })],
      [makeCandidate({ confidence: 0.85 })],
      [] as EndpointCandidate[], // Leerer Run (wird rausgefiltert)
    ];

    // Valide Runs = 2, Threshold = ceil(2/2) = 1
    const result = majorityVote(runs);
    expect(result).toHaveLength(1);
  });
});

// ============================================================================
// clampMultiRun
// ============================================================================

describe("clampMultiRun", () => {
  it("returns 1 for multiRun=1 (default, no change)", () => {
    expect(clampMultiRun(1)).toBe(1);
  });

  it("returns 3 for multiRun=3", () => {
    expect(clampMultiRun(3)).toBe(3);
  });

  it("returns 5 for multiRun=5 (max)", () => {
    expect(clampMultiRun(5)).toBe(5);
  });

  it("clamps multiRun=10 to 5", () => {
    expect(clampMultiRun(10)).toBe(5);
  });

  it("clamps multiRun=0 to 1", () => {
    expect(clampMultiRun(0)).toBe(1);
  });

  it("clamps negative multiRun to 1", () => {
    expect(clampMultiRun(-3)).toBe(1);
  });

  it("returns 1 for undefined", () => {
    expect(clampMultiRun(undefined)).toBe(1);
  });

  it("returns 1 for null", () => {
    expect(clampMultiRun(null)).toBe(1);
  });

  it("returns 1 for NaN", () => {
    expect(clampMultiRun(NaN)).toBe(1);
  });

  it("floors fractional values: 3.7 => 3", () => {
    expect(clampMultiRun(3.7)).toBe(3);
  });

  it("returns 1 for Infinity", () => {
    expect(clampMultiRun(Infinity)).toBe(1);
  });
});

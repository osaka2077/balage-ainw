/**
 * Tests fuer Segment-Level Majority-Vote (multi-run-voter.ts)
 *
 * Testet die majorityVote() und clampMultiRun() Funktionen isoliert,
 * ohne LLM-Calls — reine Logik-Tests.
 *
 * Matching-Algorithmus: Typ-basiert + Positions-Matching (nicht label-basiert).
 * Innerhalb eines Typs werden Candidates per Greedy-labelSimilarity gematcht,
 * mit Fallback auf Positions-Reihenfolge wenn Similarity < 0.2.
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

  it("matches endpoints of same type across runs (type-based matching)", () => {
    // Gleicher Typ, gleiche Labels — triviales Matching
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

  it("matches different labels of same type via type+position (core fix)", () => {
    // DAS ist der Kernfix: LLM generiert verschiedene Labels fuer den gleichen Endpoint.
    // Altes Verhalten: labelSimilarity("Sign in with Google", "Google SSO Login") < 0.5 → 3 verschiedene Buckets → alle verworfen
    // Neues Verhalten: Alle sind Typ "auth", Slot 0 → werden als gleicher Endpoint gematcht
    const runs = [
      [makeCandidate({ type: "auth", label: "Sign in with Google", confidence: 0.8 })],
      [makeCandidate({ type: "auth", label: "Google SSO Login", confidence: 0.85 })],
      [makeCandidate({ type: "auth", label: "Continue with Google OAuth", confidence: 0.75 })],
    ];

    const result = majorityVote(runs);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("auth");
    // Representative vom Run mit hoechster Confidence (0.85)
    expect(result[0]!.label).toBe("Google SSO Login");
    expect(result[0]!.confidence).toBeCloseTo((0.8 + 0.85 + 0.75) / 3, 5);
  });

  it("matches 2 auth endpoints pairwise across runs", () => {
    // Run 1: [auth-A, auth-B], Run 2: [auth-A', auth-B'], Run 3: [auth-A'', auth-B'']
    // Sollen paarweise gematcht werden: Slot 0 (A) und Slot 1 (B)
    const runs = [
      [
        makeCandidate({ type: "auth", label: "Google Login", confidence: 0.8 }),
        makeCandidate({ type: "auth", label: "Email Login", confidence: 0.7 }),
      ],
      [
        makeCandidate({ type: "auth", label: "Sign in with Google", confidence: 0.85 }),
        makeCandidate({ type: "auth", label: "Email Sign In", confidence: 0.75 }),
      ],
      [
        makeCandidate({ type: "auth", label: "Google OAuth", confidence: 0.82 }),
        makeCandidate({ type: "auth", label: "Login with Email", confidence: 0.72 }),
      ],
    ];

    const result = majorityVote(runs);

    // Beide Slots in allen 3 Runs → beide behalten
    expect(result).toHaveLength(2);

    const types = result.map(r => r.type);
    expect(types.every(t => t === "auth")).toBe(true);
  });

  it("applies majority to each slot independently (2 auth in Run 1, 1 auth in Run 2)", () => {
    // Run 1: 2 auth, Run 2: 1 auth, Run 3: 1 auth
    // Slot 0: in allen 3 Runs → behalten
    // Slot 1: nur in Run 1 → verworfen (1 von 3 < ceil(3/2)=2)
    const runs = [
      [
        makeCandidate({ type: "auth", label: "Google Login", confidence: 0.8 }),
        makeCandidate({ type: "auth", label: "Email Login", confidence: 0.7 }),
      ],
      [
        makeCandidate({ type: "auth", label: "Google Sign In", confidence: 0.85 }),
      ],
      [
        makeCandidate({ type: "auth", label: "Login with Google", confidence: 0.82 }),
      ],
    ];

    const result = majorityVote(runs);

    // Slot 0 (Google): 3 Runs → behalten
    // Slot 1 (Email): 1 Run → verworfen
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("auth");
  });

  it("does NOT match completely unrelated labels even with same type when threshold applies", () => {
    // Wenn nur 1 Endpoint pro Typ pro Run: Typ-Matching greift immer.
    // Verschiedene form-Endpoints in verschiedenen Runs werden als gleicher Slot gematcht
    // wenn es nur einen pro Run gibt (Position 0 = Position 0).
    const runs = [
      [makeCandidate({ type: "form", label: "Contact Form", confidence: 0.8 })],
      [makeCandidate({ type: "form", label: "Newsletter Subscription", confidence: 0.85 })],
      [makeCandidate({ type: "form", label: "Password Reset", confidence: 0.75 })],
    ];

    const result = majorityVote(runs);

    // Alle sind Typ "form", alle Slot 0 → werden gematcht (3 von 3 Runs)
    // Das ist gewollt: Das LLM nennt denselben Endpoint unterschiedlich
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("form");
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

  it("handles multiple different endpoint types across runs correctly", () => {
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
      [] as EndpointCandidate[], // Leerer Run
    ];

    const result = majorityVote(runs);
    // 2 von 3 Runs haben den Endpoint → ceil(3/2)=2 → behalten
    expect(result).toHaveLength(1);
  });

  // ============================================================================
  // Neue Tests fuer typ-basiertes Matching
  // ============================================================================

  it("'Sign in with Google' vs 'Google SSO' vs 'OAuth Login' → same endpoint (label-invariant)", () => {
    // Exaktes Szenario aus dem Bug-Report: Drei voellig verschiedene Labels
    // fuer den gleichen auth-Endpoint. Das alte Matching haette 0 Ergebnisse geliefert.
    const runs = [
      [makeCandidate({ type: "auth", label: "Sign in with Google", confidence: 0.80 })],
      [makeCandidate({ type: "auth", label: "Google SSO", confidence: 0.85 })],
      [makeCandidate({ type: "auth", label: "OAuth Login", confidence: 0.78 })],
    ];

    const result = majorityVote(runs);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("auth");
    // Representative ist der mit hoechster Confidence: "Google SSO" (0.85)
    expect(result[0]!.label).toBe("Google SSO");
    expect(result[0]!.confidence).toBeCloseTo((0.80 + 0.85 + 0.78) / 3, 5);
  });

  it("greedy matching prefers similar labels within same type", () => {
    // Run 1: [Google Login, Email Login], Run 2: [Email Sign In, Google SSO]
    // Greedy sollte Google↔Google und Email↔Email matchen, nicht nach Position allein
    const runs = [
      [
        makeCandidate({ type: "auth", label: "Google Login", confidence: 0.80 }),
        makeCandidate({ type: "auth", label: "Email Login", confidence: 0.70 }),
      ],
      [
        makeCandidate({ type: "auth", label: "Email Sign In", confidence: 0.75 }),
        makeCandidate({ type: "auth", label: "Google Sign In", confidence: 0.85 }),
      ],
    ];

    const result = majorityVote(runs);

    // Beide Slots sollten gematcht werden (2/2 Runs → behalten bei ceil(2/2)=1)
    expect(result).toHaveLength(2);
    expect(result.every(r => r.type === "auth")).toBe(true);
  });

  it("mixed types: each type matched independently", () => {
    // auth + search + navigation — verschiedene Typen, verschiedene Slot-Gruppen
    const runs = [
      [
        makeCandidate({ type: "auth", label: "Login", confidence: 0.8 }),
        makeCandidate({ type: "search", label: "Search Bar", confidence: 0.9 }),
      ],
      [
        makeCandidate({ type: "auth", label: "Sign In", confidence: 0.82 }),
        makeCandidate({ type: "search", label: "Search Box", confidence: 0.88 }),
      ],
      [
        makeCandidate({ type: "auth", label: "Authentication", confidence: 0.78 }),
        makeCandidate({ type: "search", label: "Search Input", confidence: 0.92 }),
      ],
    ];

    const result = majorityVote(runs);

    expect(result).toHaveLength(2);
    const auth = result.find(r => r.type === "auth");
    const search = result.find(r => r.type === "search");
    expect(auth).toBeDefined();
    expect(search).toBeDefined();
    // auth representative: "Sign In" hat 0.82 (hoechste)
    expect(auth!.label).toBe("Sign In");
    // search representative: "Search Input" hat 0.92 (hoechste)
    expect(search!.label).toBe("Search Input");
  });

  it("run with 0 endpoints of a type counts against that type's slots", () => {
    // 3 Runs, aber nur Run 1 hat einen nav-Endpoint
    // auth: in allen 3 → behalten. nav: nur in 1 von 3 → verworfen
    const runs = [
      [
        makeCandidate({ type: "auth", label: "Login", confidence: 0.8 }),
        makeCandidate({ type: "navigation", label: "Main Nav", confidence: 0.7 }),
      ],
      [
        makeCandidate({ type: "auth", label: "Login Page", confidence: 0.85 }),
      ],
      [
        makeCandidate({ type: "auth", label: "Sign In", confidence: 0.82 }),
      ],
    ];

    const result = majorityVote(runs);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("auth");
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

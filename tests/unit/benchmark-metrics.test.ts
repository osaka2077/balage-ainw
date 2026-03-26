/**
 * Unit Tests fuer Benchmark-Metrik-Logik
 *
 * Testet computeMatches, computeMetrics, computePhase1Metrics, typesMatch, labelBasedMatch.
 * Verhindert Regressionen wie ERR-001 (falscher Precision-Nenner).
 */

import { describe, it, expect } from "vitest";
import {
  typesMatch,
  labelBasedMatch,
  computeMatches,
  computeMetrics,
  computePhase1Metrics,
  type GroundTruthEndpoint,
} from "../real-world/benchmark-runner.js";
import type { Endpoint } from "../../shared_interfaces.js";

// ============================================================================
// Helper: Minimal Endpoint Factory
// ============================================================================

function makeGT(overrides: Partial<GroundTruthEndpoint> & { type: string; label: string }): GroundTruthEndpoint {
  return {
    description: "",
    selector_hint: "",
    affordances: [],
    risk_class: "low",
    fields: [],
    phase: 1,
    ...overrides,
  };
}

function makeDet(type: string, label: string, confidence = 0.8): Endpoint {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    url: "https://example.com",
    type,
    category: type,
    label: { primary: label, aliases: [], accessibility: "" },
    status: "active",
    validation_status: "unvalidated",
    adapter_type: "browser",
    anchors: [{ selector: "div", tag: "div", role: "generic" }],
    affordances: [{ type: "click", target: "div" }],
    confidence,
    confidenceBreakdown: {
      semanticMatch: 0.8,
      structuralStability: 0.8,
      affordanceConsistency: 0.8,
      evidenceQuality: 0.8,
      historicalSuccess: 0.5,
      ambiguityPenalty: 0,
    },
    evidence: [],
    risk_class: "low",
    actions: [],
    childEndpointIds: [],
    discoveredAt: now,
    lastSeenAt: now,
    successCount: 0,
    failureCount: 0,
    metadata: {},
  } as Endpoint;
}

// ============================================================================
// typesMatch
// ============================================================================

describe("typesMatch", () => {
  it("exact type match", () => {
    expect(typesMatch("auth", "auth")).toBe(true);
    expect(typesMatch("form", "form")).toBe(true);
  });

  it("alias match: auth accepts form", () => {
    expect(typesMatch("auth", "form")).toBe(true);
  });

  it("alias match: form accepts search", () => {
    expect(typesMatch("form", "search")).toBe(true);
  });

  it("alias match: checkout accepts commerce", () => {
    expect(typesMatch("checkout", "commerce")).toBe(true);
  });

  it("no match for unrelated types", () => {
    expect(typesMatch("auth", "navigation")).toBe(false);
    expect(typesMatch("checkout", "content")).toBe(false);
  });

  it("alias is not symmetric: form->auth is false", () => {
    // auth accepts form, but form does NOT accept auth
    expect(typesMatch("form", "auth")).toBe(false);
  });
});

// ============================================================================
// labelBasedMatch
// ============================================================================

describe("labelBasedMatch", () => {
  it("detected form with login label matches GT auth", () => {
    expect(labelBasedMatch("auth", "form", "Login Form")).toBe(true);
    expect(labelBasedMatch("auth", "form", "Sign In Button")).toBe(true);
  });

  it("detected form with search label matches GT search", () => {
    expect(labelBasedMatch("search", "form", "Search Products")).toBe(true);
    expect(labelBasedMatch("search", "form", "Find Items")).toBe(true);
  });

  it("detected form with generic label does not match auth", () => {
    expect(labelBasedMatch("auth", "form", "Newsletter Signup")).toBe(false);
  });

  it("only works for form detected type", () => {
    expect(labelBasedMatch("auth", "navigation", "Login Link")).toBe(false);
  });
});

// ============================================================================
// computeMatches
// ============================================================================

describe("computeMatches", () => {
  it("perfect match: all GT found in detected", () => {
    const gt = [makeGT({ type: "auth", label: "Login" })];
    const det = [makeDet("auth", "Login Form")];
    const result = computeMatches(gt, det);
    expect(result.matched).toBe(1);
    expect(result.details[0]!.matched).not.toBeNull();
  });

  it("no match: completely different types", () => {
    const gt = [makeGT({ type: "auth", label: "Login" })];
    const det = [makeDet("navigation", "Home Link")];
    const result = computeMatches(gt, det);
    expect(result.matched).toBe(0);
    expect(result.details[0]!.matched).toBeNull();
  });

  it("alias match: GT auth matches detected form", () => {
    const gt = [makeGT({ type: "auth", label: "Login" })];
    const det = [makeDet("form", "Some Form")];
    const result = computeMatches(gt, det);
    expect(result.matched).toBe(1);
  });

  it("prefers exact match over alias match", () => {
    const gt = [makeGT({ type: "auth", label: "Login" })];
    const det = [
      makeDet("form", "Generic Form", 0.9),
      makeDet("auth", "Auth Form", 0.7),
    ];
    const result = computeMatches(gt, det);
    expect(result.matched).toBe(1);
    // Should match the exact auth, not the higher-confidence form
    expect(result.details[0]!.matched!.type).toBe("auth");
  });

  it("1:1 constraint: each detected used at most once", () => {
    const gt = [
      makeGT({ type: "auth", label: "Login" }),
      makeGT({ type: "auth", label: "SSO Login" }),
    ];
    const det = [makeDet("auth", "Auth Form", 0.9)];
    const result = computeMatches(gt, det);
    // Only 1 detected can match, even though 2 GT want auth
    expect(result.matched).toBe(1);
  });

  it("empty GT and empty detected", () => {
    const result = computeMatches([], []);
    expect(result.matched).toBe(0);
    expect(result.details).toHaveLength(0);
  });

  it("global-optimal: GT order does not affect matching result", () => {
    // Regressionstest: Beim alten greedy-Algorithmus bekam der erste GT
    // den besten Match. Hier pruefen wir, dass die Reihenfolge egal ist.
    const gt_order_a = [
      makeGT({ type: "form", label: "Contact Form" }),
      makeGT({ type: "auth", label: "Login" }),
    ];
    const gt_order_b = [
      makeGT({ type: "auth", label: "Login" }),
      makeGT({ type: "form", label: "Contact Form" }),
    ];
    // Ein "form"-Detected das sowohl GT-auth (alias) als auch GT-form (exact) matchen koennte,
    // plus ein "auth"-Detected. Global-optimal: auth<->auth (exact), form<->form (exact).
    const det = [
      makeDet("form", "Contact Us", 0.9),
      makeDet("auth", "Sign In", 0.7),
    ];
    const result_a = computeMatches(gt_order_a, det);
    const result_b = computeMatches(gt_order_b, det);
    expect(result_a.matched).toBe(2);
    expect(result_b.matched).toBe(2);
    // Beide Reihenfolgen muessen exakte Type-Matches produzieren
    const exactTypes_a = result_a.details.filter(d => d.typeMatch).length;
    const exactTypes_b = result_b.details.filter(d => d.typeMatch).length;
    expect(exactTypes_a).toBe(2);
    expect(exactTypes_b).toBe(2);
  });

  it("global-optimal: higher-score pair wins over lower-score pair", () => {
    // GT: auth + search. Detected: ein "form" mit Login-Label (semantic match fuer auth)
    // und ein "auth" (exact match). Global-optimal muss auth<->auth waehlen (score 2000+),
    // nicht auth<->form (score 0+).
    const gt = [
      makeGT({ type: "search", label: "Search" }),
      makeGT({ type: "auth", label: "Login" }),
    ];
    const det = [
      makeDet("form", "Login Form", 0.9),   // semantic match fuer auth, alias fuer search
      makeDet("auth", "Auth Panel", 0.5),    // exact match fuer auth
    ];
    const result = computeMatches(gt, det);
    expect(result.matched).toBe(2);
    // auth GT muss den exakten auth-Detected bekommen (hoechster Score)
    const authDetail = result.details.find(d => d.groundTruth.type === "auth");
    expect(authDetail!.matched!.type).toBe("auth");
    expect(authDetail!.typeMatch).toBe(true);
  });

  it("multiple GT, multiple detected — best assignment", () => {
    const gt = [
      makeGT({ type: "auth", label: "Login" }),
      makeGT({ type: "search", label: "Search" }),
      makeGT({ type: "navigation", label: "Home" }),
    ];
    const det = [
      makeDet("auth", "Sign In", 0.9),
      makeDet("search", "Search Bar", 0.85),
      makeDet("navigation", "Nav Menu", 0.7),
      makeDet("content", "Article", 0.6), // extra, no GT match
    ];
    const result = computeMatches(gt, det);
    expect(result.matched).toBe(3);
  });
});

// ============================================================================
// computeMetrics
// ============================================================================

describe("computeMetrics", () => {
  it("perfect detection: P=1, R=1, F1=1", () => {
    const gt = [makeGT({ type: "auth", label: "Login" })];
    const det = [makeDet("auth", "Login Form")];
    const m = computeMetrics(gt, det);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
    expect(m.f1).toBe(1);
  });

  it("over-detection: precision drops, recall stays", () => {
    const gt = [makeGT({ type: "auth", label: "Login" })];
    const det = [
      makeDet("auth", "Login Form"),
      makeDet("navigation", "Nav 1"),
      makeDet("content", "Content 1"),
    ];
    const m = computeMetrics(gt, det);
    expect(m.precision).toBeCloseTo(1 / 3, 2);
    expect(m.recall).toBe(1);
  });

  it("under-detection: precision stays, recall drops", () => {
    const gt = [
      makeGT({ type: "auth", label: "Login" }),
      makeGT({ type: "search", label: "Search" }),
    ];
    const det = [makeDet("auth", "Login Form")];
    const m = computeMetrics(gt, det);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(0.5);
  });

  it("zero detected: P=0, R=0, F1=0", () => {
    const gt = [makeGT({ type: "auth", label: "Login" })];
    const m = computeMetrics(gt, []);
    expect(m.precision).toBe(0);
    expect(m.recall).toBe(0);
    expect(m.f1).toBe(0);
  });

  it("zero GT: P=0, R=0, F1=0", () => {
    const det = [makeDet("auth", "Login Form")];
    const m = computeMetrics([], det);
    expect(m.precision).toBe(0);
    expect(m.f1).toBe(0);
  });

  it("both empty: P=1, R=1, F1=1", () => {
    const m = computeMetrics([], []);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
    expect(m.f1).toBe(1);
  });

  it("typeAccuracy reflects exact matches only", () => {
    const gt = [
      makeGT({ type: "auth", label: "Login" }),
      makeGT({ type: "search", label: "Search" }),
    ];
    const det = [
      makeDet("auth", "Auth Form"),   // exact match
      makeDet("form", "Search Box"),   // alias match (search->form alias)
    ];
    const m = computeMetrics(gt, det);
    expect(m.typeAccuracy).toBe(0.5); // 1 exact out of 2 matched
  });
});

// ============================================================================
// computePhase1Metrics — ERR-001 Regression Test
// ============================================================================

describe("computePhase1Metrics", () => {
  it("ERR-001: precision denominator is filtered, not all detected", () => {
    // Szenario: 1 Phase-1 auth GT, Pipeline findet auth + 8 navigation/content
    // FALSCH (ERR-001): P = 1/9 = 0.11
    // RICHTIG: P = 1/1 = 1.0 (nur auth-relevante detected zaehlen)
    const phase1GT = [makeGT({ type: "auth", label: "Login", phase: 1 })];
    const allDetected = [
      makeDet("auth", "Login Form", 0.9),
      makeDet("navigation", "Home", 0.8),
      makeDet("navigation", "About", 0.7),
      makeDet("content", "Article 1", 0.6),
      makeDet("content", "Article 2", 0.5),
      makeDet("content", "Article 3", 0.4),
      makeDet("navigation", "Footer", 0.3),
      makeDet("navigation", "Sidebar", 0.3),
      makeDet("content", "Hero", 0.2),
    ];
    const m = computePhase1Metrics(phase1GT, allDetected);
    // auth GT has aliases [auth, form]. Only "auth" detected is relevant.
    // So precision = 1/1 = 1.0, NOT 1/9
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
  });

  it("ERR-001 variant: Wikipedia-like scenario", () => {
    // Wikipedia: 1 search GT, 7 total detected (search + navigation + content)
    const phase1GT = [makeGT({ type: "search", label: "Search Wikipedia", phase: 1 })];
    const allDetected = [
      makeDet("search", "Search Bar", 0.9),
      makeDet("navigation", "Main Page", 0.8),
      makeDet("navigation", "Random Article", 0.7),
      makeDet("content", "Main Content", 0.6),
      makeDet("navigation", "Talk Page", 0.5),
      makeDet("content", "Sidebar Info", 0.4),
      makeDet("navigation", "History", 0.3),
    ];
    const m = computePhase1Metrics(phase1GT, allDetected);
    // search aliases: [search, form]. Only "search" detected is relevant.
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
  });

  it("empty phase1 GT returns zeros", () => {
    const m = computePhase1Metrics([], [makeDet("auth", "Login")]);
    expect(m.precision).toBe(0);
    expect(m.recall).toBe(0);
    expect(m.f1).toBe(0);
  });

  it("no relevant detected returns zeros", () => {
    const phase1GT = [makeGT({ type: "auth", label: "Login", phase: 1 })];
    const allDetected = [
      makeDet("navigation", "Home", 0.8),
      makeDet("content", "Article", 0.7),
    ];
    const m = computePhase1Metrics(phase1GT, allDetected);
    expect(m.precision).toBe(0);
    expect(m.recall).toBe(0);
  });

  it("mixed phase1 types: auth + checkout", () => {
    const phase1GT = [
      makeGT({ type: "auth", label: "Login", phase: 1 }),
      makeGT({ type: "checkout", label: "Buy Now", phase: 1 }),
    ];
    const allDetected = [
      makeDet("auth", "Sign In", 0.9),
      makeDet("checkout", "Purchase", 0.85),
      makeDet("navigation", "Home", 0.7),
      makeDet("navigation", "About", 0.6),
      makeDet("content", "Description", 0.5),
    ];
    const m = computePhase1Metrics(phase1GT, allDetected);
    // Relevant detected: auth (auth alias), form (auth alias), checkout, commerce (checkout alias)
    // Actual relevant in detected: auth + checkout = 2
    // Matched: 2/2
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
  });

  it("false positives in relevant pool reduce precision", () => {
    const phase1GT = [makeGT({ type: "auth", label: "Login", phase: 1 })];
    const allDetected = [
      makeDet("auth", "Login Form", 0.9),
      makeDet("form", "Newsletter Signup", 0.7), // form is auth-relevant (alias)
      makeDet("navigation", "Home", 0.6),
    ];
    const m = computePhase1Metrics(phase1GT, allDetected);
    // Relevant: auth + form (both are auth aliases) = 2 detected
    // Matched: 1 (auth matched to GT auth)
    // Precision = 1/2 = 0.5
    expect(m.precision).toBe(0.5);
    expect(m.recall).toBe(1);
  });
});

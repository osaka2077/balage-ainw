/**
 * Post-Processing Module Tests
 *
 * Testet die 4 extrahierten Module:
 * - type-corrector
 * - confidence-penalizer
 * - deduplicator
 * - gap-cutoff
 */

import { describe, it, expect } from "vitest";
import type { EndpointCandidate } from "../../src/semantic/types.js";
import { applyTypeCorrections } from "../../src/semantic/post-processing/type-corrector.js";
import { applyConfidencePenalties } from "../../src/semantic/post-processing/confidence-penalizer.js";
import { deduplicateCandidates, labelSimilarity } from "../../src/semantic/post-processing/deduplicator.js";
import { applyGapCutoff, calculateDynamicCap } from "../../src/semantic/post-processing/gap-cutoff.js";
import { runPostProcessing } from "../../src/semantic/post-processing/index.js";

// ============================================================================
// Helpers
// ============================================================================

function makeCandidate(
  type: string,
  label: string,
  confidence: number = 0.8,
  description: string = "",
): EndpointCandidate {
  return {
    type,
    label,
    description,
    confidence,
    anchors: [{ selector: "div" }],
    affordances: [{ type: "click", expectedOutcome: "test", reversible: true }],
    reasoning: "test",
  };
}

// ============================================================================
// Type-Corrector
// ============================================================================

describe("applyTypeCorrections", () => {
  it("corrects settings to consent when cookie keywords in label", () => {
    const candidates = [makeCandidate("settings", "Cookie Preferences", 0.8, "Manage cookie consent")];
    applyTypeCorrections(candidates, "some page content");
    expect(candidates[0]!.type).toBe("consent");
  });

  it("corrects settings to consent when consent keywords in segment", () => {
    const candidates = [makeCandidate("settings", "Privacy Settings", 0.8, "Manage preferences")];
    applyTypeCorrections(candidates, "accept all cookies gdpr datenschutz");
    expect(candidates[0]!.type).toBe("consent");
  });

  it("corrects checkout to search on booking sites without cart", () => {
    const candidates = [makeCandidate("checkout", "Book Now", 0.8, "Complete booking")];
    const segText = 'check-in date departure arrival destination guests rooms <input type="search">';
    applyTypeCorrections(candidates, segText);
    expect(candidates[0]!.type).toBe("search");
  });

  it("does not correct checkout when cart evidence present", () => {
    const candidates = [makeCandidate("checkout", "Checkout", 0.8, "Complete purchase")];
    applyTypeCorrections(candidates, "cart items total checkout warenkorb");
    expect(candidates[0]!.type).toBe("checkout");
  });

  it("corrects checkout to search when label has search keywords", () => {
    const candidates = [makeCandidate("checkout", "Search Properties", 0.8, "Find destination")];
    const originalConf = candidates[0]!.confidence;
    applyTypeCorrections(candidates, "some page content");
    expect(candidates[0]!.type).toBe("search");
    expect(candidates[0]!.confidence).toBeCloseTo(originalConf * 0.95);
  });

  it("corrects navigation to support when support keywords in label", () => {
    const candidates = [makeCandidate("navigation", "Contact Support", 0.8, "Get help with issues")];
    const originalConf = candidates[0]!.confidence;
    applyTypeCorrections(candidates, "some page content");
    expect(candidates[0]!.type).toBe("support");
    expect(candidates[0]!.confidence).toBeCloseTo(originalConf * 0.95);
  });

  it("corrects content to navigation in footer with links", () => {
    const candidates = [makeCandidate("content", "Footer Links", 0.8, "Site links")];
    const originalConf = candidates[0]!.confidence;
    applyTypeCorrections(candidates, '<a href="/about">About</a>', "footer");
    expect(candidates[0]!.type).toBe("navigation");
    expect(candidates[0]!.confidence).toBeCloseTo(originalConf * 0.95);
  });

  it("corrects settings to navigation for language-only without settings UI", () => {
    const candidates = [makeCandidate("settings", "Language Selector", 0.8, "Choose language")];
    const originalConf = candidates[0]!.confidence;
    applyTypeCorrections(candidates, "select your preferred language locale");
    expect(candidates[0]!.type).toBe("navigation");
    expect(candidates[0]!.confidence).toBeCloseTo(originalConf * 0.9);
  });

  it("does not correct settings for language when real settings UI present", () => {
    const candidates = [makeCandidate("settings", "Language Settings", 0.8, "Language preferences")];
    applyTypeCorrections(candidates, "toggle switch checkbox language preference einstellung");
    expect(candidates[0]!.type).toBe("settings");
  });

  it("does not modify candidates when type is already correct", () => {
    const candidates = [makeCandidate("auth", "Login Form", 0.85, "Sign in")];
    applyTypeCorrections(candidates, "type=\"password\" type=\"email\"");
    expect(candidates[0]!.type).toBe("auth");
    expect(candidates[0]!.confidence).toBe(0.85);
  });

  it("handles empty candidates array", () => {
    const candidates: EndpointCandidate[] = [];
    applyTypeCorrections(candidates, "some text");
    expect(candidates).toHaveLength(0);
  });

  // --- Neue Tests fuer Booking/Amazon/Travel Fixes ---

  it("corrects checkout to search with searchbox DOM evidence (Booking pattern)", () => {
    const candidates = [makeCandidate("checkout", "Accommodation Search", 0.85, "Search for hotels")];
    // Segment enthaelt "checkout" (Check-out-Datum) UND searchbox DOM-Evidence
    const segText = 'data-testid="searchbox-form-button-icon" destination check-in checkout date guests';
    applyTypeCorrections(candidates, segText);
    expect(candidates[0]!.type).toBe("search");
  });

  it("corrects commerce to search with searchbox DOM evidence (Booking pattern)", () => {
    const candidates = [makeCandidate("commerce", "Booking Search", 0.80, "Book accommodation")];
    const segText = 'data-testid="searchbox-layout-wide" data-testid="destination-container" data-testid="occupancy-config"';
    applyTypeCorrections(candidates, segText);
    expect(candidates[0]!.type).toBe("search");
  });

  it("does not correct checkout to search with searchbox evidence when real cart present", () => {
    const candidates = [makeCandidate("checkout", "Shopping Cart", 0.85, "Your items")];
    // Reale Cart-Evidence (nicht nur "checkout")
    const segText = 'data-testid="searchbox-layout" add to cart warenkorb';
    applyTypeCorrections(candidates, segText);
    expect(candidates[0]!.type).toBe("checkout");
  });

  it("corrects settings to consent with OneTrust segment evidence", () => {
    const candidates = [makeCandidate("settings", "Banner Controls", 0.80, "Manage settings")];
    const segText = "onetrust-banner-sdk accept all cookies";
    applyTypeCorrections(candidates, segText);
    expect(candidates[0]!.type).toBe("consent");
  });

  it("corrects settings to consent with sp-cc segment evidence", () => {
    const candidates = [makeCandidate("settings", "Privacy Controls", 0.80, "Manage consent")];
    const segText = "sp-cc-accept akzeptieren ablehnen";
    applyTypeCorrections(candidates, segText);
    expect(candidates[0]!.type).toBe("consent");
  });

  it("corrects settings to consent with Cookie label (case insensitive)", () => {
    const candidates = [makeCandidate("settings", "Cookie Consent Banner", 0.80, "Privacy settings for cookies")];
    applyTypeCorrections(candidates, "some page content with sp-cc-wrapper");
    expect(candidates[0]!.type).toBe("consent");
  });
});

// ============================================================================
// Confidence-Penalizer
// ============================================================================

describe("applyConfidencePenalties", () => {
  it("penalizes search without DOM search evidence", () => {
    const candidates = [makeCandidate("search", "Search", 0.8)];
    applyConfidencePenalties(candidates, "just some plain text with links and buttons");
    expect(candidates[0]!.confidence).toBeCloseTo(0.8 * 0.55);
  });

  it("does not penalize search with search evidence", () => {
    const candidates = [makeCandidate("search", "Search", 0.8)];
    applyConfidencePenalties(candidates, 'input type="search" placeholder="search for products"');
    expect(candidates[0]!.confidence).toBe(0.8);
  });

  it("penalizes auth from nav segment without credential fields", () => {
    const candidates = [makeCandidate("auth", "Sign In", 0.8)];
    applyConfidencePenalties(candidates, "some links and buttons", "navigation");
    expect(candidates[0]!.confidence).toBeCloseTo(0.8 * 0.85);
  });

  it("does not penalize auth from nav segment with auth links", () => {
    const candidates = [makeCandidate("auth", "Sign In", 0.8)];
    applyConfidencePenalties(candidates, "sign in register account", "navigation");
    expect(candidates[0]!.confidence).toBe(0.8);
  });

  it("applies tiered penalty for commerce without evidence (high confidence)", () => {
    const candidates = [makeCandidate("commerce", "Products", 0.75)];
    applyConfidencePenalties(candidates, "no commerce indicators here");
    expect(candidates[0]!.confidence).toBeCloseTo(0.75 * 0.8);
  });

  it("applies tiered penalty for commerce without evidence (low confidence)", () => {
    const candidates = [makeCandidate("commerce", "Products", 0.5)];
    applyConfidencePenalties(candidates, "no commerce indicators here");
    expect(candidates[0]!.confidence).toBeCloseTo(0.5 * 0.6);
  });

  it("never makes confidence negative", () => {
    const candidates = [makeCandidate("search", "Search", 0.01)];
    applyConfidencePenalties(candidates, "no evidence at all");
    expect(candidates[0]!.confidence).toBeGreaterThanOrEqual(0);
  });

  it("handles empty candidates array", () => {
    const candidates: EndpointCandidate[] = [];
    applyConfidencePenalties(candidates, "text");
    expect(candidates).toHaveLength(0);
  });
});

// ============================================================================
// Deduplicator
// ============================================================================

describe("deduplicateCandidates", () => {
  it("removes identical labels with same type", () => {
    const candidates = [
      makeCandidate("auth", "Login Form", 0.9),
      makeCandidate("auth", "Login Form", 0.7),
    ];
    const result = deduplicateCandidates(candidates);
    expect(result).toHaveLength(1);
    expect(result[0]!.confidence).toBe(0.9);
  });

  it("removes similar labels (Jaccard > 0.65) with same type", () => {
    const candidates = [
      makeCandidate("auth", "User Login Form", 0.9),
      makeCandidate("auth", "User Login", 0.7),
    ];
    const result = deduplicateCandidates(candidates);
    expect(result).toHaveLength(1);
    expect(result[0]!.confidence).toBe(0.9);
  });

  it("keeps candidates with different types even if labels are similar", () => {
    const candidates = [
      makeCandidate("auth", "Login", 0.9),
      makeCandidate("navigation", "Login", 0.7),
    ];
    const result = deduplicateCandidates(candidates);
    expect(result).toHaveLength(2);
  });

  it("deduplicates multiple Add to Cart commerce endpoints", () => {
    const candidates = [
      makeCandidate("commerce", "Add to Cart", 0.9),
      makeCandidate("commerce", "Add to Cart - Small", 0.7),
      makeCandidate("commerce", "Product Details", 0.8),
    ];
    const result = deduplicateCandidates(candidates);
    const cartItems = result.filter(c => /add to cart/i.test(c.label));
    expect(cartItems).toHaveLength(1);
  });

  it("applies per-type caps", () => {
    // search cap is 1
    const candidates = [
      makeCandidate("search", "Main Search", 0.9),
      makeCandidate("search", "Footer Search Bar", 0.7),
    ];
    const result = deduplicateCandidates(candidates);
    const searchItems = result.filter(c => c.type === "search");
    expect(searchItems).toHaveLength(1);
  });

  it("handles empty array", () => {
    const result = deduplicateCandidates([]);
    expect(result).toHaveLength(0);
  });
});

describe("labelSimilarity", () => {
  it("returns 1 for identical labels", () => {
    expect(labelSimilarity("Login Form", "Login Form")).toBe(1);
  });

  it("returns 1 for both empty strings", () => {
    expect(labelSimilarity("", "")).toBe(1);
  });

  it("returns 0 for one empty string", () => {
    expect(labelSimilarity("Login", "")).toBe(0);
  });

  it("returns 0 for completely different labels", () => {
    expect(labelSimilarity("Login Form", "Cart Summary")).toBe(0);
  });

  it("returns correct Jaccard similarity for partial overlap", () => {
    // After synonym normalization: "user login" → "user sign in", "login form" → "sign in form"
    // intersection={sign,in}=2, union={user,sign,in,form}=4 → 2/4 = 0.5
    const sim = labelSimilarity("User Login", "Login Form");
    expect(sim).toBeCloseTo(0.5);
  });

  it("is case-insensitive", () => {
    expect(labelSimilarity("LOGIN FORM", "login form")).toBe(1);
  });
});

// ============================================================================
// Gap-Cutoff
// ============================================================================

describe("applyGapCutoff", () => {
  it("keeps all candidates when no significant gap", () => {
    const candidates = [
      makeCandidate("auth", "Login", 0.9),
      makeCandidate("search", "Search", 0.88),
      makeCandidate("navigation", "Nav", 0.86),
      makeCandidate("form", "Form", 0.84),
    ];
    const result = applyGapCutoff(candidates);
    expect(result).toHaveLength(4);
  });

  it("cuts at large gap after MIN_ENDPOINTS", () => {
    const candidates = [
      makeCandidate("auth", "Login", 0.9),
      makeCandidate("search", "Search", 0.88),
      makeCandidate("navigation", "Nav", 0.86),
      makeCandidate("form", "Form", 0.84),
      // Big gap here (0.84 - 0.5 = 0.34)
      makeCandidate("content", "Noise", 0.5),
      makeCandidate("media", "More Noise", 0.3),
    ];
    const result = applyGapCutoff(candidates);
    expect(result).toHaveLength(4);
    expect(result.every(c => c.confidence >= 0.84)).toBe(true);
  });

  it("keeps all when under MIN_ENDPOINTS", () => {
    const candidates = [
      makeCandidate("auth", "Login", 0.9),
      makeCandidate("search", "Search", 0.3),
    ];
    const result = applyGapCutoff(candidates);
    expect(result).toHaveLength(2);
  });

  it("handles empty array", () => {
    const result = applyGapCutoff([]);
    expect(result).toHaveLength(0);
  });

  it("returns sorted by confidence descending", () => {
    const candidates = [
      makeCandidate("search", "Search", 0.5),
      makeCandidate("auth", "Login", 0.9),
      makeCandidate("navigation", "Nav", 0.7),
    ];
    const result = applyGapCutoff(candidates);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.confidence).toBeLessThanOrEqual(result[i - 1]!.confidence);
    }
  });

  it("respects dynamic safety cap based on candidate count", () => {
    // 15 Candidates → cap = min(max(5, ceil(11.25)), 9) = 9
    const candidates = Array.from({ length: 15 }, (_, i) =>
      makeCandidate("navigation", `Nav ${i}`, 0.9 - i * 0.01),
    );
    const result = applyGapCutoff(candidates);
    expect(result.length).toBeLessThanOrEqual(9);
  });

  it("applies stricter cap for fewer candidates (5 → cap 5)", () => {
    // 5 Candidates, kein Gap → dynamicCap = max(5, ceil(3.75)) = 5
    const candidates = Array.from({ length: 5 }, (_, i) =>
      makeCandidate("navigation", `Nav ${i}`, 0.9 - i * 0.01),
    );
    const result = applyGapCutoff(candidates);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("applies medium cap for 8 candidates (cap 6)", () => {
    // 8 Candidates, kein Gap → dynamicCap = max(5, ceil(6)) = 6
    const candidates = Array.from({ length: 8 }, (_, i) =>
      makeCandidate("form", `Form ${i}`, 0.9 - i * 0.01),
    );
    const result = applyGapCutoff(candidates);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it("applies cap 8 for 10 candidates", () => {
    // 10 Candidates, kein Gap → dynamicCap = max(5, ceil(7.5)) = 8
    const candidates = Array.from({ length: 10 }, (_, i) =>
      makeCandidate("content", `Content ${i}`, 0.9 - i * 0.01),
    );
    const result = applyGapCutoff(candidates);
    expect(result.length).toBeLessThanOrEqual(8);
  });
});

// ============================================================================
// Dynamic Cap Calculation (T-006)
// ============================================================================

describe("calculateDynamicCap", () => {
  it("returns 5 for 5 candidates (floor)", () => {
    // max(5, ceil(5 * 0.75)) = max(5, 4) = 5
    expect(calculateDynamicCap(5)).toBe(5);
  });

  it("returns 6 for 8 candidates", () => {
    // max(5, ceil(8 * 0.75)) = max(5, 6) = 6
    expect(calculateDynamicCap(8)).toBe(6);
  });

  it("returns 8 for 10 candidates", () => {
    // max(5, ceil(10 * 0.75)) = max(5, 8) = 8
    expect(calculateDynamicCap(10)).toBe(8);
  });

  it("returns 9 (clamped) for 15 candidates", () => {
    // min(max(5, ceil(15 * 0.75)), 9) = min(max(5, 12), 9) = 9
    expect(calculateDynamicCap(15)).toBe(9);
  });

  it("returns 5 for very small candidate counts", () => {
    expect(calculateDynamicCap(1)).toBe(5);
    expect(calculateDynamicCap(2)).toBe(5);
    expect(calculateDynamicCap(3)).toBe(5);
  });
});

// ============================================================================
// Navigation Cap (T-007)
// ============================================================================

describe("deduplicateCandidates — navigation cap", () => {
  it("limits navigation endpoints to 3", () => {
    const candidates = [
      makeCandidate("navigation", "Main Nav", 0.9),
      makeCandidate("navigation", "Footer Nav", 0.85),
      makeCandidate("navigation", "Sidebar Nav", 0.8),
      makeCandidate("navigation", "Breadcrumb Nav", 0.75),
      makeCandidate("navigation", "Mobile Nav", 0.7),
    ];
    const result = deduplicateCandidates(candidates);
    const navItems = result.filter(c => c.type === "navigation");
    expect(navItems).toHaveLength(3);
  });

  it("limits content endpoints to 2 (down from 3)", () => {
    const candidates = [
      makeCandidate("content", "Accordion A", 0.9),
      makeCandidate("content", "Tabs B", 0.85),
      makeCandidate("content", "Carousel C", 0.8),
    ];
    const result = deduplicateCandidates(candidates);
    const contentItems = result.filter(c => c.type === "content");
    expect(contentItems).toHaveLength(2);
  });
});

// ============================================================================
// OpenAI Seed Parameter (T-008)
// ============================================================================

describe("OpenAI client — seed parameter", () => {
  it("seed: 42 is configured in OpenAI client create call", async () => {
    // Verifiziere dass der OpenAI-Client den seed-Parameter setzt.
    // Da der echte Client einen API-Key braucht, testen wir ueber den Source-Code.
    // Dieser Test dient als Regression-Guard fuer den seed-Parameter.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const clientSource = fs.readFileSync(
      path.resolve("src/semantic/llm-client.ts"),
      "utf-8",
    );
    // Pruefe dass seed: 42 im OpenAI-Client gesetzt ist
    expect(clientSource).toContain("seed: 42");
    // Pruefe dass json_object response_format gesetzt ist
    expect(clientSource).toContain('type: "json_object"');
  });
});

// ============================================================================
// Pipeline Integration (runPostProcessing)
// ============================================================================

describe("runPostProcessing", () => {
  it("runs all 4 phases in correct order", () => {
    const candidates = [
      makeCandidate("checkout", "Search Flights", 0.8, "Find your destination"),
      makeCandidate("auth", "Login", 0.85),
      makeCandidate("navigation", "Contact Support", 0.75, "Get help"),
    ];
    const segText = "check-in departure arrival destination guests rooms";
    const result = runPostProcessing(candidates, segText);

    // checkout -> search (type correction)
    const searchResult = result.find(c => c.label === "Search Flights");
    expect(searchResult?.type).toBe("search");

    // navigation -> support (type correction)
    const supportResult = result.find(c => c.label === "Contact Support");
    expect(supportResult?.type).toBe("support");
  });
});

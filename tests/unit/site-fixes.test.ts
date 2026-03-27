/**
 * Site-Specific F1 Fixes Tests
 *
 * Testet 3 gezielte Korrekturen:
 * - Fix 1: Booking/Travel checkout/commerce → search (type-corrector)
 * - Fix 2: Zendesk navigation/content → support (type-corrector)
 * - Fix 3: CTA-Gate "Get Started Free" etc. (heuristic-analyzer)
 */

import { describe, it, expect } from "vitest";
import type { EndpointCandidate } from "../../src/semantic/types.js";
import { applyTypeCorrections } from "../../src/semantic/post-processing/type-corrector.js";
import { classifySegmentHeuristically } from "../../src/core/heuristic-analyzer.js";
import type { UISegment, DomNode } from "../../src/core/types.js";

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

function makeSegment(overrides: Partial<UISegment> = {}): UISegment {
  return {
    id: "seg-1",
    type: "content",
    boundingBox: { x: 0, y: 0, width: 800, height: 600 },
    interactiveElementCount: 1,
    nodes: [],
    ...overrides,
  } as UISegment;
}

function makeDomNode(overrides: Partial<DomNode> = {}): DomNode {
  return {
    tagName: "div",
    attributes: {},
    isVisible: true,
    isInteractive: false,
    children: [],
    ...overrides,
  };
}

// ============================================================================
// Fix 1: Booking/Travel — checkout/commerce → search
// ============================================================================

describe("Fix 1: Booking/Travel search correction", () => {
  it("corrects 'Accommodation Search' checkout to search", () => {
    const candidates = [
      makeCandidate("checkout", "Accommodation Search Form", 0.8, "Search for accommodation"),
    ];
    applyTypeCorrections(candidates, "some booking page content");
    expect(candidates[0]!.type).toBe("search");
  });

  it("keeps real checkout with cart/warenkorb evidence", () => {
    const candidates = [
      makeCandidate("checkout", "Hotel Checkout", 0.8, "Complete booking"),
    ];
    // segText enthaelt cart-Evidence → kein Korrektur
    applyTypeCorrections(candidates, "cart items total price add to cart");
    expect(candidates[0]!.type).toBe("checkout");
  });

  it("corrects 'Hotel Reservation' commerce to search", () => {
    const candidates = [
      makeCandidate("commerce", "Hotel Reservation", 0.8, "Reserve your hotel room"),
    ];
    applyTypeCorrections(candidates, "page with hotel listings");
    expect(candidates[0]!.type).toBe("search");
  });

  it("keeps commerce with 'add to cart' evidence in segment", () => {
    const candidates = [
      makeCandidate("commerce", "Flight Booking", 0.8, "Book your flight"),
    ];
    // segText enthaelt "add to" (CART_LABEL_EVIDENCE match auf "add.to")
    applyTypeCorrections(candidates, "add to basket your selected items");
    expect(candidates[0]!.type).toBe("commerce");
  });

  it("does not correct when no travel pattern in label", () => {
    const candidates = [
      makeCandidate("checkout", "Premium Plan", 0.8, "Upgrade your subscription"),
    ];
    applyTypeCorrections(candidates, "some generic page");
    // Kein travel-pattern, kein search-label → bleibt checkout
    expect(candidates[0]!.type).toBe("checkout");
  });
});

// ============================================================================
// Fix 2: Zendesk — navigation/content → support
// ============================================================================

describe("Fix 2: Support-type correction", () => {
  it("corrects 'Submit a Request' navigation to support", () => {
    const candidates = [
      makeCandidate("navigation", "Submit a Request", 0.8, "Submit your support request"),
    ];
    applyTypeCorrections(candidates, "generic page content");
    expect(candidates[0]!.type).toBe("support");
  });

  it("corrects 'Contact Support' content to support", () => {
    const candidates = [
      makeCandidate("content", "Contact Support", 0.8, "Reach out to our team"),
    ];
    applyTypeCorrections(candidates, "generic page content");
    expect(candidates[0]!.type).toBe("support");
  });

  it("corrects via segment text with 'help center' pattern", () => {
    const candidates = [
      makeCandidate("navigation", "Resources", 0.8, "Useful links"),
    ];
    // Kein support-pattern im Label, aber im segText
    applyTypeCorrections(candidates, "welcome to our help center find answers here");
    expect(candidates[0]!.type).toBe("support");
  });

  it("does not correct navigation without support pattern", () => {
    const candidates = [
      makeCandidate("navigation", "Main Menu", 0.8, "Site navigation"),
    ];
    applyTypeCorrections(candidates, "links to about products pricing");
    expect(candidates[0]!.type).toBe("navigation");
  });

  it("does not convert auth type to support", () => {
    // auth-Typ sollte NICHT durch die support-Regel betroffen werden
    // (Regel greift nur auf navigation/content)
    const candidates = [
      makeCandidate("auth", "Contact Support Login", 0.8, "Login to help center"),
    ];
    applyTypeCorrections(candidates, "help center login page");
    expect(candidates[0]!.type).toBe("auth");
  });
});

// ============================================================================
// Fix 3: CTA-Gate — Marketing CTAs → form Endpoint
// ============================================================================

describe("Fix 3: CTA-Gate in heuristic analyzer", () => {
  it("creates form endpoint for 'Get Started Free' button", () => {
    const buttonNode = makeDomNode({
      tagName: "button",
      attributes: { type: "button" },
      isInteractive: true,
      textContent: "Get Started Free",
    });
    const segment = makeSegment({
      type: "content",
      interactiveElementCount: 1,
      nodes: [buttonNode],
    });
    const fullDom = makeDomNode({ children: [buttonNode] });

    const result = classifySegmentHeuristically(segment, fullDom);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("form");
    expect(result!.confidence).toBe(0.70);
  });

  it("creates form endpoint for 'Try Free' link button", () => {
    const linkNode = makeDomNode({
      tagName: "button",
      attributes: { type: "button" },
      isInteractive: true,
      textContent: "Try Free",
    });
    const segment = makeSegment({
      type: "content",
      interactiveElementCount: 1,
      nodes: [linkNode],
    });
    const fullDom = makeDomNode({ children: [linkNode] });

    const result = classifySegmentHeuristically(segment, fullDom);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("form");
    expect(result!.confidence).toBe(0.70);
  });

  it("does NOT create CTA endpoint when auth endpoint already exists", () => {
    // Segment hat Password + Email → auth-Gate greift ZUERST, CTA wird uebersprungen
    const passwordNode = makeDomNode({
      tagName: "input",
      attributes: { type: "password" },
      isInteractive: true,
    });
    const emailNode = makeDomNode({
      tagName: "input",
      attributes: { type: "email" },
      isInteractive: true,
    });
    const ctaButton = makeDomNode({
      tagName: "button",
      attributes: { type: "submit" },
      isInteractive: true,
      textContent: "Get Started Free",
    });
    const segment = makeSegment({
      type: "form",
      interactiveElementCount: 3,
      nodes: [passwordNode, emailNode, ctaButton],
    });
    const fullDom = makeDomNode({ children: [passwordNode, emailNode, ctaButton] });

    const result = classifySegmentHeuristically(segment, fullDom);
    // auth-Gate (Gate 1) sollte greifen, NICHT CTA-Gate
    expect(result).not.toBeNull();
    expect(result!.type).toBe("auth");
  });

  it("does NOT create endpoint for normal button without CTA pattern", () => {
    const buttonNode = makeDomNode({
      tagName: "button",
      attributes: { type: "button" },
      isInteractive: true,
      textContent: "Learn More",
    });
    const segment = makeSegment({
      type: "content",
      interactiveElementCount: 1,
      nodes: [buttonNode],
    });
    const fullDom = makeDomNode({ children: [buttonNode] });

    const result = classifySegmentHeuristically(segment, fullDom);
    // "Learn More" matcht kein CTA-Pattern → null (LLM benoetigt)
    expect(result).toBeNull();
  });

  it("creates form endpoint for 'Jetzt kostenlos testen' (German CTA)", () => {
    const buttonNode = makeDomNode({
      tagName: "button",
      attributes: { type: "button" },
      isInteractive: true,
      textContent: "Jetzt kostenlos testen",
    });
    const segment = makeSegment({
      type: "content",
      interactiveElementCount: 1,
      nodes: [buttonNode],
    });
    const fullDom = makeDomNode({ children: [buttonNode] });

    const result = classifySegmentHeuristically(segment, fullDom);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("form");
    expect(result!.confidence).toBe(0.70);
  });
});

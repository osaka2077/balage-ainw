/**
 * P1 — Segmenter-Fixes Tests
 *
 * Testet die kuerzlich committed Aenderungen am UI-Segmenter:
 * - Checkout-Erkennung via CSS-Klassen
 * - Implicit Forms mit role="button"
 * - Form-in-Nav Doppel-Segment
 * - Search-only Implicit Forms
 * - DEFAULT_MIN_CONFIDENCE Threshold
 */

import { describe, it, expect } from "vitest";
import { segmentUI } from "../../src/parser/ui-segmenter.js";
import type { DomNode } from "../../shared_interfaces.js";
import type { AriaAnalysis } from "../../src/parser/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeDomNode(
  tagName: string,
  attrs: Record<string, string> = {},
  children: DomNode[] = [],
  overrides: Partial<DomNode> = {},
): DomNode {
  return {
    tagName,
    attributes: attrs,
    isVisible: true,
    isInteractive: false,
    children,
    ...overrides,
  };
}

function makeAriaAnalysis(): AriaAnalysis {
  return {
    landmarks: [],
    liveRegions: [],
    labelMap: new Map<string, string>(),
    conflicts: [],
  };
}

// ============================================================================
// Checkout-Segment-Erkennung via CSS-Klassen
// ============================================================================

describe("Checkout Segment Detection", () => {
  it("classifies node with class='cart-button' as checkout", () => {
    const dom = makeDomNode("div", { class: "cart-button" }, [
      makeDomNode("button", {}, [], {
        textContent: "Add to Cart",
        isInteractive: true,
      }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());
    const checkoutSegments = segments.filter((s) => s.type === "checkout");

    expect(checkoutSegments.length).toBeGreaterThanOrEqual(1);
  });

  it("classifies node with class='basket-summary' as checkout", () => {
    const dom = makeDomNode("div", { class: "basket-summary" }, [
      makeDomNode("span", {}, [], { textContent: "Your Basket" }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());
    const checkoutSegments = segments.filter((s) => s.type === "checkout");

    expect(checkoutSegments.length).toBeGreaterThanOrEqual(1);
  });

  it("classifies node with class='checkout-form' as checkout", () => {
    const dom = makeDomNode("div", { class: "checkout-form" }, [
      makeDomNode("input", { type: "text" }, [], { isInteractive: true }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());
    const checkoutSegments = segments.filter((s) => s.type === "checkout");

    expect(checkoutSegments.length).toBeGreaterThanOrEqual(1);
  });

  it("assigns checkout weight of 0.7 (above DEFAULT_MIN_CONFIDENCE)", () => {
    const dom = makeDomNode("div", { class: "shopping-cart" });

    const segments = segmentUI(dom, makeAriaAnalysis());
    const checkoutSegments = segments.filter((s) => s.type === "checkout");

    expect(checkoutSegments.length).toBeGreaterThanOrEqual(1);
    expect(checkoutSegments[0]!.confidence).toBeGreaterThanOrEqual(0.7);
  });
});

// ============================================================================
// Implicit Form mit role="button"
// ============================================================================

describe("Implicit Form with role='button'", () => {
  it("detects div with input + span[role=button] as form", () => {
    const dom = makeDomNode("div", {}, [
      makeDomNode("input", { type: "text", placeholder: "Enter code" }, [], {
        isInteractive: true,
      }),
      makeDomNode("span", { role: "button" }, [], {
        textContent: "Apply",
        isInteractive: true,
      }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());
    const formSegments = segments.filter((s) => s.type === "form");

    expect(formSegments.length).toBeGreaterThanOrEqual(1);
  });

  it("detects div with textarea + div[role=button] as form", () => {
    const dom = makeDomNode("div", {}, [
      makeDomNode("textarea", { placeholder: "Type message" }, [], {
        isInteractive: true,
      }),
      makeDomNode("div", { role: "button" }, [], {
        textContent: "Send",
        isInteractive: true,
      }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());
    const formSegments = segments.filter((s) => s.type === "form");

    expect(formSegments.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT detect div with only input (no button or role=button)", () => {
    const dom = makeDomNode("div", {}, [
      makeDomNode("input", { type: "text" }, [], { isInteractive: true }),
      makeDomNode("span", {}, [], { textContent: "Hint text" }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());
    const formSegments = segments.filter((s) => s.type === "form");

    // Kein Implicit Form (kein Button), aber evtl. standalone-input Mini-Segment
    // Der parent div bekommt KEIN form-Segment
    const parentFormSegments = formSegments.filter(
      (s) => s.nodes.length > 0 && s.nodes[0]!.tagName === "div",
    );
    expect(parentFormSegments).toHaveLength(0);
  });
});

// ============================================================================
// Form-in-Nav: Doppeltes Segment
// ============================================================================

describe("Form-in-Nav Dual Segment Emission", () => {
  it("emits BOTH navigation and form segments from nav with input+button", () => {
    const dom = makeDomNode("nav", {}, [
      makeDomNode("a", { href: "/" }, [], {
        textContent: "Home",
        isInteractive: true,
      }),
      makeDomNode("input", { type: "text", placeholder: "Search..." }, [], {
        isInteractive: true,
      }),
      makeDomNode("button", {}, [], {
        textContent: "Go",
        isInteractive: true,
      }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());
    const types = segments.map((s) => s.type);

    expect(types).toContain("navigation");
    expect(types).toContain("form");
  });

  it("form-in-nav segment has confidence of 0.7", () => {
    const dom = makeDomNode("nav", {}, [
      makeDomNode("input", { type: "text" }, [], { isInteractive: true }),
      makeDomNode("button", {}, [], {
        textContent: "Search",
        isInteractive: true,
      }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());
    const formSegments = segments.filter((s) => s.type === "form");

    expect(formSegments.length).toBeGreaterThanOrEqual(1);
    // Das embedded form Segment hat confidence 0.7
    const embeddedForm = formSegments.find(
      (s) => s.confidence === 0.7 || s.label?.includes("embedded"),
    );
    expect(embeddedForm).toBeDefined();
  });

  it("navigation segment retains high confidence from <nav> tag", () => {
    const dom = makeDomNode("nav", {}, [
      makeDomNode("input", { type: "text" }, [], { isInteractive: true }),
      makeDomNode("button", {}, [], {
        textContent: "Search",
        isInteractive: true,
      }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());
    const navSegments = segments.filter((s) => s.type === "navigation");

    expect(navSegments.length).toBe(1);
    expect(navSegments[0]!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("does NOT emit form for nav without interactive form elements", () => {
    const dom = makeDomNode("nav", {}, [
      makeDomNode("a", { href: "/" }, [], {
        textContent: "Home",
        isInteractive: true,
      }),
      makeDomNode("a", { href: "/about" }, [], {
        textContent: "About",
        isInteractive: true,
      }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());
    const types = segments.map((s) => s.type);

    expect(types).toContain("navigation");
    // Keine form-Segmente auf dem nav-Level
    const navFormSegments = segments.filter(
      (s) =>
        s.type === "form" &&
        s.nodes[0]?.tagName.toLowerCase() === "nav",
    );
    expect(navFormSegments).toHaveLength(0);
  });
});

// ============================================================================
// Search-only Implicit Form
// ============================================================================

describe("Search-only Implicit Form", () => {
  it("detects input[type=search] without button as implicit form", () => {
    const dom = makeDomNode("div", {}, [
      makeDomNode("input", { type: "search", placeholder: "Search..." }, [], {
        isInteractive: true,
      }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());

    // Sollte mindestens ein form- oder search-Segment haben
    const relevantSegments = segments.filter(
      (s) => s.type === "form" || s.type === "search",
    );
    expect(relevantSegments.length).toBeGreaterThanOrEqual(1);
  });

  it("detects input[role=searchbox] without button as implicit form", () => {
    const dom = makeDomNode("div", {}, [
      makeDomNode(
        "input",
        { type: "text", role: "searchbox", placeholder: "Find..." },
        [],
        { isInteractive: true },
      ),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());

    const relevantSegments = segments.filter(
      (s) => s.type === "form" || s.type === "search",
    );
    expect(relevantSegments.length).toBeGreaterThanOrEqual(1);
  });

  it("real <form> elements are NOT treated as implicit forms", () => {
    const dom = makeDomNode("form", {}, [
      makeDomNode("input", { type: "text" }, [], { isInteractive: true }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());
    const formSegments = segments.filter((s) => s.type === "form");

    // <form> bekommt sein Segment via tag-Semantik, nicht via isImplicitForm
    expect(formSegments.length).toBeGreaterThanOrEqual(1);
    // Confidence sollte hoch sein (tag-basiert, weight 0.9)
    expect(formSegments[0]!.confidence).toBeGreaterThanOrEqual(0.85);
  });
});

// ============================================================================
// DEFAULT_MIN_CONFIDENCE = 0.4
// ============================================================================

describe("DEFAULT_MIN_CONFIDENCE Threshold (0.4)", () => {
  it("emits segments with confidence >= 0.4", () => {
    // class="sidebar" hat weight 0.6 → confidence ~0.6 → ueber Threshold
    const dom = makeDomNode("div", { class: "sidebar" });

    const segments = segmentUI(dom, makeAriaAnalysis());
    const sidebarSegments = segments.filter((s) => s.type === "sidebar");

    expect(sidebarSegments.length).toBe(1);
    expect(sidebarSegments[0]!.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it("filters out segments with confidence < 0.4", () => {
    // class="content" hat weight 0.3 → confidence ~0.3 → UNTER Threshold
    const dom = makeDomNode("div", { class: "content" });

    const segments = segmentUI(dom, makeAriaAnalysis());
    const contentByClass = segments.filter(
      (s) => s.type === "content" && s.nodes[0]?.attributes["class"] === "content",
    );

    // Segment sollte NICHT emittiert werden (0.3 < 0.4)
    expect(contentByClass).toHaveLength(0);
  });

  it("custom minConfidence overrides default", () => {
    // class="menu" hat weight 0.4 (navigation) → confidence ~0.4
    // Mit minConfidence 0.5: wird gefiltert
    const dom = makeDomNode("div", { class: "menu" });

    const segmentsDefault = segmentUI(dom, makeAriaAnalysis());
    const segmentsStrict = segmentUI(dom, makeAriaAnalysis(), {
      minConfidence: 0.5,
    });

    const defaultNav = segmentsDefault.filter(
      (s) => s.type === "navigation",
    );
    const strictNav = segmentsStrict.filter(
      (s) => s.type === "navigation",
    );

    // Bei default (0.4): class="menu" → weight 0.4 → genau an der Grenze → emittiert
    expect(defaultNav.length).toBeGreaterThanOrEqual(1);
    // Bei strict (0.5): weight 0.4 < 0.5 → gefiltert
    expect(strictNav).toHaveLength(0);
  });

  it("high-confidence tag-based segments always pass", () => {
    // <nav> hat weight 0.9 → immer ueber jedem realistischen Threshold
    const dom = makeDomNode("nav", {}, [
      makeDomNode("a", { href: "/" }, [], {
        textContent: "Home",
        isInteractive: true,
      }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());
    const navSegments = segments.filter((s) => s.type === "navigation");

    expect(navSegments.length).toBe(1);
    expect(navSegments[0]!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("returns empty array for DOM with only unknown elements", () => {
    // Div ohne Klassen, Rollen oder semantische Tags
    const dom = makeDomNode("div", {}, [
      makeDomNode("span", {}, [], { textContent: "Hello World" }),
    ]);

    const segments = segmentUI(dom, makeAriaAnalysis());

    // Keine Segmente — alles "unknown" mit confidence < 0.4
    expect(segments).toHaveLength(0);
  });
});

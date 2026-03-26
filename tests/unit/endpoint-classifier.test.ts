/**
 * P2 — Endpoint-Classifier Heuristik-Tests
 *
 * Testet alle 6 HeuristicRules, inferAffordances und Edge Cases.
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  classifyEndpoint,
  inferAffordances,
} from "../../src/semantic/endpoint-classifier.js";
import type { DomNode, UISegment } from "../../shared_interfaces.js";
import type { EndpointCandidate } from "../../src/semantic/types.js";

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

function makeSegment(
  nodes: DomNode[],
  type: string = "unknown",
): UISegment {
  return {
    id: randomUUID(),
    type: type as UISegment["type"],
    confidence: 0.8,
    boundingBox: { x: 0, y: 0, width: 800, height: 200 },
    nodes,
    interactiveElementCount: 1,
  };
}

function makeCandidate(
  type: string,
  confidence: number = 0.8,
): EndpointCandidate {
  return {
    type,
    label: `Test ${type}`,
    description: `Test endpoint for ${type}`,
    confidence,
    anchors: [{ selector: "div" }],
    affordances: [
      { type: "click", expectedOutcome: "Action", reversible: true },
    ],
    reasoning: "test reasoning",
  };
}

// ============================================================================
// Heuristic Rules
// ============================================================================

describe("Heuristic Rules", () => {
  describe("password-field-implies-auth", () => {
    it("corrects non-auth type to 'auth' when form has password input", () => {
      const nodes = [
        makeDomNode("form", {}, [
          makeDomNode("input", { type: "email" }),
          makeDomNode("input", { type: "password" }),
        ]),
      ];
      const result = classifyEndpoint(makeCandidate("form"), makeSegment(nodes));

      expect(result.correctedType).toBe("auth");
      expect(result.heuristicConfidence).toBe(0.85);
    });

    it("boosts confidence when LLM already says 'auth'", () => {
      const nodes = [
        makeDomNode("form", {}, [
          makeDomNode("input", { type: "password" }),
        ]),
      ];
      const result = classifyEndpoint(makeCandidate("auth"), makeSegment(nodes));

      expect(result.correctedType).toBeUndefined();
      expect(result.heuristicConfidence).toBe(0.9);
    });

    it("finds password input in nested children", () => {
      const nodes = [
        makeDomNode("form", {}, [
          makeDomNode("div", {}, [
            makeDomNode("div", {}, [
              makeDomNode("input", { type: "password" }),
            ]),
          ]),
        ]),
      ];
      const result = classifyEndpoint(
        makeCandidate("form"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("auth");
    });
  });

  describe("price-with-buy-button-implies-checkout", () => {
    it("corrects to 'checkout' when price and buy button present", () => {
      const nodes = [
        makeDomNode("div", {}, [
          makeDomNode("span", {}, [], { textContent: "$49.99" }),
          makeDomNode("button", {}, [], { textContent: "Add to Cart" }),
        ]),
      ];
      const result = classifyEndpoint(
        makeCandidate("commerce"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("checkout");
    });

    it("detects Euro price format", () => {
      const nodes = [
        makeDomNode("div", {}, [
          makeDomNode("span", {}, [], { textContent: "€29,99" }),
          makeDomNode("button", {}, [], { textContent: "Purchase" }),
        ]),
      ];
      const result = classifyEndpoint(
        makeCandidate("commerce"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("checkout");
    });

    it("does NOT trigger with price but no buy button", () => {
      const nodes = [
        makeDomNode("div", {}, [
          makeDomNode("span", {}, [], { textContent: "$49.99" }),
          makeDomNode("span", {}, [], { textContent: "Item description" }),
        ]),
      ];
      const result = classifyEndpoint(
        makeCandidate("commerce"),
        makeSegment(nodes),
      );
      expect(result.correctedType).not.toBe("checkout");
    });
  });

  describe("search-input-implies-search", () => {
    it("corrects to 'search' when input[type=search] present", () => {
      const nodes = [
        makeDomNode("div", {}, [
          makeDomNode("input", { type: "search" }),
        ]),
      ];
      const result = classifyEndpoint(
        makeCandidate("form"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("search");
    });

    it("corrects to 'search' when role='search' present", () => {
      const nodes = [makeDomNode("div", { role: "search" })];
      const result = classifyEndpoint(
        makeCandidate("form"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("search");
    });

    it("boosts confidence when LLM already says 'search'", () => {
      const nodes = [
        makeDomNode("div", {}, [
          makeDomNode("input", { type: "search" }),
        ]),
      ];
      const result = classifyEndpoint(
        makeCandidate("search"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBeUndefined();
      expect(result.heuristicConfidence).toBe(0.9);
    });
  });

  describe("nav-root-implies-navigation", () => {
    it("corrects to 'navigation' when <nav> element present", () => {
      const nodes = [makeDomNode("nav")];
      const result = classifyEndpoint(
        makeCandidate("content"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("navigation");
    });

    it("corrects to 'navigation' when role='navigation' present", () => {
      const nodes = [makeDomNode("div", { role: "navigation" })];
      const result = classifyEndpoint(
        makeCandidate("content"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("navigation");
    });
  });

  describe("chat-widget-implies-support", () => {
    it("corrects to 'support' when 'Live Chat' text found", () => {
      const nodes = [
        makeDomNode("div", {}, [], { textContent: "Live Chat with us" }),
      ];
      const result = classifyEndpoint(
        makeCandidate("content"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("support");
    });

    it("corrects to 'support' when 'Start Chat' text found", () => {
      const nodes = [
        makeDomNode("div", {}, [], { textContent: "Start Chat" }),
      ];
      const result = classifyEndpoint(
        makeCandidate("content"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("support");
    });

    it("corrects to 'support' when chat-widget class found", () => {
      const nodes = [
        makeDomNode("div", { class: "chat-widget-container" }),
      ];
      const result = classifyEndpoint(
        makeCandidate("content"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("support");
    });

    it("detects intercom/crisp class patterns", () => {
      const nodes = [makeDomNode("div", { class: "intercom-launcher" })];
      const result = classifyEndpoint(
        makeCandidate("content"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("support");
    });
  });

  describe("cart-class-implies-checkout", () => {
    it("corrects to 'checkout' when class contains 'cart'", () => {
      const nodes = [makeDomNode("div", { class: "shopping-cart" })];
      const result = classifyEndpoint(
        makeCandidate("content"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("checkout");
    });

    it("corrects to 'checkout' when class contains 'basket'", () => {
      const nodes = [makeDomNode("div", { class: "basket-summary" })];
      const result = classifyEndpoint(
        makeCandidate("content"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("checkout");
    });

    it("matches when segment type is already 'checkout'", () => {
      const nodes = [makeDomNode("div")];
      const result = classifyEndpoint(
        makeCandidate("commerce"),
        makeSegment(nodes, "checkout"),
      );
      expect(result.correctedType).toBe("checkout");
    });

    it("detects 'checkout' class in nested children", () => {
      const nodes = [
        makeDomNode("div", {}, [
          makeDomNode("span", { class: "checkout-btn" }),
        ]),
      ];
      const result = classifyEndpoint(
        makeCandidate("content"),
        makeSegment(nodes),
      );
      expect(result.correctedType).toBe("checkout");
    });
  });
});

// ============================================================================
// Risk Levels
// ============================================================================

describe("Risk Level Assignment", () => {
  it.each([
    ["auth", "high"],
    ["checkout", "high"],
    ["commerce", "high"],
    ["form", "medium"],
    ["consent", "medium"],
    ["settings", "medium"],
    ["navigation", "low"],
    ["content", "low"],
    ["search", "low"],
    ["media", "low"],
    ["social", "low"],
    ["support", "low"],
  ] as const)("assigns '%s' risk to '%s' type", (type, expectedRisk) => {
    const nodes = [makeDomNode("div")];
    const result = classifyEndpoint(
      makeCandidate(type),
      makeSegment(nodes),
    );
    expect(result.riskLevel).toBe(expectedRisk);
  });

  it("falls back to 'medium' for unknown types", () => {
    const result = classifyEndpoint(
      makeCandidate("some-unknown-type"),
      makeSegment([makeDomNode("div")]),
    );
    expect(result.riskLevel).toBe("medium");
  });
});

// ============================================================================
// Combined Confidence
// ============================================================================

describe("Combined Confidence Calculation", () => {
  it("calculates weighted average: LLM * 0.6 + heuristic * 0.4", () => {
    // LLM says auth (confidence 0.9), heuristic agrees (0.9)
    const nodes = [
      makeDomNode("form", {}, [
        makeDomNode("input", { type: "password" }),
      ]),
    ];
    const result = classifyEndpoint(makeCandidate("auth", 0.9), makeSegment(nodes));
    // 0.9 * 0.6 + 0.9 * 0.4 = 0.54 + 0.36 = 0.9
    expect(result.combinedConfidence).toBeCloseTo(0.9, 2);
  });

  it("uses 0.85 heuristicConfidence when heuristic corrects LLM", () => {
    const nodes = [
      makeDomNode("form", {}, [
        makeDomNode("input", { type: "password" }),
      ]),
    ];
    const result = classifyEndpoint(makeCandidate("form", 0.7), makeSegment(nodes));
    // 0.7 * 0.6 + 0.85 * 0.4 = 0.42 + 0.34 = 0.76
    expect(result.heuristicConfidence).toBe(0.85);
    expect(result.combinedConfidence).toBeCloseTo(0.76, 2);
  });

  it("uses 0.5 fallback when no heuristic matches", () => {
    const result = classifyEndpoint(
      makeCandidate("content", 0.8),
      makeSegment([makeDomNode("div")]),
    );
    // 0.8 * 0.6 + 0.5 * 0.4 = 0.48 + 0.20 = 0.68
    expect(result.heuristicConfidence).toBe(0.5);
    expect(result.combinedConfidence).toBeCloseTo(0.68, 2);
  });

  it("caps combined confidence at 1.0", () => {
    const nodes = [
      makeDomNode("form", {}, [
        makeDomNode("input", { type: "password" }),
      ]),
    ];
    const result = classifyEndpoint(makeCandidate("auth", 1.0), makeSegment(nodes));
    expect(result.combinedConfidence).toBeLessThanOrEqual(1.0);
  });
});

// ============================================================================
// inferAffordances
// ============================================================================

describe("inferAffordances", () => {
  it("infers 'fill' from text input with placeholder", () => {
    const nodes = [
      makeDomNode("input", { type: "text", placeholder: "Enter name" }),
    ];
    const affordances = inferAffordances(
      makeCandidate("form"),
      makeSegment(nodes),
    );
    const fill = affordances.find((a) => a.type === "fill");
    expect(fill).toBeDefined();
    expect(fill!.expectedOutcome).toBe("Enter name");
    expect(fill!.reversible).toBe(true);
    expect(fill!.requiresConfirmation).toBe(false);
  });

  it("infers 'fill' from textarea", () => {
    const nodes = [
      makeDomNode("textarea", { placeholder: "Write message" }),
    ];
    const affordances = inferAffordances(
      makeCandidate("form"),
      makeSegment(nodes),
    );
    const fill = affordances.find((a) => a.type === "fill");
    expect(fill).toBeDefined();
    expect(fill!.expectedOutcome).toBe("Write message");
  });

  it("infers 'submit' from input[type=submit]", () => {
    const nodes = [
      makeDomNode("input", { type: "submit" }, [], {
        textContent: "Submit Form",
      }),
    ];
    const affordances = inferAffordances(
      makeCandidate("form"),
      makeSegment(nodes),
    );
    const submit = affordances.find((a) => a.type === "submit");
    expect(submit).toBeDefined();
  });

  it("infers 'click' from button element", () => {
    const nodes = [
      makeDomNode("button", {}, [], { textContent: "Click Me" }),
    ];
    const affordances = inferAffordances(
      makeCandidate("form"),
      makeSegment(nodes),
    );
    const click = affordances.find((a) => a.type === "click");
    expect(click).toBeDefined();
    expect(click!.expectedOutcome).toBe("Click Me");
  });

  it("infers 'navigate' from anchor element", () => {
    const nodes = [
      makeDomNode("a", { href: "/about" }, [], { textContent: "About Us" }),
    ];
    const affordances = inferAffordances(
      makeCandidate("navigation"),
      makeSegment(nodes),
    );
    const nav = affordances.find((a) => a.type === "navigate");
    expect(nav).toBeDefined();
    expect(nav!.expectedOutcome).toBe("About Us");
    expect(nav!.sideEffects).toContain("navigation");
  });

  it("infers 'toggle' from checkbox", () => {
    const nodes = [
      makeDomNode("input", {
        type: "checkbox",
        "aria-label": "Remember me",
      }),
    ];
    const affordances = inferAffordances(
      makeCandidate("form"),
      makeSegment(nodes),
    );
    const toggle = affordances.find((a) => a.type === "toggle");
    expect(toggle).toBeDefined();
    expect(toggle!.expectedOutcome).toBe("Remember me");
    expect(toggle!.reversible).toBe(true);
  });

  it("infers 'toggle' from radio button", () => {
    const nodes = [
      makeDomNode("input", { type: "radio", "aria-label": "Option A" }),
    ];
    const affordances = inferAffordances(
      makeCandidate("form"),
      makeSegment(nodes),
    );
    const toggle = affordances.find((a) => a.type === "toggle");
    expect(toggle).toBeDefined();
  });

  it("infers 'select' from dropdown", () => {
    const nodes = [
      makeDomNode("select", { "aria-label": "Choose country" }),
    ];
    const affordances = inferAffordances(
      makeCandidate("form"),
      makeSegment(nodes),
    );
    const select = affordances.find((a) => a.type === "select");
    expect(select).toBeDefined();
    expect(select!.expectedOutcome).toBe("Choose country");
  });

  it("infers 'upload' from file input", () => {
    const nodes = [makeDomNode("input", { type: "file" })];
    const affordances = inferAffordances(
      makeCandidate("form"),
      makeSegment(nodes),
    );
    const upload = affordances.find((a) => a.type === "upload");
    expect(upload).toBeDefined();
    expect(upload!.reversible).toBe(false);
    expect(upload!.requiresConfirmation).toBe(true);
  });

  it("marks high-risk types with sideEffects and requiresConfirmation", () => {
    const nodes = [
      makeDomNode("button", {}, [], { textContent: "Buy Now" }),
    ];
    const affordances = inferAffordances(
      makeCandidate("checkout"),
      makeSegment(nodes),
    );
    const click = affordances.find((a) => a.type === "click");
    expect(click).toBeDefined();
    expect(click!.requiresConfirmation).toBe(true);
    expect(click!.sideEffects).toContain("state_change");
    expect(click!.reversible).toBe(false);
  });

  it("deduplicates affordances with same type + outcome", () => {
    const nodes = [
      makeDomNode("div", {}, [
        makeDomNode("a", { href: "/a" }, [], { textContent: "Same Link" }),
        makeDomNode("a", { href: "/b" }, [], { textContent: "Same Link" }),
      ]),
    ];
    const affordances = inferAffordances(
      makeCandidate("navigation"),
      makeSegment(nodes),
    );
    const navAffordances = affordances.filter(
      (a) => a.type === "navigate" && a.expectedOutcome === "Same Link",
    );
    expect(navAffordances).toHaveLength(1);
  });

  it("skips hidden inputs", () => {
    const nodes = [makeDomNode("input", { type: "hidden" })];
    const affordances = inferAffordances(
      makeCandidate("form"),
      makeSegment(nodes),
    );
    expect(affordances).toHaveLength(0);
  });

  it("returns empty array for segment with no interactive nodes", () => {
    const nodes = [
      makeDomNode("div", {}, [
        makeDomNode("p", {}, [], { textContent: "Just text" }),
      ]),
    ];
    const affordances = inferAffordances(
      makeCandidate("content"),
      makeSegment(nodes),
    );
    expect(affordances).toHaveLength(0);
  });

  it("handles segment with empty nodes array", () => {
    const affordances = inferAffordances(
      makeCandidate("content"),
      makeSegment([]),
    );
    expect(affordances).toHaveLength(0);
  });

  it("collects affordances from deeply nested children", () => {
    const nodes = [
      makeDomNode("div", {}, [
        makeDomNode("div", {}, [
          makeDomNode("div", {}, [
            makeDomNode("button", {}, [], { textContent: "Deep Button" }),
          ]),
        ]),
      ]),
    ];
    const affordances = inferAffordances(
      makeCandidate("form"),
      makeSegment(nodes),
    );
    const click = affordances.find((a) => a.type === "click");
    expect(click).toBeDefined();
    expect(click!.expectedOutcome).toBe("Deep Button");
  });
});

// ============================================================================
// Target.com-Fix: Mixed-Segment Heuristik (R15)
// ============================================================================

describe("Mixed-Segment Heuristik (Target.com-Fix)", () => {
  /**
   * Hilfsfunktion: Erzeugt einen Kandidaten mit spezifischen Anchor-Informationen.
   * Simuliert Endpoints wie sie aus dem LLM oder einer vorherigen Pipeline-Stufe kommen.
   */
  function makeCandidateWithAnchors(
    type: string,
    label: string,
    description: string,
    anchors: Array<{
      selector?: string;
      ariaRole?: string;
      ariaLabel?: string;
      textContent?: string;
    }> = [{ selector: "div" }],
    confidence: number = 0.8,
  ): EndpointCandidate {
    return {
      type,
      label,
      description,
      confidence,
      anchors,
      affordances: [
        { type: "click", expectedOutcome: "Action", reversible: true },
      ],
      reasoning: "test reasoning",
    };
  }

  /**
   * Erzeugt ein Header-Segment wie es bei Target.com vorkommt:
   * - Search-Input (type=search oder role=search)
   * - Cart-Link/Button
   * - Sign-In-Link
   * - Navigation-Links (Categories, etc.)
   */
  function makeTargetHeaderSegment(): UISegment {
    const nodes = [
      // Search-Bereich
      makeDomNode("div", { role: "search" }, [
        makeDomNode("input", { type: "search", placeholder: "Search Target" }),
        makeDomNode("button", {}, [], { textContent: "Search" }),
      ]),
      // Cart-Bereich
      makeDomNode("a", { href: "/cart", class: "cart-icon" }, [], {
        textContent: "Cart",
      }),
      // Auth-Bereich
      makeDomNode("a", { href: "/account", class: "sign-in-link" }, [], {
        textContent: "Sign In",
      }),
      // Navigation-Bereich
      makeDomNode("a", { href: "/categories" }, [], {
        textContent: "Categories",
      }),
      makeDomNode("a", { href: "/deals" }, [], {
        textContent: "Deals",
      }),
    ];
    return makeSegment(nodes, "header");
  }

  it("does NOT override cart endpoint to 'search' in a segment with search input", () => {
    const segment = makeTargetHeaderSegment();
    const cartCandidate = makeCandidateWithAnchors(
      "commerce",
      "Cart",
      "Shopping cart with items",
      [{ selector: "a.cart-icon", textContent: "Cart" }],
    );

    const result = classifyEndpoint(cartCandidate, segment);

    // search-input-implies-search darf NICHT greifen fuer den Cart-Kandidaten
    expect(result.correctedType).not.toBe("search");
    // Der cart-class-implies-checkout Regel sollte stattdessen greifen
    // (weil das Segment cart-Klassen enthaelt)
    expect(result.correctedType).toBe("checkout");
  });

  it("does NOT override auth endpoint to 'search' in a segment with search input", () => {
    const segment = makeTargetHeaderSegment();
    const authCandidate = makeCandidateWithAnchors(
      "navigation",
      "Sign In",
      "Sign in to your account",
      [{ selector: "a.sign-in-link", textContent: "Sign In" }],
    );

    const result = classifyEndpoint(authCandidate, segment);

    // search-input-implies-search darf NICHT greifen fuer den Auth-Kandidaten
    expect(result.correctedType).not.toBe("search");
  });

  it("correctly classifies search endpoint as 'search' in a mixed segment", () => {
    const segment = makeTargetHeaderSegment();
    const searchCandidate = makeCandidateWithAnchors(
      "form",
      "Search",
      "Search products on Target",
      [{ selector: "input[type=search]", ariaRole: "search" }],
    );

    const result = classifyEndpoint(searchCandidate, segment);

    // search-input-implies-search SOLL greifen fuer den Search-Kandidaten
    expect(result.correctedType).toBe("search");
  });

  it("Target.com full header: each endpoint gets correct type", () => {
    const segment = makeTargetHeaderSegment();

    // Simuliere 4 Endpoints wie sie im Header vorkommen wuerden
    const searchResult = classifyEndpoint(
      makeCandidateWithAnchors(
        "form",
        "Search Target",
        "Find products",
        [{ selector: "input[type=search]" }],
      ),
      segment,
    );
    const cartResult = classifyEndpoint(
      makeCandidateWithAnchors(
        "commerce",
        "Cart",
        "View shopping cart",
        [{ selector: "a.cart-icon", textContent: "Cart" }],
      ),
      segment,
    );
    const signInResult = classifyEndpoint(
      makeCandidateWithAnchors(
        "navigation",
        "Sign In",
        "Sign in to your Target account",
        [{ selector: "a.sign-in-link", textContent: "Sign In" }],
      ),
      segment,
    );
    const categoriesResult = classifyEndpoint(
      makeCandidateWithAnchors(
        "navigation",
        "Categories",
        "Browse product categories",
        [{ selector: "a", textContent: "Categories" }],
      ),
      segment,
    );

    // Search → search (korrekt)
    expect(searchResult.correctedType).toBe("search");

    // Cart → checkout (nicht search!)
    expect(cartResult.correctedType).toBe("checkout");
    expect(cartResult.correctedType).not.toBe("search");

    // Sign In → NICHT search (Nav-Root oder fallback, aber nicht search)
    expect(signInResult.correctedType).not.toBe("search");

    // Categories → NICHT search (navigation oder fallback)
    expect(categoriesResult.correctedType).not.toBe("search");
  });

  it("candidate with no conflicting context still gets 'search' in search segment", () => {
    const nodes = [
      makeDomNode("div", { role: "search" }, [
        makeDomNode("input", { type: "search" }),
      ]),
    ];
    const segment = makeSegment(nodes);

    // Generischer Kandidat ohne spezifischen Kontext
    const genericCandidate = makeCandidateWithAnchors(
      "form",
      "Input Field",
      "A text input field",
      [{ selector: "div" }],
    );

    const result = classifyEndpoint(genericCandidate, segment);

    // Ohne konfligierenden Kontext soll search trotzdem greifen
    expect(result.correctedType).toBe("search");
  });

  it("candidate with 'add to cart' label is classified as commerce, not search", () => {
    const segment = makeTargetHeaderSegment();
    const addToCartCandidate = makeCandidateWithAnchors(
      "form",
      "Add to Cart",
      "Add product to shopping cart",
      [{ selector: "button", textContent: "Add to Cart" }],
    );

    const result = classifyEndpoint(addToCartCandidate, segment);
    expect(result.correctedType).toBe("commerce");
    expect(result.correctedType).not.toBe("search");
    expect(result.correctedType).not.toBe("checkout");
  });

  it("candidate with 'wishlist' label is not overridden to search", () => {
    const nodes = [
      makeDomNode("div", { role: "search" }, [
        makeDomNode("input", { type: "search" }),
      ]),
      makeDomNode("a", { href: "/wishlist" }, [], {
        textContent: "Wish List",
      }),
    ];
    const segment = makeSegment(nodes);

    const wishlistCandidate = makeCandidateWithAnchors(
      "navigation",
      "Wish List",
      "View saved favorites",
      [{ selector: "a", textContent: "Wish List" }],
    );

    const result = classifyEndpoint(wishlistCandidate, segment);
    expect(result.correctedType).not.toBe("search");
  });
});

// ============================================================================
// Settings vs Search — Fehlklassifizierung verhindern
// ============================================================================

describe("Settings Controls (not Search)", () => {
  function makeCandidateWithAnchors(
    type: string,
    label: string,
    description: string,
    anchors: Array<{
      selector?: string;
      ariaRole?: string;
      ariaLabel?: string;
      textContent?: string;
    }> = [{ selector: "div" }],
    confidence: number = 0.8,
  ): EndpointCandidate {
    return {
      type,
      label,
      description,
      confidence,
      anchors,
      affordances: [
        { type: "click", expectedOutcome: "Action", reversible: true },
      ],
      reasoning: "test reasoning",
    };
  }

  it("corrects 'search' to 'settings' when candidate mentions font-size", () => {
    const nodes = [makeDomNode("select", { "aria-label": "Font Size" })];
    const candidate = makeCandidateWithAnchors(
      "search",
      "Font Size Selector",
      "Select font size for the page",
      [{ selector: "select", ariaLabel: "Font Size" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    expect(result.correctedType).toBe("settings");
  });

  it("corrects 'search' to 'settings' when candidate mentions theme", () => {
    const nodes = [makeDomNode("input", { type: "checkbox", "aria-label": "Dark Mode" })];
    const candidate = makeCandidateWithAnchors(
      "search",
      "Theme Toggle",
      "Toggle dark mode theme",
      [{ selector: "input[type=checkbox]", ariaLabel: "Dark Mode" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    expect(result.correctedType).toBe("settings");
  });

  it("does NOT correct to 'settings' for standalone language selector (language selectors are navigation)", () => {
    const nodes = [makeDomNode("select", { "aria-label": "Language" })];
    const candidate = makeCandidateWithAnchors(
      "form",
      "Language Selector",
      "Choose display language",
      [{ selector: "select", ariaLabel: "Language" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    // Language/locale selectors are typically navigation, not settings
    expect(result.correctedType).not.toBe("settings");
  });

  it("corrects to 'settings' for dark-mode toggle", () => {
    const nodes = [makeDomNode("div")];
    const candidate = makeCandidateWithAnchors(
      "form",
      "Dark Mode Switch",
      "Toggle dark mode",
      [{ selector: "button", textContent: "Dark Mode" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    expect(result.correctedType).toBe("settings");
  });

  it("corrects to 'settings' for appearance controls", () => {
    const nodes = [makeDomNode("div")];
    const candidate = makeCandidateWithAnchors(
      "form",
      "Appearance Options",
      "Customize appearance",
      [{ selector: "div", ariaLabel: "Appearance" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    expect(result.correctedType).toBe("settings");
  });

  it("does NOT reclassify when candidate also mentions search", () => {
    const nodes = [makeDomNode("div")];
    const candidate = makeCandidateWithAnchors(
      "search",
      "Search Theme Library",
      "Find themes in the library",
      [{ selector: "input", ariaLabel: "Search themes" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    // search-input-implies-search oder fallback, aber NICHT settings
    expect(result.correctedType).not.toBe("settings");
  });

  it("does NOT reclassify a real search candidate", () => {
    const nodes = [
      makeDomNode("div", { role: "search" }, [
        makeDomNode("input", { type: "search", placeholder: "Search..." }),
      ]),
    ];
    const candidate = makeCandidateWithAnchors(
      "form",
      "Search Products",
      "Search for products",
      [{ selector: "input[type=search]" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    expect(result.correctedType).toBe("search");
  });
});

// ============================================================================
// Commerce: Add-to-Cart Erkennung
// ============================================================================

describe("Add-to-Cart implies Commerce", () => {
  function makeCandidateWithAnchors(
    type: string,
    label: string,
    description: string,
    anchors: Array<{
      selector?: string;
      ariaRole?: string;
      ariaLabel?: string;
      textContent?: string;
    }> = [{ selector: "div" }],
    confidence: number = 0.8,
  ): EndpointCandidate {
    return {
      type,
      label,
      description,
      confidence,
      anchors,
      affordances: [
        { type: "click", expectedOutcome: "Action", reversible: true },
      ],
      reasoning: "test reasoning",
    };
  }

  it("corrects to 'commerce' when candidate says 'Add to Cart'", () => {
    const nodes = [makeDomNode("button", {}, [], { textContent: "Add to Cart" })];
    const candidate = makeCandidateWithAnchors(
      "form",
      "Add to Cart Button",
      "Add product to cart",
      [{ selector: "button", textContent: "Add to Cart" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    expect(result.correctedType).toBe("commerce");
  });

  it("corrects to 'commerce' when candidate says 'Add to Bag'", () => {
    const nodes = [makeDomNode("button", {}, [], { textContent: "Add to Bag" })];
    const candidate = makeCandidateWithAnchors(
      "form",
      "Add to Bag",
      "Add item to shopping bag",
      [{ selector: "button", textContent: "Add to Bag" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    expect(result.correctedType).toBe("commerce");
  });

  it("corrects to 'commerce' for German 'In den Warenkorb'", () => {
    const nodes = [makeDomNode("button", {}, [], { textContent: "In den Warenkorb" })];
    const candidate = makeCandidateWithAnchors(
      "form",
      "In den Warenkorb",
      "Produkt in den Warenkorb legen",
      [{ selector: "button", textContent: "In den Warenkorb" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    expect(result.correctedType).toBe("commerce");
  });

  it("corrects to 'commerce' for 'Buy Now'", () => {
    const nodes = [makeDomNode("button", {}, [], { textContent: "Buy Now" })];
    const candidate = makeCandidateWithAnchors(
      "content",
      "Buy Now Button",
      "Buy the product now",
      [{ selector: "button", textContent: "Buy Now" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    expect(result.correctedType).toBe("commerce");
  });

  it("corrects to 'commerce' for 'Jetzt Kaufen'", () => {
    const nodes = [makeDomNode("button", {}, [], { textContent: "Jetzt Kaufen" })];
    const candidate = makeCandidateWithAnchors(
      "content",
      "Jetzt Kaufen",
      "Produkt jetzt kaufen",
      [{ selector: "button", textContent: "Jetzt Kaufen" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    expect(result.correctedType).toBe("commerce");
  });

  it("does NOT correct generic 'Cart' link to commerce (stays checkout)", () => {
    const nodes = [makeDomNode("a", { href: "/cart" }, [], { textContent: "Cart" })];
    const candidate = makeCandidateWithAnchors(
      "navigation",
      "Cart",
      "View shopping cart",
      [{ selector: "a", textContent: "Cart" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    // cart-link-implies-checkout sollte greifen, NICHT add-to-cart-implies-commerce
    expect(result.correctedType).toBe("checkout");
  });

  it("commerce rule fires before checkout rule for 'Add to Cart'", () => {
    // Simuliert einen Mixed-Segment mit Cart-Klasse UND Add-to-Cart Button
    const nodes = [
      makeDomNode("div", { class: "product-cart" }, [
        makeDomNode("button", {}, [], { textContent: "Add to Cart" }),
      ]),
    ];
    const candidate = makeCandidateWithAnchors(
      "form",
      "Add to Cart",
      "Add to shopping cart",
      [{ selector: "button", textContent: "Add to Cart" }],
    );
    const result = classifyEndpoint(candidate, makeSegment(nodes));
    // Commerce sollte VOR checkout greifen
    expect(result.correctedType).toBe("commerce");
  });
});

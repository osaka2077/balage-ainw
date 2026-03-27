/**
 * Heuristic Recall Tests — Auth-Links, Pagination, Footer-Navigation
 *
 * Testet die neuen Heuristiken fuer bessere Endpoint-Erkennung:
 * - Gate 6: Auth-Link-Erkennung (einzelne a-Tags mit auth-Text)
 * - Gate 7: Pagination-Link-Erkennung (More/Next am Seitenende)
 * - Gate 8: Footer-Navigation-Erkennung (<footer> mit 5+ Links)
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  classifySegmentHeuristically,
  collectDomSignals,
  AUTH_LINK_PATTERN,
  PAGINATION_PATTERN,
} from "../../src/core/heuristic-analyzer.js";
import type { DomNode, UISegment } from "../../shared_interfaces.js";

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

function makeLink(text: string, href: string = "#"): DomNode {
  return makeDomNode("a", { href }, [], { textContent: text, isInteractive: true });
}

function makeSegment(
  nodes: DomNode[],
  type: string = "navigation",
  interactiveCount: number = 1,
): UISegment {
  return {
    id: randomUUID(),
    type: type as UISegment["type"],
    confidence: 0.8,
    boundingBox: { x: 0, y: 0, width: 800, height: 200 },
    nodes,
    interactiveElementCount: interactiveCount,
  };
}

/** Erzeugt einen vollstaendigen DOM-Baum als Kontext (fullDom-Parameter) */
function makeFullDom(nodes: DomNode[]): DomNode {
  return makeDomNode("html", {}, [
    makeDomNode("body", {}, nodes),
  ]);
}

/** Erzeugt N Filler-Nodes als DOM-Ballast (fuer Position-Berechnungen) */
function makeFillerNodes(count: number): DomNode[] {
  return Array.from({ length: count }, (_, i) =>
    makeDomNode("div", {}, [], { textContent: `content-${i}` }),
  );
}

// ============================================================================
// Auth-Link Detection (Gate 6)
// ============================================================================

describe("Auth-Link Detection (Gate 6)", () => {
  it("detects 'Sign Up' link as auth endpoint", () => {
    const nodes = [
      makeDomNode("nav", {}, [
        makeLink("Home"),
        makeLink("About"),
        makeLink("Sign Up", "/signup"),
      ]),
    ];
    const segment = makeSegment(nodes, "navigation", 3);
    const result = classifySegmentHeuristically(segment, makeFullDom(nodes));

    expect(result).not.toBeNull();
    expect(result!.type).toBe("auth");
    expect(result!.confidence).toBe(0.72);
    expect(result!.label).toContain("Sign-Up");
  });

  it("detects 'Register' link in navigation as auth endpoint", () => {
    const nodes = [
      makeDomNode("nav", {}, [
        makeLink("Products"),
        makeLink("Register", "/register"),
      ]),
    ];
    const segment = makeSegment(nodes, "navigation", 2);
    const result = classifySegmentHeuristically(segment, makeFullDom(nodes));

    expect(result).not.toBeNull();
    expect(result!.type).toBe("auth");
    expect(result!.confidence).toBe(0.72);
  });

  it("detects 'Join Now' link as auth endpoint", () => {
    const nodes = [
      makeDomNode("nav", {}, [
        makeLink("Join Now", "/join"),
      ]),
    ];
    const segment = makeSegment(nodes, "navigation", 1);
    const result = classifySegmentHeuristically(segment, makeFullDom(nodes));

    expect(result).not.toBeNull();
    expect(result!.type).toBe("auth");
  });

  it("detects 'Create Account' link as auth endpoint", () => {
    const nodes = [
      makeDomNode("nav", {}, [
        makeLink("Create Account", "/register"),
      ]),
    ];
    const segment = makeSegment(nodes, "navigation", 1);
    const result = classifySegmentHeuristically(segment, makeFullDom(nodes));

    expect(result).not.toBeNull();
    expect(result!.type).toBe("auth");
  });

  it("does NOT create duplicate auth when segment already has password input", () => {
    const nodes = [
      makeDomNode("form", {}, [
        makeDomNode("input", { type: "email", name: "email" }),
        makeDomNode("input", { type: "password" }),
        makeLink("Sign Up", "/signup"),
      ]),
    ];
    const segment = makeSegment(nodes, "form", 3);
    const result = classifySegmentHeuristically(segment, makeFullDom(nodes));

    // Sollte als auth erkannt werden, aber durch Gate 1 (Password), nicht Gate 6
    expect(result).not.toBeNull();
    expect(result!.type).toBe("auth");
    expect(result!.confidence).toBe(0.90); // Gate 1 confidence, nicht 0.72
  });

  it("does NOT create auth for 'Sign in with Google' (SSO pattern)", () => {
    const nodes = [
      makeDomNode("div", {}, [
        makeLink("Sign in with Google", "/oauth/google"),
        makeLink("Continue with GitHub", "/oauth/github"),
      ]),
    ];
    const segment = makeSegment(nodes, "content", 2);
    const fullDom = makeFullDom(nodes);

    // SSO-Links werden durch SSO_LINK_PATTERN ausgefiltert
    const signals = collectDomSignals(
      makeDomNode("div", {}, nodes, { isVisible: true, isInteractive: false }),
    );
    expect(signals.authLinkTexts).toHaveLength(0);
  });

  it("does NOT create auth for SSO links in recognized SSO segment", () => {
    // Segment hat bereits Email-Input (SSO-Bereich mit "continue with" links)
    const nodes = [
      makeDomNode("form", {}, [
        makeDomNode("input", { type: "email" }),
        makeLink("Sign in with Google", "/oauth/google"),
      ]),
    ];
    const segment = makeSegment(nodes, "form", 2);
    const result = classifySegmentHeuristically(segment, makeFullDom(nodes));

    // Kein Ergebnis durch Gate 6 weil hasEmailInput === true
    // Gate 1 triggert auch nicht (kein Password)
    // Gate 2 triggert auch nicht (kein Search)
    // → entweder null oder ein anderer Gate
    if (result !== null) {
      // Falls ein anderer Gate triggert, darf es NICHT Gate 6 sein (confidence 0.72)
      expect(result.confidence).not.toBe(0.72);
    }
  });

  it("detects 'Log In' link as auth endpoint with login label", () => {
    const nodes = [
      makeDomNode("nav", {}, [
        makeLink("Log In", "/login"),
      ]),
    ];
    const segment = makeSegment(nodes, "navigation", 1);
    const result = classifySegmentHeuristically(segment, makeFullDom(nodes));

    expect(result).not.toBeNull();
    expect(result!.type).toBe("auth");
    expect(result!.label).toContain("Login");
  });

  it("detects German 'Anmelden' link as auth endpoint", () => {
    const nodes = [
      makeDomNode("nav", {}, [
        makeLink("Anmelden", "/login"),
      ]),
    ];
    const segment = makeSegment(nodes, "navigation", 1);
    const result = classifySegmentHeuristically(segment, makeFullDom(nodes));

    expect(result).not.toBeNull();
    expect(result!.type).toBe("auth");
  });
});

// ============================================================================
// Pagination Detection (Gate 7)
// ============================================================================

describe("Pagination Detection (Gate 7)", () => {
  it("detects 'More' link at end of page as navigation", () => {
    // Erzeuge DOM mit vielen Nodes, "More" Link am Ende (letztes 20%)
    const fillerNodes = makeFillerNodes(20);
    const moreLink = makeLink("More", "/page/2");
    const allNodes = [...fillerNodes, moreLink];

    const segment = makeSegment(allNodes, "content", 1);
    const result = classifySegmentHeuristically(segment, makeFullDom(allNodes));

    expect(result).not.toBeNull();
    expect(result!.type).toBe("navigation");
    expect(result!.confidence).toBe(0.65);
  });

  it("detects 'Next Page' link at end as navigation", () => {
    const fillerNodes = makeFillerNodes(15);
    const nextLink = makeLink("Next Page", "/page/2");
    const allNodes = [...fillerNodes, nextLink];

    const segment = makeSegment(allNodes, "content", 1);
    const result = classifySegmentHeuristically(segment, makeFullDom(allNodes));

    expect(result).not.toBeNull();
    expect(result!.type).toBe("navigation");
    expect(result!.confidence).toBe(0.65);
  });

  it("detects 'Load More' button link as pagination", () => {
    const fillerNodes = makeFillerNodes(10);
    const loadMore = makeLink("Load More", "#");
    const allNodes = [...fillerNodes, loadMore];

    const segment = makeSegment(allNodes, "content", 1);
    const result = classifySegmentHeuristically(segment, makeFullDom(allNodes));

    expect(result).not.toBeNull();
    expect(result!.type).toBe("navigation");
  });

  it("does NOT detect 'More' link in the middle of content", () => {
    // "More" Link am Anfang des DOM (nicht im letzten 20%)
    const moreLink = makeLink("More details", "/details");
    const fillerNodes = makeFillerNodes(30);
    const allNodes = [moreLink, ...fillerNodes];

    const segment = makeSegment(allNodes, "content", 1);
    const result = classifySegmentHeuristically(segment, makeFullDom(allNodes));

    // Sollte null sein oder nicht als navigation durch Gate 7
    if (result !== null) {
      // Falls etwas erkannt wird, ist es nicht durch Pagination
      expect(result.confidence).not.toBe(0.65);
    }
  });

  it("detects German 'Weitere' pagination link", () => {
    const fillerNodes = makeFillerNodes(15);
    const weitereLink = makeLink("Weitere", "/seite/2");
    const allNodes = [...fillerNodes, weitereLink];

    const segment = makeSegment(allNodes, "content", 1);
    const result = classifySegmentHeuristically(segment, makeFullDom(allNodes));

    expect(result).not.toBeNull();
    expect(result!.type).toBe("navigation");
  });
});

// ============================================================================
// Footer Navigation Detection (Gate 8)
// ============================================================================

describe("Footer Navigation Detection (Gate 8)", () => {
  it("detects <footer> with 5+ links as navigation", () => {
    const footerLinks = Array.from({ length: 6 }, (_, i) =>
      makeLink(`Footer Link ${i}`, `/footer/${i}`),
    );
    const nodes = [
      makeDomNode("footer", {}, footerLinks),
    ];
    const segment = makeSegment(nodes, "footer", 6);
    const result = classifySegmentHeuristically(segment, makeFullDom(nodes));

    expect(result).not.toBeNull();
    expect(result!.type).toBe("navigation");
    expect(result!.confidence).toBe(0.68);
  });

  it("detects role='contentinfo' with 5+ links as navigation", () => {
    const footerLinks = Array.from({ length: 7 }, (_, i) =>
      makeLink(`Info Link ${i}`, `/info/${i}`),
    );
    const nodes = [
      makeDomNode("div", { role: "contentinfo" }, footerLinks),
    ];
    const segment = makeSegment(nodes, "footer", 7);
    const result = classifySegmentHeuristically(segment, makeFullDom(nodes));

    expect(result).not.toBeNull();
    expect(result!.type).toBe("navigation");
    expect(result!.confidence).toBe(0.68);
  });

  it("does NOT detect <footer> with only 2 links", () => {
    const nodes = [
      makeDomNode("footer", {}, [
        makeLink("Privacy", "/privacy"),
        makeLink("Terms", "/terms"),
      ]),
    ];
    const segment = makeSegment(nodes, "footer", 2);
    const result = classifySegmentHeuristically(segment, makeFullDom(nodes));

    // Kein Endpoint durch Gate 8 (unter 5-Link-Schwelle)
    if (result !== null) {
      expect(result.confidence).not.toBe(0.68);
    }
  });

  it("does NOT detect navigation when no <footer> element exists", () => {
    const nodes = [
      makeDomNode("div", {}, [
        makeLink("Link 1", "/1"),
        makeLink("Link 2", "/2"),
        makeLink("Link 3", "/3"),
        makeLink("Link 4", "/4"),
        makeLink("Link 5", "/5"),
      ]),
    ];
    const segment = makeSegment(nodes, "content", 5);

    // Sammle Signale und pruefe dass kein Footer erkannt wird
    const root = makeDomNode("div", {}, nodes, { isVisible: true, isInteractive: false });
    const signals = collectDomSignals(root);
    expect(signals.hasFooterElement).toBe(false);
    expect(signals.footerLinkCount).toBe(0);
  });

  it("correctly counts links inside nested footer structure", () => {
    const footerLinks = Array.from({ length: 5 }, (_, i) =>
      makeLink(`Col Link ${i}`, `/col/${i}`),
    );
    const nodes = [
      makeDomNode("footer", {}, [
        makeDomNode("div", { class: "footer-col" }, footerLinks.slice(0, 3)),
        makeDomNode("div", { class: "footer-col" }, footerLinks.slice(3)),
      ]),
    ];
    const segment = makeSegment(nodes, "footer", 5);
    const result = classifySegmentHeuristically(segment, makeFullDom(nodes));

    expect(result).not.toBeNull();
    expect(result!.type).toBe("navigation");
    expect(result!.confidence).toBe(0.68);
  });
});

// ============================================================================
// Signal Collection Tests
// ============================================================================

describe("collectDomSignals — new signal fields", () => {
  it("collects authLinkTexts for auth-relevant links", () => {
    const root = makeDomNode("nav", {}, [
      makeLink("Home"),
      makeLink("Sign Up", "/signup"),
      makeLink("Log In", "/login"),
    ]);
    const signals = collectDomSignals(root);

    expect(signals.authLinkTexts).toContain("Sign Up");
    expect(signals.authLinkTexts).toContain("Log In");
    expect(signals.authLinkTexts).not.toContain("Home");
  });

  it("excludes SSO links from authLinkTexts", () => {
    const root = makeDomNode("div", {}, [
      makeLink("Sign in with Google", "/oauth/google"),
      makeLink("Continue with GitHub", "/oauth/github"),
      makeLink("Log in with Facebook", "/oauth/fb"),
    ]);
    const signals = collectDomSignals(root);

    expect(signals.authLinkTexts).toHaveLength(0);
  });

  it("collects paginationLinks with position index", () => {
    const root = makeDomNode("div", {}, [
      ...makeFillerNodes(5),
      makeLink("Next Page", "/page/2"),
    ]);
    const signals = collectDomSignals(root);

    expect(signals.paginationLinks).toHaveLength(1);
    expect(signals.paginationLinks[0]!.text).toBe("Next Page");
    expect(signals.paginationLinks[0]!.nodeIndex).toBeGreaterThan(0);
  });

  it("tracks totalNodeCount for position calculations", () => {
    const root = makeDomNode("div", {}, [
      ...makeFillerNodes(10),
      makeLink("More", "/more"),
    ]);
    const signals = collectDomSignals(root);

    // 1 (root div) + 10 (filler divs) + 1 (link) = 12
    expect(signals.totalNodeCount).toBeGreaterThanOrEqual(12);
  });

  it("counts footerLinkCount accurately", () => {
    const root = makeDomNode("div", {}, [
      makeDomNode("footer", {}, [
        makeLink("A", "/a"),
        makeLink("B", "/b"),
        makeLink("C", "/c"),
      ]),
    ]);
    const signals = collectDomSignals(root);

    expect(signals.hasFooterElement).toBe(true);
    expect(signals.footerLinkCount).toBe(3);
  });
});

// ============================================================================
// Pattern Tests
// ============================================================================

describe("AUTH_LINK_PATTERN", () => {
  const positive = ["Sign Up", "sign up", "Register", "Create Account", "Join Now", "Sign In", "Log In", "Anmelden", "Registrieren", "Konto erstellen", "My Account"];
  const negative = ["Home", "Products", "About Us", "Contact", "Help", "Cart"];

  for (const text of positive) {
    it(`matches: "${text}"`, () => {
      expect(AUTH_LINK_PATTERN.test(text)).toBe(true);
    });
  }

  for (const text of negative) {
    it(`does not match: "${text}"`, () => {
      expect(AUTH_LINK_PATTERN.test(text)).toBe(false);
    });
  }
});

describe("PAGINATION_PATTERN", () => {
  const positive = ["Next", "More", "Next Page", "Load More", "Show More", "Page 2", "Weitere", "Seite 3"];
  const negative = ["Home", "Products", "About", "Contact"];

  for (const text of positive) {
    it(`matches: "${text}"`, () => {
      expect(PAGINATION_PATTERN.test(text)).toBe(true);
    });
  }

  for (const text of negative) {
    it(`does not match: "${text}"`, () => {
      expect(PAGINATION_PATTERN.test(text)).toBe(false);
    });
  }
});

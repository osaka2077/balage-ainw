/**
 * Segmenter ARIA & Web Component Tests — Round 9
 *
 * Tests fuer erweiterte interaktive Element-Erkennung:
 * ARIA-Rollen, tabindex, contenteditable, Custom Elements, Confidence-Boost.
 */

import { describe, it, expect } from "vitest";
import { parseDom } from "./dom-parser.js";
import { parseAria } from "./aria-parser.js";
import { segmentUI } from "./ui-segmenter.js";
import type { DomNode, AccessibilityNode } from "../../shared_interfaces.js";

// ============================================================================
// Helpers
// ============================================================================

/** Minimaler Accessibility Tree fuer Tests */
const MINIMAL_AX_TREE: AccessibilityNode = {
  role: "document",
  name: "Test Page",
  disabled: false,
  required: false,
  children: [],
};

/**
 * Hilfsfunktion: Parst einen DomNode und gibt die Segmente zurueck.
 * Spart Boilerplate in jedem Test.
 */
function getSegments(dom: DomNode) {
  const parsed = parseDom(dom);
  const aria = parseAria(parsed.root, MINIMAL_AX_TREE);
  return segmentUI(parsed.root, aria);
}

// ============================================================================
// 1. ARIA-Rollen: Interaktive Elemente
// ============================================================================

describe("Segmenter — ARIA Role Interactive Detection", () => {
  it("div[role='button'] wird als interaktiv gezaehlt", () => {
    const dom: DomNode = {
      tagName: "nav",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 0, y: 0, width: 1280, height: 60 },
      children: [
        {
          tagName: "div",
          attributes: { role: "button" },
          textContent: "Klick mich",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "a",
          attributes: { href: "/home" },
          textContent: "Home",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const navSegments = segments.filter((s) => s.type === "navigation");
    expect(navSegments.length).toBeGreaterThanOrEqual(1);
    // div[role=button] + a = 2 interaktive Elemente
    expect(navSegments[0]!.interactiveElementCount).toBe(2);
  });

  it("span[role='link'] wird als interaktiv gezaehlt", () => {
    const dom: DomNode = {
      tagName: "nav",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 0, y: 0, width: 1280, height: 60 },
      children: [
        {
          tagName: "span",
          attributes: { role: "link", tabindex: "0" },
          textContent: "Pseudo-Link",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const navSegments = segments.filter((s) => s.type === "navigation");
    expect(navSegments.length).toBeGreaterThanOrEqual(1);
    // span[role=link] wird als 1 interaktives Element gezaehlt
    expect(navSegments[0]!.interactiveElementCount).toBe(1);
  });

  it("div[role='textbox'] wird als interaktiv gezaehlt", () => {
    const dom: DomNode = {
      tagName: "form",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 100, y: 100, width: 400, height: 200 },
      children: [
        {
          tagName: "div",
          attributes: { role: "textbox", "aria-label": "Nachricht" },
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "button",
          attributes: { type: "submit" },
          textContent: "Senden",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const formSegments = segments.filter((s) => s.type === "form");
    expect(formSegments.length).toBeGreaterThanOrEqual(1);
    // div[role=textbox] + button = 2
    expect(formSegments[0]!.interactiveElementCount).toBe(2);
  });

  it("div[role='searchbox'] wird als interaktiv gezaehlt", () => {
    const dom: DomNode = {
      tagName: "div",
      attributes: { role: "search" },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 200, y: 10, width: 500, height: 50 },
      children: [
        {
          tagName: "div",
          attributes: { role: "searchbox", "aria-label": "Suche" },
          isVisible: true,
          isInteractive: false,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const searchSegments = segments.filter((s) => s.type === "search");
    expect(searchSegments.length).toBeGreaterThanOrEqual(1);
    expect(searchSegments[0]!.interactiveElementCount).toBe(1);
  });
});

// ============================================================================
// 2. Tabindex Detection
// ============================================================================

describe("Segmenter — Tabindex Detection", () => {
  it("span[tabindex='0'] wird als interaktiv gezaehlt", () => {
    const dom: DomNode = {
      tagName: "nav",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 0, y: 0, width: 1280, height: 60 },
      children: [
        {
          tagName: "span",
          attributes: { tabindex: "0" },
          textContent: "Klickbarer Span",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const navSegments = segments.filter((s) => s.type === "navigation");
    expect(navSegments.length).toBeGreaterThanOrEqual(1);
    expect(navSegments[0]!.interactiveElementCount).toBe(1);
  });

  it("span[tabindex='-1'] wird NICHT als interaktiv gezaehlt", () => {
    const dom: DomNode = {
      tagName: "nav",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 0, y: 0, width: 1280, height: 60 },
      children: [
        {
          tagName: "span",
          attributes: { tabindex: "-1" },
          textContent: "Programmatisch fokussierbar",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const navSegments = segments.filter((s) => s.type === "navigation");
    expect(navSegments.length).toBeGreaterThanOrEqual(1);
    // tabindex=-1 ist NICHT user-interaktiv
    expect(navSegments[0]!.interactiveElementCount).toBe(0);
  });
});

// ============================================================================
// 3. Contenteditable Detection
// ============================================================================

describe("Segmenter — Contenteditable Detection", () => {
  it("div[contenteditable='true'] wird als interaktiv gezaehlt", () => {
    const dom: DomNode = {
      tagName: "form",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 100, y: 100, width: 600, height: 300 },
      children: [
        {
          tagName: "div",
          attributes: { contenteditable: "true" },
          textContent: "Editierbarer Bereich",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "button",
          attributes: { type: "submit" },
          textContent: "Speichern",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const formSegments = segments.filter((s) => s.type === "form");
    expect(formSegments.length).toBeGreaterThanOrEqual(1);
    // div[contenteditable] + button = 2
    expect(formSegments[0]!.interactiveElementCount).toBe(2);
  });

  it("div[contenteditable=''] (leerer String) wird als interaktiv gezaehlt", () => {
    const dom: DomNode = {
      tagName: "form",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 100, y: 100, width: 600, height: 300 },
      children: [
        {
          tagName: "div",
          attributes: { contenteditable: "" },
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "button",
          attributes: {},
          textContent: "OK",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const formSegments = segments.filter((s) => s.type === "form");
    expect(formSegments.length).toBeGreaterThanOrEqual(1);
    expect(formSegments[0]!.interactiveElementCount).toBe(2);
  });
});

// ============================================================================
// 4. Custom Element Detection (Web Components)
// ============================================================================

describe("Segmenter — Custom Element Detection", () => {
  it("mwc-textfield Custom Element wird als interaktiv gezaehlt", () => {
    const dom: DomNode = {
      tagName: "form",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 100, y: 100, width: 400, height: 200 },
      children: [
        {
          tagName: "mwc-textfield",
          attributes: { label: "Name" },
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "button",
          attributes: { type: "submit" },
          textContent: "Submit",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const formSegments = segments.filter((s) => s.type === "form");
    expect(formSegments.length).toBeGreaterThanOrEqual(1);
    // mwc-textfield (suffix: -textfield) + button = 2
    expect(formSegments[0]!.interactiveElementCount).toBe(2);
  });

  it("fluent-button Custom Element wird als interaktiv gezaehlt", () => {
    const dom: DomNode = {
      tagName: "nav",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 0, y: 0, width: 1280, height: 60 },
      children: [
        {
          tagName: "fluent-button",
          attributes: {},
          textContent: "Aktion",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const navSegments = segments.filter((s) => s.type === "navigation");
    expect(navSegments.length).toBeGreaterThanOrEqual(1);
    // fluent-button (suffix: -button) = 1 interaktives Element
    expect(navSegments[0]!.interactiveElementCount).toBe(1);
  });

  it("sl-select Custom Element wird als interaktiv gezaehlt", () => {
    const dom: DomNode = {
      tagName: "form",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 100, y: 100, width: 400, height: 200 },
      children: [
        {
          tagName: "sl-select",
          attributes: { label: "Land" },
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "sl-button",
          attributes: {},
          textContent: "Weiter",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const formSegments = segments.filter((s) => s.type === "form");
    expect(formSegments.length).toBeGreaterThanOrEqual(1);
    // sl-select + sl-button = 2
    expect(formSegments[0]!.interactiveElementCount).toBe(2);
  });
});

// ============================================================================
// 5. Segment Type Classification
// ============================================================================

describe("Segmenter — Segment Type Classification (ARIA & Web Components)", () => {
  it("Segment mit role='search' wird als type 'search' klassifiziert", () => {
    const dom: DomNode = {
      tagName: "div",
      attributes: { role: "search" },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 200, y: 10, width: 500, height: 50 },
      children: [
        {
          tagName: "input",
          attributes: { type: "text", placeholder: "Suchen..." },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const searchSegments = segments.filter((s) => s.type === "search");
    expect(searchSegments.length).toBeGreaterThanOrEqual(1);
  });

  it("Segment mit role='navigation' wird als type 'navigation' klassifiziert", () => {
    const dom: DomNode = {
      tagName: "div",
      attributes: { role: "navigation", "aria-label": "Hauptmenue" },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 0, y: 0, width: 1280, height: 60 },
      children: [
        {
          tagName: "span",
          attributes: { role: "link", tabindex: "0" },
          textContent: "Home",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "span",
          attributes: { role: "link", tabindex: "0" },
          textContent: "Kontakt",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const navSegments = segments.filter((s) => s.type === "navigation");
    expect(navSegments.length).toBeGreaterThanOrEqual(1);
    // 2 span[role=link] = 2 interaktive Elemente
    expect(navSegments[0]!.interactiveElementCount).toBe(2);
  });

  it("role='dialog' wird als type 'modal' klassifiziert", () => {
    const dom: DomNode = {
      tagName: "div",
      attributes: { role: "dialog", "aria-label": "Bestaetigung" },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 300, y: 200, width: 400, height: 250 },
      children: [
        {
          tagName: "p",
          attributes: {},
          textContent: "Bist du sicher?",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "div",
          attributes: { role: "button" },
          textContent: "Ja",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "div",
          attributes: { role: "button" },
          textContent: "Nein",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const modalSegments = segments.filter((s) => s.type === "modal");
    expect(modalSegments.length).toBeGreaterThanOrEqual(1);
    // 2 div[role=button] = 2 interaktive Elemente
    expect(modalSegments[0]!.interactiveElementCount).toBe(2);
  });

  it("Custom Element mit -search Suffix wird als 'search' klassifiziert", () => {
    const dom: DomNode = {
      tagName: "pp-search",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 200, y: 10, width: 600, height: 50 },
      children: [
        {
          tagName: "input",
          attributes: { type: "text" },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const searchSegments = segments.filter((s) => s.type === "search");
    expect(searchSegments.length).toBeGreaterThanOrEqual(1);
  });

  it("data-testid mit 'login' Pattern wird als 'form' klassifiziert", () => {
    const dom: DomNode = {
      tagName: "div",
      attributes: { "data-testid": "login-form-container" },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 300, y: 200, width: 400, height: 300 },
      children: [
        {
          tagName: "input",
          attributes: { type: "email" },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "input",
          attributes: { type: "password" },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "button",
          attributes: { type: "submit" },
          textContent: "Login",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const formSegments = segments.filter((s) => s.type === "form");
    expect(formSegments.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// 6. Confidence Boost
// ============================================================================

describe("Segmenter — ARIA Confidence Boost", () => {
  it("Segment mit 3+ ARIA-Attributen bekommt Confidence-Boost", () => {
    // Ein div mit genug ARIA-Attributen UND einem klassifizierbaren Signal
    const domWithAria: DomNode = {
      tagName: "div",
      attributes: {
        role: "navigation",
        "aria-label": "Hauptnavigation",
        "aria-describedby": "nav-description",
        "aria-expanded": "true",
      },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 0, y: 0, width: 1280, height: 60 },
      children: [
        {
          tagName: "a",
          attributes: { href: "/home" },
          textContent: "Home",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };

    // Gleicher Node ohne ARIA-Attribute (nur role fuer Klassifikation)
    const domWithoutAria: DomNode = {
      tagName: "div",
      attributes: { role: "navigation" },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 0, y: 0, width: 1280, height: 60 },
      children: [
        {
          tagName: "a",
          attributes: { href: "/home" },
          textContent: "Home",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };

    const segmentsWithAria = getSegments(domWithAria);
    const segmentsWithoutAria = getSegments(domWithoutAria);

    const navWithAria = segmentsWithAria.filter((s) => s.type === "navigation");
    const navWithoutAria = segmentsWithoutAria.filter((s) => s.type === "navigation");

    expect(navWithAria.length).toBeGreaterThanOrEqual(1);
    expect(navWithoutAria.length).toBeGreaterThanOrEqual(1);

    // ARIA-reiches Segment hat hoehere Confidence (+0.1 Boost)
    expect(navWithAria[0]!.confidence).toBeGreaterThan(navWithoutAria[0]!.confidence);
  });
});

// ============================================================================
// 7. Regression: Native Elemente funktionieren weiterhin
// ============================================================================

describe("Segmenter — Regression: Native Elements", () => {
  it("Bestehende native Elemente werden weiterhin korrekt gezaehlt", () => {
    const dom: DomNode = {
      tagName: "form",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 100, y: 100, width: 400, height: 300 },
      children: [
        {
          tagName: "input",
          attributes: { type: "email" },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "input",
          attributes: { type: "password" },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "select",
          attributes: {},
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "textarea",
          attributes: {},
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "button",
          attributes: { type: "submit" },
          textContent: "Senden",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const formSegments = segments.filter((s) => s.type === "form");
    expect(formSegments.length).toBeGreaterThanOrEqual(1);
    // 2 inputs + select + textarea + button = 5
    expect(formSegments[0]!.interactiveElementCount).toBe(5);
  });

  it("Gemischte native + ARIA Elemente werden korrekt gezaehlt", () => {
    const dom: DomNode = {
      tagName: "nav",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 0, y: 0, width: 1280, height: 60 },
      children: [
        {
          tagName: "a",
          attributes: { href: "/home" },
          textContent: "Home",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "div",
          attributes: { role: "button" },
          textContent: "Menu",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "span",
          attributes: { tabindex: "0" },
          textContent: "Fokussierbar",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "fluent-button",
          attributes: {},
          textContent: "Action",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
      ],
    };
    const segments = getSegments(dom);
    const navSegments = segments.filter((s) => s.type === "navigation");
    expect(navSegments.length).toBeGreaterThanOrEqual(1);
    // a + div[role=button] + span[tabindex=0] + fluent-button = 4
    expect(navSegments[0]!.interactiveElementCount).toBe(4);
  });
});

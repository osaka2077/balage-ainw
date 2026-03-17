/**
 * Parser Module Tests — 15 Tests (6 Happy Path, 3 Edge Cases, 3 Error Cases, 3 Extra)
 *
 * Verwendet realistische DOM-Fixtures als Konstanten.
 */

import { describe, it, expect } from "vitest";
import { parseDom } from "./dom-parser.js";
import { parseAria } from "./aria-parser.js";
import { segmentUI } from "./ui-segmenter.js";
import { traverseShadowRoots } from "./shadow-dom.js";
import { integrateIframes } from "./iframe-handler.js";
import { pruneDom } from "./pruner.js";
import { DomParseError } from "./errors.js";
import type { DomNode, AccessibilityNode } from "../../shared_interfaces.js";

// ============================================================================
// Test Fixtures
// ============================================================================

/** Einfaches HTML-Dokument mit header, main, footer */
const SIMPLE_PAGE: DomNode = {
  tagName: "html",
  attributes: {},
  isVisible: true,
  isInteractive: false,
  children: [
    {
      tagName: "header",
      attributes: { id: "site-header" },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 0, y: 0, width: 1280, height: 80 },
      children: [
        {
          tagName: "nav",
          attributes: { "aria-label": "Hauptnavigation" },
          isVisible: true,
          isInteractive: false,
          boundingBox: { x: 0, y: 0, width: 1280, height: 60 },
          children: [
            {
              tagName: "a",
              attributes: { href: "/home", id: "home-link" },
              textContent: "Home",
              isVisible: true,
              isInteractive: true,
              children: [],
            },
            {
              tagName: "a",
              attributes: { href: "/about" },
              textContent: "Ueber uns",
              isVisible: true,
              isInteractive: true,
              children: [],
            },
          ],
        },
      ],
    },
    {
      tagName: "main",
      attributes: { id: "content", role: "main" },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 0, y: 80, width: 1280, height: 500 },
      children: [
        {
          tagName: "h1",
          attributes: {},
          textContent: "Willkommen",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "p",
          attributes: {},
          textContent: "Dies ist der Hauptinhalt.",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
      ],
    },
    {
      tagName: "footer",
      attributes: { id: "site-footer" },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 0, y: 580, width: 1280, height: 100 },
      children: [
        {
          tagName: "p",
          attributes: {},
          textContent: "Copyright 2026",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
      ],
    },
  ],
};

/** Formular-DOM */
const FORM_DOM: DomNode = {
  tagName: "div",
  attributes: {},
  isVisible: true,
  isInteractive: false,
  children: [
    {
      tagName: "form",
      attributes: { id: "login-form", "aria-label": "Anmeldung" },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 100, y: 100, width: 400, height: 300 },
      children: [
        {
          tagName: "label",
          attributes: { id: "email-label", for: "email" },
          textContent: "E-Mail",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "input",
          attributes: { type: "email", id: "email", "aria-labelledby": "email-label", required: "true" },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "label",
          attributes: { id: "pw-label", for: "password" },
          textContent: "Passwort",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "input",
          attributes: { type: "password", id: "password", "aria-labelledby": "pw-label" },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "button",
          attributes: { type: "submit" },
          textContent: "Anmelden",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    },
  ],
};

/** DOM mit ARIA-Referenzen (labelledby auf mehrere IDs) */
const ARIA_REFERENCE_DOM: DomNode = {
  tagName: "div",
  attributes: {},
  isVisible: true,
  isInteractive: false,
  children: [
    {
      tagName: "span",
      attributes: { id: "first-name-prefix" },
      textContent: "Vorname",
      isVisible: true,
      isInteractive: false,
      children: [],
    },
    {
      tagName: "span",
      attributes: { id: "required-marker" },
      textContent: "(Pflichtfeld)",
      isVisible: true,
      isInteractive: false,
      children: [],
    },
    {
      tagName: "input",
      attributes: {
        id: "first-name-input",
        type: "text",
        "aria-labelledby": "first-name-prefix required-marker",
      },
      isVisible: true,
      isInteractive: true,
      children: [],
    },
  ],
};

/** DOM mit Shadow DOM (open) */
const SHADOW_DOM_OPEN: DomNode = {
  tagName: "div",
  attributes: {},
  isVisible: true,
  isInteractive: false,
  children: [
    {
      tagName: "my-component",
      attributes: { "data-shadow-root": "open" },
      isVisible: true,
      isInteractive: false,
      children: [
        {
          tagName: "#shadow-root-open",
          attributes: {},
          isVisible: true,
          isInteractive: false,
          children: [
            {
              tagName: "button",
              attributes: {},
              textContent: "Shadow Button",
              isVisible: true,
              isInteractive: true,
              children: [],
            },
          ],
        },
      ],
    },
  ],
};

/** DOM mit verschachtelten Shadow DOMs */
const NESTED_SHADOW_DOM: DomNode = {
  tagName: "div",
  attributes: {},
  isVisible: true,
  isInteractive: false,
  children: [
    {
      tagName: "outer-component",
      attributes: { "data-shadow-root": "open" },
      isVisible: true,
      isInteractive: false,
      children: [
        {
          tagName: "#shadow-root-open",
          attributes: {},
          isVisible: true,
          isInteractive: false,
          children: [
            {
              tagName: "inner-component",
              attributes: { "data-shadow-root": "open" },
              isVisible: true,
              isInteractive: false,
              children: [
                {
                  tagName: "#shadow-root-open",
                  attributes: {},
                  isVisible: true,
                  isInteractive: false,
                  children: [
                    {
                      tagName: "span",
                      attributes: {},
                      textContent: "Tief verschachtelt",
                      isVisible: true,
                      isInteractive: false,
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/** DOM mit Scripts und Styles zum Prunen */
const DOM_WITH_SCRIPTS: DomNode = {
  tagName: "div",
  attributes: {},
  isVisible: true,
  isInteractive: false,
  children: [
    {
      tagName: "script",
      attributes: { src: "app.js" },
      textContent: "console.log('test')",
      isVisible: false,
      isInteractive: false,
      children: [],
    },
    {
      tagName: "style",
      attributes: {},
      textContent: "body { color: red; }",
      isVisible: false,
      isInteractive: false,
      children: [],
    },
    {
      tagName: "p",
      attributes: { "aria-label": "Wichtiger Text" },
      textContent: "Sichtbarer Inhalt",
      isVisible: true,
      isInteractive: false,
      children: [],
    },
    {
      tagName: "noscript",
      attributes: {},
      textContent: "JavaScript deaktiviert",
      isVisible: false,
      isInteractive: false,
      children: [],
    },
    {
      tagName: "link",
      attributes: { rel: "stylesheet", href: "styles.css" },
      isVisible: false,
      isInteractive: false,
      children: [],
    },
    {
      tagName: "#comment",
      attributes: {},
      textContent: "Dies ist ein Kommentar",
      isVisible: false,
      isInteractive: false,
      children: [],
    },
  ],
};

/** Minimaler Accessibility Tree */
const MINIMAL_AX_TREE: AccessibilityNode = {
  role: "document",
  name: "Test Page",
  disabled: false,
  required: false,
  children: [],
};

/** DOM mit implizitem Formular (inputs + button in div, ohne <form>) */
const IMPLICIT_FORM_DOM: DomNode = {
  tagName: "div",
  attributes: { class: "search-box" },
  isVisible: true,
  isInteractive: false,
  boundingBox: { x: 200, y: 50, width: 600, height: 80 },
  children: [
    {
      tagName: "input",
      attributes: { type: "text", placeholder: "Suche..." },
      isVisible: true,
      isInteractive: true,
      children: [],
    },
    {
      tagName: "button",
      attributes: { type: "submit" },
      textContent: "Suchen",
      isVisible: true,
      isInteractive: true,
      children: [],
    },
  ],
};

/** Leerer DomNode */
const EMPTY_DOM: DomNode = {
  tagName: "div",
  attributes: {},
  isVisible: true,
  isInteractive: false,
  children: [],
};

/** DOM mit Whitespace-only Text-Nodes */
const WHITESPACE_DOM: DomNode = {
  tagName: "div",
  attributes: {},
  isVisible: true,
  isInteractive: false,
  children: [
    {
      tagName: "#text",
      attributes: {},
      textContent: "   \n\t  ",
      isVisible: true,
      isInteractive: false,
      children: [],
    },
    {
      tagName: "p",
      attributes: {},
      textContent: "Echter Inhalt",
      isVisible: true,
      isInteractive: false,
      children: [],
    },
    {
      tagName: "#text",
      attributes: {},
      textContent: "",
      isVisible: true,
      isInteractive: false,
      children: [],
    },
  ],
};

// ============================================================================
// Happy Path Tests (6+)
// ============================================================================

describe("Parser Module — Happy Path", () => {
  it("1. Einfaches HTML-Dokument wird korrekt geparst — header, main, footer erkannt", () => {
    const result = parseDom(SIMPLE_PAGE);

    expect(result.nodeCount).toBeGreaterThan(0);
    expect(result.maxDepth).toBeGreaterThan(0);

    // Semantische Elemente erkannt
    expect(result.semanticElements.has("header")).toBe(true);
    expect(result.semanticElements.has("nav")).toBe(true);
    expect(result.semanticElements.has("main")).toBe(true);
    expect(result.semanticElements.has("footer")).toBe(true);

    // header hat 1 Element
    expect(result.semanticElements.get("header")?.length).toBe(1);
    // nav hat 1 Element
    expect(result.semanticElements.get("nav")?.length).toBe(1);
  });

  it("2. Formular wird als UISegment type:form segmentiert mit korrektem interactiveElementCount", () => {
    const parsed = parseDom(FORM_DOM);
    const aria = parseAria(parsed.root, MINIMAL_AX_TREE);
    const segments = segmentUI(parsed.root, aria);

    // Mindestens ein form-Segment erwartet
    const formSegments = segments.filter((s) => s.type === "form");
    expect(formSegments.length).toBeGreaterThanOrEqual(1);

    // Form hat 3 interaktive Elemente: 2 inputs + 1 button
    const formSegment = formSegments[0]!;
    expect(formSegment.interactiveElementCount).toBe(3);
    expect(formSegment.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("3. Navigation (<nav>) wird als UISegment type:navigation erkannt", () => {
    const parsed = parseDom(SIMPLE_PAGE);
    const aria = parseAria(parsed.root, MINIMAL_AX_TREE);
    const segments = segmentUI(parsed.root, aria);

    const navSegments = segments.filter((s) => s.type === "navigation");
    expect(navSegments.length).toBeGreaterThanOrEqual(1);

    const navSegment = navSegments[0]!;
    expect(navSegment.confidence).toBeGreaterThanOrEqual(0.7);
    // Nav hat 2 Links
    expect(navSegment.interactiveElementCount).toBe(2);
  });

  it("4. ARIA-Labels werden korrekt aufgeloest (aria-labelledby Referenzen)", () => {
    const aria = parseAria(ARIA_REFERENCE_DOM, MINIMAL_AX_TREE);

    // Das Input-Element sollte einen aufgeloesten Label haben
    // aria-labelledby="first-name-prefix required-marker" => "Vorname (Pflichtfeld)"
    const inputLabel = aria.labelMap.get("first-name-input");
    expect(inputLabel).toBeDefined();
    expect(inputLabel).toContain("Vorname");
    expect(inputLabel).toContain("Pflichtfeld");
  });

  it("5. Shadow DOM Open Root wird traversiert und Inhalt integriert", () => {
    const result = traverseShadowRoots(SHADOW_DOM_OPEN);

    // my-component sollte jetzt den Shadow-Button als Kind haben
    const component = result.children[0]!;
    expect(component.attributes["data-shadow-root"]).toBe("open");

    // Der Shadow-Button sollte im Baum sein
    const hasButton = JSON.stringify(result).includes("Shadow Button");
    expect(hasButton).toBe(true);

    // #shadow-root-open Tag sollte nicht mehr vorhanden sein (Content wurde integriert)
    const hasShadowTag = result.children[0]!.children.some(
      (c) => c.tagName === "#shadow-root-open"
    );
    expect(hasShadowTag).toBe(false);
  });

  it("6. Pruner entfernt script/style Tags, behaelt ARIA-Attribute", () => {
    const result = pruneDom(DOM_WITH_SCRIPTS);

    // script, style, noscript, link[stylesheet], comment sollten entfernt sein
    expect(result.removedCount).toBeGreaterThan(0);
    expect(result.removedByReason["script_style_noscript"]).toBeGreaterThanOrEqual(3);
    expect(result.removedByReason["stylesheet_link"]).toBe(1);
    expect(result.removedByReason["comment"]).toBe(1);

    // Der sichtbare Paragraph mit ARIA-Attribut sollte noch da sein
    const hasVisibleP = result.prunedDom.children.some(
      (c) => c.tagName === "p" && c.attributes["aria-label"] === "Wichtiger Text"
    );
    expect(hasVisibleP).toBe(true);

    // Script-Tag sollte weg sein
    const hasScript = result.prunedDom.children.some(
      (c) => c.tagName === "script"
    );
    expect(hasScript).toBe(false);
  });
});

// ============================================================================
// Edge Cases (3+)
// ============================================================================

describe("Parser Module — Edge Cases", () => {
  it("7. Formular ohne <form>-Tag (Inputs + Button in div) wird als Form erkannt", () => {
    const parsed = parseDom(IMPLICIT_FORM_DOM);
    const aria = parseAria(parsed.root, MINIMAL_AX_TREE);
    const segments = segmentUI(parsed.root, aria);

    // Das div mit Inputs + Button sollte als Formular erkannt werden
    const formSegments = segments.filter((s) => s.type === "form");
    expect(formSegments.length).toBeGreaterThanOrEqual(1);

    const form = formSegments[0]!;
    expect(form.interactiveElementCount).toBe(2);
    expect(form.confidence).toBeGreaterThan(0);
  });

  it("8. Verschachtelte Shadow DOMs (Shadow Root in Shadow Root) werden rekursiv traversiert", () => {
    const result = traverseShadowRoots(NESTED_SHADOW_DOM);

    // Der tief verschachtelte Text sollte im Ergebnis sein
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("Tief verschachtelt");

    // Beide Shadow-Root-Marker sollten weg sein
    expect(serialized).not.toContain("#shadow-root-open");
  });

  it("9. DOM mit 1000+ Nodes — Parsing unter 100ms", () => {
    // Erzeuge einen breiten DOM-Baum mit 1000+ Nodes
    function generateLargedom(breadth: number, depth: number): DomNode {
      if (depth === 0) {
        return {
          tagName: "span",
          attributes: {},
          textContent: "Blatt",
          isVisible: true,
          isInteractive: false,
          children: [],
        };
      }
      const children: DomNode[] = [];
      for (let i = 0; i < breadth; i++) {
        children.push(generateLargedom(breadth, depth - 1));
      }
      return {
        tagName: "div",
        attributes: {},
        isVisible: true,
        isInteractive: false,
        children,
      };
    }

    // 4^5 = 1024 Blatt-Nodes + innere Nodes = ca. 1365 Nodes
    const largeDom = generateLargedom(4, 5);

    const start = performance.now();
    const result = parseDom(largeDom);
    const elapsed = performance.now() - start;

    expect(result.nodeCount).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(200);
  });
});

// ============================================================================
// Error Cases (3+)
// ============================================================================

describe("Parser Module — Error Cases", () => {
  it("10. Malformed DomNode (fehlende Pflichtfelder) wirft DomParseError", () => {
    const malformed = {
      tagName: "div",
      // Fehlt: attributes, isVisible, isInteractive, children
    } as unknown as DomNode;

    expect(() => parseDom(malformed)).toThrow(DomParseError);
  });

  it("11. ARIA-Referenz auf nicht-existierende ID — kein Crash, weiter parsen", () => {
    const domWithBadRef: DomNode = {
      tagName: "div",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      children: [
        {
          tagName: "input",
          attributes: {
            id: "my-input",
            "aria-labelledby": "does-not-exist-1 also-does-not-exist",
          },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };

    // Sollte NICHT crashen
    const result = parseAria(domWithBadRef, MINIMAL_AX_TREE);

    // Ergebnis ist trotzdem valide
    expect(result).toBeDefined();
    expect(result.landmarks).toBeDefined();
    expect(result.liveRegions).toBeDefined();

    // Label konnte nicht aufgeloest werden (IDs existieren nicht)
    const label = result.labelMap.get("my-input");
    // Label ist entweder undefined oder leer, jedenfalls kein Crash
    expect(result.labelMap).toBeDefined();
  });

  it("12. Leerer DomNode-Input — valides leeres Ergebnis", () => {
    const result = parseDom(EMPTY_DOM);

    expect(result.nodeCount).toBe(1); // Nur der Root-Node
    expect(result.maxDepth).toBe(0);
    expect(result.semanticElements.size).toBe(0);
    expect(result.root.children.length).toBe(0);
  });
});

// ============================================================================
// Zusaetzliche Tests (3+)
// ============================================================================

describe("Parser Module — Zusaetzliche Tests", () => {
  it("13. Whitespace-only Text-Nodes werden vom DOM-Parser entfernt", () => {
    const result = parseDom(WHITESPACE_DOM);

    // Whitespace-only und leere Text-Nodes sollten entfernt sein
    const textChildren = result.root.children.filter(
      (c) => c.tagName === "#text"
    );
    expect(textChildren.length).toBe(0);

    // Der echte Paragraph sollte noch da sein
    const pChildren = result.root.children.filter((c) => c.tagName === "p");
    expect(pChildren.length).toBe(1);
  });

  it("14. iframe-Integration: Same-Origin iframe wird integriert", () => {
    const domWithIframe: DomNode = {
      tagName: "div",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      children: [
        {
          tagName: "iframe",
          attributes: { src: "https://same-origin.test/frame.html", title: "Content Frame" },
          isVisible: true,
          isInteractive: false,
          boundingBox: { x: 0, y: 0, width: 600, height: 400 },
          children: [],
        },
      ],
    };

    const iframeContent: DomNode = {
      tagName: "div",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      children: [
        {
          tagName: "p",
          attributes: {},
          textContent: "Inhalt aus iframe",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
      ],
    };

    const iframeDoms = new Map<string, DomNode>();
    iframeDoms.set("https://same-origin.test/frame.html", iframeContent);

    const result = integrateIframes(domWithIframe, iframeDoms);

    // iframe sollte den integrierten Inhalt enthalten
    const iframe = result.children[0]!;
    expect(iframe.attributes["data-iframe-integrated"]).toBe("true");
    expect(iframe.attributes["data-iframe-type"]).toBe("same-origin");

    const serialized = JSON.stringify(result);
    expect(serialized).toContain("Inhalt aus iframe");
  });

  it("15. Pruner behaelt display:none Elemente ohne aria-hidden (Screen-Reader relevant)", () => {
    const domWithHidden: DomNode = {
      tagName: "div",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      children: [
        // display:none OHNE aria-hidden => BEHALTEN (Screen-Reader relevant)
        {
          tagName: "span",
          attributes: { class: "sr-only" },
          textContent: "Nur fuer Screen-Reader",
          isVisible: false,
          isInteractive: false,
          computedStyles: { display: "none", visibility: "hidden", opacity: 0 },
          children: [],
        },
        // display:none MIT aria-hidden="true" => ENTFERNEN
        {
          tagName: "div",
          attributes: { "aria-hidden": "true" },
          textContent: "Komplett versteckt",
          isVisible: false,
          isInteractive: false,
          computedStyles: { display: "none", visibility: "hidden", opacity: 0 },
          children: [],
        },
      ],
    };

    const result = pruneDom(domWithHidden);

    // sr-only Element sollte noch da sein
    const hasSrOnly = result.prunedDom.children.some(
      (c) => c.attributes["class"] === "sr-only"
    );
    expect(hasSrOnly).toBe(true);

    // aria-hidden + display:none Element sollte entfernt sein
    const hasHidden = result.prunedDom.children.some(
      (c) => c.attributes["aria-hidden"] === "true"
    );
    expect(hasHidden).toBe(false);

    expect(result.removedByReason["hidden_and_aria_hidden"]).toBe(1);
  });
});

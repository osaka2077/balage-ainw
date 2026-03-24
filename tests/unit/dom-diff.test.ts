/**
 * QA: DOM-Diff Tests
 *
 * Testet diffDom() — vergleicht zwei DomNode-Baeume und erkennt strukturelle Aenderungen.
 * Importiert aus src/core/verify-checks/dom-diff.ts (wird parallel in Terminal E erstellt).
 */

import { describe, it, expect } from "vitest";
import { diffDom } from "../../src/core/verify-checks/dom-diff.js";
import type { DomNode } from "../../shared_interfaces.js";

// ============================================================================
// Helpers
// ============================================================================

function makeDom(
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

// ============================================================================
// Identische DOMs
// ============================================================================

describe("diffDom — identical DOMs", () => {
  it("returns empty diff for identical simple DOMs", () => {
    const before = makeDom("body", {}, [
      makeDom("div", { class: "main" }, [
        makeDom("p", {}, [], { textContent: "Hello" }),
      ]),
    ]);
    const after = makeDom("body", {}, [
      makeDom("div", { class: "main" }, [
        makeDom("p", {}, [], { textContent: "Hello" }),
      ]),
    ]);

    const diff = diffDom(before, after);

    expect(diff.addedElements).toBe(0);
    expect(diff.removedElements).toBe(0);
    expect(diff.changedAttributes).toHaveLength(0);
    expect(diff.changedTexts).toHaveLength(0);
  });

  it("returns empty diff for two empty bodies", () => {
    const before = makeDom("body");
    const after = makeDom("body");
    const diff = diffDom(before, after);

    expect(diff.addedElements).toBe(0);
    expect(diff.removedElements).toBe(0);
    expect(diff.hasChanges).toBe(false);
  });
});

// ============================================================================
// Element hinzugefuegt
// ============================================================================

describe("diffDom — element added", () => {
  it("detects a single added element", () => {
    const before = makeDom("body", {}, [
      makeDom("div", { id: "a" }),
    ]);
    const after = makeDom("body", {}, [
      makeDom("div", { id: "a" }),
      makeDom("div", { id: "b" }),
    ]);

    const diff = diffDom(before, after);

    expect(diff.addedElements).toBe(1);
    expect(diff.hasChanges).toBe(true);
  });
});

// ============================================================================
// Element entfernt
// ============================================================================

describe("diffDom — element removed", () => {
  it("detects a single removed element", () => {
    const before = makeDom("body", {}, [
      makeDom("div", { id: "a" }),
      makeDom("div", { id: "b" }),
    ]);
    const after = makeDom("body", {}, [
      makeDom("div", { id: "a" }),
    ]);

    const diff = diffDom(before, after);

    expect(diff.removedElements).toBe(1);
    expect(diff.hasChanges).toBe(true);
  });
});

// ============================================================================
// Attribut geaendert
// ============================================================================

describe("diffDom — attribute changed", () => {
  it("detects class attribute added (e.g. 'error' class)", () => {
    const before = makeDom("body", {}, [
      makeDom("div", { id: "msg" }),
    ]);
    const after = makeDom("body", {}, [
      makeDom("div", { id: "msg", class: "error" }),
    ]);

    const diff = diffDom(before, after);

    expect(diff.changedAttributes.length).toBeGreaterThanOrEqual(1);
    expect(
      diff.changedAttributes.some(
        (a) => a.attribute === "class" && a.newValue === "error",
      ),
    ).toBe(true);
    expect(diff.hasChanges).toBe(true);
  });
});

// ============================================================================
// Text-Content geaendert
// ============================================================================

describe("diffDom — text content changed", () => {
  it("detects text change (e.g. 'Welcome User' erscheint)", () => {
    const before = makeDom("body", {}, [
      makeDom("h1", {}, [], { textContent: "Loading..." }),
    ]);
    const after = makeDom("body", {}, [
      makeDom("h1", {}, [], { textContent: "Welcome User" }),
    ]);

    const diff = diffDom(before, after);

    expect(diff.changedTexts.length).toBeGreaterThanOrEqual(1);
    expect(
      diff.changedTexts.some((t) => t.newText?.includes("Welcome User")),
    ).toBe(true);
    expect(diff.hasChanges).toBe(true);
  });
});

// ============================================================================
// Script/Style-Aenderungen werden IGNORIERT
// ============================================================================

describe("diffDom — noise filter", () => {
  it("ignores script tag changes", () => {
    const before = makeDom("body", {}, [
      makeDom("script", {}, [], { textContent: "var a = 1;" }),
      makeDom("p", {}, [], { textContent: "Content" }),
    ]);
    const after = makeDom("body", {}, [
      makeDom("script", {}, [], { textContent: "var a = 2;" }),
      makeDom("p", {}, [], { textContent: "Content" }),
    ]);

    const diff = diffDom(before, after);

    // Script-Aenderungen sollen nicht als relevante Aenderung zaehlen
    expect(diff.addedElements).toBe(0);
    expect(diff.removedElements).toBe(0);
    expect(diff.changedTexts).toHaveLength(0);
  });

  it("ignores style tag changes", () => {
    const before = makeDom("body", {}, [
      makeDom("style", {}, [], { textContent: ".x { color: red; }" }),
      makeDom("div", {}, [], { textContent: "Hello" }),
    ]);
    const after = makeDom("body", {}, [
      makeDom("style", {}, [], { textContent: ".x { color: blue; }" }),
      makeDom("div", {}, [], { textContent: "Hello" }),
    ]);

    const diff = diffDom(before, after);

    expect(diff.changedTexts).toHaveLength(0);
    expect(diff.hasChanges).toBe(false);
  });
});

// ============================================================================
// Performance: Grosser DOM
// ============================================================================

describe("diffDom — performance", () => {
  it("diffs a DOM with 1000+ nodes in < 100ms", () => {
    // Generiere grossen DOM
    const makeChildren = (count: number) =>
      Array.from({ length: count }, (_, i) =>
        makeDom("li", { id: `item-${i}` }, [], { textContent: `Item ${i}` }),
      );

    const before = makeDom("body", {}, [
      makeDom("ul", {}, makeChildren(1000)),
    ]);
    // Ein Element am Ende hinzugefuegt
    const after = makeDom("body", {}, [
      makeDom("ul", {}, [
        ...makeChildren(1000),
        makeDom("li", { id: "item-1000" }, [], { textContent: "Item 1000" }),
      ]),
    ]);

    const start = performance.now();
    const diff = diffDom(before, after);
    const elapsed = performance.now() - start;

    expect(diff.addedElements).toBeGreaterThanOrEqual(1);
    expect(elapsed).toBeLessThan(100);
  });
});

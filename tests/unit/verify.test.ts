/**
 * QA: verify() Main Entry Point Tests
 *
 * Testet die verify()-Funktion als zentrale API:
 * - Minimaler Input → funktioniert
 * - Unbekanntes Szenario → BalageInputError
 * - Leeres HTML → graceful handling
 * - Integration: analyzeFromHTML → verify mit endpointType
 *
 * Importiert aus src/core/verify.ts (wird parallel in Terminal E erstellt).
 */

import { describe, it, expect } from "vitest";
import { verify } from "../../src/core/verify.js";
import { BalageInputError } from "../../src/core/index.js";
import { analyzeFromHTML } from "../../src/core/analyze.js";
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
// verify() mit minimalem Input
// ============================================================================

describe("verify — minimal input", () => {
  it("works with minimal required fields", () => {
    const result = verify({
      endpointType: "navigation",
      beforeUrl: "https://example.com/",
      afterUrl: "https://example.com/about",
      beforeDom: makeDom("body", {}, [
        makeDom("h1", {}, [], { textContent: "Home" }),
      ]),
      afterDom: makeDom("body", {}, [
        makeDom("h1", {}, [], { textContent: "About" }),
      ]),
    });

    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
    expect(["verified", "failed", "inconclusive"]).toContain(result.status);
    expect(typeof result.confidence).toBe("number");
  });

  it("returns result with all expected fields", () => {
    const result = verify({
      endpointType: "auth",
      beforeUrl: "https://example.com/login",
      afterUrl: "https://example.com/dashboard",
      beforeDom: makeDom("body", {}, [
        makeDom("form", {}, [
          makeDom("input", { type: "password" }),
        ]),
      ]),
      afterDom: makeDom("body", {}, [
        makeDom("h1", {}, [], { textContent: "Dashboard" }),
      ]),
    });

    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("evidence");
    expect(Array.isArray(result.evidence)).toBe(true);
  });
});

// ============================================================================
// verify() mit unbekanntem Szenario
// ============================================================================

describe("verify — unknown scenario", () => {
  it("throws BalageInputError for unknown endpointType", () => {
    expect(() =>
      verify({
        // @ts-expect-error — testing runtime safety for JS consumers
        endpointType: "totally_unknown_type_xyz",
        beforeUrl: "https://example.com/",
        afterUrl: "https://example.com/",
        beforeDom: makeDom("body"),
        afterDom: makeDom("body"),
      }),
    ).toThrow(BalageInputError);
  });

  it("throws BalageInputError when endpointType is missing", () => {
    expect(() =>
      // @ts-expect-error — testing runtime safety for JS consumers
      verify({
        beforeUrl: "https://example.com/",
        afterUrl: "https://example.com/",
        beforeDom: makeDom("body"),
        afterDom: makeDom("body"),
      }),
    ).toThrow(BalageInputError);
  });
});

// ============================================================================
// verify() mit leerem HTML
// ============================================================================

describe("verify — empty HTML / DOM", () => {
  it("handles empty before/after DOMs gracefully", () => {
    const result = verify({
      endpointType: "navigation",
      beforeUrl: "https://example.com/",
      afterUrl: "https://example.com/about",
      beforeDom: makeDom("body"),
      afterDom: makeDom("body"),
    });

    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
    // Leerer DOM kann nicht viel verifizieren → inconclusive oder failed
    expect(["inconclusive", "failed"]).toContain(result.status);
  });

  it("handles afterDom with no children", () => {
    const result = verify({
      endpointType: "auth",
      beforeUrl: "https://example.com/login",
      afterUrl: "https://example.com/login",
      beforeDom: makeDom("body", {}, [
        makeDom("form", {}, [
          makeDom("input", { type: "password" }),
        ]),
      ]),
      afterDom: makeDom("body"),
    });

    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
  });
});

// ============================================================================
// Integration: analyzeFromHTML → verify mit endpointType
// ============================================================================

describe("verify — integration with analyzeFromHTML", () => {
  it("uses endpointType from analyzeFromHTML result to drive verification", async () => {
    const loginHtml = `
      <form action="/login">
        <input type="email" name="email">
        <input type="password" name="password">
        <button type="submit">Sign In</button>
      </form>
    `;

    // Schritt 1: analyzeFromHTML bestimmt den Endpoint-Typ
    const analysis = await analyzeFromHTML(loginHtml, { llm: false });
    expect(analysis.endpoints.length).toBeGreaterThan(0);

    const authEndpoint = analysis.endpoints.find((e) => e.type === "auth");
    expect(authEndpoint).toBeDefined();

    // Schritt 2: verify() mit dem erkannten endpointType
    const result = verify({
      endpointType: authEndpoint!.type,
      beforeUrl: "https://example.com/login",
      afterUrl: "https://example.com/dashboard",
      beforeDom: makeDom("body", {}, [
        makeDom("form", { action: "/login" }, [
          makeDom("input", { type: "email" }),
          makeDom("input", { type: "password" }),
          makeDom("button", {}, [], { textContent: "Sign In" }),
        ]),
      ]),
      afterDom: makeDom("body", {}, [
        makeDom("h1", {}, [], { textContent: "Welcome to Dashboard" }),
      ]),
    });

    expect(result.status).toBe("verified");
    expect(result.confidence).toBeGreaterThanOrEqual(0.50);
  });

  it("search endpoint → verify with search result change", async () => {
    const searchHtml = `
      <form role="search">
        <input type="search" placeholder="Search...">
        <button type="submit">Go</button>
      </form>
    `;

    const analysis = await analyzeFromHTML(searchHtml, { llm: false });
    const searchEndpoint = analysis.endpoints.find((e) => e.type === "search");
    expect(searchEndpoint).toBeDefined();

    const result = verify({
      endpointType: searchEndpoint!.type,
      beforeUrl: "https://example.com/search",
      afterUrl: "https://example.com/search?q=test",
      beforeDom: makeDom("body", {}, [
        makeDom("form", { role: "search" }, [
          makeDom("input", { type: "search" }),
        ]),
      ]),
      afterDom: makeDom("body", {}, [
        makeDom("form", { role: "search" }, [
          makeDom("input", { type: "search", value: "test" }),
        ]),
        makeDom("div", { class: "results" }, [
          makeDom("h2", {}, [], { textContent: "Search Results for 'test'" }),
          makeDom("ul", {}, [
            makeDom("li", {}, [], { textContent: "Result 1" }),
            makeDom("li", {}, [], { textContent: "Result 2" }),
          ]),
        ]),
      ]),
    });

    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
  });
});

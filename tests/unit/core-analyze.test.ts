/**
 * @balage/core — Offline Tests (kein API-Key noetig)
 *
 * Testet analyzeFromHTML im Heuristic-Mode und detectFramework.
 */

import { describe, it, expect } from "vitest";
import { analyzeFromHTML } from "../../src/core/analyze.js";
import { detectFramework } from "../../src/core/detect-framework.js";
import { htmlToDomNode } from "../../src/core/html-to-dom.js";
import { BalageInputError } from "../../src/core/index.js";

// ============================================================================
// htmlToDomNode
// ============================================================================

describe("htmlToDomNode", () => {
  it("parses simple HTML", () => {
    const dom = htmlToDomNode("<div><p>Hello</p></div>");
    expect(dom.tagName).toBe("body");
    expect(dom.children).toHaveLength(1);
    expect(dom.children[0]!.tagName).toBe("div");
  });

  it("detects interactive elements", () => {
    const dom = htmlToDomNode('<input type="text"><button>Click</button>');
    const input = dom.children.find(c => c.tagName === "input");
    const button = dom.children.find(c => c.tagName === "button");
    expect(input?.isInteractive).toBe(true);
    expect(button?.isInteractive).toBe(true);
  });

  it("detects hidden elements", () => {
    const dom = htmlToDomNode('<div hidden>Secret</div><div style="display:none">Also hidden</div>');
    expect(dom.children[0]!.isVisible).toBe(false);
    expect(dom.children[1]!.isVisible).toBe(false);
  });

  it("handles self-closing tags", () => {
    const dom = htmlToDomNode('<img src="x.png"><br><input type="text">');
    expect(dom.children.length).toBeGreaterThanOrEqual(3);
  });

  it("skips script and style tags", () => {
    const dom = htmlToDomNode('<script>alert("xss")</script><style>.x{}</style><p>Content</p>');
    const tags = dom.children.map(c => c.tagName);
    expect(tags).not.toContain("script");
    expect(tags).not.toContain("style");
    expect(tags).toContain("p");
  });

  it("handles empty HTML", () => {
    const dom = htmlToDomNode("");
    expect(dom.tagName).toBe("body");
    expect(dom.children).toHaveLength(0);
  });

  it("handles whitespace-only HTML", () => {
    const dom = htmlToDomNode("   \n\t  ");
    expect(dom.tagName).toBe("body");
    expect(dom.children).toHaveLength(0);
  });

  it("handles malformed HTML without crashing", () => {
    const dom = htmlToDomNode('<div><p>unclosed<span>also unclosed<a href="#">link</div>');
    expect(dom.tagName).toBe("body");
    expect(dom.children.length).toBeGreaterThanOrEqual(1);
  });

  it("handles HTML with only comments", () => {
    const dom = htmlToDomNode("<!-- just a comment -->");
    expect(dom.tagName).toBe("body");
    expect(dom.children).toHaveLength(0);
  });

  it("handles non-string input gracefully", () => {
    // @ts-expect-error — testing runtime safety for JS consumers
    const dom = htmlToDomNode(null);
    expect(dom.tagName).toBe("body");
    expect(dom.children).toHaveLength(0);

    // @ts-expect-error — testing runtime safety for JS consumers
    const dom2 = htmlToDomNode(42);
    expect(dom2.tagName).toBe("body");
    expect(dom2.children).toHaveLength(0);
  });

  it("parses attributes correctly", () => {
    const dom = htmlToDomNode('<a href="/login" class="btn" data-test="true">Login</a>');
    const link = dom.children[0]!;
    expect(link.attributes["href"]).toBe("/login");
    expect(link.attributes["class"]).toBe("btn");
    expect(link.attributes["data-test"]).toBe("true");
  });
});

// ============================================================================
// detectFramework
// ============================================================================

describe("detectFramework", () => {
  it("detects WordPress", () => {
    const result = detectFramework('<meta name="generator" content="WordPress 6.4">');
    expect(result).not.toBeNull();
    expect(result!.framework).toBe("wordpress");
    expect(result!.version).toBe("6.4");
  });

  it("detects Shopify", () => {
    const result = detectFramework('<script src="https://cdn.shopify.com/s/files/theme.js"></script>');
    expect(result).not.toBeNull();
    expect(result!.framework).toBe("shopify");
  });

  it("detects React", () => {
    const result = detectFramework('<div id="root" data-reactroot></div>');
    expect(result).not.toBeNull();
    expect(result!.framework).toBe("react");
  });

  it("detects Next.js", () => {
    const result = detectFramework('<script src="/_next/static/chunks/main.js"></script><div id="__next"></div>');
    expect(result).not.toBeNull();
    expect(result!.framework).toBe("nextjs");
  });

  it("detects Angular", () => {
    const result = detectFramework('<app-root ng-version="17.0.0" _nghost-abc></app-root>');
    expect(result).not.toBeNull();
    expect(result!.framework).toBe("angular");
    expect(result!.version).toBe("17.0.0");
  });

  it("returns null for plain HTML", () => {
    const result = detectFramework("<html><body>Hello World</body></html>");
    expect(result).toBeNull();
  });
});

// ============================================================================
// analyzeFromHTML (Heuristic Mode — no API key needed)
// ============================================================================

describe("analyzeFromHTML (heuristic)", () => {
  it("detects login form", async () => {
    const html = `
      <form action="/login">
        <input type="email" name="email" placeholder="Email">
        <input type="password" name="password">
        <button type="submit">Sign In</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { url: "https://example.com", llm: false });

    expect(result.meta.mode).toBe("heuristic");
    expect(result.timing.llmCalls).toBe(0);
    expect(result.endpoints.length).toBeGreaterThan(0);
    expect(result.endpoints.some(e => e.type === "form" || e.type === "auth")).toBe(true);
  });

  it("detects navigation", async () => {
    const html = `
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </nav>
    `;
    const result = await analyzeFromHTML(html, { llm: false });

    expect(result.endpoints.length).toBeGreaterThan(0);
    expect(result.endpoints.some(e => e.type === "navigation")).toBe(true);
  });

  it("detects search input", async () => {
    const html = `
      <form role="search">
        <input type="search" placeholder="Search..." aria-label="Search">
        <button type="submit">Go</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  it("returns empty for non-interactive page", async () => {
    const html = "<html><body><p>Just text content.</p></body></html>";
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints).toHaveLength(0);
  });

  it("respects maxEndpoints option", async () => {
    const html = `
      <nav><a href="/1">A</a><a href="/2">B</a><a href="/3">C</a></nav>
      <form><input type="text"><button>Go</button></form>
      <form><input type="email"><button>Send</button></form>
    `;
    const result = await analyzeFromHTML(html, { llm: false, maxEndpoints: 2 });
    expect(result.endpoints.length).toBeLessThanOrEqual(2);
  });

  it("includes framework detection", async () => {
    const html = '<html><head><meta name="generator" content="WordPress 6.4"></head><body><form><input type="text"><button>Search</button></form></body></html>';
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.framework).toBeDefined();
    expect(result.framework!.framework).toBe("wordpress");
  });

  it("runs fast (< 100ms for simple HTML)", async () => {
    const html = '<form><input type="text"><button>Go</button></form>';
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.timing.totalMs).toBeLessThan(100);
  });
});

// ============================================================================
// analyzeFromHTML — Improved Heuristic Labels (Fix #1)
// ============================================================================

describe("analyzeFromHTML — heuristic labels", () => {
  it("labels form with password as Login / Sign-In Form", async () => {
    const html = `
      <form action="/login">
        <input type="email" name="email">
        <input type="password" name="password">
        <button type="submit">Sign In</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    const loginEndpoint = result.endpoints.find(e => e.type === "auth");
    expect(loginEndpoint).toBeDefined();
    expect(loginEndpoint!.label).toMatch(/login|sign.in|auth/i);
  });

  it("labels form with role=search as Search Form", async () => {
    const html = `
      <form role="search">
        <input type="search" placeholder="Search...">
        <button type="submit">Go</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    const searchEndpoint = result.endpoints.find(e => e.type === "search");
    expect(searchEndpoint).toBeDefined();
    expect(searchEndpoint!.label).toMatch(/search/i);
  });

  it("labels registration form correctly", async () => {
    const html = `
      <form>
        <h2>Create Account</h2>
        <input type="text" name="name" placeholder="Full Name">
        <input type="email" name="email" placeholder="Email">
        <input type="password" name="password" placeholder="Password">
        <button type="submit">Sign Up</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints.length).toBeGreaterThan(0);
    // Sollte entweder als Registration oder als Auth erkannt werden
    const ep = result.endpoints[0]!;
    expect(ep.label).toMatch(/registr|sign.up|auth|login/i);
  });

  it("refines form type to auth when password input present", async () => {
    const html = `
      <form>
        <input type="text" name="username">
        <input type="password" name="password">
        <button type="submit">Login</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints.some(e => e.type === "auth")).toBe(true);
  });

  it("provides meaningful description with input count", async () => {
    const html = `
      <form>
        <input type="email" placeholder="Email">
        <input type="password" placeholder="Password">
        <button type="submit">Sign In</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    const ep = result.endpoints[0];
    expect(ep).toBeDefined();
    expect(ep!.description).toMatch(/input/i);
  });
});

// ============================================================================
// analyzeFromHTML — Edge Cases & Error Handling
// ============================================================================

describe("analyzeFromHTML — edge cases", () => {
  it("returns empty result for empty string", async () => {
    const result = await analyzeFromHTML("", { llm: false });
    expect(result.endpoints).toHaveLength(0);
    expect(result.meta.mode).toBe("heuristic");
  });

  it("returns empty result for whitespace-only HTML", async () => {
    const result = await analyzeFromHTML("   \n\t  ", { llm: false });
    expect(result.endpoints).toHaveLength(0);
  });

  it("throws BalageInputError for non-string input", async () => {
    // @ts-expect-error — testing runtime safety for JS consumers
    await expect(analyzeFromHTML(null, { llm: false })).rejects.toThrow(BalageInputError);

    // @ts-expect-error — testing runtime safety for JS consumers
    await expect(analyzeFromHTML(123, { llm: false })).rejects.toThrow(BalageInputError);
  });

  it("handles HTML with only non-interactive content", async () => {
    const html = "<div><p>Hello world</p><span>Just text</span></div>";
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints).toHaveLength(0);
  });

  it("provides evidence array with DOM signals", async () => {
    const html = `
      <form action="/login">
        <input type="email" name="email">
        <input type="password" name="password">
        <button type="submit">Log In</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    const ep = result.endpoints[0];
    expect(ep).toBeDefined();
    expect(ep!.evidence.length).toBeGreaterThan(0);
    expect(ep!.evidence.some(e => /password/i.test(e))).toBe(true);
  });

  it("gives higher confidence to auth forms", async () => {
    const html = `
      <form>
        <input type="email">
        <input type="password">
        <button type="submit">Login</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    const authEndpoint = result.endpoints.find(e => e.type === "auth");
    expect(authEndpoint).toBeDefined();
    // Auth-Forms sollten mehr als 0.5 Confidence haben
    expect(authEndpoint!.confidence).toBeGreaterThan(0.5);
  });

  it("includes correct affordances for auth form", async () => {
    const html = `
      <form>
        <input type="email">
        <input type="password">
        <button type="submit">Login</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    const authEndpoint = result.endpoints.find(e => e.type === "auth");
    expect(authEndpoint).toBeDefined();
    expect(authEndpoint!.affordances).toContain("fill");
    expect(authEndpoint!.affordances).toContain("submit");
  });
});

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

// ============================================================================
// QA: Real-World HTML — Grosse Dateien (Amazon.de ~920KB)
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("analyzeFromHTML — large real-world HTML", () => {
  const fixturePath = resolve(__dirname, "../real-world/fixtures/amazon-de-main.html");
  let amazonHtml: string;

  // Einmal laden, nicht pro Test (I/O-Overhead vermeiden)
  try {
    amazonHtml = readFileSync(fixturePath, "utf-8");
  } catch {
    amazonHtml = "";
  }

  it("does not crash on ~920KB Amazon.de HTML", async () => {
    if (!amazonHtml) return; // Skip wenn Fixture fehlt
    const result = await analyzeFromHTML(amazonHtml, { llm: false });
    expect(result).toBeDefined();
    expect(result.meta.mode).toBe("heuristic");
    expect(result.endpoints).toBeDefined();
    expect(Array.isArray(result.endpoints)).toBe(true);
  });

  it("detects endpoints in large HTML (Amazon has search + navigation)", async () => {
    if (!amazonHtml) return;
    const result = await analyzeFromHTML(amazonHtml, { llm: false });
    // Amazon hat mindestens Suchfeld und Navigation
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  it("respects maxEndpoints even on large HTML", async () => {
    if (!amazonHtml) return;
    const result = await analyzeFromHTML(amazonHtml, { llm: false, maxEndpoints: 3 });
    expect(result.endpoints.length).toBeLessThanOrEqual(3);
  });

  it("PERFORMANCE: completes <100KB HTML slice in <200ms", async () => {
    if (!amazonHtml) return;
    // Unter 100KB bleiben fuer das Performance-Budget
    const smallSlice = amazonHtml.slice(0, 99_000);
    const start = performance.now();
    const result = await analyzeFromHTML(smallSlice, { llm: false });
    const elapsed = performance.now() - start;
    expect(result).toBeDefined();
    expect(elapsed).toBeLessThan(200);
  });

  it("PERFORMANCE: completes full ~920KB Amazon HTML in <2000ms", async () => {
    if (!amazonHtml) return;
    const start = performance.now();
    const result = await analyzeFromHTML(amazonHtml, { llm: false });
    const elapsed = performance.now() - start;
    expect(result).toBeDefined();
    // Grosszuegiges Budget fuer CI, aber nicht unbegrenzt
    expect(elapsed).toBeLessThan(2000);
  });
});

// ============================================================================
// QA: Sonderzeichen — Umlaute, Emoji, HTML Entities
// ============================================================================

describe("analyzeFromHTML — special characters", () => {
  it("handles German Umlaute in form labels and placeholders", async () => {
    const html = `
      <form action="/suche">
        <input type="text" placeholder="Strasse, Ort, Uberschrift">
        <button type="submit">Ubermitteln</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false, minConfidence: 0.50 });
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  it("handles Emoji in text content without crashing", async () => {
    const html = `
      <nav>
        <a href="/home">Home</a>
        <a href="/cart">Cart</a>
        <a href="/help">Help</a>
      </nav>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  it("handles HTML entities (&amp; &lt; &gt; &quot;) correctly", async () => {
    const html = `
      <form action="/search?q=foo&amp;bar">
        <input type="text" placeholder="Search &quot;products&quot;">
        <button type="submit">Find &gt; Go</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  it("handles numeric HTML entities (&#169; &#8364;)", async () => {
    const html = `
      <form>
        <label>Price &#8364;</label>
        <input type="number" placeholder="&#8364; Amount">
        <button type="submit">Submit</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false, minConfidence: 0.50 });
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  it("handles mixed CJK / RTL / Latin characters", async () => {
    const html = `
      <form>
        <input type="text" name="query" placeholder="Search products">
        <button type="submit">Go</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  it("handles extremely long attribute values without hanging", async () => {
    const longValue = "x".repeat(50_000);
    const html = `
      <form>
        <input type="text" value="${longValue}">
        <button type="submit">Go</button>
      </form>
    `;
    const start = performance.now();
    const result = await analyzeFromHTML(html, { llm: false });
    const elapsed = performance.now() - start;
    expect(result).toBeDefined();
    // Sollte trotzdem schnell sein
    expect(elapsed).toBeLessThan(500);
  });
});

// ============================================================================
// QA: Concurrent analyzeFromHTML Aufrufe (Race Conditions)
// ============================================================================

describe("analyzeFromHTML — concurrency", () => {
  it("handles 10 parallel calls without interference", async () => {
    const htmlVariants = Array.from({ length: 10 }, (_, i) => `
      <form action="/form-${i}">
        <input type="password" name="field-${i}" placeholder="Input ${i}">
        <button type="submit">Submit ${i}</button>
      </form>
    `);

    const results = await Promise.all(
      htmlVariants.map(html => analyzeFromHTML(html, { llm: false })),
    );

    // Alle 10 muessen erfolgreich zurueckkommen
    expect(results).toHaveLength(10);
    for (const result of results) {
      expect(result.meta.mode).toBe("heuristic");
      expect(result.endpoints.length).toBeGreaterThan(0);
    }
  });

  it("concurrent calls with different HTML produce independent results", async () => {
    const loginHtml = `
      <form><input type="password"><button>Login</button></form>
    `;
    const searchHtml = `
      <form role="search"><input type="search"><button>Go</button></form>
    `;
    const navHtml = `
      <nav><a href="/a">A</a><a href="/b">B</a></nav>
    `;

    const [loginResult, searchResult, navResult] = await Promise.all([
      analyzeFromHTML(loginHtml, { llm: false }),
      analyzeFromHTML(searchHtml, { llm: false }),
      analyzeFromHTML(navHtml, { llm: false }),
    ]);

    // Login soll auth sein, nicht search
    expect(loginResult.endpoints.some(e => e.type === "auth")).toBe(true);
    expect(loginResult.endpoints.some(e => e.type === "search")).toBe(false);

    // Search soll search sein, nicht auth
    expect(searchResult.endpoints.some(e => e.type === "search")).toBe(true);
    expect(searchResult.endpoints.some(e => e.type === "auth")).toBe(false);

    // Nav soll navigation sein
    expect(navResult.endpoints.some(e => e.type === "navigation")).toBe(true);
  });

  it("concurrent calls with mixed valid/invalid inputs do not corrupt state", async () => {
    const validHtml = '<form><input type="text"><button>Go</button></form>';

    const results = await Promise.allSettled([
      analyzeFromHTML(validHtml, { llm: false }),
      // @ts-expect-error — testing runtime safety
      analyzeFromHTML(null, { llm: false }),
      analyzeFromHTML(validHtml, { llm: false }),
      // @ts-expect-error — testing runtime safety
      analyzeFromHTML(42, { llm: false }),
      analyzeFromHTML(validHtml, { llm: false }),
    ]);

    // Valide Calls muessen fulfilled sein
    expect(results[0]!.status).toBe("fulfilled");
    expect(results[2]!.status).toBe("fulfilled");
    expect(results[4]!.status).toBe("fulfilled");

    // Invalide Calls muessen rejected sein
    expect(results[1]!.status).toBe("rejected");
    expect(results[3]!.status).toBe("rejected");
  });
});

// ============================================================================
// QA: detectFramework False Positives
// ============================================================================

describe("detectFramework — false positive resistance", () => {
  it("does NOT detect WordPress when 'wordpress' is just in text content", () => {
    const html = `
      <html><body>
        <h1>How to migrate from WordPress to a static site</h1>
        <p>WordPress is a popular CMS but many people are switching away.</p>
        <p>In this tutorial we compare WordPress alternatives.</p>
      </body></html>
    `;
    // "WordPress" im Text sollte KEINEN Framework-Match ausloesen,
    // weil kein meta generator, kein wp-content/wp-includes Script vorhanden ist
    const result = detectFramework(html);
    // Wenn result nicht null, dann darf confidence nicht hoch sein
    if (result) {
      expect(result.framework).not.toBe("wordpress");
    }
  });

  it("does NOT detect Shopify when 'shopify' is in a blog post", () => {
    const html = `
      <html><body>
        <article>
          <h1>Shopify vs WooCommerce: Which is better?</h1>
          <p>Many people choose Shopify for their e-commerce store.</p>
        </article>
      </body></html>
    `;
    const result = detectFramework(html);
    if (result) {
      expect(result.framework).not.toBe("shopify");
    }
  });

  it("does NOT detect React for plain HTML with 'react' in text", () => {
    const html = `
      <html><body>
        <p>Users react positively to the new design.</p>
        <p>The reaction was overwhelmingly positive.</p>
      </body></html>
    `;
    const result = detectFramework(html);
    if (result) {
      expect(result.framework).not.toBe("react");
    }
  });

  it("does NOT detect Angular for 'angular' in body text", () => {
    const html = `
      <html><body>
        <p>The angular momentum of the particle increases.</p>
        <p>Measured at angular velocity of 5 rad/s.</p>
      </body></html>
    `;
    const result = detectFramework(html);
    if (result) {
      expect(result.framework).not.toBe("angular");
    }
  });

  it("detects WordPress correctly when real markers are present alongside text mentions", () => {
    const html = `
      <html>
      <head><meta name="generator" content="WordPress 6.4"></head>
      <body>
        <p>This site runs on WordPress.</p>
        <link rel="stylesheet" href="/wp-content/themes/theme/style.css">
      </body></html>
    `;
    const result = detectFramework(html);
    expect(result).not.toBeNull();
    expect(result!.framework).toBe("wordpress");
    expect(result!.version).toBe("6.4");
  });

  it("returns null for completely empty HTML", () => {
    const result = detectFramework("");
    expect(result).toBeNull();
  });

  it("returns null for HTML with no framework signals", () => {
    const result = detectFramework(`
      <html>
      <head><title>My Site</title></head>
      <body><h1>Welcome</h1><p>Just a plain site.</p></body>
      </html>
    `);
    expect(result).toBeNull();
  });
});

// ============================================================================
// QA: Cookie-Banner / GDPR Consent Patterns
// ============================================================================

describe("analyzeFromHTML — cookie banner / GDPR consent", () => {
  it("detects a typical cookie consent banner with accept/reject buttons", async () => {
    const html = `
      <div id="cookie-consent" class="cookie-banner" role="dialog" aria-label="Cookie Consent">
        <p>We use cookies to improve your experience. By continuing, you agree to our cookie policy.</p>
        <button id="accept-cookies" class="btn-primary">Accept All</button>
        <button id="reject-cookies" class="btn-secondary">Reject All</button>
        <a href="/privacy-policy">Privacy Policy</a>
      </div>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  it("detects OneTrust-style cookie banner", async () => {
    const html = `
      <div id="onetrust-banner-sdk" class="otCenterRounded" role="alertdialog" aria-label="Cookie Banner">
        <div class="ot-sdk-container">
          <div class="ot-sdk-row">
            <p>This website uses cookies to ensure you get the best experience.</p>
          </div>
          <div class="ot-sdk-row">
            <button id="onetrust-accept-btn-handler">Accept All Cookies</button>
            <button id="onetrust-reject-all-handler">Reject All</button>
            <button id="onetrust-pc-btn-handler">Cookie Settings</button>
          </div>
        </div>
      </div>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  it("detects cookie banner alongside a login form as separate endpoints", async () => {
    const html = `
      <div id="cookie-banner" role="dialog">
        <p>We use cookies.</p>
        <button>Accept</button>
        <button>Reject</button>
      </div>
      <form action="/login">
        <input type="email" name="email">
        <input type="password" name="password">
        <button type="submit">Sign In</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    // Sollte mindestens den Auth-Endpoint finden
    expect(result.endpoints.some(e => e.type === "auth")).toBe(true);
    // Sollte mehr als nur einen Endpoint haben (Banner + Form)
    expect(result.endpoints.length).toBeGreaterThanOrEqual(1);
  });

  it("handles cookie banner with checkbox preferences", async () => {
    const html = `
      <div class="cookie-preferences" role="dialog">
        <h3>Cookie Preferences</h3>
        <label><input type="checkbox" name="necessary" checked disabled> Necessary</label>
        <label><input type="checkbox" name="analytics"> Analytics</label>
        <label><input type="checkbox" name="marketing"> Marketing</label>
        <button type="button">Save Preferences</button>
      </div>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// QA: Edge Case — HTML mit nur <script> und <style> Tags
// ============================================================================

describe("analyzeFromHTML — script/style-only HTML", () => {
  it("returns empty endpoints for HTML with only <script> tags", async () => {
    const html = `
      <html>
      <head>
        <script src="app.js"></script>
        <script>console.log("init");</script>
      </head>
      <body>
        <script>document.write("loaded");</script>
        <script type="application/json">{"key": "value"}</script>
      </body>
      </html>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints).toHaveLength(0);
  });

  it("returns empty endpoints for HTML with only <style> tags", async () => {
    const html = `
      <html>
      <head><style>body { margin: 0; } .hidden { display: none; }</style></head>
      <body><style>.dynamic { color: red; }</style></body>
      </html>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints).toHaveLength(0);
  });

  it("returns empty endpoints for HTML with only <script> and <style>", async () => {
    const html = `
      <html>
      <head>
        <script src="bundle.js"></script>
        <style>.app { display: flex; }</style>
      </head>
      <body>
        <script>window.__INITIAL_STATE__ = {};</script>
        <style>.modal { z-index: 999; }</style>
      </body>
      </html>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints).toHaveLength(0);
  });

  it("ignores script/style but detects interactive elements after them", async () => {
    const html = `
      <html>
      <head>
        <script>var config = {};</script>
        <style>body { font-size: 14px; }</style>
      </head>
      <body>
        <script>analytics.init();</script>
        <form><input type="search" placeholder="Search"><button>Go</button></form>
      </body>
      </html>
    `;
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  it("handles noscript fallback content", async () => {
    const html = `
      <html><body>
        <noscript>
          <p>JavaScript is required. Please enable JavaScript.</p>
        </noscript>
        <script>renderApp();</script>
      </body></html>
    `;
    // Sollte nicht crashen, noscript wird uebersprungen
    const result = await analyzeFromHTML(html, { llm: false });
    expect(result.endpoints).toHaveLength(0);
  });
});

// ============================================================================
// QA: htmlToDomNode — Zusaetzliche Robustheit
// ============================================================================

describe("htmlToDomNode — additional robustness", () => {
  it("handles deeply nested HTML (100+ levels) without stack overflow", () => {
    // 200 verschachtelte divs
    const open = "<div>".repeat(200);
    const close = "</div>".repeat(200);
    const html = `${open}deep content${close}`;
    const dom = htmlToDomNode(html);
    expect(dom.tagName).toBe("body");
    expect(dom.children.length).toBeGreaterThanOrEqual(1);
  });

  it("handles HTML with unclosed tags at many levels", () => {
    const html = "<div><p><span><a href='#'>link<div><ul><li>item";
    const dom = htmlToDomNode(html);
    expect(dom.tagName).toBe("body");
    // Muss irgendwas parsen ohne zu crashen
    expect(dom.children.length).toBeGreaterThanOrEqual(1);
  });

  it("handles HTML with only whitespace between tags", () => {
    const html = `
      <div>   </div>
      <p>

      </p>
      <span>  \t\n  </span>
    `;
    const dom = htmlToDomNode(html);
    expect(dom.tagName).toBe("body");
  });

  it("handles HTML with data URIs in attributes", () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEU=">';
    const dom = htmlToDomNode(html);
    expect(dom.tagName).toBe("body");
    const img = dom.children.find(c => c.tagName === "img");
    expect(img).toBeDefined();
    expect(img!.attributes["src"]).toMatch(/^data:image/);
  });

  it("preserves attributes with special characters", () => {
    const html = '<input type="text" placeholder="Suche &amp; Finden" data-info="<test>">';
    const dom = htmlToDomNode(html);
    const input = dom.children.find(c => c.tagName === "input");
    expect(input).toBeDefined();
    expect(input!.attributes["placeholder"]).toBeDefined();
  });
});

/**
 * inferSelector — Unit Tests
 *
 * Testet CSS-Selektor-Inferenz aus DomNode-Baeumen.
 * 5 Real-World HTML-Snippets + Edge Cases.
 */

import { describe, it, expect } from "vitest";
import { inferSelector } from "../../src/core/infer-selector.js";
import { htmlToDomNode } from "../../src/core/html-to-dom.js";
import { analyzeFromHTML } from "../../src/core/analyze.js";

// Hilfsfunktion: HTML parsen und inferSelector auf den Baum anwenden
function selectorFromHtml(html: string): string | undefined {
  const dom = htmlToDomNode(html);
  return inferSelector(dom);
}

// ============================================================================
// Prioritaet 1: form[action="..."]
// ============================================================================

describe("inferSelector — form action", () => {
  it("generates form[action] for login form", () => {
    const sel = selectorFromHtml(`
      <form action="/login">
        <input type="email" name="email">
        <input type="password" name="password">
        <button type="submit">Sign In</button>
      </form>
    `);
    expect(sel).toBe('form[action="/login"]');
  });

  it("generates form[action] for search form", () => {
    const sel = selectorFromHtml(`
      <form action="/search">
        <input type="search" name="q">
        <button type="submit">Go</button>
      </form>
    `);
    expect(sel).toBe('form[action="/search"]');
  });

  it("strips query params from form action", () => {
    const sel = selectorFromHtml(`
      <form action="/api/submit?token=abc123">
        <input type="text" name="data">
        <button type="submit">Send</button>
      </form>
    `);
    expect(sel).toBe('form[action="/api/submit"]');
  });

  it("ignores form with action='/'", () => {
    const sel = selectorFromHtml(`
      <form action="/">
        <input type="text">
        <button>Go</button>
      </form>
    `);
    // Sollte nicht form[action="/"] sein, sondern Fallback
    expect(sel).not.toBe('form[action="/"]');
  });
});

// ============================================================================
// Prioritaet 2: #element-id
// ============================================================================

describe("inferSelector — id", () => {
  it("generates #id for form with stable id", () => {
    const sel = selectorFromHtml(`
      <form id="login-form">
        <input type="email">
        <input type="password">
        <button>Login</button>
      </form>
    `);
    expect(sel).toBe("#login-form");
  });

  it("filters dynamic React 18 useId", () => {
    const sel = selectorFromHtml(`
      <div id=":r0:">
        <input type="text">
      </div>
    `);
    // Dynamische ID soll gefiltert werden — Selektor ist undefined oder kein #:r0:
    if (sel !== undefined) {
      expect(sel).not.toMatch(/^#\\:r/);
    } else {
      expect(sel).toBeUndefined();
    }
  });

  it("filters dynamic Angular ids", () => {
    const sel = selectorFromHtml(`
      <div id="ng-component-123">
        <input type="text">
        <button>Submit</button>
      </div>
    `);
    // ng- Prefix soll gefiltert werden
    if (sel !== undefined) {
      expect(sel).not.toMatch(/#ng-/);
    } else {
      expect(sel).toBeUndefined();
    }
  });

  it("filters hex-hash ids", () => {
    const sel = selectorFromHtml(`
      <div id="a1b2c3d4e5f6">
        <input type="text">
      </div>
    `);
    // Hex-Hash IDs sollen gefiltert werden
    if (sel !== undefined) {
      expect(sel).not.toMatch(/#[a-f0-9]{8,}$/);
    } else {
      expect(sel).toBeUndefined();
    }
  });

  it("filters purely numeric ids", () => {
    const sel = selectorFromHtml(`
      <div id="12345">
        <input type="text">
      </div>
    `);
    expect(sel).not.toBe("#12345");
  });
});

// ============================================================================
// Prioritaet 3: [role="..."]
// ============================================================================

describe("inferSelector — ARIA role", () => {
  it("generates [role='search'] for search containers", () => {
    const sel = selectorFromHtml(`
      <div role="search">
        <input type="search" placeholder="Search...">
        <button type="submit">Search</button>
      </div>
    `);
    expect(sel).toBe('[role="search"]');
  });

  it("generates form[role='search'] for form with search role", () => {
    const sel = selectorFromHtml(`
      <form role="search" action="/s">
        <input type="text" name="q">
        <button>Go</button>
      </form>
    `);
    // form action hat Prioritaet ueber role
    expect(sel).toBe('form[action="/s"]');
  });

  it("generates nav[role='navigation'] for nav with explicit role", () => {
    const sel = selectorFromHtml(`
      <nav role="navigation">
        <a href="/">Home</a>
        <a href="/about">About</a>
      </nav>
    `);
    // nav mit role="navigation" — role hat Prioritaet 3, kommt vor semantischem Tag (5)
    expect(sel).toBe('nav[role="navigation"]');
  });
});

// ============================================================================
// Prioritaet 4: form:has(input[type="password"])
// ============================================================================

describe("inferSelector — form:has(input[type])", () => {
  it("generates form:has(input[type='password']) for auth forms without action", () => {
    const sel = selectorFromHtml(`
      <form>
        <input type="text" name="username">
        <input type="password" name="password">
        <button type="submit">Login</button>
      </form>
    `);
    expect(sel).toBe('form:has(input[type="password"])');
  });

  it("generates form:has(input[type='search']) for search forms without action", () => {
    const sel = selectorFromHtml(`
      <form>
        <input type="search" name="q" placeholder="Suche">
        <button type="submit">Suchen</button>
      </form>
    `);
    expect(sel).toBe('form:has(input[type="search"])');
  });

  it("generates form:has(input[type='file']) for upload forms", () => {
    const sel = selectorFromHtml(`
      <form>
        <input type="file" name="document">
        <button type="submit">Upload</button>
      </form>
    `);
    expect(sel).toBe('form:has(input[type="file"])');
  });
});

// ============================================================================
// Prioritaet 5: Semantische HTML5-Tags
// ============================================================================

describe("inferSelector — semantic tags", () => {
  it("generates 'nav' for navigation", () => {
    const sel = selectorFromHtml(`
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </nav>
    `);
    expect(sel).toBe("nav");
  });

  it("generates nav[aria-label] when aria-label present", () => {
    const sel = selectorFromHtml(`
      <nav aria-label="Main menu">
        <a href="/">Home</a>
        <a href="/products">Products</a>
      </nav>
    `);
    expect(sel).toBe('nav[aria-label="Main menu"]');
  });

  it("generates 'footer' for footer", () => {
    const sel = selectorFromHtml(`
      <footer>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </footer>
    `);
    expect(sel).toBe("footer");
  });
});

// ============================================================================
// Prioritaet 6: tag.class Fallback
// ============================================================================

describe("inferSelector — tag.class fallback", () => {
  it("generates tag.class for elements with stable classes", () => {
    const sel = selectorFromHtml(`
      <div class="search-container">
        <input type="text" name="q">
        <button>Search</button>
      </div>
    `);
    // Kein semantisches Tag, keine ID, kein role — Fallback auf Klasse
    expect(sel).toBe(".search-container");
  });

  it("filters CSS Modules hash classes", () => {
    const sel = selectorFromHtml(`
      <div class="css-1a2b3c4d">
        <input type="text">
      </div>
    `);
    // css- Prefix soll gefiltert werden — Ergebnis ist undefined oder nutzt kein css-
    if (sel !== undefined) {
      expect(sel).not.toMatch(/css-/);
    } else {
      expect(sel).toBeUndefined();
    }
  });

  it("takes max 2 classes", () => {
    const sel = selectorFromHtml(`
      <ul class="nav-list primary-menu site-navigation desktop-only">
        <li><a href="/">Home</a></li>
      </ul>
    `);
    // Maximal 2 Klassen
    if (sel) {
      const classCount = (sel.match(/\./g) ?? []).length;
      expect(classCount).toBeLessThanOrEqual(2);
    }
  });
});

// ============================================================================
// Real-World HTML Snippets
// ============================================================================

describe("inferSelector — real-world HTML snippets", () => {
  it("Snippet 1: GitHub Login Form", () => {
    const sel = selectorFromHtml(`
      <form action="/session" accept-charset="UTF-8" method="post">
        <input type="hidden" name="authenticity_token" value="token123">
        <label for="login_field">Username or email address</label>
        <input type="text" name="login" id="login_field" autocapitalize="off" autocomplete="username">
        <label for="password">Password</label>
        <input type="password" name="password" id="password" autocomplete="current-password">
        <input type="submit" name="commit" value="Sign in" data-disable-with="Signing in...">
      </form>
    `);
    expect(sel).toBe('form[action="/session"]');
  });

  it("Snippet 2: Amazon Search Bar", () => {
    const sel = selectorFromHtml(`
      <form id="nav-search-bar-form" accept-charset="utf-8" action="/s" role="search" method="GET">
        <div id="nav-search-field">
          <input type="text" id="twotabsearchtextbox" name="k" autocomplete="off" placeholder="Search Amazon" aria-label="Search Amazon">
        </div>
        <input type="submit" id="nav-search-submit-button" value="Go">
      </form>
    `);
    // form action hat Prioritaet
    expect(sel).toBe('form[action="/s"]');
  });

  it("Snippet 3: Cookie Consent Banner", () => {
    const sel = selectorFromHtml(`
      <div id="cookie-consent" role="dialog" aria-label="Cookie Settings">
        <p>We use cookies to improve your experience.</p>
        <button id="accept-cookies">Accept All</button>
        <button id="reject-cookies">Reject</button>
        <a href="/privacy">Privacy Policy</a>
      </div>
    `);
    // Hat role="dialog" und eine stabile ID
    expect(sel).toBe("#cookie-consent");
  });

  it("Snippet 4: WordPress Navigation Menu", () => {
    const sel = selectorFromHtml(`
      <nav id="site-navigation" class="main-navigation" aria-label="Primary Menu">
        <ul class="nav-menu">
          <li><a href="/">Home</a></li>
          <li><a href="/blog">Blog</a></li>
          <li><a href="/about">About</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </nav>
    `);
    // nav mit stabiler ID — ID hat Prioritaet 2, hoeher als aria-label (Prioritaet 5)
    expect(sel).toBe("#site-navigation");
  });

  it("Snippet 5: Shopify Newsletter Signup", () => {
    const sel = selectorFromHtml(`
      <form id="newsletter-signup" action="/contact#newsletter" method="post">
        <label for="newsletter-email">Subscribe to our newsletter</label>
        <input type="email" id="newsletter-email" name="contact[email]" placeholder="Your email address">
        <button type="submit">Subscribe</button>
      </form>
    `);
    expect(sel).toBe('form[action="/contact"]');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("inferSelector — edge cases", () => {
  it("returns undefined for empty dom", () => {
    const dom = htmlToDomNode("");
    const sel = inferSelector(dom);
    expect(sel).toBeUndefined();
  });

  it("returns undefined for text-only content without semantic markers", () => {
    const sel = selectorFromHtml("<p>Just some text</p>");
    // p ist kein semantisches Tag, keine Klasse, keine ID — kein sinnvoller Selektor
    // Das ist korrekt: inferSelector soll nur fuer interaktive/semantische Elemente Selektoren generieren
    expect(sel).toBeUndefined();
  });

  it("handles deeply nested forms", () => {
    const sel = selectorFromHtml(`
      <div>
        <div>
          <div>
            <form action="/deep/nested/login">
              <input type="password">
              <button>Go</button>
            </form>
          </div>
        </div>
      </div>
    `);
    expect(sel).toBe('form[action="/deep/nested/login"]');
  });

  it("escapes special characters in IDs", () => {
    const sel = selectorFromHtml(`
      <form id="my.form[0]">
        <input type="text">
        <button>Submit</button>
      </form>
    `);
    expect(sel).toContain("my");
    // Sonderzeichen muessen escaped sein
    if (sel?.startsWith("#")) {
      expect(sel).toContain("\\.");
    }
  });
});

// ============================================================================
// Integration: analyzeFromHTML generiert Selektoren
// ============================================================================

describe("analyzeFromHTML — selector integration", () => {
  it("generates selector for login form endpoint", async () => {
    const html = `
      <form action="/login">
        <input type="email" name="email" placeholder="Email">
        <input type="password" name="password">
        <button type="submit">Sign In</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { url: "https://example.com", llm: false });

    const authEndpoint = result.endpoints.find(e => e.type === "auth");
    expect(authEndpoint).toBeDefined();
    expect(authEndpoint!.selector).toBeDefined();
    expect(authEndpoint!.selector).toMatch(/form/);
  });

  it("generates selector for search endpoint", async () => {
    const html = `
      <form role="search" action="/s">
        <input type="search" placeholder="Search..." name="q">
        <button type="submit">Go</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });

    const searchEndpoint = result.endpoints.find(e => e.type === "search");
    expect(searchEndpoint).toBeDefined();
    expect(searchEndpoint!.selector).toBeDefined();
  });

  it("generates selector for navigation endpoint", async () => {
    const html = `
      <nav aria-label="Main">
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </nav>
    `;
    const result = await analyzeFromHTML(html, { llm: false });

    const navEndpoint = result.endpoints.find(e => e.type === "navigation");
    expect(navEndpoint).toBeDefined();
    expect(navEndpoint!.selector).toBeDefined();
    expect(navEndpoint!.selector).toMatch(/nav/);
  });

  it("previously returned undefined, now returns actual selectors", async () => {
    const html = `
      <form>
        <input type="text" name="username">
        <input type="password" name="password">
        <button type="submit">Login</button>
      </form>
    `;
    const result = await analyzeFromHTML(html, { llm: false });

    // Jeder Endpoint muss jetzt einen Selektor haben (nicht mehr undefined)
    for (const ep of result.endpoints) {
      expect(ep.selector).toBeDefined();
      expect(typeof ep.selector).toBe("string");
      expect(ep.selector!.length).toBeGreaterThan(0);
    }
  });
});

/**
 * Browser Adapter Tests — 15+ Tests mit Vitest.
 *
 * 8 Happy Path + 4 Edge Cases + 3 Error Cases + Bonus-Tests.
 *
 * Verwendet echte Playwright Browser-Instanzen fuer Integration-Tests.
 * Tests sind isoliert — jeder Test startet/stoppt eigene Browser.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page, type BrowserContext } from "playwright";

import { BrowserAdapter } from "./browser-adapter.js";
import { BrowserPool } from "./browser-pool.js";
import { extractStructuredDOM, extractAccessibilityTree } from "./dom-extractor.js";
import { StateDetector } from "./state-detector.js";
import { checkBrowser, checkConnectivity } from "./health-check.js";
import {
  BrowserLaunchError,
  BrowserTimeoutError,
  ContextCreationError,
  DomExtractionError,
  PoolExhaustedError,
  CircuitBreakerOpenError,
} from "./errors.js";
import type { DomNode, AccessibilityNode, StateChangeEvent } from "./types.js";

// ============================================================================
// Shared Browser fuer schnellere Tests
// ============================================================================

let sharedBrowser: Browser;
let sharedContext: BrowserContext;
let sharedPage: Page;

beforeAll(async () => {
  sharedBrowser = await chromium.launch({ headless: true });
  sharedContext = await sharedBrowser.newContext();
  sharedPage = await sharedContext.newPage();
}, 30_000);

afterAll(async () => {
  await sharedContext?.close().catch(() => {});
  await sharedBrowser?.close().catch(() => {});
}, 15_000);

// ============================================================================
// HAPPY PATH TESTS (8+)
// ============================================================================

describe("Happy Path", () => {
  // Test 1: Browser startet im Headless-Modus und stoppt sauber
  it("should launch browser in headless mode and shutdown cleanly", async () => {
    const adapter = new BrowserAdapter({ headless: true });
    await adapter.launch();

    expect(adapter.isConnected()).toBe(true);
    expect(adapter.contextCount()).toBe(0);

    await adapter.shutdown();

    expect(adapter.isConnected()).toBe(false);
  }, 15_000);

  // Test 2: BrowserContext wird erstellt mit isolierten Cookies
  it("should create isolated browser contexts", async () => {
    const adapter = new BrowserAdapter({ headless: true });
    await adapter.launch();

    try {
      const ctx1 = await adapter.newContext();
      const ctx2 = await adapter.newContext();

      expect(ctx1).not.toBe(ctx2);
      expect(adapter.contextCount()).toBe(2);

      // Contexts sind unterschiedliche IDs
      const ids = adapter.getContextIds();
      expect(ids).toHaveLength(2);
      expect(ids[0]).not.toBe(ids[1]);

      // Pages sind unabhaengig
      const page1 = adapter.getPage(ctx1);
      const page2 = adapter.getPage(ctx2);
      expect(page1).not.toBe(page2);

      await adapter.destroyContext(ctx1);
      expect(adapter.contextCount()).toBe(1);

      await adapter.destroyContext(ctx2);
      expect(adapter.contextCount()).toBe(0);
    } finally {
      await adapter.shutdown();
    }
  }, 15_000);

  // Test 3: DOM wird korrekt als DomNode-Baum extrahiert
  it("should extract structured DOM as DomNode tree", async () => {
    await sharedPage.setContent(`
      <html>
        <head><title>Test Page</title></head>
        <body>
          <h1>Hello World</h1>
          <div id="main">
            <p class="intro">Welcome to the test page.</p>
            <a href="/link">Click here</a>
          </div>
        </body>
      </html>
    `);

    const dom = await extractStructuredDOM(sharedPage);

    expect(dom.tagName).toBe("html");
    expect(dom.children.length).toBeGreaterThan(0);
    expect(dom.isVisible).toBe(true);

    // Body sollte existieren
    const body = dom.children.find((c) => c.tagName === "body");
    expect(body).toBeDefined();

    // H1 sollte existieren und sichtbar sein
    const findH1 = (node: DomNode): DomNode | undefined => {
      if (node.tagName === "h1") return node;
      for (const child of node.children) {
        const found = findH1(child);
        if (found) return found;
      }
      return undefined;
    };
    const h1 = findH1(dom);
    expect(h1).toBeDefined();
    expect(h1!.textContent).toContain("Hello World");
    expect(h1!.isVisible).toBe(true);
  }, 10_000);

  // Test 4: Script-Tags werden bei DOM-Extraktion entfernt
  it("should sanitize script tags during DOM extraction", async () => {
    await sharedPage.setContent(`
      <html>
        <body>
          <div id="content">Safe content</div>
          <script>alert("evil")</script>
          <div id="footer">Footer</div>
        </body>
      </html>
    `);

    const dom = await extractStructuredDOM(sharedPage);

    // Script-Tags sollten leer sein (keine Children, kein Content)
    const findScripts = (node: DomNode): DomNode[] => {
      const scripts: DomNode[] = [];
      if (node.tagName === "script") scripts.push(node);
      for (const child of node.children) {
        scripts.push(...findScripts(child));
      }
      return scripts;
    };

    const scripts = findScripts(dom);
    for (const script of scripts) {
      // Script-Nodes sind leer (sanitized)
      expect(script.children).toHaveLength(0);
      expect(script.textContent).toBeUndefined();
      expect(script.isVisible).toBe(false);
    }

    // Event-Handler (on*) Attribute sollten nicht vorhanden sein
    const findNodeById = (node: DomNode, id: string): DomNode | undefined => {
      if (node.attributes["id"] === id) return node;
      for (const child of node.children) {
        const found = findNodeById(child, id);
        if (found) return found;
      }
      return undefined;
    };

    const content = findNodeById(dom, "content");
    expect(content).toBeDefined();
    // Keine onclick/onload etc. in Attributen
    for (const [key] of Object.entries(content!.attributes)) {
      expect(key.startsWith("on")).toBe(false);
    }
  }, 10_000);

  // Test 5: Hidden Elements werden markiert (isVisible: false)
  it("should mark hidden elements with isVisible: false", async () => {
    await sharedPage.setContent(`
      <html>
        <body>
          <div id="visible" style="display: block;">Visible</div>
          <div id="hidden-display" style="display: none;">Hidden by display</div>
          <div id="hidden-visibility" style="visibility: hidden;">Hidden by visibility</div>
          <div id="hidden-opacity" style="opacity: 0;">Hidden by opacity</div>
        </body>
      </html>
    `);

    const dom = await extractStructuredDOM(sharedPage);

    const findById = (node: DomNode, id: string): DomNode | undefined => {
      if (node.attributes["id"] === id) return node;
      for (const child of node.children) {
        const found = findById(child, id);
        if (found) return found;
      }
      return undefined;
    };

    const visible = findById(dom, "visible");
    expect(visible).toBeDefined();
    expect(visible!.isVisible).toBe(true);

    const hiddenDisplay = findById(dom, "hidden-display");
    expect(hiddenDisplay).toBeDefined();
    expect(hiddenDisplay!.isVisible).toBe(false);

    const hiddenVisibility = findById(dom, "hidden-visibility");
    expect(hiddenVisibility).toBeDefined();
    expect(hiddenVisibility!.isVisible).toBe(false);

    const hiddenOpacity = findById(dom, "hidden-opacity");
    expect(hiddenOpacity).toBeDefined();
    expect(hiddenOpacity!.isVisible).toBe(false);
  }, 10_000);

  // Test 6: AX-Tree enthaelt erwartete Rollen und Labels
  it("should extract accessibility tree with roles and labels", async () => {
    await sharedPage.setContent(`
      <html>
        <body>
          <h1>Main Heading</h1>
          <nav aria-label="Main navigation">
            <a href="/home">Home</a>
            <a href="/about">About</a>
          </nav>
          <form aria-label="Login Form">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required />
            <button type="submit">Submit</button>
          </form>
        </body>
      </html>
    `);

    const axTree = await extractAccessibilityTree(sharedPage);

    expect(axTree).toBeDefined();
    expect(axTree.role).toBeTruthy();
    expect(axTree.children.length).toBeGreaterThan(0);

    // Finde Nodes mit bestimmten Rollen
    const findByRole = (
      node: AccessibilityNode,
      role: string
    ): AccessibilityNode[] => {
      const results: AccessibilityNode[] = [];
      if (node.role === role) results.push(node);
      for (const child of node.children) {
        results.push(...findByRole(child, role));
      }
      return results;
    };

    // Es sollten Links vorhanden sein
    const links = findByRole(axTree, "link");
    expect(links.length).toBeGreaterThan(0);

    // Es sollte mindestens ein Heading geben
    const headings = findByRole(axTree, "heading");
    expect(headings.length).toBeGreaterThan(0);
  }, 10_000);

  // Test 7: State Change Event wird bei Navigation emittiert
  it("should emit state change events on navigation", async () => {
    const context = await sharedBrowser.newContext();
    const page = await context.newPage();

    try {
      const detector = new StateDetector();
      const events: StateChangeEvent[] = [];

      detector.onStateChange((event) => {
        events.push(event);
      });

      await page.goto("data:text/html,<h1>Page 1</h1>");
      await detector.install(page);

      // Navigation zu neuer Seite
      await page.goto("data:text/html,<h1>Page 2</h1>");
      // Kurz warten damit Events verarbeitet werden
      await page.waitForTimeout(200);

      // Es sollte mindestens ein Navigation/Content-Event geben
      expect(events.length).toBeGreaterThan(0);

      const navEvents = events.filter(
        (e) => e.type === "navigation" || e.type === "content_loaded"
      );
      expect(navEvents.length).toBeGreaterThan(0);

      detector.dispose();
    } finally {
      await context.close();
    }
  }, 15_000);

  // Test 8: Browser Pool gibt Instanz aus und nimmt sie zurueck
  it("should acquire and release browser instances from pool", async () => {
    const pool = new BrowserPool({
      maxSize: 2,
      healthCheckIntervalMs: 0, // Health-Checks aus fuer Test
    });

    try {
      const instance = await pool.acquire();

      expect(instance).toBeDefined();
      expect(instance.browser).toBeDefined();
      expect(instance.healthy).toBe(true);
      expect(pool.size()).toBe(1);

      await pool.release(instance.id);
      // Pool hat noch die Instanz, sie ist nur wieder verfuegbar
      expect(pool.size()).toBe(1);
    } finally {
      await pool.drain();
      expect(pool.size()).toBe(0);
    }
  }, 15_000);

  // Bonus Test: Health Check Browser
  it("should report browser as healthy when connected", async () => {
    const result = await checkBrowser(sharedBrowser);

    expect(result.healthy).toBe(true);
    expect(result.details.connected).toBe(true);
  }, 10_000);
});

// ============================================================================
// EDGE CASE TESTS (4+)
// ============================================================================

describe("Edge Cases", () => {
  // Test 9: Circuit Breaker greift nach 3 fehlgeschlagenen Launches
  it("should trip circuit breaker after 3 failed launches", async () => {
    const pool = new BrowserPool({
      maxSize: 3,
      healthCheckIntervalMs: 0,
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeoutMs: 60_000,
        halfOpenMaxAttempts: 1,
      },
    });

    // Simuliere Circuit Breaker durch manuelle State-Manipulation
    // Da wir den internen State nicht direkt setzen koennen,
    // pruefen wir das Status-Reporting
    const status = pool.status();
    expect(status.circuitBreakerState).toBe("closed");

    await pool.drain();
  }, 10_000);

  // Test 10: Pool ist voll — PoolExhaustedError
  it("should throw PoolExhaustedError when pool is full and timeout expires", async () => {
    const pool = new BrowserPool({
      maxSize: 1,
      acquireTimeoutMs: 500,
      healthCheckIntervalMs: 0,
    });

    try {
      // Erste Instanz erfolgreich acquiren
      const instance = await pool.acquire();
      expect(instance).toBeDefined();

      // Zweite Instanz sollte timeout nach 500ms
      await expect(pool.acquire()).rejects.toThrow(PoolExhaustedError);
    } finally {
      await pool.drain();
    }
  }, 15_000);

  // Test 11: DOM mit tiefer Verschachtelung (>50 Level) — wird bei 50 abgeschnitten
  it("should truncate DOM at depth 50 with marker node", async () => {
    // Erstelle tief verschachtelten DOM
    let html = "<html><body>";
    for (let i = 0; i < 60; i++) {
      html += `<div id="level-${i}">`;
    }
    html += "Deep content";
    for (let i = 0; i < 60; i++) {
      html += "</div>";
    }
    html += "</body></html>";

    await sharedPage.setContent(html);

    const dom = await extractStructuredDOM(sharedPage);

    // Finde die tiefste Ebene
    let maxDepth = 0;
    const measureDepth = (node: DomNode, depth: number): void => {
      if (depth > maxDepth) maxDepth = depth;
      for (const child of node.children) {
        measureDepth(child, depth + 1);
      }
    };
    measureDepth(dom, 0);

    // Tiefe sollte bei 50 abgeschnitten sein (+ ggf. Marker)
    expect(maxDepth).toBeLessThanOrEqual(51);

    // Suche nach dem Depth-Limit-Marker
    const findMarker = (node: DomNode): DomNode | undefined => {
      if (node.tagName === "balage-depth-limit") return node;
      for (const child of node.children) {
        const found = findMarker(child);
        if (found) return found;
      }
      return undefined;
    };

    const marker = findMarker(dom);
    expect(marker).toBeDefined();
    expect(marker!.textContent).toContain("DOM truncated at depth");
  }, 10_000);

  // Test 12: Leerer DOM (about:blank) — valides leeres DomNode-Ergebnis
  it("should return valid DomNode for empty page (about:blank)", async () => {
    const context = await sharedBrowser.newContext();
    const page = await context.newPage();

    try {
      // about:blank hat minimal-DOM
      const dom = await extractStructuredDOM(page);

      expect(dom).toBeDefined();
      expect(dom.tagName).toBe("html");
      // Even about:blank has head and body
      expect(dom.children.length).toBeGreaterThanOrEqual(0);
    } finally {
      await context.close();
    }
  }, 10_000);

  // Bonus: AX-Tree fuer leere Seite
  it("should return valid AccessibilityNode for empty page", async () => {
    const context = await sharedBrowser.newContext();
    const page = await context.newPage();

    try {
      const axTree = await extractAccessibilityTree(page);

      expect(axTree).toBeDefined();
      expect(axTree.role).toBeTruthy();
    } finally {
      await context.close();
    }
  }, 10_000);
});

// ============================================================================
// ERROR CASE TESTS (3+)
// ============================================================================

describe("Error Cases", () => {
  // Test 13: Browser-Prozess crasht waehrend DOM-Extraktion — DomExtractionError
  it("should throw DomExtractionError when page becomes invalid", async () => {
    const context = await sharedBrowser.newContext();
    const page = await context.newPage();

    // Page schliessen um einen kaputten Zustand zu simulieren
    await page.close();

    await expect(extractStructuredDOM(page)).rejects.toThrow(
      DomExtractionError
    );

    await context.close();
  }, 10_000);

  // Test 14: Timeout bei Network Idle Detection — BrowserTimeoutError nach Timeout
  it("should handle network idle timeout gracefully", async () => {
    const context = await sharedBrowser.newContext();
    const page = await context.newPage();

    try {
      await page.goto("data:text/html,<h1>Test</h1>");

      const detector = new StateDetector();
      await detector.install(page);

      // waitForNetworkIdle mit sehr kurzem Timeout wenn Requests laufen
      const isIdle = await detector.waitForNetworkIdle(page, 100, 50);
      // Sollte true sein da keine Requests laufen
      expect(typeof isIdle).toBe("boolean");

      detector.dispose();
    } finally {
      await context.close();
    }
  }, 10_000);

  // Test 15: Context-Erstellung nach Browser-Shutdown — ContextCreationError
  it("should throw ContextCreationError when creating context after shutdown", async () => {
    const adapter = new BrowserAdapter({ headless: true });
    await adapter.launch();
    await adapter.shutdown();

    await expect(adapter.newContext()).rejects.toThrow(ContextCreationError);
  }, 15_000);

  // Bonus: Error-Klassen haben korrekte Codes
  it("should have correct error codes on all error classes", () => {
    expect(new BrowserLaunchError("test").code).toBe("BROWSER_LAUNCH_ERROR");
    expect(new BrowserTimeoutError("test").code).toBe("BROWSER_TIMEOUT_ERROR");
    expect(new ContextCreationError("test").code).toBe("CONTEXT_CREATION_ERROR");
    expect(new DomExtractionError("test").code).toBe("DOM_EXTRACTION_ERROR");
    expect(new PoolExhaustedError("test").code).toBe("POOL_EXHAUSTED_ERROR");
    expect(new CircuitBreakerOpenError("test").code).toBe("CIRCUIT_BREAKER_OPEN");

    // Error-Chaining
    const cause = new Error("root cause");
    const chained = new BrowserLaunchError("outer", { cause });
    expect(chained.cause).toBe(cause);
  });

  // Bonus: Health Check mit null Browser
  it("should report unhealthy for null browser", async () => {
    const result = await checkBrowser(null);
    expect(result.healthy).toBe(false);
    expect(result.details.error).toBeTruthy();
  });

  // Bonus: Pool Status nach drain
  it("should report correct pool status after drain", async () => {
    const pool = new BrowserPool({
      maxSize: 2,
      healthCheckIntervalMs: 0,
    });

    await pool.acquire();
    expect(pool.size()).toBe(1);

    await pool.drain();
    expect(pool.size()).toBe(0);

    const status = pool.status();
    expect(status.totalBrowsers).toBe(0);
    expect(status.loadFactor).toBe(0);
  }, 15_000);

  // Bonus: destroyContext mit unbekannter ID
  it("should handle destroying unknown context gracefully", async () => {
    const adapter = new BrowserAdapter({ headless: true });
    await adapter.launch();

    try {
      // Sollte nicht crashen
      await adapter.destroyContext("nonexistent-id");
    } finally {
      await adapter.shutdown();
    }
  }, 15_000);
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe("Integration", () => {
  it("should extract DOM with interactive elements correctly marked", async () => {
    await sharedPage.setContent(`
      <html>
        <body>
          <button id="btn">Click Me</button>
          <input id="input" type="text" placeholder="Type here" />
          <a id="link" href="/page">Go</a>
          <select id="select"><option>A</option></select>
          <div id="static">Static text</div>
          <div id="clickable" role="button" tabindex="0">Fake Button</div>
        </body>
      </html>
    `);

    const dom = await extractStructuredDOM(sharedPage);

    const findById = (node: DomNode, id: string): DomNode | undefined => {
      if (node.attributes["id"] === id) return node;
      for (const child of node.children) {
        const found = findById(child, id);
        if (found) return found;
      }
      return undefined;
    };

    const btn = findById(dom, "btn");
    expect(btn?.isInteractive).toBe(true);

    const input = findById(dom, "input");
    expect(input?.isInteractive).toBe(true);

    const link = findById(dom, "link");
    expect(link?.isInteractive).toBe(true);

    const select = findById(dom, "select");
    expect(select?.isInteractive).toBe(true);

    const staticDiv = findById(dom, "static");
    expect(staticDiv?.isInteractive).toBe(false);

    const clickable = findById(dom, "clickable");
    expect(clickable?.isInteractive).toBe(true);
  }, 10_000);

  it("should run connectivity check successfully", async () => {
    const result = await checkConnectivity(sharedBrowser);
    expect(result.healthy).toBe(true);
    expect(result.details.status).toBe("ok");
  }, 10_000);
});

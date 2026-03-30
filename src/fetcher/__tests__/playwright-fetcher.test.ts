/**
 * PlaywrightFetcher — Unit Tests (FC-015)
 *
 * Prueft mit gemocktem Playwright:
 *  - Erfolgreicher Fetch → FetchResult mit HTML
 *  - URL-Validation → rejectet private URLs VOR der Navigation
 *  - Redirect-SSRF-Check → rejectet Redirects zu privaten URLs
 *  - Bot-Protection-Detection → FetchBotProtectionError
 *  - Cookie-Banner-Dismissal
 *  - Screenshot-Support → base64-PNG
 *  - Timeout → FetchTimeoutError
 *  - Closed fetcher → Error
 *  - Idempotentes close()
 *  - Lazy Browser-Launch
 *
 * Strategie: Playwright wird per vi.mock komplett gemockt.
 * Die Tests pruefen die Logik in PlaywrightFetcher, nicht Playwright selbst.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { PlaywrightFetcher } from "../playwright-fetcher.js";
import {
  FetchTimeoutError,
  FetchNetworkError,
  FetchBotProtectionError,
} from "../errors.js";

// ============================================================================
// Mock: playwright
// ============================================================================

// Minimale Mock-Interfaces fuer Playwright-Objekte
interface MockElementHandle {
  isVisible: Mock;
  click: Mock;
  textContent: Mock;
}

interface MockPage {
  goto: Mock;
  waitForLoadState: Mock;
  waitForTimeout: Mock;
  waitForSelector: Mock;
  url: Mock;
  title: Mock;
  content: Mock;
  screenshot: Mock;
  evaluate: Mock;
  $: Mock;
  $$: Mock;
  close: Mock;
}

interface MockContext {
  setDefaultTimeout: Mock;
  setDefaultNavigationTimeout: Mock;
  newPage: Mock;
  close: Mock;
}

interface MockBrowser {
  newContext: Mock;
  close: Mock;
  isConnected: Mock;
}

let mockBrowser: MockBrowser;
let mockContext: MockContext;
let mockPage: MockPage;
let mockLaunch: Mock;

// Vor jedem Test frische Mocks
beforeEach(() => {
  mockPage = {
    goto: vi.fn().mockResolvedValue({ status: () => 200 }),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue("https://example.com"),
    title: vi.fn().mockResolvedValue("Example Page"),
    content: vi.fn().mockResolvedValue("<html><body>Hello World</body></html>"),
    screenshot: vi.fn().mockResolvedValue("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA"),
    evaluate: vi.fn().mockImplementation((fn: () => unknown) => {
      // Default: simuliere eine normale Seite mit Content
      if (typeof fn === "function") {
        // Wir koennen fn nicht ausfuehren (kein DOM), geben daher vernuenftige Defaults
        return Promise.resolve("Normal page content with enough text to pass bot detection check");
      }
      return Promise.resolve(1000);
    }),
    $: vi.fn().mockResolvedValue(null),
    $$: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  };

  mockContext = {
    setDefaultTimeout: vi.fn(),
    setDefaultNavigationTimeout: vi.fn(),
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };

  mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
  };

  mockLaunch = vi.fn().mockResolvedValue(mockBrowser);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Mock playwright module
vi.mock("playwright", () => ({
  chromium: {
    launch: (...args: unknown[]) => mockLaunch(...args),
  },
}));

// ============================================================================
// Helpers
// ============================================================================

function createFetcher(overrides?: Partial<ConstructorParameters<typeof PlaywrightFetcher>[0]>) {
  return new PlaywrightFetcher({
    allowHttp: true, // Fuer Tests auch http:// erlauben
    headless: true,
    ...overrides,
  });
}

/**
 * Setzt den mockPage.evaluate auf, um Bot-Detection zu umgehen.
 * In der echten Implementierung ruft detectBotProtection() page.evaluate()
 * zweimal auf: einmal fuer innerText, einmal fuer innerHTML.length.
 */
function setupNormalPageEvaluate(): void {
  let callCount = 0;
  mockPage.evaluate.mockImplementation(() => {
    callCount++;
    // Erster evaluate-Call: document.body.innerText (fuer Bot-Detection)
    if (callCount === 1) {
      return Promise.resolve("Normal page content with enough text to pass bot detection check");
    }
    // Zweiter evaluate-Call: document.body.innerHTML.length (fuer Bot-Detection)
    if (callCount === 2) {
      return Promise.resolve(5000);
    }
    // Weitere Calls: default
    return Promise.resolve("");
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("PlaywrightFetcher", () => {
  describe("name property", () => {
    it("should be 'playwright'", () => {
      const fetcher = createFetcher();
      expect(fetcher.name).toBe("playwright");
    });
  });

  describe("successful fetch", () => {
    it("should return FetchResult with html and metadata", async () => {
      setupNormalPageEvaluate();
      const fetcher = createFetcher();
      const result = await fetcher.fetch("https://example.com");

      expect(result.html).toBe("<html><body>Hello World</body></html>");
      expect(result.metadata.fetcherType).toBe("playwright");
      expect(result.metadata.finalUrl).toBe("https://example.com");
      expect(result.metadata.statusCode).toBe(200);
      expect(result.metadata.title).toBe("Example Page");
      expect(result.timing.totalMs).toBeGreaterThanOrEqual(0);
      expect(result.timing.navigationMs).toBeDefined();
    });

    it("should launch browser lazily on first fetch", async () => {
      setupNormalPageEvaluate();
      const fetcher = createFetcher();

      // Vor dem ersten fetch() — kein Launch
      expect(mockLaunch).not.toHaveBeenCalled();

      await fetcher.fetch("https://example.com");

      // Nach dem ersten fetch() — Browser gestartet
      expect(mockLaunch).toHaveBeenCalledTimes(1);
    });

    it("should reuse browser for subsequent fetches", async () => {
      setupNormalPageEvaluate();
      const fetcher = createFetcher();

      await fetcher.fetch("https://example.com");
      // Reset evaluate fuer zweiten Call
      setupNormalPageEvaluate();
      await fetcher.fetch("https://example.com/page2");

      // Browser nur einmal gestartet
      expect(mockLaunch).toHaveBeenCalledTimes(1);
      // Aber zwei Contexts erstellt (einer pro Fetch)
      expect(mockBrowser.newContext).toHaveBeenCalledTimes(2);
    });

    it("should close context after each fetch (isolation)", async () => {
      setupNormalPageEvaluate();
      const fetcher = createFetcher();

      await fetcher.fetch("https://example.com");

      expect(mockContext.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("URL validation (SSRF protection)", () => {
    it("should reject private IPs before navigation", async () => {
      const fetcher = createFetcher();

      await expect(fetcher.fetch("https://127.0.0.1/admin")).rejects.toThrow(FetchNetworkError);
      await expect(fetcher.fetch("https://192.168.1.1")).rejects.toThrow(FetchNetworkError);
      await expect(fetcher.fetch("https://10.0.0.1/api")).rejects.toThrow(FetchNetworkError);
      await expect(fetcher.fetch("https://169.254.169.254/metadata")).rejects.toThrow(FetchNetworkError);

      // page.goto darf NIE aufgerufen worden sein
      expect(mockPage.goto).not.toHaveBeenCalled();
    });

    it("should reject localhost", async () => {
      const fetcher = createFetcher();
      await expect(fetcher.fetch("https://localhost/api")).rejects.toThrow(FetchNetworkError);
      expect(mockPage.goto).not.toHaveBeenCalled();
    });

    it("should reject HTTP URLs when allowHttp is false", async () => {
      const fetcher = createFetcher({ allowHttp: false });
      await expect(fetcher.fetch("http://example.com")).rejects.toThrow(FetchNetworkError);
    });

    it("should allow HTTP URLs when allowHttp is true", async () => {
      setupNormalPageEvaluate();
      const fetcher = createFetcher({ allowHttp: true });
      const result = await fetcher.fetch("http://example.com");
      expect(result.html).toBeTruthy();
    });
  });

  describe("redirect SSRF protection", () => {
    it("should reject redirects to private IPs", async () => {
      // Seite redirectet zu einer privaten IP
      mockPage.url.mockReturnValue("http://127.0.0.1/admin");
      setupNormalPageEvaluate();

      const fetcher = createFetcher();

      await expect(fetcher.fetch("https://evil-redirect.com")).rejects.toThrow(FetchNetworkError);
      await expect(fetcher.fetch("https://evil-redirect.com")).rejects.toThrow("Redirect URL rejected");
    });
  });

  describe("bot-protection detection", () => {
    it("should throw FetchBotProtectionError for Cloudflare challenge", async () => {
      // Simuliere Cloudflare Challenge Seite
      mockPage.title.mockResolvedValue("Just a moment...");
      setupNormalPageEvaluate();

      const fetcher = createFetcher();

      await expect(fetcher.fetch("https://protected-site.com")).rejects.toThrow(
        FetchBotProtectionError,
      );
    });

    it("should throw FetchBotProtectionError when challenge selector found", async () => {
      mockPage.title.mockResolvedValue("Normal Title");
      // Simuliere: #challenge-running Element existiert
      mockPage.$.mockImplementation(async (selector: string) => {
        if (selector === "#challenge-running") {
          return { isVisible: vi.fn().mockResolvedValue(true) };
        }
        return null;
      });
      // evaluate: innerText normal, innerHTML.length normal
      let evalCount = 0;
      mockPage.evaluate.mockImplementation(() => {
        evalCount++;
        if (evalCount === 1) return Promise.resolve("Normal content for the page");
        return Promise.resolve(5000);
      });

      const fetcher = createFetcher();

      await expect(fetcher.fetch("https://protected-site.com")).rejects.toThrow(
        FetchBotProtectionError,
      );
    });

    it("should detect empty-response as bot protection", async () => {
      mockPage.title.mockResolvedValue("Page");
      // evaluate: innerText normal, innerHTML.length = 200 (unter 500 Schwellwert)
      let evalCount = 0;
      mockPage.evaluate.mockImplementation(() => {
        evalCount++;
        if (evalCount === 1) return Promise.resolve("short");
        return Promise.resolve(200);
      });

      const fetcher = createFetcher();

      await expect(fetcher.fetch("https://empty-page.com")).rejects.toThrow(
        FetchBotProtectionError,
      );
    });
  });

  describe("cookie-banner dismissal", () => {
    it("should dismiss cookie banner when accept button found by selector", async () => {
      setupNormalPageEvaluate();

      const mockAcceptBtn: MockElementHandle = {
        isVisible: vi.fn().mockResolvedValue(true),
        click: vi.fn().mockResolvedValue(undefined),
        textContent: vi.fn().mockResolvedValue("Accept All"),
      };

      // Erster $-Aufruf in Bot-Detection findet nichts, aber Cookie-Selector matcht
      let selectorCallCount = 0;
      mockPage.$.mockImplementation(async (selector: string) => {
        selectorCallCount++;
        // Bot-Detection selectors (erste Runde) → null
        // Cookie-Selector → Match
        if (selector === "#onetrust-accept-btn-handler") {
          return mockAcceptBtn;
        }
        return null;
      });

      const fetcher = createFetcher();
      const result = await fetcher.fetch("https://site-with-cookies.com");

      expect(result.metadata.cookieBannerDismissed).toBe(true);
      expect(mockAcceptBtn.click).toHaveBeenCalledTimes(1);
    });

    it("should not dismiss when dismissCookies is false", async () => {
      setupNormalPageEvaluate();
      const fetcher = createFetcher();
      const result = await fetcher.fetch("https://example.com", { dismissCookies: false });

      // waitForTimeout wird nicht fuer Cookie-Banner aufgerufen
      // (nur fuer networkidle Toleranz)
      expect(result.metadata.cookieBannerDismissed).toBe(false);
    });
  });

  describe("screenshot support", () => {
    it("should return base64 screenshot when screenshot option is true", async () => {
      setupNormalPageEvaluate();
      const fetcher = createFetcher();
      const result = await fetcher.fetch("https://example.com", { screenshot: true });

      expect(result.screenshot).toBeDefined();
      expect(typeof result.screenshot).toBe("string");
      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({ fullPage: false }),
      );
    });

    it("should not take screenshot by default", async () => {
      setupNormalPageEvaluate();
      const fetcher = createFetcher();
      const result = await fetcher.fetch("https://example.com");

      expect(result.screenshot).toBeUndefined();
      expect(mockPage.screenshot).not.toHaveBeenCalled();
    });
  });

  describe("timeout handling", () => {
    it("should throw FetchTimeoutError when navigation times out", async () => {
      mockPage.goto.mockRejectedValueOnce(new Error("Timeout 30000ms exceeded"));

      const fetcher = createFetcher();
      await expect(
        fetcher.fetch("https://slow-site.com", { timeoutMs: 5000 }),
      ).rejects.toThrow(FetchTimeoutError);
    });

    it("should handle generic navigation errors", async () => {
      mockPage.goto.mockRejectedValueOnce(new Error("net::ERR_CONNECTION_REFUSED"));

      const fetcher = createFetcher();
      await expect(fetcher.fetch("https://down-site.com")).rejects.toThrow(FetchNetworkError);
    });
  });

  describe("closed fetcher", () => {
    it("should throw when fetch() is called after close()", async () => {
      const fetcher = createFetcher();
      await fetcher.close();

      await expect(fetcher.fetch("https://example.com")).rejects.toThrow(FetchNetworkError);
      await expect(fetcher.fetch("https://example.com")).rejects.toThrow("closed");
    });

    it("should allow close() to be called multiple times (idempotent)", async () => {
      const fetcher = createFetcher();
      await fetcher.close();
      await fetcher.close();
      await fetcher.close();
      // Kein Error
    });

    it("should close browser on close()", async () => {
      setupNormalPageEvaluate();
      const fetcher = createFetcher();

      // Erst fetchen damit der Browser gestartet wird
      await fetcher.fetch("https://example.com");

      await fetcher.close();

      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("viewport configuration", () => {
    it("should pass custom viewport to context", async () => {
      setupNormalPageEvaluate();
      const fetcher = createFetcher();
      await fetcher.fetch("https://example.com", {
        viewport: { width: 1920, height: 1080 },
      });

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 1920, height: 1080 },
        }),
      );
    });

    it("should use default viewport when not specified", async () => {
      setupNormalPageEvaluate();
      const fetcher = createFetcher();
      await fetcher.fetch("https://example.com");

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 1280, height: 720 },
        }),
      );
    });
  });

  describe("waitForSelector option", () => {
    it("should wait for selector when provided", async () => {
      setupNormalPageEvaluate();
      const fetcher = createFetcher();
      await fetcher.fetch("https://example.com", {
        waitForSelector: "#main-content",
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        "#main-content",
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
    });
  });

  describe("context cleanup on error", () => {
    it("should close context even when fetch fails", async () => {
      mockPage.goto.mockRejectedValueOnce(new Error("Navigation failed"));

      const fetcher = createFetcher();

      await expect(fetcher.fetch("https://failing-site.com")).rejects.toThrow();

      // Context muss trotzdem geschlossen werden
      expect(mockContext.close).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * FirecrawlFetcher — Unit Tests (FC-009)
 *
 * Prueft mit gemocktem fetch():
 *  - Erfolgreicher Scrape → FetchResult
 *  - URL-Validation → rejectet private URLs VOR dem API-Call
 *  - 429 Rate Limit → Retry mit Backoff
 *  - 500 Server Error → Retry
 *  - Timeout → FetchTimeoutError
 *  - Response >5MB → FetchResponseTooLargeError
 *  - Closed fetcher → Error
 *  - Cost-Limiter Integration
 *  - Invalid JSON → FirecrawlApiError
 *  - Firecrawl Error Response → FirecrawlApiError
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FirecrawlFetcher } from "../firecrawl-fetcher.js";
import {
  FetchTimeoutError,
  FetchNetworkError,
  FirecrawlApiError,
  FetchResponseTooLargeError,
  FetchRateLimitError,
} from "../errors.js";

// ============================================================================
// Mock: globalThis.fetch
// ============================================================================

const mockFetch = vi.fn<typeof globalThis.fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================================
// Helpers
// ============================================================================

function createFetcher(overrides?: Partial<ConstructorParameters<typeof FirecrawlFetcher>[0]>) {
  return new FirecrawlFetcher({
    apiKey: "fc-testkey123456789012",
    apiUrl: "https://api.firecrawl.dev",
    maxRetries: 2,
    retryBaseMs: 10, // Schnelle Retries in Tests
    allowHttp: true, // Damit wir auch http URLs testen koennen
    ...overrides,
  });
}

function firecrawlSuccessResponse(html: string, markdown?: string): Response {
  const body: Record<string, unknown> = {
    success: true,
    data: {
      html,
      markdown: markdown ?? "# Test Page",
      metadata: {
        title: "Test Page",
        statusCode: 200,
        sourceURL: "https://example.com",
      },
    },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function firecrawlErrorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("FirecrawlFetcher", () => {
  describe("successful scrape", () => {
    it("should return FetchResult with html and markdown", async () => {
      mockFetch.mockResolvedValueOnce(
        firecrawlSuccessResponse("<html><body>Hello</body></html>", "# Hello"),
      );

      const fetcher = createFetcher();
      const result = await fetcher.fetch("https://example.com");

      expect(result.html).toBe("<html><body>Hello</body></html>");
      expect(result.markdown).toBe("# Hello");
      expect(result.metadata.fetcherType).toBe("firecrawl");
      expect(result.metadata.finalUrl).toBe("https://example.com");
      expect(result.metadata.statusCode).toBe(200);
      expect(result.metadata.title).toBe("Test Page");
      expect(result.timing.totalMs).toBeGreaterThanOrEqual(0);
    });

    it("should send correct request to Firecrawl API", async () => {
      mockFetch.mockResolvedValueOnce(firecrawlSuccessResponse("<html></html>"));

      const fetcher = createFetcher();
      await fetcher.fetch("https://example.com");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [callUrl, callInit] = mockFetch.mock.calls[0]!;
      expect(callUrl).toBe("https://api.firecrawl.dev/v1/scrape");
      expect(callInit?.method).toBe("POST");

      const headers = callInit?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["Authorization"]).toBe("Bearer fc-testkey123456789012");

      const body = JSON.parse(callInit?.body as string) as Record<string, unknown>;
      expect(body["url"]).toBe("https://example.com");
      expect(body["formats"]).toEqual(["html", "markdown"]);
    });
  });

  describe("URL validation (SSRF protection)", () => {
    it("should reject private IPs before calling API", async () => {
      const fetcher = createFetcher();

      await expect(fetcher.fetch("https://127.0.0.1/admin")).rejects.toThrow(FetchNetworkError);
      await expect(fetcher.fetch("https://192.168.1.1")).rejects.toThrow(FetchNetworkError);
      await expect(fetcher.fetch("https://10.0.0.1/api")).rejects.toThrow(FetchNetworkError);
      await expect(fetcher.fetch("https://169.254.169.254/metadata")).rejects.toThrow(FetchNetworkError);

      // fetch() darf NIE aufgerufen worden sein
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should reject localhost", async () => {
      const fetcher = createFetcher();
      await expect(fetcher.fetch("https://localhost/api")).rejects.toThrow(FetchNetworkError);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("retry logic", () => {
    it("should retry on 429 rate limit with exponential backoff", async () => {
      // Erster Call: 429, zweiter Call: 429, dritter Call: Erfolg
      mockFetch
        .mockResolvedValueOnce(firecrawlErrorResponse(429, "Rate limited"))
        .mockResolvedValueOnce(firecrawlErrorResponse(429, "Rate limited"))
        .mockResolvedValueOnce(firecrawlSuccessResponse("<html>OK</html>"));

      const fetcher = createFetcher({ maxRetries: 2, retryBaseMs: 1 });
      const result = await fetcher.fetch("https://example.com");

      expect(result.html).toBe("<html>OK</html>");
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should retry on 500 server error", async () => {
      mockFetch
        .mockResolvedValueOnce(firecrawlErrorResponse(500, "Internal Server Error"))
        .mockResolvedValueOnce(firecrawlSuccessResponse("<html>OK</html>"));

      const fetcher = createFetcher({ maxRetries: 2, retryBaseMs: 1 });
      const result = await fetcher.fetch("https://example.com");

      expect(result.html).toBe("<html>OK</html>");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should throw after max retries exceeded", async () => {
      // Jeder Call braucht ein frisches Response-Objekt (Body kann nur einmal gelesen werden)
      mockFetch
        .mockResolvedValueOnce(firecrawlErrorResponse(500, "Internal Server Error"))
        .mockResolvedValueOnce(firecrawlErrorResponse(500, "Internal Server Error"))
        .mockResolvedValueOnce(firecrawlErrorResponse(500, "Internal Server Error"));

      const fetcher = createFetcher({ maxRetries: 2, retryBaseMs: 1 });

      await expect(fetcher.fetch("https://example.com")).rejects.toThrow(FirecrawlApiError);
      // Initial + 2 retries = 3 calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should NOT retry on 401 (client error)", async () => {
      mockFetch.mockResolvedValueOnce(firecrawlErrorResponse(401, "Unauthorized"));

      const fetcher = createFetcher({ maxRetries: 2, retryBaseMs: 1 });

      await expect(fetcher.fetch("https://example.com")).rejects.toThrow(FirecrawlApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should NOT retry on 404 (client error)", async () => {
      mockFetch.mockResolvedValueOnce(firecrawlErrorResponse(404, "Not Found"));

      const fetcher = createFetcher({ maxRetries: 2, retryBaseMs: 1 });

      await expect(fetcher.fetch("https://example.com")).rejects.toThrow(FirecrawlApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("timeout handling", () => {
    it("should throw FetchTimeoutError when request times out", async () => {
      mockFetch.mockImplementationOnce(() => {
        const err = new DOMException("The operation was aborted", "AbortError");
        return Promise.reject(err);
      });

      const fetcher = createFetcher();
      await expect(
        fetcher.fetch("https://example.com", { timeoutMs: 100 }),
      ).rejects.toThrow(FetchTimeoutError);
    });

    it("should NOT retry timeout errors", async () => {
      mockFetch.mockImplementation(() => {
        const err = new DOMException("The operation was aborted", "AbortError");
        return Promise.reject(err);
      });

      const fetcher = createFetcher({ maxRetries: 2 });
      await expect(
        fetcher.fetch("https://example.com", { timeoutMs: 100 }),
      ).rejects.toThrow(FetchTimeoutError);

      // Nur 1 Call, kein Retry
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("response size limit", () => {
    it("should reject response exceeding size limit via Content-Length header", async () => {
      const response = new Response("x", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(6 * 1024 * 1024), // 6MB
        },
      });
      mockFetch.mockResolvedValueOnce(response);

      const fetcher = createFetcher({ maxResponseSizeMb: 5 });
      await expect(fetcher.fetch("https://example.com")).rejects.toThrow(FetchResponseTooLargeError);
    });

    it("should reject response exceeding size limit by body size", async () => {
      // Kein Content-Length Header, aber Body ist zu gross
      const bigBody = JSON.stringify({
        success: true,
        data: { html: "x".repeat(6 * 1024 * 1024) },
      });
      const response = new Response(bigBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      mockFetch.mockResolvedValueOnce(response);

      const fetcher = createFetcher({ maxResponseSizeMb: 5 });
      await expect(fetcher.fetch("https://example.com")).rejects.toThrow(FetchResponseTooLargeError);
    });

    it("should NOT retry response-too-large errors", async () => {
      const response = new Response("x", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(6 * 1024 * 1024),
        },
      });
      mockFetch.mockResolvedValue(response);

      const fetcher = createFetcher({ maxResponseSizeMb: 5, maxRetries: 2 });
      await expect(fetcher.fetch("https://example.com")).rejects.toThrow(FetchResponseTooLargeError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should allow response within size limit", async () => {
      mockFetch.mockResolvedValueOnce(firecrawlSuccessResponse("<html>small</html>"));

      const fetcher = createFetcher({ maxResponseSizeMb: 5 });
      const result = await fetcher.fetch("https://example.com");
      expect(result.html).toBe("<html>small</html>");
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
  });

  describe("cost-limiter integration", () => {
    it("should reject when minute limit is exceeded", async () => {
      // Jeder Call braucht ein frisches Response-Objekt
      mockFetch.mockImplementation(() =>
        Promise.resolve(firecrawlSuccessResponse("<html></html>")),
      );

      const fetcher = createFetcher({
        costLimiter: { maxPerMinute: 3, maxPerHour: 100 },
      });

      // 3 Calls erfolgreich
      await fetcher.fetch("https://example.com");
      await fetcher.fetch("https://example.com");
      await fetcher.fetch("https://example.com");

      // 4. Call → FetchRateLimitError
      await expect(fetcher.fetch("https://example.com")).rejects.toThrow(FetchRateLimitError);
    });
  });

  describe("error responses", () => {
    it("should throw FirecrawlApiError for invalid JSON", async () => {
      mockFetch.mockResolvedValueOnce(new Response("not json", { status: 200 }));

      const fetcher = createFetcher();
      await expect(fetcher.fetch("https://example.com")).rejects.toThrow(FirecrawlApiError);
    });

    it("should throw FirecrawlApiError for unsuccessful firecrawl response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: "Page not found" }), { status: 200 }),
      );

      const fetcher = createFetcher();
      await expect(fetcher.fetch("https://example.com")).rejects.toThrow(FirecrawlApiError);
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const fetcher = createFetcher();
      await expect(fetcher.fetch("https://example.com")).rejects.toThrow(FetchNetworkError);
    });

    it("should handle empty HTML without throwing", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { html: "", markdown: "", metadata: {} },
          }),
          { status: 200 },
        ),
      );

      const fetcher = createFetcher();
      const result = await fetcher.fetch("https://example.com");
      expect(result.html).toBe("");
    });
  });

  describe("redirect-SSRF protection (FC-001a)", () => {
    it("should reject when Firecrawl reports redirect to private IP", async () => {
      // Firecrawl folgt dem Redirect serverseitig und liefert sourceURL = interne IP
      const body = {
        success: true,
        data: {
          html: "<html>AWS metadata</html>",
          markdown: "# AWS metadata",
          metadata: {
            title: "Instance Metadata",
            statusCode: 200,
            sourceURL: "http://169.254.169.254/latest/meta-data/",
          },
        },
      };
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const fetcher = createFetcher();
      await expect(
        fetcher.fetch("https://evil.com/redirect"),
      ).rejects.toThrow(FetchNetworkError);
    });

    it("should reject when Firecrawl reports redirect to localhost", async () => {
      const body = {
        success: true,
        data: {
          html: "<html>internal</html>",
          markdown: "# internal",
          metadata: {
            title: "Internal",
            statusCode: 200,
            sourceURL: "http://localhost:9200/_cat/indices",
          },
        },
      };
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const fetcher = createFetcher();
      await expect(
        fetcher.fetch("https://evil.com/redirect"),
      ).rejects.toThrow(FetchNetworkError);
    });

    it("should accept when sourceURL is a valid public redirect", async () => {
      const body = {
        success: true,
        data: {
          html: "<html>redirected</html>",
          markdown: "# Redirected",
          metadata: {
            title: "Redirected",
            statusCode: 200,
            sourceURL: "https://www.example.com/new-page",
          },
        },
      };
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const fetcher = createFetcher();
      const result = await fetcher.fetch("https://example.com/old-page");
      expect(result.metadata.finalUrl).toBe("https://www.example.com/new-page");
    });
  });

  describe("name property", () => {
    it("should be 'firecrawl'", () => {
      const fetcher = createFetcher();
      expect(fetcher.name).toBe("firecrawl");
    });
  });
});

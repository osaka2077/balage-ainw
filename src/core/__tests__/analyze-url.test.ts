/**
 * analyzeFromURL — Unit Tests (FC-010)
 *
 * Prueft mit gemocktem Fetcher + gemocktem analyzeFromHTML:
 *  - URL Validation → rejectet ungueltige URLs
 *  - Fetcher wird erstellt und aufgeraeumt (close im finally)
 *  - HTML wird an analyzeFromHTML weitergegeben
 *  - Fetch-Timing und Metadata werden gemerged
 *  - Error-Propagation von Fetcher-Errors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AnalysisResult } from "../types.js";
import type { PageFetcher, FetchResult } from "../../fetcher/types.js";

// ============================================================================
// Mocks
// ============================================================================

// Mock createFetcher — gibt unseren Mock-Fetcher zurueck
const mockFetch = vi.fn<PageFetcher["fetch"]>();
const mockClose = vi.fn<PageFetcher["close"]>();

const mockFetcher: PageFetcher = {
  name: "mock-firecrawl",
  fetch: mockFetch,
  close: mockClose,
};

vi.mock("../../fetcher/create-fetcher.js", () => ({
  createFetcher: vi.fn(() => mockFetcher),
}));

// Mock analyzeFromHTML — keine echte Analyse noetig
const mockAnalyzeFromHTML = vi.fn<typeof import("../analyze.js").analyzeFromHTML>();

vi.mock("../analyze.js", () => ({
  analyzeFromHTML: (...args: Parameters<typeof import("../analyze.js").analyzeFromHTML>) =>
    mockAnalyzeFromHTML(...args),
}));

// Jetzt den echten Code importieren (nach den Mocks)
const { analyzeFromURL } = await import("../analyze-url.js");
const { createFetcher } = await import("../../fetcher/create-fetcher.js");

// ============================================================================
// Helpers
// ============================================================================

function createMockFetchResult(html: string): FetchResult {
  return {
    html,
    markdown: "# Mock",
    metadata: {
      finalUrl: "https://example.com",
      statusCode: 200,
      title: "Example Page",
      botProtection: null,
      cookieBannerDismissed: false,
      fetcherType: "firecrawl",
    },
    timing: { totalMs: 150 },
  };
}

function createMockAnalysisResult(): AnalysisResult {
  return {
    endpoints: [
      {
        type: "auth",
        label: "Login Form",
        description: "User authentication form",
        confidence: 0.85,
        affordances: ["fill", "submit"],
        evidence: ["Heuristic: form with password field"],
      },
    ],
    framework: undefined,
    timing: { totalMs: 50, llmCalls: 0 },
    meta: {
      url: "https://example.com",
      mode: "heuristic",
      version: "0.6.0",
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("analyzeFromURL", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockClose.mockReset();
    mockAnalyzeFromHTML.mockReset();
    vi.mocked(createFetcher).mockReturnValue(mockFetcher);
    mockClose.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("successful analysis", () => {
    it("should fetch HTML and return analysis result with merged metadata", async () => {
      const fetchResult = createMockFetchResult("<html><body>Hello</body></html>");
      const analysisResult = createMockAnalysisResult();

      mockFetch.mockResolvedValueOnce(fetchResult);
      mockAnalyzeFromHTML.mockResolvedValueOnce(analysisResult);

      const result = await analyzeFromURL("https://example.com");

      // Endpoints kommen durch
      expect(result.endpoints).toHaveLength(1);
      expect(result.endpoints[0]!.type).toBe("auth");

      // Fetch-Metadata wird gemerged
      expect(result.meta.fetcherType).toBe("firecrawl");
      expect(result.meta.fetchTimingMs).toBeGreaterThanOrEqual(0);

      // Timing addiert Fetch + Analyse
      expect(result.timing.totalMs).toBeGreaterThanOrEqual(50);
    });

    it("should pass HTML from fetcher to analyzeFromHTML", async () => {
      const html = "<html><body><form id='login'></form></body></html>";
      mockFetch.mockResolvedValueOnce(createMockFetchResult(html));
      mockAnalyzeFromHTML.mockResolvedValueOnce(createMockAnalysisResult());

      await analyzeFromURL("https://example.com");

      expect(mockAnalyzeFromHTML).toHaveBeenCalledTimes(1);
      const [passedHtml] = mockAnalyzeFromHTML.mock.calls[0]!;
      expect(passedHtml).toBe(html);
    });

    it("should pass options through to analyzeFromHTML", async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResult("<html></html>"));
      mockAnalyzeFromHTML.mockResolvedValueOnce(createMockAnalysisResult());

      await analyzeFromURL("https://example.com", {
        llm: false,
        minConfidence: 0.7,
        maxEndpoints: 5,
      });

      const [, passedOptions] = mockAnalyzeFromHTML.mock.calls[0]!;
      expect(passedOptions?.llm).toBe(false);
      expect(passedOptions?.minConfidence).toBe(0.7);
      expect(passedOptions?.maxEndpoints).toBe(5);
    });

    it("should use finalUrl from fetcher as url for analysis", async () => {
      const fetchResult = createMockFetchResult("<html></html>");
      fetchResult.metadata.finalUrl = "https://example.com/after-redirect";

      mockFetch.mockResolvedValueOnce(fetchResult);
      mockAnalyzeFromHTML.mockResolvedValueOnce(createMockAnalysisResult());

      await analyzeFromURL("https://example.com");

      const [, passedOptions] = mockAnalyzeFromHTML.mock.calls[0]!;
      expect(passedOptions?.url).toBe("https://example.com/after-redirect");
    });
  });

  describe("fetcher lifecycle", () => {
    it("should close fetcher after successful analysis", async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResult("<html></html>"));
      mockAnalyzeFromHTML.mockResolvedValueOnce(createMockAnalysisResult());

      await analyzeFromURL("https://example.com");

      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it("should close fetcher even when fetch fails", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(analyzeFromURL("https://example.com")).rejects.toThrow();

      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it("should close fetcher even when analysis fails", async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResult("<html></html>"));
      mockAnalyzeFromHTML.mockRejectedValueOnce(new Error("Analysis error"));

      await expect(analyzeFromURL("https://example.com")).rejects.toThrow("Analysis error");

      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("URL validation", () => {
    it("should reject empty URL", async () => {
      await expect(analyzeFromURL("")).rejects.toThrow("URL is required");
    });

    it("should reject non-string URL", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(analyzeFromURL(null as any)).rejects.toThrow("URL is required");
    });

    it("should reject private IP addresses", async () => {
      await expect(analyzeFromURL("https://127.0.0.1")).rejects.toThrow("Invalid URL");
      await expect(analyzeFromURL("https://192.168.1.1")).rejects.toThrow("Invalid URL");
    });

    it("should reject localhost", async () => {
      await expect(analyzeFromURL("https://localhost")).rejects.toThrow("Invalid URL");
    });

    it("should reject non-http(s) protocols", async () => {
      await expect(analyzeFromURL("ftp://example.com")).rejects.toThrow("Invalid URL");
      await expect(analyzeFromURL("file:///etc/passwd")).rejects.toThrow("Invalid URL");
    });

    it("should not call fetcher for invalid URLs", async () => {
      try {
        await analyzeFromURL("https://127.0.0.1");
      } catch {
        // Expected
      }

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("fetcher configuration", () => {
    it("should pass fetcherProvider to createFetcher", async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResult("<html></html>"));
      mockAnalyzeFromHTML.mockResolvedValueOnce(createMockAnalysisResult());

      await analyzeFromURL("https://example.com", {
        fetcherProvider: "firecrawl",
        firecrawlApiKey: "fc-test12345678901234",
      });

      expect(createFetcher).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "firecrawl",
          firecrawlApiKey: "fc-test12345678901234",
        }),
      );
    });

    it("should default to 'auto' provider", async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResult("<html></html>"));
      mockAnalyzeFromHTML.mockResolvedValueOnce(createMockAnalysisResult());

      await analyzeFromURL("https://example.com");

      expect(createFetcher).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "auto",
        }),
      );
    });
  });
});

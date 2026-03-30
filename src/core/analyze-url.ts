/**
 * analyzeFromURL — URL-based Analysis API (FC-010)
 *
 * High-level entry point for analyzing a web page by URL. Handles the full
 * lifecycle: URL validation (SSRF protection), page fetching (via Firecrawl
 * Cloud or Playwright), and semantic endpoint detection.
 *
 * This is the recommended API when you have a URL and want endpoints back.
 * For pre-fetched HTML, use {@link analyzeFromHTML} instead.
 *
 * **Flow:**
 *  1. Validate URL against SSRF attacks ({@link validateFetchUrl})
 *  2. Create a PageFetcher via {@link createFetcher} (auto-detects provider)
 *  3. Fetch the rendered HTML (+ optional Markdown via Firecrawl)
 *  4. If Markdown-Context is enabled (FC-018/019), extract summary and page type
 *  5. Pass HTML + context to {@link analyzeFromHTML} for semantic analysis
 *  6. Merge fetch metadata (provider type, timing) into the result
 *  7. Close the fetcher (always, even on error)
 *
 * **Provider auto-detection:**
 * - Firecrawl Cloud when `BALAGE_FIRECRAWL_API_KEY` is set and `BALAGE_FIRECRAWL_ENABLED=true`
 * - Playwright (local headless browser) as fallback
 * - Override with `fetcherProvider: "firecrawl" | "playwright"` in options
 *
 * **Security:** URLs are validated before any network request. Private IPs,
 * cloud metadata endpoints, internal TLDs, and non-HTTPS schemes are blocked.
 * See `docs/security/FIRECRAWL-SECURITY-GUIDE.md` for details.
 *
 * @module analyze-url
 */

import pino from "pino";
import { analyzeFromHTML } from "./analyze.js";
import { createFetcher } from "../fetcher/create-fetcher.js";
import { validateFetchUrl } from "../security/url-validator.js";
import {
  isMarkdownContextEnabled,
  extractMarkdownSummary,
  classifyPageType,
} from "../semantic/markdown-context.js";
import type { AnalysisResult, AnalyzeFromURLOptions } from "./types.js";
import { BalageInputError } from "./types.js";

const logger = pino({
  name: "balage:analyze-url",
  level: process.env["LOG_LEVEL"] ?? "silent",
});

/**
 * Analyze a web page by URL. Fetches HTML via Firecrawl or Playwright,
 * then runs the semantic analysis pipeline.
 *
 * The function auto-detects the best available fetcher based on environment
 * configuration. Pass `fetcherProvider` to force a specific provider.
 *
 * @param url - Public HTTPS URL to analyze. Must pass SSRF validation.
 *   HTTP URLs are rejected unless `allowHttp: true` is set (development only).
 * @param options - Combined analysis and fetcher configuration.
 *   Extends {@link AnalyzeOptions} with fetcher-specific fields.
 * @returns {@link AnalysisResult} with detected endpoints, framework info,
 *   timing breakdown, and fetch metadata (`meta.fetcherType`, `meta.fetchTimingMs`).
 *
 * @throws {BalageInputError} When URL is empty, malformed, or points to a
 *   private/internal address (SSRF protection).
 * @throws {FetchTimeoutError} When the page fetch exceeds the configured
 *   timeout (default: 30 seconds).
 * @throws {FetchNetworkError} When a network-level error occurs during fetch
 *   (DNS failure, connection refused, TLS error).
 * @throws {FetchRateLimitError} When the in-memory cost limiter is exceeded
 *   (default: 10 calls/min, 100 calls/hour).
 * @throws {FetchResponseTooLargeError} When the page exceeds the response
 *   size limit (default: 5 MB, configurable via `maxResponseSizeMb`).
 * @throws {FetchConfigError} When the requested provider is not available
 *   (e.g., Firecrawl requested but no API key configured).
 * @throws {BalageLLMError} When the LLM provider returns an error
 *   (only when `llm` option is configured, not in heuristic mode).
 *
 * @example Heuristic mode (no API keys needed for analysis)
 * ```typescript
 * import { analyzeFromURL } from "balage";
 *
 * const result = await analyzeFromURL("https://github.com/login", {
 *   llm: false,
 * });
 * console.log(result.endpoints);       // DetectedEndpoint[]
 * console.log(result.meta.fetcherType); // "firecrawl" | "playwright"
 * console.log(result.meta.fetchTimingMs); // e.g. 890
 * ```
 *
 * @example With explicit Firecrawl provider
 * ```typescript
 * const result = await analyzeFromURL("https://stripe.com/docs", {
 *   llm: false,
 *   fetcherProvider: "firecrawl",
 *   firecrawlApiKey: process.env.BALAGE_FIRECRAWL_API_KEY,
 * });
 * ```
 *
 * @example Filter results by endpoint type
 * ```typescript
 * const result = await analyzeFromURL("https://example.com/checkout", { llm: false });
 * const authEndpoints = result.endpoints.filter(ep => ep.type === "auth");
 * const formEndpoints = result.endpoints.filter(ep => ep.type === "form");
 * console.log(`${authEndpoints.length} auth, ${formEndpoints.length} form endpoints`);
 * ```
 */
export async function analyzeFromURL(
  url: string,
  options: AnalyzeFromURLOptions = {},
): Promise<AnalysisResult> {
  // --- Input Validation ---
  if (!url || typeof url !== "string") {
    throw new BalageInputError("URL is required and must be a non-empty string");
  }

  // --- SECURITY: URL validieren VOR allem anderen ---
  const validation = validateFetchUrl(url, { allowHttp: options.allowHttp });
  if (!validation.valid) {
    throw new BalageInputError(`Invalid URL: ${validation.reason}`);
  }

  logger.info({ url, provider: options.fetcherProvider ?? "auto" }, "Starting URL analysis");

  // --- Fetcher erzeugen ---
  const fetcher = createFetcher({
    provider: options.fetcherProvider ?? "auto",
    firecrawlApiKey: options.firecrawlApiKey,
    firecrawlApiUrl: options.firecrawlApiUrl,
    maxResponseSizeMb: options.maxResponseSizeMb,
    allowHttp: options.allowHttp,
  });

  try {
    // --- HTML fetchen ---
    const fetchStart = performance.now();
    const fetchResult = await fetcher.fetch(url, {
      timeoutMs: options.url ? undefined : 30_000,
    });
    const fetchTimingMs = Math.round(performance.now() - fetchStart);

    logger.debug(
      { url, fetcherType: fetchResult.metadata.fetcherType, fetchTimingMs, htmlLength: fetchResult.html.length },
      "Fetch completed",
    );

    // --- FC-018/019: Markdown-Context vorbereiten (wenn Feature-Flag aktiv) ---
    let markdownSummary: string | undefined;
    let pageType: string | undefined;

    if (isMarkdownContextEnabled() && fetchResult.markdown) {
      markdownSummary = extractMarkdownSummary(fetchResult.markdown);
      pageType = classifyPageType(fetchResult.markdown);
      logger.debug(
        { pageType, summaryLength: markdownSummary.length, markdownLength: fetchResult.markdown.length },
        "Markdown context prepared",
      );
    }

    // --- Analyse ausfuehren ---
    const analysisResult = await analyzeFromHTML(fetchResult.html, {
      ...options,
      url: fetchResult.metadata.finalUrl ?? url,
      markdownSummary,
      pageType,
    });

    // --- Fetch-Metadata ins Ergebnis mergen ---
    return {
      ...analysisResult,
      timing: {
        ...analysisResult.timing,
        totalMs: analysisResult.timing.totalMs + fetchTimingMs,
      },
      meta: {
        ...analysisResult.meta,
        fetcherType: fetchResult.metadata.fetcherType,
        fetchTimingMs,
      },
    };
  } finally {
    // --- Fetcher aufraeuemen (immer, auch bei Error) ---
    try {
      await fetcher.close();
    } catch (closeErr) {
      logger.warn({ err: closeErr }, "Error closing fetcher (non-fatal)");
    }
  }
}

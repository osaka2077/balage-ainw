/**
 * analyzeFromURL — URL-based Analysis API (FC-010)
 *
 * Wrapper um analyzeFromHTML: Fetcht HTML via PageFetcher (Firecrawl oder
 * Playwright) und leitet es an die bestehende Analyse-Pipeline weiter.
 *
 * Flow:
 *  1. URL validieren (SSRF-Schutz)
 *  2. PageFetcher erzeugen via createFetcher()
 *  3. HTML fetchen
 *  4. analyzeFromHTML() aufrufen
 *  5. Fetch-Metadata/Timing ins Ergebnis mergen
 *  6. Fetcher schliessen (finally)
 *
 * Eigene Datei (nicht in analyze.ts) — ARCHITECT-Entscheidung:
 * Haelt die bestehende analyze.ts schlank und die URL-Fetching-Logik isoliert.
 */

import pino from "pino";
import { analyzeFromHTML } from "./analyze.js";
import { createFetcher } from "../fetcher/create-fetcher.js";
import { validateFetchUrl } from "../security/url-validator.js";
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
 * @param url - Public HTTPS URL to analyze
 * @param options - Analysis + Fetcher configuration
 * @returns AnalysisResult with endpoints, framework, timing, and fetch metadata
 *
 * @throws {BalageInputError} When URL is invalid or points to private address
 * @throws {FetchTimeoutError} When page fetch times out
 * @throws {FetchNetworkError} When network error occurs during fetch
 * @throws {FetchRateLimitError} When cost limiter is exceeded
 * @throws {BalageLLMError} When LLM provider returns an error
 *
 * @example
 * ```typescript
 * const result = await analyzeFromURL("https://github.com/login", {
 *   llm: false,
 *   firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
 * });
 * console.log(result.endpoints);
 * console.log(result.meta.fetcherType); // "firecrawl"
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

    // --- Analyse ausfuehren ---
    const analysisResult = await analyzeFromHTML(fetchResult.html, {
      ...options,
      url: fetchResult.metadata.finalUrl ?? url,
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

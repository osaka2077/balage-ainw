/**
 * FirecrawlFetcher — Firecrawl API Integration (FC-009)
 *
 * {@link PageFetcher} implementation that fetches rendered HTML from the
 * [Firecrawl API](https://firecrawl.dev). Uses native `fetch()` — no
 * `@mendable/firecrawl-js` SDK dependency required.
 *
 * **API endpoint:** `POST /v1/scrape` on the configured Firecrawl instance.
 * Always requests both `html` and `markdown` formats.
 *
 * **Security layers:**
 * - {@link validateFetchUrl} is called before every API request (SSRF protection)
 * - Response size is checked against a configurable limit (default: 5 MB)
 * - API keys are redacted from all error messages via {@link redactApiKeys}
 * - {@link CostLimiter} enforces per-minute and per-hour call limits
 *
 * **Resilience:**
 * - Automatic retry with exponential backoff on 429 (rate limit) and 5xx errors
 * - Configurable max retries (default: 2) and base delay (default: 1000 ms)
 * - Timeout via `AbortController` (default: 30 seconds)
 * - No retry on timeouts or oversized responses (fail fast)
 *
 * **Usage:**
 * Typically created via {@link createFetcher} rather than directly.
 *
 * @example Direct instantiation (advanced)
 * ```typescript
 * import { FirecrawlFetcher } from "balage/fetcher";
 *
 * const fetcher = new FirecrawlFetcher({
 *   apiKey: process.env.BALAGE_FIRECRAWL_API_KEY!,
 *   apiUrl: "https://api.firecrawl.dev",
 *   maxRetries: 2,
 *   maxResponseSizeMb: 5,
 * });
 *
 * try {
 *   const result = await fetcher.fetch("https://github.com/login");
 *   console.log(result.html.length);        // raw HTML
 *   console.log(result.markdown?.length);    // Markdown representation
 *   console.log(result.metadata.fetcherType); // "firecrawl"
 * } finally {
 *   await fetcher.close();
 * }
 * ```
 *
 * @module firecrawl-fetcher
 */

import pino from "pino";
import type { PageFetcher, FetchOptions, FetchResult, ResolvedFetchOptions } from "./types.js";
import { FetchOptionsSchema } from "./types.js";
import {
  FetchTimeoutError,
  FetchNetworkError,
  FirecrawlApiError,
  FetchResponseTooLargeError,
} from "./errors.js";
import { validateFetchUrl } from "../security/url-validator.js";
import { CostLimiter } from "./cost-limiter.js";
import type { CostLimiterConfig } from "./cost-limiter.js";

const logger = pino({
  name: "fetcher:firecrawl",
  level: process.env["LOG_LEVEL"] ?? "silent",
});

// ============================================================================
// Config
// ============================================================================

/**
 * Configuration for {@link FirecrawlFetcher}.
 *
 * Only `apiKey` is required. All other fields have sensible defaults
 * suitable for production use with Firecrawl Cloud.
 *
 * For self-hosted Firecrawl instances, set `apiUrl` to your endpoint.
 *
 * @example
 * ```typescript
 * const config: FirecrawlFetcherConfig = {
 *   apiKey: process.env.BALAGE_FIRECRAWL_API_KEY!,
 *   apiUrl: "https://firecrawl.internal.company.com",  // self-hosted
 *   maxRetries: 3,
 *   maxResponseSizeMb: 10,
 * };
 * ```
 */
export interface FirecrawlFetcherConfig {
  /** Firecrawl API key. Required. Obtain from https://firecrawl.dev. */
  apiKey: string;

  /**
   * Firecrawl API base URL.
   * @default "https://api.firecrawl.dev"
   */
  apiUrl?: string;

  /**
   * Maximum number of retries on 429 (rate limit) or 5xx (server error).
   * Uses exponential backoff: `retryBaseMs * 2^attempt`.
   * @default 2
   */
  maxRetries?: number;

  /**
   * Base delay for exponential backoff in milliseconds.
   * Actual delay: `retryBaseMs * 2^attempt` (e.g., 1000, 2000, 4000).
   * @default 1000
   */
  retryBaseMs?: number;

  /**
   * Maximum allowed response size in megabytes. Responses exceeding this
   * limit are rejected with {@link FetchResponseTooLargeError}.
   * @default 5
   */
  maxResponseSizeMb?: number;

  /**
   * Allow `http://` URLs (no TLS). **Never enable in production.**
   * Only for local development against `http://localhost`.
   * @default false
   */
  allowHttp?: boolean;

  /**
   * In-memory rate limiter configuration. Prevents runaway API usage.
   * @default { maxPerMinute: 10, maxPerHour: 100 }
   */
  costLimiter?: Partial<CostLimiterConfig>;
}

// Resolved Defaults
const DEFAULT_API_URL = "https://api.firecrawl.dev";
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_MS = 1000;
const DEFAULT_MAX_RESPONSE_SIZE_MB = 5;

// ============================================================================
// Firecrawl API Response Types (minimal, nur was wir brauchen)
// ============================================================================

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    html?: string;
    markdown?: string;
    metadata?: {
      title?: string;
      statusCode?: number;
      sourceURL?: string;
    };
  };
  error?: string;
}

// ============================================================================
// FirecrawlFetcher
// ============================================================================

export class FirecrawlFetcher implements PageFetcher {
  readonly name = "firecrawl";

  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly maxResponseSizeMb: number;
  private readonly allowHttp: boolean;
  private readonly costLimiter: CostLimiter;
  private closed = false;

  constructor(config: FirecrawlFetcherConfig) {
    this.apiKey = config.apiKey;
    this.apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "");
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseMs = config.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.maxResponseSizeMb = config.maxResponseSizeMb ?? DEFAULT_MAX_RESPONSE_SIZE_MB;
    this.allowHttp = config.allowHttp ?? false;
    this.costLimiter = new CostLimiter(config.costLimiter);
  }

  async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    if (this.closed) {
      throw new FetchNetworkError(url, "FirecrawlFetcher is closed");
    }

    // --- Resolve Options mit Defaults ---
    const resolved: ResolvedFetchOptions = FetchOptionsSchema.parse(options ?? {});

    // --- SECURITY: URL validieren VOR dem Firecrawl-Call ---
    const validation = validateFetchUrl(url, { allowHttp: this.allowHttp });
    if (!validation.valid) {
      throw new FetchNetworkError(url, `URL rejected: ${validation.reason}`);
    }

    // --- COST: Rate-Limit pruefen ---
    this.costLimiter.check(url);

    // --- Fetch mit Retry ---
    const start = performance.now();
    const result = await this.fetchWithRetry(url, resolved, 0);
    const totalMs = Math.round(performance.now() - start);

    // --- Cost-Limiter: erfolgreichen Call registrieren ---
    this.costLimiter.record();

    return {
      ...result,
      timing: { ...result.timing, totalMs },
    };
  }

  async close(): Promise<void> {
    // Idempotent — mehrfach-Aufruf sicher
    this.closed = true;
  }

  // ==========================================================================
  // Private: Fetch mit Retry
  // ==========================================================================

  private async fetchWithRetry(
    url: string,
    options: ResolvedFetchOptions,
    attempt: number,
  ): Promise<FetchResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await this.callFirecrawlApi(url, options, controller.signal);
      return response;
    } catch (err) {
      // Timeout → keine Retries
      if (err instanceof FetchTimeoutError) {
        throw err;
      }

      // Response zu gross → keine Retries
      if (err instanceof FetchResponseTooLargeError) {
        throw err;
      }

      // Retryable Errors: 429 Rate Limit oder 5xx Server Errors
      if (err instanceof FirecrawlApiError && this.isRetryable(err) && attempt < this.maxRetries) {
        const delay = this.retryBaseMs * Math.pow(2, attempt);
        logger.warn(
          { url, attempt: attempt + 1, maxRetries: this.maxRetries, delayMs: delay, statusCode: err.statusCode },
          "Retrying Firecrawl call",
        );
        await this.sleep(delay);
        return this.fetchWithRetry(url, options, attempt + 1);
      }

      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async callFirecrawlApi(
    url: string,
    _options: ResolvedFetchOptions,
    signal: AbortSignal,
  ): Promise<FetchResult> {
    const endpoint = `${this.apiUrl}/v1/scrape`;
    const body = JSON.stringify({
      url,
      formats: ["html", "markdown"],
    });

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body,
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new FetchTimeoutError(url, _options.timeoutMs);
      }
      // Node.js fetch: AbortError kann auch als regulaerer Error kommen
      if (err instanceof Error && err.name === "AbortError") {
        throw new FetchTimeoutError(url, _options.timeoutMs);
      }
      throw new FetchNetworkError(
        url,
        err instanceof Error ? err.message : String(err),
        { cause: err instanceof Error ? err : undefined },
      );
    }

    // --- Response-Size-Limit pruefen (Content-Length Header) ---
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const sizeMb = parseInt(contentLength, 10) / (1024 * 1024);
      if (sizeMb > this.maxResponseSizeMb) {
        throw new FetchResponseTooLargeError(url, sizeMb, this.maxResponseSizeMb);
      }
    }

    // --- Response Body lesen und Groesse pruefen ---
    const responseText = await response.text();
    const actualSizeMb = new TextEncoder().encode(responseText).byteLength / (1024 * 1024);
    if (actualSizeMb > this.maxResponseSizeMb) {
      throw new FetchResponseTooLargeError(url, actualSizeMb, this.maxResponseSizeMb);
    }

    // --- HTTP Error Handling ---
    if (!response.ok) {
      throw new FirecrawlApiError(
        `HTTP ${response.status}: ${responseText.slice(0, 500)}`,
        url,
        response.status,
      );
    }

    // --- JSON parsen ---
    let data: FirecrawlScrapeResponse;
    try {
      data = JSON.parse(responseText) as FirecrawlScrapeResponse;
    } catch {
      throw new FirecrawlApiError("Invalid JSON response from Firecrawl", url);
    }

    // --- Firecrawl Error Response ---
    if (!data.success || !data.data) {
      throw new FirecrawlApiError(
        data.error ?? "Firecrawl returned unsuccessful response",
        url,
      );
    }

    // --- HTML ist Pflicht ---
    const html = data.data.html ?? "";
    if (html.length === 0) {
      logger.warn({ url }, "Firecrawl returned empty HTML");
    }

    return {
      html,
      markdown: data.data.markdown,
      metadata: {
        finalUrl: data.data.metadata?.sourceURL ?? url,
        statusCode: data.data.metadata?.statusCode ?? 200,
        title: data.data.metadata?.title ?? "",
        botProtection: null,
        cookieBannerDismissed: false,
        fetcherType: "firecrawl",
      },
      timing: {
        totalMs: 0, // Wird vom Aufrufer ueberschrieben
      },
    };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private isRetryable(err: FirecrawlApiError): boolean {
    if (err.statusCode === 429) return true;
    if (err.statusCode !== undefined && err.statusCode >= 500) return true;
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

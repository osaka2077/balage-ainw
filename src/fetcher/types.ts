/**
 * PageFetcher Interface + Types (FC-005)
 *
 * Unified abstraction for fetching rendered web pages. All page fetchers
 * (Firecrawl, Playwright, future providers) implement the {@link PageFetcher}
 * interface, enabling transparent provider switching.
 *
 * **Type system:** Zod-first schemas with inferred TypeScript types.
 * `z.input` types represent the user-facing API (all fields optional),
 * `z.output` types have all defaults resolved.
 *
 * **Key types:**
 * - {@link PageFetcher} — The interface all fetchers implement
 * - {@link FetchOptions} — User-facing options (timeouts, viewport, headers)
 * - {@link FetchResult} — Return type with HTML, metadata, and timing
 * - {@link FetcherProvider} — `"firecrawl" | "playwright" | "auto"`
 *
 * @module fetcher/types
 */

import { z } from "zod";

// ============================================================================
// Zod Schemas
// ============================================================================

export const FetchOptionsSchema = z.object({
  /** Timeout fuer die gesamte Fetch-Operation in ms. Default: 30000 */
  timeoutMs: z.number().int().positive().default(30_000),

  /** CSS-Selector auf den gewartet wird bevor HTML gecaptured wird. Optional. */
  waitForSelector: z.string().max(512).optional(),

  /** Cookie/Consent-Banner automatisch wegklicken. Default: true */
  dismissCookies: z.boolean().default(true),

  /** Screenshot neben HTML capturen. Default: false */
  screenshot: z.boolean().default(false),

  /** Viewport-Dimensionen. Default: 1280x720 */
  viewport: z.object({
    width: z.number().int().positive().default(1280),
    height: z.number().int().positive().default(720),
  }).default({}),

  /** HTTP-Headers die mit dem Request gesendet werden. */
  headers: z.record(z.string()).default({}),
});

/** User-facing Options (alles optional) */
export type FetchOptions = z.input<typeof FetchOptionsSchema>;

/** Resolved Options mit allen Defaults */
export type ResolvedFetchOptions = z.output<typeof FetchOptionsSchema>;

// ---------------------------------------------------------------------------

export const FetchMetadataSchema = z.object({
  /** Finale URL nach Redirects. */
  finalUrl: z.string(),

  /** HTTP Status Code. */
  statusCode: z.number().int(),

  /** Seitentitel aus <title>. */
  title: z.string().default(""),

  /** Bot-Protection erkannt (cloudflare, datadome, etc.) oder null. */
  botProtection: z.string().nullable().default(null),

  /** Cookie-Banner wurde erfolgreich weggeklickt. */
  cookieBannerDismissed: z.boolean().default(false),

  /** Welcher Fetcher-Backend genutzt wurde. */
  fetcherType: z.enum(["firecrawl", "playwright"]),
});

export type FetchMetadata = z.output<typeof FetchMetadataSchema>;

// ---------------------------------------------------------------------------

export const FetchTimingSchema = z.object({
  /** Gesamt-Fetch-Dauer in ms (Navigation + Wait + Cookie Dismiss). */
  totalMs: z.number(),

  /** Navigationszeit in ms (bis DOM Content Loaded). */
  navigationMs: z.number().optional(),
});

export type FetchTiming = z.output<typeof FetchTimingSchema>;

// ============================================================================
// FetchResult
// ============================================================================

/**
 * Result of a page fetch operation.
 *
 * Always contains `html` and `metadata`. The `screenshot` and `markdown`
 * fields are populated based on the fetcher's capabilities and the requested
 * options.
 *
 * Firecrawl always returns both `html` and `markdown`. Playwright returns
 * `html` only (and optionally `screenshot` if requested).
 */
export interface FetchResult {
  /** Raw HTML string of the fully-rendered page (JavaScript executed). */
  html: string;

  /**
   * Screenshot as a base64-encoded PNG string.
   * Only populated when `screenshot: true` was passed in {@link FetchOptions}.
   */
  screenshot?: string;

  /**
   * Markdown representation of the page content.
   * Populated by Firecrawl (always) and optionally by other fetchers.
   * Used by the Markdown-Context feature (FC-018/019) to enrich LLM prompts.
   */
  markdown?: string;

  /** Metadata about the fetch: final URL, status code, bot protection status. */
  metadata: FetchMetadata;

  /** Timing breakdown for the fetch operation. */
  timing: FetchTiming;
}

// ============================================================================
// PageFetcher Interface
// ============================================================================

/**
 * Unified interface for page fetching providers.
 *
 * Every fetcher implementation (Firecrawl, Playwright, future providers)
 * must implement this interface. Use {@link createFetcher} from
 * `src/fetcher/create-fetcher.ts` to instantiate the right implementation
 * based on environment configuration.
 *
 * **Lifecycle:** Call `fetch()` one or more times, then `close()` to release
 * resources. The `close()` method is idempotent and safe to call multiple times.
 *
 * **Error handling:** All fetchers throw typed errors from `src/fetcher/errors.ts`.
 * Use `instanceof` checks to handle specific failure modes.
 *
 * @example
 * ```typescript
 * import { createFetcher } from "balage/fetcher";
 *
 * const fetcher = createFetcher({ provider: "auto" });
 * try {
 *   const result = await fetcher.fetch("https://example.com");
 *   console.log(result.html);
 *   console.log(result.metadata.fetcherType); // "firecrawl" or "playwright"
 * } finally {
 *   await fetcher.close();
 * }
 * ```
 */
export interface PageFetcher {
  /**
   * Fetch a web page and return its rendered HTML.
   *
   * The returned HTML represents the fully-rendered page (JavaScript executed,
   * dynamic content loaded). For Firecrawl, this is server-side rendered.
   * For Playwright, this is captured from a headless browser.
   *
   * @param url - The URL to fetch. Must pass SSRF validation.
   * @param options - Fetch options (timeout, viewport, headers).
   *   All fields are optional with sensible defaults.
   * @returns The fetched page with HTML, metadata, and timing information.
   *
   * @throws {FetchTimeoutError} When the page load exceeds the configured timeout.
   * @throws {FetchBotProtectionError} When bot protection is detected
   *   (Cloudflare, DataDome, etc.) and cannot be bypassed.
   * @throws {FetchNetworkError} When a network-level error occurs
   *   (DNS failure, connection refused, TLS error).
   * @throws {FetchRateLimitError} When the cost limiter rejects the request.
   * @throws {FetchResponseTooLargeError} When the response exceeds the size limit.
   * @throws {FetchError} For all other fetch-related errors.
   */
  fetch(url: string, options?: FetchOptions): Promise<FetchResult>;

  /**
   * Release all held resources (browser instances, connections, handles).
   *
   * Idempotent: safe to call multiple times. The second and subsequent calls
   * are no-ops. Always call this in a `finally` block to prevent resource leaks.
   */
  close(): Promise<void>;

  /**
   * Human-readable name for logging and diagnostics (e.g., `"firecrawl"`,
   * `"playwright"`).
   */
  readonly name: string;
}

// ============================================================================
// Provider Type
// ============================================================================

/**
 * Available fetcher providers.
 *
 * - `"firecrawl"` — Firecrawl Cloud or self-hosted. Requires API key.
 * - `"playwright"` — Local headless Chromium. Requires `playwright` package.
 * - `"auto"` — Firecrawl if API key is configured and enabled, otherwise Playwright.
 */
export type FetcherProvider = "firecrawl" | "playwright" | "auto";

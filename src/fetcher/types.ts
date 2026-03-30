/**
 * PageFetcher Interface + Types (FC-005)
 *
 * Unified interface fuer Page-Fetching.
 * Implementierungen: FirecrawlFetcher, PlaywrightFetcher.
 *
 * Zod-first Schemas — Typen werden inferred statt manuell definiert.
 * z.input = User-facing (alles optional), z.output = resolved Defaults.
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

export interface FetchResult {
  /** Raw HTML-String der vollstaendig gerenderten Seite. */
  html: string;

  /** Screenshot als base64-encoded PNG. Nur wenn screenshot=true. */
  screenshot?: string;

  /** Markdown-Representation der Seite (wenn vom Fetcher unterstuetzt). */
  markdown?: string;

  /** Metadata ueber den Fetch (finale URL, Status, Bot-Protection). */
  metadata: FetchMetadata;

  /** Timing-Informationen. */
  timing: FetchTiming;
}

// ============================================================================
// PageFetcher Interface
// ============================================================================

export interface PageFetcher {
  /**
   * Fetcht eine Seite und gibt deren HTML zurueck.
   *
   * @throws {FetchTimeoutError} bei Timeout
   * @throws {FetchBotProtectionError} bei erkannter Bot-Protection
   * @throws {FetchNetworkError} bei Netzwerk-Fehlern
   * @throws {FetchError} fuer alle anderen Fetch-Fehler
   */
  fetch(url: string, options?: FetchOptions): Promise<FetchResult>;

  /**
   * Gibt alle gehaltenen Ressourcen frei (Browser-Instanzen, Connections).
   * Mehrfach-Aufruf sicher. No-Op nach dem ersten Aufruf.
   */
  close(): Promise<void>;

  /** Human-readable Name fuer Logging. */
  readonly name: string;
}

// ============================================================================
// Provider Type
// ============================================================================

export type FetcherProvider = "firecrawl" | "playwright" | "auto";

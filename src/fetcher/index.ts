/**
 * Fetcher — Public API
 *
 * PageFetcher Abstraction Layer.
 * Exportiert Interface, Types, Errors, Factory und Implementierungen.
 */

// Interface + Types (FC-005)
export type {
  PageFetcher,
  FetchOptions,
  ResolvedFetchOptions,
  FetchMetadata,
  FetchTiming,
  FetchResult,
  FetcherProvider,
} from "./types.js";
export {
  FetchOptionsSchema,
  FetchMetadataSchema,
  FetchTimingSchema,
} from "./types.js";

// Errors (FC-003, FC-006)
export {
  FetchError,
  FetchTimeoutError,
  FetchBotProtectionError,
  FetchNetworkError,
  FetchRateLimitError,
  FetchConfigError,
  FirecrawlApiError,
  FetchResponseTooLargeError,
  redactApiKeys,
} from "./errors.js";

// Factory (FC-007)
export { createFetcher } from "./create-fetcher.js";
export type { CreateFetcherOptions } from "./create-fetcher.js";

// Implementations (FC-009, FC-015)
export { FirecrawlFetcher } from "./firecrawl-fetcher.js";
export type { FirecrawlFetcherConfig } from "./firecrawl-fetcher.js";

/**
 * FC-015 / FC-017: PlaywrightFetcher — Einmalige, isolierte Page-Fetches.
 *
 * UNTERSCHIED zu BrowserAdapter (src/adapter/browser-adapter.ts):
 *   BrowserAdapter  = Langlebige Browser-Sessions mit Context-Management,
 *                     CDP-Zugriff, und Multi-Context-Pool. Fuer wiederholte
 *                     Interaktionen ueber laengere Zeit.
 *   PlaywrightFetcher = Einmalige Fetch-Operationen via PageFetcher Interface.
 *                       Ein Browser wird lazy gestartet, pro fetch() ein neuer
 *                       Context erstellt und danach geschlossen.
 *
 * Beide Klassen sind SEPARAT und unabhaengig voneinander.
 * BrowserAdapter bleibt unveraendert.
 */
export { PlaywrightFetcher } from "./playwright-fetcher.js";
export type { PlaywrightFetcherConfig } from "./playwright-fetcher.js";

// Cost-Limiter (FC-014)
export { CostLimiter } from "./cost-limiter.js";
export type { CostLimiterConfig } from "./cost-limiter.js";

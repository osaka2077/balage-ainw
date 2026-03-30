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

// Implementations (FC-009)
export { FirecrawlFetcher } from "./firecrawl-fetcher.js";
export type { FirecrawlFetcherConfig } from "./firecrawl-fetcher.js";

// Cost-Limiter (FC-014)
export { CostLimiter } from "./cost-limiter.js";
export type { CostLimiterConfig } from "./cost-limiter.js";

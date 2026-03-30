/**
 * Fetcher — Public API
 *
 * PageFetcher Abstraction Layer.
 * Exportiert Interface, Types, Errors und Factory.
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

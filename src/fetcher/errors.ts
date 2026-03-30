/**
 * Fetcher Error Classes (FC-003 + FC-006)
 *
 * Spezifische Error-Klassen fuer Page-Fetching.
 * Alle Errors tragen url und maschinenlesbaren code.
 *
 * FirecrawlApiError (FC-003) stellt sicher dass API-Keys
 * NIEMALS in Error-Messages oder Logs auftauchen.
 */

// ============================================================================
// API Key Redaction (FC-003)
// ============================================================================

/**
 * Redacted API-Key-Patterns aus Strings.
 * Firecrawl Keys: fc-[a-zA-Z0-9]+
 * Allgemeine Keys: sk-[a-zA-Z0-9]+, key_[a-zA-Z0-9]+
 */
const API_KEY_PATTERNS = [
  /fc-[a-zA-Z0-9]{8,}/g,             // Firecrawl API keys
  /sk-[a-zA-Z0-9\-]{8,}/g,           // OpenAI-style keys (sk-proj-xxx, sk-xxx)
  /key_[a-zA-Z0-9]{8,}/g,            // Generic key_xxx patterns
  /Bearer\s+[a-zA-Z0-9._\-]{20,}/g,  // Bearer tokens
];

export function redactApiKeys(input: string): string {
  let result = input;
  for (const pattern of API_KEY_PATTERNS) {
    // Reset lastIndex fuer globale Regex
    pattern.lastIndex = 0;
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

// ============================================================================
// Base Error
// ============================================================================

export class FetchError extends Error {
  readonly code: string = "FETCH_ERROR";
  readonly url: string;

  constructor(message: string, url: string, options?: { cause?: Error }) {
    super(redactApiKeys(message), options);
    this.name = "FetchError";
    this.url = url;
  }
}

// ============================================================================
// Specific Errors
// ============================================================================

export class FetchTimeoutError extends FetchError {
  override readonly code = "FETCH_TIMEOUT_ERROR";
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number, options?: { cause?: Error }) {
    super(`Fetch timeout after ${timeoutMs}ms for ${url}`, url, options);
    this.name = "FetchTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class FetchBotProtectionError extends FetchError {
  override readonly code = "FETCH_BOT_PROTECTION_ERROR";
  readonly protectionType: string;

  constructor(url: string, protectionType: string, options?: { cause?: Error }) {
    super(
      `Bot protection detected (${protectionType}) for ${url}`,
      url,
      options,
    );
    this.name = "FetchBotProtectionError";
    this.protectionType = protectionType;
  }
}

export class FetchNetworkError extends FetchError {
  override readonly code = "FETCH_NETWORK_ERROR";

  constructor(url: string, detail: string, options?: { cause?: Error }) {
    super(`Network error for ${url}: ${detail}`, url, options);
    this.name = "FetchNetworkError";
  }
}

export class FetchRateLimitError extends FetchError {
  override readonly code = "FETCH_RATE_LIMIT_ERROR";
  readonly retryAfterSec: number | undefined;

  constructor(url: string, retryAfterSec?: number, options?: { cause?: Error }) {
    super(
      `Rate limited for ${url}${retryAfterSec ? ` (retry after ${retryAfterSec}s)` : ""}`,
      url,
      options,
    );
    this.name = "FetchRateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

export class FetchConfigError extends FetchError {
  override readonly code = "FETCH_CONFIG_ERROR";

  constructor(detail: string) {
    super(redactApiKeys(detail), "");
    this.name = "FetchConfigError";
  }
}

// ============================================================================
// FirecrawlApiError (FC-003) — NIEMALS Key im Output
// ============================================================================

export class FirecrawlApiError extends FetchError {
  override readonly code = "FIRECRAWL_API_ERROR";
  readonly statusCode: number | undefined;

  constructor(
    message: string,
    url: string,
    statusCode?: number,
    options?: { cause?: Error },
  ) {
    // Redaction passiert in FetchError-Konstruktor via redactApiKeys()
    super(
      `Firecrawl API error${statusCode ? ` (${statusCode})` : ""}: ${message}`,
      url,
      options,
    );
    this.name = "FirecrawlApiError";
    this.statusCode = statusCode;
  }
}

// ============================================================================
// Response Size Error (FC-004)
// ============================================================================

export class FetchResponseTooLargeError extends FetchError {
  override readonly code = "FETCH_RESPONSE_TOO_LARGE";
  readonly sizeMb: number;
  readonly maxSizeMb: number;

  constructor(url: string, sizeMb: number, maxSizeMb: number, options?: { cause?: Error }) {
    super(
      `Response too large for ${url}: ${sizeMb.toFixed(1)}MB exceeds limit of ${maxSizeMb}MB`,
      url,
      options,
    );
    this.name = "FetchResponseTooLargeError";
    this.sizeMb = sizeMb;
    this.maxSizeMb = maxSizeMb;
  }
}

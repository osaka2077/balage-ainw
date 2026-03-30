/**
 * Fetcher Errors — Unit Tests (FC-003 + FC-006)
 *
 * Prueft:
 *  - Korrekte instanceof-Vererbung fuer alle 8 Error-Klassen
 *  - API-Key-Redaction in Error Messages (FC-003)
 *  - Korrekte code-Werte
 *  - Error-Chaining via cause
 */

import { describe, it, expect } from "vitest";
import {
  FetchError,
  FetchTimeoutError,
  FetchBotProtectionError,
  FetchNetworkError,
  FetchRateLimitError,
  FetchConfigError,
  FirecrawlApiError,
  FetchResponseTooLargeError,
  redactApiKeys,
} from "../errors.js";

// ============================================================================
// redactApiKeys() — FC-003
// ============================================================================

describe("redactApiKeys", () => {
  it("should redact Firecrawl API keys (fc-xxx pattern)", () => {
    const input = "Error with key fc-abc123defGHI456 in request";
    expect(redactApiKeys(input)).toBe("Error with key [REDACTED] in request");
  });

  it("should redact OpenAI-style keys (sk-xxx pattern)", () => {
    const input = "Key: sk-proj-abcdefgh1234567890";
    expect(redactApiKeys(input)).toBe("Key: [REDACTED]");
  });

  it("should redact Bearer tokens", () => {
    const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig";
    expect(redactApiKeys(input)).toBe("Authorization: [REDACTED]");
  });

  it("should redact multiple keys in one string", () => {
    const input = "Key1: fc-aaaa1111bbbb2222 Key2: sk-cccc3333dddd4444";
    const result = redactApiKeys(input);
    expect(result).not.toContain("fc-aaaa");
    expect(result).not.toContain("sk-cccc");
    expect(result).toContain("[REDACTED]");
  });

  it("should NOT redact short strings that look like prefixes", () => {
    const input = "fc-short is OK, only long keys get redacted";
    expect(redactApiKeys(input)).toBe(input);
  });

  it("should leave strings without keys unchanged", () => {
    const input = "Normal error message without any keys";
    expect(redactApiKeys(input)).toBe(input);
  });
});

// ============================================================================
// Error Classes — FC-006
// ============================================================================

describe("FetchError", () => {
  it("should have correct name, code, url", () => {
    const err = new FetchError("something failed", "https://example.com");
    expect(err.name).toBe("FetchError");
    expect(err.code).toBe("FETCH_ERROR");
    expect(err.url).toBe("https://example.com");
    expect(err.message).toBe("something failed");
    expect(err instanceof Error).toBe(true);
  });

  it("should redact API keys in message", () => {
    const err = new FetchError(
      "Failed with key fc-superSecretKey123456",
      "https://api.firecrawl.dev",
    );
    expect(err.message).not.toContain("fc-superSecretKey123456");
    expect(err.message).toContain("[REDACTED]");
  });

  it("should support error chaining via cause", () => {
    const cause = new Error("original");
    const err = new FetchError("wrapped", "https://example.com", { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("FetchTimeoutError", () => {
  it("should be instanceof FetchError", () => {
    const err = new FetchTimeoutError("https://slow.com", 30000);
    expect(err instanceof FetchTimeoutError).toBe(true);
    expect(err instanceof FetchError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it("should have correct code and include timeout info", () => {
    const err = new FetchTimeoutError("https://slow.com", 30000);
    expect(err.code).toBe("FETCH_TIMEOUT_ERROR");
    expect(err.timeoutMs).toBe(30000);
    expect(err.message).toContain("30000ms");
    expect(err.url).toBe("https://slow.com");
  });
});

describe("FetchBotProtectionError", () => {
  it("should have correct code and protection type", () => {
    const err = new FetchBotProtectionError("https://protected.com", "cloudflare");
    expect(err.code).toBe("FETCH_BOT_PROTECTION_ERROR");
    expect(err.protectionType).toBe("cloudflare");
    expect(err.message).toContain("cloudflare");
    expect(err instanceof FetchError).toBe(true);
  });
});

describe("FetchNetworkError", () => {
  it("should have correct code and detail in message", () => {
    const err = new FetchNetworkError("https://down.com", "ECONNREFUSED");
    expect(err.code).toBe("FETCH_NETWORK_ERROR");
    expect(err.message).toContain("ECONNREFUSED");
    expect(err instanceof FetchError).toBe(true);
  });
});

describe("FetchRateLimitError", () => {
  it("should have retryAfterSec when provided", () => {
    const err = new FetchRateLimitError("https://api.com", 60);
    expect(err.code).toBe("FETCH_RATE_LIMIT_ERROR");
    expect(err.retryAfterSec).toBe(60);
    expect(err.message).toContain("retry after 60s");
    expect(err instanceof FetchError).toBe(true);
  });

  it("should work without retryAfterSec", () => {
    const err = new FetchRateLimitError("https://api.com");
    expect(err.retryAfterSec).toBeUndefined();
    expect(err.message).not.toContain("retry after");
  });
});

describe("FetchConfigError", () => {
  it("should redact keys in config error", () => {
    const err = new FetchConfigError(
      "Invalid API key: fc-longApiKeyThatShouldBeRedacted",
    );
    expect(err.code).toBe("FETCH_CONFIG_ERROR");
    expect(err.message).not.toContain("fc-longApiKeyThatShouldBeRedacted");
    expect(err.message).toContain("[REDACTED]");
    expect(err instanceof FetchError).toBe(true);
  });
});

describe("FirecrawlApiError (FC-003)", () => {
  it("should NEVER contain API key in message", () => {
    const err = new FirecrawlApiError(
      "Authentication failed for key fc-realProductionKey1234",
      "https://api.firecrawl.dev/v1/scrape",
      401,
    );
    expect(err.message).not.toContain("fc-realProductionKey1234");
    expect(err.message).toContain("[REDACTED]");
    expect(err.code).toBe("FIRECRAWL_API_ERROR");
    expect(err.statusCode).toBe(401);
    expect(err instanceof FetchError).toBe(true);
  });

  it("should include status code in message", () => {
    const err = new FirecrawlApiError("Not found", "https://api.firecrawl.dev", 404);
    expect(err.message).toContain("404");
    expect(err.statusCode).toBe(404);
  });

  it("should work without status code", () => {
    const err = new FirecrawlApiError("Unknown error", "https://api.firecrawl.dev");
    expect(err.statusCode).toBeUndefined();
    expect(err.message).toContain("Unknown error");
  });
});

describe("FetchResponseTooLargeError (FC-004)", () => {
  it("should include size info in message", () => {
    const err = new FetchResponseTooLargeError("https://big.com", 6.2, 5);
    expect(err.code).toBe("FETCH_RESPONSE_TOO_LARGE");
    expect(err.sizeMb).toBe(6.2);
    expect(err.maxSizeMb).toBe(5);
    expect(err.message).toContain("6.2MB");
    expect(err.message).toContain("5MB");
    expect(err instanceof FetchError).toBe(true);
  });
});

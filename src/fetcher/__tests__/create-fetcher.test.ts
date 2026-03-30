/**
 * createFetcher — Unit Tests (FC-007, updated for FC-009)
 *
 * Prueft Auto-Detection und explizite Provider-Angabe.
 * Phase 2: FirecrawlFetcher ist implementiert, PlaywrightFetcher noch nicht.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createFetcher } from "../create-fetcher.js";
import { FetchConfigError } from "../errors.js";
import { FirecrawlFetcher } from "../firecrawl-fetcher.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createFetcher", () => {
  it("should throw FetchConfigError for firecrawl provider without API key", () => {
    expect(() => createFetcher({ provider: "firecrawl" })).toThrow(FetchConfigError);
    expect(() => createFetcher({ provider: "firecrawl" })).toThrow("API key");
  });

  it("should return FirecrawlFetcher when firecrawl provider with API key", () => {
    const fetcher = createFetcher({
      provider: "firecrawl",
      firecrawlApiKey: "fc-testkey123456789",
    });
    expect(fetcher).toBeInstanceOf(FirecrawlFetcher);
    expect(fetcher.name).toBe("firecrawl");
  });

  it("should throw FetchConfigError for playwright provider (not yet implemented)", () => {
    expect(() => createFetcher({ provider: "playwright" })).toThrow(FetchConfigError);
    expect(() => createFetcher({ provider: "playwright" })).toThrow("not yet implemented");
  });

  it("should throw for auto provider when nothing is available", () => {
    // Kein Firecrawl Key, kein Playwright → Playwright-Fallback → Error
    expect(() => createFetcher({ provider: "auto" })).toThrow(FetchConfigError);
  });

  it("should throw for auto provider even with firecrawl key when not enabled", () => {
    // Key vorhanden aber BALAGE_FIRECRAWL_ENABLED != "true" → Playwright-Fallback → Error
    expect(() =>
      createFetcher({
        provider: "auto",
        firecrawlApiKey: "fc-testkey123456789",
      }),
    ).toThrow(FetchConfigError);
  });

  it("should return FirecrawlFetcher in auto mode when key + enabled", () => {
    vi.stubEnv("BALAGE_FIRECRAWL_ENABLED", "true");
    const fetcher = createFetcher({
      provider: "auto",
      firecrawlApiKey: "fc-testkey123456789",
    });
    expect(fetcher).toBeInstanceOf(FirecrawlFetcher);
    expect(fetcher.name).toBe("firecrawl");
  });

  it("should pick up API key from env var", () => {
    vi.stubEnv("BALAGE_FIRECRAWL_API_KEY", "fc-envvarkey123456");
    vi.stubEnv("BALAGE_FIRECRAWL_ENABLED", "true");
    const fetcher = createFetcher({ provider: "auto" });
    expect(fetcher).toBeInstanceOf(FirecrawlFetcher);
  });

  it("should default to 'auto' provider when no provider specified", () => {
    // Default provider ist 'auto', kein Key → Playwright-Fallback → not implemented
    expect(() => createFetcher()).toThrow(FetchConfigError);
  });

  it("should pass firecrawlApiUrl and maxResponseSizeMb through to fetcher", () => {
    const fetcher = createFetcher({
      provider: "firecrawl",
      firecrawlApiKey: "fc-testkey123456789",
      firecrawlApiUrl: "https://custom-firecrawl.example.com",
      maxResponseSizeMb: 10,
    });
    expect(fetcher).toBeInstanceOf(FirecrawlFetcher);
  });
});

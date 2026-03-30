/**
 * createFetcher — Unit Tests (FC-007, updated FC-016)
 *
 * Prueft Auto-Detection und explizite Provider-Angabe.
 * Phase 3: PlaywrightFetcher ist jetzt implementiert.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createFetcher } from "../create-fetcher.js";
import { FetchConfigError } from "../errors.js";
import { FirecrawlFetcher } from "../firecrawl-fetcher.js";
import { PlaywrightFetcher } from "../playwright-fetcher.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createFetcher", () => {
  // ==========================================================================
  // Firecrawl Provider
  // ==========================================================================

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

  it("should pass firecrawlApiUrl and maxResponseSizeMb through to fetcher", () => {
    const fetcher = createFetcher({
      provider: "firecrawl",
      firecrawlApiKey: "fc-testkey123456789",
      firecrawlApiUrl: "https://custom-firecrawl.example.com",
      maxResponseSizeMb: 10,
    });
    expect(fetcher).toBeInstanceOf(FirecrawlFetcher);
  });

  // ==========================================================================
  // Playwright Provider (FC-016 — jetzt implementiert)
  // ==========================================================================

  it("should return PlaywrightFetcher when playwright provider requested", () => {
    const fetcher = createFetcher({ provider: "playwright" });
    expect(fetcher).toBeInstanceOf(PlaywrightFetcher);
    expect(fetcher.name).toBe("playwright");
  });

  it("should pass allowHttp to PlaywrightFetcher", () => {
    const fetcher = createFetcher({
      provider: "playwright",
      allowHttp: true,
    });
    expect(fetcher).toBeInstanceOf(PlaywrightFetcher);
  });

  it("should pass playwrightHeadless to PlaywrightFetcher", () => {
    const fetcher = createFetcher({
      provider: "playwright",
      playwrightHeadless: false,
    });
    expect(fetcher).toBeInstanceOf(PlaywrightFetcher);
  });

  // ==========================================================================
  // Auto-Detection (FC-016 — Updated)
  // ==========================================================================

  it("should return PlaywrightFetcher for auto provider when nothing is configured", () => {
    // Kein Firecrawl Key → Playwright-Fallback
    const fetcher = createFetcher({ provider: "auto" });
    expect(fetcher).toBeInstanceOf(PlaywrightFetcher);
    expect(fetcher.name).toBe("playwright");
  });

  it("should return PlaywrightFetcher for auto provider with firecrawl key but not enabled", () => {
    // Key vorhanden aber BALAGE_FIRECRAWL_ENABLED != "true" → Playwright-Fallback
    const fetcher = createFetcher({
      provider: "auto",
      firecrawlApiKey: "fc-testkey123456789",
    });
    expect(fetcher).toBeInstanceOf(PlaywrightFetcher);
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
    // Default provider ist 'auto', kein Key → Playwright-Fallback
    const fetcher = createFetcher();
    expect(fetcher).toBeInstanceOf(PlaywrightFetcher);
  });

  // ==========================================================================
  // Auto-Detection Prioritaet
  // ==========================================================================

  it("should prefer Firecrawl over Playwright in auto mode when both available", () => {
    vi.stubEnv("BALAGE_FIRECRAWL_ENABLED", "true");
    const fetcher = createFetcher({
      provider: "auto",
      firecrawlApiKey: "fc-testkey123456789",
    });
    // Firecrawl wird bevorzugt wenn Key + enabled
    expect(fetcher).toBeInstanceOf(FirecrawlFetcher);
  });

  it("should fall back to Playwright in auto mode when Firecrawl enabled but no key", () => {
    vi.stubEnv("BALAGE_FIRECRAWL_ENABLED", "true");
    const fetcher = createFetcher({ provider: "auto" });
    // Kein Key → Playwright-Fallback (trotz enabled)
    expect(fetcher).toBeInstanceOf(PlaywrightFetcher);
  });
});

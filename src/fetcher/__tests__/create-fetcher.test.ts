/**
 * createFetcher — Unit Tests (FC-007)
 *
 * Prueft Auto-Detection und explizite Provider-Angabe.
 * Da weder FirecrawlFetcher noch PlaywrightFetcher in Phase 1 existieren,
 * testen wir hier die Error-Messages fuer fehlende Implementierungen.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createFetcher } from "../create-fetcher.js";
import { FetchConfigError } from "../errors.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createFetcher", () => {
  it("should throw FetchConfigError for firecrawl provider without API key", () => {
    expect(() => createFetcher({ provider: "firecrawl" })).toThrow(FetchConfigError);
    expect(() => createFetcher({ provider: "firecrawl" })).toThrow("API key");
  });

  it("should throw FetchConfigError for firecrawl with key (not yet implemented)", () => {
    // Phase 2 wird FirecrawlFetcher implementieren — bis dahin: klarer Error
    expect(() =>
      createFetcher({
        provider: "firecrawl",
        firecrawlApiKey: "fc-testkey123456789",
      }),
    ).toThrow("not yet implemented");
  });

  it("should throw FetchConfigError for playwright provider (not yet implemented)", () => {
    expect(() => createFetcher({ provider: "playwright" })).toThrow(FetchConfigError);
    expect(() => createFetcher({ provider: "playwright" })).toThrow("not yet implemented");
  });

  it("should throw for auto provider when nothing is available", () => {
    // Kein Firecrawl Key, kein Playwright → Error
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

  it("should prefer firecrawl in auto mode when key + enabled", () => {
    vi.stubEnv("BALAGE_FIRECRAWL_ENABLED", "true");
    // Wird trotzdem fehlschlagen weil FirecrawlFetcher noch nicht implementiert ist
    expect(() =>
      createFetcher({
        provider: "auto",
        firecrawlApiKey: "fc-testkey123456789",
      }),
    ).toThrow("not yet implemented");
  });

  it("should default to 'auto' provider when no provider specified", () => {
    // Default provider ist 'auto', kein Key → Playwright-Fallback → not implemented
    expect(() => createFetcher()).toThrow(FetchConfigError);
  });
});

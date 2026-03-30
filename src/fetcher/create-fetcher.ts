/**
 * Fetcher Factory / Auto-Detection (FC-007)
 *
 * createFetcher() erzeugt den richtigen PageFetcher basierend auf:
 *  1. Expliziter provider-Angabe
 *  2. Auto-Detection (Firecrawl wenn Key vorhanden, sonst Playwright)
 *
 * Keine harten Runtime-Dependencies — beide Fetcher werden lazy importiert.
 */

import pino from "pino";
import type { PageFetcher, FetcherProvider } from "./types.js";
import { FetchConfigError } from "./errors.js";
import { FirecrawlFetcher } from "./firecrawl-fetcher.js";

const logger = pino({
  name: "fetcher:factory",
  level: process.env["LOG_LEVEL"] ?? "silent",
});

// ============================================================================
// Config
// ============================================================================

export interface CreateFetcherOptions {
  /** Welcher Provider genutzt werden soll. Default: 'auto' */
  provider?: FetcherProvider;

  /** Firecrawl API Key. Kann auch via BALAGE_FIRECRAWL_API_KEY kommen. */
  firecrawlApiKey?: string;

  /** Firecrawl API Base URL. Default: https://api.firecrawl.dev */
  firecrawlApiUrl?: string;

  /** Max Retries fuer Firecrawl. Default: 2 */
  firecrawlMaxRetries?: number;

  /** Max Response Size in MB. Default: 5 */
  maxResponseSizeMb?: number;

  /** HTTP URLs erlauben (nur fuer lokale Entwicklung). Default: false */
  allowHttp?: boolean;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Erzeugt einen PageFetcher basierend auf Konfiguration und Verfuegbarkeit.
 *
 * Provider-Logik:
 *  - 'firecrawl': Erfordert API Key → FirecrawlFetcher
 *  - 'playwright': Erfordert playwright Paket → PlaywrightFetcher
 *  - 'auto' (default): Firecrawl wenn Key + enabled, sonst Playwright, sonst Error
 */
export function createFetcher(options?: CreateFetcherOptions): PageFetcher {
  const provider = options?.provider ?? "auto";
  const firecrawlApiKey =
    options?.firecrawlApiKey ?? process.env["BALAGE_FIRECRAWL_API_KEY"];
  const firecrawlEnabled =
    process.env["BALAGE_FIRECRAWL_ENABLED"] === "true";

  logger.info({ provider, hasFirecrawlKey: !!firecrawlApiKey, firecrawlEnabled }, "Creating fetcher");

  switch (provider) {
    case "firecrawl":
      return createFirecrawlFetcher(options, firecrawlApiKey);

    case "playwright":
      return createPlaywrightFetcher();

    case "auto":
      return autoDetectFetcher(options, firecrawlApiKey, firecrawlEnabled);

    default: {
      // Exhaustive check
      const _exhaustive: never = provider;
      throw new FetchConfigError(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}

// ============================================================================
// Provider-spezifische Factory-Funktionen
// ============================================================================

function createFirecrawlFetcher(
  options: CreateFetcherOptions | undefined,
  apiKey: string | undefined,
): PageFetcher {
  if (!apiKey) {
    throw new FetchConfigError(
      "Firecrawl provider requires an API key. " +
      "Set BALAGE_FIRECRAWL_API_KEY environment variable or pass firecrawlApiKey option.",
    );
  }

  // FC-009: FirecrawlFetcher mit nativem fetch() (kein SDK)
  return new FirecrawlFetcher({
    apiKey,
    apiUrl: options?.firecrawlApiUrl,
    maxRetries: options?.firecrawlMaxRetries,
    maxResponseSizeMb: options?.maxResponseSizeMb,
    allowHttp: options?.allowHttp,
  });
}

function createPlaywrightFetcher(): PageFetcher {
  // Lazy import — PlaywrightFetcher wird in Phase 3 (FC-015) implementiert.
  // TODO(FC-015): Lazy import von PlaywrightFetcher implementieren
  throw new FetchConfigError(
    "PlaywrightFetcher is not yet implemented via PageFetcher interface. " +
    "Use BrowserAdapter directly or wait for Phase 3 (FC-015).",
  );
}

function autoDetectFetcher(
  options: CreateFetcherOptions | undefined,
  firecrawlApiKey: string | undefined,
  firecrawlEnabled: boolean,
): PageFetcher {
  // Strategie: Firecrawl bevorzugen wenn Key vorhanden UND explizit enabled
  if (firecrawlApiKey && firecrawlEnabled) {
    logger.info("Auto-detect: Using Firecrawl (API key present + enabled)");
    return createFirecrawlFetcher(options, firecrawlApiKey);
  }

  // Fallback: Playwright
  logger.info("Auto-detect: Falling back to Playwright");
  return createPlaywrightFetcher();
}

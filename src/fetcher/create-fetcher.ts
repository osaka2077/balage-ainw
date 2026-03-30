/**
 * Fetcher Factory / Auto-Detection (FC-007, updated FC-016)
 *
 * createFetcher() erzeugt den richtigen PageFetcher basierend auf:
 *  1. Expliziter provider-Angabe
 *  2. Auto-Detection (Firecrawl wenn Key + enabled, sonst Playwright)
 *
 * Keine harten Runtime-Dependencies — PlaywrightFetcher wird lazy importiert.
 * Wenn playwright nicht installiert ist, gibt es einen klaren Error statt crash.
 */

import pino from "pino";
import type { PageFetcher, FetcherProvider } from "./types.js";
import { FetchConfigError } from "./errors.js";
import { FirecrawlFetcher } from "./firecrawl-fetcher.js";
import { PlaywrightFetcher } from "./playwright-fetcher.js";

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

  /** Playwright Headless-Modus. Default: true */
  playwrightHeadless?: boolean;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Erzeugt einen PageFetcher basierend auf Konfiguration und Verfuegbarkeit.
 *
 * Provider-Logik:
 *  - 'firecrawl': Erfordert API Key → FirecrawlFetcher
 *  - 'playwright': PlaywrightFetcher (playwright muss installiert sein)
 *  - 'auto' (default): Firecrawl wenn Key + enabled, sonst Playwright
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
      return createPlaywrightFetcherInstance(options);

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

/**
 * FC-015 / FC-016: PlaywrightFetcher Instanz erstellen.
 *
 * playwright wird beim ersten fetch() lazy importiert (dynamic import in
 * PlaywrightFetcher.ensureBrowser()). Wenn playwright nicht installiert ist,
 * gibt der fetch()-Call einen klaren Error — kein crash beim Import.
 */
function createPlaywrightFetcherInstance(options?: CreateFetcherOptions): PageFetcher {
  return new PlaywrightFetcher({
    allowHttp: options?.allowHttp,
    headless: options?.playwrightHeadless,
  });
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

  // Fallback: Playwright (lazy import — crasht erst beim fetch() wenn nicht installiert)
  logger.info("Auto-detect: Falling back to Playwright");
  return createPlaywrightFetcherInstance(options);
}

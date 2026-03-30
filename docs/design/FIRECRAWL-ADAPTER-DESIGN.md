# Firecrawl Adapter Design Document

**Author:** ENGINEER
**Date:** 2026-03-29
**Status:** DRAFT
**Scope:** PageFetcher Interface + Firecrawl Adapter + Playwright Adapter Refactor + Auto-Detection + Top-Level `analyzeFromURL` API

---

## 1. Motivation

BALAGE's `analyzeFromHTML()` erwartet raw HTML als Input. Aktuell muss der Aufrufer selbst dafuer sorgen, dass der HTML-Content beschafft wird (via Playwright, curl, etc.). Das fuehrt zu:

- Doppeltem Boilerplate-Code in jedem Integrationsprojekt
- Fehlender Abstraktion ueber verschiedene Fetch-Mechanismen
- Keinem einheitlichen Error Handling fuer Bot-Protection, Timeouts, Rate Limits

Das Ziel: Eine einheitliche `PageFetcher`-Abstraktion mit zwei Implementierungen (Firecrawl, Playwright) und einer `analyzeFromURL()` High-Level API, die alles kapselt.

---

## 2. Architecture Overview

```
analyzeFromURL(url, options)
        |
        v
  createFetcher(options)           ← Auto-Detection: welcher Adapter verfuegbar?
        |
   ┌────┴────────────────┐
   |                     |
   v                     v
FirecrawlFetcher    PlaywrightFetcher
   |                     |
   └────────┬────────────┘
            |
            v
      FetchResult { html, screenshot?, metadata, timing }
            |
            v
      analyzeFromHTML(html, options)
            |
            v
      AnalysisResult
```

### Layer-Zuordnung

| Datei | Layer | Abhaengigkeiten |
|-------|-------|-----------------|
| `src/adapter/fetcher.ts` | L1 (Adapter) | Keine runtime deps |
| `src/adapter/firecrawl-fetcher.ts` | L1 (Adapter) | `@mendable/firecrawl-js` (lazy) |
| `src/adapter/playwright-fetcher.ts` | L1 (Adapter) | `playwright` (bereits da) |
| `src/adapter/create-fetcher.ts` | L1 (Adapter) | fetcher.ts |
| `src/adapter/fetcher-errors.ts` | L1 (Adapter) | errors.ts Pattern |
| `src/core/analyze.ts` (Erweiterung) | L2 (Core) | L1 Adapter via lazy import |

---

## 3. Interface Design

### 3.1 PageFetcher Interface (`src/adapter/fetcher.ts`)

```typescript
/**
 * PageFetcher — Unified interface for fetching page HTML.
 *
 * Implementations: FirecrawlFetcher, PlaywrightFetcher.
 * Design: Stateless per-call. close() releases held resources (browser instances etc.).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas (Zod-first, Types inferred)
// ---------------------------------------------------------------------------

export const FetchOptionsSchema = z.object({
  /** Timeout for the entire fetch operation in ms. Default: 30000 */
  timeoutMs: z.number().int().positive().default(30_000),

  /** CSS selector to wait for before capturing HTML. Optional. */
  waitForSelector: z.string().max(512).optional(),

  /** Attempt to dismiss cookie/consent banners. Default: true */
  dismissCookies: z.boolean().default(true),

  /** Capture a screenshot alongside HTML. Default: false */
  screenshot: z.boolean().default(false),

  /** Viewport dimensions. Default: 1280x720 */
  viewport: z.object({
    width: z.number().int().positive().default(1280),
    height: z.number().int().positive().default(720),
  }).default({}),

  /** HTTP headers to send with the request. */
  headers: z.record(z.string()).default({}),
});

export type FetchOptions = z.input<typeof FetchOptionsSchema>;
export type ResolvedFetchOptions = z.output<typeof FetchOptionsSchema>;

export const FetchMetadataSchema = z.object({
  /** Final URL after redirects. */
  finalUrl: z.string(),

  /** HTTP status code. */
  statusCode: z.number().int(),

  /** Page title from <title> tag. */
  title: z.string().default(""),

  /** Bot protection detected (cloudflare, datadome, etc.) or null. */
  botProtection: z.string().nullable().default(null),

  /** Cookie banner was dismissed successfully. */
  cookieBannerDismissed: z.boolean().default(false),

  /** Which fetcher backend was used. */
  fetcherType: z.enum(["firecrawl", "playwright"]),
});

export type FetchMetadata = z.output<typeof FetchMetadataSchema>;

export const FetchTimingSchema = z.object({
  /** Total fetch duration in ms (navigation + wait + cookie dismiss). */
  totalMs: z.number(),

  /** Navigation time in ms (until DOM content loaded). */
  navigationMs: z.number().optional(),
});

export type FetchTiming = z.output<typeof FetchTimingSchema>;

export interface FetchResult {
  /** Raw HTML string of the fully rendered page. */
  html: string;

  /** Screenshot as base64-encoded PNG. Present only if screenshot=true. */
  screenshot?: string;

  /** Metadata about the fetch (final URL, status, bot protection). */
  metadata: FetchMetadata;

  /** Timing information. */
  timing: FetchTiming;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface PageFetcher {
  /**
   * Fetch a page and return its HTML.
   *
   * @throws {FetchTimeoutError} on timeout
   * @throws {FetchBotProtectionError} when bot protection is detected and cannot be bypassed
   * @throws {FetchNetworkError} on network failures
   * @throws {FetchError} for all other fetch failures
   */
  fetch(url: string, options?: FetchOptions): Promise<FetchResult>;

  /**
   * Release all held resources (browser instances, connections).
   * Safe to call multiple times. No-op after first call.
   */
  close(): Promise<void>;

  /** Human-readable name for logging. */
  readonly name: string;
}
```

**Design-Entscheidungen:**

1. **Zod-first Schemas** -- Konsistent mit dem bestehenden Pattern in `config-schema.ts`. Typen werden inferred statt manuell definiert. Das ermoeglicht Runtime-Validierung der Options.

2. **`z.input` vs `z.output`** -- `FetchOptions` nutzt `z.input` (User-facing, alles optional), interne Verarbeitung nutzt die resolved Defaults nach `.parse()`.

3. **screenshot als base64** -- Kein Dateipfad, kein Buffer. Base64 ist serialisierbar, transportabel, und sowohl Firecrawl als auch Playwright koennen das liefern.

4. **Kein `launch()`** -- Die bestehende BrowserAdapter-Klasse hat ein explizites `launch()/shutdown()` Lifecycle. Fuer den Fetcher ist das overengineered. Lazy-Init beim ersten `fetch()` Call, `close()` fuer Cleanup. Weniger States, weniger Fehlerquellen.

5. **`fetcherType` in Metadata** -- Damit der Aufrufer (und Logs) nachvollziehen koennen, welcher Backend tatsaechlich genutzt wurde. Wichtig fuer Debugging wenn Auto-Detection aktiv ist.

---

### 3.2 Error Classes (`src/adapter/fetcher-errors.ts`)

```typescript
/**
 * Fetcher-spezifische Error-Klassen.
 * Folgt dem Pattern aus src/adapter/errors.ts.
 */

export class FetchError extends Error {
  readonly code = "FETCH_ERROR";
  readonly url: string;

  constructor(message: string, url: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = "FetchError";
    this.url = url;
  }
}

export class FetchTimeoutError extends FetchError {
  readonly code = "FETCH_TIMEOUT_ERROR";

  constructor(url: string, timeoutMs: number, options?: { cause?: Error }) {
    super(`Fetch timeout after ${timeoutMs}ms for ${url}`, url, options);
    this.name = "FetchTimeoutError";
  }
}

export class FetchBotProtectionError extends FetchError {
  readonly code = "FETCH_BOT_PROTECTION_ERROR";
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
  readonly code = "FETCH_NETWORK_ERROR";

  constructor(url: string, detail: string, options?: { cause?: Error }) {
    super(`Network error for ${url}: ${detail}`, url, options);
    this.name = "FetchNetworkError";
  }
}

export class FetchRateLimitError extends FetchError {
  readonly code = "FETCH_RATE_LIMIT_ERROR";
  /** Retry-After in seconds, wenn vom Server kommuniziert. */
  readonly retryAfterSec: number | undefined;

  constructor(
    url: string,
    retryAfterSec?: number,
    options?: { cause?: Error },
  ) {
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
  readonly code = "FETCH_CONFIG_ERROR";

  constructor(detail: string) {
    super(detail, "");
    this.name = "FetchConfigError";
  }
}
```

**Rationale:** Spezifische Error-Klassen statt generischer Strings. Jeder Error traegt die `url` und einen maschinenlesbaren `code`. Das ermoeglicht praezises Error Handling im Aufrufer:

```typescript
try {
  await fetcher.fetch(url);
} catch (err) {
  if (err instanceof FetchRateLimitError) {
    // Back off and retry
  } else if (err instanceof FetchBotProtectionError) {
    // Log and skip, or switch to Playwright
  }
}
```

---

### 3.3 Firecrawl Adapter (`src/adapter/firecrawl-fetcher.ts`)

```typescript
/**
 * FirecrawlFetcher — PageFetcher via Firecrawl API.
 *
 * Nutzt @mendable/firecrawl-js SDK (lazy-loaded, optional dependency).
 * Unterstuetzt self-hosted Firecrawl via custom baseUrl.
 *
 * Firecrawl API: POST /v1/scrape
 *   Request:  { url, formats: ['html'], waitFor?: number, headers?: Record }
 *   Response: { success, data: { html, metadata, screenshot? } }
 */

import pino from "pino";
import type { PageFetcher, FetchOptions, FetchResult, ResolvedFetchOptions } from "./fetcher.js";
import { FetchOptionsSchema } from "./fetcher.js";
import {
  FetchError,
  FetchTimeoutError,
  FetchNetworkError,
  FetchRateLimitError,
  FetchConfigError,
} from "./fetcher-errors.js";

const logger = pino({ name: "balage:firecrawl-fetcher", level: process.env["LOG_LEVEL"] ?? "silent" });

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface FirecrawlFetcherConfig {
  /** Firecrawl API key. Required. */
  apiKey: string;

  /** Base URL for self-hosted Firecrawl. Default: https://api.firecrawl.dev */
  baseUrl?: string;

  /** Max retries on transient errors (429, 5xx). Default: 2 */
  maxRetries?: number;

  /** Base delay for exponential backoff in ms. Default: 1000 */
  retryBaseDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class FirecrawlFetcher implements PageFetcher {
  readonly name = "firecrawl";
  private readonly config: Required<FirecrawlFetcherConfig>;
  private firecrawlApp: unknown | null = null;
  private closed = false;

  constructor(config: FirecrawlFetcherConfig) {
    if (!config.apiKey) {
      throw new FetchConfigError("Firecrawl API key is required (FIRECRAWL_API_KEY)");
    }
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? "https://api.firecrawl.dev",
      maxRetries: config.maxRetries ?? 2,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 1000,
    };
  }

  async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    if (this.closed) {
      throw new FetchError("Fetcher is closed", url);
    }

    const opts: ResolvedFetchOptions = FetchOptionsSchema.parse(options ?? {});
    const start = performance.now();

    // Lazy-load Firecrawl SDK
    const app = await this.getFirecrawlApp();

    // Retry-Loop mit Exponential Backoff
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.config.retryBaseDelayMs * Math.pow(2, attempt - 1);
        logger.info({ url, attempt, delayMs: delay }, "Retrying after transient error");
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      try {
        return await this.doFetch(app, url, opts, start);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Nur Retries fuer transiente Fehler
        if (err instanceof FetchRateLimitError || this.isTransientError(err)) {
          logger.warn({ url, attempt, err: lastError.message }, "Transient fetch error");
          continue;
        }

        // Nicht-transiente Fehler sofort werfen
        throw err;
      }
    }

    throw new FetchNetworkError(
      url,
      `Failed after ${this.config.maxRetries + 1} attempts: ${lastError?.message}`,
      { cause: lastError },
    );
  }

  async close(): Promise<void> {
    this.closed = true;
    this.firecrawlApp = null;
    // Firecrawl SDK haelt keine persistenten Connections — nichts zu cleanen
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async doFetch(
    app: FirecrawlSdkApp,
    url: string,
    opts: ResolvedFetchOptions,
    start: number,
  ): Promise<FetchResult> {
    const scrapeParams: FirecrawlScrapeParams = {
      url,
      formats: opts.screenshot ? ["html", "screenshot"] : ["html"],
      waitFor: opts.waitForSelector
        ? undefined   // Firecrawl SDK: waitFor ist ms-basiert, nicht selector-basiert
        : undefined,
      timeout: opts.timeoutMs,
      headers: Object.keys(opts.headers).length > 0 ? opts.headers : undefined,
    };

    logger.debug({ url, formats: scrapeParams.formats }, "Firecrawl scrape request");

    let response: FirecrawlScrapeResponse;
    try {
      response = await app.scrapeUrl(url, scrapeParams);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Rate Limit Detection (HTTP 429)
      if (message.includes("429") || message.toLowerCase().includes("rate limit")) {
        const retryAfter = this.parseRetryAfter(err);
        throw new FetchRateLimitError(url, retryAfter, {
          cause: err instanceof Error ? err : undefined,
        });
      }

      // Timeout Detection
      if (message.toLowerCase().includes("timeout")) {
        throw new FetchTimeoutError(url, opts.timeoutMs, {
          cause: err instanceof Error ? err : undefined,
        });
      }

      throw new FetchNetworkError(url, message, {
        cause: err instanceof Error ? err : undefined,
      });
    }

    // Response Validation
    if (!response.success) {
      throw new FetchError(
        `Firecrawl scrape failed: ${response.error ?? "unknown error"}`,
        url,
      );
    }

    if (!response.data?.html) {
      throw new FetchError("Firecrawl returned success but no HTML content", url);
    }

    const totalMs = Math.round(performance.now() - start);

    return {
      html: response.data.html,
      screenshot: response.data.screenshot ?? undefined,
      metadata: {
        finalUrl: response.data.metadata?.sourceURL ?? url,
        statusCode: response.data.metadata?.statusCode ?? 200,
        title: response.data.metadata?.title ?? "",
        botProtection: null, // Firecrawl handhabt Bot-Protection intern
        cookieBannerDismissed: false, // Firecrawl: kein explizites Cookie-Handling
        fetcherType: "firecrawl" as const,
      },
      timing: {
        totalMs,
      },
    };
  }

  private async getFirecrawlApp(): Promise<FirecrawlSdkApp> {
    if (this.firecrawlApp) return this.firecrawlApp as FirecrawlSdkApp;

    try {
      // Dynamic import — @mendable/firecrawl-js ist eine optionale Dependency.
      // Wenn nicht installiert, wirft der Import einen klaren Fehler.
      const { default: FirecrawlApp } = await import("@mendable/firecrawl-js");
      this.firecrawlApp = new FirecrawlApp({
        apiKey: this.config.apiKey,
        apiUrl: this.config.baseUrl,
      });
      return this.firecrawlApp as FirecrawlSdkApp;
    } catch (err) {
      throw new FetchConfigError(
        `Failed to load @mendable/firecrawl-js SDK. ` +
        `Install it: npm install @mendable/firecrawl-js\n` +
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private isTransientError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return msg.includes("5") && msg.includes("00")  // 500, 502, 503, 504
      || msg.includes("econnreset")
      || msg.includes("econnrefused")
      || msg.includes("socket hang up");
  }

  private parseRetryAfter(err: unknown): number | undefined {
    if (!(err instanceof Error)) return undefined;
    // Versuche Retry-After Header aus Error-Message zu extrahieren
    const match = err.message.match(/retry.?after[:\s]+(\d+)/i);
    return match ? parseInt(match[1]!, 10) : undefined;
  }
}

// ---------------------------------------------------------------------------
// Firecrawl SDK Types (minimal, um Typ-Sicherheit zu gewaehrleisten
// ohne harte Abhaengigkeit auf @mendable/firecrawl-js Typen)
// ---------------------------------------------------------------------------

interface FirecrawlSdkApp {
  scrapeUrl(url: string, params: FirecrawlScrapeParams): Promise<FirecrawlScrapeResponse>;
}

interface FirecrawlScrapeParams {
  url: string;
  formats: string[];
  waitFor?: number;
  timeout?: number;
  headers?: Record<string, string>;
}

interface FirecrawlScrapeResponse {
  success: boolean;
  error?: string;
  data?: {
    html?: string;
    screenshot?: string;
    metadata?: {
      title?: string;
      sourceURL?: string;
      statusCode?: number;
    };
  };
}
```

**Design-Entscheidungen:**

1. **Lazy SDK Import** -- `@mendable/firecrawl-js` wird erst beim ersten `fetch()` geladen. Das vermeidet `Cannot find module` Errors fuer Nutzer die den Adapter nicht verwenden. Identisches Pattern wie die LLM-Module in `analyze.ts` (Zeile 17-21).

2. **Eigene SDK-Type-Definitions** -- Statt `import type` aus `@mendable/firecrawl-js` definieren wir minimale Interfaces. Das entkoppelt unsere Typen von der SDK-Version und verhindert Build-Fehler wenn die Dependency nicht installiert ist.

3. **Retry mit Exponential Backoff** -- Nur fuer transiente Fehler (429, 5xx, Connection Resets). Default: 2 Retries, Base-Delay 1s. Das ergibt: 0s, 1s, 2s. Kein Jitter noetig bei einzelnen Requests.

4. **Kein Cookie-Banner-Handling** -- Firecrawl rendert Seiten serverseitig mit eigenem Browser-Pool. Cookie-Banner-Handling muesste auf deren Seite passieren. Wir markieren `cookieBannerDismissed: false` und verlassen uns auf Firecrawl's eigene Rendering-Qualitaet.

5. **Kein waitForSelector-Passthrough** -- Firecrawl's `waitFor` ist ms-basiert, nicht selector-basiert. Wir koennten eine heuristische Umrechnung machen, aber das waere fragil. Stattdessen: wenn der User `waitForSelector` braucht, sollte er Playwright nehmen.

---

### 3.4 Playwright Adapter (`src/adapter/playwright-fetcher.ts`)

```typescript
/**
 * PlaywrightFetcher — PageFetcher via Playwright.
 *
 * Refactored aus capture-fixtures.ts und browser-adapter.ts.
 * Lazy-launched: Browser wird erst beim ersten fetch() gestartet.
 * Cookie-Banner-Dismissal eingebaut (aus capture-fixtures.ts portiert).
 *
 * WICHTIG: Dieses Modul ersetzt NICHT den bestehenden BrowserAdapter.
 * BrowserAdapter ist fuer langlebige Sessions mit Context-Management.
 * PlaywrightFetcher ist fuer einmalige Fetch-Operationen (fire-and-forget).
 */

import pino from "pino";
import type {
  Browser,
  BrowserContext,
  Page,
  BrowserType,
} from "playwright";
import type { PageFetcher, FetchOptions, FetchResult, ResolvedFetchOptions } from "./fetcher.js";
import { FetchOptionsSchema } from "./fetcher.js";
import {
  FetchError,
  FetchTimeoutError,
  FetchBotProtectionError,
  FetchNetworkError,
} from "./fetcher-errors.js";

const logger = pino({ name: "balage:playwright-fetcher", level: process.env["LOG_LEVEL"] ?? "silent" });

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PlaywrightFetcherConfig {
  /** Browser engine. Default: chromium */
  browserType?: "chromium" | "firefox" | "webkit";

  /** Run headless. Default: true */
  headless?: boolean;

  /** Locale for browser context. Default: de-DE */
  locale?: string;

  /** Timezone. Default: Europe/Berlin */
  timezone?: string;

  /** Chromium launch args. Default: anti-detection set */
  launchArgs?: string[];
}

// Cookie-Banner Selektoren und Patterns — portiert aus capture-fixtures.ts
const COOKIE_ACCEPT_SELECTORS: readonly string[] = [
  "#gdpr-banner-accept",
  "#onetrust-accept-btn-handler",
  "#accept-recommended-btn-handler",
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
  "#uc-btn-accept-banner",
  'button[id*="accept"]',
  'button[id*="consent"]',
  'button[data-testid="consent-accept-all"]',
  'button[data-testid="uc-accept-all-button"]',
  'button[data-action="accept"]',
  '[data-cookiefirst-action="accept"]',
  ".cookie-consent-accept",
  ".js-cookie-consent-agree",
  ".consent-accept-all",
] as const;

const COOKIE_ACCEPT_TEXT_PATTERNS: readonly RegExp[] = [
  /^accept all$/i,
  /^alle akzeptieren$/i,
  /^accept$/i,
  /^akzeptieren$/i,
  /^agree$/i,
  /^zustimmen$/i,
  /^alle cookies akzeptieren$/i,
  /^accept all cookies$/i,
  /^got it$/i,
  /^j'accepte$/i,
  /^tout accepter$/i,
  /^aceptar todo$/i,
] as const;

// Bot-Protection Patterns — portiert aus capture-fixtures.ts
const BOT_PROTECTION_CHECKS = [
  {
    type: "cloudflare",
    selectors: ["#challenge-running", "#cf-challenge-running", ".cf-browser-verification"],
    titlePatterns: [/just a moment/i, /attention required/i, /cloudflare/i],
  },
  {
    type: "datadome",
    selectors: ["iframe[src*='datadome']", "#datadome-captcha"],
    titlePatterns: [/datadome/i],
  },
  {
    type: "captcha",
    selectors: [
      "iframe[src*='recaptcha']", "iframe[src*='hcaptcha']",
      ".g-recaptcha", ".h-captcha", "#captcha-container",
    ],
    titlePatterns: [],
  },
  {
    type: "perimeterx",
    selectors: ["#px-captcha", "#px-block"],
    titlePatterns: [/access denied/i, /please verify/i],
  },
] as const;

// User-Agent — realistisch, nicht headless-detectable
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class PlaywrightFetcher implements PageFetcher {
  readonly name = "playwright";
  private readonly config: Required<PlaywrightFetcherConfig>;
  private browser: Browser | null = null;
  private closed = false;

  constructor(config: PlaywrightFetcherConfig = {}) {
    this.config = {
      browserType: config.browserType ?? "chromium",
      headless: config.headless ?? true,
      locale: config.locale ?? "de-DE",
      timezone: config.timezone ?? "Europe/Berlin",
      launchArgs: config.launchArgs ?? [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-setuid-sandbox",
      ],
    };
  }

  async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    if (this.closed) {
      throw new FetchError("Fetcher is closed", url);
    }

    const opts: ResolvedFetchOptions = FetchOptionsSchema.parse(options ?? {});
    const start = performance.now();
    const browser = await this.ensureBrowser();

    // Frischer Context pro Request — keine State-Leaks zwischen Seiten
    const context = await browser.newContext({
      viewport: opts.viewport,
      userAgent: DEFAULT_USER_AGENT,
      locale: this.config.locale,
      timezoneId: this.config.timezone,
      extraHTTPHeaders: opts.headers,
      serviceWorkers: "block",
    });

    let page: Page | null = null;

    try {
      page = await context.newPage();

      // Navigation
      const navStart = performance.now();
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: opts.timeoutMs,
      });

      // NetworkIdle abwarten — mit Toleranz-Timeout
      await page.waitForLoadState("networkidle", {
        timeout: Math.min(15_000, opts.timeoutMs),
      }).catch(() => {
        logger.debug({ url }, "NetworkIdle timeout — continuing");
      });

      const navigationMs = Math.round(performance.now() - navStart);

      // Optional: auf Selector warten
      if (opts.waitForSelector) {
        await page.waitForSelector(opts.waitForSelector, {
          timeout: Math.min(10_000, opts.timeoutMs - navigationMs),
        }).catch(() => {
          logger.debug({ url, selector: opts.waitForSelector }, "waitForSelector timeout — continuing");
        });
      }

      // Bot-Protection Check
      const botType = await detectBotProtection(page);
      if (botType) {
        throw new FetchBotProtectionError(url, botType);
      }

      // Cookie-Banner dismissal
      let cookieBannerDismissed = false;
      if (opts.dismissCookies) {
        // Kurz warten — viele Banner laden verzaegert
        await page.waitForTimeout(2000);
        cookieBannerDismissed = await dismissCookieBanner(page);
        if (cookieBannerDismissed) {
          await page.waitForTimeout(500);
        }
      }

      // HTML extrahieren
      const html = await page.content();

      // Optional: Screenshot
      let screenshot: string | undefined;
      if (opts.screenshot) {
        const buffer = await page.screenshot({ fullPage: true });
        screenshot = buffer.toString("base64");
      }

      const totalMs = Math.round(performance.now() - start);
      const title = await page.title();

      return {
        html,
        screenshot,
        metadata: {
          finalUrl: page.url(),
          statusCode: 200, // Playwright gibt keinen Status-Code direkt — wir koennten
                           // page.on('response') nutzen, aber das waere fuer v1 overengineered
          title,
          botProtection: null,
          cookieBannerDismissed,
          fetcherType: "playwright" as const,
        },
        timing: {
          totalMs,
          navigationMs,
        },
      };
    } catch (err) {
      // Re-throw unserer eigenen Errors
      if (err instanceof FetchError) throw err;

      const message = err instanceof Error ? err.message : String(err);

      if (message.includes("Timeout") || message.includes("timeout")) {
        throw new FetchTimeoutError(url, opts.timeoutMs, {
          cause: err instanceof Error ? err : undefined,
        });
      }

      if (message.includes("net::ERR_") || message.includes("ECONNREFUSED")) {
        throw new FetchNetworkError(url, message, {
          cause: err instanceof Error ? err : undefined,
        });
      }

      throw new FetchError(
        `Playwright fetch failed: ${message}`,
        url,
        { cause: err instanceof Error ? err : undefined },
      );
    } finally {
      if (page) await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;

    const { chromium, firefox, webkit } = await import("playwright");
    const engines: Record<string, BrowserType> = { chromium, firefox, webkit };
    const engine = engines[this.config.browserType];

    if (!engine) {
      throw new FetchError(
        `Unsupported browser type: ${this.config.browserType}`,
        "",
      );
    }

    this.browser = await engine.launch({
      headless: this.config.headless,
      args: this.config.browserType === "chromium" ? this.config.launchArgs : [],
    });

    return this.browser;
  }
}

// ---------------------------------------------------------------------------
// Cookie-Banner Dismissal (portiert aus scripts/capture-fixtures.ts)
// ---------------------------------------------------------------------------

async function dismissCookieBanner(page: Page): Promise<boolean> {
  // Phase 1: Schnelle Selector-Suche
  for (const selector of COOKIE_ACCEPT_SELECTORS) {
    try {
      const btn = await page.$(selector);
      if (btn && (await btn.isVisible())) {
        await btn.click();
        await page.waitForTimeout(500);
        return true;
      }
    } catch {
      // Selector nicht gefunden, weiter
    }
  }

  // Phase 2: Text-basierte Button-Suche (mehrsprachig)
  try {
    const buttons = await page.$$("button, a[role='button'], [role='button']");
    for (const btn of buttons) {
      const text = (await btn.textContent())?.trim() ?? "";
      for (const pattern of COOKIE_ACCEPT_TEXT_PATTERNS) {
        if (pattern.test(text) && (await btn.isVisible())) {
          await btn.click();
          await page.waitForTimeout(500);
          return true;
        }
      }
    }
  } catch {
    // Keine Buttons gefunden
  }

  return false;
}

// ---------------------------------------------------------------------------
// Bot-Protection Detection (portiert aus scripts/capture-fixtures.ts)
// ---------------------------------------------------------------------------

async function detectBotProtection(page: Page): Promise<string | null> {
  const title = await page.title();
  const bodyText = await page.evaluate(
    () => document.body?.innerText?.slice(0, 2000) ?? "",
  );

  for (const check of BOT_PROTECTION_CHECKS) {
    for (const pattern of check.titlePatterns) {
      if (pattern.test(title) || pattern.test(bodyText)) {
        return check.type;
      }
    }

    for (const selector of check.selectors) {
      const element = await page.$(selector);
      if (element) return check.type;
    }
  }

  // Heuristik: Sehr wenig Content
  const contentLength = await page.evaluate(
    () => document.body?.innerHTML?.length ?? 0,
  );
  if (contentLength < 500) {
    return "empty-response";
  }

  return null;
}
```

**Design-Entscheidungen:**

1. **Separates Modul, kein Refactor von BrowserAdapter** -- BrowserAdapter verwaltet langlebige Sessions mit Context-Pooling, CDP-Sessions, Health-Checks. PlaywrightFetcher ist ein Fire-and-Forget-Tool. Unterschiedliche Verantwortlichkeiten, unterschiedliche Klassen. YAGNI ueber DRY.

2. **Code-Duplizierung aus capture-fixtures.ts** -- Die Cookie-Banner- und Bot-Protection-Logik wird bewusst kopiert statt importiert. Gruende: (a) capture-fixtures.ts ist ein Script, kein Library-Modul, (b) die Fetcher-Version braucht andere Error-Semantik (throw vs return status), (c) drei aehnliche Zeilen > eine premature Abstraction. Wenn spaeter ein drittes Modul die gleiche Logik braucht, extrahieren wir sie in `src/adapter/page-utils.ts`.

3. **Frischer Context pro Request** -- Kein State-Sharing zwischen Fetches. Wichtig fuer Isolation (Cookies, LocalStorage, Session). Akzeptabler Performance-Overhead fuer einen Fetcher der typisch 1-5 URLs pro Lauf verarbeitet.

4. **Lazy Browser Launch** -- `ensureBrowser()` startet den Browser beim ersten `fetch()`. Kein explizites `launch()` noetig. Browser wird bei Disconnect automatisch neu gestartet.

5. **Playwright als Lazy Import** -- Wie beim Firecrawl SDK. Wenn jemand nur Firecrawl nutzt, wird Playwright nie geladen. Keine `Cannot find module 'playwright'` Crashes.

---

### 3.5 Auto-Detection (`src/adapter/create-fetcher.ts`)

```typescript
/**
 * createFetcher — Factory mit Auto-Detection.
 *
 * Prueft welche Adapter verfuegbar sind und waehlt den besten aus.
 * Fallback-Kette: Firecrawl -> Playwright -> FetchConfigError
 *
 * Verfuegbarkeit:
 *   Firecrawl:  API Key vorhanden (FIRECRAWL_API_KEY env var)
 *                + @mendable/firecrawl-js installiert
 *   Playwright: playwright installiert
 */

import pino from "pino";
import type { PageFetcher } from "./fetcher.js";
import { FetchConfigError } from "./fetcher-errors.js";

const logger = pino({ name: "balage:create-fetcher", level: process.env["LOG_LEVEL"] ?? "silent" });

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CreateFetcherOptions {
  /**
   * Explicit fetcher choice. Default: "auto" (try firecrawl, fallback playwright).
   */
  fetcher?: "auto" | "firecrawl" | "playwright";

  /** Firecrawl API key. Overrides FIRECRAWL_API_KEY env var. */
  firecrawlApiKey?: string;

  /** Firecrawl base URL for self-hosted instances. */
  firecrawlBaseUrl?: string;

  /** Playwright browser type. Default: chromium */
  browserType?: "chromium" | "firefox" | "webkit";

  /** Playwright headless mode. Default: true */
  headless?: boolean;
}

// ---------------------------------------------------------------------------
// Availability Checks
// ---------------------------------------------------------------------------

interface AvailabilityResult {
  available: boolean;
  reason?: string;
}

function checkFirecrawlAvailability(options: CreateFetcherOptions): AvailabilityResult {
  const apiKey = options.firecrawlApiKey ?? process.env["FIRECRAWL_API_KEY"];
  if (!apiKey) {
    return { available: false, reason: "No FIRECRAWL_API_KEY env var or firecrawlApiKey option" };
  }

  // SDK-Check via require.resolve — prueft ob das Paket installiert ist,
  // ohne es tatsaechlich zu laden.
  try {
    // In ESM: import.meta.resolve wirft nicht in allen Runtimes.
    // Pragmatischer Check: versuche lazy import im catch.
    // Der echte Check passiert beim ersten fetch() via dynamic import.
    return { available: true };
  } catch {
    return { available: false, reason: "@mendable/firecrawl-js not installed" };
  }
}

function checkPlaywrightAvailability(): AvailabilityResult {
  try {
    // Pruefe ob playwright installiert ist.
    // Gleicher Ansatz: der echte Check passiert lazy beim Fetch.
    return { available: true };
  } catch {
    return { available: false, reason: "playwright not installed" };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a PageFetcher based on available adapters.
 *
 * @throws {FetchConfigError} when no adapter is available
 */
export async function createFetcher(options: CreateFetcherOptions = {}): Promise<PageFetcher> {
  const choice = options.fetcher ?? "auto";

  if (choice === "firecrawl") {
    return createFirecrawlFetcher(options);
  }

  if (choice === "playwright") {
    return createPlaywrightFetcher(options);
  }

  // Auto-Detection
  const firecrawlCheck = checkFirecrawlAvailability(options);
  if (firecrawlCheck.available) {
    logger.info("Auto-detected: using Firecrawl fetcher");
    try {
      return await createFirecrawlFetcher(options);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Firecrawl fetcher creation failed, trying Playwright",
      );
    }
  } else {
    logger.debug({ reason: firecrawlCheck.reason }, "Firecrawl not available");
  }

  const playwrightCheck = checkPlaywrightAvailability();
  if (playwrightCheck.available) {
    logger.info("Auto-detected: using Playwright fetcher");
    try {
      return await createPlaywrightFetcher(options);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Playwright fetcher creation failed",
      );
    }
  } else {
    logger.debug({ reason: playwrightCheck.reason }, "Playwright not available");
  }

  throw new FetchConfigError(
    "No page fetcher available. Install one of:\n" +
    "  - Firecrawl: npm install @mendable/firecrawl-js + set FIRECRAWL_API_KEY\n" +
    "  - Playwright: npm install playwright\n" +
    (firecrawlCheck.reason ? `  Firecrawl: ${firecrawlCheck.reason}\n` : "") +
    (playwrightCheck.reason ? `  Playwright: ${playwrightCheck.reason}\n` : ""),
  );
}

// ---------------------------------------------------------------------------
// Lazy Constructors (vermeidet Top-Level Imports der optionalen Dependencies)
// ---------------------------------------------------------------------------

async function createFirecrawlFetcher(options: CreateFetcherOptions): Promise<PageFetcher> {
  const { FirecrawlFetcher } = await import("./firecrawl-fetcher.js");
  const apiKey = options.firecrawlApiKey ?? process.env["FIRECRAWL_API_KEY"];

  if (!apiKey) {
    throw new FetchConfigError("Firecrawl requires an API key (FIRECRAWL_API_KEY or firecrawlApiKey option)");
  }

  return new FirecrawlFetcher({
    apiKey,
    baseUrl: options.firecrawlBaseUrl,
  });
}

async function createPlaywrightFetcher(options: CreateFetcherOptions): Promise<PageFetcher> {
  const { PlaywrightFetcher } = await import("./playwright-fetcher.js");
  return new PlaywrightFetcher({
    browserType: options.browserType,
    headless: options.headless,
  });
}
```

**Design-Entscheidungen:**

1. **Async Factory** -- `createFetcher` ist async weil die Lazy-Imports async sind. Das ist konsistent mit dem Rest der Codebase (alle High-Level APIs sind async).

2. **Firecrawl vor Playwright in Fallback-Kette** -- Firecrawl ist schneller (kein Browser-Launch), kostenguenstiger (keine lokale Compute), und zuverlaessiger (professionelles Rendering-Backend). Playwright ist der Fallback fuer Entwickler die lokal arbeiten oder kein Firecrawl-Abo haben.

3. **Keine Package-Existenz-Pruefung zur Build-Zeit** -- `require.resolve` funktioniert nicht zuverlaessig in ESM. Stattdessen: Pragmatischer Ansatz. `checkFirecrawlAvailability` prueft nur den API Key. Der SDK-Import-Fehler wird beim ersten `fetch()` sauber gefangen und als `FetchConfigError` geworfen. Das ist ehrlicher als ein falsch-positiver "not installed" Check.

4. **Explizite Fetcher-Wahl moeglich** -- `fetcher: "firecrawl" | "playwright"` ueberspringt Auto-Detection. Wichtig fuer Tests und fuer Nutzer die genau wissen was sie wollen.

---

### 3.6 Top-Level API (`src/core/analyze.ts` Erweiterung)

```typescript
// Neuer Export in src/core/analyze.ts
// (Am Ende der bestehenden Datei anhaengen)

// ---------------------------------------------------------------------------
// URL-basierte Analyse API
// ---------------------------------------------------------------------------

export interface AnalyzeURLOptions extends AnalyzeOptions {
  /** Fetcher configuration. Default: auto-detect. */
  fetcher?: "auto" | "firecrawl" | "playwright";

  /** Firecrawl API key. Overrides FIRECRAWL_API_KEY env var. */
  firecrawlApiKey?: string;

  /** Firecrawl base URL for self-hosted instances. */
  firecrawlBaseUrl?: string;

  /** Playwright browser type. Default: chromium */
  browserType?: "chromium" | "firefox" | "webkit";

  /** Playwright headless mode. Default: true */
  headless?: boolean;

  /** Fetch timeout in ms. Default: 30000 */
  fetchTimeoutMs?: number;

  /** Wait for selector before capturing HTML. */
  waitForSelector?: string;

  /** Dismiss cookie banners. Default: true */
  dismissCookies?: boolean;

  /** Capture screenshot alongside analysis. Default: false */
  screenshot?: boolean;
}

/** Result extended with fetch metadata. */
export interface AnalysisFromURLResult extends AnalysisResult {
  fetch: {
    /** Which fetcher was used. */
    fetcherType: "firecrawl" | "playwright";
    /** Final URL after redirects. */
    finalUrl: string;
    /** Page title. */
    title: string;
    /** Fetch timing in ms. */
    fetchMs: number;
    /** Screenshot as base64, if requested. */
    screenshot?: string;
  };
}

/**
 * Fetch a URL and analyze its HTML in one call.
 *
 * Convenience wrapper around createFetcher() + analyzeFromHTML().
 * Fetcher is created and closed per call — no resource leaks.
 *
 * @param url - URL to fetch and analyze
 * @param options - Combined fetch + analysis options
 * @returns Analysis result with fetch metadata
 *
 * @throws {FetchError} on fetch failures
 * @throws {BalageInputError} on analysis failures
 *
 * @example
 * ```typescript
 * import { analyzeFromURL } from "@balage/core";
 *
 * const result = await analyzeFromURL("https://example.com/login", {
 *   llm: { provider: "openai", apiKey: process.env.OPENAI_API_KEY! },
 *   fetcher: "auto",
 * });
 * console.log(result.endpoints);
 * console.log(result.fetch.fetcherType); // "firecrawl" or "playwright"
 * ```
 */
export async function analyzeFromURL(
  url: string,
  options: AnalyzeURLOptions = {},
): Promise<AnalysisFromURLResult> {
  // Lazy-load fetcher module (L1-Dependency — nicht auf Top-Level)
  const { createFetcher } = await import("../adapter/create-fetcher.js");

  const fetcher = await createFetcher({
    fetcher: options.fetcher,
    firecrawlApiKey: options.firecrawlApiKey,
    firecrawlBaseUrl: options.firecrawlBaseUrl,
    browserType: options.browserType,
    headless: options.headless,
  });

  try {
    const fetchResult = await fetcher.fetch(url, {
      timeoutMs: options.fetchTimeoutMs,
      waitForSelector: options.waitForSelector,
      dismissCookies: options.dismissCookies,
      screenshot: options.screenshot,
    });

    // URL aus Fetch-Result verwenden (nach Redirects)
    const analysisOptions: AnalyzeOptions = {
      ...options,
      url: fetchResult.metadata.finalUrl,
    };

    const analysisResult = await analyzeFromHTML(fetchResult.html, analysisOptions);

    return {
      ...analysisResult,
      fetch: {
        fetcherType: fetchResult.metadata.fetcherType,
        finalUrl: fetchResult.metadata.finalUrl,
        title: fetchResult.metadata.title,
        fetchMs: fetchResult.timing.totalMs,
        screenshot: fetchResult.screenshot,
      },
    };
  } finally {
    // Fetcher IMMER schliessen — kein Resource Leak
    await fetcher.close();
  }
}
```

**Design-Entscheidungen:**

1. **Fetcher per Call erstellen und schliessen** -- Kein Fetcher-Pooling. Fuer den typischen Use-Case (1-5 URLs analysieren) ist der Overhead vernachlaessigbar. Ein Fetcher-Pool waere premature Optimization und wuerde Resource-Leak-Risiken einfuehren. Wenn spaeter Batch-Processing gebraucht wird, kann der User den Fetcher direkt nutzen.

2. **Lazy Import von `create-fetcher.ts`** -- Core (L2) importiert Adapter (L1) nur lazy. Das bewahrt die Layer-Trennung: `analyzeFromHTML` braucht keine Adapter-Dependencies, `analyzeFromURL` laedt sie nur bei Bedarf.

3. **`AnalysisFromURLResult extends AnalysisResult`** -- Erweitert, nicht ersetzt. Bestehender Code der `AnalysisResult` erwartet funktioniert weiterhin. Das `fetch`-Objekt ist rein additiv.

4. **URL aus Fetch-Result fuer Analyse** -- Nach Redirects koennte die Final-URL anders sein. Die Analyse-Pipeline nutzt die URL fuer LLM-Kontext. Es ist wichtig, die tatsaechliche URL zu verwenden.

---

## 4. Exports und Public API

### 4.1 Adapter Index (`src/adapter/index.ts` Erweiterung)

```typescript
// Neue Exports am Ende der bestehenden index.ts:

// PageFetcher Interface
export type { PageFetcher, FetchOptions, FetchResult, FetchMetadata, FetchTiming } from "./fetcher.js";
export { FetchOptionsSchema, FetchMetadataSchema, FetchTimingSchema } from "./fetcher.js";

// Fetcher Errors
export {
  FetchError,
  FetchTimeoutError,
  FetchBotProtectionError,
  FetchNetworkError,
  FetchRateLimitError,
  FetchConfigError,
} from "./fetcher-errors.js";

// Fetcher Implementations
export { FirecrawlFetcher } from "./firecrawl-fetcher.js";
export type { FirecrawlFetcherConfig } from "./firecrawl-fetcher.js";
export { PlaywrightFetcher } from "./playwright-fetcher.js";
export type { PlaywrightFetcherConfig } from "./playwright-fetcher.js";

// Factory
export { createFetcher } from "./create-fetcher.js";
export type { CreateFetcherOptions } from "./create-fetcher.js";
```

### 4.2 Core Index (`src/core/index.ts` Erweiterung)

```typescript
// Neuer Export:
export { analyzeFromURL } from "./analyze.js";
export type { AnalyzeURLOptions, AnalysisFromURLResult } from "./analyze.js";
```

---

## 5. Environment Configuration

### 5.1 Neue Env-Variablen (`src/config/env.ts` Erweiterung)

```typescript
// Erweiterung des BalageEnvConfig Interface:
export interface BalageEnvConfig {
  // ... bestehende Felder ...

  /** Firecrawl API key for URL-based analysis. */
  firecrawlApiKey: string | undefined;

  /** Firecrawl base URL for self-hosted. */
  firecrawlBaseUrl: string | undefined;

  /** Default fetcher: auto, firecrawl, playwright. */
  defaultFetcher: "auto" | "firecrawl" | "playwright";

  /** Whether any fetcher is available. */
  hasAnyFetcher: boolean;
}

// In loadEnvConfig():
const firecrawlApiKey = process.env["FIRECRAWL_API_KEY"] || undefined;
const firecrawlBaseUrl = process.env["FIRECRAWL_BASE_URL"] || undefined;
const defaultFetcherRaw = process.env["BALAGE_DEFAULT_FETCHER"] ?? "auto";
const defaultFetcher = ["auto", "firecrawl", "playwright"].includes(defaultFetcherRaw)
  ? defaultFetcherRaw as "auto" | "firecrawl" | "playwright"
  : "auto";
```

### 5.2 .env.example Erweiterung

```bash
# Page Fetcher (for analyzeFromURL)
FIRECRAWL_API_KEY=        # Firecrawl API key (firecrawl.dev or self-hosted)
FIRECRAWL_BASE_URL=       # Self-hosted: https://your-firecrawl.example.com
BALAGE_DEFAULT_FETCHER=auto  # auto | firecrawl | playwright
```

---

## 6. Dependency Management

### 6.1 package.json Aenderungen

```jsonc
{
  "dependencies": {
    // Bestehend — KEINE Aenderung:
    "playwright": "^1.50.0",     // Bereits installiert

    // KEINE neue Dependency hier!
    // @mendable/firecrawl-js wird NICHT zu dependencies hinzugefuegt.
    // Es ist eine OPTIONALE Dependency.
  },
  "peerDependencies": {
    "@mendable/firecrawl-js": ">=1.0.0"  // NEU: Optional peer dependency
  },
  "peerDependenciesMeta": {
    "@mendable/firecrawl-js": {
      "optional": true                     // NPM zeigt Warnung nur wenn Feature genutzt wird
    }
  }
}
```

**Rationale:** `@mendable/firecrawl-js` als optionale peerDependency. Nutzer die nur `analyzeFromHTML()` verwenden, installieren kein Firecrawl SDK. Nutzer die `analyzeFromURL()` mit Firecrawl wollen, installieren es explizit. Der Lazy-Import in `FirecrawlFetcher` gibt einen klaren Fehler wenn das SDK fehlt.

---

## 7. Dateistruktur nach Implementation

```
src/adapter/
  browser-adapter.ts          # UNVERAENDERT — langlebige Sessions
  browser-pool.ts             # UNVERAENDERT
  config-schema.ts            # UNVERAENDERT
  dom-extractor.ts            # UNVERAENDERT
  errors.ts                   # UNVERAENDERT
  health-check.ts             # UNVERAENDERT
  state-detector.ts           # UNVERAENDERT
  types.ts                    # UNVERAENDERT
  index.ts                    # ERWEITERT — neue Exports
  adapter.test.ts             # UNVERAENDERT
  fetcher.ts                  # NEU — Interface + Schemas
  fetcher-errors.ts           # NEU — Error-Klassen
  firecrawl-fetcher.ts        # NEU — Firecrawl Implementation
  playwright-fetcher.ts       # NEU — Playwright Implementation
  create-fetcher.ts           # NEU — Factory mit Auto-Detection

src/core/
  analyze.ts                  # ERWEITERT — analyzeFromURL() + Types
  index.ts                    # ERWEITERT — neuer Export
  ...                         # Rest UNVERAENDERT

src/config/
  env.ts                      # ERWEITERT — Firecrawl env vars
```

---

## 8. Error Handling Matrix

| Szenario | Firecrawl | Playwright | Error-Typ |
|----------|-----------|------------|-----------|
| Timeout | API timeout → FetchTimeoutError | Navigation timeout → FetchTimeoutError | `FETCH_TIMEOUT_ERROR` |
| Bot Protection | Firecrawl handhabt intern, selten sichtbar | Detection + FetchBotProtectionError | `FETCH_BOT_PROTECTION_ERROR` |
| Rate Limit (429) | FetchRateLimitError + Auto-Retry | N/A (kein Server) | `FETCH_RATE_LIMIT_ERROR` |
| Network Error | FetchNetworkError | FetchNetworkError | `FETCH_NETWORK_ERROR` |
| SDK nicht installiert | FetchConfigError (klare Meldung) | FetchConfigError | `FETCH_CONFIG_ERROR` |
| API Key fehlt | FetchConfigError | N/A | `FETCH_CONFIG_ERROR` |
| Leeres HTML | FetchError("no HTML content") | Erfolg (HTML kann leer sein) | `FETCH_ERROR` |
| Fetcher geschlossen | FetchError("Fetcher is closed") | FetchError("Fetcher is closed") | `FETCH_ERROR` |

---

## 9. Abgrenzung zu bestehenden Modulen

### Was sich NICHT aendert:

| Modul | Status | Grund |
|-------|--------|-------|
| `BrowserAdapter` | Unveraendert | Anderer Use-Case: langlebige Sessions mit CDP |
| `BrowserPool` | Unveraendert | Pool-Management ist orthogonal zu Fetching |
| `DomExtractor` | Unveraendert | Extrahiert aus Page-Objekten, nicht aus HTML |
| `StateDetector` | Unveraendert | Braucht lebende Page-Instanz |
| `capture-fixtures.ts` | Unveraendert | Script, kein Library-Code |
| `analyzeFromHTML()` | Unveraendert | Signature und Verhalten bleiben identisch |

### Zukunft: Shared Utils

Wenn ein drittes Modul die Cookie-Banner- oder Bot-Detection-Logik braucht, extrahieren wir in:

```
src/adapter/page-utils.ts  # dismissCookieBanner(), detectBotProtection()
```

Aber erst dann. YAGNI.

---

## 10. Test-Strategie

### Unit Tests

| Datei | Testet | Mock |
|-------|--------|------|
| `fetcher.test.ts` | Schema-Validierung, Default-Werte | Keine |
| `fetcher-errors.test.ts` | Error-Klassen, instanceof, code | Keine |
| `firecrawl-fetcher.test.ts` | Retry-Logik, Error-Mapping, Config | Firecrawl SDK gemockt |
| `playwright-fetcher.test.ts` | Navigation, Cookie-Dismiss, Bot-Detection | Playwright gemockt |
| `create-fetcher.test.ts` | Auto-Detection, Fallback-Kette | Beide Fetcher gemockt |

### Integration Tests

| Test | Beschreibung | Voraussetzung |
|------|-------------|---------------|
| `analyze-url.integration.test.ts` | `analyzeFromURL("https://example.com")` E2E | Playwright installiert |
| `firecrawl.integration.test.ts` | Firecrawl gegen echte API | `FIRECRAWL_API_KEY` gesetzt |

### Performance Budgets

| Metrik | Budget |
|--------|--------|
| `createFetcher()` | < 50ms (kein Browser-Launch) |
| `PlaywrightFetcher.fetch()` erster Call | < 5000ms (inkl. Browser-Launch) |
| `PlaywrightFetcher.fetch()` folgende Calls | < 3000ms (Browser wiederverwendet) |
| `FirecrawlFetcher.fetch()` | < 10000ms (API-Roundtrip) |
| `analyzeFromURL()` gesamt | < 15000ms (Fetch + Analyse) |

---

## 11. Migration Guide

### Bestehende Nutzer: Kein Breaking Change

```typescript
// Vorher — funktioniert weiterhin unveraendert
import { analyzeFromHTML } from "@balage/core";
const result = await analyzeFromHTML(html, { url: "..." });

// Neu — zusaetzliche API
import { analyzeFromURL } from "@balage/core";
const result = await analyzeFromURL("https://example.com/login", {
  llm: { provider: "openai", apiKey: "..." },
});
```

### Nutzer die Playwright direkt verwenden:

```typescript
// Vorher — manuelles Fetching
import { chromium } from "playwright";
import { analyzeFromHTML } from "@balage/core";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("https://example.com");
const html = await page.content();
await browser.close();
const result = await analyzeFromHTML(html);

// Nachher — eine Zeile
import { analyzeFromURL } from "@balage/core";
const result = await analyzeFromURL("https://example.com");
```

### Nutzer die Firecrawl bevorzugen:

```bash
npm install @mendable/firecrawl-js
export FIRECRAWL_API_KEY=fc-...
```

```typescript
import { analyzeFromURL } from "@balage/core";

// Auto-Detection findet Firecrawl API Key
const result = await analyzeFromURL("https://example.com");
console.log(result.fetch.fetcherType); // "firecrawl"
```

---

## 12. Open Questions fuer ARCHITECT

1. **Firecrawl als default in CI/CD?** -- Sollen wir in der CI-Pipeline Firecrawl als Default konfigurieren (schneller, keine Browser-Installation noetig)? Oder Playwright fuer deterministische Reproduzierbarkeit?

2. **Batch-API** -- Firecrawl hat eine Batch-Scrape-API (`POST /v1/batch/scrape`). Brauchen wir eine `analyzeFromURLs(urls[])` Batch-API? Oder reicht sequentielles Aufrufen von `analyzeFromURL` fuer v1?

3. **Screenshot-Nutzung** -- Screenshots koennten fuer Vision-basierte Analyse genutzt werden (vgl. `vision-baseline.test.ts`). Soll `analyzeFromURL` automatisch einen Screenshot an die Analyse-Pipeline weitergeben wenn die Vision-Pipeline aktiviert wird?

4. **Firecrawl v1 Crawl-API** -- Firecrawl hat neben Scrape auch eine Crawl-API fuer Multi-Page. Soll das spaeter als `crawlAndAnalyze()` gebaut werden, oder ist das out-of-scope?

---

## 13. Implementation Plan

| Phase | Dateien | Aufwand | Abhaengigkeiten |
|-------|---------|---------|-----------------|
| 1 | `fetcher.ts`, `fetcher-errors.ts` | 1h | Keine |
| 2 | `firecrawl-fetcher.ts` | 2h | Phase 1 |
| 3 | `playwright-fetcher.ts` | 2h | Phase 1 |
| 4 | `create-fetcher.ts` | 1h | Phase 2+3 |
| 5 | `analyze.ts` Erweiterung, `index.ts` Updates | 1h | Phase 4 |
| 6 | `env.ts` Erweiterung | 0.5h | Keine |
| 7 | Unit Tests | 3h | Phase 1-5 |
| 8 | Integration Tests | 2h | Phase 5 |

**Gesamt: ~12.5h**

---

*Erstellt: 2026-03-29*
*Review angefragt: ARCHITECT, SECURITY*

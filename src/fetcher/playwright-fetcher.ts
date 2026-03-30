/**
 * PlaywrightFetcher (FC-015)
 *
 * Implementiert PageFetcher Interface fuer direkte Browser-basierte Fetches.
 * Nutzt Playwright Chromium mit lazy Browser-Launch beim ersten fetch().
 *
 * UNTERSCHIED zu BrowserAdapter (FC-017):
 *   BrowserAdapter  = Langlebige Browser-Sessions mit Context-Management,
 *                     CDP-Zugriff, und Multi-Context-Pool. Gedacht fuer
 *                     wiederholte Interaktionen ueber laengere Zeit.
 *   PlaywrightFetcher = Einmalige, isolierte Page-Fetches. Ein Browser
 *                       wird lazy gestartet, pro fetch() ein neuer Context
 *                       erstellt und nach dem Fetch geschlossen. Optimiert
 *                       fuer den PageFetcher-Interface-Vertrag.
 *
 * Features:
 *  - Lazy Browser-Launch beim ersten fetch()
 *  - Cookie-Banner-Dismissal (portiert von capture-fixtures.ts)
 *  - Screenshot-Support via page.screenshot({ encoding: 'base64' })
 *  - Bot-Protection-Detection (Cloudflare, DataDome, CAPTCHA, PerimeterX)
 *  - SSRF-Schutz via validateFetchUrl() VOR Navigation
 *  - Redirect-SSRF-Schutz via validateRedirectUrl()
 *  - Idempotentes close()
 *
 * Security:
 *  - validateFetchUrl() VOR jeder Navigation (SSRF-Schutz)
 *  - validateRedirectUrl() auf finale URL nach Redirects
 *  - Keine Credentials in URLs erlaubt
 */

import pino from "pino";
import type {
  PageFetcher,
  FetchOptions,
  FetchResult,
  ResolvedFetchOptions,
  FetchMetadata,
} from "./types.js";
import { FetchOptionsSchema } from "./types.js";
import {
  FetchTimeoutError,
  FetchNetworkError,
  FetchBotProtectionError,
} from "./errors.js";
import { validateFetchUrl, validateRedirectUrl } from "../security/url-validator.js";

const logger = pino({
  name: "fetcher:playwright",
  level: process.env["LOG_LEVEL"] ?? "silent",
});

// ============================================================================
// Config
// ============================================================================

export interface PlaywrightFetcherConfig {
  /** HTTP URLs erlauben (nur fuer lokale Entwicklung). Default: false */
  allowHttp?: boolean;

  /** Headless-Modus. Default: true */
  headless?: boolean;

  /** User-Agent String. Default: realistischer Chrome UA */
  userAgent?: string;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ============================================================================
// Cookie-Banner Selectors (portiert aus capture-fixtures.ts)
// ============================================================================

/**
 * Gaengige "Accept All" Button-Selektoren fuer Cookie-/Consent-Banner.
 * Sprachuebergreifend, ID-basiert, Data-Attribut-basiert, Klassen-basiert.
 */
const COOKIE_ACCEPT_SELECTORS = [
  // ID-basiert
  "#gdpr-banner-accept",
  "#onetrust-accept-btn-handler",
  "#accept-recommended-btn-handler",
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
  "#uc-btn-accept-banner",
  'button[id*="accept"]',
  'button[id*="consent"]',
  // Data-Attribut-basiert
  'button[data-testid="consent-accept-all"]',
  'button[data-testid="uc-accept-all-button"]',
  'button[data-action="accept"]',
  '[data-cookiefirst-action="accept"]',
  // Klassen-basiert
  ".cookie-consent-accept",
  ".js-cookie-consent-agree",
  ".consent-accept-all",
] as const;

/**
 * Mehrsprachige Accept-Button-Text-Patterns.
 * Fallback wenn kein Selector matcht.
 */
const COOKIE_ACCEPT_TEXT_PATTERNS = [
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

// ============================================================================
// Bot-Protection Detection Patterns
// ============================================================================

interface BotProtectionCheck {
  type: string;
  selectors: string[];
  titlePatterns: RegExp[];
}

const BOT_PROTECTION_CHECKS: readonly BotProtectionCheck[] = [
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
      "iframe[src*='recaptcha']",
      "iframe[src*='hcaptcha']",
      ".g-recaptcha",
      ".h-captcha",
      "#captcha-container",
    ],
    titlePatterns: [],
  },
  {
    type: "perimeterx",
    selectors: ["#px-captcha", "#px-block"],
    titlePatterns: [/access denied/i, /please verify/i],
  },
  {
    type: "generic-block",
    selectors: [],
    titlePatterns: [/blocked/i, /bot detected/i, /unusual traffic/i],
  },
] as const;

// ============================================================================
// Playwright Types — dynamisch importiert
// ============================================================================

// Wir definieren minimale Interfaces statt harter playwright-Imports auf Modul-Ebene,
// damit der dynamic import sauber funktioniert. Die tatsaechlichen Playwright-Typen
// werden beim Import resolved.
type PlaywrightBrowser = import("playwright").Browser;
type PlaywrightPage = import("playwright").Page;

// ============================================================================
// PlaywrightFetcher
// ============================================================================

export class PlaywrightFetcher implements PageFetcher {
  readonly name = "playwright";

  private browser: PlaywrightBrowser | null = null;
  private launching: Promise<PlaywrightBrowser> | null = null;
  private readonly allowHttp: boolean;
  private readonly headless: boolean;
  private readonly userAgent: string;
  private closed = false;

  constructor(config?: PlaywrightFetcherConfig) {
    this.allowHttp = config?.allowHttp ?? false;
    this.headless = config?.headless ?? true;
    this.userAgent = config?.userAgent ?? DEFAULT_USER_AGENT;
  }

  async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    if (this.closed) {
      throw new FetchNetworkError(url, "PlaywrightFetcher is closed");
    }

    // --- Resolve Options mit Defaults ---
    const resolved: ResolvedFetchOptions = FetchOptionsSchema.parse(options ?? {});

    // --- SECURITY: URL validieren VOR der Navigation ---
    const validation = validateFetchUrl(url, { allowHttp: this.allowHttp });
    if (!validation.valid) {
      throw new FetchNetworkError(url, `URL rejected: ${validation.reason}`);
    }

    // --- Lazy Browser-Launch ---
    const browser = await this.ensureBrowser();

    // --- Neuer isolierter Context pro Fetch ---
    const start = performance.now();
    const context = await browser.newContext({
      viewport: { width: resolved.viewport.width, height: resolved.viewport.height },
      userAgent: this.userAgent,
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
      extraHTTPHeaders: Object.keys(resolved.headers).length > 0 ? resolved.headers : undefined,
    });

    let page: PlaywrightPage | null = null;

    try {
      context.setDefaultTimeout(resolved.timeoutMs);
      context.setDefaultNavigationTimeout(resolved.timeoutMs);

      page = await context.newPage();

      // --- Navigation ---
      const navStart = performance.now();
      let response;
      try {
        response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: resolved.timeoutMs,
        });
      } catch (err) {
        throw this.classifyNavigationError(err, url, resolved.timeoutMs);
      }
      const navigationMs = Math.round(performance.now() - navStart);

      // Warte auf networkidle, aber mit Toleranz-Timeout
      await page.waitForLoadState("networkidle", {
        timeout: Math.min(resolved.timeoutMs, 15_000),
      }).catch(() => {
        logger.debug({ url }, "networkidle timeout — continuing");
      });

      // --- SECURITY: Redirect-SSRF-Check auf finale URL ---
      const finalUrl = page.url();
      const redirectValidation = validateRedirectUrl(finalUrl, url, { allowHttp: this.allowHttp });
      if (!redirectValidation.valid) {
        throw new FetchNetworkError(
          url,
          `Redirect URL rejected (${finalUrl}): ${redirectValidation.reason}`,
        );
      }

      // --- Bot-Protection-Detection ---
      const botProtection = await detectBotProtection(page);
      if (botProtection) {
        logger.warn({ url, botProtection }, "Bot protection detected");
        throw new FetchBotProtectionError(url, botProtection);
      }

      // --- Cookie-Banner-Dismissal ---
      let cookieBannerDismissed = false;
      if (resolved.dismissCookies) {
        // Kurz warten — viele Banner laden mit Delay
        await page.waitForTimeout(1_500);
        cookieBannerDismissed = await dismissCookieBanner(page);
        if (cookieBannerDismissed) {
          logger.debug({ url }, "Cookie banner dismissed");
          await page.waitForTimeout(500);
        }
      }

      // --- Optional: Auf spezifischen Selector warten ---
      if (resolved.waitForSelector) {
        try {
          await page.waitForSelector(resolved.waitForSelector, {
            timeout: Math.min(resolved.timeoutMs, 10_000),
          });
        } catch {
          logger.debug({ url, selector: resolved.waitForSelector }, "waitForSelector timeout — continuing");
        }
      }

      // --- HTML extrahieren ---
      const html = await page.content();
      const title = await page.title();
      const statusCode = response?.status() ?? 200;

      // --- Optional: Screenshot ---
      let screenshot: string | undefined;
      if (resolved.screenshot) {
        const buf = await page.screenshot({ fullPage: false });
        screenshot = buf.toString("base64");
      }

      const totalMs = Math.round(performance.now() - start);

      const metadata: FetchMetadata = {
        finalUrl,
        statusCode,
        title,
        botProtection: null,
        cookieBannerDismissed,
        fetcherType: "playwright",
      };

      return {
        html,
        screenshot,
        metadata,
        timing: {
          totalMs,
          navigationMs,
        },
      };
    } finally {
      // Context IMMER schliessen — kein Recycling
      await context.close().catch((err: unknown) => {
        logger.debug({ url, err }, "Error closing context");
      });
    }
  }

  async close(): Promise<void> {
    // Idempotent — mehrfach-Aufruf sicher
    if (this.closed) return;
    this.closed = true;

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (err) {
        logger.debug({ err }, "Error closing browser");
      }
      this.browser = null;
    }

    this.launching = null;
  }

  // ==========================================================================
  // Private: Lazy Browser-Launch
  // ==========================================================================

  /**
   * Stellt sicher dass ein Browser laeuft. Lazy-Launch beim ersten Aufruf.
   * Thread-safe: Wenn mehrere fetch()-Calls gleichzeitig kommen, wartet
   * der zweite Call auf den laufenden Launch statt einen zweiten zu starten.
   */
  private async ensureBrowser(): Promise<PlaywrightBrowser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    // Wenn bereits ein Launch laeuft, darauf warten
    if (this.launching) {
      return this.launching;
    }

    // Neuen Launch starten
    this.launching = this.launchBrowser();

    try {
      this.browser = await this.launching;
      return this.browser;
    } catch (err) {
      // Launch fehlgeschlagen — reset damit ein naechster Versuch moeglich ist
      this.launching = null;
      throw err;
    }
  }

  private async launchBrowser(): Promise<PlaywrightBrowser> {
    // Dynamic Import — playwright wird erst zur Laufzeit geladen.
    // Wenn playwright nicht installiert ist, gibt es einen klaren Error.
    let chromium;
    try {
      const pw = await import("playwright");
      chromium = pw.chromium;
    } catch (err) {
      throw new FetchNetworkError(
        "",
        "Playwright is not installed. Run: npm install playwright && npx playwright install chromium",
        { cause: err instanceof Error ? err : undefined },
      );
    }

    logger.info({ headless: this.headless }, "Launching Playwright browser");

    try {
      const browser = await chromium.launch({
        headless: this.headless,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-gpu",
          "--disable-setuid-sandbox",
          "--dns-prefetch-disable",
          "--disk-cache-size=0",
        ],
      });

      logger.info("Playwright browser launched");
      return browser;
    } catch (err) {
      throw new FetchNetworkError(
        "",
        `Failed to launch Playwright browser: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err instanceof Error ? err : undefined },
      );
    }
  }

  // ==========================================================================
  // Private: Error Classification
  // ==========================================================================

  private classifyNavigationError(err: unknown, url: string, timeoutMs: number): FetchError {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("Timeout") || message.includes("timeout")) {
      return new FetchTimeoutError(url, timeoutMs, {
        cause: err instanceof Error ? err : undefined,
      });
    }

    return new FetchNetworkError(url, message, {
      cause: err instanceof Error ? err : undefined,
    });
  }
}

// Importiere den Typ nochmals explizit fuer die Rueckgabe der Fehlerklassifizierung
import type { FetchError } from "./errors.js";

// ============================================================================
// Cookie-Banner Dismissal (portiert von capture-fixtures.ts)
// ============================================================================

/**
 * Versucht Cookie-/Consent-Banner automatisch zu schliessen.
 * Probiert gaengige Selector-Patterns und Button-Texte.
 * Gibt true zurueck wenn ein Banner gefunden und geklickt wurde.
 */
async function dismissCookieBanner(page: PlaywrightPage): Promise<boolean> {
  // Zuerst schnelle Selector-Suche
  for (const selector of COOKIE_ACCEPT_SELECTORS) {
    try {
      const btn = await page.$(selector);
      if (btn && (await btn.isVisible())) {
        await btn.click();
        await page.waitForTimeout(500);
        return true;
      }
    } catch {
      // Selector nicht gefunden — weiter
    }
  }

  // Fallback: Button mit Accept-Text suchen (mehrsprachig)
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

// ============================================================================
// Bot-Protection Detection (portiert von capture-fixtures.ts)
// ============================================================================

/**
 * Erkennt gaengige Bot-Protection Mechanismen auf der Seite.
 * Gibt den Typ zurueck oder null wenn keine erkannt wurde.
 */
async function detectBotProtection(page: PlaywrightPage): Promise<string | null> {
  const title = await page.title();
  const bodyText: string = await page.evaluate(
    () => document.body?.innerText?.slice(0, 2000) ?? "",
  );

  for (const check of BOT_PROTECTION_CHECKS) {
    // Title-Pattern Check
    for (const pattern of check.titlePatterns) {
      if (pattern.test(title) || pattern.test(bodyText)) {
        return check.type;
      }
    }

    // Selector Check
    for (const selector of check.selectors) {
      const element = await page.$(selector);
      if (element) return check.type;
    }
  }

  // Heuristik: Sehr wenig Content = vermutlich geblockt
  const contentLength: number = await page.evaluate(
    () => document.body?.innerHTML?.length ?? 0,
  );
  if (contentLength < 500) {
    return "empty-response";
  }

  return null;
}

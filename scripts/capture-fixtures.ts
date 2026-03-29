/**
 * Fixture Capture Pipeline
 *
 * Besucht eine Liste von URLs mit Playwright, speichert HTML-Content als
 * Fixture-Dateien und erstellt Screenshots fuer manuelle GT-Annotation.
 *
 * Usage:
 *   npx tsx scripts/capture-fixtures.ts                    # Alle URLs aus DEFAULT_URLS
 *   npx tsx scripts/capture-fixtures.ts --urls urls.txt    # URLs aus Datei (eine pro Zeile)
 *   npx tsx scripts/capture-fixtures.ts --url https://example.com
 *   npx tsx scripts/capture-fixtures.ts --batch-size 3     # 3 gleichzeitig (default: 5)
 *   npx tsx scripts/capture-fixtures.ts --dry-run          # Nur pruefen, nicht speichern
 *
 * Output:
 *   tests/real-world/fixtures/{slug}.html      — Vollstaendiger HTML-Content
 *   tests/real-world/screenshots/{slug}.png    — Screenshot fuer GT-Annotation
 *   scripts/capture-report.json                — Capture-Report mit Status pro URL
 */

import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// Configuration
// ============================================================================

const FIXTURES_DIR = join(import.meta.dirname!, "..", "tests", "real-world", "fixtures");
const SCREENSHOTS_DIR = join(import.meta.dirname!, "..", "tests", "real-world", "screenshots");
const GT_DIR = join(import.meta.dirname!, "..", "tests", "real-world", "ground-truth");
const REPORT_PATH = join(import.meta.dirname!, "capture-report.json");

const DEFAULT_BATCH_SIZE = 5;
const PAGE_TIMEOUT_MS = 30_000;
const NETWORK_IDLE_TIMEOUT_MS = 15_000;
const COOKIE_DISMISS_TIMEOUT_MS = 3_000;

// Viewport fuer konsistente Captures
const VIEWPORT = { width: 1920, height: 1080 };

// User-Agent — realistisch, nicht headless-detectable
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ============================================================================
// Types
// ============================================================================

interface CaptureResult {
  url: string;
  slug: string;
  status: "success" | "bot-protected" | "timeout" | "error";
  htmlBytes: number;
  screenshotPath: string | null;
  fixturePath: string | null;
  botProtectionType: string | null;
  cookieBannerDismissed: boolean;
  pageTitle: string;
  finalUrl: string;
  durationMs: number;
  error: string | null;
}

interface CaptureReport {
  capturedAt: string;
  totalUrls: number;
  successful: number;
  botProtected: number;
  failed: number;
  results: CaptureResult[];
}

// ============================================================================
// URL-zu-Slug Konvertierung
// ============================================================================

/**
 * Wandelt eine URL in einen Fixture-Slug um.
 * Konsistent mit benchmark-runner.ts urlToSlug, aber mit expliziter
 * Pfad-Komponente fuer Sub-Seiten (z.B. github-login statt github).
 */
function urlToSlug(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    // Domain-TLD durch Bindestrich ersetzen
    .replace(/\.[a-z]{2,4}\//g, "-")
    .replace(/\.[a-z]{2,4}$/, "")
    // Sonderzeichen zu Bindestrichen
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

// ============================================================================
// Bot-Protection Detection
// ============================================================================

/**
 * Erkennt gaengige Bot-Protection Mechanismen auf der Seite.
 * Gibt den Typ zurueck oder null wenn keine erkannt wurde.
 */
async function detectBotProtection(page: Page): Promise<string | null> {
  const checks = [
    // Cloudflare Challenge
    {
      type: "cloudflare",
      selectors: ["#challenge-running", "#cf-challenge-running", ".cf-browser-verification"],
      titlePatterns: [/just a moment/i, /attention required/i, /cloudflare/i],
    },
    // DataDome
    {
      type: "datadome",
      selectors: ["iframe[src*='datadome']", "#datadome-captcha"],
      titlePatterns: [/datadome/i],
    },
    // reCAPTCHA / hCaptcha
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
    // PerimeterX / HUMAN Security
    {
      type: "perimeterx",
      selectors: ["#px-captcha", "#px-block"],
      titlePatterns: [/access denied/i, /please verify/i],
    },
    // Generic Bot Blocks
    {
      type: "generic-block",
      selectors: [],
      titlePatterns: [/blocked/i, /access denied/i, /bot detected/i, /unusual traffic/i],
    },
  ];

  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) ?? "");

  for (const check of checks) {
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
  const contentLength = await page.evaluate(() => document.body?.innerHTML?.length ?? 0);
  if (contentLength < 500) {
    return "empty-response";
  }

  return null;
}

// ============================================================================
// Cookie-Banner Dismissal
// ============================================================================

/**
 * Versucht Cookie-/Consent-Banner automatisch zu schliessen.
 * Probiert gaengige Selector-Patterns und Button-Texte.
 * Gibt true zurueck wenn ein Banner gefunden und geklickt wurde.
 */
async function dismissCookieBanner(page: Page): Promise<boolean> {
  // Gaengige "Accept All" Button-Selektoren (sprachuebergreifend)
  const acceptSelectors = [
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
  ];

  // Zuerst schnelle Selector-Suche
  for (const selector of acceptSelectors) {
    try {
      const btn = await page.$(selector);
      if (btn && (await btn.isVisible())) {
        await btn.click();
        // Kurz warten damit das Banner verschwindet
        await page.waitForTimeout(500);
        return true;
      }
    } catch {
      // Selector nicht gefunden, weiter
    }
  }

  // Fallback: Button mit Accept-Text suchen (mehrsprachig)
  const acceptPatterns = [
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
  ];

  try {
    const buttons = await page.$$("button, a[role='button'], [role='button']");
    for (const btn of buttons) {
      const text = (await btn.textContent())?.trim() ?? "";
      for (const pattern of acceptPatterns) {
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
// Single-Page Capture
// ============================================================================

async function captureSinglePage(
  context: BrowserContext,
  url: string,
): Promise<CaptureResult> {
  const slug = urlToSlug(url);
  const startTime = Date.now();
  const result: CaptureResult = {
    url,
    slug,
    status: "error",
    htmlBytes: 0,
    screenshotPath: null,
    fixturePath: null,
    botProtectionType: null,
    cookieBannerDismissed: false,
    pageTitle: "",
    finalUrl: "",
    durationMs: 0,
    error: null,
  };

  let page: Page | null = null;

  try {
    page = await context.newPage();

    // Navigation
    console.log(`  [NAVIGATE] ${url}`);
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });

    // NetworkIdle abwarten (mit Timeout-Toleranz)
    await page.waitForLoadState("networkidle", {
      timeout: NETWORK_IDLE_TIMEOUT_MS,
    }).catch(() => {
      console.log(`    (networkidle timeout — continuing)`);
    });

    result.pageTitle = await page.title();
    result.finalUrl = page.url();

    // Bot-Protection Check
    const botType = await detectBotProtection(page);
    if (botType) {
      console.log(`  [BOT-PROTECTED] ${slug} — ${botType}`);
      result.status = "bot-protected";
      result.botProtectionType = botType;
      result.durationMs = Date.now() - startTime;

      // Trotzdem Screenshot machen (fuer Debugging)
      const screenshotPath = join(SCREENSHOTS_DIR, `${slug}_blocked.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      result.screenshotPath = screenshotPath;

      return result;
    }

    // Cookie-Banner wegklicken
    console.log(`  [COOKIES] Checking for cookie banner ...`);
    // Kurz warten — viele Banner laden mit Delay
    await page.waitForTimeout(COOKIE_DISMISS_TIMEOUT_MS);
    result.cookieBannerDismissed = await dismissCookieBanner(page);
    if (result.cookieBannerDismissed) {
      console.log(`    Cookie banner dismissed`);
      // Nach Dismiss nochmal kurz warten
      await page.waitForTimeout(1000);
    }

    // HTML-Content extrahieren
    const htmlContent = await page.content();
    result.htmlBytes = htmlContent.length;

    // Screenshot (Full-Page = false, nur Viewport — konsistent mit Benchmark)
    const screenshotPath = join(SCREENSHOTS_DIR, `${slug}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    result.screenshotPath = screenshotPath;

    // HTML-Fixture speichern
    const fixturePath = join(FIXTURES_DIR, `${slug}.html`);
    writeFileSync(fixturePath, htmlContent, "utf-8");
    result.fixturePath = fixturePath;

    console.log(
      `  [OK] ${slug} — ${(htmlContent.length / 1024).toFixed(0)} KB, ` +
      `title="${result.pageTitle.slice(0, 50)}"`,
    );

    result.status = "success";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes("Timeout") || msg.includes("timeout")) {
      result.status = "timeout";
      console.log(`  [TIMEOUT] ${slug} — ${msg}`);
    } else {
      result.status = "error";
      console.log(`  [ERROR] ${slug} — ${msg}`);
    }

    result.error = msg;
  } finally {
    if (page) await page.close().catch(() => {});
    result.durationMs = Date.now() - startTime;
  }

  return result;
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Verarbeitet URLs in Batches um Ressourcen zu schonen
 * und Rate-Limiting zu vermeiden.
 */
async function processBatches(
  urls: string[],
  batchSize: number,
  dryRun: boolean,
): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];
  const totalBatches = Math.ceil(urls.length / batchSize);

  console.log(`\n=== Capture Pipeline ===`);
  console.log(`URLs: ${urls.length}, Batch-Size: ${batchSize}, Batches: ${totalBatches}`);
  console.log(`Dry-Run: ${dryRun}\n`);

  if (dryRun) {
    console.log("DRY-RUN — Slugs die generiert werden:");
    for (const url of urls) {
      const slug = urlToSlug(url);
      const fixtureExists = existsSync(join(FIXTURES_DIR, `${slug}.html`));
      const gtExists = existsSync(join(GT_DIR, `${slug}.json`));
      console.log(
        `  ${slug}` +
        `${fixtureExists ? " [FIXTURE EXISTS]" : ""}` +
        `${gtExists ? " [GT EXISTS]" : ""}`,
      );
    }
    return [];
  }

  // Verzeichnisse anlegen
  for (const dir of [FIXTURES_DIR, SCREENSHOTS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  try {
    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchStart = batchIdx * batchSize;
      const batchUrls = urls.slice(batchStart, batchStart + batchSize);
      console.log(
        `\n--- Batch ${batchIdx + 1}/${totalBatches} (${batchUrls.length} URLs) ---`,
      );

      // Jede URL in diesem Batch sequentiell abarbeiten —
      // Paralleles Laden ist bei Bot-Protection kontraproduktiv.
      // Ein neuer Context pro URL isoliert Cookies/State.
      for (const url of batchUrls) {
        const context = await browser.newContext({
          viewport: VIEWPORT,
          userAgent: USER_AGENT,
          locale: "de-DE",
          timezoneId: "Europe/Berlin",
          // Permissions fuer realistische Emulation
          permissions: [],
          // Kein Service Worker Caching
          serviceWorkers: "block",
        });

        const captureResult = await captureSinglePage(context, url);
        results.push(captureResult);

        await context.close();
      }

      // Pause zwischen Batches um nicht als Bot erkannt zu werden
      if (batchIdx < totalBatches - 1) {
        const pauseMs = 2000 + Math.random() * 3000;
        console.log(`  (Pause: ${(pauseMs / 1000).toFixed(1)}s)`);
        await new Promise((resolve) => setTimeout(resolve, pauseMs));
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(): { urls: string[]; batchSize: number; dryRun: boolean } {
  const args = process.argv.slice(2);
  let batchSize = DEFAULT_BATCH_SIZE;
  let dryRun = false;
  const urls: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === "--batch-size" && args[i + 1]) {
      batchSize = parseInt(args[i + 1]!, 10);
      if (Number.isNaN(batchSize) || batchSize < 1) {
        console.error("Invalid batch size. Must be >= 1.");
        process.exit(1);
      }
      i++; // Skip value
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--url" && args[i + 1]) {
      urls.push(args[i + 1]!);
      i++;
    } else if (arg === "--urls" && args[i + 1]) {
      // URLs aus Datei laden
      const filePath = args[i + 1]!;
      if (!existsSync(filePath)) {
        console.error(`URL file not found: ${filePath}`);
        process.exit(1);
      }
      const fileContent = readFileSync(filePath, "utf-8");
      const fileUrls = fileContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));
      urls.push(...fileUrls);
      i++;
    } else if (arg.startsWith("http")) {
      // Bare URL ohne --url Flag
      urls.push(arg);
    }
  }

  // Fallback auf Default-URLs wenn keine angegeben
  if (urls.length === 0) {
    urls.push(...DEFAULT_CAPTURE_URLS);
  }

  return { urls, batchSize, dryRun };
}

// ============================================================================
// Default URL-Liste
// ============================================================================

/**
 * 30 Neue Target-URLs fuer die Fixture-Erweiterung.
 *
 * Kriterien fuer die Auswahl:
 * - Abdeckung verschiedener Endpoint-Typen (auth, search, checkout, forms, navigation)
 * - Mix aus Schwierigkeitsgraden (easy/medium/hard/extreme)
 * - Keine Duplikate mit bestehenden 20 Fixtures
 * - Internationale Seiten (DE, EN, FR)
 * - Mix aus SPA (React/Vue/Angular) und SSR/MPA
 * - Verschiedene Branchen (E-Commerce, SaaS, Social, Government, Media)
 */
const DEFAULT_CAPTURE_URLS: string[] = [
  // --- Easy (5) — Saubere HTML-Struktur, wenig JS ---
  "https://www.reddit.com/login",                  // Auth, Social
  "https://www.npmjs.com",                          // Search, Developer Tools
  "https://www.craigslist.org",                     // Navigation, Classifieds
  "https://news.ycombinator.com/login",             // Auth (Minimal HTML)
  "https://httpbin.org/forms/post",                 // Form (Reference Test)

  // --- Medium (10) — Moderate Komplexitaet ---
  "https://www.imdb.com",                           // Search, Content, Navigation
  "https://www.twitch.tv",                          // Navigation, Auth, Media
  "https://www.indeed.com",                         // Search, Form (Job Search)
  "https://www.bbc.com",                            // Navigation, Content, Media
  "https://www.spotify.com/login",                  // Auth, SaaS
  "https://www.dropbox.com/login",                  // Auth, SaaS
  "https://www.medium.com",                         // Content, Auth, Navigation
  "https://www.producthunt.com",                    // Navigation, Auth, Social
  "https://www.figma.com/login",                    // Auth, SaaS
  "https://www.canva.com",                          // Auth, Search, SaaS

  // --- Hard (10) — Schwere SPAs, viel JS, Cookie-Banner ---
  "https://www.otto.de",                            // E-Commerce DE, Cookie-Banner
  "https://www.mediamarkt.de",                      // E-Commerce DE, Heavy JS
  "https://www.ikea.com/de/de/",                    // E-Commerce International
  "https://www.saturn.de",                          // E-Commerce DE
  "https://www.lidl.de",                            // E-Commerce/Grocery DE
  "https://www.netflix.com",                        // Auth, Media, SPA
  "https://www.disney.com",                         // Media, Navigation, SPA
  "https://www.spiegel.de",                         // News, Paywall, Cookie-Banner
  "https://www.faz.net",                            // News, Paywall, Cookie-Banner
  "https://www.check24.de",                         // Comparison, Complex Forms

  // --- Extreme (5) — Shadow DOM, Multi-Step, Heavy SPA ---
  "https://www.salesforce.com/form/signup/freetrial-sales/",  // Multi-Step Form
  "https://web.dev",                                // PWA, Web Components
  "https://material.angular.io/components/input/overview",    // Angular Material, Shadow DOM
  "https://mui.com/material-ui/react-text-field/",  // MUI, React SPA
  "https://docs.github.com",                        // Static Site, Navigation Heavy
];

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const { urls, batchSize, dryRun } = parseArgs();

  // Duplikate mit bestehenden Fixtures pruefen
  const existingFixtures = new Set<string>();
  if (existsSync(FIXTURES_DIR)) {
    for (const url of urls) {
      const slug = urlToSlug(url);
      if (existsSync(join(FIXTURES_DIR, `${slug}.html`))) {
        existingFixtures.add(slug);
      }
    }
  }

  if (existingFixtures.size > 0) {
    console.log(`\n[INFO] ${existingFixtures.size} URLs haben bereits Fixtures:`);
    for (const slug of existingFixtures) {
      console.log(`  - ${slug}`);
    }
    console.log("  Diese werden ueberschrieben.\n");
  }

  const results = await processBatches(urls, batchSize, dryRun);

  if (dryRun) {
    console.log("\nDry-run complete. No files written.");
    return;
  }

  // Report generieren
  const report: CaptureReport = {
    capturedAt: new Date().toISOString(),
    totalUrls: urls.length,
    successful: results.filter((r) => r.status === "success").length,
    botProtected: results.filter((r) => r.status === "bot-protected").length,
    failed: results.filter((r) => r.status === "error" || r.status === "timeout").length,
    results,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  // Summary
  console.log(`\n=== Capture Summary ===`);
  console.log(`Total:         ${report.totalUrls}`);
  console.log(`Successful:    ${report.successful}`);
  console.log(`Bot-Protected: ${report.botProtected}`);
  console.log(`Failed:        ${report.failed}`);
  console.log(`Report:        ${REPORT_PATH}\n`);

  // Bot-Protected als _bot-protected GT-Kandidaten markieren
  const botProtected = results.filter((r) => r.status === "bot-protected");
  if (botProtected.length > 0) {
    console.log("Bot-Protected Sites (sollten in _bot-protected/ landen):");
    for (const bp of botProtected) {
      console.log(`  ${bp.slug} — ${bp.botProtectionType} (${bp.url})`);
    }
  }

  // Erfolgreich gecapturte Sites ohne GT-Datei
  const needsGT = results.filter(
    (r) => r.status === "success" && !existsSync(join(GT_DIR, `${r.slug}.json`)),
  );
  if (needsGT.length > 0) {
    console.log(`\n${needsGT.length} Sites brauchen Ground-Truth-Dateien:`);
    console.log(
      "  Ausfuehren: npx tsx scripts/generate-gt-skeletons.ts",
    );
    for (const site of needsGT) {
      console.log(`  - ${site.slug}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

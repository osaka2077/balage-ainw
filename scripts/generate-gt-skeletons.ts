/**
 * Ground-Truth Skeleton Generator
 *
 * Analysiert gecapturte HTML-Fixtures und erstellt GT-Skeleton-Dateien
 * mit automatisch vorgeschlagenen Endpoint-Kandidaten.
 *
 * Nutzt Playwright's Locator-API fuer DOM-Analyse (keine page.evaluate
 * mit Functions, da tsx/esbuild __name-Injection Probleme verursacht).
 *
 * WICHTIG: Die generierten Skeletons sind VORSCHLAEGE und muessen
 * manuell reviewt und korrigiert werden. Nicht blind uebernehmen!
 *
 * Usage:
 *   npx tsx scripts/generate-gt-skeletons.ts                 # Alle Fixtures ohne GT
 *   npx tsx scripts/generate-gt-skeletons.ts --slug otto-de  # Nur eine Fixture
 *   npx tsx scripts/generate-gt-skeletons.ts --force         # Bestehende GT ueberschreiben
 *   npx tsx scripts/generate-gt-skeletons.ts --dry-run       # Nur anzeigen, nicht schreiben
 *
 * Output:
 *   tests/real-world/ground-truth/{slug}.json — GT-Skeleton mit REVIEW-Markierungen
 */

import { chromium } from "playwright";
import type { Page, ElementHandle } from "playwright";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// Configuration
// ============================================================================

const FIXTURES_DIR = join(import.meta.dirname!, "..", "tests", "real-world", "fixtures");
const GT_DIR = join(import.meta.dirname!, "..", "tests", "real-world", "ground-truth");
const CAPTURE_REPORT_PATH = join(import.meta.dirname!, "capture-report.json");

// ============================================================================
// Types (konsistent mit benchmark-runner.ts GroundTruthEndpoint)
// ============================================================================

interface GTEndpoint {
  type: string;
  label: string;
  description: string;
  selector_hint: string;
  affordances: string[];
  risk_class: string;
  fields: string[];
  phase: number;
  _auto_suggested?: boolean;
  _suggestion_confidence?: number;
}

interface GTSkeleton {
  url: string;
  captured_at: string;
  difficulty: "easy" | "medium" | "hard" | "extreme";
  notes: string;
  _review_status: "NEEDS_REVIEW";
  _auto_generated: true;
  _review_instructions: string;
  endpoints: GTEndpoint[];
  expected_metrics: {
    total_endpoints: number;
    phase1_endpoints: number;
    min_precision_target: number;
    min_recall_target: number;
  };
}

interface DOMStats {
  totalElements: number;
  scripts: number;
  iframes: number;
  shadowHosts: number;
  htmlLength: number;
  title: string;
}

// ============================================================================
// Selector Builder (Node.js-seitig, aus ElementHandle)
// ============================================================================

async function buildSelectorFromHandle(el: ElementHandle): Promise<string> {
  const id = await el.getAttribute("id");
  if (id) return `#${id}`;

  const testId = await el.getAttribute("data-testid");
  if (testId) return `[data-testid="${testId}"]`;

  const ariaLabel = await el.getAttribute("aria-label");
  if (ariaLabel && ariaLabel.length < 60) return `[aria-label="${ariaLabel}"]`;

  const tag = await el.evaluate((e) => e.tagName.toLowerCase());
  const href = await el.getAttribute("href");
  if (href && tag === "a") {
    const hrefPart = href.replace(/^https?:\/\/[^/]+/, "").split("?")[0] ?? href;
    if (hrefPart.length > 1 && hrefPart.length < 60) {
      return `a[href*="${hrefPart}"]`;
    }
  }

  const className = await el.evaluate((e) => {
    const cls = Array.from(e.classList).filter((c) => c.length > 2);
    return cls[0] ?? "";
  });
  if (className) return `${tag}.${className}`;

  return tag;
}

// ============================================================================
// Individual Detectors (verwenden Playwright Locator API)
// ============================================================================

async function detectAuth(page: Page): Promise<GTEndpoint[]> {
  const endpoints: GTEndpoint[] = [];

  // Password-Felder → Login-Form
  const pwInputs = await page.$$('input[type="password"]');
  if (pwInputs.length > 0) {
    const form = await pwInputs[0]!.evaluateHandle((el) => el.closest("form"));
    let formSelector = "form";
    let fields: string[] = [];

    if (form) {
      const formEl = form.asElement();
      if (formEl) {
        formSelector = await formEl.evaluate((f) => {
          if (f.id) return `form#${f.id}`;
          const action = f.getAttribute("action");
          if (action) return `form[action='${action}']`;
          return "form";
        });
        fields = await formEl.evaluate((f) => {
          const inputs = f.querySelectorAll(
            'input:not([type="hidden"]):not([type="submit"]), textarea, select',
          );
          return Array.from(inputs).map(
            (i) => i.getAttribute("name") ?? i.id ?? i.getAttribute("type") ?? "unknown",
          ).filter(Boolean);
        });
      }
    }

    endpoints.push({
      type: "auth",
      label: "Login Form",
      description: "Username/email + password login form",
      selector_hint: formSelector,
      affordances: ["fill", "submit"],
      risk_class: "high",
      fields,
      phase: 1,
      _auto_suggested: true,
      _suggestion_confidence: 0.9,
    });
  }

  // OAuth/SSO
  const oauthEls = await page.$$(
    'a[href*="oauth"], a[href*="sso"], button[data-provider], ' +
    'a[href*="accounts.google"], a[href*="facebook.com/login"]',
  );
  if (oauthEls.length > 0) {
    const sel = await buildSelectorFromHandle(oauthEls[0]!);
    endpoints.push({
      type: "auth",
      label: "Social/SSO Login",
      description: `${oauthEls.length} OAuth/SSO provider buttons`,
      selector_hint: sel,
      affordances: ["click"],
      risk_class: "high",
      fields: [],
      phase: 2,
      _auto_suggested: true,
      _suggestion_confidence: 0.7,
    });
  }

  // Signup-Links
  const signupLinks = await page.$$(
    'a[href*="signup"], a[href*="register"], a[href*="registration"], a[href*="join"]',
  );
  if (signupLinks.length > 0) {
    const sel = await buildSelectorFromHandle(signupLinks[0]!);
    endpoints.push({
      type: "auth",
      label: "Create Account",
      description: "Link to registration page",
      selector_hint: sel,
      affordances: ["click"],
      risk_class: "low",
      fields: [],
      phase: 2,
      _auto_suggested: true,
      _suggestion_confidence: 0.8,
    });
  }

  return endpoints;
}

async function detectSearch(page: Page): Promise<GTEndpoint[]> {
  const searchInputs = await page.$$([
    'input[type="search"]',
    'input[name*="search"]', 'input[name*="query"]', 'input[name="q"]',
    'input[id*="search"]', 'input[id*="query"]',
    '[role="search"] input',
  ].join(", "));

  if (searchInputs.length === 0) return [];

  const input = searchInputs[0]!;
  const inputSel = await buildSelectorFromHandle(input);

  // Formular suchen
  const hasCategory = await input.evaluate((el) => {
    const form = el.closest("form") ?? el.closest('[role="search"]');
    return !!form?.querySelector("select");
  });

  const fields = ["search_query"];
  const affordances = ["fill", "submit"];
  if (hasCategory) {
    fields.push("search_category");
    affordances.push("select");
  }

  return [{
    type: "search",
    label: "Search Bar",
    description: "Search input" + (hasCategory ? " with category filter" : ""),
    selector_hint: inputSel,
    affordances,
    risk_class: "low",
    fields,
    phase: 1,
    _auto_suggested: true,
    _suggestion_confidence: 0.9,
  }];
}

async function detectCheckout(page: Page): Promise<GTEndpoint[]> {
  const cartLinks = await page.$$(
    'a[href*="cart"], a[href*="basket"], a[href*="warenkorb"], ' +
    'a[href*="checkout"], [data-testid*="cart"], ' +
    '[aria-label*="cart" i], [aria-label*="warenkorb" i]',
  );

  if (cartLinks.length === 0) return [];

  const sel = await buildSelectorFromHandle(cartLinks[0]!);
  return [{
    type: "checkout",
    label: "Shopping Cart",
    description: "Cart icon/link to basket or checkout",
    selector_hint: sel,
    affordances: ["click"],
    risk_class: "high",
    fields: [],
    phase: 1,
    _auto_suggested: true,
    _suggestion_confidence: 0.85,
  }];
}

async function detectConsent(page: Page): Promise<GTEndpoint[]> {
  const selectors = [
    "#gdpr-banner", "#cookie-banner", "#consent-banner",
    "#onetrust-banner-sdk", "#CybotCookiebotDialog",
    '[class*="cookie-consent"]', '[class*="cookie-banner"]',
    '[class*="consent-banner"]',
  ];

  for (const sel of selectors) {
    const banner = await page.$(sel);
    if (!banner) continue;

    const acceptBtn = await banner.$(
      'button[id*="accept"], button[data-action="accept"], button:first-of-type',
    );
    const btnSel = acceptBtn
      ? await buildSelectorFromHandle(acceptBtn)
      : `${sel} button`;

    return [{
      type: "consent",
      label: "Cookie Consent Banner",
      description: "GDPR cookie/consent banner with Accept/Reject",
      selector_hint: btnSel,
      affordances: ["click"],
      risk_class: "low",
      fields: [],
      phase: 2,
      _auto_suggested: true,
      _suggestion_confidence: 0.85,
    }];
  }

  return [];
}

async function detectNavigation(page: Page): Promise<GTEndpoint[]> {
  const endpoints: GTEndpoint[] = [];

  // Haupt-Navigation
  const navElements = await page.$$('nav, [role="navigation"]');
  for (const nav of navElements) {
    const linkCount = await nav.evaluate((el) => el.querySelectorAll("a").length);
    if (linkCount < 3) continue;

    const linkTexts = await nav.evaluate((el) => {
      return Array.from(el.querySelectorAll("a"))
        .map((a) => a.textContent?.trim())
        .filter((t): t is string => !!t && t.length > 0 && t.length < 40)
        .slice(0, 8);
    });

    const navSel = await buildSelectorFromHandle(nav);
    endpoints.push({
      type: "navigation",
      label: "Main Navigation",
      description: `Primary nav (${linkCount} links): ${linkTexts.join(", ")}`,
      selector_hint: navSel + " a",
      affordances: ["click"],
      risk_class: "low",
      fields: [],
      phase: 2,
      _auto_suggested: true,
      _suggestion_confidence: 0.75,
    });
    break; // Nur die erste signifikante Navigation
  }

  // Footer-Navigation
  const footer = await page.$('footer, [role="contentinfo"]');
  if (footer) {
    const footerLinks = await footer.evaluate(
      (el) => el.querySelectorAll("a").length,
    );
    if (footerLinks >= 3) {
      endpoints.push({
        type: "navigation",
        label: "Footer Navigation",
        description: `Footer with ${footerLinks} links`,
        selector_hint: "footer a",
        affordances: ["click"],
        risk_class: "low",
        fields: [],
        phase: 2,
        _auto_suggested: true,
        _suggestion_confidence: 0.6,
      });
    }
  }

  return endpoints;
}

async function detectForms(
  page: Page,
  knownSelectors: Set<string>,
): Promise<GTEndpoint[]> {
  const endpoints: GTEndpoint[] = [];

  const formCount = await page.evaluate(() => document.querySelectorAll("form").length);

  for (let i = 0; i < formCount; i++) {
    const formData = await page.evaluate((idx) => {
      const form = document.querySelectorAll("form")[idx];
      if (!form) return null;

      let selector = "form";
      if (form.id) selector = `form#${form.id}`;
      else {
        const action = form.getAttribute("action");
        if (action) selector = `form[action='${action}']`;
      }

      const visibleInputs = form.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]), textarea, select',
      );
      if (visibleInputs.length === 0) return null;

      const html = form.outerHTML.toLowerCase();
      const fields = Array.from(visibleInputs)
        .map((input) =>
          input.getAttribute("name") ?? input.id ??
          input.getAttribute("placeholder") ?? input.getAttribute("type") ?? "unknown",
        )
        .filter(Boolean);

      let label = `Form (${visibleInputs.length} fields)`;
      let description = `Form with ${visibleInputs.length} visible fields`;

      if (/newsletter|subscribe|mail.*list/i.test(html)) {
        label = "Newsletter Signup";
        description = "Email subscription form";
      } else if (/contact|kontakt|message/i.test(html)) {
        label = "Contact Form";
        description = "Contact/message form";
      } else if (/comment|kommentar|reply/i.test(html)) {
        label = "Comment Form";
        description = "Comment/reply form";
      }

      return { selector, label, description, fields, inputCount: visibleInputs.length };
    }, i);

    if (!formData) continue;
    if (knownSelectors.has(formData.selector)) continue;

    endpoints.push({
      type: "form",
      label: formData.label,
      description: formData.description,
      selector_hint: formData.selector,
      affordances: ["fill", "submit"],
      risk_class: "low",
      fields: formData.fields,
      phase: 2,
      _auto_suggested: true,
      _suggestion_confidence: 0.5,
    });
  }

  return endpoints;
}

async function detectSupport(page: Page): Promise<GTEndpoint[]> {
  const supportLinks = await page.$$(
    'a[href*="help"], a[href*="support"], a[href*="faq"], ' +
    'a[href*="hilfe"], a[href*="kontakt"]',
  );

  if (supportLinks.length === 0) return [];

  return [{
    type: "support",
    label: "Help & Support",
    description: `Help/support section (${supportLinks.length} links)`,
    selector_hint: 'a[href*="help"], a[href*="faq"]',
    affordances: ["click"],
    risk_class: "low",
    fields: [],
    phase: 2,
    _auto_suggested: true,
    _suggestion_confidence: 0.6,
  }];
}

// ============================================================================
// DOM Stats (einzelner evaluate-Aufruf ohne Funktionen)
// ============================================================================

async function collectStats(page: Page): Promise<DOMStats> {
  return page.evaluate(() => ({
    totalElements: document.querySelectorAll("*").length,
    scripts: document.querySelectorAll("script").length,
    iframes: document.querySelectorAll("iframe").length,
    shadowHosts: document.querySelectorAll("[shadowroot], template[shadowrootmode]").length,
    htmlLength: document.documentElement.outerHTML.length,
    title: document.title ?? "",
  }));
}

// ============================================================================
// Full DOM Analysis
// ============================================================================

async function analyzeDOM(page: Page): Promise<{
  endpoints: GTEndpoint[];
  stats: DOMStats;
}> {
  const stats = await collectStats(page);

  // Detektoren einzeln ausfuehren
  const authEps = await detectAuth(page);
  const searchEps = await detectSearch(page);
  const checkoutEps = await detectCheckout(page);
  const consentEps = await detectConsent(page);
  const navigationEps = await detectNavigation(page);
  const supportEps = await detectSupport(page);

  // Bekannte Selektoren sammeln (um Doppel-Erkennung bei Forms zu vermeiden)
  const knownSelectors = new Set(
    [...authEps, ...searchEps, ...checkoutEps].map(
      (e) => e.selector_hint.split(",")[0]?.trim() ?? "",
    ),
  );
  const formEps = await detectForms(page, knownSelectors);

  const endpoints = [
    ...authEps,
    ...searchEps,
    ...checkoutEps,
    ...consentEps,
    ...navigationEps,
    ...formEps,
    ...supportEps,
  ];

  return { endpoints, stats };
}

// ============================================================================
// Difficulty Estimation
// ============================================================================

function estimateDifficulty(stats: DOMStats): "easy" | "medium" | "hard" | "extreme" {
  if (stats.shadowHosts > 0) return "extreme";
  if (stats.htmlLength < 50_000 && stats.totalElements < 200) return "easy";
  if (stats.scripts > 20 || stats.iframes > 3) return "hard";
  if (stats.totalElements > 1000 || stats.htmlLength > 200_000) return "hard";
  if (stats.totalElements > 400 || stats.htmlLength > 100_000) return "medium";
  return "easy";
}

// ============================================================================
// Skeleton Assembly
// ============================================================================

function buildSkeleton(
  slug: string,
  url: string,
  endpoints: GTEndpoint[],
  stats: DOMStats,
  difficulty: "easy" | "medium" | "hard" | "extreme",
): GTSkeleton {
  const phase1Count = endpoints.filter((e) => e.phase === 1).length;

  const precisionTargets: Record<string, number> = {
    easy: 0.80, medium: 0.70, hard: 0.60, extreme: 0.50,
  };
  const recallTargets: Record<string, number> = {
    easy: 0.80, medium: 0.65, hard: 0.55, extreme: 0.45,
  };

  return {
    url,
    captured_at: new Date().toISOString().slice(0, 10),
    difficulty,
    notes:
      `[AUTO-GENERATED] ${stats.title || slug} — ` +
      `${endpoints.length} endpoints auto-detected. ` +
      `HTML: ${(stats.htmlLength / 1024).toFixed(0)} KB, ` +
      `${stats.totalElements} elements. NEEDS MANUAL REVIEW.`,
    _review_status: "NEEDS_REVIEW",
    _auto_generated: true,
    _review_instructions: [
      "1. Pruefe jeden Endpoint: Ist er REAL im HTML vorhanden?",
      "2. Korrigiere selector_hint — muss im gecapturten HTML funktionieren",
      "3. Pruefe labels — muessen zum tatsaechlichen UI-Text passen",
      "4. Pruefe type — auth/search/checkout/navigation/form/consent/support/content",
      "5. Setze phase korrekt: 1 = primaere Interaktion, 2 = sekundaer",
      "6. Passe difficulty an basierend auf tatsaechlicher DOM-Komplexitaet",
      "7. Passe expected_metrics an (realistisch fuer die Site)",
      "8. Entferne _review_status, _auto_generated, _review_instructions",
      "9. Entferne _auto_suggested, _suggestion_confidence von jedem Endpoint",
      "10. Schreibe eine hilfreiche notes-Beschreibung",
    ].join("\n"),
    endpoints,
    expected_metrics: {
      total_endpoints: endpoints.length,
      phase1_endpoints: phase1Count,
      min_precision_target: precisionTargets[difficulty] ?? 0.60,
      min_recall_target: recallTargets[difficulty] ?? 0.55,
    },
  };
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): { slugs: string[]; force: boolean; dryRun: boolean } {
  const args = process.argv.slice(2);
  let force = false;
  let dryRun = false;
  const slugs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--force") force = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--slug" && args[i + 1]) {
      slugs.push(args[i + 1]!);
      i++;
    }
  }

  return { slugs, force, dryRun };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const { slugs: requestedSlugs, force, dryRun } = parseArgs();

  console.log("=== Ground-Truth Skeleton Generator ===\n");

  if (!existsSync(FIXTURES_DIR)) {
    console.error(`Fixtures directory not found: ${FIXTURES_DIR}`);
    console.error("Run capture-fixtures.ts first.");
    process.exit(1);
  }

  const fixtureFiles = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".html"))
    .map((f) => f.replace(".html", ""));

  // Filter
  let targetSlugs: string[];
  if (requestedSlugs.length > 0) {
    targetSlugs = requestedSlugs.filter((s) => {
      if (!fixtureFiles.includes(s)) {
        console.warn(`[WARN] Fixture not found for slug: ${s}`);
        return false;
      }
      return true;
    });
  } else {
    targetSlugs = fixtureFiles.filter((slug) => {
      const gtPath = join(GT_DIR, `${slug}.json`);
      return !existsSync(gtPath) || force;
    });
  }

  if (targetSlugs.length === 0) {
    console.log("Keine Fixtures ohne Ground-Truth gefunden.");
    console.log("Verwende --force um bestehende GT zu ueberschreiben.");
    return;
  }

  console.log(`Fixtures zu verarbeiten: ${targetSlugs.length}\n`);

  // URL-Mapping aus Capture-Report laden
  const urlMap = new Map<string, string>();
  if (existsSync(CAPTURE_REPORT_PATH)) {
    try {
      const report = JSON.parse(readFileSync(CAPTURE_REPORT_PATH, "utf-8"));
      for (const result of report.results ?? []) {
        if (result.slug && result.url) {
          urlMap.set(result.slug, result.url);
        }
      }
      console.log(`URL-Mapping geladen: ${urlMap.size} Eintraege\n`);
    } catch {
      console.warn("[WARN] capture-report.json nicht lesbar\n");
    }
  }

  if (!dryRun && !existsSync(GT_DIR)) {
    mkdirSync(GT_DIR, { recursive: true });
  }

  // Browser starten — einmal fuer alle Fixtures
  const browser = await chromium.launch({ headless: true });
  let generated = 0;
  let skipped = 0;

  try {
    for (const slug of targetSlugs) {
      const fixturePath = join(FIXTURES_DIR, `${slug}.html`);
      const gtPath = join(GT_DIR, `${slug}.json`);

      console.log(`[${slug}]`);

      const htmlContent = readFileSync(fixturePath, "utf-8");
      console.log(`  HTML: ${(htmlContent.length / 1024).toFixed(0)} KB`);

      // URL rekonstruieren
      let url = urlMap.get(slug);
      if (!url) {
        const canonicalMatch = htmlContent.match(
          /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/,
        );
        const ogUrlMatch = htmlContent.match(
          /<meta[^>]+property="og:url"[^>]+content="([^"]+)"/,
        );
        url = canonicalMatch?.[1] ?? ogUrlMatch?.[1] ?? `https://${slug.replace(/-/g, ".")}/`;
      }
      console.log(`  URL: ${url}`);

      // Seite in Playwright laden (wie Benchmark-Runner fixture mode)
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.route("**/*.js", (route) => route.abort());
      await page.route("**/*.css", (route) => route.abort());
      await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });

      // DOM analysieren
      const { endpoints, stats } = await analyzeDOM(page);

      await context.close();

      // Difficulty schaetzen
      const difficulty = estimateDifficulty(stats);
      console.log(`  Difficulty: ${difficulty}`);
      console.log(`  Elements: ${stats.totalElements}, Scripts: ${stats.scripts}`);
      console.log(`  Endpoints detected: ${endpoints.length}`);

      for (const ep of endpoints) {
        const conf = ep._suggestion_confidence?.toFixed(2) ?? "n/a";
        console.log(`    - [${ep.type}] ${ep.label} (phase ${ep.phase}, conf: ${conf})`);
      }

      if (dryRun) {
        console.log("  [DRY-RUN] Would write:", gtPath);
        skipped++;
      } else {
        const skeleton = buildSkeleton(slug, url, endpoints, stats, difficulty);
        writeFileSync(gtPath, JSON.stringify(skeleton, null, 2) + "\n", "utf-8");
        console.log(`  Written: ${gtPath}`);
        generated++;
      }

      console.log();
    }
  } finally {
    await browser.close();
  }

  // Summary
  console.log("=== Summary ===");
  console.log(`Generated: ${generated}`);
  console.log(`Skipped:   ${skipped}`);
  if (generated > 0) {
    console.log("\nNaechster Schritt:");
    console.log("  1. Screenshots in tests/real-world/screenshots/ anschauen");
    console.log("  2. GT-Dateien in tests/real-world/ground-truth/ reviewen");
    console.log("  3. Review-Markierungen entfernen (_review_status etc.)");
    console.log("  4. _auto_suggested/_suggestion_confidence von Endpoints entfernen");
    console.log("  5. Benchmark: npm run benchmark:fixture");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

/**
 * analyzeFromHTML — High-Level API fuer @balage/core
 *
 * Nimmt raw HTML, gibt semantisch klassifizierte Endpoints zurueck.
 * Funktioniert ohne Browser (Playwright optional).
 */

import pino from "pino";
import { htmlToDomNode } from "./html-to-dom.js";
import { detectFramework } from "./detect-framework.js";
import { pruneDom, parseAria, segmentUI } from "../parser/index.js";
import type { DomNode, UISegment, SemanticFingerprint } from "../../shared_interfaces.js";

// Lazy imports for LLM — only loaded when LLM mode is used.
// This prevents "Cannot find module 'openai'" for heuristic-only users.
async function loadLLMModules() {
  const { generateEndpoints } = await import("../semantic/endpoint-generator.js");
  const { classifyEndpoint } = await import("../semantic/endpoint-classifier.js");
  const { createOpenAIClient, createAnthropicClient } = await import("../semantic/llm-client.js");
  return { generateEndpoints, classifyEndpoint, createOpenAIClient, createAnthropicClient };
}

// Lazy import for cache module
async function loadCacheModule() {
  const { lookupCache, storeInCache } = await import("./fingerprint-cache.js");
  return { lookupCache, storeInCache };
}
import type { AnalyzeOptions, AnalysisResult, DetectedEndpoint, LLMConfig, EndpointType, AffordanceType } from "./types.js";
import type { EndpointCandidate } from "../semantic/types.js";
import { BalageInputError, BalageLLMError } from "./types.js";
import { inferSelector } from "./infer-selector.js";
import { VERSION } from "./index.js";
import { randomUUID } from "node:crypto";

const logger = pino({ name: "balage:core", level: process.env["LOG_LEVEL"] ?? "silent" });

/**
 * Analyze raw HTML and return detected endpoints.
 *
 * @param html - Raw HTML string of the page
 * @param options - Configuration options
 * @returns Analysis result with endpoints, framework detection, and timing
 *
 * @throws {BalageInputError} When html is not a string
 * @throws {BalageLLMError} When LLM provider returns an error
 */
export async function analyzeFromHTML(
  html: string,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  // --- Input Validation ---
  if (typeof html !== "string") {
    throw new BalageInputError(
      `Expected html to be a string, got ${typeof html}`,
    );
  }

  // Leeres / whitespace-only HTML: sofort leeres Ergebnis
  if (html.trim().length === 0) {
    return createEmptyResult(options);
  }

  const start = performance.now();
  const {
    url = "https://unknown",
    llm = false as false | LLMConfig,
    minConfidence = 0.50,
    maxEndpoints = 10,
    cache: cacheOption = true,
  } = options;

  const cacheEnabled = cacheOption !== false;
  const cacheOptions = typeof cacheOption === "object" ? cacheOption : {};

  // 1. HTML → DomNode (mit Fehlerbehandlung fuer kaputtes HTML)
  let dom: DomNode;
  try {
    dom = htmlToDomNode(html);
  } catch (err) {
    logger.warn({ err }, "HTML parsing failed, returning empty result");
    return createEmptyResult(options, performance.now() - start);
  }

  // 2. Framework Detection (darf nie crashen)
  let framework: AnalysisResult["framework"];
  try {
    framework = detectFramework(html) ?? undefined;
  } catch (err) {
    logger.warn({ err }, "Framework detection failed, continuing without");
    framework = undefined;
  }

  // 3. DOM Pruning + Segmentation
  const pruneResult = pruneDom(dom);
  const emptyAxTree = {
    role: "rootWebArea",
    name: "",
    children: [],
    disabled: false,
    required: false,
  };
  const aria = parseAria(pruneResult.prunedDom, emptyAxTree);
  const segments = segmentUI(pruneResult.prunedDom, aria);

  logger.debug(
    { segmentCount: segments.length, framework: framework?.framework },
    "Segments created",
  );

  // --- Cache Lookup ---
  let _cacheFingerprints: SemanticFingerprint[] | undefined;
  let _cachePageHash: string | undefined;

  if (cacheEnabled) {
    try {
      const { lookupCache } = await loadCacheModule();
      const cacheResult = await lookupCache(segments, url, cacheOptions);

      if (cacheResult.hit && cacheResult.result) {
        const totalMs = Math.round(performance.now() - start);
        return {
          ...cacheResult.result,
          endpoints: cacheResult.result.endpoints.slice(0, maxEndpoints),
          timing: { totalMs, llmCalls: 0 },
          meta: {
            ...cacheResult.result.meta,
            url, version: VERSION,
            cached: true,
            cacheSimilarity: cacheResult.similarity,
            fingerprintHash: cacheResult.fingerprintHash,
          },
        };
      }

      _cacheFingerprints = cacheResult.fingerprints;
      _cachePageHash = cacheResult.fingerprintHash;
    } catch (err) {
      logger.warn({ err }, "Cache lookup failed, continuing without cache");
    }
  }

  let endpoints: DetectedEndpoint[];
  let llmCalls = 0;
  const mode = llm ? "llm" as const : "heuristic" as const;

  if (llm) {
    const llmResult = await runLLMAnalysis(
      segments, llm, url, minConfidence, maxEndpoints,
    );
    endpoints = llmResult.endpoints;
    llmCalls = llmResult.llmCalls;
  } else {
    endpoints = runHeuristicAnalysis(
      segments, dom, minConfidence, maxEndpoints,
    );
  }

  const totalMs = Math.round(performance.now() - start);

  const result: AnalysisResult = {
    endpoints,
    framework,
    timing: { totalMs, llmCalls },
    meta: cacheEnabled
      ? { url, mode, version: VERSION, cached: false, fingerprintHash: _cachePageHash }
      : { url, mode, version: VERSION },
  };

  if (cacheEnabled && _cacheFingerprints?.length && _cachePageHash) {
    try {
      const { storeInCache } = await loadCacheModule();
      await storeInCache(result, _cacheFingerprints, _cachePageHash, url, cacheOptions);
    } catch (err) {
      logger.warn({ err }, "Cache store failed");
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// LLM Analysis
// ---------------------------------------------------------------------------

async function runLLMAnalysis(
  segments: UISegment[],
  llmConfig: LLMConfig,
  url: string,
  minConfidence: number,
  maxEndpoints: number,
): Promise<{ endpoints: DetectedEndpoint[]; llmCalls: number }> {
  // Lazy-load LLM modules (prevents "Cannot find module 'openai'" for heuristic-only users)
  const { generateEndpoints, classifyEndpoint, createOpenAIClient, createAnthropicClient } = await loadLLMModules();

  let llmClient;
  try {
    if (llmConfig.provider === "anthropic") {
      llmClient = await createAnthropicClient({ apiKey: llmConfig.apiKey, model: llmConfig.model ?? "claude-haiku-4-5-20251001" });
    } else if (llmConfig.provider === "openai") {
      llmClient = await createOpenAIClient({ apiKey: llmConfig.apiKey, model: llmConfig.model ?? "gpt-4o-mini" });
    } else {
      throw new BalageLLMError(`Unknown provider "${llmConfig.provider}". Supported: "openai", "anthropic".`, llmConfig.provider);
    }
  } catch (err) {
    if (err instanceof BalageLLMError) throw err;
    throw new BalageLLMError(
      `Failed to create ${llmConfig.provider} client: ${err instanceof Error ? err.message : String(err)}`,
      llmConfig.provider,
      err instanceof Error ? err : undefined,
    );
  }

  let candidates: EndpointCandidate[];
  let generatorLlmCalls = 0;
  try {
    const result = await generateEndpoints(
      segments,
      { url, siteId: url, sessionId: randomUUID() },
      { llmClient, maxConcurrency: 6 },
    );
    candidates = result.candidates;
    generatorLlmCalls = result.llmCalls;
  } catch (err) {
    throw new BalageLLMError(
      `LLM endpoint generation failed: ${err instanceof Error ? err.message : String(err)}`,
      llmConfig.provider,
      err instanceof Error ? err : undefined,
    );
  }

  // Warn if LLM returned 0 candidates for interactive segments
  const interactiveSegments = segments.filter(s => s.interactiveElementCount >= 1);
  if (candidates.length === 0 && interactiveSegments.length > 0) {
    logger.warn(
      { segmentCount: interactiveSegments.length, provider: llmConfig.provider },
      "LLM returned 0 endpoints despite interactive segments — check API key and model",
    );
  }

  const mapped: DetectedEndpoint[] = [];
  for (const c of candidates) {
    const matchedSegment = segments.find(s => s.id === c.segmentId)
      ?? segments.find(s => s.type === c.type)
      ?? segments[0];
    if (!matchedSegment) continue;
    const classified = classifyEndpoint(c, matchedSegment);
    mapped.push({
      type: (classified.correctedType ?? c.type) as EndpointType,
      label: c.label,
      description: c.description,
      confidence: classified.combinedConfidence,
      selector: c.anchors[0]?.selector,
      affordances: c.affordances.map((a: { type: string }) => a.type) as AffordanceType[],
      evidence: [
        `LLM: ${c.type} (conf ${c.confidence.toFixed(2)})`,
        classified.correctedType ? `Heuristic correction: ${classified.correctedType}` : "Heuristic: confirmed",
      ],
    });
  }
  const filtered = mapped
    .filter(e => e.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxEndpoints);
  return { endpoints: filtered, llmCalls: generatorLlmCalls };
}

// ---------------------------------------------------------------------------
// Heuristic Analysis — Verbesserte Label-Inferenz aus DOM-Inhalten
// ---------------------------------------------------------------------------

/** Durchsucht einen DomNode-Baum rekursiv */
function walkDom(node: DomNode, visitor: (n: DomNode) => void): void {
  visitor(node);
  if (node.children) {
    for (const child of node.children) {
      walkDom(child, visitor);
    }
  }
}

interface DomSignals {
  hasPasswordInput: boolean;
  hasEmailInput: boolean;
  hasSearchInput: boolean;
  hasSearchRole: boolean;
  hasFileInput: boolean;
  hasCookieConsent: boolean;
  hasConsentButtons: boolean;
  hasAddToCart: boolean;
  hasProductData: boolean;
  hasSettingsElement: boolean;
  hasCartLink: boolean;
  inputCount: number;
  linkCount: number;
  buttonLabels: string[];
  headingTexts: string[];
  formAction: string | undefined;
  ariaLabel: string | undefined;
  placeholders: string[];
}

function collectDomSignals(root: DomNode): DomSignals {
  const signals: DomSignals = {
    hasPasswordInput: false,
    hasEmailInput: false,
    hasSearchInput: false,
    hasSearchRole: false,
    hasFileInput: false,
    hasCookieConsent: false,
    hasConsentButtons: false,
    hasAddToCart: false,
    hasProductData: false,
    hasSettingsElement: false,
    hasCartLink: false,
    inputCount: 0,
    linkCount: 0,
    buttonLabels: [],
    headingTexts: [],
    formAction: undefined,
    ariaLabel: undefined,
    placeholders: [],
  };

  walkDom(root, (node) => {
    const tag = node.tagName;
    const attrs = node.attributes ?? {};
    const type = (attrs["type"] ?? "").toLowerCase();
    const role = (attrs["role"] ?? "").toLowerCase();

    // Inputs
    if (tag === "input" || tag === "textarea" || tag === "select") {
      signals.inputCount++;
      const autocomplete = attrs["autocomplete"] ?? "";
      if (type === "password") signals.hasPasswordInput = true;
      // Password via autocomplete (zusaetzlich zum type="password" Check)
      if (autocomplete.includes("current-password") || autocomplete.includes("new-password")) {
        signals.hasPasswordInput = true;
      }
      if (
        type === "email"
        || (attrs["name"] ?? "").includes("email")
        || autocomplete.includes("email")
      ) {
        signals.hasEmailInput = true;
      }
      // Username via autocomplete → behandeln wie Email fuer Auth-Erkennung
      if (autocomplete.includes("username")) {
        signals.hasEmailInput = true;
      }
      if (type === "search" || role === "searchbox" || role === "combobox") {
        signals.hasSearchInput = true;
      }
      // Name-Attribut als Search-Signal (q, query, s sind typische Suchfeld-Namen)
      const inputName = (attrs["name"] ?? "").toLowerCase();
      if (inputName === "q" || inputName === "query" || inputName === "s" || inputName === "search") {
        signals.hasSearchInput = true;
      }
      if (type === "file") signals.hasFileInput = true;
      if (attrs["placeholder"]) {
        signals.placeholders.push(attrs["placeholder"]);
      }
    }

    // Links
    if (tag === "a") signals.linkCount++;

    // Buttons — Label sammeln
    if (
      tag === "button"
      || (tag === "input" && (type === "submit" || type === "button"))
    ) {
      const label = node.textContent
        ?? attrs["value"]
        ?? attrs["aria-label"]
        ?? "";
      if (label.trim()) signals.buttonLabels.push(label.trim().toLowerCase());
    }

    // Headings
    if (/^h[1-6]$/.test(tag) && node.textContent) {
      signals.headingTexts.push(node.textContent.trim().toLowerCase());
    }

    // Form-Level Signale
    if (tag === "form") {
      signals.formAction = attrs["action"];
      if (role === "search") signals.hasSearchRole = true;
      if (attrs["aria-label"]) signals.ariaLabel = attrs["aria-label"];
    }

    // Search-Role auf jedem Element
    if (role === "search") signals.hasSearchRole = true;

    // Cookie-Consent / GDPR-Banner Erkennung
    const consentPattern = /cookie|consent|gdpr|privacy|datenschutz/i;
    const hasConsentRole = role === "dialog" || role === "alertdialog";
    const hasConsentId = consentPattern.test(attrs["id"] ?? "");
    const hasConsentClass = consentPattern.test(attrs["class"] ?? "");

    if (
      (hasConsentRole || hasConsentId || hasConsentClass)
      && consentPattern.test(
        [attrs["aria-label"] ?? "", node.textContent ?? ""].join(" "),
      )
    ) {
      signals.hasCookieConsent = true;
    }

    // Consent-Buttons allein reichen als Signal (ohne role/id/class Kontext)
    if (signals.hasConsentButtons && !signals.hasCookieConsent) {
      signals.hasCookieConsent = true;
    }

    // Consent-Buttons: "accept all", "reject", "alle akzeptieren" etc.
    if (
      tag === "button"
      || (tag === "input" && (type === "submit" || type === "button"))
    ) {
      const btnLabel = (node.textContent ?? attrs["value"] ?? attrs["aria-label"] ?? "").toLowerCase();
      if (/accept\s*all|reject\s*all?|alle\s*akzeptieren|alle\s*ablehnen|cookie\s*settings/i.test(btnLabel)) {
        signals.hasConsentButtons = true;
      }
    }

    // Commerce: Add-to-Cart Buttons
    if (
      tag === "button"
      || (tag === "input" && (type === "submit" || type === "button"))
    ) {
      const btnLabel = (node.textContent ?? attrs["value"] ?? attrs["aria-label"] ?? "").toLowerCase();
      if (/add\s*to\s*cart|in\s*den\s*warenkorb|buy\s*now|jetzt\s*kaufen|kaufen|jetzt\s*bestellen|zur\s*kasse/i.test(btnLabel)) {
        signals.hasAddToCart = true;
      }
    }

    // Commerce: Product-Data Attribute und Schema.org
    if (
      attrs["data-product"] !== undefined
      || attrs["data-sku"] !== undefined
      || attrs["data-price"] !== undefined
      || (attrs["itemtype"] ?? "").toLowerCase().includes("product")
    ) {
      signals.hasProductData = true;
    }

    // Settings: select/radio/checkbox/switch mit Settings-bezogenem Text
    if (
      tag === "select"
      || (tag === "input" && (type === "radio" || type === "checkbox"))
      || role === "switch"
    ) {
      const settingsText = [attrs["aria-label"] ?? "", node.textContent ?? "", attrs["name"] ?? ""].join(" ");
      if (/font[\s-]?size|theme|dark[\s-]?mode|light[\s-]?mode|appearance|language|sprache|locale|color[\s-]?scheme|accessibility/i.test(settingsText)) {
        signals.hasSettingsElement = true;
      }
    }

    // Commerce: Cart-Links (href zu cart/bag/basket)
    if (tag === "a" && attrs["href"]) {
      if (/\/(cart|bag|basket|warenkorb)\b/i.test(attrs["href"])) {
        signals.hasCartLink = true;
      }
    }

    // Commerce: Cart-Icons (img/svg mit cart-bezogenem alt/class/aria-label)
    if (
      (tag === "img" || tag === "svg")
      && /cart|bag|basket|warenkorb/i.test(
        [attrs["alt"] ?? "", attrs["class"] ?? "", attrs["aria-label"] ?? ""].join(" "),
      )
    ) {
      signals.hasCartLink = true;
    }
  });

  return signals;
}

/**
 * Generiert ein menschenlesbares Label aus DOM-Signalen.
 * FIX #1: Statt generischem "form" kommt z.B. "Login / Sign-In Form".
 */
function inferLabel(segmentType: string, signals: DomSignals): string {
  // Cookie-Consent / GDPR-Banner (vor Auth, da Consent-Dialoge Password-Felder ueberlagern koennen)
  if (signals.hasCookieConsent) {
    return "Cookie Consent Dialog";
  }

  // Auth / Login
  if (signals.hasPasswordInput) {
    if (signals.hasEmailInput || signals.inputCount <= 3) {
      return "Login / Sign-In Form";
    }
    return "Authentication Form";
  }

  // Search
  if (signals.hasSearchRole || signals.hasSearchInput) {
    return "Search Form";
  }
  if (signals.placeholders.some(p => /search|such|find|query/i.test(p))) {
    return "Search Form";
  }

  // Registration / Signup
  const allText = [
    ...signals.buttonLabels,
    ...signals.headingTexts,
    ...signals.placeholders,
  ].join(" ");
  if (/sign\s*up|register|create\s*account|registrier/i.test(allText)) {
    return "Registration / Sign-Up Form";
  }

  // Contact
  if (/contact|kontakt|message|nachricht/i.test(allText)) {
    return "Contact Form";
  }

  // Newsletter / Subscribe
  if (/subscri|newsletter|abonnier/i.test(allText)) {
    return "Newsletter / Subscribe Form";
  }

  // File Upload
  if (signals.hasFileInput) {
    return "File Upload Form";
  }

  // Checkout
  if (/checkout|payment|bezahl|kasse|cart|warenkorb|jetzt\s*bestellen|zur\s*kasse/i.test(allText)) {
    return "Checkout Form";
  }

  // Commerce: Add to Cart / Product Page
  if (signals.hasAddToCart || signals.hasProductData) {
    return "Product / Add to Cart";
  }

  // Commerce: Cart Link/Icon
  if (signals.hasCartLink) {
    return "Shopping Cart";
  }

  // Settings / Preferences
  if (signals.hasSettingsElement) {
    return "Settings / Preferences";
  }

  // Navigation
  if (segmentType === "navigation") {
    if (signals.linkCount > 5) return "Main Navigation Menu";
    return "Navigation Menu";
  }

  // Form Action URL als Hinweis
  if (signals.formAction) {
    const action = signals.formAction.toLowerCase();
    if (/login|signin|sign-in|auth/i.test(action)) return "Login / Sign-In Form";
    if (/search/i.test(action)) return "Search Form";
    if (/register|signup|sign-up/i.test(action)) return "Registration / Sign-Up Form";
    if (/contact/i.test(action)) return "Contact Form";
    if (/checkout|payment/i.test(action)) return "Checkout Form";
    if (/subscribe/i.test(action)) return "Newsletter / Subscribe Form";
  }

  // Aria-Label
  if (signals.ariaLabel) {
    return capitalizeFirst(signals.ariaLabel);
  }

  // Heading als Kontext
  if (signals.headingTexts.length > 0) {
    return capitalizeFirst(signals.headingTexts[0]!);
  }

  // Fallback: beschreibender Typ
  return SEGMENT_TYPE_LABELS[segmentType] ?? capitalizeFirst(segmentType);
}

const SEGMENT_TYPE_LABELS: Record<string, string> = {
  form: "Interactive Form",
  navigation: "Navigation Menu",
  content: "Content Section",
  header: "Page Header",
  footer: "Page Footer",
  sidebar: "Sidebar",
  modal: "Modal Dialog",
  overlay: "Overlay",
  banner: "Banner",
  table: "Data Table",
  list: "List",
  media: "Media Section",
  search: "Search Form",
  checkout: "Checkout Form",
  unknown: "Interactive Section",
};

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const VALID_ENDPOINT_TYPES = new Set<EndpointType>(["auth","form","search","navigation","checkout","commerce","content","consent","support","media","social","settings"]);

/** Bestimmt den Endpoint-Typ aus DOM-Signalen (verbessert den Segment-Typ). */
function inferEndpointType(
  segmentType: string,
  signals: DomSignals,
): EndpointType {
  // Consent-Banner hat hoechste Prioritaet (ueberlagert andere Elemente)
  if (signals.hasCookieConsent) return "consent";

  if (signals.hasPasswordInput) return "auth";
  // Settings VOR search: verhindert Fehlklassifizierung von Dropdowns als search
  // Guard: wenn auch Consent-Signale vorhanden → consent hat Vorrang vor settings
  if (signals.hasSettingsElement && !signals.hasSearchInput && !signals.hasSearchRole && !signals.hasCookieConsent && !signals.hasConsentButtons) return "settings";
  if (signals.hasSearchRole || signals.hasSearchInput) return "search";
  if (signals.placeholders.some(p => /search|such|find|query/i.test(p))) {
    return "search";
  }

  const allText = [
    ...signals.buttonLabels,
    ...signals.headingTexts,
  ].join(" ");
  if (/checkout|payment|bezahl|kasse|warenkorb|jetzt\s*bestellen/i.test(allText)) return "checkout";

  // Commerce: Add-to-Cart, Product-Daten oder Cart-Links/Icons
  if (signals.hasAddToCart || signals.hasProductData || signals.hasCartLink) return "commerce";

  if (signals.formAction) {
    const action = signals.formAction.toLowerCase();
    if (/login|signin|sign-in|auth/i.test(action)) return "auth";
    if (/register|signup|sign-up/i.test(action)) return "auth";
    if (/search/i.test(action)) return "search";
    if (/checkout|payment/i.test(action)) return "checkout";
    if (/contact/i.test(action)) return "form";
    if (/subscribe/i.test(action)) return "form";
  }

  // Footer/Header/Sidebar mit vielen Links → navigation statt content
  if (["footer", "header", "sidebar"].includes(segmentType) && signals.linkCount >= 3) {
    return "navigation";
  }

  return VALID_ENDPOINT_TYPES.has(segmentType as EndpointType) ? segmentType as EndpointType : "content";
}

function inferDescription(
  label: string,
  signals: DomSignals,
  endpointType: string,
): string {
  const parts: string[] = [label];
  if (signals.inputCount > 0) {
    parts.push(
      `with ${signals.inputCount} input field${signals.inputCount > 1 ? "s" : ""}`,
    );
  }
  if (signals.linkCount > 0 && endpointType === "navigation") {
    parts.push(
      `containing ${signals.linkCount} link${signals.linkCount > 1 ? "s" : ""}`,
    );
  }
  if (signals.buttonLabels.length > 0) {
    parts.push(`(action: "${signals.buttonLabels[0]}")`);
  }
  return parts.join(" ");
}

function runHeuristicAnalysis(
  segments: UISegment[],
  fullDom: DomNode,
  minConfidence: number,
  maxEndpoints: number,
): DetectedEndpoint[] {
  return segments
    .filter((s: UISegment) => s.interactiveElementCount > 0)
    .map((s: UISegment) => {
      // Segment-Nodes fuer DOM-Signal-Analyse nutzen
      const segmentRoot: DomNode = (s.nodes && s.nodes.length > 0)
        ? {
            tagName: "div",
            attributes: {},
            isVisible: true,
            isInteractive: false,
            children: s.nodes,
          }
        : fullDom;

      const signals = collectDomSignals(segmentRoot);
      const endpointType = inferEndpointType(s.type, signals);
      const label = inferLabel(s.type, signals);
      const description = inferDescription(label, signals, endpointType);

      // Confidence: Signal-staerke-basiert mit korroborierenden Bonus-Signalen
      const typeConfidence: Record<string, number> = {
        auth: 0.80,
        search: 0.75,
        consent: 0.60,
        checkout: 0.55,
        commerce: 0.55,
        navigation: 0.50,
        form: 0.40,
        content: 0.30,
      };
      let confidence = typeConfidence[endpointType] ?? 0.30;
      // Korroborierende Signale erhoehen Confidence
      if (signals.hasPasswordInput && signals.hasEmailInput) confidence += 0.15;
      if (signals.formAction && /login|auth|search/.test(signals.formAction)) confidence += 0.10;
      if (signals.hasSearchRole && signals.hasSearchInput) confidence += 0.10;
      if (signals.hasCookieConsent && signals.hasConsentButtons) confidence += 0.10;
      // Interaktive Elemente erhoehen die Basis-Confidence leicht (max +0.15)
      confidence += Math.min(0.15, s.interactiveElementCount * 0.05);
      confidence = Math.round(Math.min(0.90, confidence) * 100) / 100;

      // Selektor-Inferenz: generiert CSS-Selektoren aus DOM-Struktur
      const selector = inferSelector(segmentRoot);

      return {
        type: endpointType,
        label,
        description,
        confidence,
        selector,
        affordances: inferAffordances(endpointType, signals),
        evidence: buildEvidence(s.type, endpointType, signals),
      } satisfies DetectedEndpoint;
    })
    .filter((e: DetectedEndpoint) => e.confidence >= minConfidence)
    .sort((a: DetectedEndpoint, b: DetectedEndpoint) => b.confidence - a.confidence)
    .reduce((deduped: DetectedEndpoint[], ep) => {
      // Navigation: bis zu 5 DISTINCT Endpoints erlauben
      if (ep.type === "navigation") {
        const navCount = deduped.filter(d => d.type === "navigation").length;
        const labelExists = deduped.some(d => d.type === "navigation" && d.label === ep.label);
        if (navCount < 5 && !labelExists) {
          deduped.push(ep);
        }
        return deduped;
      }
      // Auth: bis zu 4 DISTINCT Endpoints (Login Form, SSO, OAuth, Passkey)
      if (ep.type === "auth") {
        const authCount = deduped.filter(d => d.type === "auth").length;
        const labelExists = deduped.some(d => d.type === "auth" && d.label === ep.label);
        if (authCount < 4 && !labelExists) {
          deduped.push(ep);
        }
        return deduped;
      }
      // Andere Typen: Deduplicate by type+label — keep highest confidence
      const key = `${ep.type}:${ep.label}`;
      if (!deduped.some(d => `${d.type}:${d.label}` === key)) {
        deduped.push(ep);
      }
      return deduped;
    }, [])
    .slice(0, maxEndpoints);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyResult(
  options: AnalyzeOptions,
  elapsedMs: number = 0,
): AnalysisResult {
  return {
    endpoints: [],
    framework: undefined,
    timing: { totalMs: Math.round(elapsedMs), llmCalls: 0 },
    meta: {
      url: options.url,
      mode: options.llm ? "llm" : "heuristic",
      version: VERSION,
    },
  };
}

function inferAffordances(
  endpointType: string,
  signals: DomSignals,
): AffordanceType[] {
  const affordances: AffordanceType[] = [];
  switch (endpointType) {
    case "auth":
      affordances.push("fill", "submit", "click");
      break;
    case "search":
      affordances.push("fill", "submit");
      break;
    case "form":
      affordances.push("fill", "submit");
      if (signals.hasFileInput) affordances.push("upload");
      break;
    case "navigation":
      affordances.push("click", "navigate");
      break;
    case "checkout":
      affordances.push("click", "fill", "submit");
      break;
    case "consent":
      affordances.push("click", "toggle");
      break;
    case "settings":
      affordances.push("click", "toggle", "select");
      break;
    case "commerce":
      affordances.push("click", "scroll");
      break;
    default:
      affordances.push("click");
  }
  return affordances;
}

function buildEvidence(
  originalType: string,
  inferredType: string,
  signals: DomSignals,
): string[] {
  const evidence: string[] = [];
  evidence.push(`Segment type: ${originalType}`);
  if (inferredType !== originalType) {
    evidence.push(`Refined to: ${inferredType}`);
  }
  if (signals.hasPasswordInput) evidence.push("Contains password input");
  if (signals.hasSearchRole) evidence.push("Has role=search");
  if (signals.hasSearchInput) evidence.push("Contains search input");
  if (signals.hasEmailInput) evidence.push("Contains email input");
  if (signals.hasCookieConsent) evidence.push("Contains cookie/consent dialog");
  if (signals.hasConsentButtons) evidence.push("Contains consent action buttons");
  if (signals.hasAddToCart) evidence.push("Contains add-to-cart button");
  if (signals.hasProductData) evidence.push("Contains product data attributes");
  if (signals.hasSettingsElement) evidence.push("Contains settings controls (select/radio/toggle)");
  if (signals.hasCartLink) evidence.push("Contains cart/commerce link or icon");
  if (signals.formAction) evidence.push(`Form action: ${signals.formAction}`);
  evidence.push(
    `Interactive elements: ${signals.inputCount} inputs, ${signals.linkCount} links`,
  );
  return evidence;
}

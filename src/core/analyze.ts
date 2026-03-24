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
import type { DomNode, UISegment } from "../../shared_interfaces.js";

// Lazy imports for LLM — only loaded when LLM mode is used.
// This prevents "Cannot find module 'openai'" for heuristic-only users.
async function loadLLMModules() {
  const { generateEndpoints } = await import("../semantic/endpoint-generator.js");
  const { classifyEndpoint } = await import("../semantic/endpoint-classifier.js");
  const { createOpenAIClient, createAnthropicClient } = await import("../semantic/llm-client.js");
  return { generateEndpoints, classifyEndpoint, createOpenAIClient, createAnthropicClient };
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
  } = options;

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

  let endpoints: DetectedEndpoint[];
  let llmCalls = 0;

  // Mode-Bestimmung: expliziter mode > implizit aus llm-Config
  const resolvedMode: "heuristic" | "llm" | "hybrid" = options.mode
    ?? (llm ? "llm" : "heuristic");

  // Validierung: hybrid und llm brauchen eine LLM-Config
  if ((resolvedMode === "hybrid" || resolvedMode === "llm") && !llm) {
    logger.warn(
      { mode: resolvedMode },
      "Mode requires LLM config but none provided, falling back to heuristic",
    );
  }

  const effectiveMode = (resolvedMode !== "heuristic" && !llm) ? "heuristic" as const : resolvedMode;

  if (effectiveMode === "hybrid" && llm) {
    endpoints = await runHybridAnalysis(
      segments, dom, llm, url, minConfidence, maxEndpoints,
    );
    llmCalls = 1; // Hybrid sendet 1 zusammengefassten LLM-Call statt pro Segment
  } else if (effectiveMode === "llm" && llm) {
    endpoints = await runLLMAnalysis(
      segments, llm, url, minConfidence, maxEndpoints,
    );
    llmCalls = segments.filter(s => s.interactiveElementCount >= 1).length;
  } else {
    endpoints = runHeuristicAnalysis(
      segments, dom, minConfidence, maxEndpoints,
    );
  }

  const totalMs = Math.round(performance.now() - start);

  return {
    endpoints,
    framework,
    timing: { totalMs, llmCalls },
    meta: { url, mode: effectiveMode, version: VERSION },
  };
}

// ---------------------------------------------------------------------------
// Hybrid Analysis — Heuristic-First, LLM-Validated
// ---------------------------------------------------------------------------

/**
 * Hybrid-Modus: Heuristik generiert Kandidaten (hoher Recall),
 * LLM validiert/korrigiert/ergaenzt (hohe Precision).
 *
 * Pipeline:
 * 1. runHeuristicAnalysis generiert Kandidaten-Liste (wie bisher)
 * 2. Kandidaten + DOM-Kontext werden dem LLM als Validierungs-Aufgabe gesendet
 * 3. LLM bestaetigt, korrigiert oder verwirft jeden Kandidaten
 * 4. LLM darf neue Endpoints ergaenzen die die Heuristik verpasst hat
 * 5. Voting bei Widerspruch: Gewichteter Merge basierend auf Evidence-Staerke
 */
async function runHybridAnalysis(
  segments: UISegment[],
  fullDom: DomNode,
  llmConfig: LLMConfig,
  url: string,
  minConfidence: number,
  maxEndpoints: number,
): Promise<DetectedEndpoint[]> {
  // Phase 1: Heuristik-Kandidaten generieren (kein minConfidence-Filter, hoher Recall)
  const heuristicCandidates = runHeuristicAnalysis(
    segments, fullDom, 0.20, maxEndpoints * 2,
  );

  logger.debug(
    { candidateCount: heuristicCandidates.length },
    "Hybrid: Heuristic candidates generated",
  );

  // Phase 2: LLM-Validierung
  const { createOpenAIClient, createAnthropicClient } = await loadLLMModules();

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
    // Fallback: bei LLM-Fehler nur Heuristik-Ergebnisse zurueckgeben
    logger.warn({ err }, "Hybrid: LLM client creation failed, falling back to heuristic results");
    return heuristicCandidates
      .filter(e => e.confidence >= minConfidence)
      .slice(0, maxEndpoints);
  }

  // Phase 3: Validierungs-Prompt bauen
  const validationPrompt = buildHybridValidationPrompt(heuristicCandidates, url);

  try {
    const response = await llmClient.complete({
      systemPrompt: HYBRID_VALIDATION_SYSTEM_PROMPT,
      userPrompt: validationPrompt,
      temperature: 0,
      maxTokens: 2048,
    });

    const parsed = parseHybridLLMResponse(response.content ?? "");

    // Phase 4: Voting — Merge Heuristik + LLM-Validierung
    const merged = mergeHybridResults(heuristicCandidates, parsed);

    return merged
      .filter(e => e.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxEndpoints);
  } catch (err) {
    // Graceful degradation: bei LLM-Fehler Heuristik-Ergebnisse zurueckgeben
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Hybrid: LLM validation failed, returning heuristic results",
    );
    return heuristicCandidates
      .filter(e => e.confidence >= minConfidence)
      .slice(0, maxEndpoints);
  }
}

const HYBRID_VALIDATION_SYSTEM_PROMPT = `You are an expert UI analyst validating pre-classified endpoint candidates.

You receive a list of endpoint candidates that were detected by a heuristic analysis of a web page DOM.
Your task is to validate, correct, or reject each candidate, and optionally add missing endpoints.

For each candidate, respond with:
- "status": "confirmed" | "corrected" | "rejected"
- "correctedType": (only if status="corrected") the correct endpoint type
- "confidenceAdjustment": a number between -0.3 and +0.2 to adjust the heuristic confidence
- "reason": brief explanation

You may also add new endpoints that the heuristic missed (max 3).

IMPORTANT:
- Be conservative with rejections. Only reject if clearly wrong.
- Trust the heuristic for standard patterns (login forms, search bars, navigation).
- Add new endpoints only if there's strong evidence the heuristic missed something.

Return valid JSON:
{
  "validations": [
    { "index": 0, "status": "confirmed", "confidenceAdjustment": 0.05, "reason": "..." },
    { "index": 1, "status": "corrected", "correctedType": "auth", "confidenceAdjustment": 0.10, "reason": "..." },
    { "index": 2, "status": "rejected", "confidenceAdjustment": -0.30, "reason": "..." }
  ],
  "additions": [
    { "type": "...", "label": "...", "description": "...", "confidence": 0.65, "reason": "..." }
  ],
  "reasoning": "Overall analysis summary"
}

ENDPOINT TYPES: auth, form, search, navigation, checkout, commerce, content, consent, support, media, social, settings`;

/**
 * Baut den Validierungs-Prompt fuer den Hybrid-Modus.
 * Sendet die Heuristik-Kandidaten als strukturierte Liste an das LLM.
 */
function buildHybridValidationPrompt(
  candidates: DetectedEndpoint[],
  url: string,
): string {
  const parts: string[] = [];
  parts.push(`## Page: ${url}`);
  parts.push(`## Heuristic Candidates (${candidates.length} detected):`);
  parts.push("");

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    parts.push(`### Candidate ${i}:`);
    parts.push(`- Type: ${c.type}`);
    parts.push(`- Label: ${c.label}`);
    parts.push(`- Description: ${c.description}`);
    parts.push(`- Confidence: ${c.confidence.toFixed(2)}`);
    parts.push(`- Selector: ${c.selector ?? "none"}`);
    parts.push(`- Affordances: ${c.affordances.join(", ")}`);
    parts.push(`- Evidence: ${c.evidence.join("; ")}`);
    parts.push("");
  }

  parts.push("## Task");
  parts.push("Validate each candidate. Confirm, correct, or reject. Add missing endpoints if any.");

  return parts.join("\n");
}

interface HybridValidation {
  index: number;
  status: "confirmed" | "corrected" | "rejected";
  correctedType?: string;
  confidenceAdjustment: number;
  reason: string;
}

interface HybridAddition {
  type: string;
  label: string;
  description: string;
  confidence: number;
  reason: string;
}

interface HybridLLMResult {
  validations: HybridValidation[];
  additions: HybridAddition[];
}

/**
 * Parst die LLM-Antwort fuer den Hybrid-Modus.
 * Robustes Parsing: extrahiert JSON aus der Antwort auch wenn das LLM
 * Markdown-Code-Bloecke drumrum packt.
 */
function parseHybridLLMResponse(rawContent: string): HybridLLMResult {
  // JSON aus Markdown-Code-Block extrahieren falls vorhanden
  const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/) ?? rawContent.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch?.[1]?.trim() ?? rawContent.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      validations: Array.isArray(parsed.validations) ? parsed.validations : [],
      additions: Array.isArray(parsed.additions) ? parsed.additions : [],
    };
  } catch {
    logger.warn("Hybrid: Failed to parse LLM validation response, returning empty");
    return { validations: [], additions: [] };
  }
}

/**
 * Merge-Logik: Kombiniert Heuristik-Kandidaten mit LLM-Validierung.
 *
 * Voting-Regeln:
 * - confirmed: Confidence um Adjustment erhoehen (max +0.2)
 * - corrected: Typ uebernehmen, Confidence leicht senken (Unsicherheit durch Korrektur)
 * - rejected: Confidence stark senken aber nicht komplett entfernen
 *   (Heuristik hat DOM-Evidence, LLM koennte sich irren)
 * - Nicht-validierte Kandidaten: Confidence unveraendert lassen
 * - Additions: Als neue Endpoints mit LLM-Confidence hinzufuegen
 */
function mergeHybridResults(
  heuristicCandidates: DetectedEndpoint[],
  llmResult: HybridLLMResult,
): DetectedEndpoint[] {
  const results: DetectedEndpoint[] = [];
  const validationMap = new Map<number, HybridValidation>();

  for (const v of llmResult.validations) {
    if (typeof v.index === "number" && v.index >= 0 && v.index < heuristicCandidates.length) {
      validationMap.set(v.index, v);
    }
  }

  for (let i = 0; i < heuristicCandidates.length; i++) {
    const candidate = { ...heuristicCandidates[i]! };
    const validation = validationMap.get(i);

    if (validation === undefined) {
      // Kein LLM-Feedback: Heuristik-Ergebnis unveraendert uebernehmen
      results.push(candidate);
      continue;
    }

    switch (validation.status) {
      case "confirmed": {
        // Confidence-Boost begrenzen auf +0.2
        const adjustment = Math.min(0.2, Math.max(-0.1, validation.confidenceAdjustment));
        candidate.confidence = Math.round(Math.min(0.95, candidate.confidence + adjustment) * 100) / 100;
        candidate.evidence.push(`LLM confirmed: ${validation.reason}`);
        results.push(candidate);
        break;
      }
      case "corrected": {
        // Typ korrigieren wenn der korrigierte Typ valid ist
        if (validation.correctedType && VALID_ENDPOINT_TYPES.has(validation.correctedType as EndpointType)) {
          candidate.evidence.push(`LLM corrected from ${candidate.type} to ${validation.correctedType}: ${validation.reason}`);
          candidate.type = validation.correctedType as EndpointType;
          // Leichte Confidence-Reduktion bei Korrektur (0.85x) — LLM und Heuristik widersprechen sich
          candidate.confidence = Math.round(Math.min(0.90, candidate.confidence * 0.85 + Math.max(0, validation.confidenceAdjustment)) * 100) / 100;
        }
        results.push(candidate);
        break;
      }
      case "rejected": {
        // Nicht komplett verwerfen — Confidence stark senken, der minConfidence-Filter entscheidet
        candidate.confidence = Math.round(Math.max(0.10, candidate.confidence * 0.5) * 100) / 100;
        candidate.evidence.push(`LLM rejected: ${validation.reason}`);
        results.push(candidate);
        break;
      }
    }
  }

  // LLM-Additions hinzufuegen (max 3, mit moderater Confidence)
  for (const addition of llmResult.additions.slice(0, 3)) {
    if (!addition.type || !addition.label) continue;
    const addType = VALID_ENDPOINT_TYPES.has(addition.type as EndpointType) ? addition.type as EndpointType : "content" as EndpointType;

    // Pruefen ob nicht bereits ein Endpoint mit gleichem Typ+Label existiert
    const isDuplicate = results.some(r => r.type === addType && r.label.toLowerCase() === addition.label.toLowerCase());
    if (isDuplicate) continue;

    results.push({
      type: addType,
      label: addition.label,
      description: addition.description ?? addition.label,
      // LLM-only Additions bekommen niedrigere Confidence als heuristic-bestaetigt
      confidence: Math.round(Math.min(0.75, addition.confidence ?? 0.50) * 100) / 100,
      affordances: inferAffordances(addType, { hasPasswordInput: false, hasEmailInput: false, hasSearchInput: false, hasSearchRole: false, hasFileInput: false, hasCookieConsent: false, hasConsentButtons: false, hasAddToCart: false, hasProductData: false, hasSettingsElement: false, hasCartLink: false, inputCount: 0, linkCount: 0, buttonLabels: [], headingTexts: [], formAction: undefined, ariaLabel: undefined, placeholders: [] }),
      evidence: [`LLM addition: ${addition.reason ?? "detected by LLM"}`],
    });
  }

  return results;
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
): Promise<DetectedEndpoint[]> {
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
  try {
    candidates = await generateEndpoints(
      segments,
      { url, siteId: url, sessionId: randomUUID() },
      { llmClient, maxConcurrency: 6 },
    );
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
    const matchedSegment = segments.find(s => s.type === c.type) ?? segments[0];
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
  return mapped
    .filter(e => e.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxEndpoints);
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
      if (type === "password") signals.hasPasswordInput = true;
      if (
        type === "email"
        || (attrs["name"] ?? "").includes("email")
        || (attrs["autocomplete"] ?? "").includes("email")
      ) {
        signals.hasEmailInput = true;
      }
      if (type === "search" || role === "searchbox") {
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
    if (
      (role === "dialog" || role === "alertdialog")
      && (/cookie|consent|gdpr|privacy/i.test(
        [attrs["id"] ?? "", attrs["class"] ?? "", attrs["aria-label"] ?? "", node.textContent ?? ""].join(" "),
      ))
    ) {
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
      if (/add\s*to\s*cart|in\s*den\s*warenkorb|buy\s*now|jetzt\s*kaufen|kaufen/i.test(btnLabel)) {
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
  if (signals.placeholders.some(p => /search|suche|find|query/i.test(p))) {
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
  if (/checkout|payment|bezahl|kasse|cart|warenkorb/i.test(allText)) {
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
    if (/login|signin|auth/i.test(action)) return "Login / Sign-In Form";
    if (/search/i.test(action)) return "Search Form";
    if (/register|signup/i.test(action)) return "Registration / Sign-Up Form";
    if (/contact/i.test(action)) return "Contact Form";
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
  if (signals.hasSettingsElement && !signals.hasSearchInput && !signals.hasSearchRole) return "settings";
  if (signals.hasSearchRole || signals.hasSearchInput) return "search";
  if (signals.placeholders.some(p => /search|suche|find/i.test(p))) {
    return "search";
  }

  const allText = [
    ...signals.buttonLabels,
    ...signals.headingTexts,
  ].join(" ");
  if (/checkout|payment|bezahl|kasse/i.test(allText)) return "checkout";

  // Commerce: Add-to-Cart, Product-Daten oder Cart-Links/Icons
  if (signals.hasAddToCart || signals.hasProductData || signals.hasCartLink) return "commerce";

  if (signals.formAction) {
    const action = signals.formAction.toLowerCase();
    if (/login|signin|auth/i.test(action)) return "auth";
    if (/search/i.test(action)) return "search";
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
        auth: 0.70,
        search: 0.65,
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
      // Navigation: bis zu 4 Endpoints erlauben (Header, Sidebar, Footer, Breadcrumbs)
      if (ep.type === "navigation") {
        const navCount = deduped.filter(d => d.type === "navigation").length;
        if (navCount < 4) {
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

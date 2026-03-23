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
import { generateEndpoints } from "../semantic/endpoint-generator.js";
import { classifyEndpoint } from "../semantic/endpoint-classifier.js";
import { createOpenAIClient, createAnthropicClient } from "../semantic/llm-client.js";
import type { LLMClient } from "../semantic/llm-client.js";
import type { DomNode, UISegment } from "../../shared_interfaces.js";
import type { EndpointCandidate } from "../semantic/types.js";
import type { AnalyzeOptions, AnalysisResult, DetectedEndpoint, LLMConfig } from "./types.js";
import { BalageInputError, BalageLLMError } from "./types.js";
import { randomUUID } from "node:crypto";

const logger = pino({ name: "balage:core", level: process.env["LOG_LEVEL"] ?? "warn" });

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
    llm = false,
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
  const mode = (llm && typeof llm !== "boolean")
    ? "llm" as const
    : "heuristic" as const;

  if (llm && typeof llm !== "boolean") {
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
    meta: { url, mode, version: "0.1.0-alpha.1" },
  };
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
  let llmClient: LLMClient;
  try {
    llmClient = createLLMClient(llmConfig);
  } catch (err) {
    throw new BalageLLMError(
      `Failed to create ${llmConfig.provider} client. Check your API key and provider name.`,
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
      type: classified.correctedType ?? c.type,
      label: c.label,
      description: c.description,
      confidence: classified.combinedConfidence,
      selector: c.anchors[0]?.selector,
      affordances: c.affordances.map((a: { type: string }) => a.type),
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
  });

  return signals;
}

/**
 * Generiert ein menschenlesbares Label aus DOM-Signalen.
 * FIX #1: Statt generischem "form" kommt z.B. "Login / Sign-In Form".
 */
function inferLabel(segmentType: string, signals: DomSignals): string {
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

/** Bestimmt den Endpoint-Typ aus DOM-Signalen (verbessert den Segment-Typ). */
function inferEndpointType(
  segmentType: string,
  signals: DomSignals,
): string {
  if (signals.hasPasswordInput) return "auth";
  if (signals.hasSearchRole || signals.hasSearchInput) return "search";
  if (signals.placeholders.some(p => /search|suche|find/i.test(p))) {
    return "search";
  }

  const allText = [
    ...signals.buttonLabels,
    ...signals.headingTexts,
  ].join(" ");
  if (/checkout|payment|bezahl|kasse/i.test(allText)) return "checkout";

  if (signals.formAction) {
    const action = signals.formAction.toLowerCase();
    if (/login|signin|auth/i.test(action)) return "auth";
    if (/search/i.test(action)) return "search";
  }

  return segmentType;
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

      // Confidence: Basis + Bonus fuer starke Signale
      let confidence = 0.3 + s.interactiveElementCount * 0.1;
      if (signals.hasPasswordInput) confidence += 0.15;
      if (signals.hasSearchRole || signals.hasSearchInput) confidence += 0.1;
      if (signals.formAction) confidence += 0.05;
      confidence = Math.min(0.85, confidence);

      return {
        type: endpointType,
        label,
        description,
        confidence,
        selector: undefined,
        affordances: inferAffordances(endpointType, signals),
        evidence: buildEvidence(s.type, endpointType, signals),
      } satisfies DetectedEndpoint;
    })
    .filter((e: DetectedEndpoint) => e.confidence >= minConfidence)
    .sort((a: DetectedEndpoint, b: DetectedEndpoint) => b.confidence - a.confidence)
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
      mode: (options.llm && typeof options.llm !== "boolean")
        ? "llm"
        : "heuristic",
      version: "0.1.0-alpha.1",
    },
  };
}

function createLLMClient(config: LLMConfig): LLMClient {
  if (config.provider === "anthropic") {
    return createAnthropicClient({
      apiKey: config.apiKey,
      model: config.model ?? "claude-haiku-4-5-20251001",
    });
  }
  if (config.provider === "openai") {
    return createOpenAIClient({
      apiKey: config.apiKey,
      model: config.model ?? "gpt-4o-mini",
    });
  }
  throw new BalageLLMError(
    `Unknown LLM provider "${config.provider}". Supported: "openai", "anthropic".`,
    config.provider,
  );
}

function inferAffordances(
  endpointType: string,
  signals: DomSignals,
): string[] {
  const affordances: string[] = [];
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
  if (signals.formAction) evidence.push(`Form action: ${signals.formAction}`);
  evidence.push(
    `Interactive elements: ${signals.inputCount} inputs, ${signals.linkCount} links`,
  );
  return evidence;
}

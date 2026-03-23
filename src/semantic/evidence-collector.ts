/**
 * Evidence-Collector: Baut Evidence-Chains fuer Endpoint-Interpretationen auf.
 *
 * Sammelt Beweise aus verschiedenen Quellen (DOM, ARIA, LLM, Struktur)
 * und validiert diese gegen das EvidenceSchema.
 */

import pino from "pino";
import { EvidenceCollectionError } from "./errors.js";
import { EvidenceSchema } from "../../shared_interfaces.js";
import type { Evidence, UISegment, DomNode } from "../../shared_interfaces.js";
import type { EndpointCandidate, LLMEndpointResponse, EvidenceSummary } from "./types.js";

const logger = pino({ level: process.env["LOG_LEVEL"] ?? "silent", name: "semantic:evidence-collector" });

/** Truncate string to fit within schema max length */
function truncateSignal(s: string, max = 512): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

/**
 * Sammelt Evidence fuer eine Endpoint-Interpretation.
 */
export function collectEvidence(
  candidate: EndpointCandidate,
  segment: UISegment,
  llmResponse: LLMEndpointResponse,
): Evidence[] {
  try {
    const evidence: Evidence[] = [];

    // 1. semantic_label — Aus Headings, Button-Texten, ARIA-Labels
    const semanticLabels = extractSemanticLabels(segment.nodes);
    if (semanticLabels.length > 0) {
      evidence.push(
        EvidenceSchema.parse({
          type: "semantic_label",
          signal: truncateSignal(semanticLabels.join(", ")),
          weight: 0.8,
          detail: `Found ${semanticLabels.length} semantic label(s) in segment`,
          source: "dom",
        }),
      );
    }

    // 2. aria_role — ARIA-Rollen die den Endpoint-Typ stuetzen
    const ariaRoles = extractAriaRoles(segment.nodes);
    if (ariaRoles.length > 0) {
      const rolesMatch = ariaRolesMatchType(ariaRoles, candidate.type);
      evidence.push(
        EvidenceSchema.parse({
          type: "aria_role",
          signal: truncateSignal(ariaRoles.join(", ")),
          weight: rolesMatch ? 0.9 : 0.4,
          detail: rolesMatch
            ? `ARIA roles [${ariaRoles.join(", ")}] support endpoint type "${candidate.type}"`
            : `ARIA roles [${ariaRoles.join(", ")}] may not match endpoint type "${candidate.type}"`,
          source: "aria",
        }),
      );
    }

    // 3. structural_pattern — Strukturelle Muster
    const pattern = detectStructuralPattern(segment.nodes);
    if (pattern) {
      evidence.push(
        EvidenceSchema.parse({
          type: "structural_pattern",
          signal: pattern.pattern,
          weight: pattern.weight,
          detail: pattern.description,
          source: "dom",
        }),
      );
    }

    // 4. text_content — Relevante Texte
    const relevantTexts = extractRelevantTexts(segment.nodes, candidate.type);
    if (relevantTexts.length > 0) {
      evidence.push(
        EvidenceSchema.parse({
          type: "text_content",
          signal: truncateSignal(relevantTexts.slice(0, 5).join("; ")),
          weight: 0.6,
          detail: `Found ${relevantTexts.length} text signal(s) matching type "${candidate.type}"`,
          source: "dom",
        }),
      );
    }

    // 5. layout_position — Position auf der Seite
    if (segment.boundingBox) {
      const region = inferLayoutRegion(segment.boundingBox.y, segment.boundingBox.x);
      const posWeight = layoutRegionMatchesType(region, candidate.type) ? 0.5 : 0.2;
      evidence.push(
        EvidenceSchema.parse({
          type: "layout_position",
          signal: region,
          weight: posWeight,
          detail: `Segment positioned in ${region} region (y=${segment.boundingBox.y}, x=${segment.boundingBox.x})`,
          source: "dom",
        }),
      );
    }

    // 6. llm_inference — LLM-Begruendung
    evidence.push(
      EvidenceSchema.parse({
        type: "llm_inference",
        signal: truncateSignal(candidate.reasoning),
        weight: 0.7,
        detail: `LLM (${llmResponse.model}) inferred type="${candidate.type}" with confidence=${candidate.confidence}`,
        source: "llm",
      }),
    );

    logger.debug(
      { candidateType: candidate.type, evidenceCount: evidence.length },
      "Evidence collected",
    );

    return evidence;
  } catch (err) {
    throw new EvidenceCollectionError(
      `Failed to collect evidence for candidate "${candidate.label}": ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined,
    );
  }
}

/**
 * Fasst eine Evidence-Chain zusammen.
 */
export function summarizeEvidence(evidence: Evidence[]): EvidenceSummary {
  if (evidence.length === 0) {
    return {
      totalEvidence: 0,
      strongestSignal: "",
      averageWeight: 0,
      hasContradictions: false,
      contradictions: [],
    };
  }

  // Staerkstes Signal
  const sorted = [...evidence].sort((a, b) => b.weight - a.weight);
  const strongestSignal = sorted[0]!.signal;

  // Gewichteter Durchschnitt
  const totalWeight = evidence.reduce((sum, e) => sum + e.weight, 0);
  const averageWeight = totalWeight / evidence.length;

  // Widersprueche erkennen
  const contradictions = detectContradictions(evidence);

  return {
    totalEvidence: evidence.length,
    strongestSignal,
    averageWeight,
    hasContradictions: contradictions.length > 0,
    contradictions,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/** Extrahiert semantische Labels aus Headings, Buttons, ARIA-Labels */
function extractSemanticLabels(nodes: DomNode[]): string[] {
  const labels: string[] = [];

  function walk(node: DomNode): void {
    const tag = node.tagName.toLowerCase();

    // Headings
    if (/^h[1-6]$/.test(tag) && node.textContent?.trim()) {
      labels.push(node.textContent.trim());
    }

    // Buttons
    if (tag === "button" && node.textContent?.trim()) {
      labels.push(node.textContent.trim());
    }

    // ARIA-Label
    if (node.attributes["aria-label"]) {
      labels.push(node.attributes["aria-label"]);
    }

    for (const child of node.children) {
      walk(child);
    }
  }

  for (const node of nodes) walk(node);
  return [...new Set(labels)];
}

/** Extrahiert ARIA-Rollen */
function extractAriaRoles(nodes: DomNode[]): string[] {
  const roles: string[] = [];

  function walk(node: DomNode): void {
    if (node.attributes["role"]) {
      roles.push(node.attributes["role"]);
    }
    for (const child of node.children) {
      walk(child);
    }
  }

  for (const node of nodes) walk(node);
  return [...new Set(roles)];
}

/** Prueft ob ARIA-Rollen zum Endpoint-Typ passen */
function ariaRolesMatchType(roles: string[], type: string): boolean {
  const roleTypeMap: Record<string, string[]> = {
    navigation: ["navigation", "menubar", "menu"],
    auth: ["form"],
    form: ["form"],
    search: ["search", "searchbox"],
    content: ["main", "article", "region"],
    consent: ["alertdialog", "dialog", "alert"],
  };

  const expectedRoles = roleTypeMap[type] ?? [];
  return roles.some((r) => expectedRoles.includes(r));
}

/** Erkennt strukturelle Muster im DOM */
function detectStructuralPattern(
  nodes: DomNode[],
): { pattern: string; weight: number; description: string } | null {
  for (const node of nodes) {
    const result = detectPatternInNode(node);
    if (result) return result;
  }
  return null;
}

function detectPatternInNode(
  node: DomNode,
): { pattern: string; weight: number; description: string } | null {
  const tag = node.tagName.toLowerCase();

  // form > input + input + button = Login/Form-Pattern
  if (tag === "form") {
    const inputs = countTagsDeep(node, ["input", "textarea", "select"]);
    const buttons = countTagsDeep(node, ["button"]);
    const hasPassword = hasInputType(node, "password");

    if (hasPassword && inputs >= 2 && buttons >= 1) {
      return {
        pattern: "form > input[password] + input + button",
        weight: 0.85,
        description: "Login form pattern: password field + submit button",
      };
    }

    if (inputs >= 1 && buttons >= 1) {
      return {
        pattern: `form > ${inputs} inputs + ${buttons} buttons`,
        weight: 0.7,
        description: `Form pattern with ${inputs} input(s) and ${buttons} button(s)`,
      };
    }
  }

  // nav > ul > li > a = Navigation-Pattern
  if (tag === "nav") {
    const links = countTagsDeep(node, ["a"]);
    if (links >= 2) {
      return {
        pattern: `nav > ${links} links`,
        weight: 0.85,
        description: `Navigation pattern with ${links} links`,
      };
    }
  }

  for (const child of node.children) {
    const result = detectPatternInNode(child);
    if (result) return result;
  }

  return null;
}

/** Zaehlt bestimmte Tags in einem Teilbaum */
function countTagsDeep(node: DomNode, tags: string[]): number {
  let count = 0;
  const lowerTags = tags.map((t) => t.toLowerCase());
  if (lowerTags.includes(node.tagName.toLowerCase())) count++;
  for (const child of node.children) {
    count += countTagsDeep(child, tags);
  }
  return count;
}

/** Prueft ob ein Subtree ein input[type=password] enthaelt */
function hasInputType(node: DomNode, type: string): boolean {
  if (
    node.tagName.toLowerCase() === "input" &&
    node.attributes["type"] === type
  ) {
    return true;
  }
  return node.children.some((child) => hasInputType(child, type));
}

/** Extrahiert relevante Texte die zum Endpoint-Typ passen */
function extractRelevantTexts(nodes: DomNode[], type: string): string[] {
  const keywords: Record<string, string[]> = {
    auth: ["sign in", "log in", "login", "register", "password", "email", "forgot"],
    search: ["search", "find", "look for", "query"],
    checkout: ["checkout", "payment", "pay now", "order", "purchase", "buy"],
    commerce: ["add to cart", "buy now", "price", "wishlist"],
    navigation: ["home", "menu", "about", "contact", "products"],
    support: ["help", "support", "chat", "contact us", "ticket"],
    consent: ["cookie", "consent", "accept", "privacy", "gdpr"],
  };

  const typeKeywords = keywords[type] ?? [];
  if (typeKeywords.length === 0) return [];

  const matches: string[] = [];

  function walk(node: DomNode): void {
    if (node.textContent) {
      const lower = node.textContent.toLowerCase();
      for (const kw of typeKeywords) {
        if (lower.includes(kw)) {
          matches.push(node.textContent.trim().slice(0, 100));
          break;
        }
      }
    }
    for (const child of node.children) walk(child);
  }

  for (const node of nodes) walk(node);
  return [...new Set(matches)];
}

/** Bestimmt die Layout-Region basierend auf Position */
function inferLayoutRegion(y: number, x: number): string {
  if (y < 100) return "header";
  if (y > 800) return "footer";
  if (x < 200) return "sidebar";
  if (x > 900) return "sidebar";
  return "main";
}

/** Prueft ob Layout-Region zum Endpoint-Typ passt */
function layoutRegionMatchesType(region: string, type: string): boolean {
  const expected: Record<string, string[]> = {
    navigation: ["header", "sidebar"],
    auth: ["main", "modal"],
    search: ["header", "main"],
    content: ["main"],
    support: ["footer", "sidebar"],
    consent: ["footer"],
  };
  return (expected[type] ?? ["main"]).includes(region);
}

/** Erkennt Widersprueche in der Evidence-Chain */
function detectContradictions(
  evidence: Evidence[],
): Array<{ signal1: string; signal2: string; description: string }> {
  const contradictions: Array<{
    signal1: string;
    signal2: string;
    description: string;
  }> = [];

  // Vergleiche ARIA-Signale mit LLM-Signalen
  const ariaEvidence = evidence.find((e) => e.type === "aria_role");
  const llmEvidence = evidence.find((e) => e.type === "llm_inference");

  if (ariaEvidence && llmEvidence) {
    // Pruefen ob ARIA-Role und LLM-Typ divergieren
    const ariaSignal = ariaEvidence.signal.toLowerCase();
    const llmSignal = llmEvidence.signal.toLowerCase();

    // Typische Divergenzen
    const ariaImpliesNav =
      ariaSignal.includes("navigation") || ariaSignal.includes("menu");
    const llmImpliesForm =
      llmSignal.includes("form") || llmSignal.includes("auth");

    const ariaImpliesForm = ariaSignal.includes("form");
    const llmImpliesNav =
      llmSignal.includes("navigation") || llmSignal.includes("nav");

    if (
      (ariaImpliesNav && llmImpliesForm) ||
      (ariaImpliesForm && llmImpliesNav)
    ) {
      contradictions.push({
        signal1: `aria_role: ${ariaEvidence.signal}`,
        signal2: `llm_inference: ${llmEvidence.signal}`,
        description:
          "ARIA role and LLM inference suggest different endpoint types",
      });
    }
  }

  return contradictions;
}

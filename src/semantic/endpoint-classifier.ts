/**
 * Endpoint-Classifier: Klassifiziert und bewertet Endpoint-Kandidaten.
 *
 * Kombiniert LLM-Vorschlag mit heuristischen Korrekturen,
 * bestimmt Risk-Level und inferiert Affordances.
 */

import pino from "pino";
import { ClassificationError } from "./errors.js";
import type { UISegment, DomNode, Affordance } from "../../shared_interfaces.js";
import type { EndpointCandidate, ClassifiedEndpoint } from "./types.js";

const logger = pino({ name: "semantic:endpoint-classifier" });

// ============================================================================
// Heuristik-Regeln fuer Typ-Korrektur
// ============================================================================

interface HeuristicRule {
  name: string;
  correctedType: string;
  check(segment: UISegment, candidate: EndpointCandidate): boolean;
}

/**
 * Prueft ob ein Kandidat ueber seine Anchors oder sein Label mit einem bestimmten
 * DOM-Subtree assoziiert ist. Verhindert dass Segment-weite Heuristiken (z.B. search)
 * alle Endpoints in einem mixed-content Segment ueberschreiben.
 */
function candidateMatchesContext(
  candidate: EndpointCandidate,
  patterns: RegExp[],
): boolean {
  const labelLower = candidate.label.toLowerCase();
  const descLower = candidate.description.toLowerCase();

  for (const pat of patterns) {
    if (pat.test(labelLower) || pat.test(descLower)) return true;
  }

  for (const anchor of candidate.anchors) {
    for (const pat of patterns) {
      if (anchor.ariaLabel && pat.test(anchor.ariaLabel.toLowerCase())) return true;
      if (anchor.textContent && pat.test(anchor.textContent.toLowerCase())) return true;
      if (anchor.ariaRole && pat.test(anchor.ariaRole.toLowerCase())) return true;
    }
  }

  return false;
}

/**
 * Prueft ob ein Kandidat NICHT mit bestimmten Kontext-Patterns assoziiert ist.
 * Gibt true zurueck wenn der Kandidat klar zu einer ANDEREN Kategorie gehoert.
 */
function candidateConflictsWithType(
  candidate: EndpointCandidate,
  excludePatterns: RegExp[],
): boolean {
  return candidateMatchesContext(candidate, excludePatterns);
}

/** Patterns die auf Nicht-Search-Endpoints hinweisen */
const NON_SEARCH_PATTERNS: RegExp[] = [
  /\b(cart|basket|bag|checkout)\b/,
  /\b(sign[\s-]?in|log[\s-]?in|sign[\s-]?up|register|account|profile)\b/,
  /\b(menu|categories|departments)\b/,
  /\b(help|support|contact)\b/,
  /\b(wish[\s-]?list|favorites|saved)\b/,
  /\b(orders?|tracking)\b/,
  /\b(store[\s-]?locator|locations?)\b/,
];

/** Patterns die auf Search-Endpoints hinweisen */
const SEARCH_PATTERNS: RegExp[] = [
  /\bsearch\b/,
  /\bfind\b/,
  /\blookup\b/,
  /\bquery\b/,
];

const HEURISTIC_RULES: HeuristicRule[] = [
  {
    name: "password-field-implies-auth",
    correctedType: "auth",
    check: (segment) =>
      hasFormTag(segment.nodes) && hasInputType(segment.nodes, "password"),
  },
  {
    name: "price-with-buy-button-implies-checkout",
    correctedType: "checkout",
    check: (segment) =>
      hasPriceElements(segment.nodes) && hasBuyButton(segment.nodes),
  },
  {
    name: "search-input-implies-search",
    correctedType: "search",
    check: (segment, candidate) => {
      const segmentHasSearch =
        hasInputType(segment.nodes, "search") ||
        hasRoleAttribute(segment.nodes, "search");
      if (!segmentHasSearch) return false;

      // Wenn der Kandidat explizit zu einer anderen Kategorie gehoert,
      // nicht als search ueberschreiben (Target.com-Fix: mixed header segments)
      if (candidateConflictsWithType(candidate, NON_SEARCH_PATTERNS)) {
        return false;
      }

      // Der Kandidat ist entweder explizit search-bezogen oder hat keinen
      // klaren Kontext der dagegen spricht
      return true;
    },
  },
  {
    name: "auth-link-in-header",
    correctedType: "auth",
    check: (_segment, candidate) =>
      candidateMatchesContext(candidate, [
        /\b(sign[\s_-]?in|log[\s_-]?in|sign[\s_-]?up|register|anmelden|einloggen)\b/,
        /\b(account|konto|mein\s+konto)\b/,
      ]),
  },
  {
    name: "cart-link-implies-checkout",
    correctedType: "checkout",
    check: (_segment, candidate) =>
      candidateMatchesContext(candidate, [
        /\b(cart|basket|warenkorb|einkaufswagen|bag)\b/,
        /\b(checkout|kasse|zur\s+kasse)\b/,
      ]),
  },
  {
    name: "nav-root-implies-navigation",
    correctedType: "navigation",
    check: (segment) => hasNavRoot(segment.nodes),
  },
  {
    name: "chat-widget-implies-support",
    correctedType: "support",
    check: (segment) => hasChatWidget(segment.nodes),
  },
  {
    name: "cart-class-implies-checkout",
    correctedType: "checkout",
    check: (segment) =>
      segment.type === "checkout" ||
      segment.nodes.some((n) => findAttrPattern(n, "class", /\b(cart|basket|checkout)\b/i)),
  },
];

// ============================================================================
// Risk-Level-Bestimmung
// ============================================================================

const RISK_LEVELS: Record<string, string> = {
  auth: "high",
  checkout: "high",
  commerce: "high",
  form: "medium",
  consent: "medium",
  settings: "medium",
  navigation: "low",
  content: "low",
  search: "low",
  media: "low",
  social: "low",
  support: "low",
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Klassifiziert einen Endpoint-Kandidaten.
 * Wendet Heuristiken an, bestimmt Risk-Level und berechnet kombinierte Confidence.
 */
export function classifyEndpoint(
  candidate: EndpointCandidate,
  segment: UISegment,
): ClassifiedEndpoint {
  try {
    let correctedType: string | undefined;
    let heuristicConfidence = 0;

    // Heuristik-basierte Korrektur
    for (const rule of HEURISTIC_RULES) {
      if (rule.check(segment, candidate)) {
        // Nur korrigieren wenn LLM-Typ nicht bereits korrekt ist
        if (candidate.type !== rule.correctedType) {
          logger.debug(
            {
              candidateType: candidate.type,
              correctedType: rule.correctedType,
              rule: rule.name,
            },
            "Heuristic corrected endpoint type",
          );
          correctedType = rule.correctedType;
          heuristicConfidence = 0.85;
          break;
        } else {
          // LLM und Heuristik stimmen ueberein — staerkt Confidence
          heuristicConfidence = 0.9;
          break;
        }
      }
    }

    // Falls keine Heuristik griff, moderate Confidence
    if (heuristicConfidence === 0) {
      heuristicConfidence = 0.5;
    }

    // Effektiver Typ
    const effectiveType = correctedType ?? candidate.type;

    // Risk-Level
    const riskLevel = RISK_LEVELS[effectiveType] ?? "medium";

    // Kombinierte Confidence: gewichteter Durchschnitt
    const combinedConfidence = Math.min(
      1.0,
      candidate.confidence * 0.6 + heuristicConfidence * 0.4,
    );

    return {
      ...candidate,
      correctedType,
      riskLevel,
      heuristicConfidence,
      combinedConfidence,
    };
  } catch (err) {
    throw new ClassificationError(
      `Failed to classify endpoint "${candidate.label}": ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined,
    );
  }
}

/**
 * Inferiert Affordances (moegliche Aktionen) aus einem Endpoint-Kandidaten und dem Segment.
 */
export function inferAffordances(
  candidate: EndpointCandidate,
  segment: UISegment,
): Affordance[] {
  const affordances: Affordance[] = [];
  const effectiveType = candidate.type;

  // Seiteneffekte und Confirmation basierend auf Typ
  const isHighRisk = ["auth", "checkout", "commerce"].includes(effectiveType);

  // Aus dem DOM inferieren
  for (const node of segment.nodes) {
    collectAffordancesFromNode(node, affordances, isHighRisk);
  }

  // Deduplizieren nach Typ
  const seen = new Set<string>();
  return affordances.filter((a) => {
    const key = `${a.type}:${a.expectedOutcome}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================================
// Helpers — DOM-Analyse
// ============================================================================

function hasFormTag(nodes: DomNode[]): boolean {
  return nodes.some((n) => findTag(n, "form"));
}

function hasInputType(nodes: DomNode[], type: string): boolean {
  return nodes.some((n) => findInputWithType(n, type));
}

function hasRoleAttribute(nodes: DomNode[], role: string): boolean {
  return nodes.some((n) => findRole(n, role));
}

function hasNavRoot(nodes: DomNode[]): boolean {
  return nodes.some(
    (n) =>
      n.tagName.toLowerCase() === "nav" ||
      n.attributes["role"] === "navigation",
  );
}

function hasPriceElements(nodes: DomNode[]): boolean {
  return nodes.some((n) => findTextPattern(n, /[\$€£]\s*\d+|\d+[.,]\d{2}/));
}

function hasBuyButton(nodes: DomNode[]): boolean {
  return nodes.some((n) =>
    findTextPattern(n, /buy|add to cart|purchase|checkout/i),
  );
}

function hasChatWidget(nodes: DomNode[]): boolean {
  return nodes.some(
    (n) =>
      findTextPattern(n, /live chat|chat with us|start chat/i) ||
      findAttrPattern(n, "class", /chat-widget|livechat|intercom|crisp/i),
  );
}

function findTag(node: DomNode, tag: string): boolean {
  if (node.tagName.toLowerCase() === tag) return true;
  return node.children.some((c) => findTag(c, tag));
}

function findInputWithType(node: DomNode, type: string): boolean {
  if (
    node.tagName.toLowerCase() === "input" &&
    node.attributes["type"] === type
  ) {
    return true;
  }
  return node.children.some((c) => findInputWithType(c, type));
}

function findRole(node: DomNode, role: string): boolean {
  if (node.attributes["role"] === role) return true;
  return node.children.some((c) => findRole(c, role));
}

function findTextPattern(node: DomNode, pattern: RegExp): boolean {
  if (node.textContent && pattern.test(node.textContent)) return true;
  return node.children.some((c) => findTextPattern(c, pattern));
}

function findAttrPattern(
  node: DomNode,
  attr: string,
  pattern: RegExp,
): boolean {
  const val = node.attributes[attr];
  if (val && pattern.test(val)) return true;
  return node.children.some((c) => findAttrPattern(c, attr, pattern));
}

// ============================================================================
// Helpers — Affordance-Inferenz
// ============================================================================

function collectAffordancesFromNode(
  node: DomNode,
  affordances: Affordance[],
  isHighRisk: boolean,
): void {
  const tag = node.tagName.toLowerCase();

  if (tag === "button" || (tag === "input" && node.attributes["type"] === "submit")) {
    affordances.push({
      type: node.attributes["type"] === "submit" ? "submit" : "click",
      expectedOutcome: node.textContent?.trim() ?? "Button action",
      sideEffects: isHighRisk ? ["state_change"] : [],
      reversible: !isHighRisk,
      requiresConfirmation: isHighRisk,
    });
  }

  if (tag === "input" && node.attributes["type"] !== "submit" && node.attributes["type"] !== "hidden") {
    const inputType = node.attributes["type"] ?? "text";

    if (inputType === "checkbox" || inputType === "radio") {
      affordances.push({
        type: "toggle",
        expectedOutcome: node.attributes["aria-label"] ?? "Toggle option",
        sideEffects: [],
        reversible: true,
        requiresConfirmation: false,
      });
    } else if (inputType === "file") {
      affordances.push({
        type: "upload",
        expectedOutcome: "Upload file",
        sideEffects: ["file_transfer"],
        reversible: false,
        requiresConfirmation: true,
      });
    } else {
      affordances.push({
        type: "fill",
        expectedOutcome:
          node.attributes["placeholder"] ??
          node.attributes["aria-label"] ??
          `Fill ${inputType} field`,
        sideEffects: [],
        reversible: true,
        requiresConfirmation: false,
      });
    }
  }

  if (tag === "textarea") {
    affordances.push({
      type: "fill",
      expectedOutcome:
        node.attributes["placeholder"] ?? "Enter text",
      sideEffects: [],
      reversible: true,
      requiresConfirmation: false,
    });
  }

  if (tag === "select") {
    affordances.push({
      type: "select",
      expectedOutcome: node.attributes["aria-label"] ?? "Select option",
      sideEffects: [],
      reversible: true,
      requiresConfirmation: false,
    });
  }

  if (tag === "a") {
    affordances.push({
      type: "navigate",
      expectedOutcome: node.textContent?.trim() ?? "Navigate to link",
      sideEffects: ["navigation"],
      reversible: true,
      requiresConfirmation: false,
    });
  }

  for (const child of node.children) {
    collectAffordancesFromNode(child, affordances, isHighRisk);
  }
}

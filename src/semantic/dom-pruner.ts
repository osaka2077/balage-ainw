/**
 * DOM-Pruner: Bereitet UI-Segmente fuer LLM-Input auf.
 *
 * Entfernt irrelevante DOM-Elemente, komprimiert Text und
 * serialisiert als kompaktes Text-Format fuer das LLM.
 * Beachtet konfigurierbares Token-Budget.
 */

import pino from "pino";
import { DomPruningError } from "./errors.js";
import type { DomNode, UISegment } from "../../shared_interfaces.js";
import type { PrunedSegment, PruneForLLMOptions } from "./types.js";

const logger = pino({ level: process.env["LOG_LEVEL"] ?? "silent", name: "semantic:dom-pruner" });

/** data-* Attribute mit semantischer Bedeutung (immer behalten) */
const SEMANTIC_DATA_ATTRS = new Set(["data-testid", "data-action", "data-type"]);

/** Dekorative / irrelevante Tags die entfernt werden */
const DECORATIVE_TAGS = new Set([
  "svg", "path", "circle", "rect", "line", "polyline", "polygon",
  "style", "script", "noscript", "br", "hr", "wbr",
]);

/** Interaktive Tags die IMMER behalten werden */
const INTERACTIVE_TAGS = new Set([
  "a", "button", "input", "select", "textarea", "option",
  "details", "summary", "dialog", "label",
]);

/** Strukturelle Tags die fuer Hierarchie behalten werden */
const STRUCTURAL_TAGS = new Set([
  "form", "fieldset", "legend", "nav", "main", "header", "footer",
  "section", "article", "aside", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
]);

/**
 * Pruned DOM-Segment fuer LLM-Input optimieren.
 *
 * Strategie:
 * 1. Dekorative Elemente entfernen
 * 2. Irrelevante Attribute strippen
 * 3. Lange Texte kuerzen
 * 4. Listen begrenzen
 * 5. Kompaktes Text-Format serialisieren
 * 6. Token-Budget einhalten
 */
export function pruneForLLM(
  segment: UISegment,
  options?: PruneForLLMOptions,
): PrunedSegment {
  const maxTokens = options?.maxTokens ?? 4000;
  const preserveDataAttrs = new Set([
    ...SEMANTIC_DATA_ATTRS,
    ...(options?.preserveDataAttributes ?? []),
  ]);
  const maxTextLength = options?.maxTextLength ?? 200;
  const maxListItems = options?.maxListItems ?? 5;

  try {
    let preservedElements = 0;
    let removedElements = 0;

    /** Pruned einen einzelnen DomNode rekursiv */
    function pruneNode(
      node: DomNode,
      depth: number,
    ): string | null {
      // Dekorative Tags komplett entfernen
      if (DECORATIVE_TAGS.has(node.tagName.toLowerCase())) {
        removedElements += 1 + countDescendants(node);
        return null;
      }

      // Unsichtbare Elemente entfernen (ausser interaktive)
      if (
        !node.isVisible &&
        !INTERACTIVE_TAGS.has(node.tagName.toLowerCase()) &&
        !node.isInteractive
      ) {
        removedElements += 1 + countDescendants(node);
        return null;
      }

      // Leere Div/Span ohne Kinder oder Text (Spacer) entfernen
      const tag = node.tagName.toLowerCase();
      if (
        (tag === "div" || tag === "span") &&
        !node.textContent?.trim() &&
        node.children.length === 0 &&
        !node.isInteractive &&
        !hasSemanticAttributes(node, preserveDataAttrs)
      ) {
        removedElements++;
        return null;
      }

      preservedElements++;

      const indent = "  ".repeat(depth);
      const parts: string[] = [];

      // Tag + relevante Attribute
      const attrs = buildAttributeString(node, preserveDataAttrs);
      const tagDisplay = node.tagName.toUpperCase();

      // Kinder verarbeiten
      let children = node.children;

      // Listen begrenzen (ul/ol mit vielen li)
      if ((tag === "ul" || tag === "ol") && children.length > maxListItems) {
        const truncatedCount = children.length - maxListItems;
        children = children.slice(0, maxListItems);
        const childTexts = children
          .map((child) => pruneNode(child, depth + 1))
          .filter((t): t is string => t !== null);

        const textContent = truncateText(node.textContent, maxTextLength);
        const nodeStr = textContent
          ? `${indent}${tagDisplay}${attrs}: ${textContent}`
          : `${indent}${tagDisplay}${attrs}`;
        parts.push(nodeStr);
        parts.push(...childTexts);
        parts.push(`${indent}  [...${truncatedCount} more]`);
        return parts.join("\n");
      }

      // Text-Content kuerzen
      const textContent = truncateText(node.textContent, maxTextLength);

      // Node-Zeile bauen
      const nodeStr = textContent
        ? `${indent}${tagDisplay}${attrs}: ${textContent}`
        : `${indent}${tagDisplay}${attrs}`;
      parts.push(nodeStr);

      // Kinder rekursiv verarbeiten
      for (const child of children) {
        const childStr = pruneNode(child, depth + 1);
        if (childStr !== null) {
          parts.push(childStr);
        }
      }

      return parts.join("\n");
    }

    // Alle Nodes des Segments verarbeiten
    const segmentLines: string[] = [];
    segmentLines.push(
      `SEGMENT [${segment.type}] confidence=${segment.confidence.toFixed(2)}`,
    );
    if (segment.label) {
      segmentLines.push(`  Label: ${segment.label}`);
    }
    if (segment.semanticRole) {
      segmentLines.push(`  Role: ${segment.semanticRole}`);
    }

    for (const node of segment.nodes) {
      const pruned = pruneNode(node, 1);
      if (pruned !== null) {
        segmentLines.push(pruned);
      }
    }

    let textRepresentation = segmentLines.join("\n");
    let estimatedTokens = estimateTokenCount(textRepresentation);

    // Token-Budget: aggressiver kuerzen wenn noetig
    if (estimatedTokens > maxTokens) {
      logger.debug(
        { estimatedTokens, maxTokens, segmentId: segment.id },
        "Token budget exceeded, truncating",
      );
      const suffix = "\n[...truncated]";
      const maxChars = maxTokens * 4 - suffix.length;
      textRepresentation = textRepresentation.slice(0, maxChars) + suffix;
      estimatedTokens = estimateTokenCount(textRepresentation);
    }

    logger.debug(
      {
        segmentId: segment.id,
        estimatedTokens,
        preservedElements,
        removedElements,
      },
      "DOM pruning complete",
    );

    return {
      segmentId: segment.id,
      segmentType: segment.type,
      textRepresentation,
      estimatedTokens,
      preservedElements,
      removedElements,
    };
  } catch (err) {
    throw new DomPruningError(
      `Failed to prune segment ${segment.id}: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined,
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Token-Schaetzung: text.length / 4 (Heuristik fuer englischen Text) */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Zaehlt alle Nachkommen eines Nodes */
function countDescendants(node: DomNode): number {
  let count = 0;
  for (const child of node.children) {
    count += 1 + countDescendants(child);
  }
  return count;
}

/** Prueft ob ein Node semantische Attribute hat */
function hasSemanticAttributes(
  node: DomNode,
  preserveDataAttrs: Set<string>,
): boolean {
  for (const key of Object.keys(node.attributes)) {
    if (key.startsWith("aria-")) return true;
    if (key === "role") return true;
    if (preserveDataAttrs.has(key)) return true;
  }
  return false;
}

/** Baut einen kompakten Attribute-String */
function buildAttributeString(
  node: DomNode,
  preserveDataAttrs: Set<string>,
): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(node.attributes)) {
    // Style-Attribute entfernen
    if (key === "style" || key === "class") continue;

    // data-* Attribute nur behalten wenn semantisch
    if (key.startsWith("data-") && !preserveDataAttrs.has(key)) continue;

    // Leere Attribute ueberspringen
    if (!value && value !== "") continue;

    if (key === "type" || key === "role" || key === "placeholder") {
      parts.push(`${key}=${value}`);
    } else if (key.startsWith("aria-")) {
      parts.push(`${key}="${value}"`);
    } else if (key === "required" || key === "disabled" || key === "checked") {
      parts.push(key);
    } else if (key === "href" || key === "action" || key === "method") {
      parts.push(`${key}="${value}"`);
    } else if (preserveDataAttrs.has(key)) {
      parts.push(`${key}="${value}"`);
    }
  }

  return parts.length > 0 ? `[${parts.join(", ")}]` : "";
}

/** Kuerzt Text auf maxLength mit [...]-Marker */
function truncateText(
  text: string | undefined,
  maxLength: number,
): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength) + " [...]";
}

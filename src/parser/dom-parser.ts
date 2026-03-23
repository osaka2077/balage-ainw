/**
 * DOM Parser — Normalisiert den rohen DomNode-Baum
 *
 * Entfernt leere Text-Nodes, normalisiert Whitespace,
 * erkennt semantische HTML5-Elemente und preserviert data-* Attribute.
 */

import pino from "pino";
import { DomNodeSchema } from "../../shared_interfaces.js";
import type { DomNode } from "../../shared_interfaces.js";
import type { ParsedDom, DomParserOptions } from "./types.js";
import { DomParseError } from "./errors.js";

const logger = pino({ level: process.env["LOG_LEVEL"] ?? "silent", name: "parser:dom-parser" });

/** HTML5 semantische Elemente die als Landmarks/Struktur dienen */
const SEMANTIC_ELEMENTS = new Set([
  "header",
  "nav",
  "main",
  "section",
  "article",
  "aside",
  "footer",
  "figure",
  "figcaption",
  "details",
  "summary",
  "dialog",
  "form",
  "table",
]);

const DEFAULT_MAX_DEPTH = 50;

/**
 * Prueft ob ein Text-Content leer oder nur Whitespace ist.
 * Pure function.
 */
function isWhitespaceOnly(text: string | undefined): boolean {
  if (text === undefined || text === null) return true;
  return text.trim().length === 0;
}

/**
 * Normalisiert einen einzelnen DomNode und seine Kinder rekursiv.
 * Pure function — erstellt einen neuen Baum, veraendert den Input nicht.
 */
function normalizeNode(
  node: DomNode,
  depth: number,
  maxDepth: number,
  semanticElements: Map<string, DomNode[]>,
  stats: { nodeCount: number; maxDepth: number }
): DomNode {
  stats.nodeCount++;
  if (depth > stats.maxDepth) {
    stats.maxDepth = depth;
  }

  // Tiefenlimit erreicht — Kinder abschneiden
  if (depth >= maxDepth) {
    logger.warn(
      { tagName: node.tagName, depth },
      "Maximale Parse-Tiefe erreicht, Kinder werden abgeschnitten"
    );
    const truncated: DomNode = {
      ...node,
      children: [],
    };
    trackSemanticElement(truncated, semanticElements);
    return truncated;
  }

  // Kinder normalisieren: leere Text-Nodes und Whitespace-only Nodes entfernen
  const normalizedChildren: DomNode[] = [];
  for (const child of node.children) {
    // Text-Nodes (tagName "#text") die nur Whitespace enthalten => ueberspringen
    if (child.tagName === "#text" && isWhitespaceOnly(child.textContent)) {
      continue;
    }

    // Leere Text-Nodes ohne Content => ueberspringen
    if (child.tagName === "#text" && (child.textContent === undefined || child.textContent === "")) {
      continue;
    }

    normalizedChildren.push(
      normalizeNode(child, depth + 1, maxDepth, semanticElements, stats)
    );
  }

  const normalizedNode: DomNode = {
    ...node,
    // Whitespace in textContent normalisieren (aber nicht entfernen)
    textContent: node.textContent !== undefined ? node.textContent.trim() || undefined : undefined,
    children: normalizedChildren,
  };

  trackSemanticElement(normalizedNode, semanticElements);
  return normalizedNode;
}

/**
 * Trackt semantische HTML5-Elemente in der Map.
 */
function trackSemanticElement(
  node: DomNode,
  semanticElements: Map<string, DomNode[]>
): void {
  const tag = node.tagName.toLowerCase();
  if (SEMANTIC_ELEMENTS.has(tag)) {
    const existing = semanticElements.get(tag);
    if (existing) {
      existing.push(node);
    } else {
      semanticElements.set(tag, [node]);
    }
  }
}

/**
 * Validiert die Grundstruktur eines DomNode.
 * Wirft DomParseError bei fehlenden Pflichtfeldern.
 */
function validateDomNode(node: unknown): DomNode {
  const result = DomNodeSchema.safeParse(node);
  if (!result.success) {
    throw new DomParseError(
      `Malformed DomNode: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`
    );
  }
  return result.data;
}

/**
 * Parst und normalisiert einen rohen DomNode-Baum.
 *
 * - Whitespace-only Text-Nodes werden entfernt
 * - Leere Text-Nodes werden entfernt
 * - Semantische HTML5-Elemente werden erkannt und gesammelt
 * - data-* Attribute bleiben erhalten
 * - Maximale Parse-Tiefe ist konfigurierbar (Default: 50)
 *
 * @param rawDom - Der rohe DomNode-Baum aus Layer 1
 * @param options - Optionale Konfiguration
 * @returns ParsedDom mit normalisiertem Baum und Metadaten
 * @throws DomParseError bei malformed Input
 */
export function parseDom(rawDom: DomNode, options?: DomParserOptions): ParsedDom {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;

  // Input validieren
  const validatedRoot = validateDomNode(rawDom);

  const semanticElements = new Map<string, DomNode[]>();
  const stats = { nodeCount: 0, maxDepth: 0 };

  const root = normalizeNode(validatedRoot, 0, maxDepth, semanticElements, stats);

  logger.info(
    {
      nodeCount: stats.nodeCount,
      maxDepth: stats.maxDepth,
      semanticElementTypes: Array.from(semanticElements.keys()),
    },
    "DOM erfolgreich geparst"
  );

  return {
    root,
    nodeCount: stats.nodeCount,
    maxDepth: stats.maxDepth,
    semanticElements,
  };
}

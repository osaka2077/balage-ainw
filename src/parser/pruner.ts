/**
 * DOM Pruner — Entfernt irrelevante DOM-Teile
 *
 * Entfernt: scripts, styles, noscript, leere Container, Kommentare.
 * Erhaelt: ARIA-Attribute, data-* Attribute, Screen-Reader-relevante Elemente.
 *
 * Wichtige Regel: display:none allein reicht NICHT zum Entfernen.
 * Nur wenn SOWOHL display:none ALS AUCH aria-hidden="true" zutreffen,
 * wird ein Element entfernt.
 */

import pino from "pino";
import type { DomNode } from "../../shared_interfaces.js";
import type { PruneResult } from "./types.js";
import { PruningError } from "./errors.js";

const logger = pino({ name: "parser:pruner" });

/** Tags die immer entfernt werden */
const REMOVABLE_TAGS = new Set([
  "script",
  "style",
  "noscript",
]);

/** Interaktive Tags die niemals als "leerer Container" entfernt werden */
const INTERACTIVE_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "details",
  "summary",
]);

/**
 * Prueft ob ein Node ein Kommentar-Node ist.
 */
function isComment(node: DomNode): boolean {
  return node.tagName === "#comment";
}

/**
 * Prueft ob ein Node ein <link rel="stylesheet"> ist.
 */
function isStylesheetLink(node: DomNode): boolean {
  return (
    node.tagName.toLowerCase() === "link" &&
    node.attributes["rel"]?.toLowerCase() === "stylesheet"
  );
}

/**
 * Prueft ob ein Node display:none UND aria-hidden="true" hat.
 * Beide Bedingungen muessen zutreffen.
 */
function isHiddenAndAriaHidden(node: DomNode): boolean {
  const isDisplayNone =
    node.computedStyles?.display === "none" || !node.isVisible;
  const isAriaHidden = node.attributes["aria-hidden"] === "true";

  // Beide Bedingungen muessen zutreffen
  return isDisplayNone && isAriaHidden;
}

/**
 * Prueft ob ein Node ein leerer Container ist:
 * Kein Text, keine interaktiven Kinder.
 */
function isEmptyContainer(node: DomNode): boolean {
  // Text-Nodes sind keine Container
  if (node.tagName === "#text") return false;

  // Hat eigenen Text-Content => nicht leer
  if (node.textContent !== undefined && node.textContent.trim().length > 0) {
    return false;
  }

  // Ist selbst interaktiv => nicht leer
  if (node.isInteractive || INTERACTIVE_TAGS.has(node.tagName.toLowerCase())) {
    return false;
  }

  // Hat ARIA-Attribute => potenziell relevant, behalten
  const hasAriaAttr = Object.keys(node.attributes).some(
    (key) => key.startsWith("aria-") || key === "role"
  );
  if (hasAriaAttr) return false;

  // Hat data-* Attribute => potenziell relevant, behalten
  const hasDataAttr = Object.keys(node.attributes).some((key) =>
    key.startsWith("data-")
  );
  if (hasDataAttr) return false;

  // Keine Kinder => leer
  if (node.children.length === 0) return true;

  // Alle Kinder pruefen: wenn keins Text oder interaktiv hat => leer
  return node.children.every((child) => isEmptyContainer(child));
}

/**
 * Prueft ob ein Node ARIA-Attribute hat.
 * Solche Nodes werden nicht als leere Container entfernt.
 */
function hasAriaAttributes(node: DomNode): boolean {
  return Object.keys(node.attributes).some(
    (key) => key.startsWith("aria-") || key === "role"
  );
}

/**
 * Pruent einen Node und seine Kinder rekursiv.
 * Erstellt einen neuen Baum (pure function).
 *
 * @returns Der geprunte Node oder null wenn der Node entfernt werden soll
 */
function pruneNode(
  node: DomNode,
  reasons: Record<string, number>
): DomNode | null {
  const tag = node.tagName.toLowerCase();

  // 1. Script, Style, Noscript entfernen
  if (REMOVABLE_TAGS.has(tag)) {
    reasons["script_style_noscript"] = (reasons["script_style_noscript"] ?? 0) + 1;
    return null;
  }

  // 2. Stylesheet Links entfernen
  if (isStylesheetLink(node)) {
    reasons["stylesheet_link"] = (reasons["stylesheet_link"] ?? 0) + 1;
    return null;
  }

  // 3. Kommentar-Nodes entfernen
  if (isComment(node)) {
    reasons["comment"] = (reasons["comment"] ?? 0) + 1;
    return null;
  }

  // 4. display:none UND aria-hidden="true" entfernen
  // NICHT entfernen: nur display:none (Screen-Reader relevant)
  // NICHT entfernen: nur aria-hidden="true" (sichtbar, Bug im HTML)
  if (isHiddenAndAriaHidden(node)) {
    reasons["hidden_and_aria_hidden"] = (reasons["hidden_and_aria_hidden"] ?? 0) + 1;
    return null;
  }

  // 5. Kinder rekursiv prunen
  const prunedChildren: DomNode[] = [];
  for (const child of node.children) {
    const prunedChild = pruneNode(child, reasons);
    if (prunedChild !== null) {
      prunedChildren.push(prunedChild);
    }
  }

  // 6. Leere Container entfernen (nach Pruning der Kinder)
  // Wichtig: Nur pruefen nachdem Kinder geprunet wurden
  const nodeWithPrunedChildren: DomNode = {
    ...node,
    children: prunedChildren,
  };

  if (isEmptyContainer(nodeWithPrunedChildren) && !hasAriaAttributes(nodeWithPrunedChildren)) {
    reasons["empty_container"] = (reasons["empty_container"] ?? 0) + 1;
    return null;
  }

  return nodeWithPrunedChildren;
}

/**
 * Zaehlt alle Nodes in einem Baum.
 */
function countNodes(node: DomNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

/**
 * Pruent den DOM-Baum und entfernt irrelevante Teile.
 *
 * Entfernt:
 * - <script>, <style>, <noscript>
 * - <link rel="stylesheet">
 * - Elemente mit display:none UND aria-hidden="true"
 * - Leere Container ohne Text und ohne interaktive Kinder
 * - Kommentar-Nodes
 *
 * Erhaelt:
 * - Alle data-* Attribute
 * - Alle ARIA-Attribute
 * - Elemente die nur display:none haben (Screen-Reader relevant)
 * - Elemente die nur aria-hidden="true" haben (sichtbar, Bug im HTML)
 *
 * @param dom - Der DomNode-Baum
 * @returns PruneResult mit bereinigtem Baum und Statistiken
 * @throws PruningError bei schwerwiegenden Fehlern
 */
export function pruneDom(dom: DomNode): PruneResult {
  try {
    const originalCount = countNodes(dom);
    const reasons: Record<string, number> = {};

    const prunedRoot = pruneNode(dom, reasons);

    // Falls der Root selbst geprunet wurde (sollte nicht passieren),
    // leeren Root zurueckgeben
    const resultRoot: DomNode = prunedRoot ?? {
      tagName: "div",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      children: [],
    };

    const prunedCount = countNodes(resultRoot);
    const removedCount = originalCount - prunedCount;

    logger.info(
      {
        originalCount,
        prunedCount,
        removedCount,
        reasons,
      },
      "DOM-Pruning abgeschlossen"
    );

    return {
      prunedDom: resultRoot,
      removedCount,
      removedByReason: reasons,
    };
  } catch (error) {
    if (error instanceof PruningError) {
      throw error;
    }
    throw new PruningError(
      `DOM-Pruning fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

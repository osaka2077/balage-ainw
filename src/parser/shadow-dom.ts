/**
 * Shadow DOM Traversal — Identifiziert und integriert Shadow Roots
 *
 * Open Shadow DOM: Inhalt wird in den Baum eingehaengt.
 * Closed Shadow DOM: Marker-Node wird eingefuegt.
 * Verschachtelte Shadow DOMs werden rekursiv behandelt.
 */

import pino from "pino";
import type { DomNode } from "../../shared_interfaces.js";
import { ShadowDomError } from "./errors.js";

const logger = pino({ name: "parser:shadow-dom" });

/** Marker-Tag fuer geschlossene Shadow Roots */
const CLOSED_SHADOW_TAG = "#shadow-root-closed";

/**
 * Prueft ob ein Node ein Shadow Root Host ist.
 * Konvention: Shadow Root Hosts haben ein data-shadow-root Attribut
 * oder ein shadowRoot Property (simuliert als Kinder mit tagName "#shadow-root").
 */
function isShadowRootHost(node: DomNode): boolean {
  const shadowAttr = node.attributes["data-shadow-root"];
  if (shadowAttr === "open" || shadowAttr === "closed") {
    return true;
  }

  // Alternative Erkennung: Kinder mit #shadow-root Tag
  return node.children.some(
    (child) =>
      child.tagName === "#shadow-root-open" ||
      child.tagName === "#shadow-root-closed"
  );
}

/**
 * Ermittelt den Shadow-Root-Modus eines Host-Elements.
 */
function getShadowMode(node: DomNode): "open" | "closed" | null {
  const shadowAttr = node.attributes["data-shadow-root"];
  if (shadowAttr === "open" || shadowAttr === "closed") {
    return shadowAttr;
  }

  for (const child of node.children) {
    if (child.tagName === "#shadow-root-open") return "open";
    if (child.tagName === "#shadow-root-closed") return "closed";
  }

  return null;
}

/**
 * Extrahiert den Shadow Root Content aus den Kindern eines Host-Elements.
 * Shadow Root Content sind die Kinder des #shadow-root-* Nodes.
 */
function extractShadowContent(node: DomNode): DomNode[] {
  const shadowContent: DomNode[] = [];
  const regularChildren: DomNode[] = [];

  for (const child of node.children) {
    if (
      child.tagName === "#shadow-root-open" ||
      child.tagName === "#shadow-root-closed"
    ) {
      // Shadow Root gefunden — dessen Kinder sind der Shadow Content
      shadowContent.push(...child.children);
    } else {
      regularChildren.push(child);
    }
  }

  // Shadow Content kommt vor den regulaeren Kindern (Light DOM)
  return [...shadowContent, ...regularChildren];
}

/**
 * Erstellt einen Marker-Node fuer geschlossene Shadow Roots.
 */
function createClosedMarker(): DomNode {
  return {
    tagName: CLOSED_SHADOW_TAG,
    attributes: {},
    textContent: "[Shadow Root: closed — Inhalt nicht zugaenglich]",
    isVisible: false,
    isInteractive: false,
    children: [],
  };
}

/**
 * Traversiert einen Node-Baum und integriert Shadow Roots.
 * Rekursiv: Shadow DOMs koennen verschachtelt sein.
 *
 * @param node - Der aktuelle Node
 * @param depth - Aktuelle Rekursionstiefe (Schutz vor Endlosschleifen)
 * @param stats - Zaehler fuer Logging
 * @returns Neuer Node mit integrierten Shadow Roots
 */
function traverseNode(
  node: DomNode,
  depth: number,
  stats: { openCount: number; closedCount: number }
): DomNode {
  // Schutz vor Endlosschleifen bei zirkulaeren Referenzen
  if (depth > 100) {
    logger.warn(
      { tagName: node.tagName, depth },
      "Shadow DOM Traversal: maximale Tiefe ueberschritten"
    );
    return node;
  }

  if (!isShadowRootHost(node)) {
    // Kein Shadow Host — nur Kinder rekursiv traversieren
    const newChildren = node.children.map((child) =>
      traverseNode(child, depth + 1, stats)
    );
    return { ...node, children: newChildren };
  }

  const mode = getShadowMode(node);

  if (mode === "open") {
    stats.openCount++;

    // Open Shadow DOM: Inhalt in den Baum integrieren
    const shadowChildren = extractShadowContent(node);

    // Host-Element mit Shadow Root Attribut markieren
    const newAttributes = {
      ...node.attributes,
      "data-shadow-root": "open",
    };

    // Shadow-Content-Kinder rekursiv traversieren (verschachtelte Shadow DOMs)
    const traversedChildren = shadowChildren.map((child) =>
      traverseNode(child, depth + 1, stats)
    );

    return {
      ...node,
      attributes: newAttributes,
      children: traversedChildren,
    };
  }

  if (mode === "closed") {
    stats.closedCount++;

    // Closed Shadow DOM: Marker-Node einfuegen
    const newAttributes = {
      ...node.attributes,
      "data-shadow-root": "closed",
    };

    // Regulaere Kinder (Light DOM) behalten, Marker fuer Closed Shadow einfuegen
    const regularChildren = node.children.filter(
      (child) =>
        child.tagName !== "#shadow-root-open" &&
        child.tagName !== "#shadow-root-closed"
    );

    const traversedRegularChildren = regularChildren.map((child) =>
      traverseNode(child, depth + 1, stats)
    );

    return {
      ...node,
      attributes: newAttributes,
      children: [createClosedMarker(), ...traversedRegularChildren],
    };
  }

  // Kein gueltiger Mode — Node unveraendert zurueckgeben, nur Kinder traversieren
  const newChildren = node.children.map((child) =>
    traverseNode(child, depth + 1, stats)
  );
  return { ...node, children: newChildren };
}

/**
 * Traversiert den DOM-Baum und integriert Shadow DOM Roots.
 *
 * - Open Shadow DOM: Inhalt wird als Kinder des Host-Elements eingehaengt
 * - Closed Shadow DOM: Marker-Node wird eingefuegt
 * - Verschachtelte Shadow DOMs werden rekursiv traversiert
 * - Host-Elemente werden mit data-shadow-root="open"|"closed" markiert
 *
 * @param dom - Der DomNode-Baum
 * @returns Neuer DomNode-Baum mit integrierten Shadow Roots
 * @throws ShadowDomError bei schwerwiegenden Fehlern
 */
export function traverseShadowRoots(dom: DomNode): DomNode {
  try {
    const stats = { openCount: 0, closedCount: 0 };
    const result = traverseNode(dom, 0, stats);

    logger.info(
      {
        openShadowRoots: stats.openCount,
        closedShadowRoots: stats.closedCount,
      },
      "Shadow DOM Traversal abgeschlossen"
    );

    return result;
  } catch (error) {
    if (error instanceof ShadowDomError) {
      throw error;
    }
    throw new ShadowDomError(
      `Shadow DOM Traversal fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

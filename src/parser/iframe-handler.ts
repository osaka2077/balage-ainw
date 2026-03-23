/**
 * iframe Handler — Integriert iframe-Inhalte in die Gesamtstruktur
 *
 * Same-Origin iframes: Vollstaendig integriert.
 * Cross-Origin iframes: Nur Metadaten behalten.
 * Tracking-Pixel iframes: Als unsichtbar markiert.
 */

import pino from "pino";
import type { DomNode } from "../../shared_interfaces.js";
import { IframeIntegrationError } from "./errors.js";

const logger = pino({ level: process.env["LOG_LEVEL"] ?? "silent", name: "parser:iframe-handler" });

/** Marker-Tag fuer Cross-Origin iframe Content */
const CROSS_ORIGIN_MARKER_TAG = "#iframe-cross-origin";

/** Typische Tracking-Pixel Groessen */
const TRACKING_PIXEL_MAX_SIZE = 3;

/**
 * Prueft ob ein Node ein iframe-Element ist.
 */
function isIframe(node: DomNode): boolean {
  return node.tagName.toLowerCase() === "iframe";
}

/**
 * Prueft ob ein iframe ein Tracking-Pixel ist (unsichtbar klein).
 */
function isTrackingPixel(node: DomNode): boolean {
  if (node.boundingBox !== undefined) {
    return (
      node.boundingBox.width <= TRACKING_PIXEL_MAX_SIZE &&
      node.boundingBox.height <= TRACKING_PIXEL_MAX_SIZE
    );
  }

  // Alternativ: width/height Attribute pruefen
  const width = parseInt(node.attributes["width"] ?? "", 10);
  const height = parseInt(node.attributes["height"] ?? "", 10);

  if (!isNaN(width) && !isNaN(height)) {
    return width <= TRACKING_PIXEL_MAX_SIZE && height <= TRACKING_PIXEL_MAX_SIZE;
  }

  return false;
}

/**
 * Erstellt einen Marker-Node fuer Cross-Origin iframe Content.
 */
function createCrossOriginMarker(iframeNode: DomNode): DomNode {
  const src = iframeNode.attributes["src"] ?? "unknown";
  const title = iframeNode.attributes["title"] ?? "";

  return {
    tagName: CROSS_ORIGIN_MARKER_TAG,
    attributes: {
      src,
      title,
      "data-iframe-type": "cross-origin",
    },
    textContent: `[Cross-Origin iframe: ${src}${title ? ` — ${title}` : ""}]`,
    isVisible: true,
    isInteractive: false,
    children: [],
  };
}

/**
 * Extrahiert den Key fuer das iframe-DOM Lookup.
 * Verwendet die src-URL oder eine ID/name.
 */
function getIframeKey(node: DomNode): string | undefined {
  return (
    node.attributes["src"] ??
    node.attributes["id"] ??
    node.attributes["name"] ??
    undefined
  );
}

/**
 * Integriert einen einzelnen iframe-Node.
 *
 * @param node - Der iframe DomNode
 * @param iframeDoms - Map von iframe-Key zu extrahiertem DomNode-Baum
 * @param depth - Rekursionstiefe
 * @returns Neuer Node (integriert, Marker oder unsichtbar markiert)
 */
function processIframeNode(
  node: DomNode,
  iframeDoms: Map<string, DomNode>,
  depth: number
): DomNode {
  // Tracking-Pixel: als unsichtbar markieren
  if (isTrackingPixel(node)) {
    logger.debug(
      { src: node.attributes["src"] },
      "Tracking-Pixel iframe erkannt, als unsichtbar markiert"
    );
    return {
      ...node,
      isVisible: false,
      attributes: {
        ...node.attributes,
        "data-iframe-type": "tracking-pixel",
      },
      children: [],
    };
  }

  const key = getIframeKey(node);
  if (key === undefined) {
    // iframe ohne Key => als Cross-Origin behandeln
    return {
      ...node,
      children: [createCrossOriginMarker(node)],
    };
  }

  const iframeDom = iframeDoms.get(key);
  if (iframeDom === undefined) {
    // Kein DOM-Inhalt verfuegbar => Cross-Origin Marker
    logger.debug(
      { key },
      "iframe DOM nicht verfuegbar, Cross-Origin Marker eingefuegt"
    );
    return {
      ...node,
      children: [createCrossOriginMarker(node)],
    };
  }

  // Same-Origin iframe: DOM integrieren
  // Rekursiv verschachtelte iframes im iframe-DOM behandeln
  const integratedContent = processNode(iframeDom, iframeDoms, depth + 1);

  logger.debug(
    { key },
    "Same-Origin iframe DOM integriert"
  );

  return {
    ...node,
    attributes: {
      ...node.attributes,
      "data-iframe-type": "same-origin",
      "data-iframe-integrated": "true",
    },
    children: [integratedContent],
  };
}

/**
 * Traversiert den DOM-Baum und integriert iframe-Inhalte.
 *
 * @param node - Aktueller Node
 * @param iframeDoms - Map von iframe-Key zu DomNode-Baum
 * @param depth - Rekursionstiefe
 * @returns Neuer Node mit integrierten iframes
 */
function processNode(
  node: DomNode,
  iframeDoms: Map<string, DomNode>,
  depth: number
): DomNode {
  // Schutz vor Endlosschleifen
  if (depth > 50) {
    logger.warn(
      { tagName: node.tagName, depth },
      "iframe Verschachtelungstiefe ueberschritten"
    );
    return node;
  }

  if (isIframe(node)) {
    return processIframeNode(node, iframeDoms, depth);
  }

  // Kinder rekursiv verarbeiten
  const newChildren = node.children.map((child) =>
    processNode(child, iframeDoms, depth)
  );

  return { ...node, children: newChildren };
}

/**
 * Integriert iframe-Inhalte in den DOM-Baum.
 *
 * - Same-Origin iframes: Vollstaendig in den Baum integriert
 * - Cross-Origin iframes: Nur Metadaten (src, title, dimensions) behalten
 * - Tracking-Pixel iframes: Als isVisible=false markiert
 * - Verschachtelte iframes: Rekursiv behandelt
 *
 * @param dom - Der DomNode-Baum
 * @param iframeDoms - Map von iframe-Identifier (src/id/name) zu DomNode-Baum
 * @returns Neuer DomNode-Baum mit integrierten iframes
 * @throws IframeIntegrationError bei schwerwiegenden Fehlern
 */
export function integrateIframes(
  dom: DomNode,
  iframeDoms: Map<string, DomNode>
): DomNode {
  try {
    const result = processNode(dom, iframeDoms, 0);

    logger.info(
      { iframeDomsProvided: iframeDoms.size },
      "iframe-Integration abgeschlossen"
    );

    return result;
  } catch (error) {
    if (error instanceof IframeIntegrationError) {
      throw error;
    }
    throw new IframeIntegrationError(
      `iframe-Integration fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

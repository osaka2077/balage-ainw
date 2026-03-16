/**
 * ARIA Parser — Extrahiert und analysiert ARIA-Semantik
 *
 * Gleicht ARIA-Rollen mit impliziten HTML-Rollen ab,
 * loest aria-labelledby/describedby Referenzen auf,
 * erkennt Live Regions und loggt Konflikte.
 */

import pino from "pino";
import type { DomNode, AccessibilityNode } from "../../shared_interfaces.js";
import type {
  AriaAnalysis,
  AriaLandmark,
  AriaLiveRegion,
  AriaConflict,
} from "./types.js";
import { AriaResolutionError } from "./errors.js";

const logger = pino({ name: "parser:aria-parser" });

/**
 * Mapping: HTML-Tag -> implizite ARIA-Rolle
 * Quelle: WAI-ARIA Practices, HTML-AAM Spec
 */
const IMPLICIT_ROLE_MAP: Record<string, string> = {
  a: "link",
  article: "article",
  aside: "complementary",
  button: "button",
  dialog: "dialog",
  footer: "contentinfo",
  form: "form",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  header: "banner",
  img: "img",
  input: "textbox",
  li: "listitem",
  main: "main",
  nav: "navigation",
  ol: "list",
  option: "option",
  progress: "progressbar",
  section: "region",
  select: "combobox",
  table: "table",
  td: "cell",
  textarea: "textbox",
  th: "columnheader",
  tr: "row",
  ul: "list",
};

/** ARIA Landmark-Rollen */
const LANDMARK_ROLES = new Set([
  "banner",
  "complementary",
  "contentinfo",
  "form",
  "main",
  "navigation",
  "region",
  "search",
]);

/**
 * Baut eine flache ID->Node Map fuer schnelles Lookup.
 * Wird benoetigt fuer aria-labelledby/describedby Referenz-Aufloesungen.
 */
function buildIdMap(node: DomNode): Map<string, DomNode> {
  const map = new Map<string, DomNode>();

  function traverse(n: DomNode): void {
    const id = n.attributes["id"];
    if (id !== undefined && id.length > 0) {
      map.set(id, n);
    }
    for (const child of n.children) {
      traverse(child);
    }
  }

  traverse(node);
  return map;
}

/**
 * Extrahiert den sichtbaren Textinhalt eines Nodes (rekursiv).
 * Pure function.
 */
function extractTextContent(node: DomNode): string {
  const parts: string[] = [];
  if (node.textContent !== undefined && node.textContent.trim().length > 0) {
    parts.push(node.textContent.trim());
  }
  for (const child of node.children) {
    const childText = extractTextContent(child);
    if (childText.length > 0) {
      parts.push(childText);
    }
  }
  return parts.join(" ");
}

/**
 * Loest eine aria-labelledby oder aria-describedby Referenz auf.
 * Kann mehrere IDs (space-separated) enthalten.
 *
 * @returns Zusammengefuegter Text oder undefined wenn keine IDs aufloesbar
 */
function resolveAriaReference(
  attrValue: string,
  idMap: Map<string, DomNode>
): string | undefined {
  const ids = attrValue.split(/\s+/).filter((id) => id.length > 0);
  const resolvedParts: string[] = [];

  for (const id of ids) {
    const referencedNode = idMap.get(id);
    if (referencedNode !== undefined) {
      const text = extractTextContent(referencedNode);
      if (text.length > 0) {
        resolvedParts.push(text);
      }
    } else {
      // Referenz auf nicht-existierende ID => Warning, weiter parsen
      logger.warn(
        { referenceId: id, attrValue },
        "ARIA-Referenz auf nicht-existierende ID"
      );
    }
  }

  return resolvedParts.length > 0 ? resolvedParts.join(" ") : undefined;
}

/**
 * Ermittelt die implizite Rolle eines HTML-Elements.
 * Pure function.
 */
function getImplicitRole(node: DomNode): string | undefined {
  const tag = node.tagName.toLowerCase();

  // Spezialfall: input-Typ bestimmt die Rolle
  if (tag === "input") {
    const inputType = node.attributes["type"]?.toLowerCase() ?? "text";
    switch (inputType) {
      case "checkbox":
        return "checkbox";
      case "radio":
        return "radio";
      case "range":
        return "slider";
      case "button":
      case "submit":
      case "reset":
        return "button";
      case "search":
        return "searchbox";
      default:
        return "textbox";
    }
  }

  // Spezialfall: <a> mit href ist "link", ohne href hat keine Rolle
  if (tag === "a") {
    return node.attributes["href"] !== undefined ? "link" : undefined;
  }

  return IMPLICIT_ROLE_MAP[tag];
}

/**
 * Sammelt Landmarks, Live Regions, Labels und Konflikte aus dem DOM-Baum.
 */
function analyzeNode(
  node: DomNode,
  idMap: Map<string, DomNode>,
  landmarks: AriaLandmark[],
  liveRegions: AriaLiveRegion[],
  labelMap: Map<string, string>,
  conflicts: AriaConflict[]
): void {
  const explicitRole = node.attributes["role"];
  const implicitRole = getImplicitRole(node);
  const effectiveRole = explicitRole ?? implicitRole;

  // Konflikte erkennen: explizite Rolle weicht von impliziter ab
  if (
    explicitRole !== undefined &&
    implicitRole !== undefined &&
    explicitRole !== implicitRole
  ) {
    logger.warn(
      {
        tagName: node.tagName,
        implicitRole,
        explicitRole,
      },
      "ARIA-Rollenkonflikt: explizite Rolle weicht von impliziter ab"
    );
    conflicts.push({
      node,
      implicitRole,
      explicitRole,
      // Explizite Rolle hat Vorrang gemaess WAI-ARIA Spec
      resolution: "explicit",
    });
  }

  // Landmark erkennen
  if (effectiveRole !== undefined && LANDMARK_ROLES.has(effectiveRole)) {
    const label =
      node.attributes["aria-label"] ??
      (node.attributes["aria-labelledby"] !== undefined
        ? resolveAriaReference(node.attributes["aria-labelledby"], idMap)
        : undefined);

    landmarks.push({ role: effectiveRole, label, node });
  }

  // Live Regions erkennen
  const ariaLive = node.attributes["aria-live"];
  if (ariaLive === "polite" || ariaLive === "assertive" || ariaLive === "off") {
    const ariaAtomic = node.attributes["aria-atomic"] === "true";
    const ariaRelevant = node.attributes["aria-relevant"]
      ?.split(/\s+/)
      .filter((v) => v.length > 0) ?? ["additions", "text"];

    liveRegions.push({
      node,
      live: ariaLive,
      atomic: ariaAtomic,
      relevant: ariaRelevant,
    });
  }

  // Labels aufloesen
  const nodeId = node.attributes["id"];
  if (nodeId !== undefined && nodeId.length > 0) {
    // Prioritaet: aria-labelledby > aria-label > textContent
    const ariaLabelledBy = node.attributes["aria-labelledby"];
    const ariaLabel = node.attributes["aria-label"];

    let resolvedLabel: string | undefined;

    if (ariaLabelledBy !== undefined) {
      resolvedLabel = resolveAriaReference(ariaLabelledBy, idMap);
    }

    if (resolvedLabel === undefined && ariaLabel !== undefined && ariaLabel.length > 0) {
      resolvedLabel = ariaLabel;
    }

    if (resolvedLabel === undefined) {
      const text = extractTextContent(node);
      if (text.length > 0) {
        resolvedLabel = text;
      }
    }

    if (resolvedLabel !== undefined) {
      labelMap.set(nodeId, resolvedLabel);
    }
  }

  // Rekursiv Kinder analysieren
  for (const child of node.children) {
    analyzeNode(child, idMap, landmarks, liveRegions, labelMap, conflicts);
  }
}

/**
 * Analysiert ARIA-Semantik eines DOM-Baums.
 *
 * - Erkennt implizite Rollen (z.B. <button> = role="button")
 * - Loest aria-label, aria-labelledby, aria-describedby auf
 * - Erkennt ARIA Landmarks
 * - Erkennt Live Regions
 * - Loggt Konflikte zwischen expliziter und impliziter Rolle
 *
 * @param dom - Der DomNode-Baum
 * @param _axTree - Der Accessibility-Tree (fuer zukuenftige Cross-Referenz)
 * @returns AriaAnalysis mit allen ARIA-Informationen
 */
export function parseAria(dom: DomNode, _axTree: AccessibilityNode): AriaAnalysis {
  try {
    const idMap = buildIdMap(dom);
    const landmarks: AriaLandmark[] = [];
    const liveRegions: AriaLiveRegion[] = [];
    const labelMap = new Map<string, string>();
    const conflicts: AriaConflict[] = [];

    analyzeNode(dom, idMap, landmarks, liveRegions, labelMap, conflicts);

    logger.info(
      {
        landmarkCount: landmarks.length,
        liveRegionCount: liveRegions.length,
        labelCount: labelMap.size,
        conflictCount: conflicts.length,
      },
      "ARIA-Analyse abgeschlossen"
    );

    return { landmarks, liveRegions, labelMap, conflicts };
  } catch (error) {
    if (error instanceof AriaResolutionError) {
      throw error;
    }
    throw new AriaResolutionError(
      `ARIA-Analyse fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

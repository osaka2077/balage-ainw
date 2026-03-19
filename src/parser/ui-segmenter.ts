/**
 * UI Segmenter — Zerlegt den DOM in semantische UI-Segmente
 *
 * Erkennt UI-Bereiche (Navigation, Sidebar, Main Content, Footer, Forms, etc.)
 * anhand von Tag-Semantik, ARIA Landmarks, CSS-Klassen und Layout-Position.
 */

import { randomUUID } from "node:crypto";
import pino from "pino";
import { UISegmentSchema } from "../../shared_interfaces.js";
import type { DomNode, UISegment, UISegmentType, BoundingBox } from "../../shared_interfaces.js";
import type { AriaAnalysis, SegmenterOptions } from "./types.js";
import { SegmentationError } from "./errors.js";

const logger = pino({ name: "parser:ui-segmenter" });

/** Mapping: HTML-Tag -> UISegmentType */
const TAG_TO_SEGMENT: Record<string, UISegmentType> = {
  nav: "navigation",
  header: "header",
  footer: "footer",
  form: "form",
  aside: "sidebar",
  dialog: "modal",
  table: "table",
  ul: "list",
  ol: "list",
  video: "media",
  audio: "media",
};

/** Custom Element Tag-Patterns -> UISegmentType */
const CUSTOM_ELEMENT_PATTERNS: Array<{ pattern: RegExp; type: UISegmentType; weight: number }> = [
  { pattern: /cart|basket/i, type: "checkout", weight: 0.7 },
  { pattern: /product|item/i, type: "content", weight: 0.6 },
  { pattern: /search|find/i, type: "search", weight: 0.7 },
  { pattern: /nav|menu/i, type: "navigation", weight: 0.6 },
  { pattern: /modal|dialog|drawer/i, type: "modal", weight: 0.6 },
];

/** Mapping: ARIA Landmark role -> UISegmentType */
const LANDMARK_TO_SEGMENT: Record<string, UISegmentType> = {
  navigation: "navigation",
  main: "content",
  banner: "banner",
  contentinfo: "footer",
  complementary: "sidebar",
  form: "form",
  region: "content",
  search: "search",
};

/** CSS-Klassen-Muster -> UISegmentType (case-insensitive Matching) */
const CLASS_PATTERNS: Array<{ pattern: RegExp; type: UISegmentType; weight: number }> = [
  { pattern: /\bnav(bar|igation)?\b/i, type: "navigation", weight: 0.6 },
  { pattern: /\bheader\b/i, type: "header", weight: 0.5 },
  { pattern: /\bfooter\b/i, type: "footer", weight: 0.5 },
  { pattern: /\bsidebar\b/i, type: "sidebar", weight: 0.6 },
  { pattern: /\bmodal\b/i, type: "modal", weight: 0.7 },
  { pattern: /\boverlay\b/i, type: "overlay", weight: 0.6 },
  { pattern: /\bbanner\b/i, type: "banner", weight: 0.5 },
  { pattern: /\bmenu\b/i, type: "navigation", weight: 0.4 },
  { pattern: /\bcontent\b/i, type: "content", weight: 0.3 },
  { pattern: /\bmain\b/i, type: "content", weight: 0.4 },
  { pattern: /\bsearch\b/i, type: "search", weight: 0.55 },
  { pattern: /\b(cart|basket|checkout)\b/i, type: "checkout", weight: 0.7 },
  { pattern: /\b(order|purchase|payment)\b/i, type: "checkout", weight: 0.55 },
];

/** Interaktive HTML-Elemente */
const INTERACTIVE_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "details",
  "summary",
]);

const DEFAULT_MIN_CONFIDENCE = 0.4;

/**
 * Zaehlt interaktive Elemente in einem DomNode-Teilbaum.
 * Pure function.
 */
function countInteractiveElements(node: DomNode): number {
  let count = 0;

  if (node.isInteractive || INTERACTIVE_TAGS.has(node.tagName.toLowerCase())) {
    count++;
  }

  for (const child of node.children) {
    count += countInteractiveElements(child);
  }

  return count;
}

/**
 * Berechnet die BoundingBox fuer einen Node.
 * Faellt auf Default zurueck wenn keine BoundingBox vorhanden.
 */
function getEffectiveBoundingBox(node: DomNode): BoundingBox {
  if (node.boundingBox !== undefined) {
    return node.boundingBox;
  }
  // Default BoundingBox wenn keine vorhanden
  return { x: 0, y: 0, width: 0, height: 0 };
}

/**
 * Bestimmt den Segment-Typ anhand der CSS-Klassen eines Elements.
 * Gibt den Typ mit dem hoechsten Gewicht zurueck.
 */
function classifyByClassName(
  className: string | undefined
): { type: UISegmentType; weight: number } | undefined {
  if (className === undefined || className.length === 0) return undefined;

  let bestMatch: { type: UISegmentType; weight: number } | undefined;

  for (const { pattern, type, weight } of CLASS_PATTERNS) {
    if (pattern.test(className)) {
      if (bestMatch === undefined || weight > bestMatch.weight) {
        bestMatch = { type, weight };
      }
    }
  }

  return bestMatch;
}

/**
 * Bestimmt den Segment-Typ anhand der Layout-Position (Heuristik).
 * Benoetigt eine BoundingBox und Viewport-Schaetzung.
 */
function classifyByPosition(
  box: BoundingBox
): { type: UISegmentType; weight: number } | undefined {
  // Position relativ zum vermuteten Viewport (1280x720)
  const estimatedViewportHeight = 720;

  // Ganz oben und volle Breite => header
  if (box.y < 100 && box.width > 500 && box.height < 200) {
    return { type: "header", weight: 0.3 };
  }

  // Links fixiert, schmal, hohe Hoehe => sidebar
  if (box.x < 50 && box.width < 350 && box.height > 300) {
    return { type: "sidebar", weight: 0.3 };
  }

  // Ganz unten => footer
  if (box.y > estimatedViewportHeight - 200 && box.width > 500) {
    return { type: "footer", weight: 0.2 };
  }

  return undefined;
}

/** Muster fuer Search-Placeholder (case-insensitive) */
const SEARCH_PLACEHOLDER_PATTERN = /\b(search|suche|find|recherch|buscar)\b/i;

/**
 * Erkennt ob ein Node ein Such-Input ist.
 * Prueft type="search", role="searchbox" und Placeholder-Text.
 */
function isSearchInput(node: DomNode): boolean {
  const tag = node.tagName.toLowerCase();
  if (tag !== "input" && tag !== "textarea") return false;

  if (node.attributes["type"] === "search") return true;
  if (node.attributes["role"] === "searchbox") return true;

  const placeholder = node.attributes["placeholder"];
  if (placeholder !== undefined && SEARCH_PLACEHOLDER_PATTERN.test(placeholder)) return true;

  return false;
}

/**
 * Prueft ob ein Node ein isoliertes interaktives Element ist
 * (input/select/textarea das nicht in einem Form-Kontext liegt).
 */
function isStandaloneInteractive(node: DomNode): boolean {
  const tag = node.tagName.toLowerCase();
  return tag === "input" || tag === "select" || tag === "textarea";
}

/**
 * Erkennt implizite Formulare: Divs die Inputs und Buttons enthalten,
 * aber kein <form>-Tag sind.
 * Erkennt auch role="button", aria-basierte Buttons und
 * Search-Inputs die keinen expliziten Button brauchen.
 */
function isImplicitForm(node: DomNode): boolean {
  if (node.tagName.toLowerCase() === "form") return false;

  let hasInput = false;
  let hasSearchInput = false;
  let hasButton = false;

  function scan(n: DomNode): void {
    const tag = n.tagName.toLowerCase();
    // Nicht in echte <form>-Elemente hinein scannen — die bekommen ihr eigenes Segment
    if (tag === "form") return;
    if (tag === "input" || tag === "textarea" || tag === "select") {
      hasInput = true;
      if (n.attributes["type"] === "search" || n.attributes["role"] === "searchbox") {
        hasSearchInput = true;
      }
    }
    if (
      tag === "button" ||
      (tag === "input" && (n.attributes["type"] === "submit" || n.attributes["type"] === "button")) ||
      n.attributes["role"] === "button" ||
      (tag === "a" && n.attributes["type"] === "submit")
    ) {
      hasButton = true;
    }
    for (const child of n.children) {
      scan(child);
    }
  }

  scan(node);
  // Search-Inputs brauchen keinen Button (Enter-Submit)
  if (hasSearchInput) return true;
  return hasInput && hasButton;
}

/**
 * Bestimmt den Segment-Typ und Confidence fuer einen Node.
 * Kombiniert mehrere Heuristiken mit gewichteter Bewertung.
 */
function classifyNode(
  node: DomNode,
  ariaAnalysis: AriaAnalysis
): { type: UISegmentType; confidence: number; label?: string } {
  const tag = node.tagName.toLowerCase();
  const signals: Array<{ type: UISegmentType; weight: number; source: string }> = [];

  // 1. Tag-Semantik (hoechste Prioritaet)
  const tagSegment = TAG_TO_SEGMENT[tag];
  if (tagSegment !== undefined) {
    signals.push({ type: tagSegment, weight: 0.9, source: "tag" });
  }

  // 1b. Custom Element Erkennung (tag enthaelt Bindestrich)
  if (tag.includes("-")) {
    let bestCustom: { type: UISegmentType; weight: number } | undefined;
    for (const { pattern, type, weight } of CUSTOM_ELEMENT_PATTERNS) {
      if (pattern.test(tag)) {
        if (!bestCustom || weight > bestCustom.weight) {
          bestCustom = { type, weight };
        }
      }
    }
    if (bestCustom) {
      signals.push({ type: bestCustom.type, weight: bestCustom.weight, source: "custom-element" });
    }
  }

  // 2. ARIA Landmarks
  const explicitRole = node.attributes["role"];
  if (explicitRole !== undefined) {
    const landmarkSegment = LANDMARK_TO_SEGMENT[explicitRole];
    if (landmarkSegment !== undefined) {
      signals.push({ type: landmarkSegment, weight: 0.85, source: "aria-role" });
    }
  }

  // 3. ARIA Landmark aus der Analyse (implizite Rollen)
  const matchingLandmark = ariaAnalysis.landmarks.find((lm) => lm.node === node);
  if (matchingLandmark !== undefined) {
    const landmarkSegment = LANDMARK_TO_SEGMENT[matchingLandmark.role];
    if (landmarkSegment !== undefined) {
      signals.push({ type: landmarkSegment, weight: 0.8, source: "aria-landmark" });
    }
  }

  // 4. CSS-Klassen Heuristik
  const classResult = classifyByClassName(node.attributes["class"]);
  if (classResult !== undefined) {
    signals.push({ type: classResult.type, weight: classResult.weight, source: "class" });
  }

  // 5. Position/Layout Heuristik
  if (node.boundingBox !== undefined) {
    const posResult = classifyByPosition(node.boundingBox);
    if (posResult !== undefined) {
      signals.push({ type: posResult.type, weight: posResult.weight, source: "position" });
    }
  }

  // 6. Implizites Formular (div mit inputs + button)
  if (isImplicitForm(node)) {
    signals.push({ type: "form", weight: 0.65, source: "implicit-form" });
  }

  // 7. Main-Tag Semantik fuer <main> Elemente
  if (tag === "main") {
    signals.push({ type: "content", weight: 0.95, source: "main-tag" });
  }

  // 8. Such-Input Erkennung (type="search", role="searchbox", Placeholder)
  if (isSearchInput(node)) {
    signals.push({ type: "search", weight: 0.8, source: "search-input" });
  }

  // Kein Signal => unknown
  if (signals.length === 0) {
    return { type: "unknown", confidence: 0.1 };
  }

  // Typ mit hoechstem Gewicht waehlen
  signals.sort((a, b) => b.weight - a.weight);
  const bestSignal = signals[0];
  if (bestSignal === undefined) {
    return { type: "unknown", confidence: 0.1 };
  }

  // Confidence basiert auf Staerke des besten Signals + Bonus fuer uebereinstimmende Signale
  const matchingSignals = signals.filter((s) => s.type === bestSignal.type);
  const baseConfidence = bestSignal.weight;
  const agreementBonus = Math.min((matchingSignals.length - 1) * 0.05, 0.1);
  const confidence = Math.min(baseConfidence + agreementBonus, 1.0);

  // Label aus ARIA-Analyse extrahieren
  const nodeId = node.attributes["id"];
  const label = nodeId !== undefined ? ariaAnalysis.labelMap.get(nodeId) : undefined;

  return { type: bestSignal.type, confidence, label };
}

/**
 * Traversiert den DOM-Baum und sammelt segmentierbare Nodes.
 * Ein Node ist segmentierbar wenn er ein semantisches Element oder
 * ein Landmark ist.
 *
 * @param insideFormContext — true wenn ein Eltern-Node bereits als form/search Segment erkannt wurde.
 *   Verhindert redundante Mini-Segmente fuer Inputs die bereits in einem Form-Segment liegen.
 */
function collectSegmentableNodes(
  node: DomNode,
  ariaAnalysis: AriaAnalysis,
  minConfidence: number,
  segments: UISegment[],
  insideFormContext: boolean = false
): void {
  const classification = classifyNode(node, ariaAnalysis);
  let currentIsFormContext = insideFormContext;

  if (classification.type !== "unknown" && classification.confidence >= minConfidence) {
    const interactiveCount = countInteractiveElements(node);
    const box = getEffectiveBoundingBox(node);
    const effectiveRole = node.attributes["role"] ?? undefined;

    const segment: UISegment = {
      id: randomUUID(),
      type: classification.type,
      label: classification.label?.slice(0, 256),
      confidence: Math.round(classification.confidence * 100) / 100,
      boundingBox: box,
      nodes: [node],
      interactiveElementCount: interactiveCount,
      semanticRole: effectiveRole,
    };

    // Zod-Validierung
    const validated = UISegmentSchema.safeParse(segment);
    if (validated.success) {
      segments.push(validated.data);
    } else {
      logger.warn(
        { errors: validated.error.issues, type: classification.type },
        "UISegment Validierung fehlgeschlagen, Segment wird uebersprungen"
      );
    }

    // FIX: Navigation-Segment das auch Form-Elemente enthaelt → zusaetzliches Form-Segment emittieren
    // Verhindert dass Suchformulare in Navigationsleisten verloren gehen
    if (classification.type === "navigation" && isImplicitForm(node)) {
      const formSegment: UISegment = {
        id: randomUUID(),
        type: "form",
        label: classification.label ? `${classification.label} (embedded form)` : "Embedded Form",
        confidence: 0.7,
        boundingBox: box,
        nodes: [node],
        interactiveElementCount: interactiveCount,
        semanticRole: "form",
      };
      const formValidated = UISegmentSchema.safeParse(formSegment);
      if (formValidated.success) {
        segments.push(formValidated.data);
      }
    }

    // Kinder erben den Form-Kontext wenn dieses Segment ein Form/Search ist
    if (classification.type === "form" || classification.type === "search") {
      currentIsFormContext = true;
    }
  } else if (!insideFormContext && isStandaloneInteractive(node)) {
    // FIX 1: Isolierte interaktive Elemente die NICHT in einem Form-Kontext liegen
    // bekommen ein eigenes Mini-Segment (search oder form)
    const segType: UISegmentType = isSearchInput(node) ? "search" : "form";
    const box = getEffectiveBoundingBox(node);

    const miniSegment: UISegment = {
      id: randomUUID(),
      type: segType,
      label: node.attributes["aria-label"]?.slice(0, 256) ?? node.attributes["placeholder"]?.slice(0, 256),
      confidence: segType === "search" ? 0.7 : 0.5,
      boundingBox: box,
      nodes: [node],
      interactiveElementCount: 1,
      semanticRole: node.attributes["role"] ?? undefined,
    };

    const validated = UISegmentSchema.safeParse(miniSegment);
    if (validated.success) {
      segments.push(validated.data);
    }
  }

  // Immer Kinder durchsuchen, da verschachtelte Segmente moeglich sind
  for (const child of node.children) {
    collectSegmentableNodes(child, ariaAnalysis, minConfidence, segments, currentIsFormContext);
  }
}

/**
 * Zerlegt den DOM in semantische UI-Segmente.
 *
 * Erkennung basiert auf:
 * - Tag-Semantik: <nav> -> navigation, <header> -> header, etc.
 * - ARIA Landmarks: role="navigation", role="main", etc.
 * - CSS-Klassen Heuristik: Klassen die "nav", "header" etc. enthalten
 * - Position/Layout: Top -> header, Left-Fixed -> sidebar
 * - Implizite Formulare: div mit inputs + button
 *
 * @param dom - Der DomNode-Baum
 * @param aria - Die ARIA-Analyse
 * @param options - Optionale Konfiguration
 * @returns Array von UISegments, Zod-validiert
 * @throws SegmentationError bei schwerwiegenden Fehlern
 */
export function segmentUI(
  dom: DomNode,
  aria: AriaAnalysis,
  options?: SegmenterOptions
): UISegment[] {
  try {
    const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
    const segments: UISegment[] = [];

    collectSegmentableNodes(dom, aria, minConfidence, segments);

    logger.info(
      {
        segmentCount: segments.length,
        types: segments.map((s) => s.type),
      },
      "UI-Segmentierung abgeschlossen"
    );

    return segments;
  } catch (error) {
    if (error instanceof SegmentationError) {
      throw error;
    }
    throw new SegmentationError(
      `UI-Segmentierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

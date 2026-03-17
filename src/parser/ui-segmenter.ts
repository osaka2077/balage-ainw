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

/** Mapping: ARIA Landmark role -> UISegmentType */
const LANDMARK_TO_SEGMENT: Record<string, UISegmentType> = {
  navigation: "navigation",
  main: "content",
  banner: "banner",
  contentinfo: "footer",
  complementary: "sidebar",
  form: "form",
  region: "content",
  search: "navigation",
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

const DEFAULT_MIN_CONFIDENCE = 0.3;

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

/**
 * Erkennt implizite Formulare: Divs die Inputs und Buttons enthalten,
 * aber kein <form>-Tag sind.
 */
function isImplicitForm(node: DomNode): boolean {
  if (node.tagName.toLowerCase() === "form") return false;

  let hasInput = false;
  let hasButton = false;

  function scan(n: DomNode): void {
    const tag = n.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
      hasInput = true;
    }
    if (tag === "button" || (tag === "input" && (n.attributes["type"] === "submit" || n.attributes["type"] === "button"))) {
      hasButton = true;
    }
    for (const child of n.children) {
      scan(child);
    }
  }

  scan(node);
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
 */
function collectSegmentableNodes(
  node: DomNode,
  ariaAnalysis: AriaAnalysis,
  minConfidence: number,
  segments: UISegment[]
): void {
  const classification = classifyNode(node, ariaAnalysis);

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

    // Keine Kinder durchsuchen wenn wir diesen Node bereits als Segment erfasst haben,
    // es sei denn die Kinder enthalten eigene semantische Strukturen (z.B. Form in Main)
  }

  // Immer Kinder durchsuchen, da verschachtelte Segmente moeglich sind
  for (const child of node.children) {
    collectSegmentableNodes(child, ariaAnalysis, minConfidence, segments);
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

/**
 * Parser-Typen: Re-Exports aus shared_interfaces + lokale Typen
 */

// Re-Exports aus shared_interfaces (READ-ONLY)
export type {
  DomNode,
  AccessibilityNode,
  UISegment,
  UISegmentType,
  BoundingBox,
} from "../../shared_interfaces.js";

export {
  DomNodeSchema,
  AccessibilityNodeSchema,
  UISegmentSchema,
  UISegmentTypeSchema,
  BoundingBoxSchema,
} from "../../shared_interfaces.js";

// ============================================================================
// Lokale Parser-Typen
// ============================================================================

import type { DomNode } from "../../shared_interfaces.js";

/** Ergebnis des DOM-Parsings: normalisierter Baum + Metadaten */
export interface ParsedDom {
  root: DomNode;
  nodeCount: number;
  maxDepth: number;
  /** tagName -> alle Elemente dieses Typs */
  semanticElements: Map<string, DomNode[]>;
}

/** Ergebnis der ARIA-Analyse */
export interface AriaAnalysis {
  landmarks: AriaLandmark[];
  liveRegions: AriaLiveRegion[];
  /** elementId -> aufgeloester Label-Text */
  labelMap: Map<string, string>;
  conflicts: AriaConflict[];
}

/** ARIA Landmark (navigation, main, banner, etc.) */
export interface AriaLandmark {
  role: string;
  label?: string;
  node: DomNode;
}

/** ARIA Live Region (aria-live="polite" etc.) */
export interface AriaLiveRegion {
  node: DomNode;
  live: "polite" | "assertive" | "off";
  atomic: boolean;
  relevant: string[];
}

/** Konflikt zwischen impliziter und expliziter ARIA-Rolle */
export interface AriaConflict {
  node: DomNode;
  implicitRole: string;
  explicitRole: string;
  resolution: "explicit" | "implicit";
}

/** Ergebnis des DOM-Prunings */
export interface PruneResult {
  prunedDom: DomNode;
  removedCount: number;
  removedByReason: Record<string, number>;
}

/** Konfiguration fuer den DOM-Parser */
export interface DomParserOptions {
  /** Maximale Rekursionstiefe beim Traversieren (Default: 50) */
  maxDepth?: number;
}

/** Konfiguration fuer den UI-Segmenter */
export interface SegmenterOptions {
  /** Minimaler Confidence-Score, unter dem ein Segment als "unknown" klassifiziert wird */
  minConfidence?: number;
}

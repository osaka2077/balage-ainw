/**
 * Parser Module — Public API
 *
 * Layer 2: Parsing Engine
 * Transformiert rohe DomNode-Snapshots und AccessibilityNode-Trees
 * in strukturierte, semantische UISegment-Strukturen.
 */

// Kern-Exports (benutzt vom npm-Package via src/core/analyze.ts)
export { pruneDom } from "./pruner.js";
export { parseAria } from "./aria-parser.js";
export { segmentUI } from "./ui-segmenter.js";

// Erweiterte Exports (nur fuer Tests/SaaS-Module, nicht im npm-Bundle-Pfad)
export { parseDom } from "./dom-parser.js";
export { traverseShadowRoots } from "./shadow-dom.js";
export { integrateIframes } from "./iframe-handler.js";

// Typen
export type {
  ParsedDom,
  AriaAnalysis,
  AriaLandmark,
  AriaLiveRegion,
  AriaConflict,
  PruneResult,
  DomParserOptions,
  SegmenterOptions,
} from "./types.js";

// Error-Klassen
export {
  ParserError,
  DomParseError,
  AriaResolutionError,
  SegmentationError,
  ShadowDomError,
  IframeIntegrationError,
  PruningError,
} from "./errors.js";

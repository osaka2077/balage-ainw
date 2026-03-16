/**
 * Parser Module — Public API
 *
 * Layer 2: Parsing Engine
 * Transformiert rohe DomNode-Snapshots und AccessibilityNode-Trees
 * in strukturierte, semantische UISegment-Strukturen.
 */

// Core Parser-Funktionen
export { parseDom } from "./dom-parser.js";
export { parseAria } from "./aria-parser.js";
export { segmentUI } from "./ui-segmenter.js";
export { traverseShadowRoots } from "./shadow-dom.js";
export { integrateIframes } from "./iframe-handler.js";
export { pruneDom } from "./pruner.js";

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

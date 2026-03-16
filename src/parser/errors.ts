/**
 * Parser-spezifische Error-Klassen
 *
 * Jede Fehlerklasse hat einen maschinenlesbaren `code` und
 * optionale `cause` fuer Error-Chaining.
 */

/** Basis-Fehler fuer alle Parser-Errors */
export class ParserError extends Error {
  readonly code: string;
  declare readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = cause;
  }
}

/** Fehler beim DOM-Parsing (malformed Nodes, Tiefenlimit, etc.) */
export class DomParseError extends ParserError {
  constructor(message: string, cause?: Error) {
    super(message, "DOM_PARSE_ERROR", cause);
  }
}

/** Fehler beim Aufloesen von ARIA-Referenzen */
export class AriaResolutionError extends ParserError {
  constructor(message: string, cause?: Error) {
    super(message, "ARIA_RESOLUTION_ERROR", cause);
  }
}

/** Fehler bei der UI-Segmentierung */
export class SegmentationError extends ParserError {
  constructor(message: string, cause?: Error) {
    super(message, "SEGMENTATION_ERROR", cause);
  }
}

/** Fehler beim Shadow-DOM-Traversal */
export class ShadowDomError extends ParserError {
  constructor(message: string, cause?: Error) {
    super(message, "SHADOW_DOM_ERROR", cause);
  }
}

/** Fehler bei der iframe-Integration */
export class IframeIntegrationError extends ParserError {
  constructor(message: string, cause?: Error) {
    super(message, "IFRAME_INTEGRATION_ERROR", cause);
  }
}

/** Fehler beim DOM-Pruning */
export class PruningError extends ParserError {
  constructor(message: string, cause?: Error) {
    super(message, "PRUNING_ERROR", cause);
  }
}

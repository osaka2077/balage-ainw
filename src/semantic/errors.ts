/**
 * Semantic-Engine-spezifische Error-Klassen
 *
 * Jede Fehlerklasse hat einen maschinenlesbaren `code` und
 * optionale `cause` fuer Error-Chaining.
 */

/** Basis-Fehler fuer alle Semantic-Engine-Errors */
export class SemanticError extends Error {
  readonly code: string;
  declare readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = cause;
  }
}

/** Fehler beim DOM-Pruning fuer LLM-Input */
export class DomPruningError extends SemanticError {
  constructor(message: string, cause?: Error) {
    super(message, "DOM_PRUNING_ERROR", cause);
  }
}

/** Allgemeiner LLM-Call-Fehler (Timeout, Netzwerk, etc.) */
export class LLMCallError extends SemanticError {
  constructor(message: string, cause?: Error) {
    super(message, "LLM_CALL_ERROR", cause);
  }
}

/** LLM-Antwort konnte nicht als JSON geparst werden */
export class LLMParseError extends SemanticError {
  readonly rawResponse: string;

  constructor(message: string, rawResponse: string, cause?: Error) {
    super(message, "LLM_PARSE_ERROR", cause);
    this.rawResponse = rawResponse;
  }
}

/** LLM Rate-Limit erreicht */
export class LLMRateLimitError extends SemanticError {
  readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number, cause?: Error) {
    super(message, "LLM_RATE_LIMIT_ERROR", cause);
    this.retryAfter = retryAfter;
  }
}

/** Generierter Endpoint besteht Zod-Validierung nicht */
export class EndpointValidationError extends SemanticError {
  readonly validationErrors: string[];

  constructor(message: string, validationErrors: string[], cause?: Error) {
    super(message, "ENDPOINT_VALIDATION_ERROR", cause);
    this.validationErrors = validationErrors;
  }
}

/** Fehler bei der Endpoint-Klassifizierung */
export class ClassificationError extends SemanticError {
  constructor(message: string, cause?: Error) {
    super(message, "CLASSIFICATION_ERROR", cause);
  }
}

/** Fehler bei der Evidence-Sammlung */
export class EvidenceCollectionError extends SemanticError {
  constructor(message: string, cause?: Error) {
    super(message, "EVIDENCE_COLLECTION_ERROR", cause);
  }
}

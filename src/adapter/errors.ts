/**
 * Adapter-spezifische Error-Klassen.
 * Jeder Error hat einen `code` fuer strukturiertes Error-Handling
 * und optionales `cause` fuer Error-Chaining.
 */

export class BrowserLaunchError extends Error {
  readonly code = "BROWSER_LAUNCH_ERROR";
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = "BrowserLaunchError";
  }
}

export class BrowserTimeoutError extends Error {
  readonly code = "BROWSER_TIMEOUT_ERROR";
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = "BrowserTimeoutError";
  }
}

export class ContextCreationError extends Error {
  readonly code = "CONTEXT_CREATION_ERROR";
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = "ContextCreationError";
  }
}

export class DomExtractionError extends Error {
  readonly code = "DOM_EXTRACTION_ERROR";
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = "DomExtractionError";
  }
}

export class StateDetectionError extends Error {
  readonly code = "STATE_DETECTION_ERROR";
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = "StateDetectionError";
  }
}

export class PoolExhaustedError extends Error {
  readonly code = "POOL_EXHAUSTED_ERROR";
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = "PoolExhaustedError";
  }
}

export class CircuitBreakerOpenError extends Error {
  readonly code = "CIRCUIT_BREAKER_OPEN";
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = "CircuitBreakerOpenError";
  }
}

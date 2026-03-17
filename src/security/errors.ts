/**
 * Security Hardening — Error-Klassen
 * Alle Error-Klassen fuer das Security Modul.
 */

export class SecurityError extends Error {
  readonly code: string;
  readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = "SecurityError";
    this.code = code;
    this.cause = cause;
  }
}

export class SanitizationError extends SecurityError {
  constructor(message: string, cause?: Error) {
    super(message, "SANITIZATION_ERROR", cause);
    this.name = "SanitizationError";
  }
}

export class InjectionDetectedError extends SecurityError {
  readonly score: number;
  readonly matches: string[];

  constructor(
    message: string,
    score: number,
    matches: string[],
    cause?: Error,
  ) {
    super(message, "INJECTION_DETECTED", cause);
    this.name = "InjectionDetectedError";
    this.score = score;
    this.matches = matches;
  }
}

export class CredentialLeakError extends SecurityError {
  readonly credentialType: string;
  readonly location: string;

  constructor(
    message: string,
    credentialType: string,
    location: string,
    cause?: Error,
  ) {
    super(message, "CREDENTIAL_LEAK", cause);
    this.name = "CredentialLeakError";
    this.credentialType = credentialType;
    this.location = location;
  }
}

export class RateLimitExceededError extends SecurityError {
  readonly domain: string;
  readonly retryAfterMs: number;

  constructor(domain: string, retryAfterMs: number, cause?: Error) {
    super(`Rate limit exceeded for ${domain}`, "RATE_LIMIT_EXCEEDED", cause);
    this.name = "RateLimitExceededError";
    this.domain = domain;
    this.retryAfterMs = retryAfterMs;
  }
}

export class CspViolationError extends SecurityError {
  readonly directive: string;
  readonly target: string;

  constructor(directive: string, target: string, cause?: Error) {
    super(
      `CSP violation: ${directive} blocks ${target}`,
      "CSP_VIOLATION",
      cause,
    );
    this.name = "CspViolationError";
    this.directive = directive;
    this.target = target;
  }
}

export class ActionValidationError extends SecurityError {
  readonly actionType: string;
  readonly issues: string[];

  constructor(actionType: string, issues: string[], cause?: Error) {
    super(
      `Action validation failed for ${actionType}`,
      "ACTION_VALIDATION_ERROR",
      cause,
    );
    this.name = "ActionValidationError";
    this.actionType = actionType;
    this.issues = issues;
  }
}

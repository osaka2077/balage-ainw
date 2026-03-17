/**
 * API-spezifische Error-Klassen
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string, code: string = "AUTH_INVALID_KEY") {
    super(message, code, 401);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string, code: string = "AUTH_FORBIDDEN") {
    super(message, code, 403);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "ValidationError";
  }
}

export class RateLimitError extends ApiError {
  constructor(retryAfter: number) {
    super("Rate limit exceeded", "RATE_LIMIT_EXCEEDED", 429, { retryAfter });
    this.name = "RateLimitError";
  }
}

export class IdempotencyConflictError extends ApiError {
  constructor(key: string) {
    super(`Idempotency key conflict: ${key}`, "IDEMPOTENCY_CONFLICT", 409);
    this.name = "IdempotencyConflictError";
  }
}

export class WorkflowExecutionApiError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "WORKFLOW_EXECUTION_ERROR", 500, details);
    this.name = "WorkflowExecutionApiError";
  }
}

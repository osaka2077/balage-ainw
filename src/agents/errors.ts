/**
 * Agent-spezifische Error-Klassen
 * Alle Fehler im Sub-Agent System erben von AgentError.
 */

export class AgentError extends Error {
  readonly code: string;
  override readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.cause = cause;
  }
}

export class AgentNotFoundError extends AgentError {
  readonly agentType: string;

  constructor(agentType: string) {
    super(
      `Agent type "${agentType}" is not registered`,
      "AGENT_NOT_FOUND",
    );
    this.name = "AgentNotFoundError";
    this.agentType = agentType;
  }
}

export class AgentRegistrationError extends AgentError {
  constructor(message: string) {
    super(message, "AGENT_REGISTRATION_ERROR");
    this.name = "AgentRegistrationError";
  }
}

export class AgentExecutionError extends AgentError {
  readonly agentId: string;
  readonly taskId: string;

  constructor(agentId: string, taskId: string, message: string, cause?: Error) {
    super(message, "AGENT_EXECUTION_ERROR", cause);
    this.name = "AgentExecutionError";
    this.agentId = agentId;
    this.taskId = taskId;
  }
}

export class AgentTimeoutError extends AgentError {
  readonly timeout: number;
  readonly elapsed: number;

  constructor(timeout: number, elapsed: number) {
    super(
      `Agent timed out after ${elapsed}ms (limit: ${timeout}ms)`,
      "AGENT_TIMEOUT",
    );
    this.name = "AgentTimeoutError";
    this.timeout = timeout;
    this.elapsed = elapsed;
  }
}

export class ActionBudgetExceededError extends AgentError {
  readonly budget: number;
  readonly used: number;

  constructor(budget: number, used: number) {
    super(
      `Action budget exceeded: ${used}/${budget} actions used`,
      "ACTION_BUDGET_EXCEEDED",
    );
    this.name = "ActionBudgetExceededError";
    this.budget = budget;
    this.used = used;
  }
}

export class PermissionDeniedError extends AgentError {
  readonly action: string;
  readonly agentType: string;

  constructor(action: string, agentType: string) {
    super(
      `Permission denied: agent type "${agentType}" cannot perform "${action}"`,
      "PERMISSION_DENIED",
    );
    this.name = "PermissionDeniedError";
    this.action = action;
    this.agentType = agentType;
  }
}

export class ResultValidationError extends AgentError {
  constructor(message: string, cause?: Error) {
    super(message, "RESULT_VALIDATION_ERROR", cause);
    this.name = "ResultValidationError";
  }
}

export class SandboxViolationError extends AgentError {
  readonly violation: string;

  constructor(violation: string) {
    super(
      `Sandbox violation: ${violation}`,
      "SANDBOX_VIOLATION",
    );
    this.name = "SandboxViolationError";
    this.violation = violation;
  }
}

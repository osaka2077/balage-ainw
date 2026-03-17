/**
 * Risk Gate — Error-Klassen
 * Alle Error-Klassen fuer das Risk Gate Modul.
 */

export class RiskGateError extends Error {
  readonly code: string;
  readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = "RiskGateError";
    this.code = code;
    this.cause = cause;
  }
}

export class GateEvaluationError extends RiskGateError {
  constructor(message: string, cause?: Error) {
    super(message, "GATE_EVALUATION_ERROR", cause);
    this.name = "GateEvaluationError";
  }
}

export class PolicyEvaluationError extends RiskGateError {
  constructor(message: string, cause?: Error) {
    super(message, "POLICY_EVALUATION_ERROR", cause);
    this.name = "PolicyEvaluationError";
  }
}

export class ActionClassificationError extends RiskGateError {
  constructor(message: string, cause?: Error) {
    super(message, "ACTION_CLASSIFICATION_ERROR", cause);
    this.name = "ActionClassificationError";
  }
}

export class ThresholdError extends RiskGateError {
  constructor(message: string, cause?: Error) {
    super(message, "THRESHOLD_ERROR", cause);
    this.name = "ThresholdError";
  }
}

export class ContradictionDetectionError extends RiskGateError {
  constructor(message: string, cause?: Error) {
    super(message, "CONTRADICTION_DETECTION_ERROR", cause);
    this.name = "ContradictionDetectionError";
  }
}

export class AuditTrailError extends RiskGateError {
  constructor(message: string, cause?: Error) {
    super(message, "AUDIT_TRAIL_ERROR", cause);
    this.name = "AuditTrailError";
  }
}

export class AuditTrailImmutableError extends AuditTrailError {
  constructor() {
    super("Audit trail entries are immutable — no update or delete allowed");
    this.name = "AuditTrailImmutableError";
  }
}

export class EscalationError extends RiskGateError {
  constructor(message: string, cause?: Error) {
    super(message, "ESCALATION_ERROR", cause);
    this.name = "EscalationError";
  }
}

export class EscalationTimeoutError extends EscalationError {
  constructor(timeoutMs: number) {
    super(`Escalation timed out after ${timeoutMs}ms — defaulting to DENY`);
    this.name = "EscalationTimeoutError";
  }
}

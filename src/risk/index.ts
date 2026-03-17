/**
 * Risk Gate — Public API
 *
 * Layer 4b: Policy Engine mit Default-Deny, Audit-Trail, Action-Klassifizierung.
 * Safety-kritisches Modul.
 */

// Gate
export { RiskGate } from "./gate.js";
export type { RiskGateOptions } from "./gate.js";

// Policy Engine
export { PolicyEngine } from "./policy-engine.js";

// Action Classifier
export { classifyAction, getActionClass } from "./action-classifier.js";

// Threshold Manager
export { ThresholdManager } from "./threshold-manager.js";

// Contradiction Detector
export { detectContradictions } from "./contradiction-detector.js";

// Audit Trail
export { AuditTrail } from "./audit-trail.js";
export type { AuditTrailOptions } from "./audit-trail.js";

// Escalation Handler
export { EscalationHandler } from "./escalation-handler.js";
export type { EscalationHandlerOptions } from "./escalation-handler.js";

// Policy Rules
export { getDefaultRules } from "./policy-rules/default-rules.js";
export { getCommerceRules } from "./policy-rules/commerce-rules.js";
export { getAuthRules } from "./policy-rules/auth-rules.js";

// Types
export type {
  ActionType,
  ActionClass,
  GateContext,
  PolicyResult,
  ContradictionResult,
  EscalationRequest,
  EscalationResponse,
  PendingEscalation,
} from "./types.js";

export {
  ActionTypeSchema,
  ActionClassSchema,
  GateContextSchema,
  EscalationRequestSchema,
} from "./types.js";

// Error Classes
export {
  RiskGateError,
  GateEvaluationError,
  PolicyEvaluationError,
  ActionClassificationError,
  ThresholdError,
  ContradictionDetectionError,
  AuditTrailError,
  AuditTrailImmutableError,
  EscalationError,
  EscalationTimeoutError,
} from "./errors.js";

/**
 * Security Hardening — Lokale Typen
 * Re-Exports aus shared_interfaces + Security-spezifische Typen.
 */

// Re-Exports aus shared_interfaces
export type {
  DomNode,
  AccessibilityNode,
  Endpoint,
  Evidence,
  GateDecision,
  AuditEntry,
  UISegment,
  Affordance,
} from "../../shared_interfaces.js";

export {
  EndpointSchema,
  EvidenceSchema,
  GateDecisionSchema,
  AuditEntrySchema,
  RiskLevelSchema,
} from "../../shared_interfaces.js";

// ============================================================================
// Sanitizer
// ============================================================================

export interface SanitizerConfig {
  maxLength: number;
  removeScripts: boolean;
  removeStyles: boolean;
  removeEventHandlers: boolean;
  removeHiddenContent: boolean;
  removeControlChars: boolean;
  removeDataUris: boolean;
}

export interface SanitizeResult {
  sanitized: string;
  removedElements: Array<{
    type:
      | "script"
      | "style"
      | "event_handler"
      | "hidden_content"
      | "control_char"
      | "data_uri";
    count: number;
    details?: string;
  }>;
  originalLength: number;
  sanitizedLength: number;
  wasTruncated: boolean;
}

// ============================================================================
// Injection Detector
// ============================================================================

export interface InjectionDetectorConfig {
  sensitivity: "low" | "medium" | "high";
  customPatterns: InjectionPattern[];
  maxInputLength: number;
}

export interface InjectionDetectionResult {
  isClean: boolean;
  score: number;
  verdict: "clean" | "warning" | "suspicious" | "blocked";
  matches: Array<{
    pattern: string;
    position: number;
    matchedText: string;
    confidence: number;
  }>;
  recommendation: "allow" | "sanitize" | "block";
}

export interface InjectionPattern {
  name: string;
  pattern: RegExp;
  severity: number;
  description: string;
  category:
    | "instruction_override"
    | "role_hijack"
    | "delimiter_injection"
    | "output_manipulation"
    | "encoding_attack"
    | "unicode_trick";
}

// ============================================================================
// Credential Guard
// ============================================================================

export interface CredentialGuardConfig {
  detectPasswords: boolean;
  detectCreditCards: boolean;
  detectApiKeys: boolean;
  detectTokens: boolean;
  detectPrivateKeys: boolean;
  detectConnectionStrings: boolean;
  luhnValidation: boolean;
  customKeyPatterns: string[];
}

export type CredentialType =
  | "password"
  | "credit_card"
  | "api_key"
  | "bearer_token"
  | "private_key"
  | "connection_string"
  | "ssn"
  | "aws_key"
  | "github_token"
  | "slack_token"
  | "jwt";

export interface CredentialScanResult {
  hasCredentials: boolean;
  findings: Array<{
    type: CredentialType;
    position: number;
    length: number;
    redacted: string;
    confidence: number;
  }>;
  recommendation: "safe" | "contains_credentials" | "high_risk";
}

export interface GuardedData {
  data: Record<string, unknown>;
  blockedFields: Array<{
    path: string;
    type: CredentialType;
    reason: string;
  }>;
  hasBlockedContent: boolean;
}

export interface BlockResult {
  prompt: string;
  context: Record<string, unknown>;
  blocked: Array<{
    location: "prompt" | "context";
    type: CredentialType;
    path?: string;
  }>;
  isClean: boolean;
}

// ============================================================================
// Rate Limiter
// ============================================================================

export interface RateLimiterConfig {
  defaultPerDomain: RateLimit;
  defaultPerSession: RateLimit;
  globalLimit: RateLimit;
  domainOverrides: Record<string, RateLimit>;
  cleanupIntervalMs: number;
}

export interface RateLimit {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  windowMs: number;
  retryAfterMs?: number;
  blockedBy: "domain" | "session" | "global" | null;
}

export interface QuotaInfo {
  domain: { remaining: number; limit: number; windowMs: number };
  session: { remaining: number; limit: number; windowMs: number };
  global: { remaining: number; limit: number; windowMs: number };
}

export interface RateLimitStats {
  totalRequests: number;
  totalBlocked: number;
  perDomain: Record<string, { requests: number; blocked: number }>;
}

// ============================================================================
// CSP Analyzer
// ============================================================================

export interface CspPolicy {
  directives: Record<string, string[]>;
  reportOnly: boolean;
  raw: string;
}

export interface CspAction {
  type:
    | "form_submit"
    | "navigate"
    | "script_execute"
    | "frame_embed"
    | "connect";
  target: string;
}

export interface CspCheckResult {
  allowed: boolean;
  directive: string;
  reason: string;
  reportOnly: boolean;
}

export type CspSecurityLevel = "strict" | "moderate" | "permissive" | "none";

// ============================================================================
// Action Validator
// ============================================================================

export interface ActionValidatorConfig {
  strictMode: boolean;
  blockInvisibleClicks: boolean;
  blockNonInteractive: boolean;
  warnOnDomainChange: boolean;
  customRules: ValidationRule[];
}

export interface PlannedAction {
  type:
    | "click"
    | "fill"
    | "select"
    | "submit"
    | "navigate"
    | "scroll"
    | "upload";
  target: {
    selector?: string;
    xpath?: string;
    tagName: string;
    attributes: Record<string, string>;
    isVisible: boolean;
    isInteractive: boolean;
    boundingBox?: { x: number; y: number; width: number; height: number };
    textContent?: string;
  };
  data?: Record<string, unknown>;
  expectedOutcome?: string;
}

export interface ActionContext {
  currentUrl: string;
  workflowId: string;
  stepId: string;
  previousActions: PlannedAction[];
  endpoint?: import("../../shared_interfaces.js").Endpoint;
  cspPolicy?: CspPolicy;
}

export interface ActionValidationResult {
  valid: boolean;
  score: number;
  verdict: "valid" | "warning" | "suspicious" | "blocked";
  issues: Array<{
    type:
      | "visibility"
      | "interactivity"
      | "type_mismatch"
      | "suspicious_pattern"
      | "csp_violation";
    severity: "low" | "medium" | "high" | "critical";
    message: string;
  }>;
  recommendation: "proceed" | "proceed_with_caution" | "block";
}

export interface ValidationRule {
  name: string;
  check: (
    action: PlannedAction,
    context: ActionContext,
  ) => {
    valid: boolean;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
  };
}

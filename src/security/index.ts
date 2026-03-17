/**
 * Security Hardening — Public API
 */

// Core
export { InputSanitizer } from "./input-sanitizer.js";
export { InjectionDetector } from "./injection-detector.js";
export { CredentialGuard } from "./credential-guard.js";
export { RateLimiter } from "./rate-limiter.js";
export { CspAnalyzer } from "./csp-analyzer.js";
export { ActionValidator } from "./action-validator.js";

// Typen
export type {
  SanitizerConfig,
  SanitizeResult,
  InjectionDetectorConfig,
  InjectionDetectionResult,
  InjectionPattern,
  CredentialGuardConfig,
  CredentialScanResult,
  CredentialType,
  GuardedData,
  BlockResult,
  RateLimiterConfig,
  RateLimit,
  RateLimitResult,
  QuotaInfo,
  RateLimitStats,
  CspPolicy,
  CspAction,
  CspCheckResult,
  CspSecurityLevel,
  ActionValidatorConfig,
  PlannedAction,
  ActionContext,
  ActionValidationResult,
  ValidationRule,
} from "./types.js";

// Error-Klassen
export {
  SecurityError,
  SanitizationError,
  InjectionDetectedError,
  CredentialLeakError,
  RateLimitExceededError,
  CspViolationError,
  ActionValidationError,
} from "./errors.js";

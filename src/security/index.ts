/**
 * Security Hardening — Public API
 */

// Kern-Exports (benutzt vom npm-Package via endpoint-generator.ts)
export { InputSanitizer } from "./input-sanitizer.js";
export { InjectionDetector } from "./injection-detector.js";
export { CredentialGuard } from "./credential-guard.js";

// RateLimiter, CspAnalyzer, ActionValidator sind NICHT im Barrel:
// Nur von Tests genutzt (importieren direkt aus ihren Dateien).
// Verfuegbar via direktem Import: ./rate-limiter.js, ./csp-analyzer.js, ./action-validator.js

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

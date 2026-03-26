/**
 * @balage/core — Semantic Verification Layer for Browser Agents
 *
 * @example
 * ```typescript
 * import { analyzeFromHTML, detectFramework } from "./core/index.js";
 *
 * const result = await analyzeFromHTML("<html>...</html>", {
 *   url: "https://example.com",
 *   llm: { provider: "openai", apiKey: process.env.OPENAI_API_KEY! },
 * });
 * console.log(result.endpoints);
 * ```
 */

export const VERSION = "0.5.0-alpha.1";

// High-Level API
export { analyzeFromHTML } from "./analyze.js";
export { verify, verifyFromHTML } from "./verify.js";
export type { VerifyInput, VerifyOutput } from "./verify.js";
export { detectFramework } from "./detect-framework.js";
export { htmlToDomNode } from "./html-to-dom.js";
export { inferSelector } from "./infer-selector.js";

// Error Classes (value exports fuer instanceof-Checks)
export { BalageError, BalageInputError, BalageLLMError } from "./types.js";

// Types
export type {
  AnalyzeOptions,
  AnalysisResult,
  DetectedEndpoint,
  FrameworkDetection,
  LLMConfig,
  EndpointType,
  AffordanceType,
  DomNode,
} from "./types.js";

// Verify Types
export type {
  ActionSnapshot,
  PageState,
  CookieInfo,
  NetworkRequest,
  ActionInfo,
  VerificationExpectation,
  VerificationScenario,
  VerifyOptions,
  VerificationResult,
  VerificationVerdict,
  CheckResult,
  CheckSource,
  DomDiffResult,
  ElementChange,
  TextChange,
  AttributeChange,
  AuditEntry,
  CustomCheckDefinition,
} from "./verify-types.js";

// Cache
export { clearCache, cacheStats } from "./fingerprint-cache.js";
export type { FingerprintCacheOptions } from "./types.js";

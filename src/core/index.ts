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

export const VERSION = "0.1.0-alpha.1";

// High-Level API
export { analyzeFromHTML } from "./analyze.js";
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

/**
 * @balage/core — Semantic Verification Layer for Browser Agents
 *
 * Identifies interactive endpoints on web pages with confidence scores.
 * Works with raw HTML (no browser needed) or Playwright Page objects.
 *
 * @example
 * ```typescript
 * import { analyzeFromHTML } from "@balage/core";
 *
 * const result = await analyzeFromHTML("<html>...</html>", {
 *   url: "https://example.com",
 *   llm: { provider: "openai", apiKey: process.env.OPENAI_API_KEY! },
 * });
 *
 * console.log(result.endpoints);
 * // [{type: "auth", label: "Login Form", confidence: 0.92, ...}]
 * ```
 */

export const VERSION = "0.1.0-alpha.1";

// High-Level API
export { analyzeFromHTML } from "./analyze.js";
export { detectFramework } from "./detect-framework.js";
export { htmlToDomNode } from "./html-to-dom.js";

// Types
export type {
  AnalyzeOptions,
  AnalysisResult,
  DetectedEndpoint,
  FrameworkDetection,
  LLMConfig,
  DomNode,
  AccessibilityNode,
  UISegment,
  Endpoint,
  EndpointType,
} from "./types.js";

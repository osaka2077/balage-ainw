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

export { analyzeFromHTML } from "./analyze.js";
export { detectFramework } from "./detect-framework.js";
export { htmlToDomNode } from "./html-to-dom.js";

export type {
  AnalyzeOptions,
  AnalysisResult,
  DetectedEndpoint,
  FrameworkDetection,
  LLMConfig,
  DomNode,
  UISegment,
  Endpoint,
  EndpointType,
} from "./types.js";

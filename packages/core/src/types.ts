/**
 * @balage/core — Public Types
 *
 * Re-exports from shared_interfaces + core-specific types.
 */

// Re-export the core types that consumers need
export type {
  DomNode,
  AccessibilityNode,
  UISegment,
  Endpoint,
  EndpointType,
  Evidence,
  BoundingBox,
  SemanticLabel,
  Affordance,
  SemanticFingerprint,
} from "../../shared_interfaces.js";

/** Options for analyzeFromHTML */
export interface AnalyzeOptions {
  /** URL of the page (for context in LLM prompts) */
  url?: string;
  /** Use LLM for classification. Default: true. Set false for heuristic-only mode. */
  llm?: boolean | LLMConfig;
  /** Minimum confidence threshold. Default: 0.50 */
  minConfidence?: number;
  /** Maximum endpoints to return. Default: 10 */
  maxEndpoints?: number;
}

/** LLM configuration */
export interface LLMConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
  model?: string;
}

/** Detected framework info */
export interface FrameworkDetection {
  framework: string;
  confidence: number;
  version?: string;
  evidence: string[];
}

/** Simplified endpoint result for the public API */
export interface DetectedEndpoint {
  type: string;
  label: string;
  description: string;
  confidence: number;
  selector?: string;
  affordances: string[];
  evidence: string[];
}

/** Analysis result */
export interface AnalysisResult {
  endpoints: DetectedEndpoint[];
  framework?: FrameworkDetection;
  timing: {
    totalMs: number;
    llmCalls: number;
  };
  meta: {
    url?: string;
    mode: "llm" | "heuristic";
    version: string;
  };
}

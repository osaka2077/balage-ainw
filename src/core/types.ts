/**
 * @balage/core — Public Types
 */

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

export interface AnalyzeOptions {
  url?: string;
  llm?: boolean | LLMConfig;
  minConfidence?: number;
  maxEndpoints?: number;
}

export interface LLMConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
  model?: string;
}

export interface FrameworkDetection {
  framework: string;
  confidence: number;
  version?: string;
  evidence: string[];
}

export interface DetectedEndpoint {
  type: string;
  label: string;
  description: string;
  confidence: number;
  selector?: string;
  affordances: string[];
  evidence: string[];
}

export interface AnalysisResult {
  endpoints: DetectedEndpoint[];
  framework?: FrameworkDetection;
  timing: { totalMs: number; llmCalls: number };
  meta: { url?: string; mode: "llm" | "heuristic"; version: string };
}

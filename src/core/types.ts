/**
 * @balage/core — Public Types & Error Classes
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

// ============================================================================
// Error Types — spezifische Fehlerklassen fuer klare Diagnose
// ============================================================================

/**
 * Basis-Fehlerklasse fuer alle @balage/core Fehler.
 * Ermoeglicht instanceof-Checks und hat einen maschinenlesbaren `code`.
 */
export class BalageError extends Error {
  readonly code: string;
  readonly cause?: Error;

  constructor(message: string, code: string = "BALAGE_ERROR", cause?: Error) {
    super(message);
    this.name = "BalageError";
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Fehler bei ungueltigem Input (z.B. html ist kein String). */
export class BalageInputError extends BalageError {
  constructor(message: string, cause?: Error) {
    super(message, "BALAGE_INPUT_ERROR", cause);
    this.name = "BalageInputError";
  }
}

/** Fehler bei LLM-Kommunikation (falscher API-Key, Rate Limit, Timeout). */
export class BalageLLMError extends BalageError {
  readonly provider: string;

  constructor(message: string, provider: string, cause?: Error) {
    super(message, "BALAGE_LLM_ERROR", cause);
    this.name = "BalageLLMError";
    this.provider = provider;
  }
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AnalyzeOptions {
  /** URL of the page (for context in LLM prompts) */
  url?: string;
  /** Use LLM for classification. Default: true. Set false for heuristic-only. */
  llm?: boolean | LLMConfig;
  /** Minimum confidence threshold. Default: 0.50 */
  minConfidence?: number;
  /** Maximum endpoints to return. Default: 10 */
  maxEndpoints?: number;
}

export interface LLMConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
  model?: string;
}

// ============================================================================
// Result Types
// ============================================================================

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

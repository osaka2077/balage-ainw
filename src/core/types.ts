/**
 * @balage/core — Public Types & Error Classes
 */

export type {
  DomNode,
  AccessibilityNode,
  UISegment,
  Endpoint,
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

/** Endpoint type union — all recognized UI element categories */
export type EndpointType = "auth" | "form" | "search" | "navigation" | "checkout" | "commerce" | "content" | "consent" | "support" | "media" | "social" | "settings";

/** Affordance type union — all recognized interaction types */
export type AffordanceType = "click" | "fill" | "select" | "toggle" | "submit" | "navigate" | "upload" | "scroll" | "drag" | "read";

export interface AnalyzeOptions {
  /** URL of the page (for context in LLM prompts) */
  url?: string;
  /** LLM config for higher accuracy. Default: false (heuristic-only, no API key needed). */
  llm?: false | LLMConfig;
  /** Minimum confidence threshold. Default: 0.50 */
  minConfidence?: number;
  /** Maximum endpoints to return. Default: 10 */
  maxEndpoints?: number;
  /** Fingerprint cache. Default: true. Pass false to disable or options to configure. */
  cache?: boolean | FingerprintCacheOptions;
  /**
   * Number of parallel LLM calls per segment for majority-vote stabilization.
   * Each segment gets N LLM calls; endpoints must appear in >= ceil(N/2) runs.
   * Falls back to BALAGE_RUNS env var. Range: 1-5. Default: 1 (no multi-run).
   */
  multiRun?: number;
}

export interface FingerprintCacheOptions {
  /** Minimum similarity for cache hit. Default: 0.95 */
  similarityThreshold?: number;
  /** Time-to-live in milliseconds. Default: 3600000 (1h) */
  ttlMs?: number;
  /** Maximum cached results. Default: 1000 */
  maxSize?: number;
  /** Site identifier. Default: URL hostname */
  siteId?: string;
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
  type: EndpointType;
  label: string;
  description: string;
  confidence: number;
  selector?: string;
  affordances: AffordanceType[];
  evidence: string[];
}

export interface AnalysisResult {
  endpoints: DetectedEndpoint[];
  framework?: FrameworkDetection;
  timing: { totalMs: number; llmCalls: number };
  meta: {
    url?: string;
    mode: "llm" | "heuristic";
    version: string;
    cached?: boolean;
    cacheSimilarity?: number;
    fingerprintHash?: string;
    /** Welcher Fetcher genutzt wurde (nur bei analyzeFromURL). */
    fetcherType?: "firecrawl" | "playwright";
    /** Fetch-Timing in ms (nur bei analyzeFromURL). */
    fetchTimingMs?: number;
  };
}

// ============================================================================
// analyzeFromURL Options (FC-010)
// ============================================================================

export interface AnalyzeFromURLOptions extends AnalyzeOptions {
  /** Welcher Fetcher-Provider. Default: 'auto' (Firecrawl wenn Key vorhanden). */
  fetcherProvider?: "firecrawl" | "playwright" | "auto";

  /** Firecrawl API Key. Alternativ: BALAGE_FIRECRAWL_API_KEY env var. */
  firecrawlApiKey?: string;

  /** Firecrawl API Base URL. Default: https://api.firecrawl.dev */
  firecrawlApiUrl?: string;

  /** Max Response Size in MB. Default: 5 */
  maxResponseSizeMb?: number;

  /** HTTP URLs erlauben (nur Entwicklung). Default: false */
  allowHttp?: boolean;
}

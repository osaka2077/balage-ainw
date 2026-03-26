/**
 * @balage/core — Type Declarations
 *
 * Semantic Verification Layer for Browser Agents.
 * Identifies interactive endpoints on web pages with confidence scores.
 *
 * @packageDocumentation
 */

// ============================================================================
// Constants
// ============================================================================

/** Current package version */
export declare const VERSION: string;

// ============================================================================
// Core Types
// ============================================================================

/** Structured DOM node — minimal representation for parsing */
export interface DomNode {
  tagName: string;
  attributes: Record<string, string>;
  textContent?: string;
  isVisible: boolean;
  isInteractive: boolean;
  boundingBox?: BoundingBox;
  computedStyles?: {
    display: string;
    visibility: string;
    opacity: number;
  };
  domPath?: string;
  children: DomNode[];
}

/** Bounding box in pixels */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Accessibility tree node */
export interface AccessibilityNode {
  role: string;
  name: string;
  value?: string;
  description?: string;
  checked?: "true" | "false" | "mixed";
  disabled: boolean;
  required: boolean;
  expanded?: boolean;
  selected?: boolean;
  level?: number;
  boundingBox?: BoundingBox;
  children: AccessibilityNode[];
}

/** UI segment types */
export type UISegmentType =
  | "form"
  | "navigation"
  | "content"
  | "header"
  | "footer"
  | "sidebar"
  | "modal"
  | "overlay"
  | "banner"
  | "table"
  | "list"
  | "media"
  | "search"
  | "checkout"
  | "unknown";

/** Segmented UI fragment */
export interface UISegment {
  id: string;
  type: UISegmentType;
  label?: string;
  confidence: number;
  boundingBox: BoundingBox;
  nodes: DomNode[];
  interactiveElementCount: number;
  semanticRole?: string;
  parentSegmentId?: string;
}

/** Endpoint category */
export type EndpointType =
  | "form"
  | "checkout"
  | "support"
  | "navigation"
  | "auth"
  | "search"
  | "commerce"
  | "content"
  | "consent"
  | "media"
  | "social"
  | "settings";

/** Full endpoint (internal pipeline result) */
export interface Endpoint {
  id: string;
  type: EndpointType;
  label: string;
  description: string;
  confidence: number;
  url?: string;
  selector?: string;
  affordances: string[];
  evidence: string[];
}

// ============================================================================
// Configuration
// ============================================================================

/** Options for analyzeFromHTML */
export interface AnalyzeOptions {
  /** URL of the page (for context in LLM prompts) */
  url?: string;
  /**
   * Use LLM for classification.
   * - `true` (default): Enables LLM mode, requires LLMConfig.
   * - `false`: Heuristic-only mode, no API key needed.
   * - `LLMConfig`: LLM mode with explicit configuration.
   */
  llm?: boolean | LLMConfig;
  /** Minimum confidence threshold (0-1). Default: 0.50 */
  minConfidence?: number;
  /** Maximum endpoints to return. Default: 10 */
  maxEndpoints?: number;
}

/** LLM provider configuration */
export interface LLMConfig {
  /** LLM provider to use */
  provider: "openai" | "anthropic";
  /** API key for the provider */
  apiKey: string;
  /** Model name override (optional) */
  model?: string;
}

// ============================================================================
// Results
// ============================================================================

/** Detected framework information */
export interface FrameworkDetection {
  /** Framework name (e.g., "react", "nextjs", "shopify") */
  framework: string;
  /** Detection confidence (0-1) */
  confidence: number;
  /** Detected version, if available */
  version?: string;
  /** Evidence that led to the detection */
  evidence: string[];
}

/** Endpoint type — all recognized UI element categories */
export type EndpointType = "auth" | "form" | "search" | "navigation" | "checkout" | "commerce" | "content" | "consent" | "support" | "media" | "social" | "settings";

/** Affordance type — all recognized interaction types */
export type AffordanceType = "click" | "fill" | "select" | "toggle" | "submit" | "navigate" | "upload" | "scroll" | "drag" | "read";

/** Simplified endpoint result for the public API */
export interface DetectedEndpoint {
  /** Endpoint type */
  type: EndpointType;
  /** Human-readable label (e.g., "Login / Sign-In Form") */
  label: string;
  /** Descriptive summary of the endpoint */
  description: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** CSS selector to locate the endpoint, if available */
  selector?: string;
  /** Possible user interactions */
  affordances: AffordanceType[];
  /** Evidence supporting the classification */
  evidence: string[];
}

/** Complete analysis result returned by analyzeFromHTML */
export interface AnalysisResult {
  /** Detected endpoints, sorted by confidence (descending) */
  endpoints: DetectedEndpoint[];
  /** Detected web framework, if any */
  framework?: FrameworkDetection;
  /** Performance timing */
  timing: {
    /** Total analysis time in milliseconds */
    totalMs: number;
    /** Number of LLM API calls made (0 in heuristic mode) */
    llmCalls: number;
  };
  /** Analysis metadata */
  meta: {
    /** URL that was analyzed */
    url?: string;
    /** Analysis mode used */
    mode: "llm" | "heuristic";
    /** Package version */
    version: string;
  };
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error class for all @balage/core errors.
 * Supports `instanceof` checks and includes a machine-readable `code`.
 */
export declare class BalageError extends Error {
  readonly code: string;
  readonly cause?: Error;
  constructor(message: string, code?: string, cause?: Error);
}

/**
 * Thrown when invalid input is provided (e.g., html is not a string).
 */
export declare class BalageInputError extends BalageError {
  constructor(message: string, cause?: Error);
}

/**
 * Thrown when the LLM provider returns an error
 * (invalid API key, rate limit, timeout, etc.).
 */
export declare class BalageLLMError extends BalageError {
  readonly provider: string;
  constructor(message: string, provider: string, cause?: Error);
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Analyze raw HTML and return detected endpoints.
 *
 * Works without a browser — pass any HTML string.
 * Use `llm: false` for fast heuristic-only analysis (no API key needed).
 *
 * @example
 * ```typescript
 * // Heuristic mode (no API key needed)
 * const result = await analyzeFromHTML(html, {
 *   url: "https://example.com",
 *   llm: false,
 * });
 *
 * // LLM mode (requires API key)
 * const result = await analyzeFromHTML(html, {
 *   url: "https://example.com",
 *   llm: { provider: "openai", apiKey: process.env.OPENAI_API_KEY! },
 * });
 * ```
 *
 * @param html - Raw HTML string of the page
 * @param options - Configuration options
 * @returns Analysis result with endpoints, framework detection, and timing
 *
 * @throws {BalageInputError} When html is not a string
 * @throws {BalageLLMError} When LLM provider returns an error
 * @throws {BalageError} For unexpected internal errors
 */
export declare function analyzeFromHTML(
  html: string,
  options?: AnalyzeOptions,
): Promise<AnalysisResult>;

/**
 * Detect the web framework used by the page.
 *
 * Checks for React, Next.js, Angular, Vue, Svelte,
 * Shopify, WordPress, and Salesforce.
 *
 * @param html - Raw HTML string
 * @returns Framework detection result or null if no framework detected
 */
export declare function detectFramework(
  html: string,
): FrameworkDetection | null;

/**
 * Parse raw HTML into a DomNode tree.
 *
 * Handles real-world HTML including self-closing tags,
 * malformed markup, and edge cases without throwing.
 *
 * @param html - Raw HTML string
 * @returns Root DomNode (tagName: "body")
 */
export declare function htmlToDomNode(html: string): DomNode;

/**
 * Infer a CSS selector from a DomNode tree.
 *
 * Uses a 6-level priority chain:
 * 1. form[action="..."] — stable backend routes
 * 2. #element-id — unique IDs (filters dynamic framework IDs)
 * 3. [role="..."] — ARIA semantic roles
 * 4. form:has(input[type=...]) — structural selectors
 * 5. Semantic tags (nav, footer, header)
 * 6. tag.class — fallback
 *
 * @param root - DomNode tree to analyze
 * @returns CSS selector string or undefined if no stable selector found
 */
export declare function inferSelector(root: DomNode): string | undefined;

// ============================================================================
// Verification Types
// ============================================================================

/** Page state snapshot (before or after an action) */
export interface PageState {
  html: string;
  url: string;
  timestamp: number;
  cookies?: CookieInfo[];
}

/** Cookie info — values are NEVER stored, only name + existence */
export interface CookieInfo {
  name: string;
  exists: boolean;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

/** Network request — bodies are NEVER stored */
export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
}

/** Action that was performed */
export interface ActionInfo {
  type: string;
  selector?: string;
  endpointType?: EndpointType;
}

/** Before/after snapshot of a browser action */
export interface ActionSnapshot {
  before: PageState;
  after: PageState;
  networkRequests?: NetworkRequest[];
  action: ActionInfo;
}

/** Verification scenario types */
export type VerificationScenario =
  | "login"
  | "form_submit"
  | "navigation"
  | "modal_open"
  | "modal_close"
  | "error";

/** What we expect the action to have done */
export interface VerificationExpectation {
  type: VerificationScenario;
  customChecks?: CustomCheckDefinition[];
}

/** Custom DOM-based verification check */
export interface CustomCheckDefinition {
  name: string;
  selector: string;
  expectation: "present" | "absent" | "visible" | "hidden" | "text_contains" | "text_changed";
  value?: string;
}

/** Options for verify() / verifyFromHTML() */
export interface VerifyOptions {
  minConfidence?: number;
  audit?: boolean;
}

/** Verification verdict */
export type VerificationVerdict = "verified" | "failed" | "inconclusive";

/** Source of a verification check */
export type CheckSource = "dom-diff" | "url-change" | "network" | "cookie" | "custom" | "strategy";

/** Individual check result */
export interface CheckResult {
  name: string;
  passed: boolean;
  confidence: number;
  evidence: string;
  source: CheckSource;
  weight?: number;
}

/** DOM change detail */
export interface ElementChange {
  tagName: string;
  id?: string;
  classes?: string[];
  textContent?: string;
}

/** Text content change */
export interface TextChange {
  tagName: string;
  before: string;
  after: string;
}

/** Attribute change */
export interface AttributeChange {
  tagName: string;
  id?: string;
  attribute: string;
  before: string | null;
  after: string | null;
}

/** DOM diff between before and after states */
export interface DomDiffResult {
  addedElements: ElementChange[];
  removedElements: ElementChange[];
  textChanges: TextChange[];
  attributeChanges: AttributeChange[];
  significantChanges: number;
}

/** Audit trail entry */
export interface AuditEntry {
  timestamp: number;
  phase: string;
  detail: string;
}

/** Complete verification result */
export interface VerificationResult {
  verdict: VerificationVerdict;
  confidence: number;
  checks: CheckResult[];
  domDiff: DomDiffResult;
  timing: { totalMs: number };
  audit?: AuditEntry[];
}

/** Synchronous verify input (DomNode-based) */
export interface VerifyInput {
  endpointType: EndpointType | string;
  beforeUrl: string;
  afterUrl: string;
  beforeDom: DomNode;
  afterDom: DomNode;
  cookies?: { before?: CookieInfo[]; after?: CookieInfo[] };
  networkRequests?: NetworkRequest[];
  customChecks?: CustomCheckDefinition[];
}

/** Synchronous verify output */
export interface VerifyOutput {
  status: VerificationVerdict;
  confidence: number;
  checks: CheckResult[];
  domDiff: DomDiffResult;
}

// ============================================================================
// Verification Functions
// ============================================================================

/**
 * Verify whether a browser action was successful.
 *
 * Synchronous, DomNode-based API. Uses heuristic checks
 * (DOM diff, URL change, cookies, network) to determine
 * if the action achieved its intended effect.
 *
 * @param input - Before/after state with action context
 * @returns Verification result with verdict, confidence, and evidence
 */
export declare function verify(input: VerifyInput): VerifyOutput;

/**
 * Verify an action from raw HTML snapshots.
 *
 * Async, HTML-based API. Parses HTML internally.
 *
 * @param snapshot - Before/after HTML + URL + optional cookies/network
 * @param expectation - What scenario to verify (login, form_submit, etc.)
 * @param options - Optional thresholds and audit settings
 * @returns Verification result
 */
export declare function verifyFromHTML(
  snapshot: ActionSnapshot,
  expectation: VerificationExpectation,
  options?: VerifyOptions,
): Promise<VerificationResult>;

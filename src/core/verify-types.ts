/**
 * verify() — Type Definitions
 *
 * Alle Types fuer das Verification-Feature.
 * Browser-agnostisch, arbeitet auf HTML-Strings.
 */

import type { EndpointType } from "./types.js";

// ============================================================================
// Input Types
// ============================================================================

export interface PageState {
  html: string;
  url: string;
  timestamp: number;
  cookies?: CookieInfo[];
}

/** SECURITY: Cookie-Werte werden NIEMALS gespeichert — nur Name + Existenz. */
export interface CookieInfo {
  name: string;
  exists: boolean;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

/** SECURITY: Request/Response-Bodies werden NIEMALS gespeichert. */
export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
}

export interface ActionInfo {
  type: string;
  selector?: string;
  endpointType?: EndpointType;
}

export interface ActionSnapshot {
  before: PageState;
  after: PageState;
  networkRequests?: NetworkRequest[];
  action: ActionInfo;
}

// ============================================================================
// Expectation Types
// ============================================================================

export type VerificationScenario =
  | "login"
  | "form_submit"
  | "navigation"
  | "modal_open"
  | "modal_close"
  | "error";

export interface VerificationExpectation {
  type: VerificationScenario;
  customChecks?: CustomCheckDefinition[];
}

export interface CustomCheckDefinition {
  name: string;
  selector: string;
  expectation:
    | "present"
    | "absent"
    | "visible"
    | "hidden"
    | "text_contains"
    | "text_changed";
  value?: string;
}

// ============================================================================
// Options
// ============================================================================

export interface VerifyOptions {
  /** Minimum confidence to count as "verified". Default: 0.65 */
  minConfidence?: number;
  /** Generate detailed audit trail. Default: false */
  audit?: boolean;
}

// ============================================================================
// Result Types
// ============================================================================

export type VerificationVerdict = "verified" | "failed" | "inconclusive";

export type CheckSource =
  | "dom-diff"
  | "url-change"
  | "network"
  | "cookie"
  | "custom"
  | "strategy";

export interface CheckResult {
  name: string;
  passed: boolean;
  confidence: number;
  evidence: string;
  source: CheckSource;
  weight?: number;
}

export interface ElementChange {
  tagName: string;
  id?: string;
  classes?: string[];
  textContent?: string;
}

export interface TextChange {
  tagName: string;
  before: string;
  after: string;
}

export interface AttributeChange {
  tagName: string;
  id?: string;
  attribute: string;
  before: string | null;
  after: string | null;
}

export interface DomDiffResult {
  addedElements: ElementChange[];
  removedElements: ElementChange[];
  textChanges: TextChange[];
  attributeChanges: AttributeChange[];
  significantChanges: number;
}

export interface AuditEntry {
  timestamp: number;
  phase: string;
  detail: string;
}

export interface VerificationResult {
  verdict: VerificationVerdict;
  confidence: number;
  checks: CheckResult[];
  domDiff: DomDiffResult;
  timing: { totalMs: number };
  audit?: AuditEntry[];
}

/**
 * verify() — Action Verification API
 *
 * Prueft ob eine Browser-Aktion erfolgreich war.
 * Heuristic-first, browser-agnostisch.
 *
 * Zwei APIs:
 *   verify(input)             — synchron, DomNode-basiert (primary)
 *   verifyFromHTML(snapshot, expectation, options?) — async, HTML-basiert
 *
 * @example
 * ```typescript
 * const result = verify({
 *   endpointType: "auth",
 *   beforeUrl: "https://example.com/login",
 *   afterUrl: "https://example.com/dashboard",
 *   beforeDom: beforeDomNode,
 *   afterDom: afterDomNode,
 * });
 * console.log(result.status); // "verified" | "failed" | "inconclusive"
 * ```
 */

import type { DomNode, EndpointType } from "./types.js";
import { BalageInputError } from "./types.js";
import type {
  ActionSnapshot,
  VerificationExpectation,
  VerifyOptions,
  VerificationResult,
  VerificationScenario,
  CheckResult,
  CookieInfo,
  NetworkRequest,
  DomDiffResult,
} from "./verify-types.js";
import { computeDomDiff, computeDomDiffFromNodes } from "./verify-checks/dom-diff.js";
import { runCustomChecks } from "./verify-checks/custom-check.js";
import { runLoginStrategy } from "./verify-strategies/login.js";
import { runFormSubmitStrategy } from "./verify-strategies/form-submit.js";
import { runNavigationStrategy } from "./verify-strategies/navigation.js";
import { runModalStrategy } from "./verify-strategies/modal.js";
import { runErrorStrategy } from "./verify-strategies/error.js";
import { computeWeightedScore, determineVerdict } from "./verify-scoring.js";
import { AuditTrail } from "./verify-audit.js";

// ============================================================================
// Simple API Types (primary, synchronous)
// ============================================================================

export interface VerifyInput {
  endpointType: EndpointType | VerificationScenario;
  beforeUrl: string;
  afterUrl: string;
  beforeDom: DomNode;
  afterDom: DomNode;
  networkRequests?: NetworkRequest[];
  beforeCookies?: CookieInfo[];
  afterCookies?: CookieInfo[];
}

export interface VerifyOutput {
  status: "verified" | "failed" | "inconclusive";
  confidence: number;
  evidence: string[];
}

// ============================================================================
// EndpointType → VerificationScenario Mapping
// ============================================================================

const ENDPOINT_TO_SCENARIO: Record<string, VerificationScenario> = {
  // EndpointType mappings
  auth: "login",
  form: "form_submit",
  search: "form_submit",
  navigation: "navigation",
  checkout: "form_submit",
  commerce: "form_submit",
  content: "navigation",
  consent: "form_submit",
  support: "form_submit",
  media: "navigation",
  social: "navigation",
  settings: "form_submit",
  // Direct VerificationScenario passthrough
  login: "login",
  form_submit: "form_submit",
  modal_open: "modal_open",
  modal_close: "modal_close",
  error: "error",
};

// ============================================================================
// Input Validation
// ============================================================================

function validateVerifyInput(input: unknown): asserts input is VerifyInput {
  if (!input || typeof input !== "object") {
    throw new BalageInputError("verify input must be an object");
  }

  const i = input as Record<string, unknown>;

  if (typeof i["endpointType"] !== "string" || !(i["endpointType"] in ENDPOINT_TO_SCENARIO)) {
    throw new BalageInputError(
      `endpointType must be one of: ${Object.keys(ENDPOINT_TO_SCENARIO).join(", ")}`,
    );
  }

  if (typeof i["beforeUrl"] !== "string") {
    throw new BalageInputError("beforeUrl must be a string");
  }
  if (typeof i["afterUrl"] !== "string") {
    throw new BalageInputError("afterUrl must be a string");
  }
  if (!i["beforeDom"] || typeof i["beforeDom"] !== "object") {
    throw new BalageInputError("beforeDom must be a DomNode");
  }
  if (!i["afterDom"] || typeof i["afterDom"] !== "object") {
    throw new BalageInputError("afterDom must be a DomNode");
  }
}

function validateSnapshot(snapshot: unknown): asserts snapshot is ActionSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    throw new BalageInputError("snapshot must be an object");
  }
  const s = snapshot as Record<string, unknown>;
  if (!s["before"] || typeof s["before"] !== "object") {
    throw new BalageInputError("snapshot.before is required");
  }
  if (!s["after"] || typeof s["after"] !== "object") {
    throw new BalageInputError("snapshot.after is required");
  }
  if (!s["action"] || typeof s["action"] !== "object") {
    throw new BalageInputError("snapshot.action is required");
  }
  const before = s["before"] as Record<string, unknown>;
  const after = s["after"] as Record<string, unknown>;
  if (typeof before["html"] !== "string") {
    throw new BalageInputError("snapshot.before.html must be a string");
  }
  if (typeof before["url"] !== "string") {
    throw new BalageInputError("snapshot.before.url must be a string");
  }
  if (typeof after["html"] !== "string") {
    throw new BalageInputError("snapshot.after.html must be a string");
  }
  if (typeof after["url"] !== "string") {
    throw new BalageInputError("snapshot.after.url must be a string");
  }
}

const VALID_SCENARIOS: ReadonlySet<VerificationScenario> = new Set([
  "login", "form_submit", "navigation", "modal_open", "modal_close", "error",
]);

function validateExpectation(
  expectation: unknown,
): asserts expectation is VerificationExpectation {
  if (!expectation || typeof expectation !== "object") {
    throw new BalageInputError("expectation must be an object");
  }
  const e = expectation as Record<string, unknown>;
  if (typeof e["type"] !== "string" || !VALID_SCENARIOS.has(e["type"] as VerificationScenario)) {
    throw new BalageInputError(
      `expectation.type must be one of: ${[...VALID_SCENARIOS].join(", ")}`,
    );
  }
}

// ============================================================================
// Strategy Dispatch
// ============================================================================

function runStrategy(
  scenario: VerificationScenario,
  snapshot: ActionSnapshot,
  domDiff: DomDiffResult,
): CheckResult[] {
  switch (scenario) {
    case "login":
      return runLoginStrategy(snapshot, domDiff);
    case "form_submit":
      return runFormSubmitStrategy(snapshot, domDiff);
    case "navigation":
      return runNavigationStrategy(snapshot, domDiff);
    case "modal_open":
    case "modal_close":
      return runModalStrategy(snapshot, domDiff, scenario);
    case "error":
      return runErrorStrategy(snapshot, domDiff);
  }
}

// ============================================================================
// Primary API: verify() — synchron, DomNode-basiert
// ============================================================================

/** Prueft ob eine Aktion erfolgreich war (synchron, DomNode-basiert). */
export function verify(input: VerifyInput): VerifyOutput {
  validateVerifyInput(input);

  const scenario = ENDPOINT_TO_SCENARIO[input.endpointType];
  if (!scenario) {
    throw new BalageInputError(`Unknown endpointType: ${input.endpointType}`);
  }

  // DOM Diff aus DomNode-Baeumen
  const domDiff = computeDomDiffFromNodes(input.beforeDom, input.afterDom);

  // ActionSnapshot als Bridge fuer Strategies
  const snapshot: ActionSnapshot = {
    before: {
      html: "",
      url: input.beforeUrl,
      timestamp: Date.now(),
      cookies: input.beforeCookies,
    },
    after: {
      html: "",
      url: input.afterUrl,
      timestamp: Date.now(),
      cookies: input.afterCookies,
    },
    networkRequests: input.networkRequests,
    action: { type: "verify", endpointType: input.endpointType as EndpointType },
  };

  // Strategy ausfuehren
  const checks = runStrategy(scenario, snapshot, domDiff);

  // Scoring
  const score = computeWeightedScore(checks);
  const verdict = determineVerdict(score);

  // Evidence sammeln
  const evidence = checks
    .filter((c) => c.passed)
    .map((c) => c.evidence);

  return {
    status: verdict,
    confidence: Math.round(score * 1000) / 1000,
    evidence,
  };
}

// ============================================================================
// Extended API: verifyFromHTML() — async, HTML-basiert
// ============================================================================

/** Prueft ob eine Aktion erfolgreich war (async, HTML-basiert). */
export async function verifyFromHTML(
  snapshot: ActionSnapshot,
  expectation: VerificationExpectation,
  options?: VerifyOptions,
): Promise<VerificationResult> {
  const startTime = performance.now();
  const audit = new AuditTrail(options?.audit ?? false);

  // Validate
  audit.log("validation", "Validating inputs");
  validateSnapshot(snapshot);
  validateExpectation(expectation);

  // DOM Diff
  audit.log("dom-diff", "Computing DOM diff");
  const domDiff = computeDomDiff(snapshot.before.html, snapshot.after.html);
  audit.log(
    "dom-diff",
    `+${domDiff.addedElements.length} -${domDiff.removedElements.length} ~${domDiff.textChanges.length} sig:${domDiff.significantChanges}`,
  );

  // Strategy
  audit.log("strategy", `Running ${expectation.type} strategy`);
  const strategyChecks = runStrategy(expectation.type, snapshot, domDiff);
  audit.log("strategy", `${strategyChecks.length} checks produced`);

  // Custom Checks
  let customChecks: CheckResult[] = [];
  if (expectation.customChecks && expectation.customChecks.length > 0) {
    audit.log("custom", `Running ${expectation.customChecks.length} custom checks`);
    customChecks = runCustomChecks(
      expectation.customChecks,
      snapshot.after.html,
      snapshot.before.html,
    );
  }

  // Scoring
  const allChecks = [...strategyChecks, ...customChecks];
  const score = computeWeightedScore(allChecks);
  const verdict = determineVerdict(score);

  audit.log("scoring", `Score: ${score.toFixed(3)}, Verdict: ${verdict}`);

  const totalMs = Math.round(performance.now() - startTime);
  audit.log("complete", `Done in ${totalMs}ms`);

  return {
    verdict,
    confidence: Math.round(score * 1000) / 1000,
    checks: allChecks,
    domDiff,
    timing: { totalMs },
    audit: audit.getEntries(),
  };
}

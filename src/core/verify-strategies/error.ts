/**
 * verify() — Error Detection Strategy
 *
 * Gewichte:
 *   Error-Text: 0.35 | HTTP-4xx: 0.25 | Error-Class: 0.20
 *   aria-live: 0.10 | URL-Stable: 0.10
 */

import type {
  ActionSnapshot,
  DomDiffResult,
  CheckResult,
} from "../verify-types.js";
import { checkUrlStable } from "../verify-checks/url-change.js";
import { checkHttp4xx } from "../verify-checks/network-check.js";
import { applyWeights } from "../verify-scoring.js";

const WEIGHTS: Record<string, number> = {
  "error-text": 0.35,
  "http-4xx": 0.25,
  "error-class": 0.20,
  "aria-live": 0.10,
  "url-stable": 0.10,
};

const ERROR_TEXT_PATTERNS = [
  /error/i,
  /fail(ed|ure)?/i,
  /invalid/i,
  /incorrect/i,
  /wrong/i,
  /denied/i,
  /unauthorized/i,
  /forbidden/i,
  /not\s*found/i,
  /missing/i,
  /required/i,
  /expired/i,
  /fehler/i,
  /ungueltig/i,
  /falsch/i,
  /abgelehnt/i,
  /nicht\s*gefunden/i,
  /pflichtfeld/i,
  /could\s*not/i,
  /unable\s*to/i,
  /cannot/i,
  /problem/i,
  /oops/i,
  /sorry/i,
];

const ERROR_CLASS_RE = /\b(error|danger|alert-danger|invalid|warning|fail|negative|toast-error|notification-error)\b/i;

export function runErrorStrategy(
  snapshot: ActionSnapshot,
  domDiff: DomDiffResult,
): CheckResult[] {
  const checks: CheckResult[] = [];

  // 1. Error Text (neuer Fehlertext erschienen)
  const errorTextChanges = domDiff.textChanges.filter(
    (tc) =>
      ERROR_TEXT_PATTERNS.some((p) => p.test(tc.after)) &&
      !ERROR_TEXT_PATTERNS.some((p) => p.test(tc.before)),
  );
  const errorAddedElements = domDiff.addedElements.filter(
    (el) =>
      el.textContent &&
      ERROR_TEXT_PATTERNS.some((p) => p.test(el.textContent!)),
  );
  const hasErrorText =
    errorTextChanges.length > 0 || errorAddedElements.length > 0;

  const errorTextEvidence = [
    ...errorTextChanges.map((t) => `"${t.after.slice(0, 60)}"`),
    ...errorAddedElements.map((e) => `"${e.textContent!.slice(0, 60)}"`),
  ];

  checks.push({
    name: "error-text",
    passed: hasErrorText,
    confidence: hasErrorText ? 0.85 : 0.4,
    evidence: hasErrorText
      ? `Error text: ${errorTextEvidence.slice(0, 3).join(", ")}`
      : "No error text detected",
    source: "dom-diff",
  });

  // 2. HTTP 4xx (nur wenn Netzwerk-Daten vorhanden)
  if (snapshot.networkRequests && snapshot.networkRequests.length > 0) {
    checks.push(checkHttp4xx(snapshot.networkRequests));
  }

  // 3. Error Class (CSS-Klassen mit error/danger/alert)
  const errorClassInAdded = domDiff.addedElements.filter(
    (el) => el.classes?.some((c) => ERROR_CLASS_RE.test(c)),
  );
  const errorClassInChanged = domDiff.attributeChanges.filter(
    (ac) =>
      ac.attribute === "class" &&
      ac.after !== null &&
      ERROR_CLASS_RE.test(ac.after) &&
      !(ac.before !== null && ERROR_CLASS_RE.test(ac.before)),
  );
  const hasErrorClass =
    errorClassInAdded.length > 0 || errorClassInChanged.length > 0;

  checks.push({
    name: "error-class",
    passed: hasErrorClass,
    confidence: hasErrorClass ? 0.8 : 0.4,
    evidence: hasErrorClass
      ? `Error classes: ${errorClassInAdded.length + errorClassInChanged.length} elements`
      : "No error classes detected",
    source: "dom-diff",
  });

  // 4. aria-live (Fehler-Announcements fuer Screen Reader)
  const ariaLiveAdded = domDiff.attributeChanges.some(
    (ac) =>
      ac.attribute === "aria-live" ||
      (ac.attribute === "role" &&
        (ac.after === "alert" || ac.after === "status")),
  );
  const alertElementAdded = domDiff.addedElements.some(
    (el) =>
      el.classes?.some((c) => /alert|status/i.test(c)),
  );
  const hasAriaLive = ariaLiveAdded || alertElementAdded;

  checks.push({
    name: "aria-live",
    passed: hasAriaLive,
    confidence: hasAriaLive ? 0.8 : 0.3,
    evidence: hasAriaLive
      ? "Live region / alert role detected"
      : "No aria-live changes",
    source: "dom-diff",
  });

  // 5. URL Stable (Fehler aendern normalerweise nicht die URL)
  checks.push(checkUrlStable(snapshot.before.url, snapshot.after.url));

  return applyWeights(checks, WEIGHTS);
}

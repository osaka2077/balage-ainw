/**
 * verify() — Form Submit Strategy
 *
 * Gewichte:
 *   Network-POST: 0.30 | Success-Text: 0.25 | URL-Change: 0.20
 *   Form-Gone: 0.15 | No-Error: 0.10
 */

import type {
  ActionSnapshot,
  DomDiffResult,
  CheckResult,
} from "../verify-types.js";
import { checkUrlChange } from "../verify-checks/url-change.js";
import { checkNetworkPost } from "../verify-checks/network-check.js";
import { applyWeights } from "../verify-scoring.js";

const WEIGHTS: Record<string, number> = {
  "network-post": 0.30,
  "success-text": 0.25,
  "url-change": 0.20,
  "form-gone": 0.15,
  "no-error": 0.10,
};

const SUCCESS_PATTERNS = [
  /success/i,
  /submitted/i,
  /thank\s*you/i,
  /received/i,
  /confirmed/i,
  /saved/i,
  /updated/i,
  /created/i,
  /erfolgreich/i,
  /gespeichert/i,
  /gesendet/i,
  /danke/i,
  /complete/i,
];

const ERROR_PATTERNS = [
  /error/i,
  /fail/i,
  /invalid/i,
  /required/i,
  /missing/i,
  /incorrect/i,
  /wrong/i,
  /fehler/i,
  /ungueltig/i,
  /pflichtfeld/i,
];

export function runFormSubmitStrategy(
  snapshot: ActionSnapshot,
  domDiff: DomDiffResult,
): CheckResult[] {
  const checks: CheckResult[] = [];

  // 1. Network POST (nur wenn Netzwerk-Daten vorhanden)
  if (snapshot.networkRequests && snapshot.networkRequests.length > 0) {
    checks.push(checkNetworkPost(snapshot.networkRequests));
  }

  // 2. Success Text
  const successTextChanges = domDiff.textChanges.filter((tc) =>
    SUCCESS_PATTERNS.some((p) => p.test(tc.after)),
  );
  const successAddedElements = domDiff.addedElements.filter(
    (el) =>
      el.textContent && SUCCESS_PATTERNS.some((p) => p.test(el.textContent!)),
  );
  const hasSuccess =
    successTextChanges.length > 0 || successAddedElements.length > 0;

  const successEvidence = [
    ...successTextChanges.map((t) => `"${t.after.slice(0, 50)}"`),
    ...successAddedElements.map((e) => `"${e.textContent!.slice(0, 50)}"`),
  ];

  checks.push({
    name: "success-text",
    passed: hasSuccess,
    confidence: hasSuccess ? 0.85 : 0.4,
    evidence: hasSuccess
      ? `Success indicators: ${successEvidence.slice(0, 3).join(", ")}`
      : "No success text detected",
    source: "dom-diff",
  });

  // 3. URL Change
  checks.push(checkUrlChange(snapshot.before.url, snapshot.after.url));

  // 4. Form Gone
  const removedFormElements = domDiff.removedElements.filter(
    (el) =>
      el.tagName === "form" ||
      el.tagName === "input" ||
      el.tagName === "textarea",
  );
  const formGone = removedFormElements.length > 0;

  checks.push({
    name: "form-gone",
    passed: formGone,
    confidence: formGone ? 0.75 : 0.4,
    evidence: formGone
      ? `Form elements removed: ${removedFormElements.length}`
      : "Form still present",
    source: "dom-diff",
  });

  // 5. No Error (Abwesenheit von Fehlern)
  const errorTextChanges = domDiff.textChanges.filter((tc) =>
    ERROR_PATTERNS.some((p) => p.test(tc.after)),
  );
  const errorAddedElements = domDiff.addedElements.filter(
    (el) =>
      el.textContent && ERROR_PATTERNS.some((p) => p.test(el.textContent!)),
  );
  const errorClassElements = domDiff.addedElements.filter(
    (el) =>
      el.classes?.some((c) => /error|invalid|danger|alert/i.test(c)),
  );
  const hasError =
    errorTextChanges.length > 0 ||
    errorAddedElements.length > 0 ||
    errorClassElements.length > 0;

  checks.push({
    name: "no-error",
    passed: !hasError,
    confidence: hasError ? 0.8 : 0.7,
    evidence: hasError
      ? `Error indicators: ${errorTextChanges.length + errorAddedElements.length} text, ${errorClassElements.length} classes`
      : "No error indicators detected",
    source: "dom-diff",
  });

  return applyWeights(checks, WEIGHTS);
}

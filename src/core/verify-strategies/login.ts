/**
 * verify() — Login Strategy
 *
 * Gewichte:
 *   URL-Change: 0.30 | Cookie: 0.25 | Welcome-Text: 0.20
 *   Form-Gone: 0.15 | Network-POST: 0.10
 */

import type {
  ActionSnapshot,
  DomDiffResult,
  CheckResult,
} from "../verify-types.js";
import { checkUrlChange } from "../verify-checks/url-change.js";
import { checkNewSessionCookies } from "../verify-checks/cookie-check.js";
import { checkNetworkPost } from "../verify-checks/network-check.js";
import { applyWeights } from "../verify-scoring.js";

const WEIGHTS: Record<string, number> = {
  "url-change": 0.30,
  "new-session-cookie": 0.25,
  "welcome-text": 0.20,
  "form-gone": 0.15,
  "network-post": 0.10,
};

const WELCOME_PATTERNS = [
  /welcome/i,
  /dashboard/i,
  /my\s*account/i,
  /profile/i,
  /logged\s*in/i,
  /sign(ed)?\s*in/i,
  /hello/i,
  /willkommen/i,
  /mein\s*konto/i,
  /logout/i,
  /sign\s*out/i,
  /log\s*out/i,
  /abmelden/i,
];

export function runLoginStrategy(
  snapshot: ActionSnapshot,
  domDiff: DomDiffResult,
): CheckResult[] {
  const checks: CheckResult[] = [];

  // 1. URL Change
  checks.push(checkUrlChange(snapshot.before.url, snapshot.after.url));

  // 2. Session Cookie (nur wenn Cookie-Daten vorhanden)
  if (snapshot.before.cookies || snapshot.after.cookies) {
    checks.push(
      checkNewSessionCookies(
        snapshot.before.cookies ?? [],
        snapshot.after.cookies ?? [],
      ),
    );
  }

  // 3. Welcome Text (neu erschienen nach Login)
  const welcomeInTextChanges = domDiff.textChanges.filter((tc) =>
    WELCOME_PATTERNS.some((p) => p.test(tc.after)),
  );
  const welcomeInAdded = domDiff.addedElements.filter(
    (el) =>
      el.textContent && WELCOME_PATTERNS.some((p) => p.test(el.textContent!)),
  );
  const hasWelcome =
    welcomeInTextChanges.length > 0 || welcomeInAdded.length > 0;

  const welcomeEvidence = [
    ...welcomeInTextChanges.map((t) => `"${t.after.slice(0, 50)}"`),
    ...welcomeInAdded.map((e) => `"${e.textContent!.slice(0, 50)}"`),
  ];

  checks.push({
    name: "welcome-text",
    passed: hasWelcome,
    confidence: hasWelcome ? 0.8 : 0.5,
    evidence: hasWelcome
      ? `Welcome indicators: ${welcomeEvidence.slice(0, 3).join(", ")}`
      : "No welcome/dashboard text detected",
    source: "dom-diff",
  });

  // 4. Form Gone (Login-Formular verschwunden)
  const removedFormElements = domDiff.removedElements.filter(
    (el) =>
      el.tagName === "form" ||
      el.tagName === "input" ||
      el.tagName === "button",
  );
  const formGone = removedFormElements.length > 0;

  checks.push({
    name: "form-gone",
    passed: formGone,
    confidence: formGone ? 0.75 : 0.4,
    evidence: formGone
      ? `Login form removed: ${removedFormElements.length} elements`
      : "Login form still present",
    source: "dom-diff",
  });

  // 5. Network POST (nur wenn Netzwerk-Daten vorhanden)
  if (snapshot.networkRequests && snapshot.networkRequests.length > 0) {
    checks.push(checkNetworkPost(snapshot.networkRequests));
  }

  return applyWeights(checks, WEIGHTS);
}

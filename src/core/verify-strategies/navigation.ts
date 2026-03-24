/**
 * verify() — Navigation Strategy
 *
 * Gewichte:
 *   URL-Change: 0.50 | Content-Diff: 0.25
 *   New-Heading: 0.15 | State-Event: 0.10
 */

import type {
  ActionSnapshot,
  DomDiffResult,
  CheckResult,
} from "../verify-types.js";
import { checkUrlChange } from "../verify-checks/url-change.js";
import { applyWeights } from "../verify-scoring.js";

const WEIGHTS: Record<string, number> = {
  "url-change": 0.50,
  "content-diff": 0.25,
  "new-heading": 0.15,
  "state-event": 0.10,
};

export function runNavigationStrategy(
  snapshot: ActionSnapshot,
  domDiff: DomDiffResult,
): CheckResult[] {
  const checks: CheckResult[] = [];

  // 1. URL Change (staerkstes Signal)
  checks.push(checkUrlChange(snapshot.before.url, snapshot.after.url));

  // 2. Content Diff (signifikante DOM-Aenderungen)
  const contentChanged =
    domDiff.significantChanges > 2 ||
    domDiff.addedElements.length > 3 ||
    domDiff.removedElements.length > 3 ||
    domDiff.textChanges.length > 2;

  checks.push({
    name: "content-diff",
    passed: contentChanged,
    confidence: contentChanged
      ? Math.min(0.9, 0.5 + domDiff.significantChanges * 0.05)
      : 0.3,
    evidence: contentChanged
      ? `Content changes: +${domDiff.addedElements.length} -${domDiff.removedElements.length}, ${domDiff.textChanges.length} text, ${domDiff.significantChanges} significant`
      : "Minimal content changes",
    source: "dom-diff",
  });

  // 3. New Heading (neues <h1>-<h6> = wahrscheinlich neue Seite)
  const newHeadings = domDiff.addedElements.filter((el) =>
    /^h[1-6]$/i.test(el.tagName),
  );
  const changedHeadings = domDiff.textChanges.filter((tc) =>
    /^h[1-6]$/i.test(tc.tagName),
  );
  const hasNewHeading = newHeadings.length > 0 || changedHeadings.length > 0;

  const headingEvidence = [
    ...newHeadings.map(
      (h) => `<${h.tagName}> "${h.textContent?.slice(0, 40)}"`,
    ),
    ...changedHeadings.map(
      (h) => `<${h.tagName}> "${h.before}" → "${h.after}"`,
    ),
  ];

  checks.push({
    name: "new-heading",
    passed: hasNewHeading,
    confidence: hasNewHeading ? 0.8 : 0.3,
    evidence: hasNewHeading
      ? `Headings: ${headingEvidence.slice(0, 3).join(", ")}`
      : "No heading changes",
    source: "dom-diff",
  });

  // 4. State Event (Title-Change, Active-Nav-Item)
  const titleChanged = domDiff.textChanges.some(
    (tc) => tc.tagName === "title",
  );
  const activeNavChanged = domDiff.attributeChanges.some(
    (ac) =>
      ac.attribute === "class" &&
      (ac.after?.includes("active") || ac.before?.includes("active")),
  );
  const ariaCurrentChanged = domDiff.attributeChanges.some(
    (ac) => ac.attribute === "aria-current",
  );
  const stateEvent = titleChanged || activeNavChanged || ariaCurrentChanged;

  const stateEvidence = [
    titleChanged ? "title changed" : "",
    activeNavChanged ? "active nav changed" : "",
    ariaCurrentChanged ? "aria-current changed" : "",
  ].filter(Boolean);

  checks.push({
    name: "state-event",
    passed: stateEvent,
    confidence: stateEvent ? 0.75 : 0.3,
    evidence: stateEvent
      ? `State: ${stateEvidence.join(", ")}`
      : "No navigation state changes",
    source: "dom-diff",
  });

  return applyWeights(checks, WEIGHTS);
}

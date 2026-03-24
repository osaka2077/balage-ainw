/**
 * verify() — Modal Open/Close Strategy
 *
 * Modal Open Gewichte:
 *   role="dialog" added: 0.40 | display-Change: 0.25
 *   Backdrop: 0.15 | aria-modal: 0.10 | URL-Stable: 0.10
 *
 * Modal Close: Inverse Checks mit gleichen Gewichten.
 */

import type {
  ActionSnapshot,
  DomDiffResult,
  CheckResult,
} from "../verify-types.js";
import { checkUrlStable } from "../verify-checks/url-change.js";
import { applyWeights } from "../verify-scoring.js";

const OPEN_WEIGHTS: Record<string, number> = {
  "dialog-added": 0.40,
  "display-change": 0.25,
  "backdrop": 0.15,
  "aria-modal": 0.10,
  "url-stable": 0.10,
};

const CLOSE_WEIGHTS: Record<string, number> = {
  "dialog-removed": 0.40,
  "display-change": 0.25,
  "backdrop-removed": 0.15,
  "aria-modal-removed": 0.10,
  "url-stable": 0.10,
};

export function runModalStrategy(
  snapshot: ActionSnapshot,
  domDiff: DomDiffResult,
  scenario: "modal_open" | "modal_close",
): CheckResult[] {
  return scenario === "modal_open"
    ? runOpenChecks(snapshot, domDiff)
    : runCloseChecks(snapshot, domDiff);
}

// ============================================================================
// Modal Open
// ============================================================================

function runOpenChecks(
  snapshot: ActionSnapshot,
  domDiff: DomDiffResult,
): CheckResult[] {
  const checks: CheckResult[] = [];

  // 1. Dialog added
  const dialogElementAdded = domDiff.addedElements.some(
    (el) =>
      el.tagName === "dialog" ||
      el.classes?.includes("modal") ||
      el.classes?.includes("dialog"),
  );
  const roleDialogAdded = domDiff.attributeChanges.some(
    (ac) => ac.attribute === "role" && ac.after === "dialog",
  );
  const dialogAdded = dialogElementAdded || roleDialogAdded;

  checks.push({
    name: "dialog-added",
    passed: dialogAdded,
    confidence: dialogAdded ? 0.9 : 0.3,
    evidence: dialogElementAdded
      ? "Dialog element added"
      : roleDialogAdded
        ? 'role="dialog" added'
        : "No dialog detected",
    source: "dom-diff",
  });

  // 2. Display change (hidden → visible)
  const visibilityChange = domDiff.attributeChanges.some(
    (ac) =>
      (ac.attribute === "style" &&
        (ac.after?.includes("block") ||
          ac.after?.includes("flex") ||
          ac.after?.includes("grid"))) ||
      (ac.attribute === "class" &&
        (ac.after?.includes("show") || ac.after?.includes("open"))) ||
      (ac.attribute === "open" && ac.after !== null),
  );
  const hiddenRemoved = domDiff.attributeChanges.some(
    (ac) => ac.attribute === "hidden" && ac.before !== null && ac.after === null,
  );
  const displayChanged = visibilityChange || hiddenRemoved;

  checks.push({
    name: "display-change",
    passed: displayChanged,
    confidence: displayChanged ? 0.8 : 0.3,
    evidence: displayChanged
      ? "Element became visible"
      : "No visibility change",
    source: "dom-diff",
  });

  // 3. Backdrop
  const backdropAdded = domDiff.addedElements.some(
    (el) => el.classes?.some((c) => /backdrop|overlay|mask/i.test(c)),
  );

  checks.push({
    name: "backdrop",
    passed: backdropAdded,
    confidence: backdropAdded ? 0.8 : 0.4,
    evidence: backdropAdded
      ? "Backdrop/overlay added"
      : "No backdrop detected",
    source: "dom-diff",
  });

  // 4. aria-modal
  const ariaModalSet = domDiff.attributeChanges.some(
    (ac) => ac.attribute === "aria-modal" && ac.after === "true",
  );

  checks.push({
    name: "aria-modal",
    passed: ariaModalSet,
    confidence: ariaModalSet ? 0.85 : 0.3,
    evidence: ariaModalSet
      ? 'aria-modal="true" set'
      : "No aria-modal attribute",
    source: "dom-diff",
  });

  // 5. URL Stable
  checks.push(checkUrlStable(snapshot.before.url, snapshot.after.url));

  return applyWeights(checks, OPEN_WEIGHTS);
}

// ============================================================================
// Modal Close
// ============================================================================

function runCloseChecks(
  snapshot: ActionSnapshot,
  domDiff: DomDiffResult,
): CheckResult[] {
  const checks: CheckResult[] = [];

  // 1. Dialog removed
  const dialogElementRemoved = domDiff.removedElements.some(
    (el) =>
      el.tagName === "dialog" ||
      el.classes?.includes("modal") ||
      el.classes?.includes("dialog"),
  );
  const roleDialogRemoved = domDiff.attributeChanges.some(
    (ac) =>
      ac.attribute === "role" &&
      ac.before === "dialog" &&
      ac.after === null,
  );
  const dialogRemoved = dialogElementRemoved || roleDialogRemoved;

  checks.push({
    name: "dialog-removed",
    passed: dialogRemoved,
    confidence: dialogRemoved ? 0.9 : 0.3,
    evidence: dialogElementRemoved
      ? "Dialog element removed"
      : roleDialogRemoved
        ? 'role="dialog" removed'
        : "No dialog removal detected",
    source: "dom-diff",
  });

  // 2. Display change (visible → hidden)
  const hiddenNow = domDiff.attributeChanges.some(
    (ac) =>
      (ac.attribute === "style" && ac.after?.includes("none")) ||
      (ac.attribute === "class" &&
        (ac.after?.includes("hidden") || ac.after?.includes("hide"))) ||
      (ac.attribute === "open" && ac.after === null && ac.before !== null),
  );
  const hiddenAdded = domDiff.attributeChanges.some(
    (ac) => ac.attribute === "hidden" && ac.before === null && ac.after !== null,
  );
  const displayHidden = hiddenNow || hiddenAdded;

  checks.push({
    name: "display-change",
    passed: displayHidden,
    confidence: displayHidden ? 0.8 : 0.3,
    evidence: displayHidden ? "Element hidden" : "No visibility change",
    source: "dom-diff",
  });

  // 3. Backdrop removed
  const backdropRemoved = domDiff.removedElements.some(
    (el) => el.classes?.some((c) => /backdrop|overlay|mask/i.test(c)),
  );

  checks.push({
    name: "backdrop-removed",
    passed: backdropRemoved,
    confidence: backdropRemoved ? 0.8 : 0.4,
    evidence: backdropRemoved
      ? "Backdrop/overlay removed"
      : "No backdrop removal",
    source: "dom-diff",
  });

  // 4. aria-modal removed
  const ariaModalRemoved = domDiff.attributeChanges.some(
    (ac) =>
      ac.attribute === "aria-modal" &&
      ac.before === "true" &&
      (ac.after === null || ac.after === "false"),
  );

  checks.push({
    name: "aria-modal-removed",
    passed: ariaModalRemoved,
    confidence: ariaModalRemoved ? 0.85 : 0.3,
    evidence: ariaModalRemoved
      ? "aria-modal removed"
      : "No aria-modal change",
    source: "dom-diff",
  });

  // 5. URL Stable
  checks.push(checkUrlStable(snapshot.before.url, snapshot.after.url));

  return applyWeights(checks, CLOSE_WEIGHTS);
}

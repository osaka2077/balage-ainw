/**
 * verify() — Individual Strategy Functions
 *
 * Convenience-Funktionen fuer einzelne Verifikations-Szenarien.
 * Arbeiten direkt auf DomNode-Baeumen (synchron, browser-agnostisch).
 */

import type { DomNode } from "../types.js";
import { computeDomDiffFromNodes } from "./dom-diff.js";

// ============================================================================
// Types
// ============================================================================

export interface StrategyInput {
  beforeUrl: string;
  afterUrl: string;
  beforeDom: DomNode;
  afterDom: DomNode;
}

export interface FormStrategyInput extends StrategyInput {
  httpStatus?: number;
}

export interface StrategyResult {
  status: "verified" | "failed" | "inconclusive";
  confidence: number;
  evidence?: string[];
  scenario?: string;
}

// ============================================================================
// Text Pattern Helpers
// ============================================================================

const WELCOME_PATTERNS = [
  /welcome/i, /dashboard/i, /my\s*account/i, /profile/i,
  /logged\s*in/i, /sign(ed)?\s*in/i, /willkommen/i,
  /mein\s*konto/i, /logout/i, /sign\s*out/i, /log\s*out/i,
  /abmelden/i,
];

const SUCCESS_PATTERNS = [
  /success/i, /submitted/i, /thank\s*you/i, /received/i,
  /confirmed/i, /saved/i, /updated/i, /created/i,
  /erfolgreich/i, /gespeichert/i, /gesendet/i, /danke/i,
  /complete/i,
];

const ERROR_PATTERNS = [
  /error/i, /fail(ed|ure)?/i, /invalid/i, /incorrect/i,
  /wrong/i, /denied/i, /unauthorized/i, /forbidden/i,
  /not\s*found/i, /missing/i, /required/i, /fehler/i,
  /ungueltig/i, /pflichtfeld/i, /oops/i,
];

// ============================================================================
// DOM Tree Helpers
// ============================================================================

function getDeepText(node: DomNode): string {
  let text = node.textContent ?? "";
  for (const child of node.children) {
    const ct = getDeepText(child);
    if (ct) text += " " + ct;
  }
  return text.trim();
}

function hasPatternText(dom: DomNode, patterns: RegExp[]): boolean {
  const text = getDeepText(dom);
  return patterns.some((p) => p.test(text));
}

function hasFormIn(dom: DomNode): boolean {
  if (dom.tagName === "form") return true;
  return dom.children.some((child) => hasFormIn(child));
}

function hasDialogIn(dom: DomNode): boolean {
  if (dom.tagName === "dialog") return true;
  if (dom.attributes["role"] === "dialog") return true;
  const classes = (dom.attributes["class"] ?? "").split(/\s+/);
  if (classes.includes("modal") || classes.includes("dialog")) return true;
  return dom.children.some((child) => hasDialogIn(child));
}

function hasErrorClassIn(dom: DomNode): boolean {
  const classes = (dom.attributes["class"] ?? "").split(/\s+/);
  if (classes.some((c) => /^(error|danger|alert|invalid)$/i.test(c))) return true;
  return dom.children.some((child) => hasErrorClassIn(child));
}

// ============================================================================
// verifyLogin
// ============================================================================

export function verifyLogin(input: StrategyInput): StrategyResult {
  const domDiff = computeDomDiffFromNodes(input.beforeDom, input.afterDom);
  const urlChanged = input.beforeUrl !== input.afterUrl;

  // Positive Signale
  const formGone = hasFormIn(input.beforeDom) && !hasFormIn(input.afterDom);

  // Welcome-Text: nur in neuen/geaenderten Elementen suchen (nicht Button-Labels!)
  const welcomeText =
    domDiff.addedElements.some(
      (el) => el.textContent && WELCOME_PATTERNS.some((p) => p.test(el.textContent!)),
    ) ||
    domDiff.textChanges.some((tc) =>
      WELCOME_PATTERNS.some((p) => p.test(tc.after)),
    );

  // Negative Signale: nur in neuen/geaenderten Elementen
  const errorText =
    domDiff.addedElements.some(
      (el) => el.textContent && ERROR_PATTERNS.some((p) => p.test(el.textContent!)),
    ) ||
    domDiff.textChanges.some(
      (tc) =>
        ERROR_PATTERNS.some((p) => p.test(tc.after)) &&
        !ERROR_PATTERNS.some((p) => p.test(tc.before)),
    );
  const errorClass =
    hasErrorClassIn(input.afterDom) && !hasErrorClassIn(input.beforeDom);

  // Scoring (nur vorhandene Signale)
  let score = 0;
  let totalWeight = 0;

  totalWeight += 0.30;
  if (urlChanged) score += 0.30 * 0.9;

  totalWeight += 0.20;
  if (welcomeText) score += 0.20 * 0.8;

  totalWeight += 0.15;
  if (formGone) score += 0.15 * 0.75;

  const confidence = totalWeight > 0 ? score / totalWeight : 0;

  // Verdict
  if (confidence >= 0.65) {
    return { status: "verified", confidence };
  }

  if (errorText || errorClass) {
    return { status: "failed", confidence };
  }

  const hasChanges =
    domDiff.addedElements.length > 0 ||
    domDiff.removedElements.length > 0 ||
    domDiff.textChanges.length > 0 ||
    domDiff.attributeChanges.length > 0;

  if (!hasChanges && !urlChanged) {
    return { status: "inconclusive", confidence };
  }

  return { status: "failed", confidence };
}

// ============================================================================
// verifyForm
// ============================================================================

export function verifyForm(input: FormStrategyInput): StrategyResult {
  const domDiff = computeDomDiffFromNodes(input.beforeDom, input.afterDom);
  const urlChanged = input.beforeUrl !== input.afterUrl;

  const formGone = hasFormIn(input.beforeDom) && !hasFormIn(input.afterDom);
  const successText =
    hasPatternText(input.afterDom, SUCCESS_PATTERNS) &&
    !hasPatternText(input.beforeDom, SUCCESS_PATTERNS);
  const errorText =
    hasPatternText(input.afterDom, ERROR_PATTERNS) &&
    !hasPatternText(input.beforeDom, ERROR_PATTERNS);

  const httpOk =
    input.httpStatus !== undefined &&
    input.httpStatus >= 200 &&
    input.httpStatus < 400;
  const httpError =
    input.httpStatus !== undefined && input.httpStatus >= 400;

  let score = 0;
  let totalWeight = 0;

  // Network (nur wenn httpStatus vorhanden)
  if (input.httpStatus !== undefined) {
    totalWeight += 0.30;
    if (httpOk) score += 0.30 * 0.85;
  }

  // Success text
  totalWeight += 0.25;
  if (successText) score += 0.25 * 0.85;

  // URL change
  totalWeight += 0.20;
  if (urlChanged) score += 0.20 * 0.9;

  // Form gone
  totalWeight += 0.15;
  if (formGone) score += 0.15 * 0.75;

  // No error
  totalWeight += 0.10;
  if (!errorText) score += 0.10 * 0.70;

  const confidence = totalWeight > 0 ? score / totalWeight : 0;

  if (confidence >= 0.65) {
    return { status: "verified", confidence };
  }

  if (httpError || errorText) {
    return { status: "failed", confidence };
  }

  const hasChanges =
    domDiff.addedElements.length > 0 ||
    domDiff.removedElements.length > 0 ||
    domDiff.textChanges.length > 0;

  if (!hasChanges && !urlChanged) {
    return { status: "inconclusive", confidence };
  }

  return { status: "inconclusive", confidence };
}

// ============================================================================
// verifyNavigation
// ============================================================================

export function verifyNavigation(input: StrategyInput): StrategyResult {
  const domDiff = computeDomDiffFromNodes(input.beforeDom, input.afterDom);
  const urlChanged = input.beforeUrl !== input.afterUrl;

  const headingChanged = domDiff.textChanges.some((tc) =>
    /^h[1-6]$/i.test(tc.tagName),
  );
  const newHeading = domDiff.addedElements.some((el) =>
    /^h[1-6]$/i.test(el.tagName),
  );
  const contentChanged =
    domDiff.addedElements.length > 0 ||
    domDiff.removedElements.length > 0 ||
    domDiff.textChanges.length > 0;

  let score = 0;
  let totalWeight = 0;

  // URL change (0.50)
  totalWeight += 0.50;
  if (urlChanged) score += 0.50 * 0.9;

  // Content diff (0.25)
  totalWeight += 0.25;
  if (contentChanged) {
    const contentConf = Math.min(
      0.9,
      0.5 + domDiff.significantChanges * 0.1,
    );
    score += 0.25 * contentConf;
  }

  // New heading (0.15)
  totalWeight += 0.15;
  if (headingChanged || newHeading) score += 0.15 * 0.8;

  // State event — title change (0.10)
  const titleChanged = domDiff.textChanges.some(
    (tc) => tc.tagName === "title",
  );
  totalWeight += 0.10;
  if (titleChanged) score += 0.10 * 0.75;

  const confidence = totalWeight > 0 ? score / totalWeight : 0;

  if (confidence >= 0.65) {
    return { status: "verified", confidence };
  }

  if (!contentChanged && !urlChanged) {
    return { status: "inconclusive", confidence };
  }

  return { status: "inconclusive", confidence };
}

// ============================================================================
// verifyModal
// ============================================================================

export function verifyModal(
  input: StrategyInput,
): StrategyResult & { scenario: string } {
  const domDiff = computeDomDiffFromNodes(input.beforeDom, input.afterDom);

  const dialogInBefore = hasDialogIn(input.beforeDom);
  const dialogInAfter = hasDialogIn(input.afterDom);
  const urlStable = input.beforeUrl === input.afterUrl;

  // Modal Open
  if (!dialogInBefore && dialogInAfter) {
    const backdropAdded = domDiff.addedElements.some(
      (el) => el.classes?.some((c) => /backdrop|overlay|mask/i.test(c)),
    );

    let score = 0;
    let totalWeight = 0;

    // Dialog added (0.40)
    totalWeight += 0.40;
    score += 0.40 * 0.9;

    // Backdrop (0.15)
    totalWeight += 0.15;
    if (backdropAdded) score += 0.15 * 0.8;

    // URL stable (0.10)
    totalWeight += 0.10;
    if (urlStable) score += 0.10 * 1.0;

    const confidence = totalWeight > 0 ? score / totalWeight : 0;
    return {
      status: confidence >= 0.65 ? "verified" : "inconclusive",
      confidence,
      scenario: "modal_open",
    };
  }

  // Modal Close
  if (dialogInBefore && !dialogInAfter) {
    const backdropRemoved = domDiff.removedElements.some(
      (el) => el.classes?.some((c) => /backdrop|overlay|mask/i.test(c)),
    );

    let score = 0;
    let totalWeight = 0;

    // Dialog removed (0.40)
    totalWeight += 0.40;
    score += 0.40 * 0.9;

    // Backdrop removed (0.15)
    totalWeight += 0.15;
    if (backdropRemoved) score += 0.15 * 0.8;

    // URL stable (0.10)
    totalWeight += 0.10;
    if (urlStable) score += 0.10 * 1.0;

    const confidence = totalWeight > 0 ? score / totalWeight : 0;
    return {
      status: confidence >= 0.65 ? "verified" : "inconclusive",
      confidence,
      scenario: "modal_close",
    };
  }

  // Kein Dialog-Wechsel erkannt
  return {
    status: "inconclusive",
    confidence: 0,
    scenario: dialogInAfter ? "modal_open" : "modal_close",
  };
}

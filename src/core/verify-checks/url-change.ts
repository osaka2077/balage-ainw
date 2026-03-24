/**
 * verify() — URL Change Check
 *
 * URL-Vergleich: same-page (hash), navigation (path), redirect, external.
 */

import type { CheckResult } from "../verify-types.js";

export type UrlChangeType =
  | "none"
  | "hash"
  | "query"
  | "path"
  | "host"
  | "full";

export interface UrlChangeInfo {
  changed: boolean;
  type: UrlChangeType;
  before: string;
  after: string;
}

export function analyzeUrlChange(
  beforeUrl: string,
  afterUrl: string,
): UrlChangeInfo {
  if (beforeUrl === afterUrl) {
    return { changed: false, type: "none", before: beforeUrl, after: afterUrl };
  }

  let beforeParsed: URL;
  let afterParsed: URL;
  try {
    beforeParsed = new URL(beforeUrl);
    afterParsed = new URL(afterUrl);
  } catch {
    return { changed: true, type: "full", before: beforeUrl, after: afterUrl };
  }

  if (beforeParsed.host !== afterParsed.host) {
    return { changed: true, type: "host", before: beforeUrl, after: afterUrl };
  }

  if (beforeParsed.protocol !== afterParsed.protocol) {
    return { changed: true, type: "full", before: beforeUrl, after: afterUrl };
  }

  if (beforeParsed.pathname !== afterParsed.pathname) {
    return { changed: true, type: "path", before: beforeUrl, after: afterUrl };
  }

  if (beforeParsed.search !== afterParsed.search) {
    return {
      changed: true,
      type: "query",
      before: beforeUrl,
      after: afterUrl,
    };
  }

  if (beforeParsed.hash !== afterParsed.hash) {
    return { changed: true, type: "hash", before: beforeUrl, after: afterUrl };
  }

  return { changed: true, type: "full", before: beforeUrl, after: afterUrl };
}

// ============================================================================
// Classify API (fuer externe Consumer / Tests)
// ============================================================================

export type ClassifiedUrlChangeType =
  | "no_change"
  | "hash_change"
  | "query_change"
  | "navigation"
  | "redirect";

export interface ClassifiedUrlChange {
  type: ClassifiedUrlChangeType;
  before: string;
  after: string;
}

const CLASSIFY_MAP: Record<UrlChangeType, ClassifiedUrlChangeType> = {
  none: "no_change",
  hash: "hash_change",
  query: "query_change",
  path: "navigation",
  host: "redirect",
  full: "redirect",
};

/** Klassifiziert URL-Aenderung in menschenlesbare Kategorie. */
export function classifyUrlChange(
  beforeUrl: string,
  afterUrl: string,
): ClassifiedUrlChange {
  const info = analyzeUrlChange(beforeUrl, afterUrl);
  return {
    type: CLASSIFY_MAP[info.type],
    before: info.before,
    after: info.after,
  };
}

const CONFIDENCE_BY_TYPE: Record<UrlChangeType, number> = {
  path: 0.9,
  host: 0.95,
  full: 0.85,
  query: 0.7,
  hash: 0.5,
  none: 0,
};

export function checkUrlChange(
  beforeUrl: string,
  afterUrl: string,
): CheckResult {
  const info = analyzeUrlChange(beforeUrl, afterUrl);

  if (!info.changed) {
    return {
      name: "url-change",
      passed: false,
      confidence: 1.0,
      evidence: "URL did not change",
      source: "url-change",
    };
  }

  return {
    name: "url-change",
    passed: true,
    confidence: CONFIDENCE_BY_TYPE[info.type],
    evidence: `URL changed (${info.type}): ${info.before} → ${info.after}`,
    source: "url-change",
  };
}

export function checkUrlStable(
  beforeUrl: string,
  afterUrl: string,
): CheckResult {
  const info = analyzeUrlChange(beforeUrl, afterUrl);

  return {
    name: "url-stable",
    passed: !info.changed,
    confidence: info.changed ? 0.8 : 1.0,
    evidence: info.changed
      ? `URL changed unexpectedly: ${info.before} → ${info.after}`
      : "URL remained stable as expected",
    source: "url-change",
  };
}

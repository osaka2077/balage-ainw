/**
 * ContradictionDetector — Widersprueche in Evidence erkennen.
 *
 * Sucht paarweise nach widerspruchlichen Belegen.
 * Score: 0.0 (keine Widersprueche) bis 1.0 (voller Widerspruch).
 */

import pino from "pino";
import type { Evidence } from "./types.js";
import type { ContradictionResult } from "./types.js";

const logger = pino({ name: "risk-gate:contradiction-detector" });

/** Evidence-Typen die sich widersprechen koennen */
const CONTRADICTORY_PAIRS: Array<[string, string]> = [
  ["semantic_label", "aria_role"],
  ["semantic_label", "text_content"],
  ["aria_role", "text_content"],
  ["structural_pattern", "semantic_label"],
  ["llm_inference", "semantic_label"],
  ["llm_inference", "aria_role"],
];

/** Signale die semantisch entgegengesetzt sind */
const OPPOSING_SIGNALS: Array<[RegExp, RegExp]> = [
  [/\blogin\b/i, /\bregister\b/i],
  [/\bsign\s*in\b/i, /\bsign\s*up\b/i],
  [/\bsubmit\b/i, /\bcancel\b/i],
  [/\bconfirm\b/i, /\bcancel\b/i],
  [/\baccept\b/i, /\breject\b/i],
  [/\benable\b/i, /\bdisable\b/i],
  [/\bopen\b/i, /\bclose\b/i],
  [/\badd\b/i, /\bremove\b/i],
  [/\bcreate\b/i, /\bdelete\b/i],
];

/**
 * Erkennt Widersprueche in einer Evidence-Liste.
 * Vergleicht Paare von Evidence-Items auf semantische Widersprueche.
 */
export function detectContradictions(evidence: Evidence[]): ContradictionResult {
  if (evidence.length < 2) {
    return { score: 0.0, contradictions: [], hasContradiction: false };
  }

  const contradictions: ContradictionResult["contradictions"] = [];

  for (let i = 0; i < evidence.length; i++) {
    for (let j = i + 1; j < evidence.length; j++) {
      const a = evidence[i]!;
      const b = evidence[j]!;

      const contradiction = checkContradiction(a, b);
      if (contradiction) {
        contradictions.push({
          evidenceA: a,
          evidenceB: b,
          description: contradiction.description,
          severity: contradiction.severity,
        });
      }
    }
  }

  // Score: gewichteter Durchschnitt der Contradiction-Severities,
  // normalisiert auf die Anzahl moeglicher Paare
  const maxPairs = (evidence.length * (evidence.length - 1)) / 2;
  const totalSeverity = contradictions.reduce((sum, c) => sum + c.severity, 0);
  const score = Math.min(1.0, totalSeverity / Math.max(1, maxPairs));

  if (contradictions.length > 0) {
    logger.warn(
      { contradictionCount: contradictions.length, score },
      "Contradictions detected in evidence"
    );
  }

  return {
    score,
    contradictions,
    hasContradiction: contradictions.length > 0,
  };
}

/** Prueft ob zwei Evidence-Items sich widersprechen */
function checkContradiction(
  a: Evidence,
  b: Evidence
): { description: string; severity: number } | null {
  // Pruefe ob das Typ-Paar als potenziell widerspruchlich bekannt ist
  const isPotentialPair = CONTRADICTORY_PAIRS.some(
    ([t1, t2]) =>
      (a.type === t1 && b.type === t2) || (a.type === t2 && b.type === t1)
  );

  if (!isPotentialPair) {
    // Auch bei gleichen Typen nach Widerspruechen suchen
    if (a.type !== b.type) return null;
  }

  // Pruefe auf semantisch entgegengesetzte Signale
  for (const [pattern1, pattern2] of OPPOSING_SIGNALS) {
    const aMatchesFirst = pattern1.test(a.signal) || (a.detail ? pattern1.test(a.detail) : false);
    const bMatchesSecond = pattern2.test(b.signal) || (b.detail ? pattern2.test(b.detail) : false);
    const aMatchesSecond = pattern2.test(a.signal) || (a.detail ? pattern2.test(a.detail) : false);
    const bMatchesFirst = pattern1.test(b.signal) || (b.detail ? pattern1.test(b.detail) : false);

    if ((aMatchesFirst && bMatchesSecond) || (aMatchesSecond && bMatchesFirst)) {
      const avgWeight = (a.weight + b.weight) / 2;
      return {
        description: `Contradictory signals: "${a.signal}" vs "${b.signal}" (${a.type} vs ${b.type})`,
        severity: avgWeight,
      };
    }
  }

  // Gleicher Typ, gleiche Quelle, aber unterschiedliche Signale mit hohem Gewicht
  if (
    a.type === b.type &&
    a.source === b.source &&
    a.signal !== b.signal &&
    a.weight > 0.6 &&
    b.weight > 0.6
  ) {
    return {
      description: `Same-source conflict: "${a.signal}" vs "${b.signal}" from ${a.source ?? "unknown"}`,
      severity: Math.min(a.weight, b.weight) * 0.5,
    };
  }

  return null;
}

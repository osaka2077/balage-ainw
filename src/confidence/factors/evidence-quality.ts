/**
 * Faktor 4 — Evidence Quality (w4 = 0.15)
 *
 * Bewertet Menge, Diversitaet und Staerke der Evidence.
 * Formel: quality = count*0.3 + diversity*0.3 + strength*0.25 - contradictions*0.15
 * Pure Function.
 */

import type { Evidence } from "../../../shared_interfaces.js";

/**
 * Berechnet den Evidence Quality Score.
 */
export function computeEvidenceQuality(evidence: Evidence[]): number {
  if (evidence.length === 0) return 0.0;

  // Count-Faktor: mehr Belege = besser (bis 5 Belege = 1.0)
  const countFactor = Math.min(1.0, evidence.length / 5);

  // Diversitaets-Faktor: verschiedene Quell-Typen
  const uniqueTypes = new Set(evidence.map((e) => e.type));
  const diversityFactor = Math.min(1.0, uniqueTypes.size / 4);

  // Staerke-Faktor: Durchschnittliches Gewicht
  const totalWeight = evidence.reduce((sum, e) => sum + e.weight, 0);
  const strengthFactor = totalWeight / evidence.length;

  // Contradiction Penalty: einfache Heuristik — verschiedene source-Werte
  // die widersprüchliche Signale liefern koennten
  const contradictionPenalty = estimateContradictions(evidence);

  const quality =
    countFactor * 0.3 +
    diversityFactor * 0.3 +
    strengthFactor * 0.25 -
    contradictionPenalty * 0.15;

  return Math.min(1.0, Math.max(0.0, quality));
}

/**
 * Schaetzt den Widerspruchsgrad in den Belegen (0.0-1.0).
 * Wenn verschiedene Belege auf verschiedene Typen hindeuten → hoehere Penalty.
 */
function estimateContradictions(evidence: Evidence[]): number {
  if (evidence.length < 2) return 0.0;

  // Suche nach Paaren mit sehr unterschiedlichen Signalen
  const signals = evidence.map((e) => e.signal.toLowerCase());
  const uniqueSignals = new Set(signals);

  // Einfache Heuristik: Wenn Signale auf verschiedene Aktionen hindeuten
  const loginSignals = signals.filter((s) =>
    s.includes("login") || s.includes("sign in") || s.includes("auth"),
  );
  const registerSignals = signals.filter((s) =>
    s.includes("register") || s.includes("sign up") || s.includes("create account"),
  );

  if (loginSignals.length > 0 && registerSignals.length > 0) {
    return 0.6;
  }

  // Hohe Signal-Diversitaet bei niedrigem Gewicht deutet auf Unsicherheit
  if (uniqueSignals.size > evidence.length * 0.8) {
    const avgWeight = evidence.reduce((s, e) => s + e.weight, 0) / evidence.length;
    if (avgWeight < 0.4) return 0.3;
  }

  return 0.0;
}

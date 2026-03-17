/**
 * Confidence Engine — Gewichte-Konfiguration
 *
 * Verwaltet die 6 Confidence-Faktoren-Gewichte.
 * Summe MUSS immer 1.0 ergeben (Toleranz ±0.001).
 */

import { z } from "zod";
import { DEFAULT_CONFIDENCE_WEIGHTS } from "../../shared_interfaces.js";
import type { WeightOverrides, ValidatedWeights } from "./types.js";
import { WeightValidationError } from "./errors.js";

const WEIGHT_SUM_TOLERANCE = 0.001;

const WeightSchema = z.object({
  w1_semantic: z.number().min(0).max(1),
  w2_structural: z.number().min(0).max(1),
  w3_affordance: z.number().min(0).max(1),
  w4_evidence: z.number().min(0).max(1),
  w5_historical: z.number().min(0).max(1),
  w6_ambiguity: z.number().min(0).max(1),
});

/** E-Commerce Preset: Affordance + Historical hoeher gewichtet */
export const ECOMMERCE_WEIGHTS: WeightOverrides = {
  w1_semantic: 0.20,
  w2_structural: 0.15,
  w3_affordance: 0.25,
  w4_evidence: 0.15,
  w5_historical: 0.15,
  w6_ambiguity: 0.10,
};

/** Auth Preset: Semantic + Evidence hoeher gewichtet */
export const AUTH_WEIGHTS: WeightOverrides = {
  w1_semantic: 0.30,
  w2_structural: 0.15,
  w3_affordance: 0.15,
  w4_evidence: 0.20,
  w5_historical: 0.10,
  w6_ambiguity: 0.10,
};

/**
 * Prueft ob Gewichte gueltig sind:
 * - Alle >= 0
 * - Summe = 1.0 (±0.001)
 * - Genau 6 Gewichte
 */
export function validateWeights(weights: Record<string, number>): boolean {
  const keys = Object.keys(weights);
  const expectedKeys = [
    "w1_semantic", "w2_structural", "w3_affordance",
    "w4_evidence", "w5_historical", "w6_ambiguity",
  ];

  if (keys.length !== 6) return false;
  if (!expectedKeys.every((k) => k in weights)) return false;

  const values = Object.values(weights);
  if (values.some((v) => typeof v !== "number" || v < 0 || Number.isNaN(v))) return false;

  const sum = values.reduce((a, b) => a + b, 0);
  return Math.abs(sum - 1.0) <= WEIGHT_SUM_TOLERANCE;
}

/**
 * Gewichte laden, optional mit Overrides.
 * Wirft WeightValidationError wenn Summe != 1.0.
 */
export function getWeights(overrides?: Partial<WeightOverrides>): ValidatedWeights {
  const merged: WeightOverrides = {
    w1_semantic: overrides?.w1_semantic ?? DEFAULT_CONFIDENCE_WEIGHTS.w1_semantic,
    w2_structural: overrides?.w2_structural ?? DEFAULT_CONFIDENCE_WEIGHTS.w2_structural,
    w3_affordance: overrides?.w3_affordance ?? DEFAULT_CONFIDENCE_WEIGHTS.w3_affordance,
    w4_evidence: overrides?.w4_evidence ?? DEFAULT_CONFIDENCE_WEIGHTS.w4_evidence,
    w5_historical: overrides?.w5_historical ?? DEFAULT_CONFIDENCE_WEIGHTS.w5_historical,
    w6_ambiguity: overrides?.w6_ambiguity ?? DEFAULT_CONFIDENCE_WEIGHTS.w6_ambiguity,
  };

  const parsed = WeightSchema.safeParse(merged);
  if (!parsed.success) {
    throw new WeightValidationError(
      `Ungueltige Gewichte: ${parsed.error.message}`,
    );
  }

  if (!validateWeights(merged as unknown as Record<string, number>)) {
    const sum = Object.values(merged).reduce((a, b) => a + b, 0);
    throw new WeightValidationError(
      `Gewichte-Summe ${sum.toFixed(4)} ist nicht 1.0 (Toleranz ±${WEIGHT_SUM_TOLERANCE})`,
    );
  }

  return { ...merged, _validated: true as const };
}

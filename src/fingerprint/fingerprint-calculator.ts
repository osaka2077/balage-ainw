/**
 * FingerprintCalculator — Deterministischer Hash und Feature-Vektor.
 *
 * Kanonisierung: Keys alphabetisch, Strings lowercase, Floats 4 Dezimalen.
 * Hash: SHA-256 ueber kanonische JSON-Repraesentation.
 */

import { createHash } from "node:crypto";
import pino from "pino";
import type { FingerprintFeatures, SemanticFingerprint } from "./types.js";
import { SemanticFingerprintSchema } from "./types.js";
import { HashCalculationError } from "./errors.js";

const logger = pino({ name: "fingerprint:calculator" });

const DEFAULT_VERSION = 2;

function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "number")
    return Math.round(value * 10000) / 10000;
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value !== null && typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      normalized[k] = normalizeValue(v);
    }
    return normalized;
  }
  return value;
}

export function canonicalize(features: FingerprintFeatures): string {
  const normalized = normalizeValue(features);
  const sorted = sortKeys(normalized);
  return JSON.stringify(sorted);
}

export function hashFeatures(features: FingerprintFeatures): string {
  try {
    const canonical = canonicalize(features);
    return createHash("sha256").update(canonical).digest("hex");
  } catch (error) {
    throw new HashCalculationError(
      `Failed to hash features: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}

export function calculateFingerprint(
  features: FingerprintFeatures,
  version?: number,
): SemanticFingerprint {
  try {
    const hash = hashFeatures(features);

    const fingerprint = SemanticFingerprintSchema.parse({
      hash,
      features,
      version: version ?? DEFAULT_VERSION,
      createdAt: new Date(),
    });

    logger.debug(
      { hash: hash.slice(0, 16), version: fingerprint.version },
      "fingerprint calculated",
    );

    return fingerprint;
  } catch (error) {
    if (error instanceof HashCalculationError) throw error;
    throw new HashCalculationError(
      `Failed to calculate fingerprint: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}

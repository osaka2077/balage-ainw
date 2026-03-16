/**
 * Similarity — Cosine, Jaccard und gewichtete Gesamt-Similarity
 * zwischen Fingerprints. Alle Funktionen sind pure.
 */

import pino from "pino";
import type { FingerprintFeatures, SemanticFingerprint } from "./types.js";
import type { SimilarityOptions, SimilarityResult } from "./types.js";
import { SimilarityCalculationError } from "./errors.js";

const logger = pino({ name: "fingerprint:similarity" });

const DEFAULT_WEIGHTS = {
  structural: 0.3,
  semantic: 0.3,
  textual: 0.2,
  layout: 0.2,
};

export function cosineSimilarity(
  vec1: number[],
  vec2: number[],
): number {
  if (vec1.length === 0 || vec2.length === 0) return 0;
  if (vec1.length !== vec2.length) {
    throw new SimilarityCalculationError(
      "Vectors must have the same length",
    );
  }

  let dot = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dot += vec1[i]! * vec2[i]!;
    mag1 += vec1[i]! * vec1[i]!;
    mag2 += vec2[i]! * vec2[i]!;
  }

  const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
  if (magnitude === 0) return 0;

  return dot / magnitude;
}

export function jaccardSimilarity(
  set1: Set<string>,
  set2: Set<string>,
): number {
  if (set1.size === 0 && set2.size === 0) return 1;

  let intersection = 0;
  for (const item of set1) {
    if (set2.has(item)) intersection++;
  }

  const union = set1.size + set2.size - intersection;
  if (union === 0) return 1;

  return intersection / union;
}

export function structuralSimilarity(
  f1: FingerprintFeatures,
  f2: FingerprintFeatures,
): number {
  const maxDepth = Math.max(f1.domDepth, f2.domDepth, 1);
  const depthSim =
    1 - Math.abs(f1.domDepth - f2.domDepth) / maxDepth;

  const maxChildren = Math.max(f1.childCount, f2.childCount, 1);
  const childSim =
    1 - Math.abs(f1.childCount - f2.childCount) / maxChildren;

  const maxInteractive = Math.max(
    f1.interactiveElementCount,
    f2.interactiveElementCount,
    1,
  );
  const interactiveSim =
    1 -
    Math.abs(
      f1.interactiveElementCount - f2.interactiveElementCount,
    ) /
      maxInteractive;

  const headingSet1 = new Set(
    f1.headingHierarchy.map((h) => h.toLowerCase()),
  );
  const headingSet2 = new Set(
    f2.headingHierarchy.map((h) => h.toLowerCase()),
  );
  const headingSim = jaccardSimilarity(headingSet1, headingSet2);

  return (
    depthSim * 0.25 +
    childSim * 0.25 +
    interactiveSim * 0.25 +
    headingSim * 0.25
  );
}

export function semanticSimilarity(
  f1: FingerprintFeatures,
  f2: FingerprintFeatures,
): number {
  const roleSim =
    f1.semanticRole.toLowerCase() === f2.semanticRole.toLowerCase()
      ? 1
      : 0;

  const intentSet1 = new Set(
    f1.intentSignals.map((s) => s.toLowerCase()),
  );
  const intentSet2 = new Set(
    f2.intentSignals.map((s) => s.toLowerCase()),
  );
  const intentSim = jaccardSimilarity(intentSet1, intentSet2);

  const typeSet1 = new Set(f1.formFields.map((f) => f.type));
  const typeSet2 = new Set(f2.formFields.map((f) => f.type));
  const formSim = jaccardSimilarity(typeSet1, typeSet2);

  const actions1 = new Set(f1.actionElements.map((a) => a.type));
  const actions2 = new Set(f2.actionElements.map((a) => a.type));
  const actionSim = jaccardSimilarity(actions1, actions2);

  return (
    roleSim * 0.3 +
    intentSim * 0.3 +
    formSim * 0.2 +
    actionSim * 0.2
  );
}

export function textualSimilarity(
  f1: FingerprintFeatures,
  f2: FingerprintFeatures,
): number {
  const hashSim = f1.visibleTextHash === f2.visibleTextHash ? 1 : 0;

  const labelSet1 = new Set(
    f1.labelTexts.map((l) => l.toLowerCase()),
  );
  const labelSet2 = new Set(
    f2.labelTexts.map((l) => l.toLowerCase()),
  );
  const labelSim = jaccardSimilarity(labelSet1, labelSet2);

  const btnSet1 = new Set(
    f1.buttonTexts.map((b) => b.toLowerCase()),
  );
  const btnSet2 = new Set(
    f2.buttonTexts.map((b) => b.toLowerCase()),
  );
  const btnSim = jaccardSimilarity(btnSet1, btnSet2);

  return hashSim * 0.4 + labelSim * 0.3 + btnSim * 0.3;
}

export function layoutSimilarity(
  f1: FingerprintFeatures,
  f2: FingerprintFeatures,
): number {
  const regionSim = f1.layoutRegion === f2.layoutRegion ? 1 : 0;

  const maxDistance = Math.sqrt(100 * 100 + 100 * 100);
  const dx =
    f1.approximatePosition.top - f2.approximatePosition.top;
  const dy =
    f1.approximatePosition.left - f2.approximatePosition.left;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const positionSim = 1 - distance / maxDistance;

  return regionSim * 0.5 + positionSim * 0.5;
}

export function calculateSimilarity(
  fp1: SemanticFingerprint,
  fp2: SemanticFingerprint,
  options?: SimilarityOptions,
): SimilarityResult {
  try {
    const weights = { ...DEFAULT_WEIGHTS, ...options?.weights };

    const totalWeight =
      weights.structural +
      weights.semantic +
      weights.textual +
      weights.layout;
    const norm = {
      structural: weights.structural / totalWeight,
      semantic: weights.semantic / totalWeight,
      textual: weights.textual / totalWeight,
      layout: weights.layout / totalWeight,
    };

    const structural = structuralSimilarity(
      fp1.features,
      fp2.features,
    );
    const semantic = semanticSimilarity(fp1.features, fp2.features);
    const textual = textualSimilarity(fp1.features, fp2.features);
    const layout = layoutSimilarity(fp1.features, fp2.features);

    const score =
      structural * norm.structural +
      semantic * norm.semantic +
      textual * norm.textual +
      layout * norm.layout;

    const matchedFeatures: string[] = [];
    if (fp1.features.semanticRole === fp2.features.semanticRole) {
      matchedFeatures.push("semanticRole");
    }
    if (fp1.features.layoutRegion === fp2.features.layoutRegion) {
      matchedFeatures.push("layoutRegion");
    }
    if (
      fp1.features.visibleTextHash === fp2.features.visibleTextHash
    ) {
      matchedFeatures.push("visibleTextHash");
    }
    if (fp1.features.domDepth === fp2.features.domDepth) {
      matchedFeatures.push("domDepth");
    }
    if (
      fp1.features.interactiveElementCount ===
      fp2.features.interactiveElementCount
    ) {
      matchedFeatures.push("interactiveElementCount");
    }

    logger.debug(
      { score, structural, semantic, textual, layout },
      "similarity calculated",
    );

    return {
      score: Math.round(score * 10000) / 10000,
      breakdown: {
        structural: Math.round(structural * 10000) / 10000,
        semantic: Math.round(semantic * 10000) / 10000,
        textual: Math.round(textual * 10000) / 10000,
        layout: Math.round(layout * 10000) / 10000,
      },
      matchedFeatures,
    };
  } catch (error) {
    if (error instanceof SimilarityCalculationError) throw error;
    throw new SimilarityCalculationError(
      `Failed to calculate similarity: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}

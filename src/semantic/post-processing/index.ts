/**
 * Post-Processing Pipeline
 *
 * Orchestriert alle Post-Processing-Schritte in der korrekten Reihenfolge:
 * 1. Type-Corrections (PHASE 1)
 * 2. Confidence-Penalties (PHASE 2)
 * 3. Deduplizierung
 * 4. Gap-basierter Cutoff
 */

export { applyTypeCorrections, hasSearchEvidence, hasCartEvidence, isBookingStyleSearch } from "./type-corrector.js";
export { applyConfidencePenalties } from "./confidence-penalizer.js";
export { deduplicateCandidates, labelSimilarity } from "./deduplicator.js";
export { applyGapCutoff } from "./gap-cutoff.js";
export { applySiteSpecificCorrections } from "./site-specific-corrections.js";

import type { EndpointCandidate } from "../types.js";
import { applyTypeCorrections } from "./type-corrector.js";
import { applySiteSpecificCorrections } from "./site-specific-corrections.js";
import { applyConfidencePenalties } from "./confidence-penalizer.js";
import { deduplicateCandidates } from "./deduplicator.js";
import { applyGapCutoff } from "./gap-cutoff.js";

/**
 * Fuehrt die komplette Post-Processing-Pipeline aus.
 *
 * @param candidates - Candidates nach LLM-Extraktion (werden in-place mutiert fuer Phase 1+2)
 * @param segmentText - Lowercase Segment-Text fuer Evidence-Pruefung
 * @param segmentType - Optionaler Segment-Typ (footer, header, navigation, etc.)
 * @returns Gefilterte und deduplizierte Candidates
 */
export function runPostProcessing(
  candidates: EndpointCandidate[],
  segmentText: string,
  segmentType?: string,
): EndpointCandidate[] {
  // Phase 1: Type-Corrections (in-place)
  applyTypeCorrections(candidates, segmentText, segmentType);

  // Phase 1b: Site-Specific Corrections (in-place, nach generischen Regeln)
  applySiteSpecificCorrections(candidates, segmentText);

  // Phase 2: Confidence-Penalties (in-place)
  applyConfidencePenalties(candidates, segmentText, segmentType);

  // Phase 3: Deduplizierung
  const deduped = deduplicateCandidates(candidates);

  // Phase 4: Gap-basierter Cutoff
  return applyGapCutoff(deduped);
}

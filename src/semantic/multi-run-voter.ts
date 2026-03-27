/**
 * Multi-Run Majority Voter
 *
 * Stabilisiert LLM-Ergebnisse auf Segment-Level via Majority-Vote.
 * Statt die gesamte Pipeline N-mal zu wiederholen, wird jedes Segment
 * N-mal an das LLM geschickt und die Ergebnisse per Majority-Vote gemerged.
 *
 * Matching: Gleicher Typ + labelSimilarity() > 0.5
 * Threshold: Endpoint muss in >= ceil(N/2) Runs vorkommen
 * Confidence: Durchschnitt der Runs wo der Endpoint vorkam
 * Label/Description: Vom Run mit hoechster Confidence
 */

import pino from "pino";
import { labelSimilarity } from "./post-processing/deduplicator.js";
import type { EndpointCandidate } from "./types.js";

const logger = pino({ level: process.env["LOG_LEVEL"] ?? "silent", name: "semantic:multi-run-voter" });

/** Minimum label similarity to consider two candidates as the same endpoint */
const LABEL_SIMILARITY_THRESHOLD = 0.5;

interface CandidateBucket {
  type: string;
  /** Representative candidate (from run with highest confidence) */
  representative: EndpointCandidate;
  /** Confidence values from each run where this endpoint appeared */
  confidences: number[];
  /** Number of runs in which this endpoint appeared */
  runCount: number;
}

/**
 * Merges candidates from multiple runs via Majority-Vote.
 *
 * Empty runs count toward the total (they represent "LLM found nothing"
 * and are a valid vote against endpoints). The majority threshold is
 * calculated against all runs, not just non-empty ones.
 *
 * @param allRuns - Array of candidate arrays, one per run
 * @returns Stabilized candidates that appeared in a majority of runs
 */
export function majorityVote(allRuns: EndpointCandidate[][]): EndpointCandidate[] {
  if (allRuns.length === 0) return [];
  if (allRuns.length === 1) return allRuns[0] ?? [];

  // Threshold uses total run count (including empty runs)
  const majorityThreshold = Math.ceil(allRuns.length / 2);
  const buckets: CandidateBucket[] = [];

  for (const runCandidates of allRuns) {
    if (!Array.isArray(runCandidates)) continue;
    for (const candidate of runCandidates) {
      let matched = false;

      for (const bucket of buckets) {
        if (bucket.type !== candidate.type) continue;

        const sim = labelSimilarity(bucket.representative.label, candidate.label);
        if (sim > LABEL_SIMILARITY_THRESHOLD) {
          bucket.confidences.push(candidate.confidence);
          bucket.runCount++;

          // Update representative if this candidate has higher confidence
          if (candidate.confidence > bucket.representative.confidence) {
            bucket.representative = candidate;
          }
          matched = true;
          break;
        }
      }

      if (!matched) {
        buckets.push({
          type: candidate.type,
          representative: candidate,
          confidences: [candidate.confidence],
          runCount: 1,
        });
      }
    }
  }

  // Majority-Vote: keep only endpoints that appeared in >= threshold runs
  const stable = buckets
    .filter(b => b.runCount >= majorityThreshold)
    .map(b => ({
      ...b.representative,
      // Average confidence across all runs where this endpoint appeared
      confidence: b.confidences.reduce((sum, c) => sum + c, 0) / b.confidences.length,
    }));

  logger.debug(
    {
      totalRuns: allRuns.length,
      totalBuckets: buckets.length,
      stableBuckets: stable.length,
      majorityThreshold,
    },
    "Segment-level majority vote completed",
  );

  return stable.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Clamps multiRun value to valid range [1, 5].
 *
 * @param value - Raw multiRun value (from options or env)
 * @returns Clamped value between 1 and 5
 */
export function clampMultiRun(value: number | undefined | null): number {
  if (value === undefined || value === null || !Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.min(Math.floor(value), 5);
}

/**
 * Multi-Run Majority Voter
 *
 * Stabilisiert LLM-Ergebnisse auf Segment-Level via Majority-Vote.
 * Statt die gesamte Pipeline N-mal zu wiederholen, wird jedes Segment
 * N-mal an das LLM geschickt und die Ergebnisse per Majority-Vote gemerged.
 *
 * Matching: Typ-basiert mit Positions-Matching innerhalb des gleichen Typs.
 * Das LLM generiert oft verschiedene Labels fuer denselben Endpoint
 * ("Sign in with Google" vs "Google SSO Login"). Label-Similarity versagt
 * hier, weil Jaccard-Overlap zu niedrig ist. Stattdessen:
 *   1. Gruppiere alle Candidates pro Run nach Typ
 *   2. Fuer jeden Typ: Greedy-Match per labelSimilarity, Fallback auf Position
 *   3. Slot bekommt Majority-Vote ueber alle Runs
 *
 * Threshold: Endpoint muss in >= ceil(N/2) Runs vorkommen
 * Confidence: Durchschnitt der Runs wo der Endpoint vorkam
 * Label/Description: Vom Run mit hoechster Confidence
 */

import pino from "pino";
import { labelSimilarity } from "./post-processing/deduplicator.js";
import type { EndpointCandidate } from "./types.js";

const logger = pino({ level: process.env["LOG_LEVEL"] ?? "silent", name: "semantic:multi-run-voter" });

/**
 * Minimum label similarity for greedy matching within a type-slot.
 * Below this threshold, candidates fall back to positional matching.
 */
const LABEL_SIMILARITY_THRESHOLD = 0.2;

interface TypeSlot {
  type: string;
  /** Index within the type group (0 = first endpoint of this type, 1 = second, ...) */
  slotIndex: number;
  /** Representative candidate (from run with highest confidence) */
  representative: EndpointCandidate;
  /** Confidence values from each run where this slot was filled */
  confidences: number[];
  /** Number of runs in which this slot was filled */
  runCount: number;
}

/**
 * Groups candidates from a single run by their type.
 * Preserves order within each type group (used for positional fallback).
 */
function groupByType(candidates: EndpointCandidate[]): Map<string, EndpointCandidate[]> {
  const groups = new Map<string, EndpointCandidate[]>();
  for (const c of candidates) {
    const list = groups.get(c.type);
    if (list) {
      list.push(c);
    } else {
      groups.set(c.type, [c]);
    }
  }
  return groups;
}

/**
 * Merges candidates from multiple runs via Majority-Vote.
 *
 * Empty runs count toward the total (they represent "LLM found nothing"
 * and are a valid vote against endpoints). The majority threshold is
 * calculated against all runs, not just non-empty ones.
 *
 * Algorithm:
 *   1. Group candidates from ALL runs by type
 *   2. For each type, determine maxCount (max endpoints of this type in any single run)
 *   3. For each slot 0..maxCount-1, collect the slot-th endpoint of that type from each run
 *      using greedy label-similarity matching (threshold 0.2), falling back to position
 *   4. Apply majority threshold: slot survives if filled in >= ceil(N/2) runs
 *
 * @param allRuns - Array of candidate arrays, one per run
 * @returns Stabilized candidates that appeared in a majority of runs
 */
export function majorityVote(allRuns: EndpointCandidate[][]): EndpointCandidate[] {
  if (allRuns.length === 0) return [];
  if (allRuns.length === 1) return allRuns[0] ?? [];

  const majorityThreshold = Math.ceil(allRuns.length / 2);

  // Schritt 1: Gruppiere jeden Run nach Typ
  const runGroups: Map<string, EndpointCandidate[]>[] = [];
  const allTypes = new Set<string>();

  for (const runCandidates of allRuns) {
    if (!Array.isArray(runCandidates)) {
      runGroups.push(new Map());
      continue;
    }
    const grouped = groupByType(runCandidates);
    runGroups.push(grouped);
    for (const t of grouped.keys()) {
      allTypes.add(t);
    }
  }

  // Schritt 2: Fuer jeden Typ die maximale Slot-Anzahl bestimmen
  const slots: TypeSlot[] = [];

  for (const type of allTypes) {
    // Maximale Anzahl Endpoints dieses Typs in einem einzelnen Run
    let maxCount = 0;
    for (const group of runGroups) {
      const list = group.get(type);
      if (list && list.length > maxCount) {
        maxCount = list.length;
      }
    }

    // Schritt 3: Fuer jeden Slot greedy-matchen ueber alle Runs
    // Arbeite mit Kopien, damit wir gematchte Candidates entfernen koennen
    const runCopies: (EndpointCandidate | null)[][] = runGroups.map(group => {
      const list = group.get(type);
      return list ? list.map(c => c) : [];
    });

    for (let slotIdx = 0; slotIdx < maxCount; slotIdx++) {
      const slot: TypeSlot = {
        type,
        slotIndex: slotIdx,
        representative: undefined as unknown as EndpointCandidate,
        confidences: [],
        runCount: 0,
      };

      // Erste Candidate finden die als Referenz fuer diesen Slot dient
      let refLabel: string | undefined;

      for (let runIdx = 0; runIdx < runCopies.length; runIdx++) {
        const available = runCopies[runIdx]!;
        if (available.length === 0) continue;

        let bestIdx = -1;

        if (refLabel !== undefined) {
          // Greedy: Finde die Candidate mit hoechster labelSimilarity zum Referenz-Label
          let bestSim = -1;
          for (let i = 0; i < available.length; i++) {
            if (available[i] === null) continue;
            const sim = labelSimilarity(refLabel, available[i]!.label);
            if (sim > bestSim) {
              bestSim = sim;
              bestIdx = i;
            }
          }

          // Wenn Similarity unter Threshold: Fallback auf naechste freie Position
          if (bestSim < LABEL_SIMILARITY_THRESHOLD) {
            bestIdx = available.findIndex(c => c !== null);
          }
        } else {
          // Erster Run mit verfuegbaren Candidates: nimm den ersten verfuegbaren
          bestIdx = available.findIndex(c => c !== null);
        }

        if (bestIdx >= 0 && available[bestIdx] !== null) {
          const matched = available[bestIdx]!;
          available[bestIdx] = null; // Als gematcht markieren

          slot.confidences.push(matched.confidence);
          slot.runCount++;

          if (refLabel === undefined) {
            refLabel = matched.label;
          }

          // Representative = Candidate mit hoechster Confidence
          if (!slot.representative || matched.confidence > slot.representative.confidence) {
            slot.representative = matched;
          }
        }
      }

      if (slot.runCount > 0) {
        slots.push(slot);
      }
    }
  }

  // Schritt 4: Majority-Vote — nur Slots behalten die in >= threshold Runs vorkommen
  const stable = slots
    .filter(s => s.runCount >= majorityThreshold)
    .map(s => ({
      ...s.representative,
      confidence: s.confidences.reduce((sum, c) => sum + c, 0) / s.confidences.length,
    }));

  logger.debug(
    {
      totalRuns: allRuns.length,
      totalSlots: slots.length,
      stableSlots: stable.length,
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

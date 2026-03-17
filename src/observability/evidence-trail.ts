import { randomUUID } from "node:crypto";
import type {
  EvidenceTrailConfig,
  EvidenceTrailEntry,
  EvidenceChain,
  EvidenceVerification,
} from "./types.js";
import { PiiFilter } from "./pii-filter.js";
import { EvidenceTrailError, EvidenceChainBrokenError } from "./errors.js";

const DEFAULT_CONFIG: EvidenceTrailConfig = {
  maxEntries: 10000,
  piiFilter: true,
};

export class EvidenceTrail {
  private readonly config: EvidenceTrailConfig;
  private readonly piiFilter: PiiFilter | null;
  private readonly entries: EvidenceTrailEntry[] = [];

  constructor(config?: Partial<EvidenceTrailConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.piiFilter = this.config.piiFilter ? new PiiFilter() : null;
  }

  record(entry: Omit<EvidenceTrailEntry, "id">): EvidenceTrailEntry {
    if (this.entries.length >= this.config.maxEntries) {
      throw new EvidenceTrailError(
        `Max entries (${this.config.maxEntries}) reached`,
        "MAX_ENTRIES_REACHED",
      );
    }

    const fullEntry: EvidenceTrailEntry = {
      id: randomUUID(),
      ...entry,
    };

    // PII filter on metadata and evidence details
    if (this.piiFilter) {
      fullEntry.metadata = this.piiFilter.filterObject(
        fullEntry.metadata as Record<string, unknown>,
      );
      for (const ev of fullEntry.evidence) {
        if (ev.detail) {
          ev.detail = this.piiFilter.filterString(ev.detail);
        }
        ev.signal = this.piiFilter.filterString(ev.signal);
      }
    }

    this.entries.push(fullEntry);
    return fullEntry;
  }

  getByTraceId(traceId: string): EvidenceTrailEntry[] {
    return this.entries.filter((e) => e.traceId === traceId);
  }

  getByEndpointId(endpointId: string): EvidenceTrailEntry[] {
    return this.entries.filter((e) => e.endpointId === endpointId);
  }

  getByTimeRange(from: Date, to: Date): EvidenceTrailEntry[] {
    const fromMs = from.getTime();
    const toMs = to.getTime();
    return this.entries.filter((e) => {
      const ts = e.timestamp.getTime();
      return ts >= fromMs && ts <= toMs;
    });
  }

  getChain(traceId: string): EvidenceChain {
    const traceEntries = this.getByTraceId(traceId);
    const sorted = traceEntries.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    // Detect gaps: each entry except the first should logically follow the previous
    const gaps: string[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;

      // Gap detection: if outcome was failure but next entry continues, that's OK
      // If there's a large time gap (>60s), flag it
      const timeDiff = curr.timestamp.getTime() - prev.timestamp.getTime();
      if (timeDiff > 60000) {
        gaps.push(
          `Time gap of ${Math.round(timeDiff / 1000)}s between entries ${prev.id} and ${curr.id}`,
        );
      }

      // If previous entry was a failure but no escalation recorded
      if (prev.outcome === "failure" && curr.outcome !== "escalated" && curr.action !== "retry") {
        gaps.push(
          `Unhandled failure at entry ${prev.id}: outcome was 'failure' but next entry is '${curr.action}' not retry/escalation`,
        );
      }
    }

    return {
      traceId,
      entries: sorted,
      isComplete: gaps.length === 0 && sorted.length > 0,
      gaps,
    };
  }

  verify(traceId: string): EvidenceVerification {
    const chain = this.getChain(traceId);
    const issues: Array<{ type: string; message: string; entryId?: string }> = [];

    if (chain.entries.length === 0) {
      issues.push({ type: "empty", message: "No entries found for this trace" });
      return { traceId, isValid: false, isComplete: false, issues };
    }

    // Check each entry has evidence
    for (const entry of chain.entries) {
      if (entry.evidence.length === 0 && entry.outcome !== "skipped") {
        issues.push({
          type: "missing_evidence",
          message: `Entry '${entry.action}' has no evidence`,
          entryId: entry.id,
        });
      }

      // Confidence plausibility: if high confidence but outcome is failure, flag
      if (
        entry.confidenceScore !== undefined &&
        entry.confidenceScore > 0.9 &&
        entry.outcome === "failure"
      ) {
        issues.push({
          type: "confidence_mismatch",
          message: `High confidence (${entry.confidenceScore}) but outcome was failure`,
          entryId: entry.id,
        });
      }

      // Gate decision consistency
      if (entry.gateDecision === "deny" && entry.outcome === "success") {
        issues.push({
          type: "gate_violation",
          message: `Gate decision was 'deny' but outcome was 'success'`,
          entryId: entry.id,
        });
      }
    }

    // Include chain gaps as issues
    for (const gap of chain.gaps) {
      issues.push({ type: "chain_gap", message: gap });
    }

    return {
      traceId,
      isValid: issues.filter((i) => i.type === "gate_violation").length === 0,
      isComplete: chain.isComplete,
      issues,
    };
  }

  /** Get total entry count */
  size(): number {
    return this.entries.length;
  }

  /** Clear all entries */
  clear(): void {
    this.entries.length = 0;
  }
}

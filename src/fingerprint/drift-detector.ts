/**
 * DriftDetector — Erkennt schleichende Aenderungen an UI-Bereichen ueber Zeit.
 * Drift-Score, Delta-Analyse und Trend-Erkennung.
 */

import pino from "pino";
import { DRIFT_THRESHOLDS } from "../../shared_interfaces.js";
import type { SemanticFingerprint } from "./types.js";
import type {
  DriftResult,
  DeltaResult,
  TrendAnalysis,
} from "./types.js";
import { calculateSimilarity } from "./similarity.js";
import { DriftDetectionError } from "./errors.js";

const logger = pino({ name: "fingerprint:drift-detector" });

function getDriftLevel(similarity: number): DriftResult["level"] {
  if (similarity >= DRIFT_THRESHOLDS.IGNORE) return "ignore";
  if (similarity >= DRIFT_THRESHOLDS.LOG) return "log";
  if (similarity >= DRIFT_THRESHOLDS.RE_EVALUATE) return "re_evaluate";
  return "invalidate";
}

export function detectDrift(
  current: SemanticFingerprint,
  previous: SemanticFingerprint,
): DriftResult {
  try {
    const result = calculateSimilarity(current, previous);
    const driftScore =
      Math.round((1 - result.score) * 10000) / 10000;
    const level = getDriftLevel(result.score);

    const changedFeatures: DriftResult["changedFeatures"] = [];
    const f1 = current.features;
    const f2 = previous.features;

    if (f1.semanticRole !== f2.semanticRole) {
      changedFeatures.push({
        feature: "semanticRole",
        delta: 1,
        description: `${f2.semanticRole} → ${f1.semanticRole}`,
      });
    }
    if (f1.domDepth !== f2.domDepth) {
      changedFeatures.push({
        feature: "domDepth",
        delta: Math.abs(f1.domDepth - f2.domDepth),
        description: `${f2.domDepth} → ${f1.domDepth}`,
      });
    }
    if (f1.childCount !== f2.childCount) {
      changedFeatures.push({
        feature: "childCount",
        delta: Math.abs(f1.childCount - f2.childCount),
        description: `${f2.childCount} → ${f1.childCount}`,
      });
    }
    if (
      f1.interactiveElementCount !== f2.interactiveElementCount
    ) {
      changedFeatures.push({
        feature: "interactiveElementCount",
        delta: Math.abs(
          f1.interactiveElementCount -
            f2.interactiveElementCount,
        ),
        description: `${f2.interactiveElementCount} → ${f1.interactiveElementCount}`,
      });
    }
    if (f1.layoutRegion !== f2.layoutRegion) {
      changedFeatures.push({
        feature: "layoutRegion",
        delta: 1,
        description: `${f2.layoutRegion} → ${f1.layoutRegion}`,
      });
    }
    if (f1.visibleTextHash !== f2.visibleTextHash) {
      changedFeatures.push({
        feature: "visibleTextHash",
        delta: 1,
        description: "text content changed",
      });
    }
    if (f1.formFields.length !== f2.formFields.length) {
      changedFeatures.push({
        feature: "formFields",
        delta: Math.abs(
          f1.formFields.length - f2.formFields.length,
        ),
        description: `${f2.formFields.length} → ${f1.formFields.length} fields`,
      });
    }
    if (f1.actionElements.length !== f2.actionElements.length) {
      changedFeatures.push({
        feature: "actionElements",
        delta: Math.abs(
          f1.actionElements.length - f2.actionElements.length,
        ),
        description: `${f2.actionElements.length} → ${f1.actionElements.length} actions`,
      });
    }

    logger.debug(
      { driftScore, level, changedCount: changedFeatures.length },
      "drift detected",
    );

    return { similarity: result.score, driftScore, level, changedFeatures };
  } catch (error) {
    if (error instanceof DriftDetectionError) throw error;
    throw new DriftDetectionError(
      `Failed to detect drift: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}

export function detectDelta(
  current: SemanticFingerprint,
  previous: SemanticFingerprint,
): DeltaResult {
  try {
    const f1 = current.features;
    const f2 = previous.features;

    const addedFeatures: string[] = [];
    const removedFeatures: string[] = [];
    const modifiedFeatures: DeltaResult["modifiedFeatures"] = [];

    // Form fields
    const currentFieldPurposes = new Set(
      f1.formFields.map((f) => f.semanticPurpose),
    );
    const previousFieldPurposes = new Set(
      f2.formFields.map((f) => f.semanticPurpose),
    );

    for (const purpose of currentFieldPurposes) {
      if (!previousFieldPurposes.has(purpose)) {
        addedFeatures.push(`formField:${purpose}`);
      }
    }
    for (const purpose of previousFieldPurposes) {
      if (!currentFieldPurposes.has(purpose)) {
        removedFeatures.push(`formField:${purpose}`);
      }
    }

    // Action elements
    const currentActions = new Set(
      f1.actionElements.map((a) => `${a.type}:${a.label}`),
    );
    const previousActions = new Set(
      f2.actionElements.map((a) => `${a.type}:${a.label}`),
    );

    for (const action of currentActions) {
      if (!previousActions.has(action)) {
        addedFeatures.push(`action:${action}`);
      }
    }
    for (const action of previousActions) {
      if (!currentActions.has(action)) {
        removedFeatures.push(`action:${action}`);
      }
    }

    // Scalar features
    if (f1.semanticRole !== f2.semanticRole) {
      modifiedFeatures.push({
        feature: "semanticRole",
        oldValue: f2.semanticRole,
        newValue: f1.semanticRole,
      });
    }
    if (f1.domDepth !== f2.domDepth) {
      modifiedFeatures.push({
        feature: "domDepth",
        oldValue: f2.domDepth,
        newValue: f1.domDepth,
      });
    }
    if (f1.childCount !== f2.childCount) {
      modifiedFeatures.push({
        feature: "childCount",
        oldValue: f2.childCount,
        newValue: f1.childCount,
      });
    }
    if (f1.layoutRegion !== f2.layoutRegion) {
      modifiedFeatures.push({
        feature: "layoutRegion",
        oldValue: f2.layoutRegion,
        newValue: f1.layoutRegion,
      });
    }
    if (
      f1.interactiveElementCount !== f2.interactiveElementCount
    ) {
      modifiedFeatures.push({
        feature: "interactiveElementCount",
        oldValue: f2.interactiveElementCount,
        newValue: f1.interactiveElementCount,
      });
    }

    // Intent signals
    const currentIntents = new Set(f1.intentSignals);
    const previousIntents = new Set(f2.intentSignals);
    for (const signal of currentIntents) {
      if (!previousIntents.has(signal))
        addedFeatures.push(`intent:${signal}`);
    }
    for (const signal of previousIntents) {
      if (!currentIntents.has(signal))
        removedFeatures.push(`intent:${signal}`);
    }

    return { addedFeatures, removedFeatures, modifiedFeatures };
  } catch (error) {
    if (error instanceof DriftDetectionError) throw error;
    throw new DriftDetectionError(
      `Failed to detect delta: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}

export function analyzeTrend(
  history: SemanticFingerprint[],
): TrendAnalysis {
  if (history.length < 3) {
    return {
      direction: "insufficient_data",
      averageDriftPerVersion: 0,
      recommendation: "no_action",
      dataPoints: history.length,
    };
  }

  try {
    const driftScores: number[] = [];

    for (let i = 1; i < history.length; i++) {
      const result = calculateSimilarity(
        history[i]!,
        history[i - 1]!,
      );
      driftScores.push(1 - result.score);
    }

    const averageDrift =
      driftScores.reduce((sum, s) => sum + s, 0) /
      driftScores.length;

    const half = Math.floor(driftScores.length / 2);
    const firstHalf = driftScores.slice(0, half);
    const secondHalf = driftScores.slice(half);

    const avgFirst =
      firstHalf.length > 0
        ? firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length
        : 0;
    const avgSecond =
      secondHalf.length > 0
        ? secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length
        : 0;

    let direction: TrendAnalysis["direction"];
    let recommendation: TrendAnalysis["recommendation"];

    if (averageDrift < 0.05) {
      direction = "stable";
      recommendation = "no_action";
    } else if (avgSecond > avgFirst * 1.5) {
      direction = "diverging";
      recommendation = "invalidate";
    } else {
      direction = "drifting";
      recommendation = averageDrift < 0.15 ? "monitor" : "re_evaluate";
    }

    logger.debug(
      { direction, averageDrift, dataPoints: history.length },
      "trend analyzed",
    );

    return {
      direction,
      averageDriftPerVersion:
        Math.round(averageDrift * 10000) / 10000,
      recommendation,
      dataPoints: history.length,
    };
  } catch (error) {
    if (error instanceof DriftDetectionError) throw error;
    throw new DriftDetectionError(
      `Failed to analyze trend: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}

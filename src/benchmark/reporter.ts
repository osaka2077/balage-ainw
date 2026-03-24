/**
 * BALAGE Benchmark Suite — Report Generator
 *
 * Generiert Benchmark-Reports als JSON und Markdown.
 */

import { createLogger } from "../observability/index.js";
import { ReportGenerationError } from "./errors.js";
import type {
  BenchmarkRun,
  CalibrationBucket,
  CorpusCategory,
  ReportConfig,
} from "./types.js";

const logger = createLogger({ name: "benchmark:reporter" });

const ALL_CATEGORIES: CorpusCategory[] = [
  "ecommerce", "saas", "healthcare", "finance", "government",
  "blog", "spa", "wordpress", "shopify", "framework",
];

/**
 * Generiert einen JSON-Report aus einem BenchmarkRun.
 */
export function generateJsonReport(run: BenchmarkRun): string {
  if (!run.summary) {
    throw new ReportGenerationError("BenchmarkRun has no summary — run metrics first");
  }

  logger.info("Generating JSON report", { runId: run.id });

  const report = {
    id: run.id,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString(),
    config: run.config,
    summary: run.summary,
    resultCount: run.results.length,
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Generiert einen Markdown-Report aus einem BenchmarkRun.
 */
export function generateMarkdownReport(run: BenchmarkRun): string {
  if (!run.summary) {
    throw new ReportGenerationError("BenchmarkRun has no summary — run metrics first");
  }

  logger.info("Generating Markdown report", { runId: run.id });

  const s = run.summary;
  const duration = run.completedAt
    ? ((run.completedAt.getTime() - run.startedAt.getTime()) / 1000).toFixed(1)
    : "N/A";
  const date = run.startedAt.toISOString().split("T")[0];

  const lines: string[] = [];

  // Header
  lines.push("# BALAGE Benchmark Report");
  lines.push("");
  lines.push(`**Date:** ${date}`);
  lines.push(`**Fixtures:** ${s.totalFixtures}`);
  lines.push(`**Duration:** ${duration}s`);
  lines.push(`**Run ID:** ${run.id}`);
  lines.push("");

  // Summary Table
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Precision | ${s.precision.toFixed(3)} |`);
  lines.push(`| Recall | ${s.recall.toFixed(3)} |`);
  lines.push(`| F1 Score | ${s.f1Score.toFixed(3)} |`);
  lines.push(`| Brier Score | ${s.brierScore.toFixed(4)} |`);
  lines.push(`| Latency P50 | ${s.latency.p50}ms |`);
  lines.push(`| Latency P95 | ${s.latency.p95}ms |`);
  lines.push(`| Latency P99 | ${s.latency.p99}ms |`);
  lines.push(`| True Positives | ${s.truePositives} |`);
  lines.push(`| False Positives | ${s.falsePositives} |`);
  lines.push(`| False Negatives | ${s.falseNegatives} |`);
  lines.push("");

  // Per-Category Results
  lines.push("## Per-Category Results");
  lines.push("");
  lines.push("| Category | Precision | Recall | F1 | Fixtures |");
  lines.push("|----------|-----------|--------|----|----------|");
  for (const cat of ALL_CATEGORIES) {
    const c = s.perCategory[cat];
    if (c) {
      lines.push(
        `| ${cat} | ${c.precision.toFixed(3)} | ${c.recall.toFixed(3)} | ${c.f1Score.toFixed(3)} | ${c.fixtureCount} |`,
      );
    }
  }
  lines.push("");

  // Calibration
  lines.push("## Calibration");
  lines.push("");
  lines.push("| Bucket | Predicted | Actual | Count |");
  lines.push("|--------|-----------|--------|-------|");
  for (const b of s.calibrationData) {
    lines.push(
      `| ${formatBucket(b)} | ${b.predictedConfidence.toFixed(3)} | ${b.actualAccuracy.toFixed(3)} | ${b.count} |`,
    );
  }
  lines.push("");

  // Token Usage
  lines.push("## Token Usage");
  lines.push("");
  lines.push(`- Total Tokens: ${s.tokenUsage.totalTokens.toLocaleString()}`);
  lines.push(`- Prompt Tokens: ${s.tokenUsage.totalPrompt.toLocaleString()}`);
  lines.push(`- Completion Tokens: ${s.tokenUsage.totalCompletion.toLocaleString()}`);
  lines.push(`- Average per Fixture: ${s.tokenUsage.avgPerFixture.toLocaleString()}`);
  lines.push(`- Estimated Cost: $${s.tokenUsage.costEstimateUsd.toFixed(2)}`);
  lines.push("");

  // Latency Details
  lines.push("## Latency Details");
  lines.push("");
  lines.push("| Percentile | Value |");
  lines.push("|------------|-------|");
  lines.push(`| Min | ${s.latency.min}ms |`);
  lines.push(`| P50 | ${s.latency.p50}ms |`);
  lines.push(`| Mean | ${s.latency.mean}ms |`);
  lines.push(`| P95 | ${s.latency.p95}ms |`);
  lines.push(`| P99 | ${s.latency.p99}ms |`);
  lines.push(`| Max | ${s.latency.max}ms |`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Generiert Report in einem oder beiden Formaten.
 */
export function generateReport(
  run: BenchmarkRun,
  config?: ReportConfig,
): { json?: string; markdown?: string } {
  const format = config?.format ?? "both";

  const result: { json?: string; markdown?: string } = {};

  if (format === "json" || format === "both") {
    result.json = generateJsonReport(run);
  }

  if (format === "markdown" || format === "both") {
    result.markdown = generateMarkdownReport(run);
  }

  return result;
}

function formatBucket(b: CalibrationBucket): string {
  return `${b.bucketStart.toFixed(1)}-${b.bucketEnd.toFixed(1)}`;
}

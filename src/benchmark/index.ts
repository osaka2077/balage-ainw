/**
 * BALAGE Benchmark Suite — Public API
 *
 * 50-Website-Corpus, Ground-Truth Annotationen, BenchmarkRunner,
 * Metriken-Engine und Report-Generator.
 */

// Core
export { BenchmarkRunner } from "./runner.js";
export { getCorpus, getCorpusByCategory, getCorpusEntry } from "./corpus.js";
export { getGroundTruth, getGroundTruthForCorpus, getTotalExpectedEndpoints } from "./ground-truth.js";

// Metriken
export {
  calculateMetrics,
  calculateDetectionMetrics,
  calculateBrierScore,
  calculateLatencyPercentiles,
  calculateCalibrationBuckets,
} from "./metrics.js";

// Reporter
export { generateJsonReport, generateMarkdownReport, generateReport } from "./reporter.js";

// Typen
export type {
  CorpusEntry,
  CorpusCategory,
  GroundTruthEntry,
  GroundTruthEndpoint,
  BenchmarkConfig,
  BenchmarkRun,
  FixtureResult,
  DetectedEndpoint,
  BenchmarkProgress,
  BenchmarkSummary,
  CalibrationBucket,
  ReportConfig,
  BenchmarkComparison,
  EndpointDetector,
} from "./types.js";

// Errors
export {
  BenchmarkError,
  CorpusNotFoundError,
  GroundTruthMissingError,
  FixtureTimeoutError,
  MetricsCalculationError,
  ReportGenerationError,
} from "./errors.js";

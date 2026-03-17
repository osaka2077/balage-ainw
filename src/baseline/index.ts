/**
 * BALAGE Baseline — Public API
 *
 * Vision-only Baseline als Vergleichs-Referenz fuer BALAGE.
 * Screenshot → LLM Vision → Endpoints.
 */

// Core
export { ScreenshotCapturer } from "./screenshot-capturer.js";
export { VisionAnalyzer, MockVisionAnalyzer, VISION_PROMPT } from "./vision-analyzer.js";
export { BaselineRunner, getCorpus, matchEndpoints, calculateSummary } from "./baseline-runner.js";

// Typen
export type {
  ScreenshotConfig,
  ScreenshotResult,
  VisionAnalyzerConfig,
  VisionAnalysisResult,
  BaselineConfig,
  BaselineRun,
  BaselineProgress,
  CorpusEntry,
  CorpusCategory,
  GroundTruthEndpoint,
  DetectedEndpoint,
  FixtureResult,
  BenchmarkSummary,
  BenchmarkComparison,
  CalibrationBucket,
} from "./types.js";

// Errors
export {
  BaselineError,
  ScreenshotCaptureError,
  ScreenshotTimeoutError,
  VisionAnalysisError,
  VisionApiError,
  BaselineRunnerError,
} from "./errors.js";

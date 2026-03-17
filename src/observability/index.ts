/**
 * BALAGE Observability Layer — Public API
 *
 * Provides tracing, structured logging, evidence trails,
 * replay recording/playback, and Prometheus-compatible metrics.
 */

// Core
export { Tracer, InMemoryExporter } from "./tracer.js";
export { createLogger, BalageLogger } from "./logger.js";
export { EvidenceTrail } from "./evidence-trail.js";
export { ReplayRecorder } from "./replay-recorder.js";
export { ReplayPlayer } from "./replay-player.js";
export { MetricsCollector, getDashboardData } from "./metrics-collector.js";
export { PiiFilter } from "./pii-filter.js";

// Typen
export type {
  TracerConfig, Span, SpanOptions, SpanEvent, SpanStatus, TraceContext, SpanExporter,
  LogLevel, LoggerOptions,
  PiiFilterConfig, PiiDetection,
  EvidenceTrailConfig, EvidenceTrailEntry, EvidenceChain, EvidenceVerification,
  ReplayConfig, ReplayEventType, ReplayEvent, ReplayRecording, RecordingSummary,
  PlaybackOptions, PlaybackState, ReplayEventHandler, ReplayPlaybackResult, ReplayDiff,
  ReplayPlayerConfig,
  MetricsConfig, MetricSnapshot, TimeRange, DashboardData,
} from "./types.js";

// Error-Klassen
export {
  ObservabilityError, TracerError, SpanNotFoundError, TraceContextError,
  LoggerError, PiiFilterError,
  EvidenceTrailError, EvidenceChainBrokenError,
  ReplayError, ReplayRecordingNotFoundError, ReplayPlaybackError,
  MetricsError,
} from "./errors.js";

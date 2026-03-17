export class ObservabilityError extends Error {
  readonly code: string;
  readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = "ObservabilityError";
    this.code = code;
    this.cause = cause;
  }
}

export class TracerError extends ObservabilityError {
  constructor(message: string, code: string = "TRACER_ERROR", cause?: Error) {
    super(message, code, cause);
    this.name = "TracerError";
  }
}

export class SpanNotFoundError extends TracerError {
  readonly spanId: string;

  constructor(spanId: string) {
    super(`Span not found: ${spanId}`, "SPAN_NOT_FOUND");
    this.name = "SpanNotFoundError";
    this.spanId = spanId;
  }
}

export class TraceContextError extends TracerError {
  constructor(message: string) {
    super(message, "TRACE_CONTEXT_ERROR");
    this.name = "TraceContextError";
  }
}

export class LoggerError extends ObservabilityError {
  constructor(message: string, cause?: Error) {
    super(message, "LOGGER_ERROR", cause);
    this.name = "LoggerError";
  }
}

export class PiiFilterError extends ObservabilityError {
  constructor(message: string, cause?: Error) {
    super(message, "PII_FILTER_ERROR", cause);
    this.name = "PiiFilterError";
  }
}

export class EvidenceTrailError extends ObservabilityError {
  constructor(message: string, code: string = "EVIDENCE_TRAIL_ERROR", cause?: Error) {
    super(message, code, cause);
    this.name = "EvidenceTrailError";
  }
}

export class EvidenceChainBrokenError extends EvidenceTrailError {
  readonly traceId: string;
  readonly gap: string;

  constructor(traceId: string, gap: string) {
    super(`Evidence chain broken for trace ${traceId}: ${gap}`, "EVIDENCE_CHAIN_BROKEN");
    this.name = "EvidenceChainBrokenError";
    this.traceId = traceId;
    this.gap = gap;
  }
}

export class ReplayError extends ObservabilityError {
  constructor(message: string, code: string = "REPLAY_ERROR", cause?: Error) {
    super(message, code, cause);
    this.name = "ReplayError";
  }
}

export class ReplayRecordingNotFoundError extends ReplayError {
  readonly recordingId: string;

  constructor(recordingId: string) {
    super(`Recording not found: ${recordingId}`, "RECORDING_NOT_FOUND");
    this.name = "ReplayRecordingNotFoundError";
    this.recordingId = recordingId;
  }
}

export class ReplayPlaybackError extends ReplayError {
  readonly eventIndex: number;

  constructor(eventIndex: number, message: string, cause?: Error) {
    super(message, "REPLAY_PLAYBACK_ERROR", cause);
    this.name = "ReplayPlaybackError";
    this.eventIndex = eventIndex;
  }
}

export class MetricsError extends ObservabilityError {
  constructor(message: string, cause?: Error) {
    super(message, "METRICS_ERROR", cause);
    this.name = "MetricsError";
  }
}

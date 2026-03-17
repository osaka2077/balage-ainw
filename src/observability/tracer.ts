import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type {
  TracerConfig,
  Span,
  SpanOptions,
  SpanEvent,
  SpanStatus,
  TraceContext,
  SpanExporter,
} from "./types.js";
import { SpanNotFoundError, TraceContextError } from "./errors.js";

/** In-memory span exporter for testing and debugging */
export class InMemoryExporter implements SpanExporter {
  readonly spans: Span[] = [];

  async export(spans: ReadonlyArray<Span>): Promise<void> {
    this.spans.push(...spans);
  }

  async shutdown(): Promise<void> {
    this.spans.length = 0;
  }

  getSpans(): ReadonlyArray<Span> {
    return this.spans;
  }
}

const contextStorage = new AsyncLocalStorage<TraceContext>();

export class Tracer {
  private readonly config: TracerConfig;
  private readonly exporter: SpanExporter;
  private readonly activeSpans = new Map<string, Span>();
  private readonly buffer: Span[] = [];

  constructor(config: Partial<TracerConfig> & { serviceName: string }) {
    this.config = {
      serviceName: config.serviceName,
      samplingRate: config.samplingRate ?? 1.0,
      maxSpansPerTrace: config.maxSpansPerTrace ?? 1000,
      exporter: config.exporter,
    };
    this.exporter = config.exporter ?? new InMemoryExporter();
  }

  startSpan(name: string, options?: SpanOptions): Span {
    // Determine parent context: explicit > AsyncLocalStorage > none
    const parentContext = options?.parent ?? contextStorage.getStore();
    const traceId = parentContext?.traceId ?? randomUUID();
    const spanId = randomUUID();

    const span: Span = {
      traceId,
      spanId,
      parentSpanId: parentContext?.spanId,
      name,
      startTime: new Date(),
      attributes: {
        "service.name": this.config.serviceName,
        ...(options?.attributes ?? {}),
      },
      events: [],
      status: "unset",
    };

    this.activeSpans.set(spanId, span);
    return span;
  }

  endSpan(span: Span): void {
    span.endTime = new Date();
    span.duration = span.endTime.getTime() - span.startTime.getTime();
    this.activeSpans.delete(span.spanId);

    // Sampling
    if (Math.random() < this.config.samplingRate) {
      this.buffer.push(span);
    }
  }

  getCurrentContext(): TraceContext | undefined {
    return contextStorage.getStore();
  }

  withContext<T>(context: TraceContext, fn: () => T): T {
    return contextStorage.run(context, fn);
  }

  /**
   * Execute fn within a span's context so child spans automatically use it as parent.
   */
  withSpan<T>(span: Span, fn: () => T): T {
    const context: TraceContext = {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      baggage: {},
    };
    return this.withContext(context, fn);
  }

  addEvent(span: Span, name: string, attributes?: Record<string, unknown>): void {
    const event: SpanEvent = {
      name,
      timestamp: new Date(),
      attributes,
    };
    span.events.push(event);
  }

  setStatus(span: Span, status: SpanStatus): void {
    span.status = status;
  }

  getActiveSpans(): Span[] {
    return Array.from(this.activeSpans.values());
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const spans = [...this.buffer];
    this.buffer.length = 0;
    await this.exporter.export(spans);
  }

  getExporter(): SpanExporter {
    return this.exporter;
  }
}

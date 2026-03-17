import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import pino from "pino";

import { Tracer, InMemoryExporter } from "../tracer.js";
import { PiiFilter } from "../pii-filter.js";
import { EvidenceTrail } from "../evidence-trail.js";
import { ReplayRecorder } from "../replay-recorder.js";
import { ReplayPlayer } from "../replay-player.js";
import { MetricsCollector } from "../metrics-collector.js";
import { BalageLogger } from "../logger.js";
import type { Evidence } from "../../../shared_interfaces.js";
import type { ReplayEvent, ReplayEventType, EvidenceTrailEntry } from "../types.js";

// ============================================================================
// Tracer (3 Tests)
// ============================================================================

describe("Tracer", () => {
  let tracer: Tracer;
  let exporter: InMemoryExporter;

  beforeEach(() => {
    exporter = new InMemoryExporter();
    tracer = new Tracer({ serviceName: "test-service", exporter });
  });

  it("should create and end a span with traceId, spanId, startTime, endTime, duration", () => {
    const span = tracer.startSpan("test-operation");

    expect(span.traceId).toBeDefined();
    expect(span.spanId).toBeDefined();
    expect(span.startTime).toBeInstanceOf(Date);
    expect(span.endTime).toBeUndefined();
    expect(span.name).toBe("test-operation");
    expect(span.status).toBe("unset");

    tracer.endSpan(span);

    expect(span.endTime).toBeInstanceOf(Date);
    expect(span.duration).toBeGreaterThanOrEqual(0);
    expect(span.duration).toBe(span.endTime!.getTime() - span.startTime.getTime());
  });

  it("should create parent-child spans with matching traceId", () => {
    const parentSpan = tracer.startSpan("parent");
    const childSpan = tracer.startSpan("child", {
      parent: {
        traceId: parentSpan.traceId,
        spanId: parentSpan.spanId,
        baggage: {},
      },
    });

    expect(childSpan.traceId).toBe(parentSpan.traceId);
    expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
    expect(childSpan.spanId).not.toBe(parentSpan.spanId);

    tracer.endSpan(childSpan);
    tracer.endSpan(parentSpan);
  });

  it("should propagate context via withContext/withSpan for automatic parent detection", () => {
    const parentSpan = tracer.startSpan("parent");

    const childSpan = tracer.withSpan(parentSpan, () => {
      // startSpan inside withSpan should automatically pick up parent
      return tracer.startSpan("auto-child");
    });

    expect(childSpan.traceId).toBe(parentSpan.traceId);
    expect(childSpan.parentSpanId).toBe(parentSpan.spanId);

    tracer.endSpan(childSpan);
    tracer.endSpan(parentSpan);
  });
});

// ============================================================================
// PII Filter (3 Tests)
// ============================================================================

describe("PiiFilter", () => {
  let filter: PiiFilter;

  beforeEach(() => {
    filter = new PiiFilter();
  });

  it("should detect and redact email addresses", () => {
    const input = "Contact user@example.com for details";
    const result = filter.filterString(input);

    expect(result).toBe("Contact [EMAIL_REDACTED] for details");
    expect(result).not.toContain("user@example.com");
  });

  it("should detect and redact credit card numbers", () => {
    const input = "CC: 4111 1111 1111 1111";
    const result = filter.filterString(input);

    expect(result).toContain("[CC_REDACTED]");
    expect(result).not.toContain("4111 1111 1111 1111");
  });

  it("should recursively filter PII from objects including sensitive keys", () => {
    const input = {
      email: "a@b.com",
      password: "supersecret",
      nested: {
        phone: "+49 123 456789",
        data: "safe value",
      },
    };

    const result = filter.filterObject(input);

    // Email in value should be redacted
    expect(result.email).toBe("[EMAIL_REDACTED]");
    // Password key should be fully redacted
    expect(result.password).toBe("[REDACTED]");
    // Nested phone should be redacted
    const nested = result.nested as Record<string, unknown>;
    expect(nested.phone).toContain("[PHONE_REDACTED]");
    // Safe value should remain
    expect(nested.data).toBe("safe value");
  });
});

// ============================================================================
// Evidence Trail (2 Tests)
// ============================================================================

describe("EvidenceTrail", () => {
  let trail: EvidenceTrail;

  beforeEach(() => {
    trail = new EvidenceTrail({ piiFilter: false });
  });

  it("should record an entry and retrieve it by traceId", () => {
    const traceId = randomUUID();
    const evidence: Evidence = {
      type: "semantic_label",
      signal: "submit button detected",
      weight: 0.9,
    };

    trail.record({
      traceId,
      spanId: randomUUID(),
      timestamp: new Date(),
      action: "form_fill",
      endpointId: randomUUID(),
      evidence: [evidence],
      confidenceScore: 0.85,
      gateDecision: "allow",
      outcome: "success",
      metadata: { step: "login" },
    });

    const entries = trail.getByTraceId(traceId);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe("form_fill");
    expect(entries[0]!.evidence).toHaveLength(1);
    expect(entries[0]!.evidence[0]!.signal).toBe("submit button detected");
    expect(entries[0]!.confidenceScore).toBe(0.85);
    expect(entries[0]!.gateDecision).toBe("allow");
  });

  it("should detect gaps in evidence chain and report isComplete: false", () => {
    const traceId = randomUUID();
    const now = Date.now();

    // Entry 1: success
    trail.record({
      traceId,
      spanId: randomUUID(),
      timestamp: new Date(now),
      action: "navigate",
      evidence: [{ type: "semantic_label", signal: "nav", weight: 0.8 }],
      outcome: "success",
      metadata: {},
    });

    // Entry 2: failure — but no retry/escalation follows
    trail.record({
      traceId,
      spanId: randomUUID(),
      timestamp: new Date(now + 1000),
      action: "form_fill",
      evidence: [{ type: "text_content", signal: "form", weight: 0.7 }],
      outcome: "failure",
      metadata: {},
    });

    // Entry 3: continues without handling the failure (not a retry)
    trail.record({
      traceId,
      spanId: randomUUID(),
      timestamp: new Date(now + 2000),
      action: "submit",
      evidence: [{ type: "structural_pattern", signal: "submit", weight: 0.6 }],
      outcome: "success",
      metadata: {},
    });

    const verification = trail.verify(traceId);
    expect(verification.isComplete).toBe(false);
    expect(verification.issues.length).toBeGreaterThan(0);
    expect(verification.issues.some((i) => i.type === "chain_gap")).toBe(true);
  });
});

// ============================================================================
// Replay (2 Tests)
// ============================================================================

describe("Replay", () => {
  it("should record events and play them back in correct order", async () => {
    const recorder = new ReplayRecorder({ piiFilter: false });
    const traceId = randomUUID();

    const recordingId = recorder.startRecording("wf-1", traceId);

    const eventTypes: ReplayEventType[] = [
      "workflow_start",
      "step_start",
      "agent_dispatch",
      "agent_result",
      "step_end",
      "workflow_end",
    ];

    for (let i = 0; i < eventTypes.length; i++) {
      recorder.recordEvent(recordingId, {
        offsetMs: i * 100,
        type: eventTypes[i]!,
        data: { index: i },
        traceId,
      });
    }

    const recording = recorder.stopRecording(recordingId);
    expect(recording.eventCount).toBe(6);
    expect(recording.events[0]!.type).toBe("workflow_start");
    expect(recording.events[5]!.type).toBe("workflow_end");

    // Play back
    const player = new ReplayPlayer();
    const playedEvents: ReplayEvent[] = [];

    for (const type of eventTypes) {
      player.onEvent(type, (event) => {
        playedEvents.push(event);
      });
    }

    const result = await player.play(recording, { speed: 0 });

    expect(result.eventsPlayed).toBe(6);
    expect(result.state).toBe("completed");
    expect(playedEvents).toHaveLength(6);

    // Verify order
    for (let i = 0; i < eventTypes.length; i++) {
      expect(playedEvents[i]!.type).toBe(eventTypes[i]);
    }
  });

  it("should compare two recordings and detect differences", async () => {
    const recorder = new ReplayRecorder({ piiFilter: false });
    const traceId1 = randomUUID();
    const traceId2 = randomUUID();

    // Recording 1
    const id1 = recorder.startRecording("wf-1", traceId1);
    recorder.recordEvent(id1, { offsetMs: 0, type: "workflow_start", data: { v: 1 }, traceId: traceId1 });
    recorder.recordEvent(id1, { offsetMs: 100, type: "step_start", data: { step: "a" }, traceId: traceId1 });
    recorder.recordEvent(id1, { offsetMs: 200, type: "step_end", data: { step: "a" }, traceId: traceId1 });
    const rec1 = recorder.stopRecording(id1);

    // Recording 2: different data, extra event
    const id2 = recorder.startRecording("wf-1", traceId2);
    recorder.recordEvent(id2, { offsetMs: 0, type: "workflow_start", data: { v: 2 }, traceId: traceId2 });
    recorder.recordEvent(id2, { offsetMs: 100, type: "step_start", data: { step: "b" }, traceId: traceId2 });
    recorder.recordEvent(id2, { offsetMs: 200, type: "step_end", data: { step: "b" }, traceId: traceId2 });
    recorder.recordEvent(id2, { offsetMs: 300, type: "workflow_end", data: {}, traceId: traceId2 });
    const rec2 = recorder.stopRecording(id2);

    const player = new ReplayPlayer();
    const diff = await player.compare(rec1, rec2);

    expect(diff.identical).toBe(false);
    // workflow_start data differs (v:1 vs v:2)
    expect(diff.modified.length).toBeGreaterThan(0);
    // rec2 has an extra event
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.type).toBe("workflow_end");
  });
});

// ============================================================================
// Metrics (1 Test)
// ============================================================================

describe("MetricsCollector", () => {
  it("should track counters and histograms and export Prometheus format", () => {
    const collector = new MetricsCollector();

    // Increment counters
    collector.incrementCounter("balage_workflows_total", { status: "completed" });
    collector.incrementCounter("balage_workflows_total", { status: "completed" });
    collector.incrementCounter("balage_workflows_total", { status: "failed" });

    // Observe histogram
    collector.observeHistogram("balage_workflow_duration_seconds", 0.5);
    collector.observeHistogram("balage_workflow_duration_seconds", 2.0);

    // Set gauge
    collector.setGauge("balage_active_workflows", 3);

    const output = collector.getMetrics();

    // Verify Prometheus format
    expect(output).toContain("# TYPE balage_workflows_total counter");
    expect(output).toContain('balage_workflows_total{status="completed"} 2');
    expect(output).toContain('balage_workflows_total{status="failed"} 1');

    expect(output).toContain("# TYPE balage_workflow_duration_seconds histogram");
    expect(output).toContain("balage_workflow_duration_seconds_count 2");
    expect(output).toContain("balage_workflow_duration_seconds_sum 2.5");
    // 0.5 fits in bucket 0.5, 2.0 fits in bucket 2.5
    expect(output).toContain('balage_workflow_duration_seconds_bucket{le="0.5"} 1');
    expect(output).toContain('balage_workflow_duration_seconds_bucket{le="2.5"} 2');
    expect(output).toContain('balage_workflow_duration_seconds_bucket{le="+Inf"} 2');

    expect(output).toContain("# TYPE balage_active_workflows gauge");
    expect(output).toContain("balage_active_workflows 3");
  });
});

// ============================================================================
// Logger (1 Test)
// ============================================================================

describe("BalageLogger", () => {
  it("should filter PII from log messages", () => {
    const chunks: string[] = [];
    const dest = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });

    const pinoInstance = pino({ name: "test-logger", level: "info" }, dest);
    const piiFilter = new PiiFilter();
    const logger = new BalageLogger(pinoInstance, piiFilter, false);

    logger.info("User email: user@test.com contacted us");

    // pino writes JSON lines — parse the output
    expect(chunks.length).toBeGreaterThan(0);
    const logLine = chunks[0]!;
    const parsed = JSON.parse(logLine) as Record<string, unknown>;

    expect(parsed["msg"]).toContain("[EMAIL_REDACTED]");
    expect(parsed["msg"]).not.toContain("user@test.com");
  });
});

// ============================================================================
// Integration: PII filter on Evidence Trail (bonus test)
// ============================================================================

describe("EvidenceTrail with PII filtering", () => {
  it("should redact PII from evidence signals and metadata", () => {
    const trail = new EvidenceTrail({ piiFilter: true });
    const traceId = randomUUID();

    trail.record({
      traceId,
      spanId: randomUUID(),
      timestamp: new Date(),
      action: "form_fill",
      evidence: [{
        type: "text_content",
        signal: "Email field contains user@secret.com",
        weight: 0.8,
        detail: "Found email user@secret.com in form",
      }],
      outcome: "success",
      metadata: {
        userEmail: "user@secret.com",
        password: "hunter2",
      },
    });

    const entries = trail.getByTraceId(traceId);
    const entry = entries[0]!;

    // Evidence signal should be filtered
    expect(entry.evidence[0]!.signal).not.toContain("user@secret.com");
    expect(entry.evidence[0]!.signal).toContain("[EMAIL_REDACTED]");

    // Evidence detail should be filtered
    expect(entry.evidence[0]!.detail).not.toContain("user@secret.com");

    // Metadata password should be redacted
    expect(entry.metadata["password"]).toBe("[REDACTED]");
  });
});

/**
 * Integration Tests: Tracing durch Pipeline
 * Validiert Trace-Korrelation und Metriken im Pipeline-Flow.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { createObservabilityStack, type ObservabilityStack } from "./helpers.js";
import { createMockPipeline } from "./fixtures/mock-pipeline.js";

describe("Tracing Integration", () => {
  let stack: ObservabilityStack;

  beforeEach(() => {
    stack = createObservabilityStack();
  });

  it("should correlate all spans through the pipeline with matching traceId and parent-child relationships", async () => {
    const { tracer, exporter, metrics } = stack;
    const pipeline = createMockPipeline(tracer, metrics);

    // Simuliere Workflow-Execution: Root-Span -> Pipeline
    const workflowSpan = tracer.startSpan("workflow.run", {
      attributes: { "balage.workflow.name": "test-workflow" },
    });

    const pipelineResult = tracer.withSpan(workflowSpan, () => {
      return pipeline.execute("https://example.com/contact");
    });

    tracer.endSpan(workflowSpan);
    await tracer.flush();

    const spans = exporter.getSpans();
    const traceId = workflowSpan.traceId;

    // Alle Spans haben gleiche traceId
    expect(spans.length).toBeGreaterThanOrEqual(4);
    for (const span of spans) {
      expect(span.traceId).toBe(traceId);
    }

    // Erwartete Spans vorhanden
    const spanNames = spans.map((s) => s.name);
    expect(spanNames).toContain("workflow.run");
    expect(spanNames).toContain("pipeline.execute");
    expect(spanNames).toContain("pipeline.parse");
    expect(spanNames).toContain("pipeline.gate");

    // Parent-Child: pipeline.execute hat workflow.run als Parent
    const pipelineSpan = spans.find((s) => s.name === "pipeline.execute");
    expect(pipelineSpan).toBeDefined();
    expect(pipelineSpan!.parentSpanId).toBe(workflowSpan.spanId);

    // pipeline.parse, pipeline.semantic etc. haben pipeline.execute als Parent
    const rootSpanId = pipelineResult.rootSpan.spanId;
    for (const childSpan of pipelineResult.childSpans) {
      expect(childSpan.parentSpanId).toBe(rootSpanId);
      expect(childSpan.traceId).toBe(traceId);
    }

    // Gate-Span hat Attribut
    const gateSpan = spans.find((s) => s.name === "pipeline.gate");
    expect(gateSpan).toBeDefined();
    expect(gateSpan!.attributes["balage.gate.decision"]).toBe("allow");

    // Alle Spans haben duration
    for (const span of spans) {
      expect(span.duration).toBeGreaterThanOrEqual(0);
      expect(span.endTime).toBeInstanceOf(Date);
    }
  });

  it("should collect correct metrics during pipeline execution in Prometheus format", async () => {
    const { tracer, metrics } = stack;
    const pipeline = createMockPipeline(tracer, metrics);

    // Workflow-Metriken setzen
    metrics.incrementCounter("balage_workflows_total", { status: "completed" });

    // Pipeline ausfuehren
    const workflowSpan = tracer.startSpan("workflow.run");
    tracer.withSpan(workflowSpan, () => {
      pipeline.execute("https://example.com/test");
    });
    tracer.endSpan(workflowSpan);

    // Metriken pruefen
    const metricsOutput = metrics.getMetrics();

    // Valides Prometheus-Format: # TYPE und # HELP vorhanden
    expect(metricsOutput).toContain("# TYPE");
    expect(metricsOutput).toContain("counter");

    // Workflow-Counter
    expect(metricsOutput).toContain('balage_workflows_total{status="completed"} 1');

    // Pipeline-Duration-Histogramm wurde beobachtet
    expect(metricsOutput).toContain("balage_pipeline_duration_seconds");
    expect(metricsOutput).toContain('step="parse"');
    expect(metricsOutput).toContain('step="semantic"');

    // Gate-Decision-Counter
    expect(metricsOutput).toContain('balage_gate_decisions_total{decision="allow"} 1');

    // JSON-Format hat Struktur
    const json = metrics.getMetricsJSON();
    const pipelineMetric = json.find((m) => m.name === "balage_pipeline_duration_seconds");
    expect(pipelineMetric).toBeDefined();
    expect(pipelineMetric!.type).toBe("histogram");
    expect(pipelineMetric!.values.length).toBeGreaterThan(0);
  });
});

/**
 * Fixture: Mock-Pipeline die realistische Events fuer den Tracer erzeugt.
 */

import type { Tracer } from "../../../src/observability/tracer.js";
import type { MetricsCollector } from "../../../src/observability/metrics-collector.js";
import type { Span } from "../../../src/observability/types.js";

export interface PipelineResult {
  success: boolean;
  rootSpan: Span;
  childSpans: Span[];
}

/**
 * Erstellt eine Mock-Pipeline die Tracer-Spans und Metriken erzeugt.
 * Simuliert: parse → semantic → confidence → gate
 */
export function createMockPipeline(tracer: Tracer, metrics: MetricsCollector) {
  return {
    execute(url: string, traceId?: string): PipelineResult {
      const parentOpts = traceId
        ? { parent: { traceId, spanId: "", baggage: {} } }
        : undefined;

      const rootSpan = tracer.startSpan("pipeline.execute", {
        ...parentOpts,
        attributes: { "balage.action.type": "navigate", url },
      });

      const childSpans: Span[] = [];

      // Simuliere Pipeline-Steps innerhalb des Root-Span-Kontexts
      tracer.withSpan(rootSpan, () => {
        const parseSpan = tracer.startSpan("pipeline.parse");
        metrics.observeHistogram("balage_pipeline_duration_seconds", 0.05, { step: "parse" });
        tracer.endSpan(parseSpan);
        childSpans.push(parseSpan);

        const semanticSpan = tracer.startSpan("pipeline.semantic");
        metrics.observeHistogram("balage_pipeline_duration_seconds", 0.12, { step: "semantic" });
        tracer.endSpan(semanticSpan);
        childSpans.push(semanticSpan);

        const confidenceSpan = tracer.startSpan("pipeline.confidence");
        metrics.observeHistogram("balage_pipeline_duration_seconds", 0.02, { step: "confidence" });
        tracer.endSpan(confidenceSpan);
        childSpans.push(confidenceSpan);

        const gateSpan = tracer.startSpan("pipeline.gate", {
          attributes: { "balage.gate.decision": "allow" },
        });
        metrics.incrementCounter("balage_gate_decisions_total", { decision: "allow" });
        tracer.endSpan(gateSpan);
        childSpans.push(gateSpan);
      });

      tracer.endSpan(rootSpan);

      return { success: true, rootSpan, childSpans };
    },
  };
}

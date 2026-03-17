/**
 * Integration Tests: Replay E2E
 * Validiert Aufzeichnung, Wiedergabe und Diff von Workflow-Executions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";

import {
  createObservabilityStack,
  createSecurityStack,
  extractTextFromDom,
  containsPii,
  containsCredentials,
  type ObservabilityStack,
  type SecurityStack,
} from "./helpers.js";
import { createMockPipeline } from "./fixtures/mock-pipeline.js";
import { replayTestWorkflow } from "./fixtures/workflow-for-replay.js";
import { domWithPii } from "./fixtures/dom-with-pii.js";
import { domWithInjection } from "./fixtures/dom-with-injection.js";
import { domWithCredentials } from "./fixtures/dom-with-credentials.js";

import type { ReplayEvent, ReplayEventType } from "../../src/observability/types.js";

describe("Replay Integration", () => {
  let obs: ObservabilityStack;

  beforeEach(() => {
    obs = createObservabilityStack();
  });

  it("should record a workflow execution and replay all events in correct order with PII filtered", async () => {
    const { tracer, replayRecorder, replayPlayer, piiFilter } = obs;
    const traceId = randomUUID();

    // Recording starten
    const recordingId = replayRecorder.startRecording("wf-replay-test", traceId, {
      workflow: replayTestWorkflow,
      startContext: { url: "https://example.com/contact" },
    });

    // Events aufzeichnen (simulierter Workflow)
    const eventSequence: Array<{ type: ReplayEventType; data: Record<string, unknown> }> = [
      { type: "workflow_start", data: { workflowName: "Replay Test Workflow", url: "https://example.com/contact" } },
      { type: "step_start", data: { stepId: "navigate", agentType: "navigator" } },
      { type: "pipeline_step", data: { step: "parse", durationMs: 50 } },
      { type: "step_end", data: { stepId: "navigate", success: true } },
      { type: "step_start", data: { stepId: "fill-form", agentType: "form_filler" } },
      { type: "step_end", data: { stepId: "fill-form", success: true } },
      { type: "workflow_end", data: { success: true, totalSteps: 2 } },
    ];

    for (let i = 0; i < eventSequence.length; i++) {
      replayRecorder.recordEvent(recordingId, {
        offsetMs: i * 100,
        type: eventSequence[i]!.type,
        data: eventSequence[i]!.data,
        traceId,
      });
    }

    // Recording stoppen
    const recording = replayRecorder.stopRecording(recordingId);
    expect(recording.eventCount).toBe(eventSequence.length);
    expect(recording.traceId).toBe(traceId);
    expect(recording.workflow.name).toBe("Replay Test Workflow");

    // Events pruefen: workflow_start, step_start, pipeline_step, step_end, step_start, step_end, workflow_end
    expect(recording.events[0]!.type).toBe("workflow_start");
    expect(recording.events[recording.events.length - 1]!.type).toBe("workflow_end");

    // Replay abspielen
    const playedEvents: ReplayEvent[] = [];
    const allTypes: ReplayEventType[] = [
      "workflow_start", "workflow_end", "step_start", "step_end", "pipeline_step",
    ];
    for (const type of allTypes) {
      replayPlayer.onEvent(type, (event) => {
        playedEvents.push(event);
      });
    }

    const result = await replayPlayer.play(recording, { speed: 0 });
    expect(result.eventsPlayed).toBe(eventSequence.length);
    expect(result.state).toBe("completed");
    expect(playedEvents).toHaveLength(eventSequence.length);

    // Events in gleicher Reihenfolge
    for (let i = 0; i < eventSequence.length; i++) {
      expect(playedEvents[i]!.type).toBe(eventSequence[i]!.type);
    }

    // Event-Daten stimmen ueberein
    expect((playedEvents[0]!.data as Record<string, unknown>)["workflowName"]).toBe("Replay Test Workflow");
    expect((playedEvents[1]!.data as Record<string, unknown>)["stepId"]).toBe("navigate");
  });

  it("should detect differences when comparing two recordings with different outcomes", async () => {
    const { replayRecorder, replayPlayer } = obs;

    // Recording 1: Normaler Durchlauf (2 Steps, beide erfolgreich)
    const traceId1 = randomUUID();
    const id1 = replayRecorder.startRecording("wf-diff-test", traceId1, {
      workflow: replayTestWorkflow,
    });
    replayRecorder.recordEvent(id1, { offsetMs: 0, type: "workflow_start", data: { wf: "test" }, traceId: traceId1 });
    replayRecorder.recordEvent(id1, { offsetMs: 100, type: "step_start", data: { stepId: "navigate" }, traceId: traceId1 });
    replayRecorder.recordEvent(id1, { offsetMs: 200, type: "step_end", data: { stepId: "navigate", success: true }, traceId: traceId1 });
    replayRecorder.recordEvent(id1, { offsetMs: 300, type: "step_start", data: { stepId: "fill-form" }, traceId: traceId1 });
    replayRecorder.recordEvent(id1, { offsetMs: 400, type: "step_end", data: { stepId: "fill-form", success: true }, traceId: traceId1 });
    replayRecorder.recordEvent(id1, { offsetMs: 500, type: "workflow_end", data: { success: true }, traceId: traceId1 });
    const rec1 = replayRecorder.stopRecording(id1);

    // Recording 2: Gleicher Workflow, aber Step 2 fehlgeschlagen
    const traceId2 = randomUUID();
    const id2 = replayRecorder.startRecording("wf-diff-test", traceId2, {
      workflow: replayTestWorkflow,
    });
    replayRecorder.recordEvent(id2, { offsetMs: 0, type: "workflow_start", data: { wf: "test" }, traceId: traceId2 });
    replayRecorder.recordEvent(id2, { offsetMs: 100, type: "step_start", data: { stepId: "navigate" }, traceId: traceId2 });
    replayRecorder.recordEvent(id2, { offsetMs: 200, type: "step_end", data: { stepId: "navigate", success: true }, traceId: traceId2 });
    replayRecorder.recordEvent(id2, { offsetMs: 300, type: "step_start", data: { stepId: "fill-form" }, traceId: traceId2 });
    replayRecorder.recordEvent(id2, { offsetMs: 400, type: "step_end", data: { stepId: "fill-form", success: false, error: "Form validation failed" }, traceId: traceId2 });
    replayRecorder.recordEvent(id2, { offsetMs: 500, type: "workflow_end", data: { success: false }, traceId: traceId2 });
    const rec2 = replayRecorder.stopRecording(id2);

    // Vergleichen
    const diff = await replayPlayer.compare(rec1, rec2);

    expect(diff.identical).toBe(false);
    expect(diff.recording1Id).toBe(rec1.id);
    expect(diff.recording2Id).toBe(rec2.id);

    // step_end fuer fill-form weicht ab (success: true vs false)
    const stepEndDiff = diff.modified.find(
      (m) => (m.event1.data as Record<string, unknown>)["stepId"] === "fill-form"
        && m.event1.type === "step_end",
    );
    expect(stepEndDiff).toBeDefined();
    expect(stepEndDiff!.differences).toContain("data differs");

    // workflow_end weicht auch ab
    const workflowEndDiff = diff.modified.find(
      (m) => m.event1.type === "workflow_end",
    );
    expect(workflowEndDiff).toBeDefined();
  });

  it("should integrate security + observability in a full pipeline run", async () => {
    const sec = createSecurityStack();
    const { tracer, exporter, metrics, evidenceTrail, logCapture, piiFilter } = obs;

    // Workflow mit Tracer starten
    const workflowSpan = tracer.startSpan("workflow.full-integration");
    const traceId = workflowSpan.traceId;

    // --- Schritt 1: DOM mit PII + Injection sanitizen ---
    const combinedDom = tracer.withSpan(workflowSpan, () => {
      const sanitizeSpan = tracer.startSpan("security.sanitize");

      // DOM mit PII sanitizen
      const sanitizedPiiDom = sec.sanitizer.sanitizeDomNode(domWithPii);
      const piiText = extractTextFromDom(sanitizedPiiDom);
      const filteredPiiText = piiFilter.filterString(piiText);

      tracer.endSpan(sanitizeSpan);
      return { sanitizedPiiDom, filteredPiiText };
    });

    // --- Schritt 2: Injection Detection ---
    tracer.withSpan(workflowSpan, () => {
      const injectionSpan = tracer.startSpan("security.injection-check");

      const injectionText = extractTextFromDom(domWithInjection);
      const injectionResult = sec.injectionDetector.detect(injectionText);

      if (!injectionResult.isClean) {
        metrics.incrementCounter("balage_errors_total", { code: "INJECTION_DETECTED" });

        evidenceTrail.record({
          traceId,
          spanId: injectionSpan.spanId,
          timestamp: new Date(),
          action: "injection_blocked",
          evidence: [{
            type: "text_content",
            signal: `Injection blocked: verdict=${injectionResult.verdict}`,
            weight: injectionResult.score,
          }],
          outcome: "failure",
          gateDecision: "deny",
          metadata: { verdict: injectionResult.verdict, matchCount: injectionResult.matches.length },
        });
      }

      tracer.endSpan(injectionSpan);
    });

    // --- Schritt 3: Credential Guard ---
    tracer.withSpan(workflowSpan, () => {
      const credSpan = tracer.startSpan("security.credential-check");

      const formData: Record<string, unknown> = {};
      for (const child of domWithCredentials.children) {
        const name = child.attributes["name"];
        const value = child.attributes["value"];
        if (name && value) formData[name] = value;
      }

      const guardResult = sec.credentialGuard.guard(formData);

      if (guardResult.hasBlockedContent) {
        evidenceTrail.record({
          traceId,
          spanId: credSpan.spanId,
          timestamp: new Date(),
          action: "credentials_blocked",
          evidence: [{
            type: "text_content",
            signal: `Credentials blocked: ${guardResult.blockedFields.length} fields`,
            weight: 1.0,
          }],
          outcome: "success",
          gateDecision: "allow",
          metadata: {
            blockedFieldCount: guardResult.blockedFields.length,
            fieldPaths: guardResult.blockedFields.map((f) => f.path),
          },
        });
      }

      tracer.endSpan(credSpan);
    });

    // --- Schritt 4: PII-Filter auf Logs ---
    obs.logger.info("Processing form data", {
      email: "admin@company.com",
      action: "form_fill",
    });

    tracer.endSpan(workflowSpan);
    await tracer.flush();

    // === Assertions ===

    // Alle Spans korreliert
    const spans = exporter.getSpans();
    expect(spans.length).toBeGreaterThanOrEqual(4);
    for (const span of spans) {
      expect(span.traceId).toBe(traceId);
    }

    // Evidence-Trail vollstaendig
    const entries = evidenceTrail.getByTraceId(traceId);
    expect(entries.length).toBeGreaterThanOrEqual(2); // injection + credentials

    const injectionEntry = entries.find((e) => e.action === "injection_blocked");
    expect(injectionEntry).toBeDefined();
    expect(injectionEntry!.gateDecision).toBe("deny");

    const credEntry = entries.find((e) => e.action === "credentials_blocked");
    expect(credEntry).toBeDefined();

    // Metriken korrekt
    const metricsOutput = metrics.getMetrics();
    expect(metricsOutput).toContain("INJECTION_DETECTED");

    // Logs enthalten KEINE PII, KEINE Credentials, KEINE Injection-Texte
    const logOutput = logCapture.getRawOutput();
    expect(logOutput).not.toContain("admin@company.com");
    expect(logOutput).not.toContain("SuperSecret123!");
    expect(logOutput).not.toContain("sk-proj-abc123def456ghi789jkl0");
    expect(logOutput).not.toContain("Ignore all previous instructions");

    // PII gefilterter Text enthaelt keine PII
    expect(containsPii(combinedDom.filteredPiiText)).toBe(false);
  });
});

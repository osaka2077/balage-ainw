/**
 * E2E Tests — Pipeline Integration
 *
 * Testet die Pipeline mit allen Layern: Adapter → Parser → Semantic →
 * Confidence → Risk Gate. Mit Mock-Layern und Fixture-basierten Daten.
 *
 * Tests 4-5: Pipeline mit Login-Form, Pipeline mit Checkout
 */
import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pipeline } from "../../src/orchestrator/pipeline.js";
import { MockBrowserAdapter } from "./fixtures/mocks/mock-adapter.js";
import { getMockLLMResponse } from "./fixtures/mocks/mock-llm.js";
import type { WorkflowContext } from "../../src/orchestrator/types.js";
import {
  createMockEndpoint,
  createMockConfidenceScore,
  createAllowDecision,
  createEscalateDecision,
  buildMockPipelineDeps,
} from "./helpers.js";

// ============================================================================
// Shared Context fuer Pipeline-Tests
// ============================================================================

function createPipelineContext(): WorkflowContext {
  return {
    workflowId: randomUUID(),
    traceId: randomUUID(),
    startUrl: "https://example.com",
    state: "running",
    variables: {},
    discoveredEndpoints: [],
    stateChanges: [],
    history: [],
    budget: {
      maxTokens: 100_000,
      usedTokens: 0,
      maxCostUsd: 1.0,
      usedCostUsd: 0,
      maxDurationMs: 300_000,
      elapsedMs: 0,
      isExceeded: false,
    },
    startedAt: new Date(),
    settings: {
      maxTotalDuration: 300_000,
      maxTotalBudget: 1.0,
      continueOnStepFailure: false,
      parallelExecution: true,
      requireAllStepsSuccess: true,
    },
  };
}

// ============================================================================
// Test 4-5: Pipeline Integration
// ============================================================================

describe("E2E: Pipeline Integration", () => {

  it("4. Pipeline mit Login-Form Fixture — HTML → DOM → Endpoints → Confidence → Gate ALLOW", async () => {
    // Mock-Adapter laedt Login-Fixture
    const mockAdapter = new MockBrowserAdapter();

    // Mock-LLM klassifiziert Login-Form als auth-Endpoint
    const llmResponse = getMockLLMResponse("login");
    const loginEndpoint = createMockEndpoint("auth", llmResponse.confidence, "medium");

    // Confidence > 0.7
    const confidenceScore = createMockConfidenceScore(0.85);

    // Navigation-Action → Gate ALLOW
    const gateDecision = createAllowDecision(0.85);

    const deps = buildMockPipelineDeps({
      endpoints: [loginEndpoint],
      confidenceScore,
      gateDecision,
    });

    // Echten MockBrowserAdapter einsetzen statt vi.fn()
    deps.adapter = mockAdapter;

    const pipeline = new Pipeline(deps);
    const context = createPipelineContext();

    const result = await pipeline.execute(
      "https://example.com/login",
      { type: "navigate" },
      context,
    );

    // Pipeline erfolgreich
    expect(result.success).toBe(true);

    // Gate-Entscheidung: ALLOW
    expect(result.gateDecision).toBeDefined();
    expect(result.gateDecision!.decision).toBe("allow");

    // Endpoint erkannt
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0]!.type).toBe("auth");

    // Confidence > 0.7
    expect(result.endpoints[0]!.confidence).toBeGreaterThan(0.7);

    // Mock-Adapter hat korrekte URL navigiert
    expect(mockAdapter.navigatedUrls).toContain("https://example.com/login");
    expect(mockAdapter.getCurrentFixture()).toBe("login");

    // Timing vorhanden (alle Pipeline-Schritte durchlaufen)
    expect(result.timing).toHaveProperty("adapt");
    expect(result.timing).toHaveProperty("parse");
    expect(result.timing).toHaveProperty("semantic");
    expect(result.timing).toHaveProperty("confidence");
    expect(result.timing).toHaveProperty("risk_gate");

    // Parser und Semantic wurden aufgerufen
    expect(deps.parser.segmentUI).toHaveBeenCalled();
    expect(deps.semantic.generateEndpoints).toHaveBeenCalled();
    expect(deps.confidence.calculateScore).toHaveBeenCalled();
    expect(deps.riskGate.evaluate).toHaveBeenCalled();
  });

  it("5. Pipeline mit Checkout-Fixture — Financial Action → Gate ESCALATE (CRITICAL)", async () => {
    // Mock-Adapter laedt Checkout-Fixture
    const mockAdapter = new MockBrowserAdapter();

    // Checkout-Endpoint mit hohem Risk-Level
    const checkoutEndpoint = createMockEndpoint("checkout", 0.88, "critical");

    // Confidence reicht nicht fuer financial_action (threshold 0.92)
    const confidenceScore = createMockConfidenceScore(0.88);

    // Financial-Action → ESCALATE
    const gateDecision = createEscalateDecision(
      'SI-01: Action "payment" classified as CRITICAL — requires human approval',
      0.88,
    );

    const deps = buildMockPipelineDeps({
      endpoints: [checkoutEndpoint],
      confidenceScore,
      gateDecision,
    });

    deps.adapter = mockAdapter;

    const pipeline = new Pipeline(deps);
    const context = createPipelineContext();

    const result = await pipeline.execute(
      "https://example.com/checkout",
      { type: "payment" },
      context,
    );

    // Pipeline NICHT erfolgreich (eskaliert)
    expect(result.success).toBe(false);

    // Gate-Entscheidung: ESCALATE
    expect(result.gateDecision).toBeDefined();
    expect(result.gateDecision!.decision).toBe("escalate");
    expect(result.gateDecision!.escalation).toBeDefined();
    expect(result.gateDecision!.escalation!.type).toBe("human_review");

    // Checkout-Endpoint erkannt
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0]!.type).toBe("checkout");
    expect(result.endpoints[0]!.risk_class).toBe("critical");

    // Error enthaelt Eskalations-Information
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe("ESCALATED");

    // Mock-Adapter hat Checkout-URL navigiert
    expect(mockAdapter.getCurrentFixture()).toBe("checkout");
  });
});

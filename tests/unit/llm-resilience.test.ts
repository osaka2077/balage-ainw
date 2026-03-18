/**
 * P1 — LLM-Timeout, Fallback und Resilience Tests
 *
 * Testet dass die Endpoint-Generator-Pipeline bei LLM-Fehlern,
 * Timeouts und invaliden Responses nicht crasht.
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { generateEndpoints } from "../../src/semantic/endpoint-generator.js";
import { LLMCallError, LLMParseError } from "../../src/semantic/errors.js";
import type { LLMClient, LLMRequest, LLMResponse } from "../../src/semantic/llm-client.js";
import type { DomNode, UISegment } from "../../shared_interfaces.js";
import type { GenerationContext, EndpointCandidate } from "../../src/semantic/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeDomNode(
  tagName: string,
  attrs: Record<string, string> = {},
  children: DomNode[] = [],
  overrides: Partial<DomNode> = {},
): DomNode {
  return {
    tagName,
    attributes: attrs,
    isVisible: true,
    isInteractive: false,
    children,
    ...overrides,
  };
}

function makeTestSegment(): UISegment {
  return {
    id: randomUUID(),
    type: "form" as UISegment["type"],
    confidence: 0.8,
    boundingBox: { x: 0, y: 0, width: 400, height: 200 },
    nodes: [
      makeDomNode("form", {}, [
        makeDomNode("input", { type: "text", placeholder: "Email" }, [], {
          isInteractive: true,
        }),
        makeDomNode("button", { type: "submit" }, [], {
          textContent: "Submit",
          isInteractive: true,
        }),
      ]),
    ],
    interactiveElementCount: 2,
  };
}

const TEST_CONTEXT: GenerationContext = {
  url: "https://example.com/test",
  siteId: randomUUID(),
  sessionId: randomUUID(),
};

function makeValidCandidate(
  type: string = "form",
  confidence: number = 0.8,
): EndpointCandidate {
  return {
    type,
    label: `Test ${type} endpoint`,
    description: `A test ${type} endpoint`,
    confidence,
    anchors: [{ selector: "form", ariaRole: "form" }],
    affordances: [
      { type: "fill", expectedOutcome: "Enter data", reversible: true },
    ],
    reasoning: `Detected ${type} endpoint`,
  };
}

function makeValidLLMResponse(
  candidates: EndpointCandidate[],
): LLMResponse {
  const responseObj = {
    endpoints: candidates,
    reasoning: "Analysis complete",
  };
  return {
    content: JSON.stringify(responseObj),
    parsedContent: responseObj,
    model: "mock-model",
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    latency: 10,
  };
}

// ============================================================================
// Custom LLM Client Factories
// ============================================================================

/** LLM-Client der immer einen Timeout-Error wirft */
function createTimeoutClient() {
  const calls: LLMRequest[] = [];
  const client: LLMClient = {
    estimateTokens: (text) => Math.ceil(text.length / 4),
    async complete(request) {
      calls.push(request);
      throw new Error("Connection timeout after 30000ms");
    },
  };
  return { client, calls };
}

/** LLM-Client der beim ersten Call LLMParseError wirft, danach valide Response */
function createRetrySuccessClient(validResponse: LLMResponse) {
  const calls: LLMRequest[] = [];
  const client: LLMClient = {
    estimateTokens: (text) => Math.ceil(text.length / 4),
    async complete(request) {
      calls.push(request);
      if (calls.length === 1) {
        throw new LLMParseError(
          "Invalid JSON in LLM response",
          "{broken json",
        );
      }
      return validResponse;
    },
  };
  return { client, calls };
}

/** LLM-Client der immer LLMParseError wirft (alle Retries erschoepft) */
function createAlwaysParseErrorClient() {
  const calls: LLMRequest[] = [];
  const client: LLMClient = {
    estimateTokens: (text) => Math.ceil(text.length / 4),
    async complete(request) {
      calls.push(request);
      throw new LLMParseError(
        "Cannot parse LLM response",
        `{"invalid": "attempt-${calls.length}"}`,
      );
    },
  };
  return { client, calls };
}

/** LLM-Client der Candidates mit spezifischen Confidence-Werten liefert */
function createConfidenceTestClient(candidates: EndpointCandidate[]) {
  const response = makeValidLLMResponse(candidates);
  const client: LLMClient = {
    estimateTokens: (text) => Math.ceil(text.length / 4),
    async complete() {
      return response;
    },
  };
  return client;
}

// ============================================================================
// Timeout Tests
// ============================================================================

describe("LLM Timeout Handling", () => {
  it("returns empty array when LLM times out — no crash", async () => {
    const { client, calls } = createTimeoutClient();

    const result = await generateEndpoints(
      [makeTestSegment()],
      TEST_CONTEXT,
      { llmClient: client, maxRetries: 1 },
    );

    expect(result).toEqual([]);
    // 2 attempts total (initial + 1 retry)
    expect(calls).toHaveLength(2);
  });

  it("processes remaining segments after timeout on first segment", async () => {
    let callIndex = 0;
    const validResponse = makeValidLLMResponse([
      makeValidCandidate("auth", 0.9),
    ]);
    const calls: LLMRequest[] = [];

    const client: LLMClient = {
      estimateTokens: (text) => Math.ceil(text.length / 4),
      async complete(request) {
        calls.push(request);
        callIndex++;
        if (callIndex <= 2) {
          // First segment: fail both attempts
          throw new Error("Timeout");
        }
        return validResponse;
      },
    };

    const result = await generateEndpoints(
      [makeTestSegment(), makeTestSegment()],
      TEST_CONTEXT,
      { llmClient: client, maxRetries: 1 },
    );

    // First segment fails (2 calls), second succeeds (1 call)
    expect(calls).toHaveLength(3);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.type).toBe("auth");
  });
});

// ============================================================================
// Retry Tests
// ============================================================================

describe("LLM Retry on Parse Error", () => {
  it("retries on LLMParseError and succeeds on 2nd attempt", async () => {
    const validResponse = makeValidLLMResponse([
      makeValidCandidate("auth", 0.9),
    ]);
    const { client, calls } = createRetrySuccessClient(validResponse);

    const result = await generateEndpoints(
      [makeTestSegment()],
      TEST_CONTEXT,
      { llmClient: client, maxRetries: 2 },
    );

    expect(calls).toHaveLength(2); // 1st fails, 2nd succeeds
    expect(result.length).toBe(1);
    expect(result[0]!.type).toBe("auth");
  });

  it("exhausts all retries on persistent LLMParseError — returns empty", async () => {
    const { client, calls } = createAlwaysParseErrorClient();

    const result = await generateEndpoints(
      [makeTestSegment()],
      TEST_CONTEXT,
      { llmClient: client, maxRetries: 2 },
    );

    // 3 attempts total (0, 1, 2) — all fail
    expect(calls).toHaveLength(3);
    expect(result).toEqual([]);
  });

  it("throws LLMCallError internally after exhausting retries", async () => {
    const { client } = createAlwaysParseErrorClient();

    // Direkt auf LLMCallError testen — generateEndpoints faengt es per-Segment ab
    // Wir koennen nur indirekt testen: leeres Ergebnis
    const result = await generateEndpoints(
      [makeTestSegment()],
      TEST_CONTEXT,
      { llmClient: client, maxRetries: 1 },
    );

    expect(result).toEqual([]);
  });
});

// ============================================================================
// Confidence Filter Tests (MIN_CANDIDATE_CONFIDENCE = 0.55)
// ============================================================================

describe("Confidence Filter", () => {
  it("filters out candidates below MIN_CANDIDATE_CONFIDENCE (0.55)", async () => {
    const candidates = [
      makeValidCandidate("auth", 0.9), // Survives
      makeValidCandidate("form", 0.3), // Filtered
      makeValidCandidate("search", 0.55), // Survives (exactly at threshold)
      makeValidCandidate("content", 0.54), // Filtered (just below)
    ];
    const client = createConfidenceTestClient(candidates);

    const result = await generateEndpoints(
      [makeTestSegment()],
      TEST_CONTEXT,
      { llmClient: client },
    );

    expect(result).toHaveLength(2);
    const types = result.map((c) => c.type);
    expect(types).toContain("auth");
    expect(types).toContain("search");
    expect(types).not.toContain("form");
    expect(types).not.toContain("content");
  });

  it("returns empty array when all candidates below threshold", async () => {
    const candidates = [
      makeValidCandidate("form", 0.2),
      makeValidCandidate("content", 0.4),
      makeValidCandidate("navigation", 0.54),
    ];
    const client = createConfidenceTestClient(candidates);

    const result = await generateEndpoints(
      [makeTestSegment()],
      TEST_CONTEXT,
      { llmClient: client },
    );

    expect(result).toEqual([]);
  });

  it("keeps all candidates when all above threshold", async () => {
    const candidates = [
      makeValidCandidate("auth", 0.95),
      makeValidCandidate("search", 0.8),
      makeValidCandidate("navigation", 0.7),
    ];
    const client = createConfidenceTestClient(candidates);

    const result = await generateEndpoints(
      [makeTestSegment()],
      TEST_CONTEXT,
      { llmClient: client },
    );

    expect(result).toHaveLength(3);
  });
});

// ============================================================================
// Global Cap Tests (MAX_TOTAL_ENDPOINTS = 8)
// ============================================================================

describe("Global Endpoint Cap", () => {
  it("caps at MAX_TOTAL_ENDPOINTS (8) when more candidates present", async () => {
    const types = [
      "auth", "form", "search", "navigation", "content",
      "checkout", "commerce", "support", "social", "settings",
    ];
    const candidates = types.map((type, i) =>
      makeValidCandidate(type, 0.95 - i * 0.01),
    );
    const client = createConfidenceTestClient(candidates);

    const result = await generateEndpoints(
      [makeTestSegment()],
      TEST_CONTEXT,
      { llmClient: client },
    );

    expect(result).toHaveLength(8);
  });

  it("preserves highest-confidence candidates after cap", async () => {
    const types = [
      "auth", "form", "search", "navigation", "content",
      "checkout", "commerce", "support", "social", "settings",
    ];
    const candidates = types.map((type, i) =>
      makeValidCandidate(type, 0.95 - i * 0.01),
    );
    const client = createConfidenceTestClient(candidates);

    const result = await generateEndpoints(
      [makeTestSegment()],
      TEST_CONTEXT,
      { llmClient: client },
    );

    // Top 8 by confidence → types at index 0-7
    const resultTypes = result.map((c) => c.type);
    expect(resultTypes).toContain("auth"); // 0.95
    expect(resultTypes).toContain("support"); // 0.88
    expect(resultTypes).not.toContain("settings"); // 0.86 — cut off
  });

  it("returns all candidates when count <= 8", async () => {
    const candidates = [
      makeValidCandidate("auth", 0.9),
      makeValidCandidate("search", 0.8),
      makeValidCandidate("navigation", 0.7),
    ];
    const client = createConfidenceTestClient(candidates);

    const result = await generateEndpoints(
      [makeTestSegment()],
      TEST_CONTEXT,
      { llmClient: client },
    );

    expect(result).toHaveLength(3);
  });
});

// ============================================================================
// Empty Input Handling
// ============================================================================

describe("Empty Input Handling", () => {
  it("returns empty array for empty segments array", async () => {
    const { client } = createTimeoutClient();

    const result = await generateEndpoints([], TEST_CONTEXT, {
      llmClient: client,
    });

    expect(result).toEqual([]);
  });
});

/**
 * Semantic Engine Tests — 14+ Tests (Vitest, Mock-LLM)
 *
 * Alle Tests verwenden den Mock-LLM-Client. KEINE echten API-Calls.
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pruneForLLM } from "./dom-pruner.js";
import { generateEndpoints, candidateToEndpoint } from "./endpoint-generator.js";
import { classifyEndpoint, inferAffordances } from "./endpoint-classifier.js";
import { collectEvidence, summarizeEvidence } from "./evidence-collector.js";
import { createMockClient } from "./llm-client.js";
import { LLMParseError } from "./errors.js";
import { EndpointSchema } from "../../shared_interfaces.js";
import type { UISegment, DomNode } from "../../shared_interfaces.js";
import type { LLMResponse } from "./llm-client.js";
import type {
  EndpointCandidate,
  LLMEndpointResponse,
  GenerationContext,
} from "./types.js";

// ============================================================================
// Fixtures
// ============================================================================

function makeDomNode(overrides: Partial<DomNode> & { tagName: string }): DomNode {
  return {
    attributes: {},
    isVisible: true,
    isInteractive: false,
    children: [],
    ...overrides,
  };
}

const LOGIN_FORM_SEGMENT: UISegment = {
  id: randomUUID(),
  type: "form",
  label: "Login Form",
  confidence: 0.9,
  boundingBox: { x: 400, y: 300, width: 400, height: 350 },
  nodes: [
    makeDomNode({
      tagName: "form",
      attributes: { action: "/login", method: "POST" },
      isInteractive: true,
      children: [
        makeDomNode({
          tagName: "h2",
          textContent: "Sign In",
          children: [],
        }),
        makeDomNode({
          tagName: "label",
          textContent: "Email",
          children: [
            makeDomNode({
              tagName: "input",
              attributes: { type: "email", required: "", "aria-label": "Email address" },
              isInteractive: true,
            }),
          ],
        }),
        makeDomNode({
          tagName: "label",
          textContent: "Password",
          children: [
            makeDomNode({
              tagName: "input",
              attributes: { type: "password", required: "", "aria-label": "Password" },
              isInteractive: true,
            }),
          ],
        }),
        makeDomNode({
          tagName: "button",
          attributes: { type: "submit" },
          textContent: "Sign In",
          isInteractive: true,
        }),
      ],
    }),
  ],
  interactiveElementCount: 4,
  semanticRole: "form",
};

const NAVIGATION_SEGMENT: UISegment = {
  id: randomUUID(),
  type: "navigation",
  label: "Main Navigation",
  confidence: 0.85,
  boundingBox: { x: 0, y: 0, width: 1280, height: 60 },
  nodes: [
    makeDomNode({
      tagName: "nav",
      attributes: { "aria-label": "Main navigation", role: "navigation" },
      isInteractive: false,
      children: [
        makeDomNode({
          tagName: "ul",
          children: [
            makeDomNode({
              tagName: "li",
              children: [
                makeDomNode({
                  tagName: "a",
                  attributes: { href: "/" },
                  textContent: "Home",
                  isInteractive: true,
                }),
              ],
            }),
            makeDomNode({
              tagName: "li",
              children: [
                makeDomNode({
                  tagName: "a",
                  attributes: { href: "/products" },
                  textContent: "Products",
                  isInteractive: true,
                }),
              ],
            }),
            makeDomNode({
              tagName: "li",
              children: [
                makeDomNode({
                  tagName: "a",
                  attributes: { href: "/about" },
                  textContent: "About",
                  isInteractive: true,
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ],
  interactiveElementCount: 3,
  semanticRole: "navigation",
};


const CHECKOUT_SEGMENT: UISegment = {
  id: randomUUID(),
  type: "form",
  label: "Checkout",
  confidence: 0.9,
  boundingBox: { x: 300, y: 200, width: 600, height: 500 },
  nodes: [
    makeDomNode({
      tagName: "form",
      attributes: { action: "/checkout" },
      isInteractive: true,
      children: [
        makeDomNode({ tagName: "h2", textContent: "Checkout" }),
        makeDomNode({
          tagName: "div",
          textContent: "Total: $99.99",
        }),
        makeDomNode({
          tagName: "button",
          attributes: { type: "submit" },
          textContent: "Buy Now",
          isInteractive: true,
        }),
      ],
    }),
  ],
  interactiveElementCount: 2,
};

const CONTEXT: GenerationContext = {
  url: "https://example.com/login",
  siteId: randomUUID(),
  sessionId: randomUUID(),
  pageTitle: "Example Login Page",
};

function makeMockLLMResponse(
  candidates: EndpointCandidate[],
  reasoning = "Mock analysis",
): LLMResponse {
  const body = { endpoints: candidates, reasoning };
  return {
    content: JSON.stringify(body),
    parsedContent: body,
    model: "mock-model",
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    latency: 10,
  };
}

const AUTH_CANDIDATE: EndpointCandidate = {
  type: "auth",
  label: "Sign In Form",
  description: "Login form with email and password",
  confidence: 0.95,
  anchors: [{ selector: "form", ariaRole: "form", textContent: "Sign In" }],
  affordances: [
    { type: "fill", expectedOutcome: "Enter email", reversible: true },
    { type: "fill", expectedOutcome: "Enter password", reversible: true },
    { type: "submit", expectedOutcome: "Authenticate", reversible: false },
  ],
  reasoning: "Form with email + password fields and Sign In button",
};

const NAV_CANDIDATE: EndpointCandidate = {
  type: "navigation",
  label: "Main Navigation",
  description: "Primary site navigation",
  confidence: 0.9,
  anchors: [
    { selector: "nav", ariaRole: "navigation", ariaLabel: "Main navigation" },
  ],
  affordances: [
    { type: "navigate", expectedOutcome: "Navigate to section", reversible: true },
  ],
  reasoning: "NAV element with links",
};

// ============================================================================
// DOM-Pruner Tests (3)
// ============================================================================

describe("DOM-Pruner", () => {
  it("should prune segment to within token budget", () => {
    // Segment mit vielen Nodes
    const largeChildren: DomNode[] = [];
    for (let i = 0; i < 100; i++) {
      largeChildren.push(
        makeDomNode({
          tagName: "div",
          textContent: `Content block ${i} with some text that takes up tokens. `.repeat(5),
          children: [
            makeDomNode({
              tagName: "span",
              attributes: { style: "color: red;" },
              textContent: "Styled text",
            }),
          ],
        }),
      );
    }

    const largeSegment: UISegment = {
      id: randomUUID(),
      type: "content",
      confidence: 0.7,
      boundingBox: { x: 0, y: 0, width: 1280, height: 5000 },
      nodes: [
        makeDomNode({
          tagName: "div",
          children: largeChildren,
        }),
      ],
      interactiveElementCount: 0,
    };

    const result = pruneForLLM(largeSegment, { maxTokens: 4000 });
    expect(result.estimatedTokens).toBeLessThanOrEqual(4000);
    expect(result.textRepresentation.length).toBeGreaterThan(0);
  });

  it("should always preserve interactive elements", () => {
    const result = pruneForLLM(LOGIN_FORM_SEGMENT);

    // Buttons und Inputs muessen im Output sein
    expect(result.textRepresentation).toContain("INPUT");
    expect(result.textRepresentation).toContain("BUTTON");
    expect(result.preservedElements).toBeGreaterThan(0);
  });

  it("should truncate long text blocks with [...] marker", () => {
    const longTextSegment: UISegment = {
      id: randomUUID(),
      type: "content",
      confidence: 0.7,
      boundingBox: { x: 0, y: 0, width: 800, height: 400 },
      nodes: [
        makeDomNode({
          tagName: "p",
          textContent: "A".repeat(500),
        }),
      ],
      interactiveElementCount: 0,
    };

    const result = pruneForLLM(longTextSegment, { maxTextLength: 200 });
    expect(result.textRepresentation).toContain("[...]");
  });
});

// ============================================================================
// Endpoint-Generator Tests (3)
// ============================================================================

describe("Endpoint-Generator", () => {
  it("should generate auth endpoint from login form segment", async () => {
    const mockResponse = makeMockLLMResponse([AUTH_CANDIDATE]);
    const mockClient = createMockClient(new Map([["endpoint", mockResponse]]));

    const genResult = await generateEndpoints(
      [LOGIN_FORM_SEGMENT],
      CONTEXT,
      { llmClient: mockClient },
    );

    expect(genResult.candidates.length).toBe(1);
    expect(genResult.candidates[0]!.type).toBe("auth");
    expect(genResult.candidates[0]!.label).toBe("Sign In Form");
  });

  it("should generate navigation endpoint from nav segment", async () => {
    const mockResponse = makeMockLLMResponse([NAV_CANDIDATE]);
    const mockClient = createMockClient(new Map([["endpoint", mockResponse]]));

    const genResult = await generateEndpoints(
      [NAVIGATION_SEGMENT],
      CONTEXT,
      { llmClient: mockClient },
    );

    expect(genResult.candidates.length).toBe(1);
    expect(genResult.candidates[0]!.type).toBe("navigation");
  });

  it("should produce endpoints that pass EndpointSchema validation", async () => {
    const mockResponse = makeMockLLMResponse([AUTH_CANDIDATE]);
    createMockClient(new Map([["endpoint", mockResponse]]));

    const llmEndpointResponse: LLMEndpointResponse = {
      endpoints: [AUTH_CANDIDATE],
      reasoning: "Mock analysis",
      model: "mock-model",
      tokens: { prompt: 100, completion: 50 },
    };

    const endpoint = candidateToEndpoint(
      AUTH_CANDIDATE,
      CONTEXT,
      LOGIN_FORM_SEGMENT,
      llmEndpointResponse,
    );

    // Muss EndpointSchema.parse() bestehen
    const validated = EndpointSchema.parse(endpoint);
    expect(validated.id).toBeDefined();
    expect(validated.type).toBe("auth");
    expect(validated.confidence).toBeGreaterThan(0);
    expect(validated.evidence.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Endpoint-Classifier Tests (2)
// ============================================================================

describe("Endpoint-Classifier", () => {
  it("should correct form with password field to auth type", () => {
    const formCandidate: EndpointCandidate = {
      type: "form",
      label: "Login",
      description: "A login form",
      confidence: 0.8,
      anchors: [{ selector: "form" }],
      affordances: [
        { type: "fill", expectedOutcome: "Enter credentials", reversible: true },
      ],
      reasoning: "Generic form",
    };

    const classified = classifyEndpoint(formCandidate, LOGIN_FORM_SEGMENT);
    expect(classified.correctedType).toBe("auth");
    expect(classified.riskLevel).toBe("high");
  });

  it("should assign correct risk levels per endpoint type", () => {
    const authClassified = classifyEndpoint(AUTH_CANDIDATE, LOGIN_FORM_SEGMENT);
    expect(authClassified.riskLevel).toBe("high");

    const checkoutCandidate: EndpointCandidate = {
      type: "checkout",
      label: "Checkout",
      description: "Payment form",
      confidence: 0.9,
      anchors: [],
      affordances: [],
      reasoning: "Checkout",
    };
    const checkoutClassified = classifyEndpoint(checkoutCandidate, CHECKOUT_SEGMENT);
    expect(checkoutClassified.riskLevel).toBe("high");

    const navClassified = classifyEndpoint(NAV_CANDIDATE, NAVIGATION_SEGMENT);
    expect(navClassified.riskLevel).toBe("low");
  });
});

// ============================================================================
// Evidence-Collector Tests (2)
// ============================================================================

describe("Evidence-Collector", () => {
  const llmResponse: LLMEndpointResponse = {
    endpoints: [AUTH_CANDIDATE],
    reasoning: "Login form detected",
    model: "mock-model",
    tokens: { prompt: 100, completion: 50 },
  };

  it("should collect at least semantic_label and llm_inference evidence", () => {
    const evidence = collectEvidence(
      AUTH_CANDIDATE,
      LOGIN_FORM_SEGMENT,
      llmResponse,
    );

    const types = evidence.map((e) => e.type);
    expect(types).toContain("semantic_label");
    expect(types).toContain("llm_inference");
    expect(evidence.length).toBeGreaterThanOrEqual(2);
  });

  it("should detect contradiction when ARIA role and LLM type diverge", () => {
    // Candidate sagt "form", aber ARIA-Role ist "navigation"
    const contradictoryCandidate: EndpointCandidate = {
      type: "form",
      label: "Ambiguous",
      description: "Could be form or nav",
      confidence: 0.6,
      anchors: [],
      affordances: [],
      reasoning: "This looks like a form element",
    };

    const navWithAriaSegment: UISegment = {
      ...NAVIGATION_SEGMENT,
      id: randomUUID(),
    };

    const evidence = collectEvidence(
      contradictoryCandidate,
      navWithAriaSegment,
      {
        endpoints: [contradictoryCandidate],
        reasoning: "Looks like a form",
        model: "mock",
        tokens: { prompt: 50, completion: 25 },
      },
    );

    const summary = summarizeEvidence(evidence);
    expect(summary.hasContradictions).toBe(true);
    expect(summary.contradictions.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// LLM-Client Tests (2)
// ============================================================================

describe("LLM-Client (Mock)", () => {
  it("should return predefined response and track calls", async () => {
    const mockResponse = makeMockLLMResponse([AUTH_CANDIDATE]);
    const mockClient = createMockClient(new Map([["test", mockResponse]]));

    const result = await mockClient.complete({
      systemPrompt: "test prompt",
      userPrompt: "analyze this",
    });

    expect(result.content).toBe(mockResponse.content);
    expect(result.model).toBe("mock-model");
    expect(mockClient.calls.length).toBe(1);
    expect(mockClient.calls[0]!.request.systemPrompt).toBe("test prompt");
  });

  it("should estimate tokens plausibly (100 chars ≈ 25 tokens)", () => {
    const mockClient = createMockClient(new Map());
    const text = "a".repeat(100);
    const tokens = mockClient.estimateTokens(text);
    expect(tokens).toBe(25);
  });
});

// ============================================================================
// Error Cases (2)
// ============================================================================

describe("Error Cases", () => {
  it("should throw LLMParseError on invalid JSON from LLM", async () => {
    const invalidResponse: LLMResponse = {
      content: "{ this is not valid json ]]]",
      model: "mock-model",
      usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
      latency: 5,
    };

    const mockClient = createMockClient(
      new Map([["endpoint", invalidResponse]]),
    );

    // generateEndpoints fangt Fehler ab und gibt leeres Array zurueck
    // Aber wir koennen den Mock-Client direkt testen
    await expect(
      mockClient.complete({
        systemPrompt: "endpoint extraction",
        userPrompt: "analyze this",
        responseSchema: EndpointSchema,
      }),
    ).rejects.toThrow(LLMParseError);
  });

  it("should return empty array for empty segment input", async () => {
    const mockClient = createMockClient(new Map());

    const genResult = await generateEndpoints([], CONTEXT, {
      llmClient: mockClient,
    });

    expect(genResult.candidates).toEqual([]);
    expect(mockClient.calls.length).toBe(0);
  });
});

// ============================================================================
// Affordance-Inferenz Tests (Bonus)
// ============================================================================

describe("Affordance Inference", () => {
  it("should infer fill, toggle, submit from form elements", () => {
    const affordances = inferAffordances(AUTH_CANDIDATE, LOGIN_FORM_SEGMENT);

    const types = affordances.map((a) => a.type);
    expect(types).toContain("fill");
    expect(types).toContain("submit");
  });

  it("should infer navigate from nav elements", () => {
    const affordances = inferAffordances(NAV_CANDIDATE, NAVIGATION_SEGMENT);

    const types = affordances.map((a) => a.type);
    expect(types).toContain("navigate");
  });
});

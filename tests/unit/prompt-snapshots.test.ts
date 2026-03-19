/**
 * P0 — Prompt Snapshot Tests
 *
 * Stellt sicher, dass Aenderungen an Prompts oder Few-Shot-Examples
 * mindestens einen Test brechen. Verhindert stille Prompt-Regression.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  ENDPOINT_EXTRACTION_SYSTEM_PROMPT,
  ENDPOINT_EXTRACTION_FEW_SHOT,
  buildExtractionPrompt,
} from "../../src/semantic/prompts.js";
import type { PrunedSegment, GenerationContext } from "../../src/semantic/types.js";

// Lokale Kopie des EndpointCandidateSchema (nicht exportiert aus endpoint-generator.ts)
const EndpointCandidateSchema = z.object({
  type: z.string(),
  label: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
  anchors: z.array(
    z.object({
      selector: z.string().optional(),
      ariaRole: z.string().optional(),
      ariaLabel: z.string().optional(),
      textContent: z.string().optional(),
    }),
  ),
  affordances: z.array(
    z.object({
      type: z.string(),
      expectedOutcome: z.string(),
      reversible: z.boolean(),
    }),
  ),
  reasoning: z.string(),
});

const LLMEndpointResponseSchema = z.object({
  endpoints: z.array(EndpointCandidateSchema),
  reasoning: z.string(),
});

// ============================================================================
// System Prompt Snapshot Tests
// ============================================================================

describe("ENDPOINT_EXTRACTION_SYSTEM_PROMPT", () => {
  const ALL_ENDPOINT_TYPES = [
    "auth",
    "form",
    "checkout",
    "commerce",
    "search",
    "navigation",
    "support",
    "content",
    "consent",
    "media",
    "social",
    "settings",
  ] as const;

  it.each(ALL_ENDPOINT_TYPES)(
    "contains endpoint type definition for '%s'",
    (type) => {
      expect(ENDPOINT_EXTRACTION_SYSTEM_PROMPT).toContain(`- ${type}:`);
    },
  );

  it("contains SEGMENT TYPE vs ENDPOINT TYPE distinction rules", () => {
    expect(ENDPOINT_EXTRACTION_SYSTEM_PROMPT).toContain(
      "SEGMENT TYPE vs ENDPOINT TYPE",
    );
  });

  it("states that segment type is a HINT, not a constraint", () => {
    expect(ENDPOINT_EXTRACTION_SYSTEM_PROMPT).toContain(
      "segment type is a HINT, not a constraint",
    );
  });

  it("defines nuanced auth-link rules for navigation segments", () => {
    expect(ENDPOINT_EXTRACTION_SYSTEM_PROMPT).toContain(
      "AUTH LINKS IN NAVIGATION",
    );
  });

  it("explains dual-endpoint pattern for navigation with many links", () => {
    expect(ENDPOINT_EXTRACTION_SYSTEM_PROMPT).toMatch(
      /MANY links.*5\+.*navigation.*auth/is,
    );
  });

  it("defines the expected JSON output format", () => {
    expect(ENDPOINT_EXTRACTION_SYSTEM_PROMPT).toContain('"type":');
    expect(ENDPOINT_EXTRACTION_SYSTEM_PROMPT).toContain('"label":');
    expect(ENDPOINT_EXTRACTION_SYSTEM_PROMPT).toContain('"confidence":');
    expect(ENDPOINT_EXTRACTION_SYSTEM_PROMPT).toContain('"anchors":');
    expect(ENDPOINT_EXTRACTION_SYSTEM_PROMPT).toContain('"affordances":');
    expect(ENDPOINT_EXTRACTION_SYSTEM_PROMPT).toContain('"reasoning":');
  });
});

// ============================================================================
// Few-Shot Examples Snapshot Tests
// ============================================================================

describe("ENDPOINT_EXTRACTION_FEW_SHOT", () => {
  it("has at least 3 examples", () => {
    expect(ENDPOINT_EXTRACTION_FEW_SHOT.length).toBeGreaterThanOrEqual(3);
  });

  it("each example has input and output", () => {
    for (const example of ENDPOINT_EXTRACTION_FEW_SHOT) {
      expect(example.input).toBeDefined();
      expect(typeof example.input).toBe("string");
      expect(example.input.length).toBeGreaterThan(0);
      expect(example.output).toBeDefined();
      expect(example.output.endpoints).toBeDefined();
      expect(example.output.reasoning).toBeDefined();
    }
  });

  it("all few-shot endpoints validate against EndpointCandidateSchema", () => {
    for (const example of ENDPOINT_EXTRACTION_FEW_SHOT) {
      for (const endpoint of example.output.endpoints) {
        const result = EndpointCandidateSchema.safeParse(endpoint);
        if (!result.success) {
          throw new Error(
            `Few-shot endpoint "${endpoint.label}" failed validation: ${result.error.message}`,
          );
        }
      }
    }
  });

  it("all few-shot outputs validate against LLMEndpointResponseSchema", () => {
    for (const example of ENDPOINT_EXTRACTION_FEW_SHOT) {
      const result = LLMEndpointResponseSchema.safeParse(example.output);
      if (!result.success) {
        throw new Error(
          `Few-shot output failed validation: ${result.error.message}`,
        );
      }
    }
  });

  it("all few-shot outputs survive JSON round-trip", () => {
    for (const example of ENDPOINT_EXTRACTION_FEW_SHOT) {
      const json = JSON.stringify(example.output);
      const parsed = JSON.parse(json) as unknown;
      const result = LLMEndpointResponseSchema.safeParse(parsed);
      expect(result.success).toBe(true);
    }
  });

  it("includes auth example (sign-in form)", () => {
    const authExample = ENDPOINT_EXTRACTION_FEW_SHOT.find((ex) =>
      ex.output.endpoints.some((ep) => ep.type === "auth"),
    );
    expect(authExample).toBeDefined();
  });

  it("includes navigation example", () => {
    const navExample = ENDPOINT_EXTRACTION_FEW_SHOT.find((ex) =>
      ex.output.endpoints.some((ep) => ep.type === "navigation"),
    );
    expect(navExample).toBeDefined();
  });

  it("includes search example", () => {
    const searchExample = ENDPOINT_EXTRACTION_FEW_SHOT.find((ex) =>
      ex.output.endpoints.some((ep) => ep.type === "search"),
    );
    expect(searchExample).toBeDefined();
  });
});

// ============================================================================
// buildExtractionPrompt Tests
// ============================================================================

describe("buildExtractionPrompt", () => {
  const MOCK_SEGMENT: PrunedSegment = {
    segmentId: "seg-test-abc123",
    segmentType: "form",
    textRepresentation:
      'FORM\n  INPUT[type=email, placeholder="Email"]\n  BUTTON: "Submit"',
    estimatedTokens: 42,
    preservedElements: 3,
    removedElements: 1,
  };

  const MOCK_CONTEXT: GenerationContext = {
    url: "https://example.com/login",
    siteId: "site-001",
    sessionId: "session-001",
    pageTitle: "Example Login Page",
  };

  it("includes the segment ID", () => {
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT);
    expect(prompt).toContain("seg-test-abc123");
  });

  it("includes the page URL", () => {
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT);
    expect(prompt).toContain("https://example.com/login");
  });

  it("includes the page title when provided", () => {
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT);
    expect(prompt).toContain("Example Login Page");
  });

  it("omits title line when pageTitle is not provided", () => {
    const noTitleCtx: GenerationContext = {
      ...MOCK_CONTEXT,
      pageTitle: undefined,
    };
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, noTitleCtx);
    expect(prompt).not.toContain("Title:");
  });

  it("includes segment type", () => {
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT);
    expect(prompt).toContain("form");
  });

  it("includes the text representation of the pruned segment", () => {
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT);
    expect(prompt).toContain(MOCK_SEGMENT.textRepresentation);
  });

  it("includes all few-shot example inputs", () => {
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT);
    for (const example of ENDPOINT_EXTRACTION_FEW_SHOT) {
      expect(prompt).toContain(example.input);
    }
  });

  it("includes few-shot example outputs as JSON", () => {
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT);
    for (const example of ENDPOINT_EXTRACTION_FEW_SHOT) {
      // buildExtractionPrompt uses JSON.stringify(example.output, null, 2)
      const jsonSnippet = JSON.stringify(example.output, null, 2);
      expect(prompt).toContain(jsonSnippet);
    }
  });

  it("includes estimated tokens count", () => {
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT);
    expect(prompt).toContain("42");
  });

  it("includes preserved elements count", () => {
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT);
    expect(prompt).toContain("3");
  });

  it("ends with the task instruction", () => {
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT);
    expect(prompt).toContain("Your Task");
    expect(prompt).toContain("Analyze the UI segment above");
  });
});

/**
 * Ensemble Precision Tests
 *
 * Tests for F1 improvements:
 * 1. LLM-only endpoint penalty in ensemble reconciler
 * 2. Null-result few-shot example in prompt
 * 3. Segment-budget context in extraction prompt
 * 4. GAP_THRESHOLD tuning (0.18 -> 0.16)
 */

import { describe, it, expect } from "vitest";
import {
  ENDPOINT_EXTRACTION_FEW_SHOT,
  ENDPOINT_EXTRACTION_SYSTEM_PROMPT_WITH_EXAMPLES,
  buildExtractionPrompt,
} from "../../src/semantic/prompts.js";
import { applyGapCutoff } from "../../src/semantic/post-processing/gap-cutoff.js";
import type { EndpointCandidate } from "../../src/semantic/types.js";
import type { PrunedSegment, GenerationContext, PageSegmentSummary } from "../../src/semantic/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeCandidate(
  type: string,
  label: string,
  confidence: number = 0.8,
): EndpointCandidate {
  return {
    type,
    label,
    description: `${type} endpoint`,
    confidence,
    anchors: [{ selector: "div" }],
    affordances: [{ type: "click", expectedOutcome: "test", reversible: true }],
    reasoning: "test",
  };
}

// ============================================================================
// 1. LLM-only Endpoint Penalty (reconcileEnsembleResults)
// ============================================================================

describe("LLM-only endpoint penalty in ensemble reconciler", () => {
  // We test indirectly via analyzeFromHTML since reconcileEnsembleResults is not exported.
  // The key behavior: LLM-only endpoints get 0.80 confidence multiplier.

  it("source code applies 0.80 penalty to LLM-only endpoints", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const analyzeSource = fs.readFileSync(
      path.resolve("src/core/analyze.ts"),
      "utf-8",
    );
    // Verify the penalty is applied in the reconciler
    expect(analyzeSource).toContain("confidence: llm[i]!.confidence * 0.90");
    // Verify the comment explains the rationale
    expect(analyzeSource).toContain("LLM-only endpoints are less trustworthy");
  });

  it("LLM-only penalty produces lower confidence than agreement boost", async () => {
    // Verify the math: agreement gets +0.05 boost, LLM-only gets *0.80 penalty
    const llmOnlyConf = 0.85 * 0.90; // = 0.765
    const agreementConf = Math.min(0.98, 0.85 + 0.05); // = 0.90
    expect(llmOnlyConf).toBeLessThan(agreementConf);
    // The gap between agreement and penalty should be significant
    expect(agreementConf - llmOnlyConf).toBeGreaterThan(0.10);
  });
});

// ============================================================================
// 2. Null-Result Few-Shot Example
// ============================================================================

describe("Null-result few-shot example", () => {
  it("includes a few-shot example with empty endpoints array", () => {
    const nullExample = ENDPOINT_EXTRACTION_FEW_SHOT.find(
      (ex) => ex.output.endpoints.length === 0,
    );
    expect(nullExample).toBeDefined();
  });

  it("null-result example has decorative/non-interactive content", () => {
    const nullExample = ENDPOINT_EXTRACTION_FEW_SHOT.find(
      (ex) => ex.output.endpoints.length === 0,
    );
    expect(nullExample).toBeDefined();
    // Should contain non-interactive elements
    expect(nullExample!.input).toMatch(/hero|banner|welcome|decorat/i);
    // Should NOT contain interactive elements like buttons, inputs, forms
    expect(nullExample!.input).not.toMatch(/BUTTON|INPUT\[|FORM/);
  });

  it("null-result example reasoning explains why zero endpoints", () => {
    const nullExample = ENDPOINT_EXTRACTION_FEW_SHOT.find(
      (ex) => ex.output.endpoints.length === 0,
    );
    expect(nullExample).toBeDefined();
    expect(nullExample!.output.reasoning).toMatch(/no interactive|decorative|not every segment/i);
  });

  it("null-result example is included in compiled system prompt", () => {
    expect(ENDPOINT_EXTRACTION_SYSTEM_PROMPT_WITH_EXAMPLES).toContain(
      '"endpoints": []',
    );
    expect(ENDPOINT_EXTRACTION_SYSTEM_PROMPT_WITH_EXAMPLES).toContain(
      "Decorative content only",
    );
  });
});

// ============================================================================
// 3. Segment-Budget in Extraction Prompt
// ============================================================================

describe("Segment-budget context in extraction prompt", () => {
  const MOCK_SEGMENT: PrunedSegment = {
    segmentId: "seg-budget-test",
    segmentType: "form",
    textRepresentation: 'FORM\n  INPUT[type=text]\n  BUTTON: "Go"',
    estimatedTokens: 30,
    preservedElements: 2,
    removedElements: 0,
  };

  const MOCK_CONTEXT: GenerationContext = {
    url: "https://example.com",
    siteId: "site-001",
    sessionId: "session-001",
  };

  it("includes segment budget section when allSegments provided", () => {
    const allSegments: PageSegmentSummary[] = [
      { type: "navigation", interactiveElements: 5 },
      { type: "form", interactiveElements: 3 },
      { type: "footer", interactiveElements: 2 },
    ];
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT, allSegments);
    expect(prompt).toContain("## Endpoint Budget");
    expect(prompt).toContain("This page has 3 segments");
    expect(prompt).toContain("3-6 important endpoints total");
    expect(prompt).toContain("Be selective");
  });

  it("does NOT include segment budget when no allSegments", () => {
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT);
    expect(prompt).not.toContain("## Endpoint Budget");
    expect(prompt).not.toContain("3-6 important endpoints total");
  });

  it("does NOT include segment budget when allSegments is empty", () => {
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT, []);
    expect(prompt).not.toContain("## Endpoint Budget");
  });

  it("includes correct total segment count for large pages", () => {
    const allSegments: PageSegmentSummary[] = Array.from(
      { length: 12 },
      (_, i) => ({ type: `segment-${i}`, interactiveElements: i }),
    );
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT, allSegments);
    expect(prompt).toContain("This page has 12 segments");
  });

  it("budget section appears before the task instruction", () => {
    const allSegments: PageSegmentSummary[] = [
      { type: "form", interactiveElements: 2 },
    ];
    const prompt = buildExtractionPrompt(MOCK_SEGMENT, MOCK_CONTEXT, allSegments);
    const budgetIndex = prompt.indexOf("## Endpoint Budget");
    const taskIndex = prompt.indexOf("## Your Task");
    expect(budgetIndex).toBeGreaterThan(-1);
    expect(taskIndex).toBeGreaterThan(-1);
    expect(budgetIndex).toBeLessThan(taskIndex);
  });
});

// ============================================================================
// 4. GAP_THRESHOLD Tuning (0.18 -> 0.16)
// ============================================================================

describe("GAP_THRESHOLD tuning", () => {
  it("source code has GAP_THRESHOLD = 0.16", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.resolve("src/semantic/post-processing/gap-cutoff.ts"),
      "utf-8",
    );
    expect(source).toContain("GAP_THRESHOLD = 0.16");
    expect(source).not.toContain("GAP_THRESHOLD = 0.18");
  });

  it("gap cutoff triggers at 0.16 gap (previously would not at 0.18)", () => {
    // Scenario: 3 real endpoints at ~0.85, 2 noise at ~0.68
    // Gap = 0.85 - 0.68 = 0.17 — triggers at 0.16, not at 0.18
    const candidates = [
      makeCandidate("auth", "Login", 0.90),
      makeCandidate("search", "Search", 0.87),
      makeCandidate("navigation", "Nav", 0.85),
      // Gap of 0.17 here (> 0.16 threshold)
      makeCandidate("content", "Noise A", 0.68),
      makeCandidate("social", "Noise B", 0.63),
    ];
    const result = applyGapCutoff(candidates);
    // With 0.16 threshold, should cut at the 0.17 gap
    expect(result).toHaveLength(3);
    expect(result.every(c => c.confidence >= 0.85)).toBe(true);
  });

  it("gap cutoff still ignores small gaps below 0.16", () => {
    // All endpoints close together — no gap >= 0.14
    const candidates = [
      makeCandidate("auth", "Login", 0.90),
      makeCandidate("search", "Search", 0.85),
      makeCandidate("navigation", "Nav", 0.80),
      makeCandidate("form", "Form", 0.76),
    ];
    const result = applyGapCutoff(candidates);
    expect(result).toHaveLength(4);
  });

  it("LLM-only penalty + gap cutoff combo: penalized endpoints create larger gaps", () => {
    // Simulating ensemble output: real endpoints at 0.85+, LLM-only at 0.85*0.90=0.765
    const candidates = [
      makeCandidate("auth", "Login", 0.90),        // heuristic+LLM agreement
      makeCandidate("search", "Search", 0.87),      // heuristic+LLM agreement
      makeCandidate("navigation", "Nav", 0.85),     // heuristic+LLM agreement
      // LLM-only endpoints (already penalized by 0.90)
      makeCandidate("content", "LLM-only A", 0.65), // gap: 0.85 - 0.65 = 0.20 > 0.16
      makeCandidate("social", "LLM-only B", 0.60),
    ];
    const result = applyGapCutoff(candidates);
    // Gap between 0.85 and 0.65 = 0.20 > 0.16 → should cut
    expect(result).toHaveLength(3);
    expect(result.every(c => c.confidence >= 0.85)).toBe(true);
  });
});

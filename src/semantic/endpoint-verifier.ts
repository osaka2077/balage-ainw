/**
 * 2-Pass Endpoint Verification
 *
 * Second LLM pass that reviews all detected endpoints from Pass 1.
 * Confirms, rejects, or reclassifies each endpoint with page-level context.
 *
 * Design: Single LLM call per page (not per segment) to see the full picture.
 * Focus: Precision over recall — reject if unsure.
 *
 * Opt-in: BALAGE_VERIFY=1 environment variable.
 */

import { z } from "zod";
import pino from "pino";
import type { LLMClient, LLMRequest, OpenAIJsonSchemaParam } from "./llm-client.js";
import type { EndpointCandidate, PageSegmentSummary } from "./types.js";

const logger = pino({ level: process.env["LOG_LEVEL"] ?? "silent", name: "semantic:verifier" });

// ============================================================================
// Schema
// ============================================================================

const VerificationDecisionSchema = z.object({
  index: z.number(),
  decision: z.enum(["keep", "reclassify", "reject"]),
  correctedType: z.string().optional(),
  reason: z.string(),
});

const VerificationResponseSchema = z.object({
  decisions: z.array(VerificationDecisionSchema),
  reasoning: z.string(),
});

const VERIFICATION_JSON_SCHEMA: OpenAIJsonSchemaParam = {
  name: "verification_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      decisions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "number" },
            decision: { type: "string", enum: ["keep", "reclassify", "reject"] },
            correctedType: { anyOf: [{ type: "string" }, { type: "null" }] },
            reason: { type: "string" },
          },
          required: ["index", "decision", "correctedType", "reason"],
          additionalProperties: false,
        },
      },
      reasoning: { type: "string" },
    },
    required: ["decisions", "reasoning"],
    additionalProperties: false,
  },
};

// ============================================================================
// Prompt
// ============================================================================

const VERIFICATION_SYSTEM_PROMPT = `You are reviewing detected web UI endpoints for accuracy.

For each endpoint, decide:
- **keep**: The endpoint is a real interactive element and the type is correct. DEFAULT choice when unsure.
- **reclassify**: The endpoint is real but the type is WRONG. Provide the correct type.
- **reject**: This is clearly NOT a real endpoint — hallucination, pure decorative element, or exact duplicate of another endpoint in the list.

VALID TYPES: auth, form, checkout, commerce, search, navigation, support, content, consent, media, social, settings

IMPORTANT: Default to KEEP. Only reject when you are CERTAIN the endpoint is wrong. It is better to keep a borderline endpoint than to reject a real one.

ONLY reject when:
- The endpoint describes a non-interactive element (pure text, image, decoration)
- The endpoint is an exact duplicate of another endpoint in the list (same UI element, different label)
- The endpoint type is clearly impossible for this page context (e.g., "checkout" on a documentation site with no shopping cart)

RECLASSIFY when:
- checkout on a travel/booking site with date pickers → should be "search"
- "support" for a generic help link in navigation → should be "navigation"
- "auth" for a help/support form → should be "support"

Keep everything else. 4-8 endpoints per page is normal.`;

// ============================================================================
// Public API
// ============================================================================

export async function verifyEndpoints(
  candidates: EndpointCandidate[],
  llmClient: LLMClient,
  pageContext: { url: string; pageTitle?: string; segmentSummaries: PageSegmentSummary[] },
): Promise<{ verified: EndpointCandidate[]; llmCalls: number }> {
  if (candidates.length === 0) {
    return { verified: [], llmCalls: 0 };
  }

  // Kleine Seiten (<=3 Candidates) brauchen keine Verifikation
  if (candidates.length <= 3) {
    logger.debug({ count: candidates.length }, "Skipping verification — too few candidates");
    return { verified: candidates, llmCalls: 0 };
  }

  const endpointList = candidates.map((c, i) => (
    `[${i}] type=${c.type} label="${c.label}" description="${c.description}" confidence=${c.confidence.toFixed(2)}`
  )).join("\n");

  const segmentContext = pageContext.segmentSummaries
    .map(s => `  ${s.type} (${s.interactiveElements} interactive): ${s.label ?? ""}`)
    .join("\n");

  const userPrompt = `Page: ${pageContext.url}${pageContext.pageTitle ? ` — "${pageContext.pageTitle}"` : ""}

Page segments:
${segmentContext}

Detected endpoints to verify:
${endpointList}

For each endpoint [0..${candidates.length - 1}], provide your decision (keep/reclassify/reject).`;

  const request: LLMRequest = {
    systemPrompt: VERIFICATION_SYSTEM_PROMPT,
    userPrompt,
    responseSchema: VerificationResponseSchema,
    openaiJsonSchema: VERIFICATION_JSON_SCHEMA,
    temperature: 0,
    maxTokens: 1024,
  };

  try {
    const response = await llmClient.complete(request);
    const parsed = response.parsedContent as z.infer<typeof VerificationResponseSchema>;

    const verified: EndpointCandidate[] = [];
    let kept = 0;
    let reclassified = 0;
    let rejected = 0;

    for (const decision of parsed.decisions) {
      if (decision.index < 0 || decision.index >= candidates.length) continue;
      const candidate = candidates[decision.index]!;

      switch (decision.decision) {
        case "keep":
          verified.push(candidate);
          kept++;
          break;
        case "reclassify":
          if (decision.correctedType) {
            verified.push({ ...candidate, type: decision.correctedType, confidence: candidate.confidence * 0.95 });
            reclassified++;
          } else {
            verified.push(candidate);
            kept++;
          }
          break;
        case "reject":
          rejected++;
          break;
      }
    }

    // Candidates ohne Decision behalten (safety: LLM hat evtl. nicht alle bearbeitet)
    const decidedIndices = new Set(parsed.decisions.map(d => d.index));
    for (let i = 0; i < candidates.length; i++) {
      if (!decidedIndices.has(i)) {
        verified.push(candidates[i]!);
        kept++;
      }
    }

    logger.info(
      { kept, reclassified, rejected, total: candidates.length },
      "Verification pass complete",
    );

    return { verified, llmCalls: 1 };
  } catch (err) {
    // Verification ist nicht-kritisch — bei Fehler Candidates unveraendert zurueckgeben
    logger.warn({ err }, "Verification LLM call failed — keeping all candidates");
    return { verified: candidates, llmCalls: 0 };
  }
}

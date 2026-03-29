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

const VERIFICATION_SYSTEM_PROMPT = `You are a precision-focused endpoint reviewer for web UI analysis.

You receive a list of detected endpoints from an initial analysis pass. Your job is to VERIFY each one.

For each endpoint, decide:
- **keep**: The endpoint is a real, distinct interactive element correctly classified.
- **reclassify**: The endpoint is real but has the wrong type. Provide the correct type.
- **reject**: This is NOT a meaningful endpoint. Reject false positives, hallucinations, duplicate meanings, or decorative elements.

VALID TYPES: auth, form, checkout, commerce, search, navigation, support, content, consent, media, social, settings

GUIDELINES:
- Be CONSERVATIVE. When unsure, reject. Precision matters more than recall.
- A page typically has 3-6 truly distinct endpoints. More than 7 is suspicious.
- auth: ONLY for login forms, signup forms, password reset, SSO buttons. NOT for any link that mentions "account".
- support: ONLY for help forms, ticket submission, live chat widgets. NOT for a "Help" link in navigation.
- checkout: ONLY when actual cart/payment UI is present. Date pickers on travel sites are SEARCH, not checkout.
- navigation: Main nav bars, category menus, breadcrumbs. NOT every link on the page.
- If two endpoints describe the same physical UI element, reject the weaker one.
- Look at the page context: a documentation site should NOT have "checkout" endpoints.`;

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

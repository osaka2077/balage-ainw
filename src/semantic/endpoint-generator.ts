/**
 * Endpoint-Generator: LLM-basierte Extraktion von Endpoints aus UI-Segmenten.
 *
 * Pipeline: UISegment → DOM-Pruning → LLM-Call → Parse → Validate → Endpoint
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import pino from "pino";
import { pruneForLLM } from "./dom-pruner.js";
import { classifyEndpoint, inferAffordances } from "./endpoint-classifier.js";
import { collectEvidence, summarizeEvidence } from "./evidence-collector.js";
import {
  ENDPOINT_EXTRACTION_SYSTEM_PROMPT,
  buildExtractionPrompt,
} from "./prompts.js";
import {
  LLMCallError,
  LLMParseError,
  EndpointValidationError,
} from "./errors.js";
import {
  EndpointSchema,
  EndpointTypeSchema,
} from "../../shared_interfaces.js";
import type { UISegment, Endpoint, Affordance } from "../../shared_interfaces.js";
import type { LLMClient, LLMRequest } from "./llm-client.js";
import type {
  GenerationContext,
  EndpointCandidate,
  LLMEndpointResponse,
  PruneForLLMOptions,
} from "./types.js";

const logger = pino({ name: "semantic:endpoint-generator" });

// ============================================================================
// Zod-Schema fuer LLM-Response-Validierung
// ============================================================================

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
// Public API
// ============================================================================

export interface EndpointGeneratorOptions {
  llmClient: LLMClient;
  pruneOptions?: PruneForLLMOptions;
  maxRetries?: number;
}

/**
 * Generiert Endpoints aus UI-Segmenten via LLM.
 */
export async function generateEndpoints(
  segments: UISegment[],
  context: GenerationContext,
  options: EndpointGeneratorOptions,
): Promise<EndpointCandidate[]> {
  if (segments.length === 0) {
    logger.debug("No segments provided, returning empty array");
    return [];
  }

  const { llmClient, pruneOptions, maxRetries = 2 } = options;
  const allCandidates: EndpointCandidate[] = [];

  for (const segment of segments) {
    try {
      // 1. DOM Pruning
      const pruned = pruneForLLM(segment, pruneOptions);

      // 2. Prompt aufbauen
      const userPrompt = buildExtractionPrompt(pruned, context);

      // 3. LLM-Call mit Retry
      const request: LLMRequest = {
        systemPrompt: ENDPOINT_EXTRACTION_SYSTEM_PROMPT,
        userPrompt,
        responseSchema: LLMEndpointResponseSchema,
        temperature: 0,
        maxTokens: 2048,
      };

      let response;
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          response = await llmClient.complete(request);
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (err instanceof LLMParseError && attempt < maxRetries) {
            logger.warn(
              { attempt, segmentId: segment.id },
              "LLM parse error, retrying",
            );
            continue;
          }
          if (attempt === maxRetries) {
            throw new LLMCallError(
              `LLM call failed for segment ${segment.id} after ${maxRetries + 1} attempts: ${lastError.message}`,
              lastError,
            );
          }
        }
      }

      if (!response) {
        throw new LLMCallError(
          `No response received for segment ${segment.id}`,
          lastError,
        );
      }

      // 4. Response parsen
      const parsedResponse = response.parsedContent as z.infer<
        typeof LLMEndpointResponseSchema
      >;

      // 5. Kandidaten sammeln
      for (const candidate of parsedResponse.endpoints) {
        allCandidates.push(candidate);
      }

      logger.debug(
        {
          segmentId: segment.id,
          candidateCount: parsedResponse.endpoints.length,
        },
        "Endpoints extracted from segment",
      );
    } catch (err) {
      // Segment-Fehler loggen aber Pipeline nicht abbrechen
      logger.error(
        {
          segmentId: segment.id,
          error: err instanceof Error ? err.message : String(err),
        },
        "Failed to extract endpoints from segment",
      );
    }
  }

  // 6. Deduplizierung
  return deduplicateCandidates(allCandidates);
}

/**
 * Wandelt einen EndpointCandidate in ein vollstaendiges Endpoint-Objekt um.
 */
export function candidateToEndpoint(
  candidate: EndpointCandidate,
  context: GenerationContext,
  segment: UISegment,
  llmResponse: LLMEndpointResponse,
): Endpoint {
  // Klassifizieren
  const classified = classifyEndpoint(candidate, segment);
  const effectiveType = classified.correctedType ?? classified.type;

  // Affordances inferieren
  const domAffordances = inferAffordances(candidate, segment);

  // Evidence sammeln
  const evidence = collectEvidence(candidate, segment, llmResponse);
  const evidenceSummary = summarizeEvidence(evidence);

  // Typ validieren (gegen Enum)
  const parsedType = EndpointTypeSchema.safeParse(effectiveType);
  const endpointType = parsedType.success ? parsedType.data : "form";

  // Anchors mappen
  const anchors = candidate.anchors.map((a) => ({
    selector: a.selector,
    ariaRole: a.ariaRole,
    ariaLabel: a.ariaLabel,
    textContent: a.textContent,
  }));

  // Mindestens ein Anchor
  if (anchors.length === 0) {
    anchors.push({
      selector: undefined,
      ariaRole: undefined,
      ariaLabel: undefined,
      textContent: candidate.label,
    });
  }

  // Affordances mappen — DOM-inferierte + LLM-vorgeschlagene
  const affordances: Affordance[] = domAffordances.length > 0
    ? domAffordances
    : candidate.affordances.map((a) => ({
        type: mapAffordanceType(a.type),
        expectedOutcome: a.expectedOutcome,
        sideEffects: [],
        reversible: a.reversible,
        requiresConfirmation: false,
      }));

  // Mindestens eine Affordance
  if (affordances.length === 0) {
    affordances.push({
      type: "click",
      expectedOutcome: "Interact with endpoint",
      sideEffects: [],
      reversible: true,
      requiresConfirmation: false,
    });
  }

  const now = new Date();

  const endpoint = {
    id: randomUUID(),
    version: 1,
    siteId: context.siteId,
    url: context.url,

    type: endpointType,
    category: endpointType,
    label: {
      primary: candidate.label,
      display: candidate.label,
      synonyms: [],
      language: "en",
    },
    status: "discovered" as const,

    anchors,
    affordances,

    confidence: classified.combinedConfidence,
    confidenceBreakdown: {
      semanticMatch: classified.combinedConfidence,
      structuralStability: classified.heuristicConfidence,
      affordanceConsistency: affordances.length > 0 ? 0.8 : 0.4,
      evidenceQuality: evidenceSummary.averageWeight,
      historicalSuccess: 0,
      ambiguityPenalty: evidenceSummary.hasContradictions ? 0.3 : 0,
    },
    evidence,

    risk_class: mapRiskLevel(classified.riskLevel),

    actions: candidate.affordances.map((a) => a.type),
    childEndpointIds: [],
    discoveredAt: now,
    lastSeenAt: now,
    successCount: 0,
    failureCount: 0,
    metadata: {
      generatedBy: "semantic-endpoint-generator",
      llmModel: llmResponse.model,
      llmTokens: llmResponse.tokens,
    },
  };

  // Zod-Validierung
  const result = EndpointSchema.safeParse(endpoint);
  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );
    throw new EndpointValidationError(
      `Generated endpoint failed validation: ${errors.join("; ")}`,
      errors,
    );
  }

  return result.data;
}

// ============================================================================
// Helpers
// ============================================================================

/** Dedupliziert Kandidaten basierend auf Label + Typ */
function deduplicateCandidates(
  candidates: EndpointCandidate[],
): EndpointCandidate[] {
  const seen = new Map<string, EndpointCandidate>();

  for (const candidate of candidates) {
    const key = `${candidate.type}:${candidate.label.toLowerCase()}`;
    const existing = seen.get(key);

    if (!existing || candidate.confidence > existing.confidence) {
      seen.set(key, candidate);
    }
  }

  return [...seen.values()];
}

/** Mappt Affordance-Type-Strings auf das Enum */
function mapAffordanceType(
  type: string,
): Affordance["type"] {
  const valid = new Set([
    "click", "fill", "select", "toggle", "drag",
    "scroll", "upload", "submit", "navigate", "read",
  ]);
  return valid.has(type) ? (type as Affordance["type"]) : "click";
}

/** Mappt Risk-Level-String auf das Enum */
function mapRiskLevel(level: string): "low" | "medium" | "high" | "critical" {
  const valid = new Set(["low", "medium", "high", "critical"]);
  return valid.has(level) ? (level as "low" | "medium" | "high" | "critical") : "medium";
}

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
import { InputSanitizer, InjectionDetector, CredentialGuard } from "../security/index.js";
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

const logger = pino({ level: process.env["LOG_LEVEL"] ?? "silent", name: "semantic:endpoint-generator" });

// ============================================================================
// Zod-Schema fuer LLM-Response-Validierung
// ============================================================================

const EndpointCandidateSchema = z.object({
  type: z.enum(["auth","form","checkout","commerce","search","navigation","support","content","consent","media","social","settings"]),
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
  maxConcurrency?: number;
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

  const envConcurrency = parseInt(process.env["BALAGE_MAX_CONCURRENCY"] ?? "6", 10);
  const { llmClient, pruneOptions, maxRetries = 2, maxConcurrency = envConcurrency } = options;
  const allCandidates: EndpointCandidate[] = [];

  // Security-Module initialisieren
  const sanitizer = new InputSanitizer();
  const injectionDetector = new InjectionDetector();
  const credentialGuard = new CredentialGuard();

  // Segment-Pre-Filtering: Skip Segmente mit wenig Interaktivitaet
  const INTERACTIVE_SEGMENT_TYPES = new Set(["form", "search", "checkout"]);
  const filteredSegments = segments.filter((seg) => {
    if (seg.interactiveElementCount >= 1) return true;
    if (INTERACTIVE_SEGMENT_TYPES.has(seg.type)) return true;
    logger.debug({ segmentId: seg.id, type: seg.type, interactive: seg.interactiveElementCount }, "Skipping low-interactivity segment");
    return false;
  });
  logger.debug({ before: segments.length, after: filteredSegments.length }, "Segment pre-filter applied");

  const executing = new Set<Promise<void>>();

  for (const segment of filteredSegments) {
    const task = (async () => {
      const candidates = await processSegment(
        segment, llmClient, maxRetries, pruneOptions,
        context, sanitizer, injectionDetector, credentialGuard,
      );
      allCandidates.push(...candidates);
    })();
    executing.add(task);
    task.finally(() => executing.delete(task));
    if (executing.size >= maxConcurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.allSettled([...executing]);

  // 6. Confidence-Filter: niedrige Confidence raus
  const MIN_CANDIDATE_CONFIDENCE = 0.50;
  const filtered = allCandidates.filter(
    (c) => c.confidence >= MIN_CANDIDATE_CONFIDENCE,
  );
  logger.debug(
    { before: allCandidates.length, after: filtered.length, threshold: MIN_CANDIDATE_CONFIDENCE },
    "Confidence filter applied",
  );

  // 6b. Consent/Cookie Type-Correction — LLM halluziniert cookie banners als search/auth/checkout
  const CONSENT_KEYWORDS = /cookie|consent|gdpr|privacy|datenschutz|tracking|accept all|reject all/i;

  for (const candidate of filtered) {
    if (CONSENT_KEYWORDS.test(candidate.label)) {
      if (candidate.type !== "consent") {
        candidate.type = "consent" as any;
        candidate.confidence *= 0.7; // Penalty fuer korrigierten Typ
      }
    }
  }

  // 7. Deduplizierung
  const deduped = deduplicateCandidates(filtered);

  // 8. Global Cap: Top-N nach Confidence
  const MAX_TOTAL_ENDPOINTS = 10;
  const capped = deduped
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_TOTAL_ENDPOINTS);

  logger.debug(
    { deduped: deduped.length, capped: capped.length },
    "Global endpoint cap applied",
  );

  return capped;
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

  // Schema erlaubt max 16 Affordances
  if (affordances.length > 16) {
    affordances.length = 16;
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

  // FIX 3: Robuste Zod-Validierung — Felder fixen statt Candidate verwerfen
  let result = EndpointSchema.safeParse(endpoint);
  if (!result.success) {
    // Versuche Felder zu reparieren
    const issues = result.error.issues;
    for (const issue of issues) {
      const path = issue.path.join(".");
      // Label-Felder zu lang → truncate
      if (path === "label.primary" && issue.code === "too_big") {
        endpoint.label.primary = endpoint.label.primary.slice(0, 128);
      }
      if (path === "label.display" && issue.code === "too_big") {
        endpoint.label.display = endpoint.label.display.slice(0, 256);
      }
      // Affordances > 16 → slice
      if (path.startsWith("affordances") && issue.code === "too_big") {
        endpoint.affordances = endpoint.affordances.slice(0, 16);
      }
      // Evidence signal > 512 → truncate
      if (path.match(/^evidence\.\d+\.signal$/) && issue.code === "too_big") {
        const idx = Number(issue.path[1]);
        if (endpoint.evidence[idx]) {
          endpoint.evidence[idx].signal = endpoint.evidence[idx].signal.slice(0, 512);
        }
      }
      // Evidence detail > 2048 → truncate
      if (path.match(/^evidence\.\d+\.detail$/) && issue.code === "too_big") {
        const idx = Number(issue.path[1]);
        if (endpoint.evidence[idx]?.detail) {
          endpoint.evidence[idx].detail = endpoint.evidence[idx].detail!.slice(0, 2048);
        }
      }
    }
    // Retry nach Reparatur
    result = EndpointSchema.safeParse(endpoint);
    if (!result.success) {
      const errors = result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      );
      throw new EndpointValidationError(
        `Generated endpoint failed validation: ${errors.join("; ")}`,
        errors,
      );
    }
  }

  return result.data;
}

// ============================================================================
// Segment Processing (extracted for parallelization)
// ============================================================================

async function processSegment(
  segment: UISegment,
  llmClient: LLMClient,
  maxRetries: number,
  pruneOptions: PruneForLLMOptions | undefined,
  context: GenerationContext,
  sanitizer: InputSanitizer,
  injectionDetector: InjectionDetector,
  credentialGuard: CredentialGuard,
): Promise<EndpointCandidate[]> {
  try {
    // 1. DOM Pruning
    const pruned = pruneForLLM(segment, pruneOptions);

    // 2. Security: Sanitize, Injection-Check, Credential-Redaction
    const sanitizedText = sanitizer.sanitizeForLLM(pruned.textRepresentation);

    const injectionResult = injectionDetector.detect(sanitizedText);
    if (injectionResult.verdict === "blocked") {
      logger.warn({ segmentId: segment.id, score: injectionResult.score }, "Segment blocked by injection detector — skipping");
      return [];
    }

    const credScan = credentialGuard.scan(sanitizedText);
    let cleanText = sanitizedText;
    if (credScan.hasCredentials) {
      const sorted = [...credScan.findings].sort((a, b) => b.position - a.position);
      for (const finding of sorted) {
        cleanText = cleanText.slice(0, finding.position) + "[CREDENTIAL_REDACTED]" + cleanText.slice(finding.position + finding.length);
      }
      logger.warn({ segmentId: segment.id, count: credScan.findings.length }, "Credentials redacted before LLM call");
    }

    const securePruned = { ...pruned, textRepresentation: cleanText };

    // 3. Prompt aufbauen
    const userPrompt = buildExtractionPrompt(securePruned, context);

    // 4. LLM-Call mit Retry
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
          logger.warn({ attempt, segmentId: segment.id }, "LLM parse error, retrying");
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
      throw new LLMCallError(`No response received for segment ${segment.id}`, lastError);
    }

    // 5. Response parsen
    const parsedResponse = response.parsedContent as z.infer<typeof LLMEndpointResponseSchema>;

    // 6. Hallucination Prevention — Post-LLM Validation
    const segText = cleanText.toLowerCase();
    for (const candidate of parsedResponse.endpoints) {
      // Search: Penalize if no search-related attributes found in segment HTML
      const hasSearchEvidence = /type="?search|role="?search|placeholder="[^"]*search|aria-label="[^"]*search/.test(segText)
        || /input.*search|search.*input|searchbar|search-bar|search_bar/.test(segText);
      if (candidate.type === "search" && !hasSearchEvidence) {
        candidate.confidence *= 0.55;
      }
      // Auth: Accept if credential fields OR auth-related links exist
      const hasCredentialFields = /type="?password|type="?email|autocomplete="?(username|email|current-password)/.test(segText);
      const hasAuthLinks = /sign[\s_-]?in|log[\s_-]?in|sign[\s_-]?up|register|anmelden|einloggen|konto|account/i.test(segText);
      if (candidate.type === "auth" && segment.type === "navigation" && !hasCredentialFields && !hasAuthLinks) {
        candidate.confidence *= 0.85;
      }
      // Checkout: Hard penalty wenn kein Cart/Basket/Checkout-Evidence im DOM
      const hasCartEvidence = /cart|basket|warenkorb|bag|checkout|einkaufswagen/i.test(segText);
      if (candidate.type === "checkout" && !hasCartEvidence) {
        candidate.confidence *= 0.55;
      }
    }

    logger.debug(
      { segmentId: segment.id, candidateCount: parsedResponse.endpoints.length },
      "Endpoints extracted from segment",
    );

    return parsedResponse.endpoints;
  } catch (err) {
    logger.error(
      { segmentId: segment.id, error: err instanceof Error ? err.message : String(err) },
      "Failed to extract endpoints from segment",
    );
    return [];
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Dedupliziert Kandidaten basierend auf Type + fuzzy Label-Similarity + per-type cap */
function deduplicateCandidates(
  candidates: EndpointCandidate[],
): EndpointCandidate[] {
  const result: EndpointCandidate[] = [];

  for (const candidate of candidates) {
    const duplicate = result.find(
      (existing) =>
        existing.type === candidate.type &&
        labelSimilarity(existing.label, candidate.label) > 0.40,
    );

    if (duplicate) {
      // Behalte den mit hoeherer Confidence
      if (candidate.confidence > duplicate.confidence) {
        const idx = result.indexOf(duplicate);
        result[idx] = candidate;
      }
    } else {
      result.push(candidate);
    }
  }

  // Commerce-Dedup: Mehrere "Add to Cart" = 1 Endpoint
  const COMMERCE_ACTION_PATTERN = /add to cart|add to bag|in den warenkorb|zum warenkorb/i;

  const commerceDeduped = result.filter((candidate, index) => {
    if (candidate.type === "commerce" || candidate.type === "checkout") {
      if (COMMERCE_ACTION_PATTERN.test(candidate.label)) {
        // Behalte nur den ersten Commerce-Action-Endpoint
        const firstCommerce = result.findIndex(
          c => (c.type === "commerce" || c.type === "checkout") && COMMERCE_ACTION_PATTERN.test(c.label)
        );
        return index === firstCommerce;
      }
    }
    return true;
  });

  // Per-type cap: differenzierte Limits pro Typ
  const TYPE_CAPS: Record<string, number> = {
    navigation: 3,
    auth: 2,
    search: 1,
    commerce: 1,
    checkout: 1,
    consent: 1,
    settings: 1,
    support: 1,
    content: 3,
    media: 2,
    social: 1,
    form: 2,
  };
  const typeCount = new Map<string, number>();
  return commerceDeduped.filter((c) => {
    const count = typeCount.get(c.type) ?? 0;
    if (count >= (TYPE_CAPS[c.type] ?? 2)) return false;
    typeCount.set(c.type, count + 1);
    return true;
  });
}

/** Berechnet Jaccard-aehnliche Wort-Similarity zwischen zwei Labels */
function labelSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
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

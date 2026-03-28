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
  ENDPOINT_EXTRACTION_SYSTEM_PROMPT_WITH_EXAMPLES,
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
  PageSegmentSummary,
  PruneForLLMOptions,
} from "./types.js";
import {
  applyTypeCorrections,
  applySiteSpecificCorrections,
  applyConfidencePenalties,
  deduplicateCandidates,
  applyGapCutoff,
} from "./post-processing/index.js";
import { majorityVote, clampMultiRun } from "./multi-run-voter.js";

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
  /** Number of parallel LLM calls per segment for majority-vote stabilization (1-5, default 1) */
  multiRun?: number;
}

/**
 * Generiert Endpoints aus UI-Segmenten via LLM.
 */
export async function generateEndpoints(
  segments: UISegment[],
  context: GenerationContext,
  options: EndpointGeneratorOptions,
): Promise<{ candidates: EndpointCandidate[]; llmCalls: number }> {
  if (segments.length === 0) {
    logger.debug("No segments provided, returning empty array");
    return { candidates: [], llmCalls: 0 };
  }

  const envConcurrency = parseInt(process.env["BALAGE_MAX_CONCURRENCY"] ?? "6", 10);
  const envMultiRun = parseInt(process.env["BALAGE_RUNS"] ?? "1", 10);
  const { llmClient, pruneOptions, maxRetries = 2, maxConcurrency = envConcurrency } = options;
  const effectiveMultiRun = clampMultiRun(options.multiRun ?? envMultiRun);
  const allCandidates: EndpointCandidate[] = [];

  // Security-Module initialisieren
  const sanitizer = new InputSanitizer();
  const injectionDetector = new InjectionDetector();
  const credentialGuard = new CredentialGuard();

  // Segment-Pre-Filtering: Skip Segmente mit wenig Interaktivitaet
  // Gruppe 1: Typen die IMMER durchgelassen werden (auch mit 0 interaktiven Elementen)
  const ALWAYS_PASS_TYPES = new Set(["form", "search", "checkout", "navigation"]);
  // Gruppe 2: Typen die durchgelassen werden weil sie haeufig relevante Links/Endpoints enthalten
  // Footer: Support-Links, Help, Contact. Header: Auth-Buttons, Language-Selector.
  // Modal/Overlay: Cookie-Banner, Login-Modals. Sidebar: Navigation-Links.
  const STRUCTURAL_PASS_TYPES = new Set(["footer", "header", "modal", "overlay", "sidebar"]);
  const filteredSegments = segments.filter((seg) => {
    if (seg.interactiveElementCount >= 1) return true;
    if (ALWAYS_PASS_TYPES.has(seg.type)) return true;
    if (STRUCTURAL_PASS_TYPES.has(seg.type)) return true;
    logger.debug({ segmentId: seg.id, type: seg.type, interactive: seg.interactiveElementCount }, "Skipping low-interactivity segment");
    return false;
  });
  logger.debug({ before: segments.length, after: filteredSegments.length }, "Segment pre-filter applied");

  // Page-Context: Kompakte Zusammenfassung aller Segmente fuer LLM-Prompt
  const pageSegmentSummaries: PageSegmentSummary[] = filteredSegments.map((seg) => ({
    type: seg.type,
    interactiveElements: seg.interactiveElementCount,
    label: seg.label,
  }));

  const executing = new Set<Promise<void>>();
  // Gesamtzahl LLM-Calls: Segmente * Runs
  let totalLlmCalls = 0;

  for (const segment of filteredSegments) {
    const task = (async () => {
      if (effectiveMultiRun > 1) {
        // Multi-Run: N parallele processSegment-Calls pro Segment, dann Majority-Vote
        const runPromises = Array.from({ length: effectiveMultiRun }, () =>
          processSegment(
            segment, llmClient, maxRetries, pruneOptions,
            context, sanitizer, injectionDetector, credentialGuard,
            pageSegmentSummaries,
          ),
        );
        const runResults = await Promise.allSettled(runPromises);
        const successfulRuns = runResults
          .filter((r): r is PromiseFulfilledResult<EndpointCandidate[]> => r.status === "fulfilled")
          .map(r => r.value);

        totalLlmCalls += successfulRuns.length;

        if (successfulRuns.length === 0) {
          logger.warn({ segmentId: segment.id, runs: effectiveMultiRun }, "All multi-run calls failed for segment");
          return;
        }

        const merged = majorityVote(successfulRuns);
        allCandidates.push(...merged);

        logger.debug(
          { segmentId: segment.id, runs: successfulRuns.length, before: successfulRuns.flat().length, after: merged.length },
          "Segment multi-run majority vote applied",
        );
      } else {
        // Single-Run: normales Verhalten
        const candidates = await processSegment(
          segment, llmClient, maxRetries, pruneOptions,
          context, sanitizer, injectionDetector, credentialGuard,
          pageSegmentSummaries,
        );
        totalLlmCalls += 1;
        allCandidates.push(...candidates);
      }
    })();
    executing.add(task);
    task.finally(() => executing.delete(task));
    if (executing.size >= maxConcurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.allSettled([...executing]);

  // 6. Confidence-Filter: niedrige Confidence raus
  const MIN_CANDIDATE_CONFIDENCE = 0.53;
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
        candidate.type = "consent";
        candidate.confidence *= 0.7; // Penalty fuer korrigierten Typ
      }
    }
  }

  // 7. Deduplizierung
  const deduped = deduplicateCandidates(filtered);

  // 8. Gap-basierter Cutoff
  const capped = applyGapCutoff(deduped);

  logger.debug(
    { deduped: deduped.length, capped: capped.length },
    "Global endpoint cap applied",
  );

  return { candidates: capped, llmCalls: totalLlmCalls };
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
  allSegments?: PageSegmentSummary[],
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
    const userPrompt = buildExtractionPrompt(securePruned, context, allSegments);

    // 4. LLM-Call mit Retry
    const request: LLMRequest = {
      systemPrompt: ENDPOINT_EXTRACTION_SYSTEM_PROMPT_WITH_EXAMPLES,
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
    const candidates: EndpointCandidate[] = parsedResponse.endpoints;

    // 6. Post-LLM Processing — Type-Corrections FIRST, then Confidence-Penalties
    const segText = cleanText.toLowerCase();

    applyTypeCorrections(candidates, segText, segment.type);
    applySiteSpecificCorrections(candidates, segText);
    applyConfidencePenalties(candidates, segText, segment.type);

    // Setze segmentId auf jeden Candidate fuer spaeteres Segment-Matching
    for (const candidate of candidates) {
      candidate.segmentId = segment.id;
    }

    logger.debug(
      { segmentId: segment.id, candidateCount: candidates.length },
      "Endpoints extracted from segment",
    );

    return candidates;
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

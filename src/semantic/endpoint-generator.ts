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
): Promise<{ candidates: EndpointCandidate[]; llmCalls: number }> {
  if (segments.length === 0) {
    logger.debug("No segments provided, returning empty array");
    return { candidates: [], llmCalls: 0 };
  }

  const envConcurrency = parseInt(process.env["BALAGE_MAX_CONCURRENCY"] ?? "6", 10);
  const { llmClient, pruneOptions, maxRetries = 2, maxConcurrency = envConcurrency } = options;
  const allCandidates: EndpointCandidate[] = [];

  // Security-Module initialisieren
  const sanitizer = new InputSanitizer();
  const injectionDetector = new InjectionDetector();
  const credentialGuard = new CredentialGuard();

  // Segment-Pre-Filtering: Skip Segmente mit wenig Interaktivitaet
  const INTERACTIVE_SEGMENT_TYPES = new Set(["form", "search", "checkout", "navigation"]);
  const filteredSegments = segments.filter((seg) => {
    if (seg.interactiveElementCount >= 1) return true;
    if (INTERACTIVE_SEGMENT_TYPES.has(seg.type)) return true;
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

  for (const segment of filteredSegments) {
    const task = (async () => {
      const candidates = await processSegment(
        segment, llmClient, maxRetries, pruneOptions,
        context, sanitizer, injectionDetector, credentialGuard,
        pageSegmentSummaries,
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
        candidate.type = "consent" as any;
        candidate.confidence *= 0.7; // Penalty fuer korrigierten Typ
      }
    }
  }

  // 7. Deduplizierung
  const deduped = deduplicateCandidates(filtered);

  // 8. Global Cap: Confidence-Gap-basiert statt fester Cap
  const sorted = deduped.sort((a, b) => b.confidence - a.confidence);
  const SAFETY_CAP = 12;
  const MIN_ENDPOINTS = 3;
  const GAP_THRESHOLD = 0.10;

  // Finde den groessten Confidence-Gap (natuerliche Trennlinie zwischen echten und noise Endpoints)
  let cutoffIndex = sorted.length;
  if (sorted.length > MIN_ENDPOINTS) {
    let maxGap = 0;
    for (let i = MIN_ENDPOINTS; i < sorted.length; i++) {
      const gap = sorted[i - 1]!.confidence - sorted[i]!.confidence;
      if (gap > maxGap && gap >= GAP_THRESHOLD) {
        maxGap = gap;
        cutoffIndex = i;
      }
    }
  }
  const capped = sorted.slice(0, Math.min(cutoffIndex, SAFETY_CAP));

  logger.debug(
    { deduped: deduped.length, capped: capped.length },
    "Global endpoint cap applied",
  );

  return { candidates: capped, llmCalls: filteredSegments.length };
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
    const hasCartEvidence = /cart|basket|warenkorb|bag|checkout|einkaufswagen/i.test(segText);
    const hasSearchEvidence = /type="?search|role="?search|placeholder="[^"]*search|aria-label="[^"]*search|name="?q"?|name="?query"?|name="?s"?|placeholder="[^"]*such|placeholder="[^"]*find/i.test(segText)
      || /input.*search|search.*input|searchbar|search-bar|search_bar/i.test(segText)
      || /button[^>]*>.*?search|aria-label="[^"]*search|data-testid="[^"]*search|>search<|>suche</i.test(segText)
      || /action="[^"]*search|action='[^']*search/i.test(segText)
      || /check.?in|check.?out|departure|arrival|destination|where.*going|reiseziel|anreise|abreise/i.test(segText)
      || /guests?|rooms?|travelers?|passengers?|adults?|children|reisende/i.test(segText)
      || /method="?get/i.test(segText);
    const isBookingStyleSearch = /check.?in|departure|arrival/i.test(segText) && /destination|where.*going|guests?|rooms?|reiseziel/i.test(segText);

    // === PHASE 1: Type-Corrections (fix misclassifications BEFORE applying penalties) ===
    for (const candidate of candidates) {
      // checkout → search (Booking/Travel)
      if (candidate.type === "checkout" && !hasCartEvidence) {
        if (hasSearchEvidence || isBookingStyleSearch) {
          candidate.type = "search";
        }
      }
      // checkout → search (label-based)
      if (candidate.type === "checkout") {
        const hasSearchLabel = /search|property|destination|reise|suche|find|lookup|filter|explore/i.test(
          `${candidate.label} ${candidate.description}`,
        );
        if (hasSearchLabel && !hasCartEvidence) {
          candidate.type = "search";
          candidate.confidence *= 0.95;
        }
      }
      // settings → consent
      if (candidate.type === "settings") {
        const candidateText = `${candidate.label} ${candidate.description}`.toLowerCase();
        const hasConsentInLabel = /cookie|consent|gdpr|privacy|datenschutz|tracking/.test(candidateText);
        const hasConsentInSegment = /cookie|consent|gdpr|datenschutz|accept\s*all|reject\s*all|alle\s*akzeptieren/i.test(segText);
        if (hasConsentInLabel || hasConsentInSegment) {
          candidate.type = "consent";
        }
      }
      // settings → navigation (language-only)
      if (candidate.type === "settings") {
        const isLanguageOnly = /language|locale|sprache|idioma|langue/i.test(
          `${candidate.label} ${candidate.description}`,
        );
        const hasRealSettingsUI = /toggle|switch|checkbox|radio|slider|preference|einstellung/i.test(segText);
        if (isLanguageOnly && !hasRealSettingsUI) {
          candidate.type = "navigation";
          candidate.confidence *= 0.9;
        }
      }
      // content → navigation (footer/header with links)
      if (candidate.type === "content" && ["footer", "header", "navigation"].includes(segment.type)) {
        if (/<a[\s>]|href=/i.test(segText)) {
          candidate.type = "navigation";
          candidate.confidence *= 0.95;
        }
      }
      // navigation → support (support keywords in label)
      if (candidate.type === "navigation") {
        const candidateText = `${candidate.label} ${candidate.description}`.toLowerCase();
        const isSupportLabeled = /submit.?a?.?request|contact.?support|help.?center|get.?help|kundenservice|hilfe|support.*ticket/i.test(candidateText);
        if (isSupportLabeled) {
          candidate.type = "support";
          candidate.confidence *= 0.95;
        }
      }
    }

    // === PHASE 2: Confidence-Penalties (on CORRECTED types) ===
    for (const candidate of candidates) {
      // Search without evidence
      if (candidate.type === "search" && !hasSearchEvidence) {
        candidate.confidence *= 0.55;
      }
      // Auth from nav segment without credential fields
      const hasCredentialFields = /type="?password|type="?email|autocomplete="?(username|email|current-password)/.test(segText);
      const hasAuthLinks = /sign[\s_-]?in|log[\s_-]?in|sign[\s_-]?up|register|anmelden|einloggen|konto|account/i.test(segText);
      if (candidate.type === "auth" && segment.type === "navigation" && !hasCredentialFields && !hasAuthLinks) {
        candidate.confidence *= 0.85;
      }
      // Checkout without cart evidence (after type-corrections, only true checkouts remain)
      if (candidate.type === "checkout" && !hasCartEvidence) {
        candidate.confidence *= 0.55;
      }
      // Commerce without evidence
      const hasCommerceEvidence = /price|product|add.to.cart|buy|purchase|kaufen|in\s*den\s*warenkorb|warenkorb|bestellen|jetzt\s*bestellen|zur\s*kasse|\$|€|£/i.test(segText);
      if (candidate.type === "commerce" && !hasCommerceEvidence) {
        candidate.confidence *= candidate.confidence >= 0.7 ? 0.8 : 0.6;
      }
      // Consent without evidence
      const hasConsentEvidence = /cookie|consent|gdpr|privacy|datenschutz|tracking|accept.*all|reject.*all/i.test(segText);
      if (candidate.type === "consent" && !hasConsentEvidence) {
        candidate.confidence *= candidate.confidence >= 0.7 ? 0.8 : 0.6;
      }
      // Settings without evidence
      const hasSettingsEvidence = /toggle|switch|preference|setting|einstellung|theme|dark.?mode/i.test(segText)
        || /type="?checkbox|type="?radio|role="?switch/i.test(segText);
      if (candidate.type === "settings" && !hasSettingsEvidence) {
        candidate.confidence *= candidate.confidence >= 0.7 ? 0.8 : 0.6;
      }
      // Navigation from non-nav segment without nav evidence
      const hasNavEvidence = /<nav|role="?navigation|role="?menubar|role="?menu[^i]/i.test(segText);
      if (candidate.type === "navigation" && segment.type !== "navigation" && !hasNavEvidence) {
        candidate.confidence *= candidate.confidence >= 0.7 ? 0.8 : 0.6;
      }

    }

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

/** Dedupliziert Kandidaten basierend auf Type + fuzzy Label-Similarity + per-type cap */
function deduplicateCandidates(
  candidates: EndpointCandidate[],
): EndpointCandidate[] {
  const result: EndpointCandidate[] = [];

  for (const candidate of candidates) {
    const duplicate = result.find(
      (existing) =>
        existing.type === candidate.type &&
        labelSimilarity(existing.label, candidate.label) > 0.65,
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
    navigation: 5,
    auth: 4,
    search: 1,
    commerce: 2,
    checkout: 1,
    consent: 1,
    settings: 2,
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

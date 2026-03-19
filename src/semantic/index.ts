/**
 * Semantic Engine — Public API
 *
 * Layer 3: Generiert semantische Endpoints aus UI-Segmenten via LLM.
 */

// Core-Funktionen
export { pruneForLLM } from "./dom-pruner.js";
export { generateEndpoints, candidateToEndpoint } from "./endpoint-generator.js";
export type { EndpointGeneratorOptions } from "./endpoint-generator.js";
export { classifyEndpoint, inferAffordances } from "./endpoint-classifier.js";
export { collectEvidence, summarizeEvidence } from "./evidence-collector.js";

// LLM-Client (Interface + Factories)
export type { LLMClient, LLMRequest, LLMResponse, MockCallRecord, MockLLMClient } from "./llm-client.js";
export { createOpenAIClient, createAnthropicClient, createMockClient } from "./llm-client.js";

// Fallback LLM Client (Rate Limiting, Cost Tracking, Circuit Breaker)
export type { FallbackLLMClient, FallbackLLMClientOptions, CostSummary, CostRecord } from "./fallback-llm-client.js";
export { createFallbackLLMClient } from "./fallback-llm-client.js";

// Cached LLM Client (Deterministic Benchmark Results)
export { CachedLLMClient } from "./cached-llm-client.js";
export type { CacheOptions } from "./cached-llm-client.js";

// Prompts
export {
  ENDPOINT_EXTRACTION_SYSTEM_PROMPT,
  ENDPOINT_EXTRACTION_FEW_SHOT,
  buildExtractionPrompt,
} from "./prompts.js";

// Typen
export type {
  PrunedSegment,
  PruneForLLMOptions,
  GenerationContext,
  EndpointCandidate,
  ClassifiedEndpoint,
  LLMEndpointResponse,
  EvidenceSummary,
  OpenAIConfig,
  AnthropicConfig,
} from "./types.js";

// Error-Klassen
export {
  SemanticError,
  DomPruningError,
  LLMCallError,
  LLMParseError,
  LLMRateLimitError,
  EndpointValidationError,
  ClassificationError,
  EvidenceCollectionError,
} from "./errors.js";

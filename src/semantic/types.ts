/**
 * Semantic-Engine-Typen: Re-Exports aus shared_interfaces + lokale Typen
 */

// Re-Exports aus shared_interfaces (READ-ONLY)
export type {
  DomNode,
  AccessibilityNode,
  UISegment,
  UISegmentType,
  Endpoint,
  EndpointType,
  EndpointStatus,
  RiskLevel,
  Evidence,
  EvidenceType,
  SemanticFingerprint,
  SemanticLabel,
  DomAnchor,
  Affordance,
  BoundingBox,
} from "../../shared_interfaces.js";

export {
  EndpointSchema,
  EndpointTypeSchema,
  EvidenceSchema,
  EvidenceTypeSchema,
  UISegmentSchema,
  DomNodeSchema,
  SemanticLabelSchema,
  DomAnchorSchema,
  AffordanceSchema,
  RiskLevelSchema,
  EndpointStatusSchema,
  BoundingBoxSchema,
} from "../../shared_interfaces.js";

// ============================================================================
// Lokale Semantic-Engine-Typen
// ============================================================================

/** Optionen fuer LLM-optimiertes DOM-Pruning */
export interface PruneForLLMOptions {
  /** Max Tokens fuer LLM-Input (Default: 4000) */
  maxTokens?: number;
  /** data-* Attribute die behalten werden sollen */
  preserveDataAttributes?: string[];
  /** Max Textlaenge pro Element (Default: 200) */
  maxTextLength?: number;
  /** Max Listenelemente (Default: 5) */
  maxListItems?: number;
}

/** Ergebnis des LLM-optimierten Prunings */
export interface PrunedSegment {
  segmentId: string;
  segmentType?: string;
  textRepresentation: string;
  estimatedTokens: number;
  preservedElements: number;
  removedElements: number;
}

/** Kontext fuer die Endpoint-Generierung */
export interface GenerationContext {
  url: string;
  siteId: string;
  sessionId: string;
  pageTitle?: string;
}

/** LLM-Antwort fuer Endpoint-Extraktion (parsed) */
export interface LLMEndpointResponse {
  endpoints: EndpointCandidate[];
  reasoning: string;
  model: string;
  tokens: { prompt: number; completion: number };
}

/** Endpoint-Kandidat (vor Validierung/Enrichment) */
export interface EndpointCandidate {
  type: string;
  label: string;
  description: string;
  confidence: number;
  segmentId?: string;
  anchors: Array<{
    selector?: string;
    ariaRole?: string;
    ariaLabel?: string;
    textContent?: string;
  }>;
  affordances: Array<{
    type: string;
    expectedOutcome: string;
    reversible: boolean;
  }>;
  reasoning: string;
}

/** Klassifizierter Endpoint (nach Heuristik-Korrektur) */
export interface ClassifiedEndpoint extends EndpointCandidate {
  correctedType?: string;
  riskLevel: string;
  heuristicConfidence: number;
  combinedConfidence: number;
}

/** Zusammenfassung der Evidence-Chain */
export interface EvidenceSummary {
  totalEvidence: number;
  strongestSignal: string;
  averageWeight: number;
  hasContradictions: boolean;
  contradictions: Array<{
    signal1: string;
    signal2: string;
    description: string;
  }>;
}

/** Kompakte Segment-Zusammenfassung fuer Page-Context im Prompt */
export interface PageSegmentSummary {
  type: string;
  interactiveElements: number;
  label?: string;
}

/** Konfiguration fuer OpenAI-Client */
export interface OpenAIConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

/** Konfiguration fuer Anthropic-Client */
export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
}

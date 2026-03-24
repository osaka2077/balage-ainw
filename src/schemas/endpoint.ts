import { z } from "zod";
import { BoundingBoxSchema } from "./dom.js";

// ============================================================================
// Endpoint-Typen & Enums
// ============================================================================

/** Endpoint-Kategorie (aus MASTERSPEC 2.2) */
export const EndpointTypeSchema = z.enum([
  "form",
  "checkout",
  "support",
  "navigation",
  "auth",
  "search",
  "commerce",
  "content",
  "consent",
  "media",
  "social",
  "settings",
]);
export type EndpointType = z.infer<typeof EndpointTypeSchema>;

/** Risk-Level */
export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/** Endpoint-Status (Lifecycle) */
export const EndpointStatusSchema = z.enum([
  "discovered",
  "inferred",
  "verified",
  "deprecated",
  "broken",
  "suspended",
]);
export type EndpointStatus = z.infer<typeof EndpointStatusSchema>;

/** Adapter-Typ — plattformuebergreifend (MASTERSPEC Phase 8) */
export const AdapterTypeSchema = z.enum(["browser", "desktop", "mobile", "api"]);
export type AdapterType = z.infer<typeof AdapterTypeSchema>;

// ============================================================================
// Evidence & Confidence — Begruendung und Bewertung
// ============================================================================

/** Evidence-Typ — Quelle der Begruendung */
export const EvidenceTypeSchema = z.enum([
  "semantic_label",
  "aria_role",
  "structural_pattern",
  "text_content",
  "layout_position",
  "historical_match",
  "fingerprint_similarity",
  "llm_inference",
  "user_confirmation",
  "verification_proof",
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

/** Einzelner Beweis fuer eine Endpoint-Interpretation */
export const EvidenceSchema = z.object({
  type: EvidenceTypeSchema,
  signal: z.string().min(1).max(512),
  weight: z.number().min(0).max(1),
  detail: z.string().max(2048).optional(),
  source: z
    .enum(["dom", "aria", "llm", "fingerprint", "history", "operator"])
    .optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// ============================================================================
// Endpoint Provenance & Trust — ADR-012 (SI-07 Enforcement)
// ============================================================================

/** Validation-Status — Vertrauensstufe eines Endpoints */
export const ValidationStatusSchema = z.enum([
  "unvalidated",
  "inferred",
  "validated_inferred",
  "fully_verified",
]);
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;

/** Endpoint-Provenance — Herkunft und Verifikationshistorie */
export const EndpointProvenanceSchema = z.object({
  discovery_method: z.enum([
    "llm_inference",
    "heuristic_match",
    "user_defined",
    "historical_replay",
    "api_import",
  ]),
  discovery_model: z.string().max(128).optional(),
  discovery_confidence: z.number().min(0).max(1),
  discovery_timestamp: z.coerce.date(),
  verification_evidence: z.array(EvidenceSchema).default([]),
  verification_timestamp: z.coerce.date().optional(),
  promoted_at: z.coerce.date().optional(),
  promoted_by: z
    .enum(["verification_service", "operator", "historical_match"])
    .optional(),
  trust_ceiling: z.number().min(0).max(1),
});
export type EndpointProvenance = z.infer<typeof EndpointProvenanceSchema>;

/** Trust-Level — Berechnetes Vertrauensniveau mit Ceiling */
export const TrustLevelSchema = z.object({
  score: z.number().min(0).max(1),
  ceiling: z.number().min(0).max(1),
  components: z.object({
    confidence_component: z.number().min(0).max(1),
    provenance_component: z.number().min(0).max(1),
  }),
  effective_score: z.number().min(0).max(1),
});
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

/** Trust-Ceiling pro Validation-Status (SI-07: inferred < verified) */
export const TRUST_CEILINGS = {
  unvalidated: 0.50,
  inferred: 0.70,
  validated_inferred: 0.85,
  fully_verified: 1.00,
} as const;

/** Provenance-Faktor pro Validation-Status */
export const PROVENANCE_FACTORS = {
  unvalidated: 0.70,
  inferred: 0.85,
  validated_inferred: 0.95,
  fully_verified: 1.00,
} as const;

/** Confidence-Score mit Gewichten und Breakdown */
export const ConfidenceScoreSchema = z.object({
  score: z.number().min(0).max(1),
  weights: z.object({
    w1_semantic: z.number().min(0).max(1).default(0.25),
    w2_structural: z.number().min(0).max(1).default(0.2),
    w3_affordance: z.number().min(0).max(1).default(0.2),
    w4_evidence: z.number().min(0).max(1).default(0.15),
    w5_historical: z.number().min(0).max(1).default(0.1),
    w6_ambiguity: z.number().min(0).max(1).default(0.1),
  }),
  breakdown: z.object({
    semanticMatch: z.number().min(0).max(1),
    structuralStability: z.number().min(0).max(1),
    affordanceConsistency: z.number().min(0).max(1),
    evidenceQuality: z.number().min(0).max(1),
    historicalSuccess: z.number().min(0).max(1),
    ambiguityPenalty: z.number().min(0).max(1),
  }),
  evidence: z.array(EvidenceSchema).default([]),
});
export type ConfidenceScore = z.infer<typeof ConfidenceScoreSchema>;

// ============================================================================
// Semantic Fingerprint — Stabiler UI-Hash
// ============================================================================

/** Formularfeld-Signatur fuer Fingerprint */
export const FormFieldSignatureSchema = z.object({
  type: z.enum([
    "text",
    "email",
    "password",
    "number",
    "tel",
    "select",
    "checkbox",
    "radio",
    "textarea",
    "date",
    "file",
    "hidden",
    "unknown",
  ]),
  semanticPurpose: z.string().max(256),
  required: z.boolean(),
  position: z.number().int().nonnegative(),
});
export type FormFieldSignature = z.infer<typeof FormFieldSignatureSchema>;

/** Action-Signatur fuer Fingerprint */
export const ActionSignatureSchema = z.object({
  type: z.enum([
    "submit",
    "cancel",
    "navigate",
    "toggle",
    "delete",
    "download",
  ]),
  label: z.string().max(256),
  isPrimary: z.boolean(),
});
export type ActionSignature = z.infer<typeof ActionSignatureSchema>;

/** Feature-Vektor des Fingerprints */
export const FingerprintFeaturesSchema = z.object({
  // Semantische Features
  semanticRole: z.string().max(256),
  intentSignals: z.array(z.string().max(128)).max(32),
  formFields: z.array(FormFieldSignatureSchema).max(64),
  actionElements: z.array(ActionSignatureSchema).max(32),

  // Strukturelle Features
  domDepth: z.number().int().nonnegative(),
  childCount: z.number().int().nonnegative(),
  interactiveElementCount: z.number().int().nonnegative(),
  headingHierarchy: z.array(z.string().max(512)).max(16),

  // Visuelle Features
  layoutRegion: z.enum([
    "header",
    "main",
    "sidebar",
    "footer",
    "modal",
    "overlay",
  ]),
  approximatePosition: z.object({
    top: z.number().min(0).max(100),
    left: z.number().min(0).max(100),
  }),

  // Textuelle Features
  visibleTextHash: z.string().max(128),
  labelTexts: z.array(z.string().max(256)).max(64),
  buttonTexts: z.array(z.string().max(256)).max(32),
});
export type FingerprintFeatures = z.infer<typeof FingerprintFeaturesSchema>;

/** Semantischer Fingerprint — Stabiler Hash + Feature-Vektor */
export const SemanticFingerprintSchema = z.object({
  hash: z.string().min(64).max(128),
  features: FingerprintFeaturesSchema,
  version: z.number().int().positive(),
  createdAt: z.coerce.date(),
});
export type SemanticFingerprint = z.infer<typeof SemanticFingerprintSchema>;

// ============================================================================
// DOM Anchor — Lokalisierung eines Endpoints im DOM
// ============================================================================

export const DomAnchorSchema = z.object({
  selector: z.string().max(1024).optional(),
  xpath: z.string().max(2048).optional(),
  ariaRole: z.string().max(64).optional(),
  ariaLabel: z.string().max(256).optional(),
  textContent: z.string().max(512).optional(),
  boundingBox: BoundingBoxSchema.optional(),
  fingerprint: z.string().max(256).optional(),
});
export type DomAnchor = z.infer<typeof DomAnchorSchema>;

// ============================================================================
// Affordance — Was kann man mit einem Endpoint tun?
// ============================================================================

export const AffordanceSchema = z.object({
  type: z.enum([
    "click",
    "fill",
    "select",
    "toggle",
    "drag",
    "scroll",
    "upload",
    "submit",
    "navigate",
    "read",
  ]),
  inputSchema: z.record(z.unknown()).optional(),
  expectedOutcome: z.string().max(512),
  sideEffects: z.array(z.string()).max(16),
  reversible: z.boolean(),
  requiresConfirmation: z.boolean().default(false),
});
export type Affordance = z.infer<typeof AffordanceSchema>;

// ============================================================================
// Semantic Label
// ============================================================================

export const SemanticLabelSchema = z.object({
  primary: z.string().min(1).max(128),
  display: z.string().min(1).max(256),
  synonyms: z.array(z.string()).max(16),
  language: z.string().length(2).default("en"),
});
export type SemanticLabel = z.infer<typeof SemanticLabelSchema>;

// ============================================================================
// Endpoint — Semantischer Interaktionspunkt
// ============================================================================

/** Vollstaendiges Endpoint-Objekt (aus MASTERSPEC 2.2) */
export const EndpointSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  siteId: z.string().uuid(),
  url: z.string().url(),
  urlPattern: z.string().max(512).optional(),

  // Semantik
  type: EndpointTypeSchema,
  category: EndpointTypeSchema,
  label: SemanticLabelSchema,
  status: EndpointStatusSchema,
  validation_status: ValidationStatusSchema.default("unvalidated"),
  adapter_type: AdapterTypeSchema.default("browser"),
  provenance: EndpointProvenanceSchema.optional(),
  trust_level: TrustLevelSchema.optional(),

  // Lokalisierung
  anchors: z.array(DomAnchorSchema).min(1).max(32),
  affordances: z.array(AffordanceSchema).min(1).max(16),

  // Bewertung
  confidence: z.number().min(0).max(1),
  confidenceBreakdown: z.object({
    semanticMatch: z.number().min(0).max(1),
    structuralStability: z.number().min(0).max(1),
    affordanceConsistency: z.number().min(0).max(1),
    evidenceQuality: z.number().min(0).max(1),
    historicalSuccess: z.number().min(0).max(1),
    ambiguityPenalty: z.number().min(0).max(1),
  }),
  evidence: z.array(EvidenceSchema).default([]),

  // Risiko
  risk_class: RiskLevelSchema,

  // Fingerprint
  fingerprint: SemanticFingerprintSchema.optional(),

  // Aktionen
  actions: z.array(z.string().max(256)).max(32).default([]),

  // DOM-Anker (primaerer Anker)
  dom_anchor: DomAnchorSchema.optional(),

  // Hierarchie
  parentEndpointId: z.string().uuid().optional(),
  childEndpointIds: z
    .array(z.string().uuid())
    .max(64)
    .default([]),

  // Zeitstempel
  discoveredAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  lastInteractedAt: z.coerce.date().optional(),
  successCount: z.number().int().nonnegative().default(0),
  failureCount: z.number().int().nonnegative().default(0),

  metadata: z.record(z.unknown()).default({}),
});
export type Endpoint = z.infer<typeof EndpointSchema>;

// ============================================================================
// Konstanten
// ============================================================================

/** Default Confidence Weights (MASTERSPEC 1.2) */
export const DEFAULT_CONFIDENCE_WEIGHTS = {
  w1_semantic: 0.25,
  w2_structural: 0.2,
  w3_affordance: 0.2,
  w4_evidence: 0.15,
  w5_historical: 0.1,
  w6_ambiguity: 0.1,
} as const;

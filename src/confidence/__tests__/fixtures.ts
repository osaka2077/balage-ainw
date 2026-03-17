/**
 * Test-Fixtures fuer Confidence Engine Tests
 */

import type { Endpoint, Evidence, SemanticFingerprint } from "../../../shared_interfaces.js";

const NOW = new Date("2026-03-17T10:00:00Z");

/** Login-Endpoint mit klarer Evidence */
export const LOGIN_ENDPOINT: Endpoint = {
  id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  version: 1,
  siteId: "11111111-1111-1111-1111-111111111111",
  url: "https://example.com/login",
  type: "auth",
  category: "auth",
  label: {
    primary: "login",
    display: "Login Form",
    synonyms: ["sign in", "authentication"],
    language: "en",
  },
  status: "verified",
  validation_status: "fully_verified",
  anchors: [
    {
      selector: "form#login-form",
      ariaRole: "form",
      ariaLabel: "Login",
      textContent: "Sign in to your account",
    },
    {
      selector: "input[type=password]",
      ariaRole: "textbox",
      ariaLabel: "Password",
    },
    {
      selector: "input[type=email]",
      ariaRole: "textbox",
      ariaLabel: "Email address",
    },
  ],
  affordances: [
    {
      type: "fill",
      expectedOutcome: "Email und Passwort eingeben",
      sideEffects: [],
      reversible: true,
      requiresConfirmation: false,
    },
    {
      type: "submit",
      expectedOutcome: "Login absenden",
      sideEffects: ["session_created"],
      reversible: false,
      requiresConfirmation: false,
    },
  ],
  confidence: 0.9,
  confidenceBreakdown: {
    semanticMatch: 0.95,
    structuralStability: 0.85,
    affordanceConsistency: 1.0,
    evidenceQuality: 0.8,
    historicalSuccess: 0.7,
    ambiguityPenalty: 0.0,
  },
  evidence: [],
  risk_class: "high",
  fingerprint: {
    hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    features: {
      semanticRole: "auth-form",
      intentSignals: ["login", "sign in", "password"],
      formFields: [
        { type: "email", semanticPurpose: "email", required: true, position: 0 },
        { type: "password", semanticPurpose: "password", required: true, position: 1 },
      ],
      actionElements: [
        { type: "submit", label: "Sign In", isPrimary: true },
      ],
      domDepth: 5,
      childCount: 4,
      interactiveElementCount: 3,
      headingHierarchy: ["Sign In"],
      layoutRegion: "main",
      approximatePosition: { top: 30, left: 50 },
      visibleTextHash: "abc123",
      labelTexts: ["Email", "Password"],
      buttonTexts: ["Sign In"],
    },
    version: 2,
    createdAt: NOW,
  },
  actions: ["fill_email", "fill_password", "submit"],
  discoveredAt: NOW,
  lastSeenAt: NOW,
  successCount: 8,
  failureCount: 2,
  childEndpointIds: [],
  metadata: {},
};

/** Navigation-Endpoint */
export const NAVIGATION_ENDPOINT: Endpoint = {
  id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  version: 1,
  siteId: "11111111-1111-1111-1111-111111111111",
  url: "https://example.com",
  type: "navigation",
  category: "navigation",
  label: {
    primary: "main navigation",
    display: "Main Navigation",
    synonyms: ["nav", "menu"],
    language: "en",
  },
  status: "verified",
  validation_status: "fully_verified",
  anchors: [
    {
      selector: "nav.main-nav",
      ariaRole: "navigation",
      ariaLabel: "Main navigation",
    },
  ],
  affordances: [
    {
      type: "click",
      expectedOutcome: "Navigate to section",
      sideEffects: ["page_change"],
      reversible: true,
      requiresConfirmation: false,
    },
    {
      type: "navigate",
      expectedOutcome: "Follow link",
      sideEffects: ["page_change"],
      reversible: true,
      requiresConfirmation: false,
    },
  ],
  confidence: 0.85,
  confidenceBreakdown: {
    semanticMatch: 0.9,
    structuralStability: 0.9,
    affordanceConsistency: 1.0,
    evidenceQuality: 0.7,
    historicalSuccess: 0.5,
    ambiguityPenalty: 0.0,
  },
  evidence: [],
  risk_class: "low",
  discoveredAt: NOW,
  lastSeenAt: NOW,
  successCount: 0,
  failureCount: 0,
  childEndpointIds: [],
  actions: [],
  metadata: {},
};

/** Endpoint ohne Evidence (fuer Edge Case Tests) */
export const BARE_ENDPOINT: Endpoint = {
  id: "c3d4e5f6-a7b8-9012-cdef-123456789012",
  version: 1,
  siteId: "11111111-1111-1111-1111-111111111111",
  url: "https://example.com/unknown",
  type: "content",
  category: "content",
  label: {
    primary: "unknown",
    display: "Unknown Content",
    synonyms: [],
    language: "en",
  },
  status: "discovered",
  validation_status: "unvalidated",
  anchors: [
    { selector: "div.content" },
  ],
  affordances: [
    {
      type: "read",
      expectedOutcome: "Content lesen",
      sideEffects: [],
      reversible: true,
      requiresConfirmation: false,
    },
  ],
  confidence: 0.3,
  confidenceBreakdown: {
    semanticMatch: 0.2,
    structuralStability: 0.5,
    affordanceConsistency: 0.3,
    evidenceQuality: 0.0,
    historicalSuccess: 0.5,
    ambiguityPenalty: 0.0,
  },
  evidence: [],
  risk_class: "low",
  discoveredAt: NOW,
  lastSeenAt: NOW,
  successCount: 0,
  failureCount: 0,
  childEndpointIds: [],
  actions: [],
  metadata: {},
};

/** Ambiguoser Endpoint (gleicher Fingerprint wie Login) */
export const AMBIGUOUS_ENDPOINT: Endpoint = {
  ...LOGIN_ENDPOINT,
  id: "d4e5f6a7-b8c9-0123-defa-234567890123",
  label: {
    primary: "register",
    display: "Registration Form",
    synonyms: ["sign up"],
    language: "en",
  },
};

/** Realistische Evidence fuer Login */
export const LOGIN_EVIDENCE: Evidence[] = [
  {
    type: "structural_pattern",
    signal: "DOM selector: form#login-form",
    weight: 0.7,
    source: "dom",
  },
  {
    type: "aria_role",
    signal: "ARIA role: form",
    weight: 0.8,
    source: "aria",
  },
  {
    type: "text_content",
    signal: "Text: Sign in to your account",
    weight: 0.6,
    source: "dom",
  },
  {
    type: "semantic_label",
    signal: "Label: login",
    weight: 0.85,
    source: "dom",
  },
];

/** Leere Evidence */
export const EMPTY_EVIDENCE: Evidence[] = [];

/** Fingerprint-Historie (stabil) */
export const STABLE_FINGERPRINT_HISTORY: SemanticFingerprint[] = [
  LOGIN_ENDPOINT.fingerprint!,
  LOGIN_ENDPOINT.fingerprint!,
  LOGIN_ENDPOINT.fingerprint!,
];

/** Fingerprint-Historie (instabil) */
export const UNSTABLE_FINGERPRINT_HISTORY: SemanticFingerprint[] = [
  {
    hash: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    features: {
      ...LOGIN_ENDPOINT.fingerprint!.features,
      semanticRole: "checkout-form",
      domDepth: 12,
      interactiveElementCount: 15,
    },
    version: 2,
    createdAt: new Date("2026-03-10T10:00:00Z"),
  },
];

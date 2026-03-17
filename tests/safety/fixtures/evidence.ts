/**
 * Safety Tests — Evidence-Fixtures
 *
 * Verschiedene Evidence-Arrays fuer unterschiedliche Szenarien.
 */

import type { Evidence } from "../../../shared_interfaces.js";

// ============================================================================
// Starke, konsistente Navigation-Evidence
// ============================================================================
export const STRONG_NAVIGATION_EVIDENCE: Evidence[] = [
  {
    type: "semantic_label",
    signal: "Label: main navigation menu",
    weight: 0.9,
    detail: "Primary label matches navigation pattern",
    source: "dom",
  },
  {
    type: "aria_role",
    signal: "ARIA role: navigation",
    weight: 0.95,
    detail: "Explicit navigation landmark role",
    source: "aria",
  },
  {
    type: "structural_pattern",
    signal: "DOM selector: nav.main-nav with link children",
    weight: 0.85,
    detail: "Semantic nav element with anchor children",
    source: "dom",
  },
  {
    type: "text_content",
    signal: "Text: Home Products About Contact",
    weight: 0.7,
    detail: "Typical navigation link text pattern",
    source: "dom",
  },
  {
    type: "layout_position",
    signal: "Position: top-center header region",
    weight: 0.6,
    detail: "Navigation typically in header area",
    source: "dom",
  },
];

// ============================================================================
// Starke Form-Submit Evidence
// ============================================================================
export const STRONG_FORM_EVIDENCE: Evidence[] = [
  {
    type: "semantic_label",
    signal: "Label: contact form",
    weight: 0.85,
    detail: "Form label indicates contact purpose",
    source: "dom",
  },
  {
    type: "aria_role",
    signal: "ARIA role: form",
    weight: 0.9,
    detail: "Explicit form role",
    source: "aria",
  },
  {
    type: "structural_pattern",
    signal: "DOM: form with input[email], textarea, button[submit]",
    weight: 0.8,
    detail: "Classic contact form structure",
    source: "dom",
  },
  {
    type: "text_content",
    signal: "Text: Send us a message",
    weight: 0.7,
    detail: "Submit CTA matches form purpose",
    source: "dom",
  },
];

// ============================================================================
// Starke Checkout/Payment Evidence
// ============================================================================
export const STRONG_CHECKOUT_EVIDENCE: Evidence[] = [
  {
    type: "semantic_label",
    signal: "Label: checkout payment",
    weight: 0.95,
    detail: "Unambiguous checkout label",
    source: "dom",
  },
  {
    type: "aria_role",
    signal: "ARIA role: form",
    weight: 0.85,
    detail: "Payment form role",
    source: "aria",
  },
  {
    type: "structural_pattern",
    signal: "DOM: form with card-number, expiry, cvv inputs",
    weight: 0.9,
    detail: "Credit card form field pattern",
    source: "dom",
  },
  {
    type: "text_content",
    signal: "Text: Pay $49.99 — Complete your purchase",
    weight: 0.9,
    detail: "Price and purchase CTA",
    source: "dom",
  },
  {
    type: "llm_inference",
    signal: "LLM: High confidence checkout page (99%)",
    weight: 0.92,
    detail: "LLM classification as checkout",
    source: "llm",
  },
];

// ============================================================================
// Leere Evidence — fuer Edge Cases
// ============================================================================
export const EMPTY_EVIDENCE: Evidence[] = [];

// ============================================================================
// Minimale Evidence — nur 1 Eintrag
// ============================================================================
export const MINIMAL_EVIDENCE: Evidence[] = [
  {
    type: "text_content",
    signal: "Text: some content",
    weight: 0.3,
    source: "dom",
  },
];

// ============================================================================
// Widerspruchliche Evidence — Login vs. Register
// ============================================================================
export const CONTRADICTORY_EVIDENCE: Evidence[] = [
  {
    type: "semantic_label",
    signal: "Label: login form — Sign in to your account",
    weight: 0.85,
    detail: "Strong login signal",
    source: "dom",
  },
  {
    type: "aria_role",
    signal: "ARIA role: register — Create new account",
    weight: 0.8,
    detail: "Registration signal contradicts login",
    source: "aria",
  },
  {
    type: "text_content",
    signal: "Text: Sign up for free",
    weight: 0.75,
    detail: "Registration CTA found",
    source: "dom",
  },
  {
    type: "structural_pattern",
    signal: "DOM: form with login fields",
    weight: 0.7,
    source: "dom",
  },
];

// ============================================================================
// Perfekte Evidence — Maximal stark und konsistent
// ============================================================================
export const PERFECT_EVIDENCE: Evidence[] = [
  {
    type: "semantic_label",
    signal: "Label: confirmed action",
    weight: 0.99,
    source: "dom",
  },
  {
    type: "aria_role",
    signal: "ARIA role: confirmed action",
    weight: 0.99,
    source: "aria",
  },
  {
    type: "structural_pattern",
    signal: "DOM: confirmed action pattern",
    weight: 0.99,
    source: "dom",
  },
  {
    type: "text_content",
    signal: "Text: confirmed action",
    weight: 0.99,
    source: "dom",
  },
  {
    type: "verification_proof",
    signal: "Verification: confirmed action verified",
    weight: 1.0,
    source: "operator",
  },
];

// ============================================================================
// Schwache Evidence — Niedriges Gewicht
// ============================================================================
export const WEAK_EVIDENCE: Evidence[] = [
  {
    type: "text_content",
    signal: "Text: unclear content",
    weight: 0.2,
    source: "dom",
  },
  {
    type: "layout_position",
    signal: "Position: unknown region",
    weight: 0.15,
    source: "dom",
  },
];

// ============================================================================
// Auth Evidence — fuer Login-Endpoint
// ============================================================================
export const AUTH_EVIDENCE: Evidence[] = [
  {
    type: "semantic_label",
    signal: "Label: login",
    weight: 0.9,
    detail: "Login form label",
    source: "dom",
  },
  {
    type: "aria_role",
    signal: "ARIA role: form with password field",
    weight: 0.85,
    detail: "Form with password input",
    source: "aria",
  },
  {
    type: "structural_pattern",
    signal: "DOM: form#login-form",
    weight: 0.8,
    detail: "Login form selector",
    source: "dom",
  },
  {
    type: "text_content",
    signal: "Text: Sign in to your account",
    weight: 0.75,
    detail: "Login CTA text",
    source: "dom",
  },
];

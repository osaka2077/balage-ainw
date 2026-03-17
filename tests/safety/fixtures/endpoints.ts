/**
 * Safety Tests — Realistische Endpoint-Fixtures
 *
 * Alle IDs sind valide UUIDs, URLs realistisch, Evidence plausibel.
 */

import type { Endpoint } from "../../../shared_interfaces.js";

const NOW = new Date("2026-03-17T12:00:00Z");

// ============================================================================
// Navigation Endpoint — LOW Risk, hohe Confidence erwartet
// ============================================================================
export const NAVIGATION_ENDPOINT: Endpoint = {
  id: "11111111-aaaa-4aaa-aaaa-111111111111",
  version: 1,
  siteId: "00000000-0000-4000-8000-000000000001",
  url: "https://shop.example.com",
  type: "navigation",
  category: "navigation",
  label: {
    primary: "main navigation menu",
    display: "Main Navigation",
    synonyms: ["nav", "menu"],
    language: "en",
  },
  status: "verified",
  anchors: [
    {
      selector: "nav.main-nav",
      ariaRole: "navigation",
      ariaLabel: "Main navigation menu",
      textContent: "Home Products About Contact",
    },
    {
      selector: "a.nav-link",
      ariaRole: "link",
      ariaLabel: "Navigation link",
      textContent: "href to products",
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
      expectedOutcome: "Follow link to target page",
      sideEffects: ["url_change"],
      reversible: true,
      requiresConfirmation: false,
    },
  ],
  confidence: 0.92,
  confidenceBreakdown: {
    semanticMatch: 0.95,
    structuralStability: 0.90,
    affordanceConsistency: 1.0,
    evidenceQuality: 0.85,
    historicalSuccess: 0.80,
    ambiguityPenalty: 0.0,
  },
  evidence: [],
  risk_class: "low",
  fingerprint: {
    hash: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
    features: {
      semanticRole: "navigation",
      intentSignals: ["navigate", "menu", "link"],
      formFields: [],
      actionElements: [
        { type: "navigate", label: "Products", isPrimary: true },
      ],
      domDepth: 3,
      childCount: 5,
      interactiveElementCount: 5,
      headingHierarchy: [],
      layoutRegion: "header",
      approximatePosition: { top: 5, left: 50 },
      visibleTextHash: "nav-hash-001",
      labelTexts: ["Home", "Products", "About", "Contact"],
      buttonTexts: [],
    },
    version: 2,
    createdAt: NOW,
  },
  actions: ["navigate_home", "navigate_products"],
  discoveredAt: NOW,
  lastSeenAt: NOW,
  successCount: 15,
  failureCount: 0,
  childEndpointIds: [],
  metadata: {},
};

// ============================================================================
// Form Endpoint — MEDIUM/HIGH Risk, soll ALLOW bei guter Confidence
// ============================================================================
export const FORM_ENDPOINT: Endpoint = {
  id: "22222222-bbbb-4bbb-bbbb-222222222222",
  version: 1,
  siteId: "00000000-0000-4000-8000-000000000001",
  url: "https://shop.example.com/contact",
  type: "form",
  category: "form",
  label: {
    primary: "contact form",
    display: "Contact Form",
    synonyms: ["inquiry form", "contact us"],
    language: "en",
  },
  status: "verified",
  anchors: [
    {
      selector: "form#contact-form",
      ariaRole: "form",
      ariaLabel: "Contact form",
      textContent: "Send us a message",
    },
    {
      selector: "input[name=email]",
      ariaRole: "textbox",
      ariaLabel: "Email",
    },
    {
      selector: "textarea[name=message]",
      ariaRole: "textbox",
      ariaLabel: "Message",
    },
  ],
  affordances: [
    {
      type: "fill",
      expectedOutcome: "Fill in contact details",
      sideEffects: [],
      reversible: true,
      requiresConfirmation: false,
    },
    {
      type: "submit",
      expectedOutcome: "Send contact form",
      sideEffects: ["email_sent"],
      reversible: false,
      requiresConfirmation: false,
    },
  ],
  confidence: 0.88,
  confidenceBreakdown: {
    semanticMatch: 0.90,
    structuralStability: 0.85,
    affordanceConsistency: 1.0,
    evidenceQuality: 0.80,
    historicalSuccess: 0.85,
    ambiguityPenalty: 0.0,
  },
  evidence: [],
  risk_class: "medium",
  fingerprint: {
    hash: "bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222",
    features: {
      semanticRole: "contact-form",
      intentSignals: ["contact", "message", "email"],
      formFields: [
        { type: "email", semanticPurpose: "email", required: true, position: 0 },
        { type: "text", semanticPurpose: "name", required: true, position: 1 },
        { type: "textarea", semanticPurpose: "message", required: true, position: 2 },
      ],
      actionElements: [
        { type: "submit", label: "Send Message", isPrimary: true },
      ],
      domDepth: 4,
      childCount: 6,
      interactiveElementCount: 4,
      headingHierarchy: ["Contact Us"],
      layoutRegion: "main",
      approximatePosition: { top: 40, left: 50 },
      visibleTextHash: "form-hash-001",
      labelTexts: ["Name", "Email", "Message"],
      buttonTexts: ["Send Message"],
    },
    version: 2,
    createdAt: NOW,
  },
  actions: ["fill_name", "fill_email", "fill_message", "submit"],
  discoveredAt: NOW,
  lastSeenAt: NOW,
  successCount: 10,
  failureCount: 1,
  childEndpointIds: [],
  metadata: {},
};

// ============================================================================
// Checkout Endpoint — CRITICAL Risk (payment), immer ESCALATE
// ============================================================================
export const CHECKOUT_ENDPOINT: Endpoint = {
  id: "33333333-cccc-4ccc-cccc-333333333333",
  version: 1,
  siteId: "00000000-0000-4000-8000-000000000001",
  url: "https://shop.example.com/checkout",
  type: "checkout",
  category: "checkout",
  label: {
    primary: "checkout payment",
    display: "Checkout — Payment",
    synonyms: ["pay", "purchase", "buy"],
    language: "en",
  },
  status: "verified",
  anchors: [
    {
      selector: "form#payment-form",
      ariaRole: "form",
      ariaLabel: "Payment form",
      textContent: "Complete your purchase — Total: $49.99",
    },
    {
      selector: "input[name=card-number]",
      ariaRole: "textbox",
      ariaLabel: "Card number",
    },
    {
      selector: "button.pay-now",
      ariaRole: "button",
      ariaLabel: "Pay now",
      textContent: "Pay $49.99",
    },
  ],
  affordances: [
    {
      type: "fill",
      expectedOutcome: "Enter payment details",
      sideEffects: [],
      reversible: true,
      requiresConfirmation: false,
    },
    {
      type: "submit",
      expectedOutcome: "Process payment",
      sideEffects: ["charge_card", "create_order"],
      reversible: false,
      requiresConfirmation: true,
    },
  ],
  confidence: 0.99,
  confidenceBreakdown: {
    semanticMatch: 1.0,
    structuralStability: 0.95,
    affordanceConsistency: 1.0,
    evidenceQuality: 1.0,
    historicalSuccess: 0.95,
    ambiguityPenalty: 0.0,
  },
  evidence: [],
  risk_class: "critical",
  fingerprint: {
    hash: "cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333",
    features: {
      semanticRole: "checkout-form",
      intentSignals: ["payment", "buy", "purchase", "order", "total"],
      formFields: [
        { type: "text", semanticPurpose: "card_number", required: true, position: 0 },
        { type: "text", semanticPurpose: "expiry", required: true, position: 1 },
        { type: "text", semanticPurpose: "cvv", required: true, position: 2 },
      ],
      actionElements: [
        { type: "submit", label: "Pay $49.99", isPrimary: true },
        { type: "cancel", label: "Cancel", isPrimary: false },
      ],
      domDepth: 6,
      childCount: 10,
      interactiveElementCount: 5,
      headingHierarchy: ["Checkout", "Payment"],
      layoutRegion: "main",
      approximatePosition: { top: 30, left: 50 },
      visibleTextHash: "checkout-hash-001",
      labelTexts: ["Card Number", "Expiry", "CVV"],
      buttonTexts: ["Pay $49.99", "Cancel"],
    },
    version: 2,
    createdAt: NOW,
  },
  actions: ["fill_card", "fill_expiry", "fill_cvv", "submit_payment"],
  discoveredAt: NOW,
  lastSeenAt: NOW,
  successCount: 5,
  failureCount: 0,
  childEndpointIds: [],
  metadata: {},
};

// ============================================================================
// Auth/Settings Endpoint — fuer Passwort-Aenderung und Account-Loeschung
// ============================================================================
export const SETTINGS_ENDPOINT: Endpoint = {
  id: "44444444-dddd-4ddd-dddd-444444444444",
  version: 1,
  siteId: "00000000-0000-4000-8000-000000000001",
  url: "https://shop.example.com/settings/account",
  type: "settings",
  category: "settings",
  label: {
    primary: "account settings",
    display: "Account Settings",
    synonyms: ["preferences", "config"],
    language: "en",
  },
  status: "verified",
  anchors: [
    {
      selector: "form#account-settings",
      ariaRole: "form",
      ariaLabel: "Account settings",
      textContent: "Manage your account settings",
    },
    {
      selector: "button.delete-account",
      ariaRole: "button",
      ariaLabel: "Delete account",
      textContent: "Delete my account",
    },
  ],
  affordances: [
    {
      type: "fill",
      expectedOutcome: "Change account settings",
      sideEffects: [],
      reversible: true,
      requiresConfirmation: false,
    },
    {
      type: "click",
      expectedOutcome: "Delete account",
      sideEffects: ["account_deleted"],
      reversible: false,
      requiresConfirmation: true,
    },
  ],
  confidence: 0.95,
  confidenceBreakdown: {
    semanticMatch: 0.95,
    structuralStability: 0.90,
    affordanceConsistency: 0.90,
    evidenceQuality: 0.95,
    historicalSuccess: 0.90,
    ambiguityPenalty: 0.0,
  },
  evidence: [],
  risk_class: "high",
  fingerprint: {
    hash: "dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444",
    features: {
      semanticRole: "account-settings",
      intentSignals: ["settings", "preferences", "account", "delete"],
      formFields: [
        { type: "password", semanticPurpose: "current_password", required: true, position: 0 },
        { type: "password", semanticPurpose: "new_password", required: true, position: 1 },
      ],
      actionElements: [
        { type: "submit", label: "Save Changes", isPrimary: true },
        { type: "delete", label: "Delete Account", isPrimary: false },
      ],
      domDepth: 5,
      childCount: 8,
      interactiveElementCount: 5,
      headingHierarchy: ["Account Settings"],
      layoutRegion: "main",
      approximatePosition: { top: 25, left: 50 },
      visibleTextHash: "settings-hash-001",
      labelTexts: ["Current Password", "New Password"],
      buttonTexts: ["Save Changes", "Delete Account"],
    },
    version: 2,
    createdAt: NOW,
  },
  actions: ["fill_password", "change_password", "delete_account"],
  discoveredAt: NOW,
  lastSeenAt: NOW,
  successCount: 12,
  failureCount: 0,
  childEndpointIds: [],
  metadata: {},
};

// ============================================================================
// Bare/Unknown Endpoint — Minimal, kaum Evidence, niedrige Confidence
// ============================================================================
export const BARE_ENDPOINT: Endpoint = {
  id: "55555555-eeee-4eee-eeee-555555555555",
  version: 1,
  siteId: "00000000-0000-4000-8000-000000000001",
  url: "https://unknown-site.example.com/page",
  type: "content",
  category: "content",
  label: {
    primary: "unknown",
    display: "Unknown Page",
    synonyms: [],
    language: "en",
  },
  status: "discovered",
  anchors: [
    { selector: "div.content-area" },
  ],
  affordances: [
    {
      type: "read",
      expectedOutcome: "View content",
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

// ============================================================================
// Login Endpoint — Auth, HIGH Risk (form_submit auf auth = HIGH)
// ============================================================================
export const LOGIN_ENDPOINT: Endpoint = {
  id: "66666666-ffff-4fff-ffff-666666666666",
  version: 1,
  siteId: "00000000-0000-4000-8000-000000000001",
  url: "https://shop.example.com/login",
  type: "auth",
  category: "auth",
  label: {
    primary: "login",
    display: "Login Form",
    synonyms: ["sign in", "authentication"],
    language: "en",
  },
  status: "verified",
  anchors: [
    {
      selector: "form#login-form",
      ariaRole: "form",
      ariaLabel: "Login",
      textContent: "Sign in to your account",
    },
    {
      selector: "input[type=email]",
      ariaRole: "textbox",
      ariaLabel: "Email address",
    },
    {
      selector: "input[type=password]",
      ariaRole: "textbox",
      ariaLabel: "Password",
    },
  ],
  affordances: [
    {
      type: "fill",
      expectedOutcome: "Enter email and password",
      sideEffects: [],
      reversible: true,
      requiresConfirmation: false,
    },
    {
      type: "submit",
      expectedOutcome: "Submit login form",
      sideEffects: ["session_created"],
      reversible: false,
      requiresConfirmation: false,
    },
  ],
  confidence: 0.92,
  confidenceBreakdown: {
    semanticMatch: 0.95,
    structuralStability: 0.85,
    affordanceConsistency: 1.0,
    evidenceQuality: 0.90,
    historicalSuccess: 0.80,
    ambiguityPenalty: 0.0,
  },
  evidence: [],
  risk_class: "high",
  fingerprint: {
    hash: "ffff6666ffff6666ffff6666ffff6666ffff6666ffff6666ffff6666ffff6666",
    features: {
      semanticRole: "auth-form",
      intentSignals: ["login", "sign in", "password", "email"],
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
      visibleTextHash: "login-hash-001",
      labelTexts: ["Email", "Password"],
      buttonTexts: ["Sign In"],
    },
    version: 2,
    createdAt: NOW,
  },
  actions: ["fill_email", "fill_password", "submit"],
  discoveredAt: NOW,
  lastSeenAt: NOW,
  successCount: 10,
  failureCount: 1,
  childEndpointIds: [],
  metadata: {},
};

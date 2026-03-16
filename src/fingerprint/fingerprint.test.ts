import { describe, it, expect } from "vitest";
import type { UISegment } from "./types.js";
import {
  extractFeatures,
  extractFormFields,
  extractActionElements,
} from "./feature-extractor.js";
import {
  calculateFingerprint,
  hashFeatures,
} from "./fingerprint-calculator.js";
import { calculateSimilarity } from "./similarity.js";
import { FingerprintStore } from "./fingerprint-store.js";
import { detectDrift } from "./drift-detector.js";

// ============================================================================
// Fixtures — Realistische UISegments
// ============================================================================

const LOGIN_SEGMENT: UISegment = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  type: "form",
  label: "Login Form",
  confidence: 0.95,
  boundingBox: { x: 400, y: 200, width: 480, height: 350 },
  interactiveElementCount: 3,
  semanticRole: "form",
  nodes: [
    {
      tagName: "form",
      attributes: { action: "/login", method: "POST" },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 400, y: 200, width: 480, height: 350 },
      children: [
        {
          tagName: "h2",
          attributes: {},
          textContent: "Login",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "label",
          attributes: { for: "email" },
          textContent: "Email",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "input",
          attributes: {
            type: "email",
            name: "email",
            placeholder: "Enter your email",
            required: "",
          },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "label",
          attributes: { for: "password" },
          textContent: "Password",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "input",
          attributes: {
            type: "password",
            name: "password",
            placeholder: "Enter your password",
            required: "",
          },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "button",
          attributes: { type: "submit" },
          textContent: "Login",
          isVisible: true,
          isInteractive: true,
          boundingBox: { x: 450, y: 480, width: 380, height: 40 },
          children: [],
        },
      ],
    },
  ],
};

const NAV_SEGMENT: UISegment = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  type: "navigation",
  label: "Main Navigation",
  confidence: 0.9,
  boundingBox: { x: 0, y: 0, width: 1280, height: 60 },
  interactiveElementCount: 5,
  semanticRole: "navigation",
  nodes: [
    {
      tagName: "nav",
      attributes: { "aria-label": "Main navigation" },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 0, y: 0, width: 1280, height: 60 },
      children: [
        {
          tagName: "a",
          attributes: { href: "/" },
          textContent: "Home",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "a",
          attributes: { href: "/products" },
          textContent: "Products",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "a",
          attributes: { href: "/about" },
          textContent: "About",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "a",
          attributes: { href: "/contact" },
          textContent: "Contact",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "a",
          attributes: { href: "/login" },
          textContent: "Sign In",
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    },
  ],
};

const CHECKOUT_SEGMENT: UISegment = {
  id: "550e8400-e29b-41d4-a716-446655440003",
  type: "form",
  label: "Checkout Form",
  confidence: 0.92,
  boundingBox: { x: 300, y: 150, width: 680, height: 500 },
  interactiveElementCount: 6,
  semanticRole: "form",
  nodes: [
    {
      tagName: "form",
      attributes: { action: "/checkout", method: "POST" },
      isVisible: true,
      isInteractive: false,
      boundingBox: { x: 300, y: 150, width: 680, height: 500 },
      children: [
        {
          tagName: "h2",
          attributes: {},
          textContent: "Checkout",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "label",
          attributes: {},
          textContent: "Full Name",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "input",
          attributes: {
            type: "text",
            name: "fullName",
            placeholder: "John Doe",
          },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "label",
          attributes: {},
          textContent: "Email",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "input",
          attributes: {
            type: "email",
            name: "email",
            placeholder: "john@example.com",
          },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "label",
          attributes: {},
          textContent: "Address",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "textarea",
          attributes: {
            name: "address",
            placeholder: "Shipping address",
          },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "label",
          attributes: {},
          textContent: "Card Number",
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: "input",
          attributes: {
            type: "number",
            name: "cardNumber",
            placeholder: "4242 4242 4242 4242",
          },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "input",
          attributes: { type: "date", name: "expiry" },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: "button",
          attributes: { type: "submit" },
          textContent: "Pay Now",
          isVisible: true,
          isInteractive: true,
          boundingBox: { x: 400, y: 600, width: 480, height: 50 },
          children: [],
        },
      ],
    },
  ],
};

const EMPTY_SEGMENT: UISegment = {
  id: "550e8400-e29b-41d4-a716-446655440004",
  type: "unknown",
  confidence: 0.5,
  boundingBox: { x: 0, y: 0, width: 100, height: 100 },
  interactiveElementCount: 0,
  nodes: [
    {
      tagName: "div",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      children: [],
    },
  ],
};

// ============================================================================
// Tests
// ============================================================================

describe("FeatureExtractor", () => {
  it("extracts correct formFields and actionElements from login form", () => {
    const features = extractFeatures(LOGIN_SEGMENT);

    expect(features.formFields).toHaveLength(2);
    expect(features.formFields[0]!.type).toBe("email");
    expect(features.formFields[0]!.required).toBe(true);
    expect(features.formFields[1]!.type).toBe("password");
    expect(features.formFields[1]!.required).toBe(true);

    const submitActions = features.actionElements.filter(
      (a) => a.type === "submit",
    );
    expect(submitActions.length).toBeGreaterThanOrEqual(1);
    expect(submitActions[0]!.isPrimary).toBe(true);
    expect(submitActions[0]!.label).toBe("Login");
  });

  it("extracts correct intentSignals and headingHierarchy from navigation", () => {
    const features = extractFeatures(NAV_SEGMENT);

    expect(features.intentSignals).toContain("home");
    expect(features.intentSignals).toContain("products");
    expect(features.intentSignals).toContain("sign in");

    // Nav hat keine h1-h6 Headings
    expect(features.headingHierarchy).toHaveLength(0);
  });

  it("correctly takes interactiveElementCount from segment", () => {
    const loginFeatures = extractFeatures(LOGIN_SEGMENT);
    expect(loginFeatures.interactiveElementCount).toBe(3);

    const navFeatures = extractFeatures(NAV_SEGMENT);
    expect(navFeatures.interactiveElementCount).toBe(5);
  });
});

describe("FingerprintCalculator", () => {
  it("produces deterministic hash over 100 iterations", () => {
    const features = extractFeatures(LOGIN_SEGMENT);
    const firstHash = hashFeatures(features);

    for (let i = 0; i < 100; i++) {
      expect(hashFeatures(features)).toBe(firstHash);
    }
  });

  it("produces different hashes for different inputs", () => {
    const loginFeatures = extractFeatures(LOGIN_SEGMENT);
    const checkoutFeatures = extractFeatures(CHECKOUT_SEGMENT);

    expect(hashFeatures(loginFeatures)).not.toBe(
      hashFeatures(checkoutFeatures),
    );
  });
});

describe("Similarity", () => {
  it("returns 1.0 for identical fingerprints", () => {
    const features = extractFeatures(LOGIN_SEGMENT);
    const fp = calculateFingerprint(features);

    const result = calculateSimilarity(fp, fp);
    expect(result.score).toBe(1);
  });

  it("returns similarity > 0.3 and < 0.8 for login vs checkout", () => {
    const loginFp = calculateFingerprint(
      extractFeatures(LOGIN_SEGMENT),
    );
    const checkoutFp = calculateFingerprint(
      extractFeatures(CHECKOUT_SEGMENT),
    );

    const result = calculateSimilarity(loginFp, checkoutFp);
    expect(result.score).toBeGreaterThan(0.3);
    expect(result.score).toBeLessThan(0.8);
  });
});

describe("FingerprintStore", () => {
  it("evicts LRU entry when maxSize is reached", () => {
    const store = new FingerprintStore({ maxSize: 3 });

    const fp1 = calculateFingerprint(extractFeatures(LOGIN_SEGMENT));
    const fp2 = calculateFingerprint(extractFeatures(NAV_SEGMENT));
    const fp3 = calculateFingerprint(
      extractFeatures(CHECKOUT_SEGMENT),
    );

    // Vierter Fingerprint mit leicht anderen Features
    const modifiedFeatures = {
      ...extractFeatures(LOGIN_SEGMENT),
      domDepth: 99,
    };
    const fp4 = calculateFingerprint(modifiedFeatures);

    store.store("site1", "https://example.com/1", fp1);
    store.store("site1", "https://example.com/2", fp2);
    store.store("site1", "https://example.com/3", fp3);

    expect(store.size()).toBe(3);

    // fp2 und fp3 abrufen — fp1 wird LRU
    store.get(fp2.hash);
    store.get(fp3.hash);

    store.store("site1", "https://example.com/4", fp4);

    expect(store.size()).toBe(3);
    expect(store.get(fp1.hash)).toBeUndefined();
    expect(store.get(fp2.hash)).toBeDefined();
    expect(store.get(fp3.hash)).toBeDefined();
    expect(store.get(fp4.hash)).toBeDefined();
  });
});

describe("DriftDetector", () => {
  it("returns ignore level for identical fingerprints", () => {
    const fp = calculateFingerprint(extractFeatures(LOGIN_SEGMENT));

    const result = detectDrift(fp, fp);
    expect(result.level).toBe("ignore");
    expect(result.driftScore).toBeCloseTo(0, 1);
  });

  it("returns invalidate level for strongly different fingerprints", () => {
    const loginFp = calculateFingerprint(
      extractFeatures(LOGIN_SEGMENT),
    );
    const navFp = calculateFingerprint(
      extractFeatures(NAV_SEGMENT),
    );

    const result = detectDrift(loginFp, navFp);
    expect(result.level).toBe("invalidate");
    expect(result.driftScore).toBeGreaterThan(0.3);
  });
});

describe("Error Cases", () => {
  it("handles minimal segment without crashing", () => {
    const result = extractFeatures(EMPTY_SEGMENT);

    expect(result.formFields).toHaveLength(0);
    expect(result.actionElements).toHaveLength(0);
    expect(result.intentSignals).toHaveLength(0);
    expect(result.semanticRole).toBe("region");

    // Fingerprint-Berechnung funktioniert auch
    const fp = calculateFingerprint(result);
    expect(fp.hash).toHaveLength(64);
  });
});

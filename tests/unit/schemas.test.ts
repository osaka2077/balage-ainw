/**
 * Schema-Validierungstests fuer Zod-Schemas (dom.ts, endpoint.ts, segment.ts).
 *
 * Testet gueltige Inputs (parse) und ungueltige Inputs (safeParse rejected).
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  BoundingBoxSchema,
  DomNodeSchema,
  AccessibilityNodeSchema,
} from "../../src/schemas/dom.js";
import {
  EndpointTypeSchema,
  RiskLevelSchema,
  EndpointStatusSchema,
  EvidenceSchema,
  AffordanceSchema,
  SemanticLabelSchema,
  DomAnchorSchema,
  EndpointSchema,
  ValidationStatusSchema,
} from "../../src/schemas/endpoint.js";
import {
  UISegmentTypeSchema,
  UISegmentSchema,
} from "../../src/schemas/segment.js";

// ============================================================================
// Helpers
// ============================================================================

function validBoundingBox() {
  return { x: 10, y: 20, width: 300, height: 150 };
}

function validDomNode() {
  return {
    tagName: "div",
    attributes: { class: "container" },
    isVisible: true,
    isInteractive: false,
    children: [],
  };
}

function validEndpoint() {
  const now = new Date();
  return {
    id: randomUUID(),
    version: 1,
    siteId: randomUUID(),
    url: "https://example.com/login",
    type: "auth",
    category: "auth",
    label: {
      primary: "Login Form",
      display: "Login Form",
      synonyms: [],
      language: "en",
    },
    status: "discovered",
    anchors: [{ selector: "#login-form" }],
    affordances: [
      {
        type: "fill",
        expectedOutcome: "Enter credentials",
        sideEffects: [],
        reversible: true,
        requiresConfirmation: false,
      },
    ],
    confidence: 0.85,
    confidenceBreakdown: {
      semanticMatch: 0.9,
      structuralStability: 0.8,
      affordanceConsistency: 0.85,
      evidenceQuality: 0.7,
      historicalSuccess: 0,
      ambiguityPenalty: 0,
    },
    evidence: [],
    risk_class: "medium",
    actions: [],
    childEndpointIds: [],
    discoveredAt: now,
    lastSeenAt: now,
    successCount: 0,
    failureCount: 0,
    metadata: {},
  };
}

// ============================================================================
// BoundingBox
// ============================================================================

describe("BoundingBoxSchema", () => {
  it("accepts valid bounding box", () => {
    const result = BoundingBoxSchema.safeParse(validBoundingBox());
    expect(result.success).toBe(true);
  });

  it("rejects negative width", () => {
    const result = BoundingBoxSchema.safeParse({ x: 0, y: 0, width: -1, height: 100 });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = BoundingBoxSchema.safeParse({ x: 10, y: 20 });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// DomNode (rekursiv via z.lazy)
// ============================================================================

describe("DomNodeSchema", () => {
  it("accepts minimal valid node", () => {
    const result = DomNodeSchema.safeParse(validDomNode());
    expect(result.success).toBe(true);
  });

  it("accepts node with nested children", () => {
    const node = {
      ...validDomNode(),
      children: [
        {
          tagName: "input",
          attributes: { type: "text" },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };
    const result = DomNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
  });

  it("rejects empty tagName", () => {
    const node = { ...validDomNode(), tagName: "" };
    const result = DomNodeSchema.safeParse(node);
    expect(result.success).toBe(false);
  });

  it("rejects missing isVisible", () => {
    const { isVisible: _, ...incomplete } = validDomNode();
    const result = DomNodeSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean isInteractive", () => {
    const node = { ...validDomNode(), isInteractive: "yes" };
    const result = DomNodeSchema.safeParse(node);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// AccessibilityNode
// ============================================================================

describe("AccessibilityNodeSchema", () => {
  it("accepts valid accessibility node", () => {
    const node = {
      role: "button",
      name: "Submit",
      disabled: false,
      required: false,
      children: [],
    };
    const result = AccessibilityNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
  });

  it("rejects empty role", () => {
    const node = {
      role: "",
      name: "Submit",
      disabled: false,
      required: false,
      children: [],
    };
    const result = AccessibilityNodeSchema.safeParse(node);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// EndpointType & Enums
// ============================================================================

describe("EndpointTypeSchema", () => {
  it("accepts all valid endpoint types", () => {
    const types = [
      "form", "checkout", "support", "navigation", "auth",
      "search", "commerce", "content", "consent", "media",
      "social", "settings",
    ];
    for (const t of types) {
      expect(EndpointTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it("rejects invalid type", () => {
    expect(EndpointTypeSchema.safeParse("button").success).toBe(false);
    expect(EndpointTypeSchema.safeParse("").success).toBe(false);
    expect(EndpointTypeSchema.safeParse(42).success).toBe(false);
  });
});

describe("RiskLevelSchema", () => {
  it("accepts valid risk levels", () => {
    for (const level of ["low", "medium", "high", "critical"]) {
      expect(RiskLevelSchema.safeParse(level).success).toBe(true);
    }
  });

  it("rejects unknown level", () => {
    expect(RiskLevelSchema.safeParse("severe").success).toBe(false);
  });
});

describe("ValidationStatusSchema", () => {
  it("accepts all validation statuses", () => {
    for (const s of ["unvalidated", "inferred", "validated_inferred", "fully_verified"]) {
      expect(ValidationStatusSchema.safeParse(s).success).toBe(true);
    }
  });
});

// ============================================================================
// Evidence
// ============================================================================

describe("EvidenceSchema", () => {
  it("accepts valid evidence", () => {
    const result = EvidenceSchema.safeParse({
      type: "semantic_label",
      signal: "Login button found",
      weight: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty signal", () => {
    const result = EvidenceSchema.safeParse({
      type: "semantic_label",
      signal: "",
      weight: 0.8,
    });
    expect(result.success).toBe(false);
  });

  it("rejects weight out of range", () => {
    const result = EvidenceSchema.safeParse({
      type: "semantic_label",
      signal: "test",
      weight: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid evidence type", () => {
    const result = EvidenceSchema.safeParse({
      type: "guesswork",
      signal: "test",
      weight: 0.5,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Affordance
// ============================================================================

describe("AffordanceSchema", () => {
  it("accepts valid affordance", () => {
    const result = AffordanceSchema.safeParse({
      type: "click",
      expectedOutcome: "Navigate to profile",
      sideEffects: [],
      reversible: true,
      requiresConfirmation: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid affordance type", () => {
    const result = AffordanceSchema.safeParse({
      type: "swipe",
      expectedOutcome: "test",
      sideEffects: [],
      reversible: true,
    });
    expect(result.success).toBe(false);
  });

  it("defaults requiresConfirmation to false", () => {
    const result = AffordanceSchema.safeParse({
      type: "submit",
      expectedOutcome: "Submit form",
      sideEffects: ["creates record"],
      reversible: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requiresConfirmation).toBe(false);
    }
  });
});

// ============================================================================
// SemanticLabel
// ============================================================================

describe("SemanticLabelSchema", () => {
  it("accepts valid label", () => {
    const result = SemanticLabelSchema.safeParse({
      primary: "Login",
      display: "User Login",
      synonyms: ["Sign In"],
      language: "en",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty primary", () => {
    const result = SemanticLabelSchema.safeParse({
      primary: "",
      display: "Login",
      synonyms: [],
      language: "en",
    });
    expect(result.success).toBe(false);
  });

  it("rejects language code with wrong length", () => {
    const result = SemanticLabelSchema.safeParse({
      primary: "Login",
      display: "Login",
      synonyms: [],
      language: "eng",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// DomAnchor
// ============================================================================

describe("DomAnchorSchema", () => {
  it("accepts anchor with only selector", () => {
    const result = DomAnchorSchema.safeParse({ selector: "#main-form" });
    expect(result.success).toBe(true);
  });

  it("accepts empty anchor (all fields optional)", () => {
    const result = DomAnchorSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Endpoint (vollstaendiges Objekt)
// ============================================================================

describe("EndpointSchema", () => {
  it("accepts valid endpoint", () => {
    const result = EndpointSchema.safeParse(validEndpoint());
    expect(result.success).toBe(true);
  });

  it("rejects endpoint without anchors", () => {
    const ep = { ...validEndpoint(), anchors: [] };
    const result = EndpointSchema.safeParse(ep);
    expect(result.success).toBe(false);
  });

  it("rejects endpoint without affordances", () => {
    const ep = { ...validEndpoint(), affordances: [] };
    const result = EndpointSchema.safeParse(ep);
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for id", () => {
    const ep = { ...validEndpoint(), id: "not-a-uuid" };
    const result = EndpointSchema.safeParse(ep);
    expect(result.success).toBe(false);
  });

  it("rejects confidence above 1", () => {
    const ep = { ...validEndpoint(), confidence: 1.5 };
    const result = EndpointSchema.safeParse(ep);
    expect(result.success).toBe(false);
  });

  it("rejects invalid url", () => {
    const ep = { ...validEndpoint(), url: "not-a-url" };
    const result = EndpointSchema.safeParse(ep);
    expect(result.success).toBe(false);
  });

  it("applies defaults for optional fields", () => {
    const result = EndpointSchema.safeParse(validEndpoint());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.validation_status).toBe("unvalidated");
      expect(result.data.adapter_type).toBe("browser");
    }
  });
});

// ============================================================================
// EndpointStatus
// ============================================================================

describe("EndpointStatusSchema", () => {
  it("accepts all valid statuses", () => {
    for (const s of ["discovered", "inferred", "verified", "deprecated", "broken", "suspended"]) {
      expect(EndpointStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it("rejects unknown status", () => {
    expect(EndpointStatusSchema.safeParse("active").success).toBe(false);
  });
});

// ============================================================================
// UISegment
// ============================================================================

describe("UISegmentSchema", () => {
  it("accepts valid segment", () => {
    const result = UISegmentSchema.safeParse({
      id: randomUUID(),
      type: "form",
      confidence: 0.9,
      boundingBox: validBoundingBox(),
      nodes: [validDomNode()],
      interactiveElementCount: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects segment without nodes", () => {
    const result = UISegmentSchema.safeParse({
      id: randomUUID(),
      type: "form",
      confidence: 0.9,
      boundingBox: validBoundingBox(),
      nodes: [],
      interactiveElementCount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid segment type", () => {
    const result = UISegmentSchema.safeParse({
      id: randomUUID(),
      type: "wizard",
      confidence: 0.9,
      boundingBox: validBoundingBox(),
      nodes: [validDomNode()],
      interactiveElementCount: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("UISegmentTypeSchema", () => {
  it("accepts all valid segment types", () => {
    const types = [
      "form", "navigation", "content", "header", "footer",
      "sidebar", "modal", "overlay", "banner", "table",
      "list", "media", "search", "checkout", "unknown",
    ];
    for (const t of types) {
      expect(UISegmentTypeSchema.safeParse(t).success).toBe(true);
    }
  });
});

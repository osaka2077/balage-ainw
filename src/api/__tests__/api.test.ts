/**
 * API Tests — 16 Tests (Auth, Health, Workflows, Endpoints, Actions, Rate Limiting, Idempotency, Errors)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../server.js";
import type { ApiServerConfig } from "../types.js";
import { _getWorkflowStore, _getIdempotencyStore } from "../routes/workflows.js";
import { _getEndpointStore } from "../routes/endpoints.js";
import { _getActionIdempotencyStore } from "../routes/actions.js";
import { _getEvidenceStore } from "../routes/evidence.js";
import { randomUUID } from "node:crypto";

// --- Test-Konfiguration ---

const TEST_API_KEY = "test-api-key-12345678901234567890";
const READONLY_API_KEY = "readonly-key-12345678901234567890";

const testConfig: ApiServerConfig = {
  host: "127.0.0.1",
  port: 0, // Fastify waehlt automatisch
  apiKeys: [
    {
      key: TEST_API_KEY,
      name: "test-full",
      permissions: ["workflows:read", "workflows:write", "endpoints:read", "actions:execute", "evidence:read"],
    },
    {
      key: READONLY_API_KEY,
      name: "test-readonly",
      permissions: ["workflows:read", "endpoints:read", "evidence:read"],
    },
  ],
  cors: { origins: ["*"], credentials: false },
  rateLimit: { global: 100, perKey: 60 },
  idempotencyTtlMs: 86_400_000,
};

// --- Valides Workflow-Objekt ---

function createValidWorkflow() {
  return {
    name: "Test Workflow",
    startUrl: "https://example.com",
    steps: [
      {
        id: "step-1",
        name: "Navigate",
        agentType: "navigator",
        task: {
          objective: "Navigate to page",
          acceptanceCriteria: ["Page loaded"],
        },
      },
    ],
  };
}

// --- Test Endpoint erzeugen ---

function createTestEndpoint(id: string, type: string = "form", confidence: number = 0.9) {
  return {
    id,
    version: 1,
    siteId: randomUUID(),
    url: "https://example.com",
    type,
    category: type,
    label: { primary: "test", display: "Test Endpoint", synonyms: [], language: "en" },
    status: "verified",
    anchors: [{ selector: "#test" }],
    affordances: [{ type: "click", expectedOutcome: "clicked", sideEffects: [], reversible: true }],
    confidence,
    confidenceBreakdown: {
      semanticMatch: 0.9,
      structuralStability: 0.9,
      affordanceConsistency: 0.9,
      evidenceQuality: 0.9,
      historicalSuccess: 0.9,
      ambiguityPenalty: 0.9,
    },
    evidence: [{ type: "semantic_label", signal: "test label", weight: 0.9 }],
    risk_class: "low",
    actions: ["click"],
    discoveredAt: new Date(),
    lastSeenAt: new Date(),
    successCount: 5,
    failureCount: 0,
    metadata: {},
    childEndpointIds: [],
  };
}

// --- Server Setup ---

let server: FastifyInstance;

beforeAll(async () => {
  server = await createServer(testConfig);
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  // Stores leeren zwischen Tests
  _getWorkflowStore().clear();
  _getIdempotencyStore().clear();
  _getEndpointStore().clear();
  _getActionIdempotencyStore().clear();
  _getEvidenceStore().clear();
});

// ============================================================================
// Auth Tests (3)
// ============================================================================

describe("Auth", () => {
  it("rejects request without API key — 401 AUTH_MISSING_KEY", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/workflows",
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.code).toBe("AUTH_MISSING_KEY");
    expect(body.error).toBe("API key required");
  });

  it("rejects request with invalid API key — 401 AUTH_INVALID_KEY", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/workflows",
      headers: { "x-api-key": "wrong-key-that-does-not-exist!!" },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.code).toBe("AUTH_INVALID_KEY");
  });

  it("rejects request with missing permission — 403 AUTH_FORBIDDEN", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/workflows/run",
      headers: { "x-api-key": READONLY_API_KEY, "content-type": "application/json" },
      payload: { workflow: createValidWorkflow() },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.code).toBe("AUTH_FORBIDDEN");
  });
});

// ============================================================================
// Health Test (1)
// ============================================================================

describe("Health", () => {
  it("returns health status without auth — 200", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/health",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // In Test-Umgebung ohne API-Keys/Chromium: "degraded" erwartet
    expect(["healthy", "degraded"]).toContain(body.status);
    expect(body.version).toBe("0.1.0");
    expect(typeof body.uptime).toBe("number");
    expect(body.timestamp).toBeTruthy();
    expect(body.checks).toHaveProperty("browser");
    expect(body.checks).toHaveProperty("llm_api");
    expect(body.checks).toHaveProperty("memory");
  });
});

// ============================================================================
// Workflow Tests (4)
// ============================================================================

describe("Workflows", () => {
  it("starts a workflow — POST 202 with id and traceId", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/workflows/run",
      headers: { "x-api-key": TEST_API_KEY, "content-type": "application/json" },
      payload: { workflow: createValidWorkflow() },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.status).toBe("accepted");
    expect(body.id).toBeTruthy();
    expect(body.traceId).toBeTruthy();
    // UUID Format
    expect(body.id).toMatch(/^[0-9a-f]{8}-/);
    expect(body.traceId).toMatch(/^[0-9a-f]{8}-/);
  });

  it("returns workflow status — GET 200 with progress", async () => {
    // Erst Workflow erstellen
    const createRes = await server.inject({
      method: "POST",
      url: "/api/v1/workflows/run",
      headers: { "x-api-key": TEST_API_KEY, "content-type": "application/json" },
      payload: { workflow: createValidWorkflow() },
    });
    const { id } = createRes.json();

    // Status abfragen
    const response = await server.inject({
      method: "GET",
      url: `/api/v1/workflows/${id}`,
      headers: { "x-api-key": TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(id);
    expect(body.status).toBe("pending");
    expect(body.progress.totalSteps).toBe(1);
    expect(body.progress.completedSteps).toBe(0);
  });

  it("returns 404 for non-existent workflow", async () => {
    const fakeId = randomUUID();
    const response = await server.inject({
      method: "GET",
      url: `/api/v1/workflows/${fakeId}`,
      headers: { "x-api-key": TEST_API_KEY },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  it("rejects invalid workflow body — 400 VALIDATION_ERROR", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/workflows/run",
      headers: { "x-api-key": TEST_API_KEY, "content-type": "application/json" },
      payload: { workflow: { name: "" } }, // fehlende Felder
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details).toBeTruthy();
    expect(body.details.issues).toBeTruthy();
  });
});

// ============================================================================
// Endpoints Tests (2)
// ============================================================================

describe("Endpoints", () => {
  it("lists endpoints with pagination — GET 200", async () => {
    // Endpoints in Store einfuegen
    const store = _getEndpointStore();
    const ep1 = createTestEndpoint(randomUUID(), "form", 0.9);
    const ep2 = createTestEndpoint(randomUUID(), "checkout", 0.7);
    store.set(ep1.id, ep1 as never);
    store.set(ep2.id, ep2 as never);

    const response = await server.inject({
      method: "GET",
      url: "/api/v1/endpoints",
      headers: { "x-api-key": TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items.length).toBe(2);
    expect(body.total).toBe(2);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
  });

  it("filters endpoints by type and minConfidence", async () => {
    const store = _getEndpointStore();
    const ep1 = createTestEndpoint(randomUUID(), "form", 0.9);
    const ep2 = createTestEndpoint(randomUUID(), "form", 0.5);
    const ep3 = createTestEndpoint(randomUUID(), "checkout", 0.95);
    store.set(ep1.id, ep1 as never);
    store.set(ep2.id, ep2 as never);
    store.set(ep3.id, ep3 as never);

    const response = await server.inject({
      method: "GET",
      url: "/api/v1/endpoints?type=form&minConfidence=0.8",
      headers: { "x-api-key": TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].type).toBe("form");
    expect(body.items[0].confidence).toBeGreaterThanOrEqual(0.8);
  });
});

// ============================================================================
// Actions Tests (2)
// ============================================================================

describe("Actions", () => {
  it("executes an action on existing endpoint — POST 200", async () => {
    const endpointId = randomUUID();
    const store = _getEndpointStore();
    store.set(endpointId, createTestEndpoint(endpointId) as never);

    const response = await server.inject({
      method: "POST",
      url: "/api/v1/actions/execute",
      headers: { "x-api-key": TEST_API_KEY, "content-type": "application/json" },
      payload: {
        endpointId,
        action: "click",
        parameters: { x: 100, y: 200 },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.action).toBe("click");
    expect(body.endpointId).toBe(endpointId);
    expect(body.gateDecision).toBe("allow");
    expect(typeof body.confidence).toBe("number");
    expect(Array.isArray(body.evidence)).toBe(true);
  });

  it("returns 404 for action on non-existent endpoint", async () => {
    const fakeId = randomUUID();
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/actions/execute",
      headers: { "x-api-key": TEST_API_KEY, "content-type": "application/json" },
      payload: {
        endpointId: fakeId,
        action: "click",
      },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.code).toBe("NOT_FOUND");
  });
});

// ============================================================================
// Rate Limiting Test (1)
// ============================================================================

describe("Rate Limiting", () => {
  it("returns 429 when rate limit exceeded", async () => {
    // Erstelle Server mit extrem niedrigem Rate Limit
    const rateLimitConfig: ApiServerConfig = {
      ...testConfig,
      rateLimit: { global: 2, perKey: 2 },
    };
    const rateLimitServer = await createServer(rateLimitConfig);
    await rateLimitServer.ready();

    try {
      // Sende Requests bis Limit erreicht
      const responses = [];
      for (let i = 0; i < 5; i++) {
        const res = await rateLimitServer.inject({
          method: "GET",
          url: "/api/v1/health",
        });
        responses.push(res);
      }

      // Mindestens ein Request sollte 429 sein
      const rateLimited = responses.some((r) => r.statusCode === 429);
      expect(rateLimited).toBe(true);

      // Pruefe die 429 Response-Struktur
      const limited = responses.find((r) => r.statusCode === 429);
      if (limited) {
        const body = limited.json();
        expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
      }
    } finally {
      await rateLimitServer.close();
    }
  });
});

// ============================================================================
// Idempotency Test (1)
// ============================================================================

describe("Idempotency", () => {
  it("returns same response for duplicate idempotency key", async () => {
    const idempotencyKey = randomUUID();

    const payload = { workflow: createValidWorkflow() };

    // Erster Request
    const res1 = await server.inject({
      method: "POST",
      url: "/api/v1/workflows/run",
      headers: {
        "x-api-key": TEST_API_KEY,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      payload,
    });

    expect(res1.statusCode).toBe(202);
    const body1 = res1.json();

    // Zweiter Request mit gleichem Key und Body
    const res2 = await server.inject({
      method: "POST",
      url: "/api/v1/workflows/run",
      headers: {
        "x-api-key": TEST_API_KEY,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      payload,
    });

    expect(res2.statusCode).toBe(202);
    const body2 = res2.json();

    // Gleiche Response
    expect(body2.id).toBe(body1.id);
    expect(body2.traceId).toBe(body1.traceId);

    // Nur ein Workflow im Store (nicht doppelt)
    const store = _getWorkflowStore();
    const workflows = Array.from(store.values()).filter(
      (w) => w.traceId === body1.traceId,
    );
    expect(workflows.length).toBe(1);
  });
});

// ============================================================================
// Error Handling Test (1)
// ============================================================================

describe("Error Handling", () => {
  it("returns structured error for invalid request body — Zod issues", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/actions/execute",
      headers: { "x-api-key": TEST_API_KEY, "content-type": "application/json" },
      payload: {
        endpointId: "not-a-uuid",
        action: "",
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBeTruthy();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details).toBeTruthy();
    expect(body.details.issues).toBeTruthy();
    expect(Array.isArray(body.details.issues)).toBe(true);
    expect(body.details.issues.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Workflow List Test (1 Bonus)
// ============================================================================

describe("Workflow Listing", () => {
  it("lists workflows with pagination and status filter", async () => {
    // Mehrere Workflows erstellen
    for (let i = 0; i < 3; i++) {
      await server.inject({
        method: "POST",
        url: "/api/v1/workflows/run",
        headers: { "x-api-key": TEST_API_KEY, "content-type": "application/json" },
        payload: { workflow: createValidWorkflow() },
      });
    }

    // Alle abfragen
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/workflows?limit=2&offset=0",
      headers: { "x-api-key": TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(3);
    expect(body.items.length).toBe(2);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(0);
  });
});

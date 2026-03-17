/**
 * E2E Hero-Flow: Checkout auf einer echten Website (saucedemo.com)
 *
 * Zweiter kompletter End-to-End-Flow:
 * Login → Product Page (Add to Cart) → Cart → Checkout → Verify
 *
 * Test-Ziel: https://www.saucedemo.com
 * Credentials: standard_user / secret_sauce
 *
 * Pro Schritt wird die BALAGE-Pipeline neu ausgefuehrt (SPA-Navigation = neuer DOM).
 * Das ist genau der Use-Case den BALAGE abdecken soll.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { BrowserAdapter, extractStructuredDOM, extractAccessibilityTree } from "../../src/adapter/index.js";
import { pruneDom, parseDom, parseAria, segmentUI } from "../../src/parser/index.js";
import {
  generateEndpoints,
  candidateToEndpoint,
} from "../../src/semantic/endpoint-generator.js";
import { createFallbackLLMClient } from "../../src/semantic/fallback-llm-client.js";
import type { FallbackLLMClient } from "../../src/semantic/fallback-llm-client.js";
import { RiskGate } from "../../src/risk/gate.js";
import { calculateScore } from "../../src/confidence/score-calculator.js";
import { envConfig } from "../../src/config/env.js";
import type { Endpoint, UISegment } from "../../shared_interfaces.js";

// ============================================================================
// Config
// ============================================================================

const TARGET_URL = "https://www.saucedemo.com";
const CREDENTIALS = { username: "standard_user", password: "secret_sauce" };
const CHECKOUT_INFO = { firstName: "Test", lastName: "User", zipCode: "12345" };
const SUCCESS_TEXT = "Thank you for your order!";

const hasApiKey =
  !!process.env["BALAGE_OPENAI_API_KEY"] ||
  !!process.env["BALAGE_ANTHROPIC_API_KEY"];

// ============================================================================
// Evidence-Chain Tracker
// ============================================================================

interface EvidenceEntry {
  step: string;
  timestamp: number;
  data: Record<string, unknown>;
}

class EvidenceChain {
  private entries: EvidenceEntry[] = [];

  log(step: string, data: Record<string, unknown>): void {
    this.entries.push({ step, timestamp: Date.now(), data });
  }

  getEntries(): EvidenceEntry[] {
    return [...this.entries];
  }

  print(): void {
    console.log("\n  === EVIDENCE CHAIN ===");
    for (const entry of this.entries) {
      const ts = new Date(entry.timestamp).toISOString().slice(11, 23);
      console.log(`  [${ts}] ${entry.step}`);
      for (const [key, value] of Object.entries(entry.data)) {
        const display = typeof value === "object" ? JSON.stringify(value) : String(value);
        console.log(`    ${key}: ${display.slice(0, 120)}`);
      }
    }
    console.log("  === END EVIDENCE CHAIN ===\n");
  }
}

// ============================================================================
// Pipeline Helper — Runs the full BALAGE pipeline on current page state
// ============================================================================

interface PipelineResult {
  endpoints: Endpoint[];
  segments: UISegment[];
  durationMs: number;
}

async function runPipeline(
  page: import("playwright").Page,
  llmClient: FallbackLLMClient,
  chain: EvidenceChain,
  stepName: string,
): Promise<PipelineResult> {
  const start = Date.now();

  // DOM Extraction
  const rawDom = await extractStructuredDOM(page);

  // Prune + Parse
  const { prunedDom } = pruneDom(rawDom);
  const parsed = parseDom(prunedDom);

  // ARIA Tree
  let aria;
  try {
    const cdp = await page.context().newCDPSession(page);
    const axTree = await extractAccessibilityTree(page, cdp);
    aria = parseAria(parsed.root, axTree);
  } catch {
    aria = { landmarks: [], liveRegions: [], labelledElements: [], ariaConflicts: [] };
  }

  // Segmentation
  const segments = segmentUI(parsed.root, aria);

  // Filter: nur relevante Segmente
  const relevant = segments
    .filter((s: UISegment) => s.interactiveElementCount > 0 || ["auth", "form", "commerce", "navigation"].includes(s.type))
    .sort((a: UISegment, b: UISegment) => b.confidence - a.confidence)
    .slice(0, 6);

  // LLM Endpoint Generation
  const siteId = randomUUID();
  const context = {
    url: page.url(),
    siteId,
    sessionId: randomUUID(),
    pageTitle: await page.title(),
  };

  const candidates = await generateEndpoints(relevant, context, { llmClient });

  // Candidates → Endpoints
  const endpoints: Endpoint[] = [];
  for (const candidate of candidates) {
    try {
      const segment = segments.find((s: UISegment) => s.type === candidate.type) ?? segments[0];
      if (!segment) continue;

      const llmSummary = llmClient.summary();
      const endpoint = candidateToEndpoint(candidate, context, segment, {
        endpoints: candidates,
        reasoning: candidate.reasoning,
        model: Object.keys(llmSummary.callsByModel ?? {})[0] ?? "unknown",
        tokens: { prompt: llmSummary.totalTokens, completion: 0 },
      });
      endpoints.push(endpoint);
    } catch {
      // Candidate-Konvertierung kann fehlschlagen — weiter
    }
  }

  const durationMs = Date.now() - start;

  chain.log(`pipeline_${stepName}`, {
    url: page.url(),
    segments: segments.length,
    relevant: relevant.length,
    candidates: candidates.length,
    endpoints: endpoints.length,
    types: endpoints.map((e) => e.type),
    labels: endpoints.map((e) => e.label.primary),
    durationMs,
  });

  return { endpoints, segments, durationMs };
}

// ============================================================================
// Tests
// ============================================================================

describe.skipIf(!hasApiKey)("E2E Checkout Flow — saucedemo.com", () => {
  let adapter: BrowserAdapter;
  let llmClient: FallbackLLMClient;

  beforeAll(async () => {
    adapter = new BrowserAdapter({ headless: true });
    await adapter.launch();

    llmClient = createFallbackLLMClient({
      envConfig,
      maxCostUsd: 2.0,
    });
  });

  afterAll(async () => {
    await adapter.shutdown();
  });

  // --------------------------------------------------------------------------
  // Full Checkout Flow: Login → Add to Cart → Cart → Checkout → Verify
  // --------------------------------------------------------------------------
  it("completes full checkout: login, add-to-cart, checkout form, order confirmation", async () => {
    const chain = new EvidenceChain();
    const gate = new RiskGate();
    const contextId = await adapter.newContext();

    try {
      const page = await adapter.getPage(contextId);

      // ================================================================
      // STEP 1: Login
      // ================================================================
      console.log("  [STEP 1/4] Login ...");
      await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

      // Run BALAGE pipeline on login page
      const loginResult = await runPipeline(page, llmClient, chain, "login_page");
      console.log(`    Pipeline: ${loginResult.endpoints.length} endpoints in ${loginResult.durationMs}ms`);
      console.log(`    Types: [${loginResult.endpoints.map((e) => e.type).join(", ")}]`);

      // Assert: Auth/Form endpoint erkannt
      const authEndpoint = loginResult.endpoints.find((e) => e.type === "auth");
      const formEndpoint = loginResult.endpoints.find((e) => e.type === "form");
      const loginEndpoint = authEndpoint ?? formEndpoint;
      expect(loginEndpoint).toBeDefined();
      console.log(`    Login endpoint: [${loginEndpoint!.type}] "${loginEndpoint!.label.primary}" (${loginEndpoint!.confidence.toFixed(3)})`);

      // Risk Gate fuer Login
      const loginScore = calculateScore(loginEndpoint!, loginEndpoint!.evidence);
      const loginGate = await gate.evaluate("form_fill", loginEndpoint!, loginScore, {
        sessionId: randomUUID(),
        traceId: randomUUID(),
        evidence: loginEndpoint!.evidence,
        domain: "www.saucedemo.com",
      });
      chain.log("risk_gate_login", { decision: loginGate.decision, reason: loginGate.reason.slice(0, 100) });
      console.log(`    Risk Gate: ${loginGate.decision.toUpperCase()}`);

      // Fill login form + submit
      await page.fill('[data-test="username"]', CREDENTIALS.username);
      await page.fill('[data-test="password"]', CREDENTIALS.password);
      await page.click('[data-test="login-button"]');
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

      chain.log("login_submit", { url: page.url() });

      // Assert: Auf Inventory-Seite gelandet
      expect(page.url()).toContain("/inventory");
      console.log(`    Login OK → ${page.url()}`);

      // ================================================================
      // STEP 2: Product Page — Add to Cart
      // ================================================================
      console.log("  [STEP 2/4] Product Page — Add to Cart ...");

      // Run BALAGE pipeline auf Inventory-Seite (neuer DOM nach SPA-Navigation)
      const inventoryResult = await runPipeline(page, llmClient, chain, "inventory_page");
      console.log(`    Pipeline: ${inventoryResult.endpoints.length} endpoints in ${inventoryResult.durationMs}ms`);
      console.log(`    Types: [${inventoryResult.endpoints.map((e) => e.type).join(", ")}]`);

      // Commerce-Endpoints erkennen (add-to-cart buttons, product cards)
      const commerceEndpoints = inventoryResult.endpoints.filter(
        (e) => ["commerce", "action", "form", "navigation"].includes(e.type),
      );
      console.log(`    Commerce-relevant endpoints: ${commerceEndpoints.length}`);

      // Add first product to cart
      await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');

      // Verify: Cart badge shows "1"
      const cartBadge = await page.textContent('[data-test="shopping-cart-badge"]');
      expect(cartBadge?.trim()).toBe("1");
      chain.log("add_to_cart", { product: "sauce-labs-backpack", cartBadge });
      console.log(`    Cart badge: ${cartBadge?.trim()}`);

      // ================================================================
      // STEP 3: Cart → Checkout
      // ================================================================
      console.log("  [STEP 3/4] Cart → Checkout ...");

      // Navigate to cart
      await page.click('[data-test="shopping-cart-link"]');
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

      // Run BALAGE pipeline auf Cart-Seite
      const cartResult = await runPipeline(page, llmClient, chain, "cart_page");
      console.log(`    Pipeline: ${cartResult.endpoints.length} endpoints in ${cartResult.durationMs}ms`);
      console.log(`    Types: [${cartResult.endpoints.map((e) => e.type).join(", ")}]`);

      // Checkout-Endpoint erkennen
      const checkoutEndpoint = cartResult.endpoints.find(
        (e) => e.type === "checkout" || e.type === "navigation" || e.type === "action",
      );
      if (checkoutEndpoint) {
        console.log(`    Checkout endpoint: [${checkoutEndpoint.type}] "${checkoutEndpoint.label.primary}" (${checkoutEndpoint.confidence.toFixed(3)})`);

        // Risk Gate fuer Checkout
        const checkoutScore = calculateScore(checkoutEndpoint, checkoutEndpoint.evidence);
        const checkoutGate = await gate.evaluate("form_fill", checkoutEndpoint, checkoutScore, {
          sessionId: randomUUID(),
          traceId: randomUUID(),
          evidence: checkoutEndpoint.evidence,
          domain: "www.saucedemo.com",
        });
        chain.log("risk_gate_checkout", { decision: checkoutGate.decision, reason: checkoutGate.reason.slice(0, 100) });
        console.log(`    Risk Gate: ${checkoutGate.decision.toUpperCase()}`);
      }

      // Click Checkout
      await page.click('[data-test="checkout"]');
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

      // Run BALAGE pipeline auf Checkout-Formular-Seite
      const checkoutFormResult = await runPipeline(page, llmClient, chain, "checkout_form");
      console.log(`    Checkout form pipeline: ${checkoutFormResult.endpoints.length} endpoints in ${checkoutFormResult.durationMs}ms`);

      // Fill checkout form
      await page.fill('[data-test="firstName"]', CHECKOUT_INFO.firstName);
      await page.fill('[data-test="lastName"]', CHECKOUT_INFO.lastName);
      await page.fill('[data-test="postalCode"]', CHECKOUT_INFO.zipCode);
      chain.log("checkout_form_fill", { fields: ["firstName", "lastName", "postalCode"] });

      // Continue to overview
      await page.click('[data-test="continue"]');
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

      // Assert: Auf Checkout-Overview-Seite
      expect(page.url()).toContain("checkout-step-two");
      console.log(`    Checkout form submitted → ${page.url()}`);

      // ================================================================
      // STEP 4: Order Confirmation
      // ================================================================
      console.log("  [STEP 4/4] Order Confirmation ...");

      // Run BALAGE pipeline auf Overview-Seite
      const overviewResult = await runPipeline(page, llmClient, chain, "checkout_overview");
      console.log(`    Pipeline: ${overviewResult.endpoints.length} endpoints in ${overviewResult.durationMs}ms`);

      // Finish order
      await page.click('[data-test="finish"]');
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

      // Verify: Success message
      const pageContent = await page.textContent("body");
      const orderComplete = pageContent?.includes("Thank you for your order") ?? false;
      chain.log("order_verification", {
        url: page.url(),
        orderComplete,
        containsSuccessText: pageContent?.includes(SUCCESS_TEXT) ?? false,
      });

      expect(orderComplete).toBe(true);
      expect(page.url()).toContain("checkout-complete");
      console.log(`    Order complete: ${orderComplete} → ${page.url()}`);

      // ================================================================
      // Summary
      // ================================================================
      chain.print();

      const summary = llmClient.summary();
      console.log(`  LLM Cost: $${summary.totalCostUsd.toFixed(4)} | Calls: ${summary.totalCalls} | Tokens: ${summary.totalTokens}`);
      console.log(`  Pipeline runs: 5 (login, inventory, cart, checkout-form, overview)`);

      // Audit-Trail hat Eintraege
      const auditEntries = gate.auditTrail.getAllEntries();
      expect(auditEntries.length).toBeGreaterThan(0);
      console.log(`  Audit trail entries: ${auditEntries.length}`);

    } finally {
      await adapter.destroyContext(contextId);
    }
  }, 180_000);
});

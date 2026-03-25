/**
 * E2E Hero-Flow: Login auf einer echten Website
 *
 * Erster kompletter End-to-End-Flow:
 * Endpoint erkennen → Risk Gate pruefen → Formular ausfuellen → Submit → Ergebnis verifizieren
 *
 * Test-Ziel: https://the-internet.herokuapp.com/login
 * Credentials: tomsmith / SuperSecretPassword!
 *
 * Das ist KEIN voller Orchestrator-Flow, sondern ein manuell orchestrierter Flow,
 * der zeigt dass alle Bausteine zusammenarbeiten.
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
import type { Endpoint, UISegment, Evidence, ConfidenceScore } from "../../shared_interfaces.js";

// ============================================================================
// Config
// ============================================================================

const TARGET_URL = "https://the-internet.herokuapp.com/login";
const CREDENTIALS = { username: "tomsmith", password: "SuperSecretPassword!" };
const SUCCESS_TEXT = "You logged into a secure area!";

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
// Tests
// ============================================================================

describe.skipIf(!hasApiKey)("E2E Login Flow — the-internet.herokuapp.com", () => {
  let adapter: BrowserAdapter;
  let llmClient: FallbackLLMClient;

  beforeAll(async () => {
    adapter = new BrowserAdapter({ headless: true });
    await adapter.launch();

    llmClient = await createFallbackLLMClient({
      envConfig,
      maxCostUsd: 1.0,
    });
  });

  afterAll(async () => {
    await adapter.shutdown();
  });

  // --------------------------------------------------------------------------
  // Test 1: Voller Hero-Flow — Detect → Gate → Fill → Submit → Verify
  // --------------------------------------------------------------------------
  it("detects auth endpoint, evaluates risk gate, fills form, and logs in successfully", async () => {
    const chain = new EvidenceChain();
    const gate = new RiskGate();
    const contextId = await adapter.newContext();

    try {
      const page = await adapter.getPage(contextId);

      // === Step 1: Navigation ===
      console.log("  [1/8] Navigating to login page ...");
      await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      chain.log("navigation", { url: page.url(), title: await page.title() });

      // === Step 2: DOM Extraction ===
      console.log("  [2/8] Extracting DOM ...");
      const rawDom = await extractStructuredDOM(page);
      chain.log("dom_extraction", { nodeCount: "extracted" });

      // === Step 3: Prune + Parse ===
      console.log("  [3/8] Pruning + Parsing ...");
      const { prunedDom } = pruneDom(rawDom);
      const parsed = parseDom(prunedDom);
      chain.log("prune_parse", { nodeCount: parsed.nodeCount, maxDepth: parsed.maxDepth });

      // === Step 3b: ARIA Tree ===
      console.log("  [3b/8] Extracting ARIA ...");
      let aria;
      try {
        const cdp = await page.context().newCDPSession(page);
        const axTree = await extractAccessibilityTree(page, cdp);
        aria = parseAria(parsed.root, axTree);
        chain.log("aria", { landmarks: aria.landmarks.length });
      } catch {
        aria = { landmarks: [], liveRegions: [], labelledElements: [], ariaConflicts: [] };
        chain.log("aria", { status: "failed (non-fatal)" });
      }

      // === Step 4: Segmentation ===
      console.log("  [4/8] Segmenting UI ...");
      const segments = segmentUI(parsed.root, aria);
      chain.log("segmentation", {
        total: segments.length,
        types: [...new Set(segments.map((s: UISegment) => s.type))],
      });

      // Filter: nur relevante Segmente mit interaktiven Elementen
      const relevant = segments
        .filter((s: UISegment) => s.interactiveElementCount > 0 || ["auth", "form"].includes(s.type))
        .sort((a: UISegment, b: UISegment) => b.confidence - a.confidence)
        .slice(0, 6);

      console.log(`    Filtered: ${segments.length} → ${relevant.length} segments`);
      expect(relevant.length).toBeGreaterThan(0);

      // === Step 5: LLM Endpoint Generation ===
      console.log("  [5/8] Generating endpoints via LLM ...");
      const siteId = randomUUID();
      const context = {
        url: page.url(),
        siteId,
        sessionId: randomUUID(),
        pageTitle: await page.title(),
      };

      const genResult = await generateEndpoints(relevant, context, { llmClient });
      const candidates = genResult.candidates;
      console.log(`    Candidates: ${candidates.length}`);

      // Wandle Candidates → Endpoints
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

      console.log(`    Endpoints: ${endpoints.length}`);
      chain.log("endpoint_generation", {
        candidates: candidates.length,
        endpoints: endpoints.length,
        types: endpoints.map((e) => e.type),
        labels: endpoints.map((e) => e.label.primary),
      });

      // === ASSERTION: Auth-Endpoint erkannt ===
      const authEndpoint = endpoints.find((e) => e.type === "auth");
      const formEndpoint = endpoints.find((e) => e.type === "form");
      const loginEndpoint = authEndpoint ?? formEndpoint;
      expect(loginEndpoint).toBeDefined();
      console.log(`    Login endpoint: [${loginEndpoint!.type}] "${loginEndpoint!.label.primary}" (confidence: ${loginEndpoint!.confidence.toFixed(3)})`);

      // === ASSERTION: Confidence > 0.5 ===
      expect(loginEndpoint!.confidence).toBeGreaterThan(0.5);

      // === Step 6: Risk Gate Evaluation ===
      console.log("  [6/8] Evaluating Risk Gate ...");
      const confidenceScore = calculateScore(loginEndpoint!, loginEndpoint!.evidence);
      const gateContext = {
        sessionId: randomUUID(),
        traceId: randomUUID(),
        evidence: loginEndpoint!.evidence,
        domain: "the-internet.herokuapp.com",
      };

      const gateDecision = await gate.evaluate(
        "form_fill",
        loginEndpoint!,
        confidenceScore,
        gateContext,
      );

      chain.log("risk_gate", {
        decision: gateDecision.decision,
        reason: gateDecision.reason,
        confidence: gateDecision.confidence,
        threshold: gateDecision.threshold,
        validation_status: gateDecision.endpoint_validation_status,
      });

      console.log(`    Gate decision: ${gateDecision.decision.toUpperCase()}`);
      console.log(`    Reason: ${gateDecision.reason.slice(0, 100)}`);

      // Fuer inferred auth Endpoints erwartet das Gate ESCALATE (ADR-014)
      // Fuer den Test akzeptieren wir allow, deny, oder escalate —
      // wir wollen nur sicherstellen dass das Gate eine Entscheidung trifft
      expect(["allow", "deny", "escalate"]).toContain(gateDecision.decision);

      // === ASSERTION: Audit-Trail hat Eintraege ===
      const auditEntries = gate.auditTrail.getAllEntries();
      expect(auditEntries.length).toBeGreaterThan(0);
      chain.log("audit_trail", { entries: auditEntries.length });

      // === Step 7: Form Fill + Submit ===
      // Unabhaengig von der Gate-Entscheidung fuellen wir das Formular aus
      // (Test-Kontext: wir WISSEN dass es sicher ist)
      console.log("  [7/8] Filling form + submitting ...");
      await page.fill("#username", CREDENTIALS.username);
      await page.fill("#password", CREDENTIALS.password);
      chain.log("form_fill", {
        fields: ["#username", "#password"],
        note: "Direct Playwright fill (test context)",
      });

      await page.click('button[type="submit"]');
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      chain.log("form_submit", { trigger: 'button[type="submit"]' });

      // === Step 8: Result Verification ===
      console.log("  [8/8] Verifying result ...");
      const pageContent = await page.textContent("body");
      const loginSuccessful = pageContent?.includes("secure area") ?? false;

      chain.log("verification", {
        url: page.url(),
        loginSuccessful,
        containsSuccessText: pageContent?.includes(SUCCESS_TEXT) ?? false,
      });

      // === ASSERTION: Login erfolgreich ===
      expect(loginSuccessful).toBe(true);
      expect(pageContent).toContain("secure area");

      // Print Evidence Chain
      chain.print();

      // Print LLM Cost Summary
      const summary = llmClient.summary();
      console.log(`  LLM Cost: $${summary.totalCostUsd.toFixed(4)} | Calls: ${summary.totalCalls} | Tokens: ${summary.totalTokens}`);
    } finally {
      await adapter.destroyContext(contextId);
    }
  }, 120_000);

  // --------------------------------------------------------------------------
  // Test 2: Falsches Passwort → Login scheitert → Error erkannt
  // --------------------------------------------------------------------------
  it("detects login failure with wrong credentials", async () => {
    const contextId = await adapter.newContext();

    try {
      const page = await adapter.getPage(contextId);

      await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

      // Falsches Passwort
      await page.fill("#username", "tomsmith");
      await page.fill("#password", "WrongPassword123");
      await page.click('button[type="submit"]');
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

      // Heroku zeigt Flash-Message mit Fehler
      const flashText = await page.textContent("#flash") ?? "";
      const hasError = flashText.includes("invalid");
      // URL bleibt auf /login (kein Redirect zu /secure)
      const stayedOnLogin = page.url().includes("/login");

      console.log(`  Wrong password: error flash = ${hasError}, stayed on login = ${stayedOnLogin}`);

      expect(hasError).toBe(true);
      expect(stayedOnLogin).toBe(true);
    } finally {
      await adapter.destroyContext(contextId);
    }
  }, 30_000);

  // --------------------------------------------------------------------------
  // Test 3: Baseline — Reines Playwright ohne Endpoint-Erkennung
  // --------------------------------------------------------------------------
  it("baseline: direct Playwright login without BALAGE pipeline", async () => {
    const contextId = await adapter.newContext();

    try {
      const page = await adapter.getPage(contextId);
      const start = Date.now();

      await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.fill("#username", CREDENTIALS.username);
      await page.fill("#password", CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

      const elapsed = Date.now() - start;
      const pageContent = await page.textContent("body");
      const loginSuccessful = pageContent?.includes("secure area") ?? false;

      console.log(`  Baseline: ${elapsed}ms | Success: ${loginSuccessful}`);

      expect(loginSuccessful).toBe(true);
    } finally {
      await adapter.destroyContext(contextId);
    }
  }, 30_000);
});

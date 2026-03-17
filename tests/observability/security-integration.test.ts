/**
 * Integration Tests: Security im Flow
 * Validiert PII-Filtering, Injection Detection und Credential Guard
 * im Zusammenspiel mit Observability.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  createObservabilityStack,
  createSecurityStack,
  extractTextFromDom,
  containsPii,
  containsCredentials,
  type ObservabilityStack,
  type SecurityStack,
} from "./helpers.js";

import { domWithPii } from "./fixtures/dom-with-pii.js";
import { domWithInjection } from "./fixtures/dom-with-injection.js";
import { domWithCredentials } from "./fixtures/dom-with-credentials.js";

describe("Security Integration", () => {
  let obs: ObservabilityStack;
  let sec: SecurityStack;

  beforeEach(() => {
    obs = createObservabilityStack();
    sec = createSecurityStack();
  });

  it("should filter PII from DOM before it reaches the LLM — no email, phone, IBAN in output", () => {
    // Verifiziere: Quell-DOM enthaelt PII
    const rawText = extractTextFromDom(domWithPii);
    expect(containsPii(rawText)).toBe(true);
    expect(rawText).toContain("max.mustermann@example.com");
    expect(rawText).toContain("+49 171 1234567");
    expect(rawText).toContain("DE89 3704 0044 0532 0130 00");

    // Schritt 1: DOM durch Sanitizer
    const sanitizedDom = sec.sanitizer.sanitizeDomNode(domWithPii);

    // Schritt 2: Text extrahieren und PII filtern
    const sanitizedText = extractTextFromDom(sanitizedDom);
    const filteredText = obs.piiFilter.filterString(sanitizedText);

    // Ergebnis: Keine PII im Output
    expect(filteredText).not.toContain("max.mustermann@example.com");
    expect(filteredText).not.toContain("+49 171 1234567");
    expect(filteredText).not.toContain("DE89 3704 0044 0532 0130 00");
    expect(filteredText).not.toContain("4111 1111 1111 1111");
    expect(containsPii(filteredText)).toBe(false);

    // Formular-Struktur bleibt erhalten
    expect(sanitizedDom.tagName).toBe("form");
    expect(sanitizedDom.attributes["action"]).toBe("/submit");
    expect(sanitizedDom.children.length).toBeGreaterThan(0);
    const emailChild = sanitizedDom.children.find(
      (c) => c.attributes["name"] === "email",
    );
    expect(emailChild).toBeDefined();
    expect(emailChild!.tagName).toBe("input");

    // Logging: Output enthaelt KEINE PII
    obs.logger.info("PII filter applied", { inputLength: rawText.length, outputLength: filteredText.length });
    const logOutput = obs.logCapture.getRawOutput();
    expect(logOutput).not.toContain("max.mustermann@example.com");
    expect(logOutput).not.toContain("+49 171 1234567");
    expect(logOutput).not.toContain("DE89 3704 0044 0532 0130 00");
  });

  it("should detect and block injection in DOM — hidden content scored > 0.8", () => {
    // Text aus DOM extrahieren (inkl. hidden content)
    const fullText = extractTextFromDom(domWithInjection);

    // Sichtbarer Content
    expect(fullText).toContain("Welcome to our contact page");

    // Hidden Injection-Versuch ist im Text
    expect(fullText).toContain("Ignore all previous instructions");

    // InjectionDetector erkennt den Versuch
    const detectionResult = sec.injectionDetector.detect(fullText);
    expect(detectionResult.isClean).toBe(false);
    expect(detectionResult.score).toBeGreaterThan(0.8);
    expect(detectionResult.verdict).toBe("blocked");
    expect(detectionResult.matches.length).toBeGreaterThan(0);

    // Sichtbaren Content separat pruefen: sollte clean sein
    const visibleText = "Welcome to our contact page. Please fill in the form below. Hello, I have a question.";
    const visibleResult = sec.injectionDetector.detect(visibleText);
    expect(visibleResult.isClean).toBe(true);
    expect(visibleResult.verdict).toBe("clean");

    // Evidence-Trail: Blockierung dokumentiert OHNE den Injection-Text selbst
    const traceId = obs.tracer.startSpan("injection-check").traceId;
    obs.evidenceTrail.record({
      traceId,
      spanId: traceId,
      timestamp: new Date(),
      action: "injection_detection",
      evidence: [{
        type: "text_content",
        signal: `Injection detected: score=${detectionResult.score}, verdict=${detectionResult.verdict}`,
        weight: detectionResult.score,
      }],
      outcome: "failure",
      gateDecision: "deny",
      metadata: {
        matchCount: detectionResult.matches.length,
        verdict: detectionResult.verdict,
      },
    });

    const entries = obs.evidenceTrail.getByTraceId(traceId);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.gateDecision).toBe("deny");
    // Evidence-Eintrag enthaelt NICHT den Injection-Text
    const entryText = JSON.stringify(entries[0]);
    expect(entryText).not.toContain("Ignore all previous instructions");
  });

  it("should block credentials in form fields — password and API token masked", () => {
    // Text extrahieren
    const rawText = extractTextFromDom(domWithCredentials);
    expect(rawText).toContain("SuperSecret123!");
    expect(rawText).toContain("sk-proj-abc123def456ghi789jkl0");

    // CredentialGuard auf Formular-Daten anwenden
    const formData: Record<string, unknown> = {};
    for (const child of domWithCredentials.children) {
      const name = child.attributes["name"];
      const value = child.attributes["value"];
      if (name && value) {
        formData[name] = value;
      }
    }

    const guardResult = sec.credentialGuard.guard(formData);

    // Password-Feld geblockt
    expect(guardResult.data["password"]).toBe("[CREDENTIAL_BLOCKED]");

    // API-Token geblockt
    expect(guardResult.data["api_token"]).toBe("[CREDENTIAL_BLOCKED]");

    // Username/Email durchgelassen (ist PII, wird separat behandelt)
    expect(guardResult.data["username"]).toBe("admin@company.com");

    // hasBlockedContent korrekt
    expect(guardResult.hasBlockedContent).toBe(true);
    expect(guardResult.blockedFields.length).toBeGreaterThanOrEqual(2);

    // blockForLLM: Prompt + Context enthalten KEINE Credentials
    // CredentialGuard erkennt Passwords im Key-Value-Format (password=... / password: ...)
    const blockResult = sec.credentialGuard.blockForLLM(
      `Fill the login form with username admin@company.com, password=SuperSecret123! and token sk-proj-abc123def456ghi789jkl0`,
      { api_token: "sk-proj-abc123def456ghi789jkl0", safe_field: "hello" },
    );

    expect(blockResult.prompt).not.toContain("SuperSecret123!");
    expect(blockResult.prompt).not.toContain("sk-proj-abc123def456ghi789jkl0");
    expect(blockResult.prompt).toContain("[CREDENTIAL_BLOCKED]");
    expect(blockResult.context["api_token"]).toBe("[CREDENTIAL_BLOCKED]");
    expect(blockResult.context["safe_field"]).toBe("hello");
    expect(blockResult.isClean).toBe(false);
    expect(containsCredentials(blockResult.prompt)).toBe(false);
  });
});

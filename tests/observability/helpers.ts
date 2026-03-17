/**
 * Integration Test Helpers — Observability + Security
 */

import { Writable } from "node:stream";
import pino from "pino";

import { Tracer, InMemoryExporter } from "../../src/observability/tracer.js";
import { BalageLogger } from "../../src/observability/logger.js";
import { EvidenceTrail } from "../../src/observability/evidence-trail.js";
import { MetricsCollector } from "../../src/observability/metrics-collector.js";
import { ReplayRecorder } from "../../src/observability/replay-recorder.js";
import { ReplayPlayer } from "../../src/observability/replay-player.js";
import { PiiFilter } from "../../src/observability/pii-filter.js";

import { InputSanitizer } from "../../src/security/input-sanitizer.js";
import { InjectionDetector } from "../../src/security/injection-detector.js";
import { CredentialGuard } from "../../src/security/credential-guard.js";
import { RateLimiter } from "../../src/security/rate-limiter.js";
import { CspAnalyzer } from "../../src/security/csp-analyzer.js";
import { ActionValidator } from "../../src/security/action-validator.js";

import type { DomNode } from "../../shared_interfaces.js";

// ============================================================================
// Observability Stack
// ============================================================================

export interface ObservabilityStack {
  tracer: Tracer;
  exporter: InMemoryExporter;
  logger: BalageLogger;
  evidenceTrail: EvidenceTrail;
  metrics: MetricsCollector;
  replayRecorder: ReplayRecorder;
  replayPlayer: ReplayPlayer;
  piiFilter: PiiFilter;
  logCapture: LogCapture;
}

export function createObservabilityStack(): ObservabilityStack {
  const exporter = new InMemoryExporter();
  const tracer = new Tracer({ serviceName: "balage-integration-test", exporter, samplingRate: 1.0 });
  const piiFilter = new PiiFilter();
  const logCapture = createLogCapture();

  const pinoInstance = pino({ name: "integration-test", level: "debug" }, logCapture.stream);
  const logger = new BalageLogger(pinoInstance, piiFilter, true);

  const evidenceTrail = new EvidenceTrail({ piiFilter: true });
  const metrics = new MetricsCollector();
  const replayRecorder = new ReplayRecorder({ piiFilter: true });
  const replayPlayer = new ReplayPlayer();

  return { tracer, exporter, logger, evidenceTrail, metrics, replayRecorder, replayPlayer, piiFilter, logCapture };
}

// ============================================================================
// Security Stack
// ============================================================================

export interface SecurityStack {
  sanitizer: InputSanitizer;
  injectionDetector: InjectionDetector;
  credentialGuard: CredentialGuard;
  rateLimiter: RateLimiter;
  cspAnalyzer: CspAnalyzer;
  actionValidator: ActionValidator;
}

export function createSecurityStack(): SecurityStack {
  return {
    sanitizer: new InputSanitizer(),
    injectionDetector: new InjectionDetector({ sensitivity: "high" }),
    credentialGuard: new CredentialGuard(),
    rateLimiter: new RateLimiter(),
    cspAnalyzer: new CspAnalyzer(),
    actionValidator: new ActionValidator(),
  };
}

// ============================================================================
// DOM Text Extraction
// ============================================================================

export function extractTextFromDom(node: DomNode): string {
  const parts: string[] = [];

  if (node.textContent) {
    parts.push(node.textContent);
  }

  // Attribute-Werte (z.B. value, placeholder) einbeziehen
  for (const [key, value] of Object.entries(node.attributes)) {
    if (key === "value" || key === "placeholder") {
      parts.push(value);
    }
  }

  for (const child of node.children) {
    parts.push(extractTextFromDom(child));
  }

  return parts.filter(Boolean).join(" ");
}

// ============================================================================
// PII / Credential Detection (fuer Assertions)
// ============================================================================

const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,  // Email
  /\+\d{1,3}\s?\d{2,4}\s?\d{3,}/,                      // Phone (international)
  /\b[A-Z]{2}\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}/,   // IBAN
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,        // Credit Card
];

export function containsPii(text: string): boolean {
  return PII_PATTERNS.some((p) => p.test(text));
}

const CREDENTIAL_PATTERNS = [
  /SuperSecret123!/,
  /sk-proj-[a-zA-Z0-9]+/,
  /password.*[:=]\s*\S+/i,
];

export function containsCredentials(text: string): boolean {
  return CREDENTIAL_PATTERNS.some((p) => p.test(text));
}

// ============================================================================
// Log Capture
// ============================================================================

export interface LogCapture {
  stream: Writable;
  getLines: () => string[];
  getRawOutput: () => string;
}

export function createLogCapture(): LogCapture {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding: string, callback: () => void) {
      chunks.push(chunk.toString());
      callback();
    },
  });

  return {
    stream,
    getLines: () => chunks.flatMap((c) => c.split("\n").filter(Boolean)),
    getRawOutput: () => chunks.join(""),
  };
}

/**
 * Security Hardening — Credential Guard
 * Erkennt Credentials und PII, blockiert deren Weiterleitung.
 */

import pino from "pino";
import type {
  CredentialGuardConfig,
  CredentialScanResult,
  CredentialType,
  GuardedData,
  BlockResult,
} from "./types.js";

const logger = pino({ name: "security:credential-guard" });

const DEFAULT_CONFIG: CredentialGuardConfig = {
  detectPasswords: true,
  detectCreditCards: true,
  detectApiKeys: true,
  detectTokens: true,
  detectPrivateKeys: true,
  detectConnectionStrings: true,
  luhnValidation: true,
  customKeyPatterns: [],
};

// Key-Namen die auf Credentials hindeuten
const CREDENTIAL_KEYS = new Set([
  "password",
  "passwort",
  "pwd",
  "passphrase",
  "secret",
  "token",
  "apikey",
  "api_key",
  "api-key",
  "authorization",
  "credential",
  "private_key",
  "privatekey",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "client_secret",
  "clientsecret",
  "connection_string",
  "connectionstring",
]);

// Credential-Patterns — ReDoS-sicher
const PATTERNS: Array<{
  type: CredentialType;
  pattern: RegExp;
  confidence: number;
  enabled: (c: CredentialGuardConfig) => boolean;
}> = [
  {
    type: "password",
    pattern:
      /(?:password|passwort|pwd|passphrase)\s*[:=]\s*["']?[^\s"']{3,}["']?/gi,
    confidence: 0.8,
    enabled: (c) => c.detectPasswords,
  },
  {
    type: "credit_card",
    pattern:
      /\b(?:4[0-9]{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}|5[1-5][0-9]{2}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}|3[47][0-9]{2}[\s-]?[0-9]{6}[\s-]?[0-9]{5})\b/g,
    confidence: 0.9,
    enabled: (c) => c.detectCreditCards,
  },
  {
    type: "api_key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{10,}/g,
    confidence: 0.95,
    enabled: (c) => c.detectApiKeys,
  },
  {
    type: "aws_key",
    pattern: /\bAKIA[A-Z0-9]{16}\b/g,
    confidence: 0.95,
    enabled: (c) => c.detectApiKeys,
  },
  {
    type: "github_token",
    pattern: /\bghp_[A-Za-z0-9]{36}\b/g,
    confidence: 0.95,
    enabled: (c) => c.detectApiKeys,
  },
  {
    type: "slack_token",
    pattern: /\bxox[bpras]-[A-Za-z0-9-]{10,}/g,
    confidence: 0.95,
    enabled: (c) => c.detectApiKeys,
  },
  {
    type: "bearer_token",
    pattern: /Bearer\s+eyJ[A-Za-z0-9_-]{10,}/g,
    confidence: 0.9,
    enabled: (c) => c.detectTokens,
  },
  {
    type: "jwt",
    pattern:
      /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
    confidence: 0.85,
    enabled: (c) => c.detectTokens,
  },
  {
    type: "private_key",
    pattern: /-----BEGIN\s+(?:RSA\s+)?(?:PRIVATE|EC)\s+KEY-----/g,
    confidence: 0.99,
    enabled: (c) => c.detectPrivateKeys,
  },
  {
    type: "connection_string",
    pattern: /(?:postgres|mysql|mongodb|redis|amqp):\/\/[^\s"']{10,}/gi,
    confidence: 0.9,
    enabled: (c) => c.detectConnectionStrings,
  },
  {
    type: "ssn",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    confidence: 0.7,
    enabled: () => true,
  },
];

function luhnCheck(num: string): boolean {
  const digits = num.replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;

  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i]!, 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function redact(value: string): string {
  if (value.length <= 6) return "[REDACTED]";
  const prefix = value.slice(0, 3);
  const suffix = value.slice(-3);
  return `${prefix}...${suffix}`;
}

export class CredentialGuard {
  private readonly config: CredentialGuardConfig;

  constructor(config: Partial<CredentialGuardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  scan(input: string): CredentialScanResult {
    const findings: CredentialScanResult["findings"] = [];

    for (const def of PATTERNS) {
      if (!def.enabled(this.config)) continue;

      def.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = def.pattern.exec(input)) !== null) {
        const value = match[0];

        // Luhn-Validierung fuer Kreditkarten
        if (def.type === "credit_card" && this.config.luhnValidation) {
          if (!luhnCheck(value)) continue;
        }

        findings.push({
          type: def.type,
          position: match.index,
          length: value.length,
          redacted: redact(value),
          confidence: def.confidence,
        });
      }
    }

    const hasCredentials = findings.length > 0;
    const highRisk = findings.some((f) => f.confidence >= 0.9);

    if (hasCredentials) {
      // Credentials NIEMALS in Logs!
      logger.warn(
        { findingCount: findings.length, types: findings.map((f) => f.type) },
        "Credentials detected",
      );
    }

    return {
      hasCredentials,
      findings,
      recommendation: highRisk
        ? "high_risk"
        : hasCredentials
          ? "contains_credentials"
          : "safe",
    };
  }

  guard(data: Record<string, unknown>): GuardedData {
    const result: GuardedData = {
      data: {},
      blockedFields: [],
      hasBlockedContent: false,
    };

    for (const [key, value] of Object.entries(data)) {
      if (this.isCredentialKey(key)) {
        result.blockedFields.push({
          path: key,
          type: this.guessTypeFromKey(key),
          reason: `Key "${key}" indicates credential`,
        });
        result.data[key] = "[CREDENTIAL_BLOCKED]";
        result.hasBlockedContent = true;
      } else if (typeof value === "string") {
        const scanResult = this.scan(value);
        if (scanResult.hasCredentials) {
          result.blockedFields.push({
            path: key,
            type: scanResult.findings[0]!.type,
            reason: `Value contains ${scanResult.findings[0]!.type}`,
          });
          result.data[key] = "[CREDENTIAL_BLOCKED]";
          result.hasBlockedContent = true;
        } else {
          result.data[key] = value;
        }
      } else {
        result.data[key] = value;
      }
    }

    return result;
  }

  isCredentialKey(key: string): boolean {
    const normalized = key.toLowerCase().replace(/[-_.]/g, "");
    for (const credKey of CREDENTIAL_KEYS) {
      if (normalized.includes(credKey.replace(/[-_]/g, ""))) {
        return true;
      }
    }
    for (const custom of this.config.customKeyPatterns) {
      if (normalized.includes(custom.toLowerCase().replace(/[-_]/g, ""))) {
        return true;
      }
    }
    return false;
  }

  blockForLLM(
    prompt: string,
    context: Record<string, unknown>,
  ): BlockResult {
    const blocked: BlockResult["blocked"] = [];

    // Prompt scannen und Credentials maskieren (rueckwaerts, damit Positionen stimmen)
    const promptScan = this.scan(prompt);
    let cleanPrompt = prompt;
    if (promptScan.hasCredentials) {
      const sortedFindings = [...promptScan.findings].sort(
        (a, b) => b.position - a.position,
      );
      for (const finding of sortedFindings) {
        cleanPrompt =
          cleanPrompt.slice(0, finding.position) +
          "[CREDENTIAL_BLOCKED]" +
          cleanPrompt.slice(finding.position + finding.length);
        blocked.push({ location: "prompt", type: finding.type });
      }
    }

    // Context scannen
    const guardedContext = this.guard(context);
    for (const field of guardedContext.blockedFields) {
      blocked.push({
        location: "context",
        type: field.type,
        path: field.path,
      });
    }

    return {
      prompt: cleanPrompt,
      context: guardedContext.data,
      blocked,
      isClean: blocked.length === 0,
    };
  }

  private guessTypeFromKey(key: string): CredentialType {
    const lower = key.toLowerCase();
    if (
      lower.includes("password") ||
      lower.includes("pwd") ||
      lower.includes("passphrase")
    )
      return "password";
    if (lower.includes("token")) return "bearer_token";
    if (lower.includes("api") && lower.includes("key")) return "api_key";
    if (lower.includes("secret")) return "api_key";
    if (lower.includes("private")) return "private_key";
    if (lower.includes("connection")) return "connection_string";
    return "password";
  }
}

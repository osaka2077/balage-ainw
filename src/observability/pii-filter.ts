import type { PiiFilterConfig, PiiDetection } from "./types.js";

interface PiiPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

const DEFAULT_CONFIG: PiiFilterConfig = {
  filterEmails: true,
  filterPhones: true,
  filterCreditCards: true,
  filterPasswords: true,
  filterApiKeys: true,
  filterIPs: true,
  filterIBANs: true,
  customPatterns: [],
};

// Sensitive key patterns (case-insensitive match)
const SENSITIVE_KEYS = /^(password|passwort|pwd|secret|token|credential|apikey|api_key|authorization)$/i;

export class PiiFilter {
  private readonly config: PiiFilterConfig;
  private readonly patterns: PiiPattern[];

  constructor(config?: Partial<PiiFilterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config, customPatterns: config?.customPatterns ?? [] };
    this.patterns = this.buildPatterns();
  }

  private buildPatterns(): PiiPattern[] {
    const patterns: PiiPattern[] = [];

    if (this.config.filterEmails) {
      patterns.push({ name: "email", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: "[EMAIL_REDACTED]" });
    }
    if (this.config.filterCreditCards) {
      // Credit cards before phones to avoid phone regex eating card numbers
      patterns.push({ name: "credit_card", pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}\b/g, replacement: "[CC_REDACTED]" });
    }
    if (this.config.filterPhones) {
      // Matches international formats: +49 123 456789, (555) 123-4567, +1-800-555-1234
      // Requires + prefix or parentheses to avoid matching bare digit sequences
      patterns.push({ name: "phone", pattern: /(?:\+\d{1,3}[\s.-])?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,6}/g, replacement: "[PHONE_REDACTED]" });
    }
    if (this.config.filterApiKeys) {
      // Matches common API key patterns: sk-..., pk-..., api_..., key-...
      patterns.push({ name: "api_key", pattern: /\b(?:sk|pk|api|key|token|bearer)[-_][a-zA-Z0-9]{20,}\b/gi, replacement: "[APIKEY_REDACTED]" });
    }
    if (this.config.filterIPs) {
      // IPv4
      patterns.push({ name: "ip", pattern: /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, replacement: "[IP_REDACTED]" });
      // IPv6 (simplified — matches common formats)
      patterns.push({ name: "ip", pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, replacement: "[IP_REDACTED]" });
    }
    if (this.config.filterIBANs) {
      patterns.push({ name: "iban", pattern: /\b[A-Z]{2}\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{0,2}\b/g, replacement: "[IBAN_REDACTED]" });
    }
    if (this.config.filterPasswords) {
      // Password patterns in strings like "password=secret123" or "pwd: mypass"
      patterns.push({ name: "password", pattern: /(?:password|passwort|pwd|secret|token)[\s]*[=:]\s*\S+/gi, replacement: "[PASSWORD_REDACTED]" });
    }

    // URL query parameter sanitizing
    patterns.push({ name: "url_credential", pattern: /([?&](?:token|key|password|secret|api_key|apikey|auth|access_token|refresh_token)=)[^&\s]+/gi, replacement: "$1[REDACTED]" });

    // Custom patterns
    for (const custom of this.config.customPatterns) {
      patterns.push({ name: custom.name, pattern: custom.pattern, replacement: custom.replacement });
    }

    return patterns;
  }

  filterString(input: string): string {
    let result = input;
    for (const p of this.patterns) {
      // Reset lastIndex for global regexes
      const regex = new RegExp(p.pattern.source, p.pattern.flags);
      result = result.replace(regex, p.replacement);
    }
    return result;
  }

  filterObject<T extends Record<string, unknown>>(input: T): T {
    return this.filterValue(input) as T;
  }

  private filterValue(value: unknown): unknown {
    if (typeof value === "string") {
      return this.filterString(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.filterValue(item));
    }
    if (value !== null && typeof value === "object" && !(value instanceof Date)) {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.test(key)) {
          result[key] = "[REDACTED]";
        } else {
          result[key] = this.filterValue(val);
        }
      }
      return result;
    }
    return value;
  }

  detect(input: string): PiiDetection[] {
    const detections: PiiDetection[] = [];
    for (const p of this.patterns) {
      const regex = new RegExp(p.pattern.source, p.pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(input)) !== null) {
        detections.push({
          type: p.name,
          start: match.index,
          length: match[0].length,
          original: match[0],
        });
      }
    }
    return detections.sort((a, b) => a.start - b.start);
  }

  addPattern(name: string, pattern: RegExp, replacement: string): void {
    this.patterns.push({ name, pattern, replacement });
  }
}
